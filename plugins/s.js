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

    // React with hourglass while processing
    await conn.sendMessage(from, { react: { text: "⏳", key: m.key } });

    // Call Nexray YT Play API
    const apiUrl = `https://api.nexray.eu.cc/downloader/ytplay?q=${encodeURIComponent(q)}`;
    const response = await axios.get(apiUrl, { timeout: 30000 });
    const data = response.data;

    // Validate response
    if (!data || !data.status || !data.result || !data.result.download_url) {
      await conn.sendMessage(from, { react: { text: "❌", key: m.key } });
      return reply("⚠️ No results found or download link unavailable. Try another song name.");
    }

    const song = data.result;

    // Build caption
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

    // Send thumbnail as image preview (optional but nice UX)
    try {
      if (song.thumbnail) {
        await conn.sendMessage(from, {
          image: { url: song.thumbnail },
          caption: caption
        }, { quoted: m });
      }
    } catch (e) {
      // Ignore thumbnail failure, continue to audio
      console.error("Thumbnail send failed:", e.message);
    }

    // Send the MP3 as audio
    await conn.sendMessage(from, {
      audio: { url: song.download_url },
      mimetype: "audio/mpeg",
      fileName: `${song.title.replace(/[\\/:*?"<>|]/g, '_')}.mp3`,
      ptt: false
    }, { quoted: m });

    // Success reaction
    await conn.sendMessage(from, { react: { text: "✅", key: m.key } });

  } catch (error) {
    console.error("Play Error:", error?.message || error);
    await conn.sendMessage(from, { react: { text: "❌", key: m.key } });
    reply("❌ An error occurred while fetching the song. Please try again.");
  }
});
