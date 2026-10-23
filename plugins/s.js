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

    // API ko query do
    const apiUrl = `https://api.nexray.eu.cc/downloader/ytplay?q=${encodeURIComponent(q)}`;
    const response = await axios.get(apiUrl);
    const data = response.data;

    if (!data || !data.status || !data.result) {
      return reply("⚠️ No results found.");
    }

    const song = data.result;

    // Caption banao
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

    // 1) Thumbnail + caption bhejo
    await conn.sendMessage(from, {
      image: { url: song.thumbnail },
      caption: caption
    }, { quoted: m });

    // 2) Audio bhejo (API ka download_url seedha)
    await conn.sendMessage(from, {
      audio: { url: song.download_url },
      mimetype: 'audio/mpeg',
      fileName: `${song.title.replace(/[\\/:*?"<>|]/g, '_')}.mp3`,
      ptt: false
    }, { quoted: m });

    await conn.sendMessage(from, { react: { text: "✅", key: m.key } });

  } catch (error) {
    console.error("Play Error:", error);
    reply("❌ An error occurred while fetching the song. Please try again.");
  }
});
