// ERFAN MD - Fixed (search + rimi-xi API + send)
import { fileURLToPath } from 'url';
import { cmd } from '../command.js';
import axios from 'axios';

const __filename = fileURLToPath(import.meta.url);
const API_BASE = "https://rimi-xi.vercel.app/api";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ───────── search helper ─────────
async function searchYouTube(query) {
    const { default: yts } = await import('yt-search');
    const search = await yts(query);
    const r = search.videos?.[0];
    if (!r) return null;
    return {
        videoId: r.videoId,
        title: r.title,
        author: r.author?.name || 'Unknown',
        timestamp: r.timestamp || 'N/A',
        views: r.views ? r.views.toLocaleString('en-US') : 'N/A',
        thumbnail: r.thumbnail
    };
}

// link se videoId nikaalna
function getVideoId(text) {
    const m = text.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|music\.youtube\.com\/watch\?(?:.*&)?v=)([\w-]{11})/i);
    return m ? m[1] : null;
}

// ───────── API helper (3 retries) ─────────
// IMPORTANT: API ko sirf clean https://youtu.be/{id} chahiye, koi ?si= nahi
async function callApi(endpoint, videoId, retries = 3) {
    const cleanUrl = `https://youtu.be/${videoId}`;
    const apiUrl = `${API_BASE}/${endpoint}?url=${encodeURIComponent(cleanUrl)}`;
    console.log(`[${endpoint}] ->`, apiUrl);

    let lastErr;
    for (let i = 1; i <= retries; i++) {
        try {
            const res = await axios.get(apiUrl, { timeout: 45000 });
            const data = res.data;
            if (data && data.ok && data.download) return data;
            lastErr = new Error('API returned no download link');
        } catch (err) {
            console.error(`[${endpoint}] attempt ${i} failed:`, err?.response?.status || err?.message);
            lastErr = err;
        }
        if (i < retries) await sleep(2000);
    }
    throw lastErr || new Error('API failed');
}

// ───────── .play / .song / .mp3 (audio) ─────────
cmd({
    pattern: "play",
    alias: ["song", "music", "audio", "mp3"],
    desc: "Search YouTube and send MP3",
    category: "download",
    react: "🎧",
    filename: __filename
}, async (conn, mek, m, { from, text, reply }) => {
    try {
        if (!text) return reply("❌ Please provide song name\nExample: .play Shape of You");

        await conn.sendMessage(from, { react: { text: "⏳", key: mek.key } });

        // 1) Search (or link se seedha videoId)
        let videoId = getVideoId(text);
        let vid = null;

        if (videoId) {
            const s = await searchYouTube(`https://youtu.be/${videoId}`);
            vid = s || { videoId, title: 'YouTube Audio', author: 'Unknown', timestamp: 'N/A', views: 'N/A', thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` };
        } else {
            vid = await searchYouTube(text);
            if (!vid) {
                await conn.sendMessage(from, { react: { text: "❌", key: mek.key } });
                return reply("⚠️ No results found.");
            }
            videoId = vid.videoId;
        }

        // 2) API call
        const data = await callApi('ytmp3', videoId);
        const title = data.title || vid.title;
        const audioUrl = data.download;

        // 3) Send audio
        await conn.sendMessage(from, {
            audio: { url: audioUrl },
            mimetype: "audio/mpeg",
            fileName: `${title}.mp3`,
            ptt: false
        }, { quoted: mek });

        await conn.sendMessage(from, { react: { text: "✅", key: mek.key } });

    } catch (err) {
        console.error("PLAY ERROR:", err?.message || err);
        await conn.sendMessage(from, { react: { text: "❌", key: mek.key } });
        reply(`❌ Error: ${err?.message || 'unknown'}`);
    }
});

// ───────── .video / .mp4 / .drama / .cartoon / .movie (video) ─────────
cmd({
    pattern: "video",
    alias: ["ytv", "ytmp4", "vd", "mp4", "drama", "film", "series", "cartoon", "toon", "kids", "movie", "playmovie", "dlmovie"],
    desc: "Search YouTube and send MP4",
    category: "download",
    react: "📹",
    filename: __filename
}, async (conn, mek, m, { from, text, reply, command }) => {
    try {
        if (!text) return reply(`❌ Please provide a name or link\nExample: .${command} Alone Marshmello`);

        await conn.sendMessage(from, { react: { text: "⏳", key: mek.key } });

        // cartoon ke liye query mein "cartoon" add karo
        const isCartoon = ['cartoon', 'toon', 'kids'].includes(command);
        const isMovie = ['movie', 'playmovie', 'dlmovie'].includes(command);

        let query = text;
        if (isCartoon) query = `${text} cartoon`;
        if (isMovie) query = `${text} full movie`;

        // 1) Search (or link se seedha videoId)
        let videoId = getVideoId(text);
        let vid = null;

        if (videoId) {
            const s = await searchYouTube(`https://youtu.be/${videoId}`);
            vid = s || { videoId, title: 'YouTube Video', author: 'Unknown', timestamp: 'N/A', views: 'N/A', thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` };
        } else {
            vid = await searchYouTube(query);
            if (!vid) {
                await conn.sendMessage(from, { react: { text: "❌", key: mek.key } });
                return reply("⚠️ No results found.");
            }
            videoId = vid.videoId;
        }

        // 2) API call
        const data = await callApi('ytmp4', videoId);
        const title = data.title || vid.title;
        const videoUrl = data.download;

        // 3) Movie/document ko document ke tor pe bhejo, baaki video ke tor pe
        if (isMovie) {
            await conn.sendMessage(from, {
                document: { url: videoUrl },
                mimetype: "video/mp4",
                fileName: `${title}.mp4`,
                caption: `🍿 *${title}*\n\n> Powered by ERFAN-MD`
            }, { quoted: mek });
        } else {
            await conn.sendMessage(from, {
                video: { url: videoUrl },
                caption: `🎬 *${title}*\n\n> Powered by ERFAN-MD`
            }, { quoted: mek });
        }

        await conn.sendMessage(from, { react: { text: "✅", key: mek.key } });

    } catch (err) {
        console.error("VIDEO ERROR:", err?.message || err);
        await conn.sendMessage(from, { react: { text: "❌", key: mek.key } });
        reply(`❌ Error: ${err?.message || 'unknown'}`);
    }
});
