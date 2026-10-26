// ERFAN MD
import { fileURLToPath } from 'url';
import { cmd } from '../command.js';
import axios from 'axios';

const __filename = fileURLToPath(import.meta.url);

// ── Single audio API (MP3) ────────────────────────────────────
const AUDIO_API = "https://rimi-xi.vercel.app/api/ytmp3";

// ── Extract YouTube video ID from any URL ────────────────────
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
        // ── 1. Validate input ─────────────────────────────────
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

        // ── 2. Resolve video (search or direct URL) ───────────
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

        // ── 3. Send info card ─────────────────────────────────
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

        // ── 4. Call the API ───────────────────────────────────
        const apiUrl = `${AUDIO_API}?url=${encodeURIComponent(url)}`;
        let data;

        try {
            const res = await axios.get(apiUrl, {
                timeout: 40000,
                headers: { 'User-Agent': 'Mozilla/5.0' }
            });
            data = res.data;
        } catch (e) {
            console.error("❌ API request failed:", e.message);
            await conn.sendMessage(from, { react: { text: '❌', key: m.key } }).catch(() => {});
            return reply(
                "❌ *Download API is not responding right now.*\n" +
                "🔁 *Please try again in a moment.*"
            );
        }

        // ── 5. Parse response ─────────────────────────────────
        const audioUrl =
            data?.ok && typeof data.download === 'string' ? data.download :
            typeof data?.download === 'string' ? data.download :
            null;

        if (!audioUrl || !audioUrl.startsWith('http')) {
            console.error("❌ Bad API response:", JSON.stringify(data).slice(0, 300));
            await conn.sendMessage(from, { react: { text: '❌', key: m.key } }).catch(() => {});
            return reply("❌ *API returned an invalid download link. Please try again.*");
        }

        // ── 6. Send as audio (fallback: document) ─────────────
        let sent = false;

        try {
            await conn.sendMessage(from, {
                audio: { url: audioUrl },
                mimetype: "audio/mpeg",
                fileName: `${vid.title}.mp3`,
                ptt: false
            }, { quoted: mek });
            sent = true;
        } catch (audioErr) {
            console.error("⚠️ Audio send failed:", audioErr.message);
        }

        if (!sent) {
            try {
                await conn.sendMessage(from, {
                    document: { url: audioUrl },
                    mimetype: "audio/mpeg",
                    fileName: `${vid.title}.mp3`
                }, { quoted: mek });
                sent = true;
            } catch (docErr) {
                console.error("⚠️ Document send failed:", docErr.message);
            }
        }

        // ── 7. Final react ────────────────────────────────────
        if (!sent) {
            await conn.sendMessage(from, { react: { text: '❌', key: m.key } }).catch(() => {});
            return reply("❌ *Failed to send the file. Please try again.*");
        }

        await conn.sendMessage(from, { react: { text: '✅', key: m.key } }).catch(() => {});

    } catch (err) {
        console.error("❌ PLAY ERROR:", err);
        await conn.sendMessage(from, { react: { text: '❌', key: m.key } }).catch(() => {});
        return reply("❌ *An unexpected error occurred. Please try again later.*");
    }
});
