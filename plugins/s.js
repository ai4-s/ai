// ERFAN MD
import { fileURLToPath } from 'url';
import { cmd } from '../command.js';
import axios from 'axios';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);

const AUDIO_API_BASE = "https://rimi-xi.vercel.app/api/ytmp3";
const VIDEO_API_BASE = "https://yts-7ih0.onrender.com/ytvideo";
const VIDEO_API_KEY = "ERFANYT_SECRET";

const toSmallCaps = (text) => {
    const map = {
        'a': 'ᴀ', 'b': 'ʙ', 'c': 'ᴄ', 'd': 'ᴅ', 'e': 'ᴇ',
        'f': 'ғ', 'g': 'ɢ', 'h': 'ʜ', 'i': 'ɪ', 'j': 'ᴊ',
        'k': 'ᴋ', 'l': 'ʟ', 'm': 'ᴍ', 'n': 'ɴ', 'o': 'ᴏ',
        'p': 'ᴘ', 'q': 'ǫ', 'r': 'ʀ', 's': 's', 't': 'ᴛ',
        'u': 'ᴜ', 'v': 'ᴠ', 'w': 'ᴡ', 'x': 'x', 'y': 'ʏ',
        'z': 'ᴢ'
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
// SMART VIDEO PICKER (skips promos/trailers)
// ============================================
function toSeconds(v) {
    if (typeof v?.duration?.seconds === 'number') return v.duration.seconds;
    if (typeof v?.seconds === 'number') return v.seconds;
    const ts = v?.timestamp || v?.duration?.timestamp;
    if (typeof ts === 'string' && ts.includes(':')) {
        const parts = ts.split(':').map(Number);
        if (parts.length === 2 && parts.every(n => !isNaN(n))) return parts[0] * 60 + parts[1];
        if (parts.length === 3 && parts.every(n => !isNaN(n))) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    return 0;
}

function rankVideos(videos, preferWords = []) {
    if (!Array.isArray(videos) || videos.length === 0) return [];
    const arr = videos.slice();
    const score = (v) => {
        let s = 0;
        const t = (v?.title || '').toLowerCase();
        if (/\b(promo|trailer|teaser|preview|first\s*look)\b/.test(t)) s -= 1000;
        const sec = toSeconds(v);
        if (sec > 0 && sec < 120) s -= 500;
        for (const w of preferWords) {
            if (t.includes(w.toLowerCase())) s += 800;
        }
        if (sec > 0) s += Math.min(sec / 60, 100);
        return s;
    };
    arr.sort((a, b) => score(b) - score(a));
    return arr;
}

// ============================================
// AUDIO API
// ============================================
const getAudioAPIs = (url) => [
    { url: `${AUDIO_API_BASE}?url=${encodeURIComponent(url)}`, timeout: 30000 }
];

// ============================================
// VIDEO API
// ============================================
async function getErfanVideoData(url) {
    const id = getVideoId(url);
    if (!id) throw new Error("Could not extract video ID from URL.");

    const attempts = [
        { url: `https://youtu.be/${id}`, q: "360p", encoded: false },
        { url: `https://youtu.be/${id}`, q: null, encoded: false },
        { url: `https://www.youtube.com/watch?v=${id}`, q: "360p", encoded: true }
    ];

    let lastError = null;

    for (let i = 0; i < attempts.length; i++) {
        const a = attempts[i];
        try {
            const urlParam = a.encoded ? encodeURIComponent(a.url) : a.url;
            let apiUrl = `${VIDEO_API_BASE}?url=${urlParam}&key=${VIDEO_API_KEY}`;
            if (a.q) apiUrl += `&quality=${a.q}`;

            const response = await axios.get(apiUrl, {
                timeout: 90000,
                headers: { "User-Agent": "Mozilla/5.0" },
                validateStatus: () => true
            });

            const body = response.data;
            const data = body?.data;
            const ok = body?.status === true || body?.status === "true";

            if (
                response.status === 200 &&
                ok &&
                data?.download &&
                typeof data.download === "string" &&
                data.download.startsWith("http")
            ) {
                return {
                    title: (data.title || "").toString().trim() || "YouTube Video",
                    author: data.author || "Unknown",
                    thumbnail: data.image || null,
                    format: data.format || "mp4",
                    download: data.download
                };
            }

            lastError = new Error(body?.message || body?.error || `HTTP ${response.status}`);
        } catch (e) {
            lastError = e;
        }
    }
    throw lastError || new Error("Video API failed.");
}

async function fetchVideoFromCandidates(candidates) {
    let lastError = null;
    for (let i = 0; i < candidates.length; i++) {
        try {
            return await getErfanVideoData(candidates[i].url);
        } catch (e) {
            lastError = e;
            console.log(`[FALLBACK] candidate ${i + 1} failed: ${e.message}`);
            if (i < candidates.length - 1) await new Promise(r => setTimeout(r, 600));
        }
    }
    throw lastError || new Error("All candidate videos failed.");
}

async function downloadToTemp(url, prefix) {
    const tempFile = path.join(os.tmpdir(), `${prefix}_${Date.now()}.mp4`);

    const res = await axios({
        method: 'GET',
        url,
        responseType: 'stream',
        timeout: 300000,
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Referer": "https://www.youtube.com/",
            "Accept": "*/*"
        },
        validateStatus: () => true
    });

    if (res.status !== 200) {
        try { res.data.destroy(); } catch {}
        throw new Error(`CDN download failed: HTTP ${res.status}`);
    }

    const writer = fs.createWriteStream(tempFile);
    res.data.pipe(writer);

    await new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
        res.data.on('error', reject);
    });

    const stats = fs.statSync(tempFile);
    if (stats.size < 10000) {
        try { fs.unlinkSync(tempFile); } catch {}
        throw new Error("Downloaded file is empty or too small.");
    }
    return tempFile;
}

// ============================================
// COMMAND: PLAY (AUDIO)
// ============================================
cmd({
    pattern: "play",
    alias: ["song", "music", "audio"],
    desc: "Download YouTube audio",
    category: "download",
    react: "🎧",
    filename: __filename
}, async (conn, mek, m, { from, text, reply }) => {
    try {
        if (!text) return reply("❌ Please provide song name\nExample: .play Shape of You");

        const { default: yts } = await import('yt-search');
        let url = text;
        let vid = null;

        if (text.startsWith('http://') || text.startsWith('https://')) {
            if (!text.includes("youtube.com") && !text.includes("youtu.be"))
                return reply("❌ Please provide a valid YouTube URL!");
            const videoId = getVideoId(text);
            if (!videoId) return reply("❌ Invalid YouTube URL!");
            vid = await yts({ videoId });
            url = text;
        } else {
            const search = await yts(text);
            if (!search || !search.videos || !search.videos.length)
                return reply("❌ No song found!");
            vid = search.videos[0];
            url = vid.url;
        }

        if (!vid) return reply("❌ No results found!");

        await conn.sendMessage(from, {
            image: { url: vid.thumbnail },
            caption: `- *AUDIO DOWNLOADER 🎧*
╭━━❐━⪼
┇๏ *Title* - ${vid.title}
┇๏ *Duration* - ${vid.timestamp}
┇๏ *Views* - ${vid.views?.toLocaleString() || 'N/A'}
┇๏ *Author* - ${vid.author?.name || 'Unknown'}
┇๏ *Status* - Downloading...
╰━━❑━⪼
> Powered by ERFAN-MD`
        }, { quoted: mek });

        let success = false;
        for (const api of getAudioAPIs(url)) {
            if (success) break;
            try {
                const response = await axios.get(api.url, { timeout: api.timeout });
                const audioUrl = response.data?.ok === true && response.data?.download
                    ? response.data.download : null;
                if (!audioUrl) continue;

                await conn.sendMessage(from, {
                    audio: { url: audioUrl },
                    mimetype: "audio/mpeg",
                    fileName: `${vid.title}.mp3`,
                    ptt: false
                }, { quoted: mek });
                success = true;
            } catch (e) {
                console.error(`⚠️ Audio failed:`, e.message);
            }
        }

        if (!success) return reply("❌ Audio download failed! Try again later.");
        await conn.sendMessage(from, { react: { text: '✅', key: m.key } });
    } catch (err) {
        console.error("❌ PLAY ERROR:", err);
        reply("❌ Error occurred! Please try again later!");
        await conn.sendMessage(from, { react: { text: '❌', key: m.key } });
    }
});

// ============================================
// COMMAND: VIDEOA
// ============================================
cmd({
    pattern: "videoa",
    alias: ["ytv", "ytmp4", "vd"],
    desc: "Download YouTube video using ERFAN-MD video API",
    category: "download",
    react: "📹",
    filename: __filename
}, async (conn, mek, m, { from, text, reply }) => {
    let tempFile = null;
    try {
        if (!text) return reply("🎥 Please provide a video name or YouTube link!\n\nExample: `.video Alone Marshmello`");

        const { default: yts } = await import("yt-search");
        let vid;
        let url = text.trim();
        let candidates;

        if (/^https?:\/\//i.test(url)) {
            if (!url.includes("youtube.com") && !url.includes("youtu.be"))
                return reply("❌ Please provide a valid YouTube URL!");
            const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?.*v=|shorts\/|embed\/|live\/))([a-zA-Z0-9_-]{11})/);
            if (!match) return reply("❌ Invalid YouTube URL!");
            vid = await yts({ videoId: match[1] });
            candidates = [{ url }];
        } else {
            const search = await yts(url);
            if (!search.videos?.length) return reply("❌ No video results found!");
            const ranked = rankVideos(search.videos, []);
            vid = ranked[0];
            candidates = ranked.slice(0, 3).map(v => ({ url: v.url }));
        }

        if (!vid) return reply("❌ No video results found!");

        const detailsCaption = `╭─────────────🎬
│ 🎥 *VIDEO DOWNLOADER*
│─────────────────────
│ 🎬 *Title:* ${vid.title}
│ 👤 *Author:* ${vid.author?.name || "Unknown"}
│ 👀 *Views:* ${vid.views?.toLocaleString() || "N/A"}
│ 🎞️ *Duration:* ${vid.timestamp || "N/A"}
│ 📥 *Status:* Preparing download...
╰─────────────🎬
🔗 *Powered By ERFAN-MD*`;

        await conn.sendMessage(from, { image: { url: vid.thumbnail }, caption: detailsCaption }, { quoted: mek });
        await conn.sendMessage(from, { react: { text: "⬇️", key: m.key } });

        const apiData = await fetchVideoFromCandidates(candidates);
        const title = apiData.title || vid.title;
        const safeTitle = title.replace(/[\\/:*?"<>|]/g, "_").slice(0, 180);

        tempFile = await downloadToTemp(apiData.download, "videoa");
        const sizeMB = fs.statSync(tempFile).size / (1024 * 1024);

        if (sizeMB > 60) {
            await conn.sendMessage(from, {
                document: { url: tempFile },
                mimetype: "video/mp4",
                fileName: `${safeTitle}.mp4`,
                caption: `🎬 *${title}*\n📦 ${sizeMB.toFixed(1)}MB (sent as document)\n\n> Powered by ERFAN-MD`
            }, { quoted: mek });
        } else {
            const buffer = fs.readFileSync(tempFile);
            await conn.sendMessage(from, {
                video: buffer,
                mimetype: "video/mp4",
                fileName: `${safeTitle}.mp4`,
                caption: `🎬 *${title}*\n\n> Powered by ERFAN-MD`
            }, { quoted: mek });
        }

        try { fs.unlinkSync(tempFile); } catch {}
        tempFile = null;
        await conn.sendMessage(from, { react: { text: "✅", key: m.key } });
    } catch (error) {
        try { if (tempFile && fs.existsSync(tempFile)) fs.unlinkSync(tempFile); } catch {}
        console.error("[VIDEO] Error:", error?.response?.data || error?.message || error);
        await conn.sendMessage(from, { react: { text: "❌", key: m.key } });
        return reply(
            error?.code === "ECONNABORTED"
                ? "❌ Video download timed out. Please try again."
                : `❌ Video download failed: ${error?.message || "Please try again later."}`
        );
    }
});

// ============================================
// COMMAND: SONG (INTERACTIVE)
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

        const { default: yts } = await import('yt-search');
        let vid = null;
        let url = text;

        if (text.startsWith('http://') || text.startsWith('https://')) {
            if (!text.includes("youtube.com") && !text.includes("youtu.be"))
                return reply("❌ Please provide a valid YouTube URL!");
            const videoId = getVideoId(text);
            if (!videoId) return reply("❌ Invalid YouTube URL!");
            vid = await yts({ videoId });
            url = text;
        } else {
            const search = await yts(text);
            if (!search || !search.videos || !search.videos.length)
                return reply("❌ No results found!");
            vid = search.videos[0];
            url = vid.url;
        }

        if (!vid) return reply("❌ No results found!");

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

            const cleanSelect = selected?.trim();
            if (!["1", "2", "3", "4"].includes(cleanSelect)) {
                return conn.sendMessage(from, {
                    text: `❌ *Invalid selection!*\nPlease reply with:\n1️⃣ for Audio (MP3)\n2️⃣ for Video (MP4)\n3️⃣ for Audio as Document\n4️⃣ for Video as Document`
                }, { quoted: received });
            }

            const type = cleanSelect === "1" || cleanSelect === "3" ? "mp3" : "mp4";
            const asDocument = cleanSelect === "3" || cleanSelect === "4";

            if (type === "mp3") {
                let success = false;
                for (const api of getAudioAPIs(url)) {
                    if (success) break;
                    try {
                        const response = await axios.get(api.url, { timeout: api.timeout });
                        const audioUrl = response.data?.ok === true && response.data?.download ? response.data.download : null;
                        if (!audioUrl) continue;

                        if (asDocument) {
                            await conn.sendMessage(from, {
                                document: { url: audioUrl },
                                mimetype: "audio/mpeg",
                                fileName: `${vid.title}.mp3`,
                                caption: `📄 *${vid.title}*\n🎧 Audio Document\n\n> Powered by ERFAN-MD`
                            }, { quoted: received });
                        } else {
                            await conn.sendMessage(from, {
                                audio: { url: audioUrl },
                                mimetype: "audio/mpeg",
                                fileName: `${vid.title}.mp3`,
                                ptt: false
                            }, { quoted: received });
                        }
                        success = true;
                    } catch (e) {
                        console.error("⚠️ Audio failed:", e.message);
                    }
                }
                if (!success) return conn.sendMessage(from, { text: "❌ Audio download failed! Try again later." }, { quoted: received });
            } else {
                let success = false;
                let tempFile = null;
                try {
                    const apiData = await getErfanVideoData(url);
                    const title = apiData.title || vid.title;

                    if (!asDocument) {
                        tempFile = await downloadToTemp(apiData.download, "song");
                        const sizeMB = fs.statSync(tempFile).size / (1024 * 1024);
                        if (sizeMB > 60) {
                            await conn.sendMessage(from, {
                                document: { url: tempFile },
                                mimetype: "video/mp4",
                                fileName: `${title.replace(/[\\/:*?"<>|]/g, "_").slice(0, 180)}.mp4`,
                                caption: `📄 *${title}*\n📦 ${sizeMB.toFixed(1)}MB (auto document)\n\n> Powered by ERFAN-MD`
                            }, { quoted: received });
                        } else {
                            const buffer = fs.readFileSync(tempFile);
                            await conn.sendMessage(from, {
                                video: buffer,
                                mimetype: "video/mp4",
                                fileName: `${title}.mp4`,
                                caption: `🎬 *${title}*\n\n> Powered by ERFAN-MD`
                            }, { quoted: received });
                        }
                    } else {
                        tempFile = await downloadToTemp(apiData.download, "song");
                        await conn.sendMessage(from, {
                            document: { url: tempFile },
                            mimetype: "video/mp4",
                            fileName: `${title.replace(/[\\/:*?"<>|]/g, "_").slice(0, 180)}.mp4`,
                            caption: `📄 *${title}*\n📹 Video Document\n\n> Powered by ERFAN-MD`
                        }, { quoted: received });
                    }
                    success = true;
                } catch (e) {
                    console.error("⚠️ Video failed:", e.message);
                } finally {
                    try { if (tempFile && fs.existsSync(tempFile)) fs.unlinkSync(tempFile); } catch {}
                    tempFile = null;
                }
                if (!success) return conn.sendMessage(from, { text: "❌ Video download failed! Try again later." }, { quoted: received });
            }
            await conn.sendMessage(from, { react: { text: '✅', key: received.key } });
        };

        conn.ev.on("messages.upsert", songListener);
        setTimeout(() => conn.ev.off("messages.upsert", songListener), 30000);
    } catch (e) {
        console.error(e);
        reply(`❌ Error: ${e.message}`);
        await conn.sendMessage(from, { react: { text: '❌', key: m.key } });
    }
});

// ============================================
// COMMAND: DRAMA - DIRECT DOCUMENT
// ============================================
cmd({
    pattern: "drama",
    alias: ["film", "series"],
    desc: "Download YouTube drama/movie video as document",
    category: "download",
    react: "🎬",
    filename: __filename
}, async (conn, mek, m, { from, text, reply }) => {
    let tempFile = null;
    try {
        if (!text) return reply("🎬 Please provide a drama/movie name or link.\n\nExample: `.drama Muskan 5`");

        const { default: yts } = await import('yt-search');
        let vid = null;
        let url = text.trim();
        let candidates;

        if (/^https?:\/\//i.test(url)) {
            if (!url.includes("youtube.com") && !url.includes("youtu.be"))
                return reply("❌ Please provide a valid YouTube URL!");
            const videoId = getVideoId(url);
            if (!videoId) return reply("❌ Invalid YouTube URL!");
            vid = await yts({ videoId });
            candidates = [{ url }];
        } else {
            const search = await yts(url);
            if (!search.videos?.length) return reply("❌ No results found!");
            const ranked = rankVideos(search.videos, ['episode', 'full', 'part']);
            vid = ranked[0];
            candidates = ranked.slice(0, 3).map(v => ({ url: v.url }));
        }

        if (!vid) return reply("❌ No results found!");

        await conn.sendMessage(from, {
            image: { url: vid.thumbnail },
            caption: `*╭┈───〔 ${toSmallCaps('Drama Downloader')} 〕┈───⊷*
*├▢ 🎬 Title:* ${vid.title}
*├▢ 📺 Channel:* ${vid.author?.name || 'Unknown'}
*├▢ ⏰ Duration:* ${vid.timestamp}
*├▢ 👀 Views:* ${vid.views?.toLocaleString() || 'N/A'}
*╰───────────────────⊷*
_⚡ Downloading as document..._

> Powered by ERFAN-MD`
        }, { quoted: mek });

        const apiData = await fetchVideoFromCandidates(candidates);
        const title = apiData.title || vid.title;

        tempFile = await downloadToTemp(apiData.download, "drama");
        const sizeMB = fs.statSync(tempFile).size / (1024 * 1024);

        await conn.sendMessage(from, {
            document: { url: tempFile },
            mimetype: "video/mp4",
            fileName: `${title.replace(/[\\/:*?"<>|]/g, "_").slice(0, 180)}.mp4`,
            caption: `🎬 *${title}*\n📦 ${sizeMB.toFixed(1)}MB\n\n> Powered by ERFAN-MD`
        }, { quoted: mek });

        try { fs.unlinkSync(tempFile); } catch {}
        tempFile = null;
        await conn.sendMessage(from, { react: { text: '✅', key: m.key } });
    } catch (e) {
        try { if (tempFile && fs.existsSync(tempFile)) fs.unlinkSync(tempFile); } catch {}
        console.error("Error in .drama command:", e);
        reply(`❌ Drama download failed: ${e?.message || "Please try again later."}`);
        await conn.sendMessage(from, { react: { text: '❌', key: m.key } });
    }
});

// ============================================
// COMMAND: CARTOON
// ============================================
cmd({
    pattern: "cartoon",
    alias: ["toon", "kids"],
    desc: "Download YouTube cartoon video",
    category: "download",
    react: "🧸",
    filename: __filename
}, async (conn, mek, m, { from, text, reply }) => {
    let tempFile = null;
    try {
        if (!text) return reply("🧸 Please provide a cartoon name!\n\nExample: `.cartoon Tom and Jerry`");

        const { default: yts } = await import('yt-search');
        let url = text;
        let vid = null;
        let candidates;

        if (text.startsWith('http://') || text.startsWith('https://')) {
            if (!text.includes("youtube.com") && !text.includes("youtu.be"))
                return reply("❌ Please provide a valid YouTube URL!");
            const videoId = getVideoId(text);
            if (!videoId) return reply("❌ Invalid YouTube URL!");
            vid = await yts({ videoId });
            candidates = [{ url: text }];
        } else {
            const search = await yts(`${text} cartoon`);
            if (!search.videos?.length) return reply("❌ No cartoon results found!");
            const ranked = rankVideos(search.videos, ['episode', 'full']);
            vid = ranked[0];
            candidates = ranked.slice(0, 3).map(v => ({ url: v.url }));
        }

        if (!vid) return reply("❌ No results found!");

        await conn.sendMessage(from, {
            image: { url: vid.thumbnail },
            caption: `*🧸 CARTOON DOWNLOADER*
🎞️ *Title:* ${vid.title}
📺 *Channel:* ${vid.author?.name || 'Unknown'}
🕒 *Duration:* ${vid.timestamp}

*Status:* Downloading Cartoon...

> Powered by ERFAN-MD`
        }, { quoted: mek });

        const apiData = await fetchVideoFromCandidates(candidates);
        const title = apiData.title || vid.title;

        tempFile = await downloadToTemp(apiData.download, "cartoon");
        const sizeMB = fs.statSync(tempFile).size / (1024 * 1024);

        if (sizeMB > 60) {
            await conn.sendMessage(from, {
                document: { url: tempFile },
                mimetype: "video/mp4",
                fileName: `${title.replace(/[\\/:*?"<>|]/g, "_").slice(0, 180)}.mp4`,
                caption: `🧸 *${title}*\n📦 ${sizeMB.toFixed(1)}MB\n\n> Powered by ERFAN-MD`
            }, { quoted: mek });
        } else {
            const buffer = fs.readFileSync(tempFile);
            await conn.sendMessage(from, {
                video: buffer,
                mimetype: "video/mp4",
                fileName: `${title}.mp4`,
                caption: `🧸 *${title}*\n\n> Powered by ERFAN-MD`
            }, { quoted: mek });
        }

        try { fs.unlinkSync(tempFile); } catch {}
        tempFile = null;
        await conn.sendMessage(from, { react: { text: '✅', key: m.key } });
    } catch (e) {
        try { if (tempFile && fs.existsSync(tempFile)) fs.unlinkSync(tempFile); } catch {}
        if (global.gc) global.gc();
        console.error("Error in .cartoon command:", e);
        reply(`❌ Cartoon download failed: ${e?.message || "Please try again later."}`);
        await conn.sendMessage(from, { react: { text: '❌', key: m.key } });
    }
});

// ============================================
// COMMAND: MOVIEA
// ============================================
cmd({
    pattern: "moviea",
    alias: ["playmovie", "dlmovie"],
    desc: "Search YouTube and download movie as document",
    category: "download",
    react: "🍿",
    filename: __filename
}, async (conn, mek, m, { from, text, reply }) => {
    let tempFile = null;
    try {
        if (!text) return reply("❌ *Please provide a movie name!*\n\nExample: `.movie DJ Ganesh Chaturthi`");
        if (text.startsWith('http://') || text.startsWith('https://'))
            return reply("❌ URLs are not supported here.\nPlease send a movie *name* only.");

        await conn.sendMessage(from, { react: { text: "⚡", key: mek.key } });

        const { default: yts } = await import('yt-search');
        const search = await yts(`${text} full movie`);
        if (!search?.videos?.length) return reply("❌ No results found!");

        const ranked = rankVideos(search.videos, ['full movie', 'full film']);
        const vid = ranked[0];
        const candidates = ranked.slice(0, 3).map(v => ({ url: v.url }));

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

        const apiData = await fetchVideoFromCandidates(candidates);
        const title = apiData.title || vid.title;

        tempFile = await downloadToTemp(apiData.download, "movie");
        const sizeMB = fs.statSync(tempFile).size / (1024 * 1024);

        await conn.sendMessage(from, {
            document: { url: tempFile },
            mimetype: "video/mp4",
            fileName: `${title.replace(/[\\/:*?"<>|]/g, "_").slice(0, 180)}.mp4`,
            caption: `🍿 *${title}*\n📦 ${sizeMB.toFixed(1)}MB\n\n> Powered by ERFAN-MD`
        }, { quoted: mek });

        try { fs.unlinkSync(tempFile); } catch {}
        if (global.gc) global.gc();
        tempFile = null;
        await conn.sendMessage(from, { react: { text: '✅', key: mek.key } });
    } catch (e) {
        try { if (tempFile && fs.existsSync(tempFile)) fs.unlinkSync(tempFile); } catch {}
        if (global.gc) global.gc();
        console.error("Error in .moviea command:", e);
        await reply(`❌ Movie download failed: ${e?.message || "Please try again later."}`);
        await conn.sendMessage(from, { react: { text: '❌', key: mek.key } });
    }
});

// ============================================
// COMMAND: YTS
// ============================================
cmd({
    pattern: "yts",
    alias: ["ytsearch", "searchyt"],
    use: '.yts ERFAN',
    react: "🔎",
    desc: "Search YouTube and get video details",
    category: "search",
    filename: __filename
}, async (conn, mek, m, { from, text, reply }) => {
    try {
        if (!text) return reply('*Please provide search words!*\n\nExample: .yts Alan Walker Faded');

        const { default: yts } = await import('yt-search');
        const search = await yts(text);
        if (!search.videos?.length) return reply('*No results found!*');

        const results = search.videos.slice(0, 10);
        let mesaj = `*╭┈───〔 ${toSmallCaps('YouTube Search')} 〕┈───⊷*
*├▢ 🔎 Query:* ${text}
*├▢ 📊 Results:* ${search.videos.length}
*╰───────────────────⊷*\n\n`;

        results.forEach((video, i) => {
            mesaj += `*${i + 1}. ${video.title}*
*├▢ 🔗 URL:* ${video.url}
*├▢ ⏱️ Duration:* ${video.timestamp}
*├▢ 👀 Views:* ${video.views?.toLocaleString() || 'N/A'}
*├▢ 👤 Channel:* ${video.author?.name || 'Unknown'}
*╰───────────────────⊷*\n\n`;
        });

        mesaj += `*╭───⬡ ${toSmallCaps('Powered By')} ⬡ ───*\n*┋ ⬡ ${toSmallCaps('ERFAN-MD')}*\n*╰───────────────────⊷*`;

        await conn.sendMessage(from, { text: mesaj.trim() }, { quoted: mek });
    } catch (e) {
        console.error('Error in yts command:', e);
        reply(`*Error occurred while searching!*\n\`\`\`${e.message}\`\`\``);
    }
});
