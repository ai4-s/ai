// ERFAN-MD
import { fileURLToPath } from 'url';
import path from 'path';
import { cmd } from '../command.js';
import axios from 'axios';
import yts from 'yt-search';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

cmd({
  pattern: "play",
  desc: "Search YouTube and download MP3 via Delirius API.",
  category: "downloader",
  filename: __filename
}, async (conn, m, store, { from, quoted, q, reply }) => {
  try {
    if (!q) return reply("❌ Please provide a song name.\nExample: .play Pal Pal");

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

    // 2) Call Delirius API for MP3
    const apiUrl = `https://api.delirius.online/download/ytmp3?url=${encodeURIComponent(videoUrl)}`;
    const apiRes = await axios.get(apiUrl, { timeout: 30000 });
    const data = apiRes.data;

    if (!data || !data.status || !data.data || !data.data.download) {
      await conn.sendMessage(from, { react: { text: "❌", key: m.key } });
      return reply("⚠️ Failed to get download link from API.");
    }

    const song = data.data;

    // 3) Build caption
    const caption = `╭─────────────🎵
│ 🎧 *SONG DOWNLOADER*
│─────────────────────
│ 🎵 *Title:* ${song.title}
│ 👤 *Author:* ${song.author}
│ 👀 *Views:* ${song.views}
│ 👍 *Likes:* ${song.likes}
│ 🎼 *Format:* ${song.format}
│ 🔗 *YT URL:* ${videoUrl}
╰─────────────🎵
🔗 *Powered By ERFAN-MD*`;

    // 4) Send thumbnail + caption
    await conn.sendMessage(from, {
      image: { url: song.image },
      caption: caption
    }, { quoted: m });

    // 5) Download MP3 to buffer
    const audioRes = await axios.get(song.download, {
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

    const safeTitle = (song.title || 'song').replace(/[\\/:*?"<>|]/g, '_');

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
