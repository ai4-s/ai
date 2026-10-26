// ERFAN-MD
import { fileURLToPath } from 'url';
import path from 'path';
import { cmd } from '../command.js';
import axios from 'axios';
import yts from 'yt-search';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================
// HELPERS
// ============================================
const VIDEO_API = (url) => `https://rimi-xi.vercel.app/api/ytmp4?url=${encodeURIComponent(url)}`;

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function getVideoId(url) {
  if (!url || typeof url !== 'string') return null;
  const patterns = [
    /(?:youtube\.com\/watch\?.*v=)([a-zA-Z0-9_-]{11})/,
    /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/live\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m && m[1]) return m[1];
  }
  return null;
}

// ============================================
// FETCH with retry + BOTH url formats
// ============================================
async function fetchVideo(url) {
  const vid = getVideoId(url);
  if (!vid) throw new Error('Invalid YouTube URL');

  // Try both formats — API sometimes works on one, not the other
  const candidates = [
    `https://youtu.be/${vid}`,
    `https://www.youtube.com/watch?v=${vid}`
  ];

  let lastErr = null;

  for (const format of candidates) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        console.log(`[ERFAN] try=${attempt} url=${format}`);
        const res = await axios.get(VIDEO_API(format), {
          timeout: 45000,
          validateStatus: () => true,
          headers: { 'User-Agent': UA, 'Accept': 'application/json' }
        });

        console.log(`[ERFAN] HTTP ${res.status} — ok=${res.data?.ok}`);

        // ── SUCCESS ──
        if (res.status === 200 && res.data?.ok && res.data?.download) {
          return {
            downloadUrl: res.data.download,
            title: res.data.title || 'video',
            thumbnail: res.data.thumbnail,
            author: res.data.author,
            quality: res.data.quality
          };
        }

        // ── 502/503/504 = Vercel timeout, retry same format ──
        if ([502, 503, 504].includes(res.status)) {
          lastErr = new Error(`HTTP ${res.status} (Vercel timeout)`);
          console.log(`[ERFAN] ${res.status} — retrying in 2s...`);
          await new Promise(r => setTimeout(r, 2000));
          continue;
        }

        // ── 200 but ok=false → video broken, no retry ──
        if (res.status === 200 && !res.data?.ok) {
          lastErr = new Error(`API rejected this video (ok=false)`);
          break; // break inner loop, try other format
        }

        // ── other status → break to try other format ──
        lastErr = new Error(`HTTP ${res.status}`);
        break;

      } catch (e) {
        lastErr = e;
        console.log(`[ERFAN] fetch error: ${e.message}`);
        await new Promise(r => setTimeout(r, 1500));
      }
    }
  }

  throw lastErr || new Error('All API attempts failed');
}

// ============================================
// DOWNLOAD to buffer (your working pattern)
// ============================================
async function downloadBuffer(url, maxMB = 500) {
  const res = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 120000,
    maxContentLength: maxMB * 1024 * 1024,
    headers: {
      'User-Agent': UA,
      'Referer': 'https://www.youtube.com/',
      'Accept': '*/*'
    }
  });
  const buf = Buffer.from(res.data);
  if (!buf || buf.length < 10000) {
    throw new Error(`Downloaded file is empty (${buf.length} bytes)`);
  }
  return buf;
}

// ============================================
// COMMAND: video
// ============================================
cmd({
  pattern: "video",
  alias: ["ytv", "ytmp4", "vd"],
  desc: "Search YouTube and download MP4.",
  category: "downloader",
  filename: __filename
}, async (conn, m, store, { from, quoted, q, reply }) => {
  try {
    if (!q) return reply("❌ Please provide a video name.\nExample: .video Yan Block 444");

    await conn.sendMessage(from, { react: { text: "⏳", key: m.key } });

    // 1) Search
    const search = await yts(q);
    const video = search.videos?.[0];
    if (!video) {
      await conn.sendMessage(from, { react: { text: "❌", key: m.key } });
      return reply("⚠️ No results found for the given video name.");
    }

    console.log("[VIDEO] Found:", video.title, "|", video.url);

    // 2) Fetch from API
    const data = await fetchVideo(video.url);

    // 3) Caption
    const caption = `╭─────────────🎬
│ 🎥 *VIDEO DOWNLOADER*
│─────────────────────
│ 🎬 *Title:* ${data.title}
│ 👤 *Author:* ${data.author || video.author?.name || 'Unknown'}
│ 🎞️ *Quality:* ${data.quality || 'HD'}
╰─────────────🎬
🔗 *Powered By ERFAN-MD*`;

    // 4) Thumbnail
    await conn.sendMessage(from, {
      image: { url: data.thumbnail || video.thumbnail },
      caption
    }, { quoted: m });

    // 5) Download to buffer
    const buffer = await downloadBuffer(data.downloadUrl);
    const safeTitle = (data.title || 'video').replace(/[\\/:*?"<>|]/g, '_');

    // 6) Send video
    await conn.sendMessage(from, {
      video: buffer,
      mimetype: 'video/mp4',
      fileName: `${safeTitle}.mp4`,
      caption: `🎬 *${data.title}*\n🎞️ ${data.quality || 'HD'}\n🔗 *Powered By ERFAN-MD*`
    }, { quoted: m });

    await conn.sendMessage(from, { react: { text: "✅", key: m.key } });

  } catch (error) {
    console.error("Video Error:", error?.message || error);
    await conn.sendMessage(from, { react: { text: "❌", key: m.key } });
    reply(`❌ An error occurred: ${error?.message || 'unknown'}`);
  }
});

// ============================================
// COMMAND: drama
// ============================================
cmd({
  pattern: "drama",
  alias: ["film", "series"],
  desc: "Download YouTube drama as video or document.",
  category: "downloader",
  filename: __filename
}, async (conn, m, store, { from, quoted, q, reply }) => {
  try {
    if (!q) return reply("🎬 Please provide a drama name.\nExample: .drama Muskan 5");

    await conn.sendMessage(from, { react: { text: "⏳", key: m.key } });

    const search = await yts(q);
    const video = search.videos?.[0];
    if (!video) {
      await conn.sendMessage(from, { react: { text: "❌", key: m.key } });
      return reply("⚠️ No results found.");
    }

    const sent = await conn.sendMessage(from, {
      image: { url: video.thumbnail },
      caption: `*╭┈〔 DRAMA DOWNLOADER 〕┈⊷*
*├▢ 🎬 Title:* ${video.title}
*├▢ 📺 Channel:* ${video.author?.name || 'Unknown'}
*├▢ ⏰ Duration:* ${video.timestamp}
*╰───────────────────⊷*
*Reply with:*
*┋ 1* 📹 Video (MP4)
*┋ 2* 📄 Video as Document

> Powered by ERFAN-MD`
    }, { quoted: m });

    const msgId = sent.key.id;

    const listener = async (msgData) => {
      const received = msgData.messages[0];
      if (!received.message) return;

      const sel = (received.message.conversation || received.message.extendedTextMessage?.text)?.trim();
      const replyToBot = received.message.extendedTextMessage?.contextInfo?.stanzaId === msgId;
      if (!replyToBot) return;

      conn.ev.off("messages.upsert", listener);
      await conn.sendMessage(from, { react: { text: "⬇️", key: received.key } });

      if (sel !== "1" && sel !== "2") {
        return conn.sendMessage(from, { text: "❌ Invalid. Reply 1 or 2." }, { quoted: received });
      }

      try {
        const data = await fetchVideo(video.url);
        const buffer = await downloadBuffer(data.downloadUrl);
        const safe = (data.title || 'drama').replace(/[\\/:*?"<>|]/g, '_');

        if (sel === "2") {
          await conn.sendMessage(from, {
            document: buffer,
            mimetype: 'video/mp4',
            fileName: `${safe}.mp4`,
            caption: `📄 *${data.title}*\n📹 Video Document\n\n> Powered by ERFAN-MD`
          }, { quoted: received });
        } else {
          await conn.sendMessage(from, {
            video: buffer,
            mimetype: 'video/mp4',
            fileName: `${safe}.mp4`,
            caption: `🎬 *${data.title}*\n\n> Powered by ERFAN-MD`
          }, { quoted: received });
        }

        await conn.sendMessage(from, { react: { text: "✅", key: received.key } });
      } catch (e) {
        console.error("Drama Err:", e.message);
        await conn.sendMessage(from, { text: `❌ ${e.message}` }, { quoted: received });
      }
    };

    conn.ev.on("messages.upsert", listener);
    setTimeout(() => conn.ev.off("messages.upsert", listener), 30000);

  } catch (error) {
    console.error("Drama Error:", error?.message || error);
    await conn.sendMessage(from, { react: { text: "❌", key: m.key } });
    reply(`❌ An error occurred: ${error?.message || 'unknown'}`);
  }
});

// ============================================
// COMMAND: cartoon
// ============================================
cmd({
  pattern: "cartoon",
  alias: ["toon", "kids"],
  desc: "Download YouTube cartoon video.",
  category: "downloader",
  filename: __filename
}, async (conn, m, store, { from, quoted, q, reply }) => {
  try {
    if (!q) return reply("🧸 Please provide a cartoon name.\nExample: .cartoon Tom and Jerry");

    await conn.sendMessage(from, { react: { text: "⏳", key: m.key } });

    const search = await yts(`${q} cartoon`);
    const video = search.videos?.[0];
    if (!video) {
      await conn.sendMessage(from, { react: { text: "❌", key: m.key } });
      return reply("⚠️ No results found.");
    }

    const data = await fetchVideo(video.url);

    await conn.sendMessage(from, {
      image: { url: data.thumbnail || video.thumbnail },
      caption: `🧸 *CARTOON*\n\n🎞️ ${data.title}\n📺 ${data.author || 'Unknown'}\n\n_⬇️ Downloading..._\n\n> Powered by ERFAN-MD`
    }, { quoted: m });

    const buffer = await downloadBuffer(data.downloadUrl);
    const safe = (data.title || 'cartoon').replace(/[\\/:*?"<>|]/g, '_');

    await conn.sendMessage(from, {
      video: buffer,
      mimetype: 'video/mp4',
      fileName: `${safe}.mp4`,
      caption: `🧸 *${data.title}*\n\n> Powered by ERFAN-MD`
    }, { quoted: m });

    await conn.sendMessage(from, { react: { text: "✅", key: m.key } });

  } catch (error) {
    console.error("Cartoon Error:", error?.message || error);
    await conn.sendMessage(from, { react: { text: "❌", key: m.key } });
    reply(`❌ An error occurred: ${error?.message || 'unknown'}`);
  }
});

// ============================================
// COMMAND: movie (as document)
// ============================================
cmd({
  pattern: "movie",
  alias: ["playmovie", "dlmovie"],
  desc: "Download full movie as document.",
  category: "downloader",
  filename: __filename
}, async (conn, m, store, { from, quoted, q, reply }) => {
  try {
    if (!q) return reply("❌ Please provide a movie name.\nExample: .movie DJ Ganesh Chaturthi");

    await conn.sendMessage(from, { react: { text: "⚡", key: m.key } });

    const search = await yts(`${q} full movie`);
    const video = search.videos?.[0];
    if (!video) {
      await conn.sendMessage(from, { react: { text: "❌", key: m.key } });
      return reply("⚠️ No results found.");
    }

    const data = await fetchVideo(video.url);

    await conn.sendMessage(from, {
      image: { url: data.thumbnail || video.thumbnail },
      caption: `🍿 *MOVIE*\n\n🎬 ${data.title}\n📺 ${data.author || 'Unknown'}\n\n_⚡ Downloading as document..._\n\n> Powered by ERFAN-MD`
    }, { quoted: m });

    const buffer = await downloadBuffer(data.downloadUrl);
    const safe = (data.title || 'movie').replace(/[\\/:*?"<>|]/g, '_');

    await conn.sendMessage(from, {
      document: buffer,
      mimetype: 'video/mp4',
      fileName: `${safe}.mp4`,
      caption: `🍿 *${data.title}*\n\n> Powered by ERFAN-MD`
    }, { quoted: m });

    await conn.sendMessage(from, { react: { text: "✅", key: m.key } });

  } catch (error) {
    console.error("Movie Error:", error?.message || error);
    await conn.sendMessage(from, { react: { text: "❌", key: m.key } });
    reply(`❌ An error occurred: ${error?.message || 'unknown'}`);
  }
});
