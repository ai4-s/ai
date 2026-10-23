// ERFAN-MD — DEBUG VERSION
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

    await conn.sendMessage(from, { react: { text: "⏳", key: m.key } });

    // STEP 1: API call
    const apiUrl = `https://api.nexray.eu.cc/downloader/ytplay?q=${encodeURIComponent(q)}`;
    console.log('[PLAY] Calling API:', apiUrl);

    let response;
    try {
      response = await axios.get(apiUrl, {
        timeout: 30000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json'
        }
      });
    } catch (apiErr) {
      console.error('[PLAY] API request failed:', apiErr.message);
      await conn.sendMessage(from, { react: { text: "❌", key: m.key } });
      return reply(`❌ API request failed: ${apiErr.message}`);
    }

    const data = response.data;
    console.log('[PLAY] API response:', JSON.stringify(data).slice(0, 500));

    if (!data || !data.status || !data.result || !data.result.download_url) {
      await conn.sendMessage(from, { react: { text: "❌", key: m.key } });
      return reply("⚠️ No results found or download link unavailable.");
    }

    const song = data.result;
    const safeTitle = (song.title || 'song').replace(/[\\/:*?"<>|]/g, '_');

    // STEP 2: Download audio to buffer
    console.log('[PLAY] Downloading audio:', song.download_url);
    let audioBuffer;
    try {
      const audioRes = await axios.get(song.download_url, {
        responseType: 'arraybuffer',
        timeout: 60000,
        maxContentLength: 100 * 1024 * 1024, // 100 MB
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      audioBuffer = Buffer.from(audioRes.data);
      console.log('[PLAY] Audio downloaded, bytes:', audioBuffer.length);
    } catch (dlErr) {
      console.error('[PLAY] Audio download failed:', dlErr.message);
      await conn.sendMessage(from, { react: { text: "❌", key: m.key } });
      return reply(`❌ Audio download failed: ${dlErr.message}`);
    }

    // STEP 3: Send thumbnail (optional)
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

    if (song.thumbnail) {
      try {
        await conn.sendMessage(from, {
          image: { url: song.thumbnail },
          caption: caption
        }, { quoted: m });
        console.log('[PLAY] Thumbnail sent');
      } catch (thumbErr) {
        console.error('[PLAY] Thumbnail failed (non-fatal):', thumbErr.message);
      }
    }

    // STEP 4: Send audio
    await conn.sendMessage(from, {
      audio: audioBuffer,
      mimetype: 'audio/mpeg',
      fileName: `${safeTitle}.mp3`,
      ptt: false
    }, { quoted: m });
    console.log('[PLAY] Audio sent OK');

    await conn.sendMessage(from, { react: { text: "✅", key: m.key } });

  } catch (error) {
    console.error('[PLAY] FATAL:', error?.stack || error?.message || error);
    await conn.sendMessage(from, { react: { text: "❌", key: m.key } });
    reply(`❌ Error: ${error?.message || 'Unknown error'}`);
  }
});
