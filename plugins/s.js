// ERFAN-MD
import { fileURLToPath } from 'url';
import path from 'path';
import { cmd } from '../command.js';
import axios from 'axios';
import yts from 'yt-search';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

    const videoUrl = video.url;
    console.log("[VIDEO] Found video:", video.title, "|", videoUrl);

    // 2) Call the new API
    const apiUrl = `https://rimi-xi.vercel.app/api/ytmp4?url=${encodeURIComponent(videoUrl)}`;
    const apiRes = await axios.get(apiUrl, { timeout: 60000 });
    const data = apiRes.data;

    if (!data || !data.ok || !data.download) {
      await conn.sendMessage(from, { react: { text: "❌", key: m.key } });
      return reply("⚠️ Failed to get download link from API.");
    }

    // 3) Build info (API gives limited data, so use yt-search for the rest)
    const title = data.title || video.title || "video";
    const author = video.author?.name || data.author || "Unknown";
    const views = video.views ? video.views.toLocaleString() : "N/A";
    const duration = video.timestamp || "N/A";
    const quality = data.quality || "HD";
    const thumb = data.thumbnail || video.thumbnail;

    const caption = `╭─────────────🎬
│ 🎥 *VIDEO DOWNLOADER*
│─────────────────────
│ 🎬 *Title:* ${title}
│ 👤 *Author:* ${author}
│ 👀 *Views:* ${views}
│ ⏱️ *Duration:* ${duration}
│ 🎞️ *Quality:* ${quality}
╰─────────────🎬
🔗 *Powered By ERFAN-MD*`;

    // 4) Send thumbnail + caption
    try {
      await conn.sendMessage(from, {
        image: { url: thumb },
        caption: caption
      }, { quoted: m });
    } catch (e) {
      await reply(caption); // fallback if thumbnail fails
    }

    // 5) Download MP4 to buffer
    const videoRes = await axios.get(data.download, {
      responseType: 'arraybuffer',
      timeout: 180000,
      maxContentLength: 500 * 1024 * 1024,
      maxBodyLength: 500 * 1024 * 1024,
      maxRedirects: 5,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': '*/*'
      }
    });

    const videoBuffer = Buffer.from(videoRes.data);

    // Make sure we got a real video and not an error page / JSON
    const head = videoBuffer.slice(0, 1).toString();
    if (!videoBuffer || videoBuffer.length < 10000 || head === '{' || head === '<') {
      await conn.sendMessage(from, { react: { text: "❌", key: m.key } });
      return reply("❌ Downloaded file is invalid or empty. Please try again.");
    }

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
