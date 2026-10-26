// ERFAN MD 
import { fileURLToPath } from 'url';
import { cmd } from '../command.js';
import axios from 'axios';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);

// ============================================
// NEW VIDEO API (MP4) — matches your working example
// ============================================
const VIDEO_API = (url) => `https://rimi-xi.vercel.app/api/ytmp4?url=${encodeURIComponent(url)}`;

const toSmallCaps = (text) => {
    const map = {
        'a': 'ᴀ', 'b': 'ʙ', 'c': 'ᴄ', 'd': 'ᴅ', 'e': 'ᴇ', 'f': 'ғ', 'g': 'ɢ', 'h': 'ʜ', 'i': 'ɪ', 'j': 'ᴊ',
        'k': 'ᴋ', 'l': 'ʟ', 'm': 'ᴍ', 'n': 'ɴ', 'o': 'ᴏ', 'p': 'ᴘ', 'q': 'ǫ', 'r': 'ʀ', 's': 's', 't': 'ᴛ',
        'u': 'ᴜ', 'v': 'ᴠ', 'w': 'ᴡ', 'x': 'x', 'y': 'ʏ', 'z': 'ᴢ'
    };
    return text.split('').map(c => map[c.toLowerCase()] || c).join('');
};

function getVideoId(url) {
    if (!url || typeof url !== 'string') return null;
    const patterns = [
        /(?:youtube\.com\/watch\?.*v=)([a-zA-Z0-9_-]{11})/,
        /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/,
        /(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
        /(?:youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
        /(?:youtube\.com\/live\/)([a-zA-Z0-9_-]{11})/,
        /(?:youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/,
        /(?:m\.youtube\.com\/watch\?.*v=)([a-zA-Z0-9_-]{11})/,
        /(?:youtube\.com\/watch\/)([a-zA-Z0-9_-]{11})/,
        /(?:music\.youtube\.com\/watch\?.*v=)([a-zA-Z0-9_-]{11})/
    ];
    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match && match[1]) return match[1];
    }
    return null;
}

// ============================================
// Fetch video data — with retry + clean URL + logging
// ============================================
async function fetchVideoData(url) {
    const vidId = getVideoId(url);
    if (!vidId) throw new Error(`Invalid YouTube URL: ${url}`);

    // Use youtu.be format exactly like the working example
    const cleanUrl = `https://youtu.be/${vidId}`;
    console.log(`[ERFAN-API] ▶ Requesting: ${cleanUrl}`);

    let lastError = null;

    for (let attempt = 1; attempt <= 2; attempt++) {
        try {
            const res = await axios.get(VIDEO_API(cleanUrl), {
                timeout: 60000,
                validateStatus: () => true,
                headers: { 'User-Agent': 'Mozilla/5.0' }
            });

            console.log(`[ERFAN-API] ✓ HTTP ${res.status} (attempt ${attempt})`);
            console.log(`[ERFAN-API] Response:`, JSON.stringify(res.data).slice(0, 300));

            if (res.data?.ok && res.data?.download) {
                return {
                    downloadUrl: res.data.download,
                    title: res.data.title,
                    thumbnail: res.data.thumbnail,
                    author: res.data.author,
                    quality: res.data.quality
                };
            }

            lastError = new Error(`API ok=false or missing download (HTTP ${res.status})`);
        } catch (e) {
            lastError = e;
            console.error(`[ERFAN-API] ✗ Attempt ${attempt} failed:`, e.message);
            if (attempt < 2) await new Promise(r => setTimeout(r, 1500));
        }
    }
    throw lastError || new Error("API request failed");
}

// ============================================
// Send video: try URL first, fallback to disk
// ============================================
async function sendVideo(conn, from, quoted, data, { caption, asDocument = false } = {}) {
    const finalCaption = caption || `🎬 *${data.title}*\n\n> Powered by ERFAN-MD`;

    // --- Attempt 1: direct URL ---
    try {
        const payload = asDocument
            ? { document: { url: data.downloadUrl }, mimetype: "video/mp4", fileName: `${data.title}.mp4`, caption: finalCaption }
            : { video: { url: data.downloadUrl }, caption: finalCaption };
        await conn.sendMessage(from, payload, { quoted });
        console.log('[ERFAN-SEND] ✓ Direct URL send OK');
        return true;
    } catch (e) {
        console.error('[ERFAN-SEND] ✗ Direct URL send failed:', e.message);
    }

    // --- Attempt 2: download to disk ---
    let tempFile = null;
    try {
        tempFile = path.join(os.tmpdir(), `video_${Date.now()}.mp4`);
        console.log('[ERFAN-SEND] ⬇ Downloading to disk...');

        const fileRes = await axios({
            method: 'GET',
            url: data.downloadUrl,
            responseType: 'stream',
            timeout: 120000,
            maxRedirects: 5
        });

        const writer = fs.createWriteStream(tempFile);
        fileRes.data.pipe(writer);
        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });

        const stats = fs.statSync(tempFile);
        console.log(`[ERFAN-SEND] ✓ File ready: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

        const payload = asDocument
            ? { document: { url: tempFile }, mimetype: "video/mp4", fileName: `${data.title}.mp4`, caption: finalCaption }
            : { video: { url: tempFile }, caption: finalCaption };
        await conn.sendMessage(from, payload, { quoted });
        return true;
    } catch (e) {
        console.error('[ERFAN-SEND] ✗ Disk fallback failed:', e.message);
        return false;
    } finally {
        if (tempFile) {
            try { if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile); } catch {}
            if (global.gc) global.gc();
        }
    }
}

// ============================================
// COMMAND: video
// ============================================
cmd({
    pattern: "video",
    alias: ["ytv", "ytmp4", "vd"],
    desc: "Download YouTube video",
    category: "download",
    react: "📹",
    filename: __filename
}, async (conn, mek, m, { from, text, reply }) => {
    try {
        if (!text) return reply("🎥 Please provide a video name or link!\n\nExample: `.video Alone Marshmello`");

        const { default: yts } = await import('yt-search');

        let url = text;
        let vid = null;

        if (text.startsWith('http://') || text.startsWith('https://')) {
            if (!text.includes("youtube.com") && !text.includes("youtu.be")) {
                return reply("❌ Please provide a valid YouTube URL!");
            }
            const videoId = getVideoId(text);
            if (!videoId) return reply("❌ Invalid YouTube URL!");
            vid = await yts({ videoId: videoId });
        } else {
            const search = await yts(text);
            if (!search || !search.videos || !search.videos.length) {
                return reply("❌ No video results found!");
            }
            vid = search.videos[0];
            url = vid.url;
        }

        if (!vid) return reply("❌ No results found!");

        await conn.sendMessage(from, {
            image: { url: vid.thumbnail },
            caption: `*🎬 VIDEO DOWNLOADER*\n\n🎞️ *Title:* ${vid.title}\n📺 *Channel:* ${vid.author?.name || 'Unknown'}\n🕒 *Duration:* ${vid.timestamp}\n\n*Status:* Downloading Video...\n\n> Powered by ERFAN-MD`
        }, { quoted: mek });

        const data = await fetchVideoData(url);
        const ok = await sendVideo(conn, from, mek, data, {
            caption: `🎬 *${data.title || vid.title}*\n\n> Powered by ERFAN-MD`
        });

        if (!ok) return reply("❌ Failed to send video! Try again later.");
        await conn.sendMessage(from, { react: { text: '✅', key: m.key } });

    } catch (e) {
        console.error("Error in .video command:", e);
        // 👇 shows the REAL error so you can see what's failing
        reply(`❌ Error: ${e.message || 'Unknown error'}`);
        await conn.sendMessage(from, { react: { text: '❌', key: m.key } });
    }
});

// ============================================
// COMMAND: drama (Interactive)
// ============================================
cmd({
    pattern: "drama",
    alias: ["film", "series"],
    desc: "Download YouTube drama/movie video (interactive)",
    category: "download",
    react: "🎬",
    filename: __filename
}, async (conn, mek, m, { from, text, reply }) => {
    try {
        if (!text) return reply("🎬 Please provide a drama/movie name or link.\n\nExample: `.drama Muskan 5`");

        const { default: yts } = await import('yt-search');

        let vid = null;

        if (text.startsWith('http://') || text.startsWith('https://')) {
            if (!text.includes("youtube.com") && !text.includes("youtu.be")) {
                return reply("❌ Please provide a valid YouTube URL!");
            }
            const videoId = getVideoId(text);
            if (!videoId) return reply("❌ Invalid YouTube URL!");
            vid = await yts({ videoId: videoId });
        } else {
            const search = await yts(text);
            if (!search || !search.videos || !search.videos.length) {
                return reply("❌ No results found!");
            }
            vid = search.videos[0];
        }

        if (!vid) return reply("❌ No results found!");

        const caption = `*╭┈───〔 ${toSmallCaps('Drama Downloader')} 〕┈───⊷*
*├▢ 🎬 Title:* ${vid.title}
*├▢ 📺 Channel:* ${vid.author?.name || 'Unknown'}
*├▢ ⏰ Duration:* ${vid.timestamp}
*├▢ 👀 Views:* ${vid.views?.toLocaleString() || 'N/A'}
*╰───────────────────⊷*
*╭───⬡ ${toSmallCaps('Select Format')} ⬡───*
*┋ ⬡ 1* 📹 ${toSmallCaps('Video (MP4)')}
*┋ ⬡ 2* 📄 ${toSmallCaps('Video as Document')}
*╰───────────────────⊷*

> Powered by ERFAN-MD`;

        const sent = await conn.sendMessage(from, { image: { url: vid.thumbnail }, caption }, { quoted: mek });
        const msgId = sent.key.id;

        const dramaListener = async (msgData) => {
            const received = msgData.messages[0];
            if (!received.message) return;

            const selected = received.message.conversation || received.message.extendedTextMessage?.text;
            const replyToBot = received.message.extendedTextMessage?.contextInfo?.stanzaId === msgId;

            if (replyToBot) {
                conn.ev.off("messages.upsert", dramaListener);
                await conn.sendMessage(from, { react: { text: '⬇️', key: received.key } });

                const cleanSelect = selected?.trim();

                if (cleanSelect === "1" || cleanSelect === "2") {
                    const asDocument = cleanSelect === "2";
                    try {
                        const data = await fetchVideoData(vid.url);
                        const ok = await sendVideo(conn, from, received, data, {
                            asDocument,
                            caption: asDocument
                                ? `📄 *${data.title || vid.title}*\n📹 Video Document\n\n> Powered by ERFAN-MD`
                                : `🎬 *${data.title || vid.title}*\n\n> Powered by ERFAN-MD`
                        });
                        if (!ok) {
                            return await conn.sendMessage(from, { text: "❌ Failed to send video!" }, { quoted: received });
                        }
                        await conn.sendMessage(from, { react: { text: '✅', key: received.key } });
                    } catch (e) {
                        console.error('drama error:', e);
                        await conn.sendMessage(from, { text: `❌ Error: ${e.message}` }, { quoted: received });
                    }
                } else {
                    await conn.sendMessage(from, {
                        text: `❌ *Invalid selection!*\nPlease reply with:\n1️⃣ for Video (MP4)\n2️⃣ for Video as Document`
                    }, { quoted: received });
                }
            }
        };

        conn.ev.on("messages.upsert", dramaListener);
        setTimeout(() => { conn.ev.off("messages.upsert", dramaListener); }, 30000);

    } catch (e) {
        console.error(e);
        reply(`❌ Error: ${e.message}`);
        await conn.sendMessage(from, { react: { text: '❌', key: m.key } });
    }
});

// ============================================
// COMMAND: cartoon
// ============================================
cmd({
    pattern: "cartoon",
    alias: ["toon", "kids"],
    desc: "Download YouTube cartoon video",
    category: "download",
    react: "🧸",
    filename: __filename
}, async (conn, mek, m, { from, text, reply }) => {
    try {
        if (!text) return reply("🧸 Please provide a cartoon name!\n\nExample: `.cartoon Tom and Jerry`");

        const { default: yts } = await import('yt-search');

        let url = text;
        let vid = null;

        if (text.startsWith('http://') || text.startsWith('https://')) {
            if (!text.includes("youtube.com") && !text.includes("youtu.be")) {
                return reply("❌ Please provide a valid YouTube URL!");
            }
            const videoId = getVideoId(text);
            if (!videoId) return reply("❌ Invalid YouTube URL!");
            vid = await yts({ videoId: videoId });
        } else {
            const search = await yts(`${text} cartoon`);
            if (!search || !search.videos || !search.videos.length) {
                return reply("❌ No cartoon results found!");
            }
            vid = search.videos[0];
            url = vid.url;
        }

        if (!vid) return reply("❌ No results found!");

        await conn.sendMessage(from, {
            image: { url: vid.thumbnail },
            caption: `*🧸 CARTOON DOWNLOADER*\n\n🎞️ *Title:* ${vid.title}\n📺 *Channel:* ${vid.author?.name || 'Unknown'}\n🕒 *Duration:* ${vid.timestamp}\n\n*Status:* Downloading Cartoon...\n\n> Powered by ERFAN-MD`
        }, { quoted: mek });

        const data = await fetchVideoData(url);
        const ok = await sendVideo(conn, from, mek, data, {
            caption: `🧸 *${data.title || vid.title}*\n\n> Powered by ERFAN-MD`
        });

        if (!ok) return reply("❌ Failed to send cartoon! Try again later.");
        await conn.sendMessage(from, { react: { text: '✅', key: m.key } });

    } catch (e) {
        console.error("Error in .cartoon command:", e);
        reply(`❌ Error: ${e.message || 'Unknown error'}`);
        await conn.sendMessage(from, { react: { text: '❌', key: m.key } });
    }
});

// ============================================
// COMMAND: movie (as document)
// ============================================
cmd({
    pattern: "movie",
    alias: ["playmovie", "dlmovie"],
    desc: "Fast auto search with DP info and download full movie as document safely",
    category: "download",
    react: "🍿",
    filename: __filename
}, async (conn, mek, m, { from, text, reply }) => {
    try {
        if (!text) return reply("❌ *Please provide a movie name!*\n\nExample: `.movie DJ Ganesh Chaturthi`");

        if (text.startsWith('http://') || text.startsWith('https://')) {
            return reply("❌ URLs are not supported here.\nPlease send a movie *name* only.");
        }

        await conn.sendMessage(from, { react: { text: "⚡", key: mek.key } });

        const { default: yts } = await import('yt-search');
        const search = await yts(`${text} full movie`);
        if (!search || !search.videos || !search.videos.length) {
            return reply("❌ No results found!");
        }

        const vid = search.videos[0];

        await conn.sendMessage(from, {
            image: { url: vid.thumbnail },
            caption: `*╭┈───〔 ${toSmallCaps('Movie Downloader')} 〕┈───⊷*
*├▢ 🍿 Title:* ${vid.title}
*├▢ 📺 Channel:* ${vid.author?.name || 'Unknown'}
*├▢ ⏰ Duration:* ${vid.timestamp}
*├▢ 👀 Views:* ${vid.views?.toLocaleString() || 'N/A'}
*╰───────────────────⊷*
_⚡ Downloading as document..._

> Powered by ERFAN-MD`
        }, { quoted: mek });

        const data = await fetchVideoData(vid.url);
        const ok = await sendVideo(conn, from, mek, data, {
            asDocument: true,
            caption: `🍿 *${data.title || vid.title}*\n\n> Powered by ERFAN-MD`
        });

        if (!ok) return reply("❌ Failed to send movie! Try again later.");
        await conn.sendMessage(from, { react: { text: '✅', key: mek.key } });

    } catch (e) {
        console.error("Error in .movie command:", e);
        await reply(`❌ Error: ${e.message || 'Unknown error'}`);
        await conn.sendMessage(from, { react: { text: '❌', key: mek.key } });
    }
});

// ============================================
// COMMAND: yts (Search) — unchanged
// ============================================
cmd({
    pattern: "yts",
    alias: ["ytsearch", "searchyt"],
    use: '.yts ERFAN',
    react: "🔎",
    desc: "Search YouTube and get video details",
    category: "search",
    filename: __filename
},
async (conn, mek, m, { from, text, reply }) => {
    try {
        if (!text) return reply('*Please provide search words!*\n\nExample: .yts Alan Walker Faded');

        const { default: yts } = await import('yt-search');
        const search = await yts(text);

        if (!search.videos || !search.videos.length) {
            return reply('*No results found!*');
        }

        const results = search.videos.slice(0, 10);

        let mesaj = `*╭┈───〔 ${toSmallCaps('YouTube Search')} 〕┈───⊷*\n`;
        mesaj += `*├▢ 🔎 Query:* ${text}\n`;
        mesaj += `*├▢ 📊 Results:* ${search.videos.length}\n`;
        mesaj += `*╰───────────────────⊷*\n\n`;

        results.forEach((video, i) => {
            mesaj += `*${i + 1}. ${video.title}*\n`;
            mesaj += `*├▢ 🔗 URL:* ${video.url}\n`;
            mesaj += `*├▢ ⏱️ Duration:* ${video.timestamp}\n`;
            mesaj += `*├▢ 👀 Views:* ${video.views?.toLocaleString() || 'N/A'}\n`;
            mesaj += `*├▢ 👤 Channel:* ${video.author?.name || 'Unknown'}\n`;
            mesaj += `*╰───────────────────⊷*\n\n`;
        });

        mesaj += `*╭───⬡ ${toSmallCaps('Powered By')} ⬡ ───*\n`;
        mesaj += `*┋ ⬡ ${toSmallCaps('ERFAN-MD')}*\n`;
        mesaj += `*╰───────────────────⊷*`;

        await conn.sendMessage(from, { text: mesaj.trim() }, { quoted: mek });

    } catch (e) {
        console.error('Error in yts command:', e);
        reply(`*Error occurred while searching!*\n\`\`\`${e.message}\`\`\``);
    }
});
