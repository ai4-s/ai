// ERFAN MD
import { fileURLToPath } from 'url';
import { cmd } from '../command.js';
import axios from 'axios';

const __filename = fileURLToPath(import.meta.url);

// ── Single audio API (MP3) ────────────────────────────────────
const AUDIO_API = "https://rimi-xi.vercel.app/api/ytmp3";
const MAX_FILE_SIZE = 60 * 1024 * 1024;

// ── Extract YouTube video ID ─────────────────────────────────
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
        /(?:music\.youtube\.com\/watch\?.*v=)([a-zA-Z0-9_-]{11})/
    ];
    for (const p of patterns) {
        const m = url.match(p);
        if (m && m[1]) return m[1];
    }
    return null;
}

function safeFileName(title) {
    return (title || 'audio')
        .replace(/[\\/:*?"<>|]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 120) || 'audio';
}

// ── ROBUST download function (fetch first, axios fallback) ──
async function downloadBuffer(url) {
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'audio/mpeg,audio/*;q=0.9,*/*;q=0.8'
    };

    // Attempt 1: Native fetch (Node 18+)
    try {
        console.log('⬇️ Attempt 1: fetch...');
        const res = await fetch(url, { method: 'GET', headers });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const arrayBuffer = await res.arrayBuffer();
        const buf = Buffer.from(arrayBuffer);
        if (buf.length > 10000) return buf;
        throw new Error(`Buffer too small (${buf.length} bytes)`);
    } catch (e) {
        console.warn('⚠️ Fetch failed:', e.message);
    }

    // Attempt 2: axios
    try {
        console.log('⬇️ Attempt 2: axios...');
        const res = await axios.get(url, {
            responseType: 'arraybuffer',
            timeout: 60000,
            headers
        });
        const buf = Buffer.from(res.data);
        if (buf.length > 10000) return buf;
        throw new Error(`Buffer too small (${buf.length} bytes)`);
    } catch (e) {
        console.error('❌ Axios failed:', e.message);
        throw new Error('All download methods failed');
    }
}

// ── COMMAND: play ────────────────────────────────────────────
cmd({
    pattern: "play",
    alias: ["song", "music", "audio"],
    desc: "Download YouTube audio as MP3",
    category: "download",
    react: "🎧",
    filename: __filename
}, async (conn, mek, m, { from, text, reply }) => {
    try {
        if (!text || !text.trim()) {
            return reply(
                "❌ *Please provide a song name or a YouTube URL.*\n\n" +
                "📌 *Examples:*\n" +
                "•  *.play Shape of You*\n" +
                "•  *.play https://youtu.be/wSkXuqLAjow*"
            );
        }

        const { default: yts } = await import('yt-search');
        let vid = null;
        let url = text.trim();

        if (/^https?:\/\//i.test(url)) {
            if (!/youtube\.com|youtu\.be/i.test(url)) {
                return reply("❌ *Please provide a valid YouTube URL.*");
            }
            const videoId = getVideoId(url);
            if (!videoId) return reply("❌ *Invalid YouTube URL.*");
            vid = await yts({ videoId });
        } else {
            const search = await yts(url);
            if (!search?.videos?.length) {
                return reply("❌ *No results found.*");
            }
            vid = search.videos[0];
            url = vid.url;
        }

        if (!vid) return reply("❌ *No results found.*");

        // Info card
        await conn.sendMessage(from, {
            image: { url: vid.thumbnail },
            caption:
                `🎧 *AUDIO DOWNLOADER (MP3)*\n` +
                `╭━━❐━⪼\n` +
                `┇๏ *Title*    : ${vid.title}\n` +
                `┇๏ *Duration* : ${vid.timestamp || 'N/A'}\n` +
                `┇๏ *Views*    : ${vid.views?.toLocaleString() || 'N/A'}\n` +
                `┇๏ *Author*   : ${vid.author?.name || 'Unknown'}\n` +
                `┇๏ *Quality*  : 128K MP3\n` +
                `┇๏ *Status*   : Downloading...\n` +
                `╰━━❑━⪼\n` +
                `> Powered by ERFAN-MD`
        }, { quoted: mek }).catch(() => {});

        // Call API
        const apiUrl = `${AUDIO_API}?url=${encodeURIComponent(url)}`;
        let data;
        try {
            const res = await axios.get(apiUrl, { timeout: 40000 });
            data = res.data;
        } catch (e) {
            await conn.sendMessage(from, { react: { text: '❌', key: m.key } }).catch(() => {});
            return reply("❌ *API not responding. Please try again later.*");
        }

        const audioUrl =
            data?.ok && typeof data.download === 'string' ? data.download :
            typeof data?.download === 'string' ? data.download : null;

        if (!audioUrl || !audioUrl.startsWith('http')) {
            await conn.sendMessage(from, { react: { text: '❌', key: m.key } }).catch(() => {});
            return reply("❌ *API returned invalid download link.*");
        }

        // Download buffer
        let audioBuffer;
        try {
            audioBuffer = await downloadBuffer(audioUrl);
        } catch (e) {
            await conn.sendMessage(from, { react: { text: '❌', key: m.key } }).catch(() => {});
            return reply(
                "❌ *Could not download audio.*\n" +
                "🔁 *The link may have expired. Please try again.*"
            );
        }

        if (audioBuffer.length > MAX_FILE_SIZE) {
            await conn.sendMessage(from, { react: { text: '❌', key: m.key } }).catch(() => {});
            return reply("❌ *File too large for WhatsApp (over 60 MB).*");
        }

        const fileName = `${safeFileName(vid.title)}.mp3`;

        // Send as audio
        let sent = false;
        try {
            await conn.sendMessage(from, {
                audio: audioBuffer,
                mimetype: 'audio/mpeg',
                fileName,
                ptt: false
            }, { quoted: mek });
            sent = true;
        } catch (e) {
            console.error('Audio send failed:', e.message);
        }

        // Fallback: document
        if (!sent) {
            try {
                await conn.sendMessage(from, {
                    document: audioBuffer,
                    mimetype: 'audio/mpeg',
                    fileName
                }, { quoted: mek });
                sent = true;
            } catch (e) {
                console.error('Document send failed:', e.message);
            }
        }

        if (!sent) {
            await conn.sendMessage(from, { react: { text: '❌', key: m.key } }).catch(() => {});
            return reply("❌ *Failed to send file after download.*");
        }

        await conn.sendMessage(from, { react: { text: '✅', key: m.key } }).catch(() => {});

    } catch (err) {
        console.error("❌ PLAY ERROR:", err);
        await conn.sendMessage(from, { react: { text: '❌', key: m.key } }).catch(() => {});
        return reply("❌ *Unexpected error. Please try again.*");
    }
});
