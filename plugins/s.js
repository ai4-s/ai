// ERFAN MD
import { fileURLToPath } from 'url';
import { cmd } from '../command.js';
import axios from 'axios';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';

const __filename = fileURLToPath(import.meta.url);

// FIXED: working video API (same one used in the working file)
const VIDEO_API_BASE = "https://api.delirius.online/download/ytmp4";
const AUDIO_API_BASE = "https://rimi-xi.vercel.app/api/ytmp3";

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
// VIDEO API - FIXED (Delirius)
// ============================================

const getAudioAPIs = (url) => [
    {
        url: `${AUDIO_API_BASE}?url=${encodeURIComponent(url)}`,
        timeout: 30000
    }
];

const getNormalVideoAPIs = (url) => [
    `${VIDEO_API_BASE}?url=${encodeURIComponent(url)}&format=360p`
];

const getFallbackVideoAPI = (url) =>
    `${VIDEO_API_BASE}?url=${encodeURIComponent(url)}&format=360p`;

async function getDeliriusVideoData(url) {
    let lastErr;

    // Up to 2 attempts so a single temporary API failure does not break the command
    for (let attempt = 1; attempt <= 2; attempt++) {
        try {
            const response = await axios.get(getFallbackVideoAPI(url), {
                timeout: 45000,
                headers: { "User-Agent": "Mozilla/5.0" }
            });

            const data = response.data;

            if (
                !data?.status ||
                typeof data?.data?.download !== "string" ||
                !data.data.download.startsWith("http")
            ) {
                throw new Error(
                    data?.message ||
                    "Video API did not return a download link."
                );
            }

            const d = data.data;

            return {
                ...d,
                title: typeof d.title === "string" && d.title.trim()
                    ? d.title.trim()
                    : "YouTube Video",
                download: d.download,
                quality: d.format || d.quality || "360p MP4"
            };
        } catch (e) {
            lastErr = e;
            console.error(`⚠️ Video API attempt ${attempt} failed:`, e?.message);

            if (attempt < 2) {
                await new Promise((r) => setTimeout(r, 1500));
            }
        }
    }

    throw lastErr;
}

// ============================================
// SHARED VIDEO HELPERS (retry, safe download, smart send)
// ============================================

const MAX_VIDEO_BYTES = 60 * 1024 * 1024; // WhatsApp inline-video limit (~64MB); larger goes as document

const DOWNLOAD_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "*/*"
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const safeFileName = (name) =>
    String(name || "video").replace(/[\\/:*?"<>|]/g, "_").slice(0, 180);

const removeFile = (file) => {
    try {
        if (file && fs.existsSync(file)) fs.unlinkSync(file);
    } catch {}
};

// Calls the video API (retry logic lives inside getDeliriusVideoData)
async function getVideoDataSafe(url) {
    return getDeliriusVideoData(url);
}

// Streams the file to disk (no RAM problems with big videos / dramas)
async function downloadToTemp(downloadUrl, prefix = "video") {
    const tempFile = path.join(
        os.tmpdir(),
        `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.mp4`
    );

    try {
        const res = await axios({
            method: "GET",
            url: downloadUrl,
            responseType: "stream",
            timeout: 60000, // connection timeout only; the stream itself can take longer
            maxRedirects: 5,
            headers: DOWNLOAD_HEADERS
        });

        const type = res.headers?.["content-type"] || "";
        if (type.includes("text/html") || type.includes("application/json")) {
            res.data.destroy();
            throw new Error("The download link returned an invalid file.");
        }

        await pipeline(res.data, fs.createWriteStream(tempFile));

        const size = fs.statSync(tempFile).size;
        if (size < 10000) {
            throw new Error("The downloaded video file is empty or invalid.");
        }

        return { tempFile, size };
    } catch (e) {
        removeFile(tempFile);
        throw e;
    }
}

// Sends as video when small enough, otherwise (or if video send fails) as document
async function sendVideoSmart(conn, from, quoted, { tempFile, size, title, caption, asDocument }) {
    const fileName = `${safeFileName(title)}.mp4`;

    if (!asDocument && size <= MAX_VIDEO_BYTES) {
        try {
            await conn.sendMessage(from, {
                video: { url: tempFile },
                mimetype: "video/mp4",
                fileName,
                caption
            }, { quoted });
            return "video";
        } catch (e) {
            console.error("⚠️ Video send failed, falling back to document:", e?.message);
        }
    }

    await conn.sendMessage(from, {
        document: { url: tempFile },
        mimetype: "video/mp4",
        fileName,
        caption
    }, { quoted });

    return "document";
}

// ============================================
// COMMAND: PLAY (AUDIO) - PRESERVED
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
        if (!text) {
            return reply(
                "❌ Please provide song name\nExample: .play Shape of You"
            );
        }

        const { default: yts } = await import('yt-search');

        let url = text;
        let vid = null;

        if (text.startsWith('http://') || text.startsWith('https://')) {
            if (!text.includes("youtube.com") && !text.includes("youtu.be")) {
                return reply("❌ Please provide a valid YouTube URL!");
            }

            const videoId = getVideoId(text);
            if (!videoId) return reply("❌ Invalid YouTube URL!");

            vid = await yts({ videoId });
            url = text;
        } else {
            const search = await yts(text);

            if (!search || !search.videos || !search.videos.length) {
                return reply("❌ No song found!");
            }

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
        const audioAPIs = getAudioAPIs(url);

        for (const api of audioAPIs) {
            if (success) break;

            try {
                const response = await axios.get(api.url, {
                    timeout: api.timeout
                });

                const audioUrl =
                    response.data?.ok === true && response.data?.download
                        ? response.data.download
                        : null;

                if (!audioUrl) continue;

                try {
                    await conn.sendMessage(from, {
                        audio: { url: audioUrl },
                        mimetype: "audio/mpeg",
                        fileName: `${vid.title}.mp3`,
                        ptt: false
                    }, { quoted: mek });

                    success = true;
                    break;
                } catch (sendErr) {
                    console.error(
                        `⚠️ Audio send failed:`,
                        sendErr.message
                    );
                }
            } catch (e) {
                console.error(`⚠️ Audio API failed:`, e.message);
            }
        }

        if (!success) {
            return reply("❌ Audio download failed! Try again later.");
        }

        await conn.sendMessage(from, {
            react: { text: '✅', key: m.key }
        });

    } catch (err) {
        console.error("❌ PLAY ERROR:", err);
        reply("❌ Error occurred! Please try again later!");

        await conn.sendMessage(from, {
            react: { text: '❌', key: m.key }
        });
    }
});

// ============================================
// COMMAND: VIDEO
// Under 1 hour -> sent as video | Over 1 hour -> sent as document (no extra message)
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
        if (!text) {
            return reply(
                "🎥 Please provide a video name or YouTube link!\n\nExample: `.video Alone Marshmello`"
            );
        }

        const { default: yts } = await import("yt-search");

        let vid;
        let url = text.trim();

        if (/^https?:\/\//i.test(url)) {
            if (!url.includes("youtube.com") && !url.includes("youtu.be")) {
                return reply("❌ Please provide a valid YouTube URL!");
            }

            const videoId = getVideoId(url);
            if (!videoId) return reply("❌ Invalid YouTube URL!");

            vid = await yts({ videoId });
        } else {
            const search = await yts(url);
            vid = search.videos?.[0];

            if (vid) url = vid.url;
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

        try {
            await conn.sendMessage(from, {
                image: { url: vid.thumbnail },
                caption: detailsCaption
            }, { quoted: mek });
        } catch (e) {
            await conn.sendMessage(from, { text: detailsCaption }, { quoted: mek });
        }

        await conn.sendMessage(from, {
            react: { text: "⬇️", key: m.key }
        });

        // More than 1 hour => document, otherwise video
        const isLong = (Number(vid.seconds) || 0) > 3600;

        const apiData = await getVideoDataSafe(url);
        const title = apiData.title || vid.title;

        const dl = await downloadToTemp(apiData.download, "video");
        tempFile = dl.tempFile;

        const fileName = `${safeFileName(title)}.mp4`;
        const caption = `🎬 *${title}*\n🎞️ ${apiData.quality || "360p MP4"}\n🔗 *Powered By ERFAN-MD*`;

        let sent = false;

        if (!isLong) {
            try {
                await conn.sendMessage(from, {
                    video: { url: tempFile },
                    mimetype: "video/mp4",
                    fileName,
                    caption
                }, { quoted: mek });
                sent = true;
            } catch (e) {
                console.error("[VIDEO] Video send failed, sending as document:", e?.message);
            }
        }

        if (!sent) {
            await conn.sendMessage(from, {
                document: { url: tempFile },
                mimetype: "video/mp4",
                fileName,
                caption
            }, { quoted: mek });
        }

        await conn.sendMessage(from, {
            react: { text: "✅", key: m.key }
        });

    } catch (error) {
        console.error(
            "[VIDEO] Error:",
            error?.response?.data || error?.message || error
        );

        try {
            await conn.sendMessage(from, {
                react: { text: "❌", key: m.key }
            });
        } catch {}

        return reply(
            error?.code === "ECONNABORTED"
                ? "❌ Video download timed out. Please try again."
                : `❌ Video download failed: ${error?.message || "Please try again later."}`
        );
    } finally {
        removeFile(tempFile);
        if (global.gc) global.gc();
    }
});

// ============================================
// COMMAND: SONG (INTERACTIVE) - PRESERVED
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
        if (!text) {
            return reply(
                "🎶 Please provide a YouTube video name or link.\n\nExample: `.song Alone - Alan Walker`"
            );
        }

        const { default: yts } = await import('yt-search');

        let vid = null;
        let url = text;

        if (text.startsWith('http://') || text.startsWith('https://')) {
            if (!text.includes("youtube.com") && !text.includes("youtu.be")) {
                return reply("❌ Please provide a valid YouTube URL!");
            }

            const videoId = getVideoId(text);
            if (!videoId) return reply("❌ Invalid YouTube URL!");

            vid = await yts({ videoId });
            url = text;
        } else {
            const search = await yts(text);

            if (!search || !search.videos || !search.videos.length) {
                return reply("❌ No results found!");
            }

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

        const sent = await conn.sendMessage(from, {
            image: { url: vid.thumbnail },
            caption
        }, { quoted: mek });

        const msgId = sent.key.id;

        const songListener = async (msgData) => {
            const received = msgData.messages[0];
            if (!received.message) return;

            const selected =
                received.message.conversation ||
                received.message.extendedTextMessage?.text;

            const replyToBot =
                received.message.extendedTextMessage?.contextInfo?.stanzaId === msgId;

            if (!replyToBot) return;

            conn.ev.off("messages.upsert", songListener);

            await conn.sendMessage(from, {
                react: { text: '⬇️', key: received.key }
            });

            const cleanSelect = selected?.trim();

            if (!["1", "2", "3", "4"].includes(cleanSelect)) {
                return conn.sendMessage(from, {
                    text: `❌ *Invalid selection!*
Please reply with:
1️⃣ for Audio (MP3)
2️⃣ for Video (MP4)
3️⃣ for Audio as Document
4️⃣ for Video as Document`
                }, { quoted: received });
            }

            const type = cleanSelect === "1" || cleanSelect === "3" ? "mp3" : "mp4";
            const asDocument = cleanSelect === "3" || cleanSelect === "4";

            if (type === "mp3") {
                let success = false;
                const audioAPIs = getAudioAPIs(url);

                for (const api of audioAPIs) {
                    if (success) break;

                    try {
                        const response = await axios.get(api.url, {
                            timeout: api.timeout
                        });

                        const audioUrl =
                            response.data?.ok === true && response.data?.download
                                ? response.data.download
                                : null;

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
                        console.error("⚠️ Audio download failed:", e.message);
                    }
                }

                if (!success) {
                    return conn.sendMessage(from, {
                        text: "❌ Audio download failed! Try again later."
                    }, { quoted: received });
                }
            } else {
                let success = false;
                let tempFile = null;

                try {
                    const apiData = await getDeliriusVideoData(url);
                    const title = apiData.title || vid.title;

                    const dl = await downloadToTemp(apiData.download, "video");
                    tempFile = dl.tempFile;

                    await sendVideoSmart(conn, from, received, {
                        tempFile,
                        size: dl.size,
                        title,
                        asDocument,
                        caption: asDocument
                            ? `📄 *${title}*\n📹 Video Document\n\n> Powered by ERFAN-MD`
                            : `🎬 *${title}*\n\n> Powered by ERFAN-MD`
                    });

                    removeFile(tempFile);
                    tempFile = null;

                    success = true;
                } catch (e) {
                    console.error("⚠️ Video download failed:", e.message);

                    try {
                        if (tempFile && fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
                    } catch {}

                    tempFile = null;
                }

                if (!success) {
                    return conn.sendMessage(from, {
                        text: "❌ Video download failed! Try again later."
                    }, { quoted: received });
                }
            }

            await conn.sendMessage(from, {
                react: { text: '✅', key: received.key }
            });
        };

        conn.ev.on("messages.upsert", songListener);

        setTimeout(() => {
            conn.ev.off("messages.upsert", songListener);
        }, 30000);

    } catch (e) {
        console.error(e);
        reply(`❌ Error: ${e.message}`);

        await conn.sendMessage(from, {
            react: { text: '❌', key: m.key }
        });
    }
});

// ============================================
// COMMAND: DRAMA
// Always sent as document (no format menu)
// ============================================

cmd({
    pattern: "drama",
    alias: ["film", "series"],
    desc: "Download YouTube drama/movie as document",
    category: "download",
    react: "🎬",
    filename: __filename
}, async (conn, mek, m, { from, text, reply }) => {
    let tempFile = null;

    try {
        if (!text) {
            return reply(
                "🎬 Please provide a drama/movie name or link.\n\nExample: `.drama Muskan 5`"
            );
        }

        const { default: yts } = await import('yt-search');

        let vid = null;
        let url = text.trim();

        if (url.startsWith('http://') || url.startsWith('https://')) {
            if (!url.includes("youtube.com") && !url.includes("youtu.be")) {
                return reply("❌ Please provide a valid YouTube URL!");
            }

            const videoId = getVideoId(url);
            if (!videoId) return reply("❌ Invalid YouTube URL!");

            vid = await yts({ videoId });
        } else {
            const search = await yts(url);

            if (!search || !search.videos || !search.videos.length) {
                return reply("❌ No results found!");
            }

            vid = search.videos[0];
            url = vid.url;
        }

        if (!vid) return reply("❌ No results found!");

        const caption = `*╭┈───〔 ${toSmallCaps('Drama Downloader')} 〕┈───⊷*
*├▢ 🎬 Title:* ${vid.title}
*├▢ 📺 Channel:* ${vid.author?.name || 'Unknown'}
*├▢ ⏰ Duration:* ${vid.timestamp}
*├▢ 👀 Views:* ${vid.views?.toLocaleString() || 'N/A'}
*╰───────────────────⊷*
_⚡ Downloading as document..._

> Powered by ERFAN-MD`;

        try {
            await conn.sendMessage(from, {
                image: { url: vid.thumbnail },
                caption
            }, { quoted: mek });
        } catch (e) {
            await conn.sendMessage(from, { text: caption }, { quoted: mek });
        }

        await conn.sendMessage(from, {
            react: { text: '⬇️', key: m.key }
        });

        const apiData = await getVideoDataSafe(url);
        const title = apiData.title || vid.title;

        const dl = await downloadToTemp(apiData.download, "drama");
        tempFile = dl.tempFile;

        await conn.sendMessage(from, {
            document: { url: tempFile },
            mimetype: "video/mp4",
            fileName: `${safeFileName(title)}.mp4`,
            caption: `🍿 *${title}*\n\n> Powered by ERFAN-MD`
        }, { quoted: mek });

        await conn.sendMessage(from, {
            react: { text: '✅', key: m.key }
        });

    } catch (e) {
        console.error("⚠️ Drama download failed:", e?.response?.data || e?.message || e);

        try {
            await conn.sendMessage(from, {
                react: { text: '❌', key: m.key }
            });
        } catch {}

        reply(`❌ Video download failed! ${e?.message || "Try again later."}`);
    } finally {
        removeFile(tempFile);
        if (global.gc) global.gc();
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
        if (!text) {
            return reply(
                "🧸 Please provide a cartoon name!\n\nExample: `.cartoon Tom and Jerry`"
            );
        }

        const { default: yts } = await import('yt-search');

        let url = text;
        let vid = null;

        if (text.startsWith('http://') || text.startsWith('https://')) {
            if (!text.includes("youtube.com") && !text.includes("youtu.be")) {
                return reply("❌ Please provide a valid YouTube URL!");
            }

            const videoId = getVideoId(text);
            if (!videoId) return reply("❌ Invalid YouTube URL!");

            vid = await yts({ videoId });
            url = text;
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
            caption: `*🧸 CARTOON DOWNLOADER*
🎞️ *Title:* ${vid.title}
📺 *Channel:* ${vid.author?.name || 'Unknown'}
🕒 *Duration:* ${vid.timestamp}

*Status:* Downloading Cartoon...

> Powered by ERFAN-MD`
        }, { quoted: mek });

        const apiData = await getDeliriusVideoData(url);
        const title = apiData.title || vid.title;

        // Stream to a local temp file (not RAM), then send from disk
        const dl = await downloadToTemp(apiData.download, "cartoon");
        tempFile = dl.tempFile;

        const sentAs = await sendVideoSmart(conn, from, mek, {
            tempFile,
            size: dl.size,
            title,
            asDocument: false,
            caption: `🧸 *${title}*\n\n> Powered by ERFAN-MD`
        });

        if (sentAs === "document") {
            await conn.sendMessage(from, {
                text: "ℹ️ This video is too large for WhatsApp video format, so it was sent as a document."
            }, { quoted: mek });
        }

        removeFile(tempFile);
        tempFile = null;

        await conn.sendMessage(from, {
            react: { text: '✅', key: m.key }
        });

    } catch (e) {
        try {
            if (tempFile && fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
        } catch {}

        if (global.gc) global.gc();

        console.error("Error in .cartoon command:", e);
        reply("❌ Error occurred, please try again later!");

        await conn.sendMessage(from, {
            react: { text: '❌', key: m.key }
        });
    }
});

// ============================================
// COMMAND: MOVIE
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
        if (!text) {
            return reply(
                "❌ *Please provide a movie name!*\n\nExample: `.movie DJ Ganesh Chaturthi`"
            );
        }

        if (text.startsWith('http://') || text.startsWith('https://')) {
            return reply(
                "❌ URLs are not supported here.\nPlease send a movie *name* only."
            );
        }

        await conn.sendMessage(from, {
            react: { text: "⚡", key: mek.key }
        });

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

        const apiData = await getDeliriusVideoData(vid.url);
        const downloadURL = apiData.download;
        const title = apiData.title || vid.title;

        tempFile = path.join(os.tmpdir(), `movie_${Date.now()}.mp4`);

        const fileRes = await axios({
            method: 'GET',
            url: downloadURL,
            responseType: 'stream',
            timeout: 120000
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
            fileName: `${title.replace(/[\\/:*?"<>|]/g, "_").slice(0, 180)}.mp4`,
            caption: `🍿 *${title}*\n\n> Powered by ERFAN-MD`
        }, { quoted: mek });

        try {
            if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
        } catch {}

        if (global.gc) global.gc();
        tempFile = null;

        await conn.sendMessage(from, {
            react: { text: '✅', key: mek.key }
        });

    } catch (e) {
        try {
            if (tempFile && fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
        } catch {}

        if (global.gc) global.gc();

        await reply("❌ Error: " + (e?.message || e));

        await conn.sendMessage(from, {
            react: { text: '❌', key: mek.key }
        });
    }
});

// ============================================
// COMMAND: YTS (YOUTUBE SEARCH) - PRESERVED
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
        if (!text) {
            return reply(
                '*Please provide search words!*\n\nExample: .yts Alan Walker Faded'
            );
        }

        const { default: yts } = await import('yt-search');
        const search = await yts(text);

        if (!search.videos || !search.videos.length) {
            return reply('*No results found!*');
        }

        const results = search.videos.slice(0, 10);

        let mesaj = `*╭┈───〔 ${toSmallCaps('YouTube Search')} 〕┈───⊷*
*├▢ 🔎 Query:* ${text}
*├▢ 📊 Results:* ${search.videos.length}
*╰───────────────────⊷*

`;

        results.forEach((video, i) => {
            mesaj += `*${i + 1}. ${video.title}*
*├▢ 🔗 URL:* ${video.url}
*├▢ ⏱️ Duration:* ${video.timestamp}
*├▢ 👀 Views:* ${video.views?.toLocaleString() || 'N/A'}
*├▢ 👤 Channel:* ${video.author?.name || 'Unknown'}
*╰───────────────────⊷*

`;
        });

        mesaj += `*╭───⬡ ${toSmallCaps('Powered By')} ⬡ ───*
*┋ ⬡ ${toSmallCaps('ERFAN-MD')}*
*╰───────────────────⊷*`;

        await conn.sendMessage(from, {
            text: mesaj.trim()
        }, { quoted: mek });

    } catch (e) {
        console.error('Error in yts command:', e);
        reply(`*Error occurred while searching!*\n\`\`\`${e.message}\`\`\``);
    }
});
