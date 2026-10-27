// ERFAN MD 
import { fileURLToPath } from 'url';
import { cmd } from '../command.js';
import axios from 'axios';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);

const VIDEO_API_BASE = "https://api.omegatech.app/api/download/YouTube";
const AUDIO_API_BASE = "https://rimi-xi.vercel.app/api/ytmp3";

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
// UPDATED AUDIO / VIDEO APIS
// ============================================

const getAudioAPIs = (url) => [
    {
        url: `${AUDIO_API_BASE}?url=${encodeURIComponent(url)}`,
        timeout: 30000
    }
];

const getNormalVideoAPIs = (url) => [
    `${VIDEO_API_BASE}?action=download&url=${encodeURIComponent(url)}`
];

const getFallbackVideoAPI = (url) =>
    `${VIDEO_API_BASE}?action=download&url=${encodeURIComponent(url)}`;

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
        if (!text) {
            return reply("❌ Please provide song name\nExample: .play Shape of You");
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
                    console.error(`⚠️ Audio send failed:`, sendErr.message);
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
// ============================================


 // ============================================
 // COMMAND: VIDEO — DELIRIUS API
 // ============================================
cmd({
    pattern: "video",
    alias: ["ytv", "ytmp4", "vd"],
    desc: "Search YouTube and download MP4 via Delirius API.",
    category: "download",
    react: "📹",
    filename: __filename
}, async (conn, mek, m, { from, text, reply }) => {
    try {
        if (!text) {
            return reply(
                "❌ Please provide a video name.\nExample: .video Yan Block 444"
            );
        }

        await conn.sendMessage(from, {
            react: { text: "⏳", key: m.key }
        });

        // 1. Search YouTube or use the provided YouTube link
        const { default: yts } = await import("yt-search");

        let videoUrl;
        let searchVideo = null;

        if (/^https?:\/\//i.test(text.trim())) {
            if (
                !text.includes("youtube.com") &&
                !text.includes("youtu.be")
            ) {
                await conn.sendMessage(from, {
                    react: { text: "❌", key: m.key }
                });

                return reply("❌ Please provide a valid YouTube URL!");
            }

            videoUrl = text.trim();

            const videoIdMatch = videoUrl.match(
                /(?:youtu\.be\/|youtube\.com\/(?:watch\?.*v=|shorts\/|embed\/|live\/))([a-zA-Z0-9_-]{11})/
            );

            if (videoIdMatch?.[1]) {
                try {
                    searchVideo = await yts({
                        videoId: videoIdMatch[1]
                    });
                } catch (error) {
                    console.log(
                        "[VIDEO] YouTube metadata lookup failed:",
                        error.message
                    );
                }
            }
        } else {
            const search = await yts(text.trim());
            searchVideo = search.videos?.[0];

            if (!searchVideo) {
                await conn.sendMessage(from, {
                    react: { text: "❌", key: m.key }
                });

                return reply("⚠️ No results found for the given video name.");
            }

            videoUrl = searchVideo.url;
        }

        console.log("[VIDEO] Download request:", videoUrl);

        // 2. Call Delirius YouTube MP4 API
        const apiUrl =
            "https://api.delirius.online/download/ytmp4" +
            `?url=${encodeURIComponent(videoUrl)}&format=360p`;

        const apiRes = await axios.get(apiUrl, {
            timeout: 45000,
            headers: {
                "User-Agent": "Mozilla/5.0"
            }
        });

        const data = apiRes.data;

        console.log(
            "[VIDEO] API response:",
            JSON.stringify({
                status: data?.status,
                hasData: Boolean(data?.data),
                hasDownload: Boolean(data?.data?.download),
                title: data?.data?.title
            })
        );

        // 3. Validate the API response
        if (
            !data ||
            data.status !== true ||
            !data.data ||
            !data.data.download
        ) {
            await conn.sendMessage(from, {
                react: { text: "❌", key: m.key }
            });

            return reply(
                "⚠️ The video API did not return a download link.\nPlease try again later."
            );
        }

        const vid = data.data;

        // 4. Prepare video details
        const title =
            vid.title ||
            searchVideo?.title ||
            "YouTube Video";

        const author =
            vid.author ||
            searchVideo?.author?.name ||
            "Unknown";

        const views =
            vid.views ??
            searchVideo?.views ??
            "N/A";

        const likes = vid.likes ?? "N/A";
        const format = vid.format || "360p MP4";

        const thumbnail =
            vid.image ||
            searchVideo?.thumbnail;

        const caption = `╭─────────────🎬
│ 🎥 *VIDEO DOWNLOADER*
│─────────────────────
│ 🎬 *Title:* ${title}
│ 👤 *Author:* ${author}
│ 👀 *Views:* ${views}
│ 👍 *Likes:* ${likes}
│ 🎞️ *Format:* ${format}
╰─────────────🎬
🔗 *Powered By ERFAN-MD*`;

        // 5. Send thumbnail and information when available
        if (thumbnail) {
            try {
                await conn.sendMessage(from, {
                    image: { url: thumbnail },
                    caption
                }, { quoted: mek });
            } catch (thumbnailError) {
                console.log(
                    "[VIDEO] Thumbnail could not be sent:",
                    thumbnailError.message
                );

                await conn.sendMessage(from, {
                    text: caption
                }, { quoted: mek });
            }
        } else {
            await conn.sendMessage(from, {
                text: caption
            }, { quoted: mek });
        }

        // 6. Download the MP4 into a buffer
        const videoRes = await axios.get(vid.download, {
            responseType: "arraybuffer",
            timeout: 120000,
            maxContentLength: 500 * 1024 * 1024,
            maxBodyLength: 500 * 1024 * 1024,
            headers: {
                "User-Agent":
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
                    "AppleWebKit/537.36 (KHTML, like Gecko) " +
                    "Chrome/120.0.0.0 Safari/537.36",
                "Referer": "https://www.youtube.com/",
                "Accept": "*/*"
            }
        });

        const videoBuffer = Buffer.from(videoRes.data);

        if (!videoBuffer.length || videoBuffer.length < 10000) {
            await conn.sendMessage(from, {
                react: { text: "❌", key: m.key }
            });

            return reply(
                "❌ The downloaded video file is empty or invalid. Please try again."
            );
        }

        const contentType =
            videoRes.headers?.["content-type"] || "";

        if (
            contentType.includes("text/html") ||
            contentType.includes("application/json")
        ) {
            await conn.sendMessage(from, {
                react: { text: "❌", key: m.key }
            });

            return reply(
                "❌ The download link returned an invalid file instead of a video. Please try again."
            );
        }

        // 7. Send the video to WhatsApp
        const safeTitle = title
            .replace(/[\\/:*?"<>|]/g, "_")
            .slice(0, 180);

        await conn.sendMessage(from, {
            video: videoBuffer,
            mimetype: "video/mp4",
            fileName: `${safeTitle}.mp4`,
            caption:
                `🎬 *${title}*\n` +
                `🎞️ ${format}\n` +
                `🔗 *Powered By ERFAN-MD*`
        }, { quoted: mek });

        // 8. Success reaction
        await conn.sendMessage(from, {
            react: { text: "✅", key: m.key }
        });

    } catch (error) {
        console.error(
            "[VIDEO] Download error:",
            error?.response?.data || error?.message || error
        );

        await conn.sendMessage(from, {
            react: { text: "❌", key: m.key }
        });

        const errorMessage = error?.code === "ECONNABORTED"
            ? "The video API timed out. Please try again."
            : "The video could not be downloaded. Please try again later.";

        return reply(`❌ ${errorMessage}`);
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
        if (!text) {
            return reply("🎶 Please provide a YouTube video name or link.\n\nExample: `.song Alone - Alan Walker`");
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
                    const apiUrl = getFallbackVideoAPI(url);
                    const response = await axios.get(apiUrl, {
                        timeout: 30000
                    });

                    if (response.data?.success === true && response.data?.data?.url) {
                        const videoUrl = response.data.data.url;
                        const title = response.data.data.title || vid.title;

                        if (!asDocument) {
                            await conn.sendMessage(from, {
                                video: { url: videoUrl },
                                caption: `🎬 *${title}*\n\n> Powered by ERFAN-MD`
                            }, { quoted: received });
                        } else {
                            tempFile = path.join(os.tmpdir(), `video_${Date.now()}.mp4`);

                            const fileRes = await axios({
                                method: 'GET',
                                url: videoUrl,
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
                                fileName: `${title}.mp4`,
                                caption: `📄 *${title}*\n📹 Video Document\n\n> Powered by ERFAN-MD`
                            }, { quoted: received });

                            try {
                                if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
                            } catch {}

                            tempFile = null;
                        }

                        success = true;
                    }
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
// COMMAND: DRAMA (INTERACTIVE VIDEO)
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
        if (!text) {
            return reply("🎬 Please provide a drama/movie name or link.\n\nExample: `.drama Muskan 5`");
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

        const sent = await conn.sendMessage(from, {
            image: { url: vid.thumbnail },
            caption
        }, { quoted: mek });

        const msgId = sent.key.id;

        const dramaListener = async (msgData) => {
            const received = msgData.messages[0];
            if (!received.message) return;

            const selected =
                received.message.conversation ||
                received.message.extendedTextMessage?.text;

            const replyToBot =
                received.message.extendedTextMessage?.contextInfo?.stanzaId === msgId;

            if (!replyToBot) return;

            conn.ev.off("messages.upsert", dramaListener);

            await conn.sendMessage(from, {
                react: { text: '⬇️', key: received.key }
            });

            const cleanSelect = selected?.trim();

            if (!["1", "2"].includes(cleanSelect)) {
                return conn.sendMessage(from, {
                    text: `❌ *Invalid selection!*
Please reply with:
1️⃣ for Video (MP4)
2️⃣ for Video as Document`
                }, { quoted: received });
            }

            const asDocument = cleanSelect === "2";
            let tempFile = null;

            try {
                const apiUrl = getFallbackVideoAPI(url);
                const response = await axios.get(apiUrl, {
                    timeout: 30000
                });

                if (response.data?.success !== true || !response.data?.data?.url) {
                    throw new Error("The video API did not return a download URL.");
                }

                const videoUrl = response.data.data.url;
                const title = response.data.data.title || vid.title;

                if (!asDocument) {
                    await conn.sendMessage(from, {
                        video: { url: videoUrl },
                        caption: `🎬 *${title}*\n\n> Powered by ERFAN-MD`
                    }, { quoted: received });
                } else {
                    tempFile = path.join(os.tmpdir(), `video_${Date.now()}.mp4`);

                    const fileRes = await axios({
                        method: 'GET',
                        url: videoUrl,
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
                        fileName: `${title}.mp4`,
                        caption: `🍿 *${title}*\n\n> Powered by ERFAN-MD`
                    }, { quoted: received });

                    try {
                        if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
                    } catch {}

                    tempFile = null;
                }

                await conn.sendMessage(from, {
                    react: { text: '✅', key: received.key }
                });

            } catch (e) {
                console.error("⚠️ Drama download failed:", e.message);

                try {
                    if (tempFile && fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
                } catch {}

                await conn.sendMessage(from, {
                    text: "❌ Video download failed! Try again later."
                }, { quoted: received });
            }
        };

        conn.ev.on("messages.upsert", dramaListener);

        setTimeout(() => {
            conn.ev.off("messages.upsert", dramaListener);
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
            return reply("🧸 Please provide a cartoon name!\n\nExample: `.cartoon Tom and Jerry`");
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

        const apiUrl = getFallbackVideoAPI(url);
        const response = await axios.get(apiUrl, {
            timeout: 30000
        });

        if (response.data?.success !== true || !response.data?.data?.url) {
            return reply("❌ Cartoon download failed! Try again later.");
        }

        const videoUrl = response.data.data.url;
        const title = response.data.data.title || vid.title;

        await conn.sendMessage(from, {
            video: { url: videoUrl },
            caption: `🧸 *${title}*\n\n> Powered by ERFAN-MD`
        }, { quoted: mek });

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
    pattern: "movie",
    alias: ["playmovie", "dlmovie"],
    desc: "Fast auto search with DP info and download full movie as document safely",
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

        const apiUrl = `${VIDEO_API_BASE}?action=download&url=${encodeURIComponent(vid.url)}`;

        const response = await axios.get(apiUrl, {
            timeout: 30000
        });

        if (response.data?.success !== true || !response.data?.data?.url) {
            return reply("❌ Failed to get movie! Try again later.");
        }

        const downloadURL = response.data.data.url;
        const title = response.data.data.title || vid.title;

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
            fileName: `${title}.mp4`,
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
// COMMAND: YTS (YOUTUBE SEARCH)
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
            return reply('*Please provide search words!*\n\nExample: .yts Alan Walker Faded');
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
