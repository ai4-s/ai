// ERFAN MD - YouTube commands (Nexray API)
import { fileURLToPath } from 'url';
import { cmd } from '../command.js';
import axios from 'axios';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);

// ============================================
// COMMAND: play  (ytplay API: search + download in one API)
// ============================================
cmd({
    pattern: "play",
    alias: ["audio", "mp3"],
    desc: "Search and download a song",
    category: "download",
    react: "🎧",
    filename: __filename
}, async (conn, mek, m, { from, text, reply }) => {
    let tempFile = null;
    try {
        if (!text) return reply("❌ Please provide a song name\nExample: .play Shape of You");

        const apiUrl = `https://api.nexray.eu.cc/downloader/ytplay?q=${encodeURIComponent(text)}`;

        const response = await axios.get(apiUrl, { timeout: 60000 });

        if (!response.data?.status || !response.data?.result?.download_url) {
            return reply("❌ Song not found or API failed! Try again later.");
        }

        const data = response.data.result;

        await conn.sendMessage(from, {
            image: { url: data.thumbnail },
            caption: `- *AUDIO DOWNLOADER 🎧*\n╭━━❐━⪼\n┇๏ *Title* - ${data.title}\n┇๏ *Duration* - ${data.duration || 'N/A'}\n┇๏ *Views* - ${data.views || 'N/A'}\n┇๏ *Author* - ${data.channel || 'Unknown'}\n┇๏ *Status* - Downloading...\n╰━━❑━⪼\n> Powered by ERFAN-MD`
        }, { quoted: mek });

        tempFile = path.join(os.tmpdir(), `play_${Date.now()}.mp3`);

        const fileRes = await axios({
            method: 'GET',
            url: data.download_url,
            responseType: 'stream',
            timeout: 0
        });

        const writer = fs.createWriteStream(tempFile);
        fileRes.data.pipe(writer);

        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
            fileRes.data.on('error', reject);
        });

        await conn.sendMessage(from, {
            audio: { url: tempFile },
            mimetype: "audio/mpeg",
            fileName: `${data.title}.mp3`,
            ptt: false
        }, { quoted: mek });

        try { if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile); } catch {}
        if (global.gc) global.gc();
        tempFile = null;

        await conn.sendMessage(from, { react: { text: '✅', key: m.key } });

    } catch (e) {
        try { if (tempFile && fs.existsSync(tempFile)) fs.unlinkSync(tempFile); } catch {}
        if (global.gc) global.gc();
        console.error("❌ PLAY ERROR:", e);
        reply("❌ An error occurred! Please try again later.");
        await conn.sendMessage(from, { react: { text: '❌', key: m.key } });
    }
});

// ============================================
// COMMAND: song  (ytplay API: search + download in one API)
// ============================================
cmd({
    pattern: "song",
    alias: ["yt", "music", "ytdl"],
    desc: "Search and download a song",
    category: "download",
    react: "🎶",
    filename: __filename
}, async (conn, mek, m, { from, text, reply }) => {
    let tempFile = null;
    try {
        if (!text) return reply("🎶 Please provide a song name.\n\nExample: `.song Alone - Alan Walker`");

        const apiUrl = `https://api.nexray.eu.cc/downloader/ytplay?q=${encodeURIComponent(text)}`;

        const response = await axios.get(apiUrl, { timeout: 60000 });

        if (!response.data?.status || !response.data?.result?.download_url) {
            return reply("❌ Song not found or API failed! Try again later.");
        }

        const data = response.data.result;

        await conn.sendMessage(from, {
            image: { url: data.thumbnail },
            caption: `*🎶 SONG DOWNLOADER*\n\n🎵 *Title:* ${data.title}\n📺 *Channel:* ${data.channel || 'Unknown'}\n🕒 *Duration:* ${data.duration || 'N/A'}\n👀 *Views:* ${data.views || 'N/A'}\n\n*Status:* Downloading...\n\n> Powered by ERFAN-MD`
        }, { quoted: mek });

        tempFile = path.join(os.tmpdir(), `song_${Date.now()}.mp3`);

        const fileRes = await axios({
            method: 'GET',
            url: data.download_url,
            responseType: 'stream',
            timeout: 0
        });

        const writer = fs.createWriteStream(tempFile);
        fileRes.data.pipe(writer);

        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
            fileRes.data.on('error', reject);
        });

        await conn.sendMessage(from, {
            audio: { url: tempFile },
            mimetype: "audio/mpeg",
            fileName: `${data.title}.mp3`,
            ptt: false
        }, { quoted: mek });

        try { if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile); } catch {}
        if (global.gc) global.gc();
        tempFile = null;

        await conn.sendMessage(from, { react: { text: '✅', key: m.key } });

    } catch (e) {
        try { if (tempFile && fs.existsSync(tempFile)) fs.unlinkSync(tempFile); } catch {}
        if (global.gc) global.gc();
        console.error("❌ SONG ERROR:", e);
        reply("❌ An error occurred! Please try again later.");
        await conn.sendMessage(from, { react: { text: '❌', key: m.key } });
    }
});

// ============================================
// COMMAND: video  (yt-search finds the video -> ytmp4 API downloads it)
// ============================================
cmd({
    pattern: "video",
    alias: ["ytv", "ytmp4", "vd"],
    desc: "Download YouTube video",
    category: "download",
    react: "📹",
    filename: __filename
}, async (conn, mek, m, { from, text, reply }) => {
    let tempFile = null;
    try {
        if (!text) return reply("🎥 Please provide a video name or link!\n\nExample: `.video Alone Marshmello`");

        const { default: yts } = await import('yt-search');

        let vid = null;

        if (text.startsWith('http://') || text.startsWith('https://')) {
            if (!text.includes("youtube.com") && !text.includes("youtu.be")) {
                return reply("❌ Please provide a valid YouTube URL!");
            }
            const idMatch = text.match(/(?:v=|youtu\.be\/|embed\/|shorts\/|live\/|\/v\/)([a-zA-Z0-9_-]{11})/);
            if (!idMatch) return reply("❌ Invalid YouTube URL!");
            vid = await yts({ videoId: idMatch[1] });
        } else {
            const search = await yts(text);
            if (!search || !search.videos || !search.videos.length) {
                return reply("❌ No video results found!");
            }
            vid = search.videos[0];
        }

        if (!vid) return reply("❌ No results found!");

        await conn.sendMessage(from, {
            image: { url: vid.thumbnail },
            caption: `*🎬 VIDEO DOWNLOADER*\n\n🎞️ *Title:* ${vid.title}\n📺 *Channel:* ${vid.author?.name || 'Unknown'}\n🕒 *Duration:* ${vid.timestamp}\n\n*Status:* Downloading Video...\n\n> Powered by ERFAN-MD`
        }, { quoted: mek });

        const apiUrl = `https://api.nexray.eu.cc/downloader/v1/ytmp4?url=${encodeURIComponent(vid.url)}&resolusi=360`;

        const response = await axios.get(apiUrl, { timeout: 60000 });

        if (!response.data?.status || !response.data?.result?.url) {
            return reply("❌ Video API failed! Try again later.");
        }

        const videoUrl = response.data.result.url;

        tempFile = path.join(os.tmpdir(), `video_${Date.now()}.mp4`);

        const fileRes = await axios({
            method: 'GET',
            url: videoUrl,
            responseType: 'stream',
            timeout: 0
        });

        const writer = fs.createWriteStream(tempFile);
        fileRes.data.pipe(writer);

        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
            fileRes.data.on('error', reject);
        });

        await conn.sendMessage(from, {
            video: { url: tempFile },
            caption: `🎬 *${vid.title}*\n\n> Powered by ERFAN-MD`
        }, { quoted: mek });

        try { if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile); } catch {}
        if (global.gc) global.gc();
        tempFile = null;

        await conn.sendMessage(from, { react: { text: '✅', key: m.key } });

    } catch (e) {
        try { if (tempFile && fs.existsSync(tempFile)) fs.unlinkSync(tempFile); } catch {}
        if (global.gc) global.gc();
        console.error("Error in .video command:", e);
        reply("❌ An error occurred, please try again later!");
        await conn.sendMessage(from, { react: { text: '❌', key: m.key } });
    }
});

// ============================================
// COMMAND: cartoon  (yt-search finds the video -> ytmp4 API downloads it)
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

        let vid = null;

        if (text.startsWith('http://') || text.startsWith('https://')) {
            if (!text.includes("youtube.com") && !text.includes("youtu.be")) {
                return reply("❌ Please provide a valid YouTube URL!");
            }
            const idMatch = text.match(/(?:v=|youtu\.be\/|embed\/|shorts\/|live\/|\/v\/)([a-zA-Z0-9_-]{11})/);
            if (!idMatch) return reply("❌ Invalid YouTube URL!");
            vid = await yts({ videoId: idMatch[1] });
        } else {
            const search = await yts(`${text} cartoon`);
            if (!search || !search.videos || !search.videos.length) {
                return reply("❌ No cartoon results found!");
            }
            vid = search.videos[0];
        }

        if (!vid) return reply("❌ No results found!");

        await conn.sendMessage(from, {
            image: { url: vid.thumbnail },
            caption: `*🧸 CARTOON DOWNLOADER*\n\n🎞️ *Title:* ${vid.title}\n📺 *Channel:* ${vid.author?.name || 'Unknown'}\n🕒 *Duration:* ${vid.timestamp}\n\n*Status:* Downloading Cartoon...\n\n> Powered by ERFAN-MD`
        }, { quoted: mek });

        const apiUrl = `https://api.nexray.eu.cc/downloader/v1/ytmp4?url=${encodeURIComponent(vid.url)}&resolusi=360`;

        const response = await axios.get(apiUrl, { timeout: 60000 });

        if (!response.data?.status || !response.data?.result?.url) {
            return reply("❌ Video API failed! Try again later.");
        }

        const videoUrl = response.data.result.url;

        tempFile = path.join(os.tmpdir(), `cartoon_${Date.now()}.mp4`);

        const fileRes = await axios({
            method: 'GET',
            url: videoUrl,
            responseType: 'stream',
            timeout: 0
        });

        const writer = fs.createWriteStream(tempFile);
        fileRes.data.pipe(writer);

        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
            fileRes.data.on('error', reject);
        });

        await conn.sendMessage(from, {
            video: { url: tempFile },
            caption: `🧸 *${vid.title}*\n\n> Powered by ERFAN-MD`
        }, { quoted: mek });

        try { if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile); } catch {}
        if (global.gc) global.gc();
        tempFile = null;

        await conn.sendMessage(from, { react: { text: '✅', key: m.key } });

    } catch (e) {
        try { if (tempFile && fs.existsSync(tempFile)) fs.unlinkSync(tempFile); } catch {}
        if (global.gc) global.gc();
        console.error("Error in .cartoon command:", e);
        reply("❌ An error occurred, please try again later!");
        await conn.sendMessage(from, { react: { text: '❌', key: m.key } });
    }
});

// ============================================
// COMMAND: drama  (yt-search finds the video -> ytmp4 API downloads it)
// ============================================
cmd({
    pattern: "drama",
    alias: ["film", "series"],
    desc: "Download YouTube drama video",
    category: "download",
    react: "🎬",
    filename: __filename
}, async (conn, mek, m, { from, text, reply }) => {
    let tempFile = null;
    try {
        if (!text) return reply("🎬 Please provide a drama name or link.\n\nExample: `.drama Muskan 5`");

        const { default: yts } = await import('yt-search');

        let vid = null;

        if (text.startsWith('http://') || text.startsWith('https://')) {
            if (!text.includes("youtube.com") && !text.includes("youtu.be")) {
                return reply("❌ Please provide a valid YouTube URL!");
            }
            const idMatch = text.match(/(?:v=|youtu\.be\/|embed\/|shorts\/|live\/|\/v\/)([a-zA-Z0-9_-]{11})/);
            if (!idMatch) return reply("❌ Invalid YouTube URL!");
            vid = await yts({ videoId: idMatch[1] });
        } else {
            const search = await yts(text);
            if (!search || !search.videos || !search.videos.length) {
                return reply("❌ No results found!");
            }
            vid = search.videos[0];
        }

        if (!vid) return reply("❌ No results found!");

        await conn.sendMessage(from, {
            image: { url: vid.thumbnail },
            caption: `*🎬 DRAMA DOWNLOADER*\n\n🎞️ *Title:* ${vid.title}\n📺 *Channel:* ${vid.author?.name || 'Unknown'}\n🕒 *Duration:* ${vid.timestamp}\n👀 *Views:* ${vid.views?.toLocaleString() || 'N/A'}\n\n*Status:* Downloading Drama...\n\n> Powered by ERFAN-MD`
        }, { quoted: mek });

        const apiUrl = `https://api.nexray.eu.cc/downloader/v1/ytmp4?url=${encodeURIComponent(vid.url)}&resolusi=360`;

        const response = await axios.get(apiUrl, { timeout: 60000 });

        if (!response.data?.status || !response.data?.result?.url) {
            return reply("❌ Video API failed! Try again later.");
        }

        const videoUrl = response.data.result.url;

        tempFile = path.join(os.tmpdir(), `drama_${Date.now()}.mp4`);

        const fileRes = await axios({
            method: 'GET',
            url: videoUrl,
            responseType: 'stream',
            timeout: 0
        });

        const writer = fs.createWriteStream(tempFile);
        fileRes.data.pipe(writer);

        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
            fileRes.data.on('error', reject);
        });

        await conn.sendMessage(from, {
            video: { url: tempFile },
            caption: `🎬 *${vid.title}*\n\n> Powered by ERFAN-MD`
        }, { quoted: mek });

        try { if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile); } catch {}
        if (global.gc) global.gc();
        tempFile = null;

        await conn.sendMessage(from, { react: { text: '✅', key: m.key } });

    } catch (e) {
        try { if (tempFile && fs.existsSync(tempFile)) fs.unlinkSync(tempFile); } catch {}
        if (global.gc) global.gc();
        console.error("Error in .drama command:", e);
        reply("❌ An error occurred, please try again later!");
        await conn.sendMessage(from, { react: { text: '❌', key: m.key } });
    }
});

// ============================================
// COMMAND: movie  (yt-search finds the video -> ytmp4 API downloads it, sent as document)
// ============================================
cmd({
    pattern: "movie",
    alias: ["playmovie", "dlmovie"],
    desc: "Search a full movie on YouTube and download it as a document",
    category: "download",
    react: "🍿",
    filename: __filename
}, async (conn, mek, m, { from, text, reply }) => {
    let tempFile = null;
    try {
        if (!text) {
            return reply("❌ *Please provide a movie name!*\n\nExample: `.movie DJ Ganesh Chaturthi`");
        }

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
            caption: `*🍿 MOVIE DOWNLOADER*\n\n🎞️ *Title:* ${vid.title}\n📺 *Channel:* ${vid.author?.name || 'Unknown'}\n🕒 *Duration:* ${vid.timestamp}\n👀 *Views:* ${vid.views?.toLocaleString() || 'N/A'}\n\n_⚡ Downloading as document..._\n\n> Powered by ERFAN-MD`
        }, { quoted: mek });

        const apiUrl = `https://api.nexray.eu.cc/downloader/v1/ytmp4?url=${encodeURIComponent(vid.url)}&resolusi=360`;

        const response = await axios.get(apiUrl, { timeout: 60000 });

        if (!response.data?.status || !response.data?.result?.url) {
            return reply("❌ Video API failed! Try again later.");
        }

        const videoUrl = response.data.result.url;

        tempFile = path.join(os.tmpdir(), `movie_${Date.now()}.mp4`);

        const fileRes = await axios({
            method: 'GET',
            url: videoUrl,
            responseType: 'stream',
            timeout: 0
        });

        const writer = fs.createWriteStream(tempFile);
        fileRes.data.pipe(writer);

        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
            fileRes.data.on('error', reject);
        });

        await conn.sendMessage(from, {
            document: { url: tempFile },
            mimetype: "video/mp4",
            fileName: `${vid.title}.mp4`,
            caption: `🍿 *${vid.title}*\n\n> Powered by ERFAN-MD`
        }, { quoted: mek });

        try { if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile); } catch {}
        if (global.gc) global.gc();
        tempFile = null;

        await conn.sendMessage(from, { react: { text: '✅', key: mek.key } });

    } catch (e) {
        try { if (tempFile && fs.existsSync(tempFile)) fs.unlinkSync(tempFile); } catch {}
        if (global.gc) global.gc();
        console.error("Error in .movie command:", e);
        await reply("❌ Error: " + (e?.message || e));
        await conn.sendMessage(from, { react: { text: '❌', key: mek.key } });
    }
});
