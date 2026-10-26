// ERFAN MD 
import { fileURLToPath } from 'url';
import { cmd } from '../command.js';
import axios from 'axios';

const __filename = fileURLToPath(import.meta.url);

// ── Primary API (confirmed AUDIO / MP3 endpoint) ─────────────
const NEW_API_BASE = "https://rimi-xi.vercel.app";
const NEW_AUDIO_ENDPOINT = `${NEW_API_BASE}/api/ytmp3`;

// ── Legacy API base (silent audio fallback) ─────────────────
const OLD_API_BASE = "https://xjawadtechyt.vercel.app";

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

// ── Universal audio-URL extractor ─────────────────────────────
// New API : { ok: true, download: "<string>" }        ← ytmp3 confirmed
// Old API : { status: true, download: { url: "<string>" } }
function parseAudioUrl(data) {
    if (!data || typeof data !== 'object') return null;
    if (data.ok && typeof data.download === 'string' && data.download.startsWith('http')) {
        return data.download;
    }
    if (data.status && data.download?.url) return data.download.url;
    if (typeof data.download === 'string' && data.download.startsWith('http')) return data.download;
    if (data.download?.url) return data.download.url;
    if (data.url && typeof data.url === 'string') return data.url;
    return null;
}

// ============================================
// AUDIO API CHAIN — new MP3 endpoint first, then legacy fallbacks
// ============================================
const getAudioAPIs = (url) => [
    // ✅ PRIMARY — confirmed 128K MP3 endpoint
    { name: 'Rimi-MP3', url: `${NEW_AUDIO_ENDPOINT}?url=${encodeURIComponent(url)}`, timeout: 30000 },

    // 🛟 SILENT FALLBACKS — old audio APIs (if new one ever fails)
    { name: 'Jawad-8', url: `${OLD_API_BASE}/yta8?url=${encodeURIComponent(url)}`, timeout: 25000 },
    { name: 'Jawad-9', url: `${OLD_API_BASE}/yta9?url=${encodeURIComponent(url)}`, timeout: 25000 },
    { name: 'Jawad-7', url: `${OLD_API_BASE}/yta7?url=${encodeURIComponent(url)}`, timeout: 25000 },
    { name: 'Jawad-6', url: `${OLD_API_BASE}/yta6?url=${encodeURIComponent(url)}`, timeout: 25000 },
    { name: 'Jawad-1', url: `${OLD_API_BASE}/yta1?url=${encodeURIComponent(url)}`, timeout: 25000 },
    { name: 'Jawad-2', url: `${OLD_API_BASE}/yta2?url=${encodeURIComponent(url)}`, timeout: 25000 },
    { name: 'Jawad-3', url: `${OLD_API_BASE}/yta3?url=${encodeURIComponent(url)}`, timeout: 25000 },
    { name: 'Jawad-4', url: `${OLD_API_BASE}/yta4?url=${encodeURIComponent(url)}`, timeout: 25000 },
    { name: 'Jawad-5', url: `${OLD_API_BASE}/yta5?url=${encodeURIComponent(url)}`, timeout: 25000 }
];

// ============================================
// COMMAND: play (Auto Audio Download — MP3)
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
        // ── Validate input ─────────────────────────────────────
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

        // ── Search / resolve video ─────────────────────────────
        if (/^https?:\/\//i.test(url)) {
            if (!/youtube\.com|youtu\.be/i.test(url)) {
                return reply("❌ *Please provide a valid YouTube URL.*");
            }
            const videoId = getVideoId(url);
            if (!videoId) {
                return reply("❌ *Invalid YouTube URL. Please check the link and try again.*");
            }
            vid = await yts({ videoId });
        } else {
            const search = await yts(url);
            if (!search?.videos?.length) {
                return reply("❌ *No results found for your search. Try different keywords.*");
            }
            vid = search.videos[0];
            url = vid.url;
        }

        if (!vid) return reply("❌ *No results found.*");

        // ── Send info card ─────────────────────────────────────
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
        }, { quoted: mek });

        // ── Try each audio API ─────────────────────────────────
        let success = false;
        let lastError = 'No source responded';

        for (const api of getAudioAPIs(url)) {
            if (success) break;

            try {
                const { data } = await axios.get(api.url, {
                    timeout: api.timeout,
                    validateStatus: () => true,
                    headers: { 'User-Agent': 'Mozilla/5.0' }
                });

                const audioUrl = parseAudioUrl(data);
                if (!audioUrl) {
                    lastError = `${api.name}: no download URL in response`;
                    console.error(`⚠️ ${lastError}`);
                    continue;
                }

                // ── Try 1: send as audio ───────────────────────
                try {
                    await conn.sendMessage(from, {
                        audio: { url: audioUrl },
                        mimetype: "audio/mpeg",
                        fileName: `${vid.title}.mp3`,
                        ptt: false
                    }, { quoted: mek });
                    success = true;
                    break;
                } catch (audioErr) {
                    console.error(`⚠️ Audio send failed (${api.name}):`, audioErr.message);
                }

                // ── Try 2: send as document ────────────────────
                try {
                    await conn.sendMessage(from, {
                        document: { url: audioUrl },
                        mimetype: "audio/mpeg",
                        fileName: `${vid.title}.mp3`
                    }, { quoted: mek });
                    success = true;
                    break;
                } catch (docErr) {
                    console.error(`⚠️ Document send failed (${api.name}):`, docErr.message);
                    lastError = `${api.name}: ${docErr.message}`;
                }

            } catch (e) {
                console.error(`⚠️ API failed (${api.name}):`, e.message);
                lastError = `${api.name}: ${e.message}`;
            }
        }

        // ── Final result ───────────────────────────────────────
        if (!success) {
            await conn.sendMessage(from, { react: { text: '❌', key: m.key } }).catch(() => {});
            return reply(
                "❌ *All download sources failed.*\n\n" +
                "🔁 *Please try again in a moment.*\n" +
                `_Last error: ${lastError}_`
            );
        }

        await conn.sendMessage(from, { react: { text: '✅', key: m.key } }).catch(() => {});

    } catch (err) {
        console.error("❌ PLAY ERROR:", err);
        await conn.sendMessage(from, { react: { text: '❌', key: m.key } }).catch(() => {});
        return reply("❌ *An unexpected error occurred. Please try again later.*");
    }
});
