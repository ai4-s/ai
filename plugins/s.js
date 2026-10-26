// ERFAN-MD
import { fileURLToPath } from 'url';
import path from 'path';
import { cmd } from '../command.js';
import axios from 'axios';
import yts from 'yt-search';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Try main API (3 attempts), then fallback API
async function getDownloadLink(videoId, fullUrl) {
  const shortUrl = `https://youtu.be/${videoId}`;

  // --- API 1: rimi-xi (with retries) ---
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await axios.get(
        `https://rimi-xi.vercel.app/api/ytmp4?url=${encodeURIComponent(shortUrl)}`,
        {
          timeout: 60000,
          headers: { 'User-Agent': UA, 'Accept': 'application/json, text/plain, */*' }
        }
      );
      const d = res.data;
      if (d && d.ok && d.download) {
        return { download: d.download, title: d.title, quality: d.quality || 'HD', source: 'rimi' };
      }
      console.log(`[VIDEO] rimi attempt ${attempt}: bad body`, JSON.stringify(d)?.slice(0, 300));
    } catch (e) {
      console.log(
        `[VIDEO] rimi attempt ${attempt} failed:`,
        e?.response?.status || e.message,
        JSON.stringify(e?.response?.data)?.slice(0, 300) || ''
      );
    }
    if (attempt < 3) await sleep(3000);
  }

  // --- API 2: Delirius fallback ---
  try {
    const res = await axios.get(
      `https://api.delirius.online/download/ytmp4?url=${encodeURIComponent(fullUrl)}&format=360p`,
      { timeout: 60000, headers: { 'User-Agent': UA } }
    );
    const d = res.data;
    if (d?.status && d?.data?.download) {
      return { download: d.data.download, title: d.data.title, quality: d.data.format || '360p', source: 'delirius' };
    }
    console.log('[VIDEO] delirius bad body:', JSON.stringify(d)?.slice(0, 300));
  } catch (e) {
    console.log('[VIDEO] delirius failed:', e?.response?.status || e.message);
  }

  return null;
}

cmd({
  pattern: "video",
  desc: "Search YouTube and download MP4.",
  category: "downloader",
  filename: __filename
}, async (conn, m, store, { from, quoted, q, reply }) => {
  try {
    if (!q) return reply("❌ Please provide a video name.\nExample: .video Yan Block 444");

    await conn.sendMessage(from, { react: { text: "⏳", key: m.key } });

    // 1) Search YouTube
    const search = await yts(q);
    const video = search.videos?.[0];

    if (!video) {
      await conn.sendMessage(from, { react: { text: "❌", key: m.key } });
      return reply("⚠️ No results found for the given video name.");
    }

    console.log("[VIDEO] Found video:", video.title, "|", video.url);

    // 2) Send search result FIRST (so you can see search works)
    const caption = `╭─────────────🎬
│ 🎥 *VIDEO DOWNLOADER*
│─────────────────────
│ 🎬 *Title:* ${video.title}
│ 👤 *Author:* ${video.author?.name || 'Unknown'}
│ 👀 *Views:* ${video.views ? video.views.toLocaleString() : 'N/A'}
│ ⏱️ *Duration:* ${video.timestamp || 'N/A'}
╰─────────────🎬
⏳ Downloading, please wait...
🔗 *Powered By ERFAN-MD*`;

    try {
      await conn.sendMessage(from, {
        image: { url: video.thumbnail },
        caption
      }, { quoted: m });
    } catch (e) {
      await reply(caption);
    }

    // 3) Get download link (retries + fallback)
    const info = await getDownloadLink(video.videoId, video.url);

    if (!info) {
      await conn.sendMessage(from, { react: { text: "❌", key: m.key } });
      return reply("⚠️ Download servers are not responding right now. Please try again in a minute.");
    }

    console.log(`[VIDEO] Using ${info.source} API`);

    // 4) Download MP4 to buffer
    const videoRes = await axios.get(info.download, {
      responseType: 'arraybuffer',
      timeout: 180000,
      maxContentLength: 500 * 1024 * 1024,
      maxBodyLength: 500 * 1024 * 1024,
      maxRedirects: 5,
      headers: { 'User-Agent': UA, 'Accept': '*/*' }
    });

    const videoBuffer = Buffer.from(videoRes.data);
    const head = videoBuffer.slice(0, 1).toString();

    if (!videoBuffer || videoBuffer.length < 10000 || head === '{' || head === '<') {
      console.log('[VIDEO] Invalid file, size:', videoBuffer?.length, 'start:', videoBuffer.slice(0, 200).toString());
      await conn.sendMessage(from, { react: { text: "❌", key: m.key } });
      return reply("❌ Downloaded file is invalid or empty. Please try again.");
    }

    const title = info.title || video.title;
    const safeTitle = title.replace(/[\\/:*?"<>|]/g, '_');

    // 5) Send video
    await conn.sendMessage(from, {
      video: videoBuffer,
      mimetype: 'video/mp4',
      fileName: `${safeTitle}.mp4`,
      caption: `🎬 *${title}*\n🎞️ ${info.quality}\n🔗 *Powered By ERFAN-MD*`
    }, { quoted: m });

    await conn.sendMessage(from, { react: { text: "✅", key: m.key } });

  } catch (error) {
    console.error("Video Error:", error?.response?.status || error?.message || error);
    await conn.sendMessage(from, { react: { text: "❌", key: m.key } });
    reply(`❌ An error occurred: ${error?.message || 'unknown'}`);
  }
});
