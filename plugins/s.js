// ERFAN-MD — DEBUG
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
  let step = "start";
  try {
    if (!q) return reply("❌ Please provide a song name.\nExample: .play Aashiq Banaya Aapne");

    await conn.sendMessage(from, { react: { text: "⏳", key: m.key } });

    // STEP 1: API call
    step = "api-call";
    const apiUrl = `https://api.nexray.eu.cc/downloader/ytplay?q=${encodeURIComponent(q)}`;
    console.log("[PLAY] STEP 1 → API URL:", apiUrl);

    const response = await axios.get(apiUrl, { timeout: 30000 });
    const data = response.data;
    console.log("[PLAY] STEP 1 OK → status:", data?.status, "| has result:", !!data?.result);

    if (!data || !data.status || !data.result) {
      return reply("⚠️ No results found.");
    }

    const song = data.result;
    console.log("[PLAY] Thumbnail URL:", song.thumbnail);
    console.log("[PLAY] Download URL:", song.download_url);
    console.log("[PLAY] Title:", song.title);

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

    // STEP 2: Thumbnail bhejo
    step = "send-thumbnail";
    console.log("[PLAY] STEP 2 → Sending thumbnail...");
    await conn.sendMessage(from, {
      image: { url: song.thumbnail },
      caption: caption
    }, { quoted: m });
    console.log("[PLAY] STEP 2 OK → thumbnail sent");

    // STEP 3: Audio bhejo
    step = "send-audio";
    console.log("[PLAY] STEP 3 → Sending audio...");
    await conn.sendMessage(from, {
      audio: { url: song.download_url },
      mimetype: 'audio/mpeg',
      fileName: `${(song.title || 'song').replace(/[\\/:*?"<>|]/g, '_')}.mp3`,
      ptt: false
    }, { quoted: m });
    console.log("[PLAY] STEP 3 OK → audio sent");

    await conn.sendMessage(from, { react: { text: "✅", key: m.key } });

  } catch (error) {
    console.error(`[PLAY] ❌ FAILED AT STEP: ${step}`);
    console.error("[PLAY] Error name:", error?.name);
    console.error("[PLAY] Error message:", error?.message);
    console.error("[PLAY] Error stack:", error?.stack);

    await conn.sendMessage(from, { react: { text: "❌", key: m.key } });
    reply(`❌ Failed at *${step}*\n\nReason: ${error?.message || 'unknown'}`);
  }
});
