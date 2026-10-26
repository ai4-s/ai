// ERFAN-MD
import { fileURLToPath } from 'url';
import path from 'path';
import { cmd } from '../command.js';
import axios from 'axios';
import yts from 'yt-search';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const VIDEO_API = (url) => `https://rimi-xi.vercel.app/api/ytmp4?url=${encodeURIComponent(url)}`;

// ============================================
// ONE call — exactly like your working example
// ============================================
async function getVideo(url) {
  const apiUrl = VIDEO_API(url);
  console.log('[API] GET', apiUrl);

  const res = await axios.get(apiUrl, { timeout: 45000, validateStatus: () => true });
  console.log('[API] HTTP', res.status, '→', JSON.stringify(res.data).slice(0, 300));

  const data = res.data;
  if (res.status !== 200 || !data?.ok || !data?.download) {
    const raw = JSON.stringify(data || {}).slice(0, 300);
    throw new Error(`API HTTP ${res.status} → ${raw}`);
  }
  return data;
}

// ============================================
// Download to buffer — like your working code
// ============================================
async function toBuffer(url, maxMB = 500) {
  const res = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 120000,
    maxContentLength: maxMB * 1024 * 1024,
    headers: {
      'User-Agent': UA,
      'Referer': 'https://www.youtube.com/',
      'Accept': '*/*'
    }
  });
  const buf = Buffer.from(res.data);
  if (!buf || buf.length < 10000) throw new Error(`File empty (${buf.length} bytes)`);
  return buf;
}

// ============================================
// COMMAND: video
// ============================================
cmd({
  pattern: "video",
  alias: ["ytv", "ytmp4", "vd"],
  desc: "Search YouTube and download MP4.",
  category: "downloader",
  filename: __filename
}, async (conn, m, store, { from, quoted, q, reply }) => {
  try {
    if (!q) return reply("❌ Please provide a video name.\nExample: .video Yan Block 444");

    await conn.sendMessage(from, { react: { text: "⏳", key: m.key } });

    const search = await yts(q);
    const video = search.videos?.[0];
    if (!video) {
      await conn.sendMessage(from, { react: { text: "❌", key: m.key } });
      return reply("⚠️ No results found.");
    }

    console.log('[VIDEO] Found:', video.title, '|', video.url);

    const data = await getVideo(video.url);

    await conn.sendMessage(from, {
      image: { url: data.thumbnail || video.thumbnail },
      caption: `╭─────────────🎬
│ 🎥 *VIDEO DOWNLOADER*
│─────────────────────
│ 🎬 *Title:* ${data.title}
│ 👤 *Author:* ${data.author || video.author?.name || 'Unknown'}
│ 🎞️ *Quality:* ${data.quality || 'HD'}
╰─────────────🎬
🔗 *Powered By ERFAN-MD*`
    }, { quoted: m });

    const buffer = await toBuffer(data.download);
    const safe = (data.title || 'video').replace(/[\\/:*?"<>|]/g, '_');

    await conn.sendMessage(from, {
      video: buffer,
      mimetype: 'video/mp4',
      fileName: `${safe}.mp4`,
      caption: `🎬 *${data.title}*\n🎞️ ${data.quality || 'HD'}\n🔗 *Powered By ERFAN-MD*`
    }, { quoted: m });

    await conn.sendMessage(from, { react: { text: "✅", key: m.key } });

  } catch (error) {
    console.error("Video Error:", error?.message || error);
    await conn.sendMessage(from, { react: { text: "❌", key: m.key } });
    reply(`❌ ${error?.message || 'unknown error'}`);
  }
});

// ============================================
// COMMAND: drama
// ============================================
cmd({
  pattern: "drama",
  alias: ["film", "series"],
  desc: "Download drama as video or document.",
  category: "downloader",
  filename: __filename
}, async (conn, m, store, { from, quoted, q, reply }) => {
  try {
    if (!q) return reply("🎬 Please provide a drama name.\nExample: .drama Muskan 5");

    await conn.sendMessage(from, { react: { text: "⏳", key: m.key } });

    const search = await yts(q);
    const video = search.videos?.[0];
    if (!video) {
      await conn.sendMessage(from, { react: { text: "❌", key: m.key } });
      return reply("⚠️ No results found.");
    }

    const sent = await conn.sendMessage(from, {
      image: { url: video.thumbnail },
      caption: `*╭┈〔 DRAMA DOWNLOADER 〕┈⊷*
*├▢ 🎬 Title:* ${video.title}
*├▢ 📺 Channel:* ${video.author?.name || 'Unknown'}
*├▢ ⏰ Duration:* ${video.timestamp}
*╰───────────────────⊷*
*Reply:*
*┋ 1* 📹 Video (MP4)
*┋ 2* 📄 Document

> Powered by ERFAN-MD`
    }, { quoted: m });

    const msgId = sent.key.id;

    const listener = async (msgData) => {
      const received = msgData.messages[0];
      if (!received.message) return;

      const sel = (received.message.conversation || received.message.extendedTextMessage?.text)?.trim();
      const replyToBot = received.message.extendedTextMessage?.contextInfo?.stanzaId === msgId;
      if (!replyToBot) return;

      conn.ev.off("messages.upsert", listener);
      await conn.sendMessage(from, { react: { text: "⬇️", key: received.key } });

      if (sel !== "1" && sel !== "2") {
        return conn.sendMessage(from, { text: "❌ Invalid. Reply 1 or 2." }, { quoted: received });
      }

      try {
        const data = await getVideo(video.url);
        const buffer = await toBuffer(data.download);
        const safe = (data.title || 'drama').replace(/[\\/:*?"<>|]/g, '_');

        if (sel === "2") {
          await conn.sendMessage(from, {
            document: buffer,
            mimetype: 'video/mp4',
            fileName: `${safe}.mp4`,
            caption: `📄 *${data.title}*\n📹 Video Document\n\n> Powered by ERFAN-MD`
          }, { quoted: received });
        } else {
          await conn.sendMessage(from, {
            video: buffer,
            mimetype: 'video/mp4',
            fileName: `${safe}.mp4`,
            caption: `🎬 *${data.title}*\n\n> Powered by ERFAN-MD`
          }, { quoted: received });
        }

        await conn.sendMessage(from, { react: { text: "✅", key: received.key } });
      } catch (e) {
        console.error("Drama Err:", e.message);
        await conn.sendMessage(from, { text: `❌ ${e.message}` }, { quoted: received });
      }
    };

    conn.ev.on("messages.upsert", listener);
    setTimeout(() => conn.ev.off("messages.upsert", listener), 30000);

  } catch (error) {
    console.error("Drama Error:", error?.message || error);
    await conn.sendMessage(from, { react: { text: "❌", key: m.key } });
    reply(`❌ ${error?.message || 'unknown error'}`);
  }
});

// ============================================
// COMMAND: cartoon
// ============================================
cmd({
  pattern: "cartoon",
  alias: ["toon", "kids"],
  desc: "Download cartoon video.",
  category: "downloader",
  filename: __filename
}, async (conn, m, store, { from, quoted, q, reply }) => {
  try {
    if (!q) return reply("🧸 Please provide a cartoon name.\nExample: .cartoon Tom and Jerry");

    await conn.sendMessage(from, { react: { text: "⏳", key: m.key } });

    const search = await yts(`${q} cartoon`);
    const video = search.videos?.[0];
    if (!video) {
      await conn.sendMessage(from, { react: { text: "❌", key: m.key } });
      return reply("⚠️ No results found.");
    }

    const data = await getVideo(video.url);

    await conn.sendMessage(from, {
      image: { url: data.thumbnail || video.thumbnail },
      caption: `🧸 *CARTOON*\n\n🎞️ ${data.title}\n📺 ${data.author || 'Unknown'}\n\n_⬇️ Downloading..._\n\n> Powered by ERFAN-MD`
    }, { quoted: m });

    const buffer = await toBuffer(data.download);
    const safe = (data.title || 'cartoon').replace(/[\\/:*?"<>|]/g, '_');

    await conn.sendMessage(from, {
      video: buffer,
      mimetype: 'video/mp4',
      fileName: `${safe}.mp4`,
      caption: `🧸 *${data.title}*\n\n> Powered by ERFAN-MD`
    }, { quoted: m });

    await conn.sendMessage(from, { react: { text: "✅", key: m.key } });

  } catch (error) {
    console.error("Cartoon Error:", error?.message || error);
    await conn.sendMessage(from, { react: { text: "❌", key: m.key } });
    reply(`❌ ${error?.message || 'unknown error'}`);
  }
});

// ============================================
// COMMAND: movie
// ============================================
cmd({
  pattern: "movie",
  alias: ["playmovie", "dlmovie"],
  desc: "Download full movie as document.",
  category: "downloader",
  filename: __filename
}, async (conn, m, store, { from, quoted, q, reply }) => {
  try {
    if (!q) return reply("❌ Please provide a movie name.\nExample: .movie DJ Ganesh Chaturthi");

    await conn.sendMessage(from, { react: { text: "⚡", key: m.key } });

    const search = await yts(`${q} full movie`);
    const video = search.videos?.[0];
    if (!video) {
      await conn.sendMessage(from, { react: { text: "❌", key: m.key } });
      return reply("⚠️ No results found.");
    }

    const data = await getVideo(video.url);

    await conn.sendMessage(from, {
      image: { url: data.thumbnail || video.thumbnail },
      caption: `🍿 *MOVIE*\n\n🎬 ${data.title}\n📺 ${data.author || 'Unknown'}\n\n_⚡ Downloading as document..._\n\n> Powered by ERFAN-MD`
    }, { quoted: m });

    const buffer = await toBuffer(data.download);
    const safe = (data.title || 'movie').replace(/[\\/:*?"<>|]/g, '_');

    await conn.sendMessage(from, {
      document: buffer,
      mimetype: 'video/mp4',
      fileName: `${safe}.mp4`,
      caption: `🍿 *${data.title}*\n\n> Powered by ERFAN-MD`
    }, { quoted: m });

    await conn.sendMessage(from, { react: { text: "✅", key: m.key } });

  } catch (error) {
    console.error("Movie Error:", error?.message || error);
    await conn.sendMessage(from, { react: { text: "❌", key: m.key } });
    reply(`❌ ${error?.message || 'unknown error'}`);
  }
});
