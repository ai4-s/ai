// ERFAN-MD
import { fileURLToPath } from 'url';
import path from 'path';
import { cmd } from '../command.js';
import axios from 'axios';
import yts from 'yt-search';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

cmd({
  pattern: "pla",
  desc: "Search YouTube and download MP3 via ERFAN API.",
  category: "downloader",
  filename: __filename
}, async (conn, m, store, { from, quoted, q, reply }) => {
  try {
    if (!q) return reply("❌ Please provide a song name.\nExample: .play Eshq Tanha");

    await conn.sendMessage(from, { react: { text: "⏳", key: m.key } });

    // 1) Search YouTube
    const search = await yts(q);
    const video = search.videos?.[0];

    if (!video) {
      await conn.sendMessage(from, { react: { text: "❌", key: m.key } });
      return reply("⚠️ No results found for the given song name.");
    }

    const videoUrl = video.url;
    console.log("[PLAY] Found video:", video.title, "|", videoUrl);

    // 2) Call new ytmp3 API
    const apiUrl = `https://rimi-xi.vercel.app/api/ytmp3?url=${encodeURIComponent(videoUrl)}`;
    const apiRes = await axios.get(apiUrl, { timeout: 30000 });
    const data = apiRes.data;

    if (!data || !data.ok || !data.download) {
      await conn.sendMessage(from, { react: { text: "❌", key: m.key } });
      return reply("⚠️ Failed to get download link from API.");
    }

    // API returns duration: null, so fall back to the yt-search values
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

    // 4) Send thumbnail + caption
    await conn.sendMessage(from, {
      image: { url: thumbnail },
      caption: caption
    }, { quoted: m });

    // 5) Download MP3 to buffer
    const audioRes = await axios.get(data.download, {
      responseType: 'arraybuffer',
      timeout: 60000,
      maxContentLength: 100 * 1024 * 1024,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://www.youtube.com/',
        'Accept': '*/*'
      }
    });

    const audioBuffer = Buffer.from(audioRes.data);

    if (!audioBuffer || audioBuffer.length < 1000) {
      await conn.sendMessage(from, { react: { text: "❌", key: m.key } });
      return reply("❌ Downloaded file is empty. Please try another song.");
    }

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
  desc: "Search YouTube and download MP4 via Delirius API.",
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

    // 2) Call Delirius ytmp4 API
    const apiUrl = `https://api.delirius.online/download/ytmp4?url=${encodeURIComponent(videoUrl)}&format=360p`;
    const apiRes = await axios.get(apiUrl, { timeout: 30000 });
    const data = apiRes.data;

    if (!data || !data.status || !data.data || !data.data.download) {
      await conn.sendMessage(from, { react: { text: "❌", key: m.key } });
      return reply("⚠️ Failed to get download link from API.");
    }

    const vid = data.data;

    // 3) Build caption
    const caption = `╭─────────────🎬
│ 🎥 *VIDEO DOWNLOADER*
│─────────────────────
│ 🎬 *Title:* ${vid.title}
│ 👤 *Author:* ${vid.author}
│ 👀 *Views:* ${vid.views}
│ 👍 *Likes:* ${vid.likes}
│ 🎞️ *Format:* ${vid.format}
╰─────────────🎬
🔗 *Powered By ERFAN-MD*`;

    // 4) Send thumbnail + caption
    await conn.sendMessage(from, {
      image: { url: vid.image },
      caption: caption
    }, { quoted: m });

    // 5) Download MP4 to buffer
    const videoRes = await axios.get(vid.download, {
      responseType: 'arraybuffer',
      timeout: 120000,
      maxContentLength: 500 * 1024 * 1024,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://www.youtube.com/',
        'Accept': '*/*'
      }
    });

    const videoBuffer = Buffer.from(videoRes.data);

    if (!videoBuffer || videoBuffer.length < 10000) {
      await conn.sendMessage(from, { react: { text: "❌", key: m.key } });
      return reply("❌ Downloaded file is empty. Please try another video.");
    }

    const safeTitle = (vid.title || 'video').replace(/[\\/:*?"<>|]/g, '_');

    // 6) Send video
    await conn.sendMessage(from, {
      video: videoBuffer,
      mimetype: 'video/mp4',
      fileName: `${safeTitle}.mp4`,
      caption: `🎬 *${vid.title}*\n🎞️ ${vid.format}\n🔗 *Powered By ERFAN-MD*`
    }, { quoted: m });

    await conn.sendMessage(from, { react: { text: "✅", key: m.key } });

  } catch (error) {
    console.error("Video Error:", error?.message || error);
    await conn.sendMessage(from, { react: { text: "❌", key: m.key } });
    reply(`❌ An error occurred: ${error?.message || 'unknown'}`);
  }
});
