// ERFAN-MD
import { fileURLToPath } from 'url';
import path from 'path';
import { cmd } from '../command.js';
import axios from 'axios';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

cmd({
  pattern: "play",
  desc: "Search and download a song by name.",
  category: "downloader",
  filename: __filename
}, async (conn, m, store, { from, quoted, q, reply }) => {
  try {
    if (!q) return reply("❌ Please provide a song name.\nExample: .play Aashiq Banaya Aapne");

    await conn.sendMessage(from, { react: { text: "⏳", key: m.key } });

    // 1) API se search
    const apiUrl = `https://api.nexray.eu.cc/downloader/ytplay?q=${encodeURIComponent(q)}`;
    const response = await axios.get(apiUrl, { timeout: 30000 });
    const data = response.data;

    if (!data || !data.status || !data.result || !data.result.download_url) {
      await conn.sendMessage(from, { react: { text: "❌", key: m.key } });
      return reply("⚠️ No results found.");
    }

    const song = data.result;
    const safeTitle = (song.title || 'song').replace(/[\\/:*?"<>|]/g, '_');

    // 2) Thumbnail + caption
    const caption = `╭─────────────🎵
│ 🎧 *SONG DOWNLOADER*
│─────────────────────
│ 🎵 *Title:* ${song.title}
│ 👤 *Channel:* ${song.channel}
│ ⏱️ *Duration:* ${song.duration}
│ 👀 *Views:* ${song.views}
│ 📅 *Uploaded:* ${song.upload_at}
│ 🔗 *YT URL:* ${song.url}
╰─────────────🎵
🔗 *Powered By DARKZONE-AI*`;

    await conn.sendMessage(from, {
      image: { url: song.thumbnail },
      caption: caption
    }, { quoted: m });

    // 3) FIX: MP3 khud download karo → buffer → audio bhejo (link nahi)
    const audioRes = await axios.get(song.download_url, {
      responseType: 'arraybuffer',
      timeout: 60000,
      maxContentLength: 100 * 1024 * 1024, // 100 MB
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
