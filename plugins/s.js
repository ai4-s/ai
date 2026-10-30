// ERFAN MD
import { fileURLToPath } from 'url';
import { cmd } from '../command.js';
import axios from 'axios';

const __filename = fileURLToPath(import.meta.url);

// ============================================
// ERFAN-MD - YTMP4 API (SHARED HELPERS)
// ============================================

const VIDEO_API_BASE = "https://rimi-xi.vercel.app/api/ytmp4";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function normalizeYouTubeUrl(url) {
    if (!url || typeof url !== "string") {
        throw new Error("YouTube URL missing");
    }

    const match = url.match(
        /(?:youtu\.be\/|youtube\.com\/(?:watch\?.*?v=|shorts\/|embed\/|live\/|v\/))([a-zA-Z0-9_-]{11})/
    );

    if (!match) {
        throw new Error("Invalid YouTube URL");
    }

    return `https://www.youtube.com/watch?v=${match[1]}`;
}

// Ask the API for a download link (with retries)
async function getDeliriusVideoData(url) {
    const youtubeUrl = normalizeYouTubeUrl(url);
    const apiUrl = `${VIDEO_API_BASE}?url=${encodeURIComponent(youtubeUrl)}`;

    let lastError;

    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            const response = await axios.get(apiUrl, {
                timeout: 60000,
                headers: {
                    "User-Agent": "Mozilla/5.0",
                    "Accept": "application/json"
                }
            });

            const data = response.data;

            if (
                data?.ok !== true ||
                typeof data?.download !== "string" ||
                !/^https?:\/\//i.test(data.download)
            ) {
                throw new Error(data?.message || "API returned no download link");
            }

            return {
                title: data.title || "YouTube Video",
                download: data.download,
                quality: data.quality || "360p",
                author: data.author || "Unknown",
                thumbnail: data.thumbnail || null,
                duration: data.duration || null
            };
        } catch (error) {
            lastError = error;
            console.error(
                `[ERFAN YTMP4] API attempt ${attempt}/3 failed:`,
                error.response?.status || error.message
            );
            if (attempt < 3) await sleep(attempt * 1500);
        }
    }

    throw lastError || new Error("Video API failed");
}

// Get link + download the real MP4 into a buffer.
// If the CDN fails (502, expired link, HTML error page...),
// it asks the API for a FRESH link and tries again.
async function fetchVideoBuffer(youtubeUrl, maxAttempts = 3) {
    let lastError;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            const data = await getDeliriusVideoData(youtubeUrl);

            const response = await axios.get(data.download, {
                responseType: "arraybuffer",
                timeout: 120000,
                maxContentLength: 500 * 1024 * 1024,
                maxBodyLength: 500 * 1024 * 1024,
                headers: { "User-Agent": "Mozilla/5.0" }
            });

            const buffer = Buffer.from(response.data);
            const contentType = response.headers?.["content-type"] || "";

            if (
                buffer.length < 10000 ||
                /text\/html|application\/json/i.test(contentType)
            ) {
                throw new Error("Invalid or empty MP4 response");
            }

            return { data, buffer };
        } catch (error) {
            lastError = error;
            console.error(
                `[ERFAN YTMP4] Download attempt ${attempt}/${maxAttempts} failed:`,
                error.response?.status || error.message
            );
            if (attempt < maxAttempts) await sleep(attempt * 2000);
        }
    }

    throw lastError || new Error("Video download failed");
}

// Search by name or resolve a YouTube link
async function resolveVideo(text, searchSuffix = "") {
    const { default: yts } = await import("yt-search");
    let vid;
    let url = text.trim();

    if (/^https?:\/\//i.test(url)) {
        url = normalizeYouTubeUrl(url);
        const id = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/)[1];
        vid = await yts({ videoId: id });
    } else {
        const search = await yts(searchSuffix ? `${url} ${searchSuffix}` : url);
        vid = search.videos?.[0];
        if (vid) url = vid.url;
    }

    return { vid, url };
}

const safeName = (title) =>
    String(title || "video").replace(/[\\/:*?"<>|]/g, "_").slice(0, 150);

// ============================================
// VIDEO COMMAND
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
        if (!text) {
            return reply(
                "🎥 Provide a YouTube link or video name.\nExample: .video Alone Marshmello"
            );
        }

        const { vid, url } = await resolveVideo(text);
        if (!vid) return reply("❌ No video found!");

        await conn.sendMessage(from, {
            image: { url: vid.thumbnail },
            caption: `🎬 *VIDEO DOWNLOADER*

📌 *Title:* ${vid.title}
📺 *Channel:* ${vid.author?.name || "Unknown"}
⏱️ *Duration:* ${vid.timestamp || "N/A"}

⏳ Downloading video...
> Powered by ERFAN-MD`
        }, { quoted: mek });

        const { data, buffer } = await fetchVideoBuffer(url);

        await conn.sendMessage(from, {
            video: buffer,
            mimetype: "video/mp4",
            fileName: `${safeName(data.title)}.mp4`,
            caption: `🎬 *${data.title}*\n📹 ${data.quality}\n\n> ERFAN-MD`
        }, { quoted: mek });

        await conn.sendMessage(from, {
            react: { text: "✅", key: m.key }
        });

    } catch (error) {
        console.error(
            "[VIDEO ERROR]",
            error.response?.status,
            error.response?.data || error.message
        );

        await conn.sendMessage(from, {
            react: { text: "❌", key: m.key }
        });

        return reply(`❌ Video download failed: ${error.message}`);
    }
});

// ============================================
// DRAMA COMMAND
// ============================================

cmd({
    pattern: "drama",
    alias: ["film", "series"],
    desc: "Download YouTube drama",
    category: "download",
    react: "🎬",
    filename: __filename
}, async (conn, mek, m, { from, text, reply }) => {
    let listener;
    let timer;

    const cleanup = () => {
        if (listener) {
            conn.ev.off("messages.upsert", listener);
            listener = null;
        }
        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
    };

    try {
        if (!text) {
            return reply(
                "🎬 Provide a drama name or YouTube link.\nExample: .drama Muskan 5"
            );
        }

        const { vid, url } = await resolveVideo(text);
        if (!vid) return reply("❌ No drama found!");

        const sent = await conn.sendMessage(from, {
            image: { url: vid.thumbnail },
            caption: `🎬 *DRAMA DOWNLOADER*

📌 *Title:* ${vid.title}
📺 *Channel:* ${vid.author?.name || "Unknown"}
⏱️ *Duration:* ${vid.timestamp || "N/A"}

Reply to this message:
1 - Send Video
2 - Send as Document

> ERFAN-MD`
        }, { quoted: mek });

        const msgId = sent.key.id;

        listener = async (msgData) => {
            const received = msgData.messages?.[0];
            if (!received?.message) return;
            if (received.key.remoteJid !== from) return;

            const context = received.message.extendedTextMessage?.contextInfo;
            if (context?.stanzaId !== msgId) return;

            const choice = (
                received.message.conversation ||
                received.message.extendedTextMessage?.text ||
                ""
            ).trim();

            if (!["1", "2"].includes(choice)) return;

            cleanup();

            try {
                await conn.sendMessage(from, {
                    react: { text: "⬇️", key: received.key }
                });

                // Same reliable method as cartoon: download MP4 into a buffer
                const { data, buffer } = await fetchVideoBuffer(url);

                if (choice === "1") {
                    await conn.sendMessage(from, {
                        video: buffer,
                        mimetype: "video/mp4",
                        fileName: `${safeName(data.title)}.mp4`,
                        caption: `🎬 *${data.title}*\n📹 ${data.quality}\n\n> ERFAN-MD`
                    }, { quoted: received });
                } else {
                    await conn.sendMessage(from, {
                        document: buffer,
                        mimetype: "video/mp4",
                        fileName: `${safeName(data.title)}.mp4`,
                        caption: `🎬 *${data.title}*\n📹 ${data.quality}\n\n> ERFAN-MD`
                    }, { quoted: received });
                }

                await conn.sendMessage(from, {
                    react: { text: "✅", key: received.key }
                });

            } catch (error) {
                console.error(
                    "[DRAMA ERROR]",
                    error.response?.status,
                    error.message
                );

                await conn.sendMessage(from, {
                    react: { text: "❌", key: received.key }
                });

                await conn.sendMessage(from, {
                    text: `❌ Drama download failed: ${error.message}`
                }, { quoted: received });
            }
        };

        conn.ev.on("messages.upsert", listener);

        // Stop waiting for a reply after 3 minutes
        timer = setTimeout(cleanup, 3 * 60 * 1000);

    } catch (error) {
        cleanup();
        console.error("[DRAMA SETUP ERROR]", error);
        return reply(`❌ Drama error: ${error.message}`);
    }
});

// ============================================
// CARTOON COMMAND
// ============================================

cmd({
    pattern: "cartoon",
    alias: ["toon", "kids"],
    desc: "Download YouTube cartoon",
    category: "download",
    react: "🧸",
    filename: __filename
}, async (conn, mek, m, { from, text, reply }) => {
    try {
        if (!text) {
            return reply(
                "🧸 Provide a cartoon name or YouTube link.\nExample: .cartoon Tom and Jerry"
            );
        }

        const { vid, url } = await resolveVideo(text, "cartoon");
        if (!vid) return reply("❌ No cartoon found!");

        await conn.sendMessage(from, {
            image: { url: vid.thumbnail },
            caption: `🧸 *CARTOON DOWNLOADER*

📌 *Title:* ${vid.title}
📺 *Channel:* ${vid.author?.name || "Unknown"}

⏳ Preparing download...
> ERFAN-MD`
        }, { quoted: mek });

        const { data, buffer } = await fetchVideoBuffer(url);

        await conn.sendMessage(from, {
            video: buffer,
            mimetype: "video/mp4",
            fileName: "ERFAN-Cartoon.mp4",
            caption: `🧸 *${data.title}*\n\n> ERFAN-MD`
        }, { quoted: mek });

        await conn.sendMessage(from, {
            react: { text: "✅", key: m.key }
        });

    } catch (error) {
        console.error(
            "[CARTOON ERROR]",
            error.response?.status,
            error.response?.data || error.message
        );

        await conn.sendMessage(from, {
            react: { text: "❌", key: m.key }
        });

        return reply(`❌ Cartoon download failed: ${error.message}`);
    }
});
