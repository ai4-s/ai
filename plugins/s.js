// ERFAN-MD
import { fileURLToPath } from 'url';
import path from 'path';
import { cmd } from '../command.js';
import axios from 'axios';
import yts from 'yt-search';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const API_BASE = 'https://rimi-xi.vercel.app/api';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Different header sets are tried in turn, because some download hosts reject a fake Referer
const HEADER_SETS = [
  { 'User-Agent': UA, 'Accept': '*/*' },
  { 'User-Agent': UA, 'Referer': 'https://www.youtube.com/', 'Accept': '*/*' },
  {}
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ───────────────────────── helpers ─────────────────────────

// Tag errors with the stage that failed so the reply says exactly where it broke
function stageError(stage, err) {
  const status = err?.response?.status;
  const e = new Error(`${stage} failed${status ? ` (HTTP ${status})` : `: ${err?.message || 'unknown'}`}`);
  e.stage = stage;
  return e;
}

// ───────────────────────── fast search ─────────────────────────

// Small in-memory cache so repeated queries are instant
const SEARCH_CACHE = new Map();
const CACHE_TTL = 10 * 60 * 1000;
const CACHE_MAX = 100;

function cacheGet(key) {
  const hit = SEARCH_CACHE.get(key);
  if (!hit) return null;
  if (Date.now() - hit.t > CACHE_TTL) {
    SEARCH_CACHE.delete(key);
    return null;
  }
  return hit.v;
}

function cacheSet(key, value) {
  if (SEARCH_CACHE.size >= CACHE_MAX) SEARCH_CACHE.delete(SEARCH_CACHE.keys().next().value);
  SEARCH_CACHE.set(key, { v: value, t: Date.now() });
}

// Pull a video ID out of a pasted YouTube link (skips searching entirely)
function extractVideoId(text) {
  const m = text.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|music\.youtube\.com\/watch\?(?:.*&)?v=)([\w-]{11})/i);
  return m ? m[1] : null;
}

function decodeJsonText(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(`"${raw}"`);
  } catch {
    return raw;
  }
}

// Read the first video result straight from the YouTube results page (much lighter than yt-search)
function parseFirstVideo(html) {
  const m = html.match(/"videoRenderer":\{"videoId":"([\w-]{11})"/);
  if (!m) return null;

  const slice = html.slice(m.index, m.index + 8000);
  const pick = (re) => slice.match(re)?.[1];

  const title = decodeJsonText(pick(/"title":\{"runs":\[\{"text":"((?:[^"\\]|\\.)*)"/));
  const author = decodeJsonText(pick(/"ownerText":\{"runs":\[\{"text":"((?:[^"\\]|\\.)*)"/));
  const timestamp = pick(/"lengthText":.*?"simpleText":"([^"]+)"/);
  const views = pick(/"viewCountText":\{"simpleText":"([^"]+)"/);

  return {
    videoId: m[1],
    title,
    author,
    timestamp,
    views: views ? views.replace(/\s*views?$/i, '') : null,
    thumbnail: `https://i.ytimg.com/vi/${m[1]}/hqdefault.jpg`
  };
}

async function fastSearch(query) {
  // sp=EgIQAQ%3D%3D filters results to videos only
  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&sp=EgIQAQ%3D%3D`;
  const res = await axios.get(url, {
    timeout: 8000,
    responseType: 'text',
    headers: {
      'User-Agent': UA,
      'Accept-Language': 'en-US,en;q=0.9',
      'Cookie': 'CONSENT=YES+1; SOCS=CAI'
    }
  });
  return parseFirstVideo(res.data);
}

// Search with cache -> pasted link -> fast scrape -> yt-search fallback
async function searchVideo(q) {
  const key = q.trim().toLowerCase();
  const cached = cacheGet(key);
  if (cached) return cached;

  // A pasted link needs no search at all
  const idFromLink = extractVideoId(q);
  if (idFromLink) {
    const v = {
      videoId: idFromLink,
      title: null,
      author: null,
      timestamp: null,
      views: null,
      thumbnail: `https://i.ytimg.com/vi/${idFromLink}/hqdefault.jpg`
    };
    cacheSet(key, v);
    return v;
  }

  const t0 = Date.now();

  // yt-search wrapped with a hard timeout so it can never hang the command
  const ytsSearch = async () => {
    const search = await Promise.race([
      yts(q),
      new Promise((_, rej) => setTimeout(() => rej(new Error('yt-search timed out')), 12000))
    ]);
    const r = search.videos?.[0];
    if (!r) throw new Error('no result');
    console.log(`[SEARCH] yt-search answered in ${Date.now() - t0}ms`);
    return {
      videoId: r.videoId,
      title: r.title,
      author: r.author?.name || null,
      timestamp: r.timestamp || null,
      views: r.views ? r.views.toLocaleString('en-US') : null,
      thumbnail: r.thumbnail
    };
  };

  const scrapeSearch = async () => {
    const v = await fastSearch(q);
    if (!v) throw new Error('no result');
    console.log(`[SEARCH] fast scrape answered in ${Date.now() - t0}ms`);
    return v;
  };

  // Run both at the same time and use whichever finishes first,
  // so the slower one can never hold the command up
  let video = null;
  try {
    video = await Promise.any([scrapeSearch(), ytsSearch()]);
  } catch (err) {
    const errors = err?.errors || [err];
    errors.forEach((e) => console.error('[SEARCH] failed:', e?.message));
    if (!errors.every((e) => e?.message === 'no result')) {
      throw stageError('YouTube search', errors.find((e) => e?.message !== 'no result') || err);
    }
  }

  if (video) cacheSet(key, video);
  return video;
}

// ───────────────────────── API + download ─────────────────────────

// Call the rimi-xi API (ytmp3 / ytmp4) with retries
async function callApi(endpoint, videoId) {
  // Same short-link format as the working API examples
  const ytUrl = `https://youtu.be/${videoId}`;
  const apiUrl = `${API_BASE}/${endpoint}?url=${encodeURIComponent(ytUrl)}`;
  console.log(`[${endpoint}] API:`, apiUrl);

  let lastErr;
  for (let i = 1; i <= 3; i++) {
    try {
      const tA = Date.now();
      const res = await axios.get(apiUrl, { timeout: 45000 });
      console.log(`[${endpoint}] API responded in ${Date.now() - tA}ms`);
      const data = res.data;
      if (data && data.ok && data.download) return data;
      lastErr = new Error('API returned no download link');
    } catch (err) {
      console.error(`[${endpoint}] API attempt ${i} failed:`, err?.response?.status || err?.message);
      lastErr = err;
    }
    if (i < 3) await sleep(2000);
  }
  throw stageError('API request', lastErr);
}

// Download the file to a buffer with retries and header fallbacks
async function downloadBuffer(url, { timeout, maxBytes, minBytes }) {
  let lastErr;
  for (let i = 0; i < 3; i++) {
    try {
      const tD = Date.now();
      const res = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout,
        maxContentLength: maxBytes,
        maxBodyLength: maxBytes,
        headers: HEADER_SETS[i % HEADER_SETS.length]
      });
      const buf = Buffer.from(res.data);
      console.log(`[DOWNLOAD] ${(buf.length / 1048576).toFixed(1)}MB in ${Date.now() - tD}ms`);
      if (buf.length >= minBytes) return buf;
      lastErr = new Error('file too small / empty');
    } catch (err) {
      console.error(`[DOWNLOAD] attempt ${i + 1} failed:`, err?.response?.status || err?.message);
      lastErr = err;
    }
    if (i < 2) await sleep(2000);
  }
  throw stageError('File download', lastErr);
}

// ───────────────────────── .play ─────────────────────────

cmd({
  pattern: "play",
  desc: "Search YouTube and download MP3 via ERFAN API.",
  category: "downloader",
  filename: __filename
}, async (conn, m, store, { from, quoted, q, reply }) => {
  try {
    if (!q) return reply("❌ Please provide a song name.\nExample: .play Eshq Tanha");

    await conn.sendMessage(from, { react: { text: "⏳", key: m.key } });

    // 1) Search YouTube (fast path)
    const video = await searchVideo(q);

    if (!video) {
      await conn.sendMessage(from, { react: { text: "❌", key: m.key } });
      return reply("⚠️ No results found for the given song name.");
    }

    console.log("[PLAY] Found:", video.title, "|", video.videoId);

    // 2) Call ytmp3 API
    const data = await callApi('ytmp3', video.videoId);

    const title = data.title || video.title || 'song';
    const thumbnail = data.thumbnail || video.thumbnail;
    const quality = data.quality || '128K';
    const durationStr = video.timestamp || 'N/A';

    // 3) Start the download right away, so it runs while the caption is being sent
    const audioPromise = downloadBuffer(data.download, {
      timeout: 90000,
      maxBytes: 100 * 1024 * 1024,
      minBytes: 1000
    });
    audioPromise.catch(() => {}); // avoid unhandled rejection; real error is thrown at await below

    // 4) Build + send caption
    const caption = `╭─────────────🎵
│ 🎧 *SONG DOWNLOADER*
│─────────────────────
│ 🎵 *Title:* ${title}
│ ⏱️ *Duration:* ${durationStr}
│ 🎼 *Quality:* ${quality}
╰─────────────🎵
🔗 *Powered By ERFAN-MD*`;

    try {
      await conn.sendMessage(from, { image: { url: thumbnail }, caption }, { quoted: m });
    } catch (err) {
      console.error("[PLAY] Thumbnail send failed:", err?.message);
      await reply(caption);
    }

    // 5) Wait for the MP3
    const audioBuffer = await audioPromise;

    const safeTitle = title.replace(/[\\/:*?"<>|]/g, '_');

    // 6) Send audio
    await conn.sendMessage(from, {
      audio: audioBuffer,
      mimetype: 'audio/mpeg',
      fileName: `${safeTitle}.mp3`,
      ptt: false
    }, { quoted: m });

    await conn.sendMessage(from, { react: { text: "✅", key: m.key } });

  } catch (error) {
    console.error("Play Error:", error?.message || error);
    await conn.sendMessage(from, { react: { text: "❌", key: m.key } });
    reply(`❌ An error occurred: ${error?.message || 'unknown'}`);
  }
});




// ───────────────────────── .video ─────────────────────────

cmd({
  pattern: "video",
  desc: "Search YouTube and download MP4 via ERFAN API.",
  category: "downloader",
  filename: __filename
}, async (conn, m, store, { from, quoted, q, reply }) => {
  try {
    if (!q) return reply("❌ Please provide a video name.\nExample: .video Yan Block 444");

    await conn.sendMessage(from, { react: { text: "⏳", key: m.key } });

    // 1) Search YouTube (fast path)
    const video = await searchVideo(q);

    if (!video) {
      await conn.sendMessage(from, { react: { text: "❌", key: m.key } });
      return reply("⚠️ No results found for the given video name.");
    }

    console.log("[VIDEO] Found:", video.title, "|", video.videoId);

    // 2) Call ytmp4 API
    const data = await callApi('ytmp4', video.videoId);

    const title = data.title || video.title || 'video';
    const thumbnail = data.thumbnail || video.thumbnail;
    const quality = data.quality || 'HD';
    const author = video.author || data.author || 'Unknown';
    const durationStr = video.timestamp || 'N/A';
    const views = video.views || 'N/A';

    // 3) Start the download right away, so it runs while the caption is being sent
    const videoPromise = downloadBuffer(data.download, {
      timeout: 180000,
      maxBytes: 500 * 1024 * 1024,
      minBytes: 10000
    });
    videoPromise.catch(() => {}); // avoid unhandled rejection; real error is thrown at await below

    // 4) Build + send caption
    const caption = `╭─────────────🎬
│ 🎥 *VIDEO DOWNLOADER*
│─────────────────────
│ 🎬 *Title:* ${title}
│ 👤 *Author:* ${author}
│ ⏱️ *Duration:* ${durationStr}
│ 👀 *Views:* ${views}
│ 🎞️ *Quality:* ${quality}
╰─────────────🎬
🔗 *Powered By ERFAN-MD*`;

    try {
      await conn.sendMessage(from, { image: { url: thumbnail }, caption }, { quoted: m });
    } catch (err) {
      console.error("[VIDEO] Thumbnail send failed:", err?.message);
      await reply(caption);
    }

    // 5) Wait for the MP4
    const videoBuffer = await videoPromise;

    const safeTitle = title.replace(/[\\/:*?"<>|]/g, '_');

    // 6) Send video
    await conn.sendMessage(from, {
      video: videoBuffer,
      mimetype: 'video/mp4',
      fileName: `${safeTitle}.mp4`,
      caption: `🎬 *${title}*\n🎞️ ${quality}\n🔗 *Powered By ERFAN-MD*`
    }, { quoted: m });

    await conn.sendMessage(from, { react: { text: "✅", key: m.key } });

  } catch (error) {
    console.error("Video Error:", error?.message || error);
    await conn.sendMessage(from, { react: { text: "❌", key: m.key } });
    reply(`❌ An error occurred: ${error?.message || 'unknown'}`);
  }
});
