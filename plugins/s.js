// ERFAN-MD
import { fileURLToPath } from 'url';
import path from 'path';
import { cmd } from '../command.js';
import axios from 'axios';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

cmd({
  pattern: "play",
  desc: "Search and download a song by name (YouTube MP3).",
  category: "downloader",
  filename: __filename
}, async (conn, m, store, { from, quoted, q, reply }) => {
  try {
    if (!q) return reply("❌ Please provide a song name.\nExample: .play Aashiq Banaya Aapne");

    // ⏳ loading reaction
    await conn.sendMessage(from, { react: { text: "⏳", key: m.key } });

    // 1) Search API
    const apiUrl = `https://api.nexray.eu.cc/downloader/ytplay?q=${encodeURIComponent(q)}`;
    const response = await axios.get(apiUrl, { timeout: 30000 });
    const data = response.data;

    if (!data || !data.status || !data.result || !data.result.download_url) {
      await conn.sendMessage(from, { react: { text: "❌", key: m.key } });
      return reply("⚠️ No results found for the given song name.");
    }

    const song = data.result;
    const safeTitle = (song.title || 'song').replace(/[\\/:*?"<>|]/g, '_');

    // 2) Caption
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

    // 3) Send thumbnail + caption (same as before — this part works)
    if (song.thumbnail) {
      try {
        await conn.sendMessage(from, {
          image: { url: song.thumbnail },
          caption: caption
        }, { quoted: m });
      } catch (thumbErr) {
        console.error("Thumbnail send failed (non-fatal):", thumbErr.message);
        // fallback: still send caption as text so user sees info
        await conn.sendMessage(from, { text: caption }, { quoted: m });
      }
    }

    // 4) FIX: download MP3 to buffer, then send — no remote URL streaming
    const audioRes = await axios.get(song.download_url, {
      responseType: 'arraybuffer',
      timeout: 60000,
      maxContentLength: 100 * 1024 * 1024, // 100 MB
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://www.youtube.com/'
      }
    });
    const audioBuffer = Buffer.from(audioRes.data);

    if (!audioBuffer || audioBuffer.length < 1000) {
      await conn.sendMessage(from, { react: { text: "❌", key: m.key } });
      return reply("❌ Downloaded file is empty. Please try another song.");
    }

    // 5) Send audio
    await conn.sendMessage(from, {
      audio: audioBuffer,
      mimetype: 'audio/mpeg',
      fileName: `${safeTitle}.mp3`,
      ptt: false
    }, { quoted: m });

    // ✅ success
    await conn.sendMessage(from, { react: { text: "✅", key: m.key } });

  } catch (error) {
    console.error("Play Error:", error?.message || error);
    await conn.sendMessage(from, { react: { text: "❌", key: m.key } });
    reply(`❌ An error occurred while fetching the song: ${error?.message || 'unknown'}`);
  }
});
