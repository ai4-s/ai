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

// Tag errors with the stage that failed so the reply says exactly where it broke
function stageError(stage, err) {
  const status = err?.response?.status;
  const e = new Error(`${stage} failed${status ? ` (HTTP ${status})` : `: ${err?.message || 'unknown'}`}`);
  e.stage = stage;
  return e;
}

// Call the rimi-xi API (ytmp3 / ytmp4) with retries
async function callApi(endpoint, videoId) {
  // Same short-link format as the working API examples
  const ytUrl = `https://youtu.be/${videoId}`;
  const apiUrl = `${API_BASE}/${endpoint}?url=${encodeURIComponent(ytUrl)}`;
  console.log(`[${endpoint}] API:`, apiUrl);

  let lastErr;
  for (let i = 1; i <= 3; i++) {
    try {
      const res = await axios.get(apiUrl, { timeout: 45000 });
      const data = res.data;
      if (data && data.ok && data.download) return data;
      lastErr = new Error('API returned no download link');
    } catch (err) {
      console.error(`[${endpoint}] API attempt ${i} failed:`, err?.response?.status || err?.message);
      lastErr = err;
    }
    if (i < 3) await sleep(2500);
  }
  throw stageError('API request', lastErr);
}

// Download the file to a buffer with retries and header fallbacks
async function downloadBuffer(url, { timeout, maxBytes, minBytes }) {
  let lastErr;
  for (let i = 0; i < 3; i++) {
    try {
      const res = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout,
        maxContentLength: maxBytes,
        maxBodyLength: maxBytes,
        headers: HEADER_SETS[i % HEADER_SETS.length]
      });
      const buf = Buffer.from(res.data);
      if (buf.length >= minBytes) return buf;
      lastErr = new Error('file too small / empty');
    } catch (err) {
      console.error(`[DOWNLOAD] attempt ${i + 1} failed:`, err?.response?.status || err?.message);
      lastErr = err;
    }
    if (i < 2) await sleep(2500);
  }
  throw stageError('File download', lastErr);
}

cmd({
  pattern: "play",
  desc: "Search YouTube and download MP3 via ERFAN API.",
  category: "downloader",
  filename: __filename
}, async (conn, m, store, { from, quoted, q, reply }) => {
  try {
    if (!q) return reply("❌ Please provide a song name.\nExample: .play Eshq Tanha");

    await conn.sendMessage(from, { react: { text: "⏳", key: m.key } });

    // 1) Search YouTube
    let video;
    try {
      const search = await yts(q);
      video = search.videos?.[0];
    } catch (err) {
      throw stageError('YouTube search', err);
    }

    if (!video) {
      await conn.sendMessage(from, { react: { text: "❌", key: m.key } });
      return reply("⚠️ No results found for the given song name.");
    }

    console.log("[PLAY] Found video:", video.title, "|", video.videoId);

    // 2) Call ytmp3 API
    const data = await callApi('ytmp3', video.videoId);

    const title = data.title || video.title || 'song';
    const thumbnail = data.thumbnail || video.thumbnail;
    const quality = data.quality || '128K';
    const durationStr = video.timestamp || 'N/A';

    // 3) Build caption
    const caption = `╭─────────────🎵
│ 🎧 *SONG DOWNLOADER*
│─────────────────────
│ 🎵 *Title:* ${title}
│ ⏱️ *Duration:* ${durationStr}
│ 🎼 *Quality:* ${quality}
╰─────────────🎵
🔗 *Powered By ERFAN-MD*`;

    // 4) Send thumbnail + caption (a bad thumbnail must not kill the command)
    try {
      await conn.sendMessage(from, { image: { url: thumbnail }, caption }, { quoted: m });
    } catch (err) {
      console.error("[PLAY] Thumbnail send failed:", err?.message);
      await reply(caption);
    }

    // 5) Download MP3 to buffer
    const audioBuffer = await downloadBuffer(data.download, {
      timeout: 90000,
      maxBytes: 100 * 1024 * 1024,
      minBytes: 1000
    });

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




cmd({
  pattern: "video",
  desc: "Search YouTube and download MP4 via ERFAN API.",
  category: "downloader",
  filename: __filename
}, async (conn, m, store, { from, quoted, q, reply }) => {
  try {
    if (!q) return reply("❌ Please provide a video name.\nExample: .video Yan Block 444");

    await conn.sendMessage(from, { react: { text: "⏳", key: m.key } });

    // 1) Search YouTube
    let video;
    try {
      const search = await yts(q);
      video = search.videos?.[0];
    } catch (err) {
      throw stageError('YouTube search', err);
    }

    if (!video) {
      await conn.sendMessage(from, { react: { text: "❌", key: m.key } });
      return reply("⚠️ No results found for the given video name.");
    }

    console.log("[VIDEO] Found video:", video.title, "|", video.videoId);

    // 2) Call ytmp4 API
    const data = await callApi('ytmp4', video.videoId);

    const title = data.title || video.title || 'video';
    const thumbnail = data.thumbnail || video.thumbnail;
    const quality = data.quality || 'HD';
    const author = video.author?.name || data.author || 'Unknown';
    const durationStr = video.timestamp || 'N/A';
    const views = video.views ? video.views.toLocaleString('en-US') : 'N/A';

    // 3) Build caption
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

    // 4) Send thumbnail + caption
    try {
      await conn.sendMessage(from, { image: { url: thumbnail }, caption }, { quoted: m });
    } catch (err) {
      console.error("[VIDEO] Thumbnail send failed:", err?.message);
      await reply(caption);
    }

    // 5) Download MP4 to buffer
    const videoBuffer = await downloadBuffer(data.download, {
      timeout: 180000,
      maxBytes: 500 * 1024 * 1024,
      minBytes: 10000
    });

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
