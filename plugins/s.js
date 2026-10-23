// ERFAN MD - YouTube downloader commands (Nexray API)
import { fileURLToPath } from 'url';
import { cmd } from '../command.js';
import axios from 'axios';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);

const NEXRAY = "https://api.nexray.eu.cc/downloader";
const API_TIMEOUT = 60000;

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
// API 1: ytplay  -> used ONLY by .play (search + download in one call)
// ============================================
async function apiYtPlay(query) {
    try {
        const res = await axios.get(`${NEXRAY}/ytplay`, { params: { q: query }, timeout: API_TIMEOUT });
        if (res.data?.status && res.data?.result?.download_url) return res.data.result;
    } catch (e) {
        console.error("⚠️ ytplay failed:", e.message);
    }
    return null;
}

// ============================================
// API 2: ytmp3 -> used by .song (audio options)
// ============================================
async function apiYtMp3(url) {
    try {
        const res = await axios.get(`${NEXRAY}/ytmp3`, { params: { url }, timeout: API_TIMEOUT });
        if (res.data?.status && res.data?.result?.url) return res.data.result.url;
    } catch (e) {
        console.error("⚠️ ytmp3 failed:", e.message);
    }
    return null;
}

// ============================================
// API 3: ytmp4 -> used by .video, .song (video options), .drama, .cartoon, .movie
// ============================================
async function apiYtMp4(url, quality = "360") {
    try {
        const res = await axios.get(`${NEXRAY}/v1/ytmp4`, { params: { url, resolusi: quality }, timeout: API_TIMEOUT });
        if (res.data?.status && res.data?.result?.url) return res.data.result.url;
    } catch (e) {
        console.error("⚠️ ytmp4 failed:", e.message);
    }
    return null;
}

// ---- Download remote file to temp (stream), then caller sends it ----
async function downloadToTemp(link, ext) {
    const tempFile = path.join(os.tmpdir(), `erfan_${Date.now()}_${Math.floor(Math.random() * 1e5)}.${ext}`);
    try {
        const res = await axios({
            method: 'GET',
            url: link,
            responseType: 'stream',
            timeout: 0,
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36' }
        });
        const writer = fs.createWriteStream(tempFile);
        res.data.pipe(writer);
        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
            res.data.on('error', reject);
        });
        return tempFile;
    } catch (e) {
        cleanup(tempFile);
        throw e;
    }
}

function cleanup(file) {
    try { if (file && fs.existsSync(file)) fs.unlinkSync(file); } catch {}
    if (global.gc) global.gc();
}

// ---- Search with yt-search package (used by song/video/drama/cartoon/movie) ----
async function resolveVideo(text, suffix = '') {
    const { default: yts } = await import('yt-search');
    if (text.startsWith('http://') || text.startsWith('https://')) {
        if (!text.includes("youtube.com") && !text.includes("youtu.be")) return { error: "❌ Please provide a valid YouTube URL!" };
        const videoId = getVideoId(text);
        if (!videoId) return { error: "❌ Invalid YouTube URL!" };
        const vid = await yts({ videoId });
        return vid ? { vid } : { error: "❌ No results found!" };
    }
    const search = await yts(suffix ? `${text} ${suffix}` : text);
    if (!search?.videos?.length) return { error: "❌ No results found!" };
    return { vid: search.videos[0] };
}

// ---- Send helpers (download to temp -> send -> delete) ----
async function sendAudioFile(conn, from, quoted, link, title, asDocument = false) {
    let tempFile = null;
    try {
        tempFile = await downloadToTemp(link, 'mp3');
        if (asDocument) {
            await conn.sendMessage(from, {
                document: { url: tempFile },
                mimetype: "audio/mpeg",
                fileName: `${title}.mp3`,
                caption: `📄 *${title}*\n🎧 Audio Document\n\n> Powered by ERFAN-MD`
            }, { quoted });
        } else {
            await conn.sendMessage(from, {
                audio: { url: tempFile },
                mimetype: "audio/mpeg",
                fileName: `${title}.mp3`,
                ptt: false
            }, { quoted });
        }
        return true;
    } catch (e) {
        console.error("⚠️ Audio send failed:", e.message);
        return false;
    } finally {
        cleanup(tempFile);
    }
}

async function sendVideoFile(conn, from, quoted, link, title, { asDocument = false, emoji = '🎬' } = {}) {
    let tempFile = null;
    try {
        tempFile = await downloadToTemp(link, 'mp4');
        if (asDocument) {
            await conn.sendMessage(from, {
                document: { url: tempFile },
                mimetype: "video/mp4",
                fileName: `${title}.mp4`,
                caption: `📄 *${title}*\n📹 Video Document\n\n> Powered by ERFAN-MD`
            }, { quoted });
        } else {
            await conn.sendMessage(from, {
                video: { url: tempFile },
                caption: `${emoji} *${title}*\n\n> Powered by ERFAN-MD`
            }, { quoted });
        }
        return true;
    } catch (e) {
        console.error("⚠️ Video send failed:", e.message);
        return false;
    } finally {
        cleanup(tempFile);
    }
}

// ============================================
// COMMAND: play  (NO yt-search package)
// .play <query> -> ytplay API searches + gives MP3 -> download -> send
// ============================================
cmd({
    pattern: "play",
    alias: ["audio", "mmm"],
    desc: "Search and download a song directly",
    category: "download",
    react: "🎧",
    filename: __filename
}, async (conn, mek, m, { from, text, reply }) => {
    try {
        if (!text) return reply("❌ Please provide a song name\nExample: .play Shape of You");

        const data = await apiYtPlay(text);
        if (!data) return reply("❌ Song not found or API failed! Try again later.");

        await conn.sendMessage(from, {
            image: { url: data.thumbnail },
            caption: `- *AUDIO DOWNLOADER 🎧*\n╭━━❐━⪼\n┇๏ *Title* - ${data.title}\n┇๏ *Duration* - ${data.duration || 'N/A'}\n┇๏ *Views* - ${data.views || 'N/A'}\n┇๏ *Author* - ${data.channel || 'Unknown'}\n┇๏ *Status* - Downloading...\n╰━━❑━⪼\n> Powered by ERFAN-MD`
        }, { quoted: mek });

        const ok = await sendAudioFile(conn, from, mek, data.download_url, data.title);
        if (!ok) return reply("❌ Download failed! Try again later.");
        await conn.sendMessage(from, { react: { text: '✅', key: m.key } });

    } catch (err) {
        console.error("❌ PLAY ERROR:", err);
        reply("❌ An error occurred! Please try again later.");
        await conn.sendMessage(from, { react: { text: '❌', key: m.key } });
    }
});

// ============================================
// COMMAND: video  (yt-search package -> ytmp4 API)
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

        const { vid, error } = await resolveVideo(text);
        if (error) return reply(error);

        await conn.sendMessage(from, {
            image: { url: vid.thumbnail },
            caption: `*🎬 VIDEO DOWNLOADER*\n\n🎞️ *Title:* ${vid.title}\n📺 *Channel:* ${vid.author?.name || 'Unknown'}\n🕒 *Duration:* ${vid.timestamp}\n\n*Status:* Downloading Video...\n\n> Powered by ERFAN-MD`
        }, { quoted: mek });

        const link = await apiYtMp4(vid.url);
        if (!link) return reply("❌ Video API failed! Try again later.");

        const ok = await sendVideoFile(conn, from, mek, link, vid.title, { emoji: '🎬' });
        if (!ok) return reply("❌ Download failed! Try again later.");
        await conn.sendMessage(from, { react: { text: '✅', key: m.key } });

    } catch (e) {
        console.error("Error in .video command:", e);
        reply("❌ An error occurred, please try again later!");
        await conn.sendMessage(from, { react: { text: '❌', key: m.key } });
    }
});

// ============================================
// COMMAND: song  (yt-search package -> ytmp3 API for audio, ytmp4 for video options)
// ============================================
cmd({
    pattern: "song",
    alias: ["yt", "music", "ytdl"],
    desc: "Download YouTube song or video (interactive)",
    category: "download",
    react: "🎧",
    filename: __filename
}, async (conn, mek, m, { from, text, reply }) => {
    try {
        if (!text) return reply("🎶 Please provide a YouTube video name or link.\n\nExample: `.song Alone - Alan Walker`");

        const { vid, error } = await resolveVideo(text);
        if (error) return reply(error);

        const caption = `*╭┈───〔 ${toSmallCaps('YT Downloader')} 〕┈───⊷*
*├▢ 🎬 Title:* ${vid.title}
*├▢ 📺 Channel:* ${vid.author?.name || 'Unknown'}
*├▢ ⏰ Duration:* ${vid.timestamp}
*├▢ 👀 Views:* ${vid.views?.toLocaleString() || 'N/A'}
*╰───────────────────⊷*
*╭───⬡ ${toSmallCaps('Select Format')} ⬡───*
*┋ ⬡ 1* 🎧 ${toSmallCaps('Audio (MP3)')}
*┋ ⬡ 2* 📹 ${toSmallCaps('Video (MP4)')}
*┋ ⬡ 3* 📄 ${toSmallCaps('Audio as Document')}
*┋ ⬡ 4* 📄 ${toSmallCaps('Video as Document')}
*╰───────────────────⊷*

> Powered by ERFAN-MD`;

        const sent = await conn.sendMessage(from, { image: { url: vid.thumbnail }, caption }, { quoted: mek });
        const msgId = sent.key.id;

        const songListener = async (msgData) => {
            const received = msgData.messages[0];
            if (!received.message) return;

            const selected = received.message.conversation || received.message.extendedTextMessage?.text;
            const replyToBot = received.message.extendedTextMessage?.contextInfo?.stanzaId === msgId;
            if (!replyToBot) return;

            conn.ev.off("messages.upsert", songListener);
            await conn.sendMessage(from, { react: { text: '⬇️', key: received.key } });

            const choice = selected?.trim();
            if (!["1", "2", "3", "4"].includes(choice)) {
                return await conn.sendMessage(from, {
                    text: `❌ *Invalid selection!*\nPlease reply with:\n1️⃣ for Audio (MP3)\n2️⃣ for Video (MP4)\n3️⃣ for Audio as Document\n4️⃣ for Video as Document`
                }, { quoted: received });
            }

            const isAudio = choice === "1" || choice === "3";
            const asDocument = choice === "3" || choice === "4";

            const link = isAudio ? await apiYtMp3(vid.url) : await apiYtMp4(vid.url);
            if (!link) {
                return await conn.sendMessage(from, { text: "❌ API failed! Try again later." }, { quoted: received });
            }

            const ok = isAudio
                ? await sendAudioFile(conn, from, received, link, vid.title, asDocument)
                : await sendVideoFile(conn, from, received, link, vid.title, { asDocument });

            if (!ok) {
                return await conn.sendMessage(from, { text: "❌ Download failed! Try again later." }, { quoted: received });
            }
            await conn.sendMessage(from, { react: { text: '✅', key: received.key } });
        };

        conn.ev.on("messages.upsert", songListener);
        setTimeout(() => { conn.ev.off("messages.upsert", songListener); }, 30000);

    } catch (e) {
        console.error(e);
        reply(`❌ Error: ${e.message}`);
        await conn.sendMessage(from, { react: { text: '❌', key: m.key } });
    }
});

// ============================================
// COMMAND: drama  (yt-search package -> ytmp4 API)
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

        const { vid, error } = await resolveVideo(text);
        if (error) return reply(error);

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
            if (!replyToBot) return;

            conn.ev.off("messages.upsert", dramaListener);
            await conn.sendMessage(from, { react: { text: '⬇️', key: received.key } });

            const choice = selected?.trim();
            if (choice !== "1" && choice !== "2") {
                return await conn.sendMessage(from, {
                    text: `❌ *Invalid selection!*\nPlease reply with:\n1️⃣ for Video (MP4)\n2️⃣ for Video as Document`
                }, { quoted: received });
            }

            const link = await apiYtMp4(vid.url);
            if (!link) {
                return await conn.sendMessage(from, { text: "❌ Video API failed! Try again later." }, { quoted: received });
            }

            const ok = await sendVideoFile(conn, from, received, link, vid.title, { asDocument: choice === "2" });
            if (!ok) {
                return await conn.sendMessage(from, { text: "❌ Download failed! Try again later." }, { quoted: received });
            }
            await conn.sendMessage(from, { react: { text: '✅', key: received.key } });
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
// COMMAND: cartoon  (yt-search package -> ytmp4 API)
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

        const { vid, error } = await resolveVideo(text, 'cartoon');
        if (error) return reply(error);

        await conn.sendMessage(from, {
            image: { url: vid.thumbnail },
            caption: `*🧸 CARTOON DOWNLOADER*\n\n🎞️ *Title:* ${vid.title}\n📺 *Channel:* ${vid.author?.name || 'Unknown'}\n🕒 *Duration:* ${vid.timestamp}\n\n*Status:* Downloading Cartoon...\n\n> Powered by ERFAN-MD`
        }, { quoted: mek });

        const link = await apiYtMp4(vid.url);
        if (!link) return reply("❌ Video API failed! Try again later.");

        const ok = await sendVideoFile(conn, from, mek, link, vid.title, { emoji: '🧸' });
        if (!ok) return reply("❌ Download failed! Try again later.");
        await conn.sendMessage(from, { react: { text: '✅', key: m.key } });

    } catch (e) {
        console.error("Error in .cartoon command:", e);
        reply("❌ An error occurred, please try again later!");
        await conn.sendMessage(from, { react: { text: '❌', key: m.key } });
    }
});

// ============================================
// COMMAND: movie  (yt-search package -> ytmp4 API, sent as document)
// ============================================
cmd({
    pattern: "movie",
    alias: ["playmovie", "dlmovie"],
    desc: "Search a full movie on YouTube and download it as a document",
    category: "download",
    react: "🍿",
    filename: __filename
}, async (conn, mek, m, { from, text, reply }) => {
    try {
        if (!text) {
            return reply("❌ *Please provide a movie name!*\n\nExample: `.movie DJ Ganesh Chaturthi`");
        }
        if (text.startsWith('http://') || text.startsWith('https://')) {
            return reply("❌ URLs are not supported here.\nPlease send a movie *name* only.");
        }

        await conn.sendMessage(from, { react: { text: "⚡", key: mek.key } });

        const { vid, error } = await resolveVideo(text, 'full movie');
        if (error) return reply(error);

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

        const link = await apiYtMp4(vid.url);
        if (!link) return reply("❌ Video API failed! Try again later.");

        const ok = await sendVideoFile(conn, from, mek, link, vid.title, { asDocument: true });
        if (!ok) return reply("❌ Failed to get the movie! Try again later.");
        await conn.sendMessage(from, { react: { text: '✅', key: mek.key } });

    } catch (e) {
        await reply("❌ Error: " + (e?.message || e));
        await conn.sendMessage(from, { react: { text: '❌', key: mek.key } });
    }
});

// ============================================
// COMMAND: yts (Search)
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
