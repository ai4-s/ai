// ERFAN MD
import { fileURLToPath } from 'url';
import { cmd } from '../command.js';
import axios from 'axios';

const __filename = fileURLToPath(import.meta.url);

// ── Single audio API (MP3) ────────────────────────────────────
const AUDIO_API = "https://rimi-xi.vercel.app/api/ytmp3";

// ── Max file size WhatsApp will accept (~60 MB safe) ──────────
const MAX_FILE_SIZE = 60 * 1024 * 1024;

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

// ── Sanitize filename (remove illegal chars) ─────────────────
function safeFileName(title) {
    return (title || 'audio')
        .replace(/[\\/:*?"<>|]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 120) || 'audio';
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
            if (!vid || !vid.title) {
                return reply("❌ *Could not fetch video details. Please try again.*");
            }
            url = vid.url;
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
        }, { quoted: mek }).catch(() => {});

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

        console.log(`⬇️ Fetching audio buffer from: ${audioUrl.slice(0, 100)}...`);

        // ── 6. Download the audio as a buffer ─────────────────
        let audioBuffer = null;

        try {
            const audioRes = await axios.get(audioUrl, {
                responseType: 'arraybuffer',
                timeout: 90000,
                maxRedirects: 10,
                validateStatus: (status) => status >= 200 && status < 300,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'audio/mpeg,audio/*;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Referer': 'https://www.youtube.com/',
                    'Range': 'bytes=0-'
                }
            });

            audioBuffer = Buffer.from(audioRes.data);

            if (!audioBuffer || audioBuffer.length < 10000) {
                throw new Error(`Buffer too small (${audioBuffer?.length || 0} bytes)`);
            }

            if (audioBuffer.length > MAX_FILE_SIZE) {
                console.error(`❌ File too large: ${audioBuffer.length} bytes`);
                await conn.sendMessage(from, { react: { text: '❌', key: m.key } }).catch(() => {});
                return reply(
                    "❌ *File is too large for WhatsApp (over 60 MB).*\n" +
                    "🔁 *Please try a shorter song.*"
                );
            }

            console.log(`✅ Audio buffer ready: ${(audioBuffer.length / 1024 / 1024).toFixed(2)} MB`);

        } catch (dlErr) {
            console.error('❌ Audio download failed:', dlErr.message);
            await conn.sendMessage(from, { react: { text: '❌', key: m.key } }).catch(() => {});
            return reply(
                "❌ *Could not download the audio file.*\n" +
                "🔁 *The link may have expired. Please try again.*"
            );
        }

        const fileName = `${safeFileName(vid.title)}.mp3`;

        // ── 7. Send the buffer as audio ───────────────────────
        let sent = false;

        try {
            await conn.sendMessage(from, {
                audio: audioBuffer,
                mimetype: 'audio/mpeg',
                fileName: fileName,
                ptt: false
            }, { quoted: mek });
            sent = true;
            console.log('✅ Audio sent successfully (as audio)');
        } catch (audioErr) {
            console.error('⚠️ Buffer audio send failed:', audioErr.message);
        }

        // ── 8. Fallback: send as document ─────────────────────
        if (!sent) {
            try {
                await conn.sendMessage(from, {
                    document: audioBuffer,
                    mimetype: 'audio/mpeg',
                    fileName: fileName
                }, { quoted: mek });
                sent = true;
                console.log('✅ Audio sent successfully (as document)');
            } catch (docErr) {
                console.error('⚠️ Document send failed:', docErr.message);
            }
        }

        // ── 9. Final react ────────────────────────────────────
        if (!sent) {
            await conn.sendMessage(from, { react: { text: '❌', key: m.key } }).catch(() => {});
            return reply("❌ *Failed to send the file after downloading. Please try again.*");
        }

        await conn.sendMessage(from, { react: { text: '✅', key: m.key } }).catch(() => {});

    } catch (err) {
        console.error("❌ PLAY ERROR:", err);
        await conn.sendMessage(from, { react: { text: '❌', key: m.key } }).catch(() => {});
        return reply("❌ *An unexpected error occurred. Please try again later.*");
    }
});
