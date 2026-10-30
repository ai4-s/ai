// ERFAN MD
import { fileURLToPath } from 'url';
import { cmd } from '../command.js';
import axios from 'axios';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);











// ============================================
// ERFAN-MD - YTMP4 API FIX
// ============================================

const VIDEO_API_BASE = "https://rimi-xi.vercel.app/api/ytmp4";

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

async function getDeliriusVideoData(url) {
    const youtubeUrl = normalizeYouTubeUrl(url);

    const apiUrl =
        `${VIDEO_API_BASE}?url=${encodeURIComponent(youtubeUrl)}`;

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
                throw new Error(
                    data?.message || "API returned no download link"
                );
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
                `[ERFAN YTMP4] Attempt ${attempt}/3 failed:`,
                error.response?.status || error.message
            );

            if (attempt < 3) {
                await new Promise(resolve =>
                    setTimeout(resolve, attempt * 1500)
                );
            }
        }
    }

    throw lastError || new Error("Video API failed");
}

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

        const { default: yts } = await import("yt-search");
        let vid;
        let url = text.trim();

        if (/^https?:\/\//i.test(url)) {
            url = normalizeYouTubeUrl(url);
            const id = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/)[1];
            vid = await yts({ videoId: id });
        } else {
            const search = await yts(url);
            vid = search.videos?.[0];
            if (vid) url = vid.url;
        }

        if (!vid) return reply("❌ No video found!");

        await conn.sendMessage(from, {
            image: { url: vid.thumbnail },
            caption: `🎬 *VIDEO DOWNLOADER*

📌 *Title:* ${vid.title}
📺 *Channel:* ${vid.author?.name || "Unknown"}
⏱️ *Duration:* ${vid.timestamp || "N/A"}

⏳ Getting download link...
> Powered by ERFAN-MD`
        }, { quoted: mek });

        const data = await getDeliriusVideoData(url);

        // Download the actual MP4 instead of passing a remote URL
        // directly to WhatsApp.
        const response = await axios.get(data.download, {
            responseType: "arraybuffer",
            timeout: 120000,
            maxContentLength: 500 * 1024 * 1024,
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

        const safeTitle = data.title
            .replace(/[\\/:*?"<>|]/g, "_")
            .slice(0, 150);

        await conn.sendMessage(from, {
            video: buffer,
            mimetype: "video/mp4",
            fileName: `${safeTitle}.mp4`,
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

        return reply(
            error.response?.status === 502
                ? "❌ API/CDN returned 502 after retries. Check server logs and try again."
                : `❌ Video download failed: ${error.message}`
        );
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

    try {
        if (!text) {
            return reply(
                "🎬 Provide a drama name or YouTube link.\nExample: .drama Muskan 5"
            );
        }

        const { default: yts } = await import("yt-search");
        let vid;
        let url = text.trim();

        if (/^https?:\/\//i.test(url)) {
            url = normalizeYouTubeUrl(url);
            const id = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/)[1];
            vid = await yts({ videoId: id });
        } else {
            const search = await yts(url);
            vid = search.videos?.[0];
            if (vid) url = vid.url;
        }

        if (!vid) return reply("❌ No drama found!");

        const sent = await conn.sendMessage(from, {
            image: { url: vid.thumbnail },
            caption: `🎬 *DRAMA DOWNLOADER*

📌 *Title:* ${vid.title}
📺 *Channel:* ${vid.author?.name || "Unknown"}

Reply to this message:
1 - Send Video
2 - Send as Document

> ERFAN-MD`
        }, { quoted: mek });

        const msgId = sent.key.id;

        listener = async (msgData) => {
            const received = msgData.messages?.[0];
            if (!received?.message) return;

            const context =
                received.message.extendedTextMessage?.contextInfo;

            if (context?.stanzaId !== msgId) return;
            if (received.key.remoteJid !== from) return;

            const choice = (
                received.message.conversation ||
                received.message.extendedTextMessage?.text ||
                ""
            ).trim();

            if (!["1", "2"].includes(choice)) return;

            conn.ev.off("messages.upsert", listener);
            listener = null;

            let tempFile;

            try {
                await conn.sendMessage(from, {
                    react: { text: "⬇️", key: received.key }
                });

                const data = await getDeliriusVideoData(url);

                if (choice === "1") {
                    await conn.sendMessage(from, {
                        video: { url: data.download },
                        mimetype: "video/mp4",
                        caption: `🎬 *${data.title}*\n\n> ERFAN-MD`
                    }, { quoted: received });
                } else {
                    tempFile = path.join(
                        os.tmpdir(),
                        `drama_${Date.now()}.mp4`
                    );

                    const response = await axios.get(data.download, {
                        responseType: "arraybuffer",
                        timeout: 120000,
                        maxContentLength: 500 * 1024 * 1024
                    });

                    const buffer = Buffer.from(response.data);

                    if (buffer.length < 10000) {
                        throw new Error("Downloaded file is empty");
                    }

                    fs.writeFileSync(tempFile, buffer);

                    await conn.sendMessage(from, {
                        document: { url: tempFile },
                        mimetype: "video/mp4",
                        fileName: "ERFAN-Drama.mp4",
                        caption: `🎬 *${data.title}*\n\n> ERFAN-MD`
                    }, { quoted: received });
                }

                await conn.sendMessage(from, {
                    react: { text: "✅", key: received.key }
                });

            } catch (error) {
                console.error("[DRAMA ERROR]", error.response?.status, error.message);

                await conn.sendMessage(from, {
                    text: `❌ Drama download failed: ${error.message}`
                }, { quoted: received });

            } finally {
                if (tempFile && fs.existsSync(tempFile)) {
                    try {
                        fs.unlinkSync(tempFile);
                    } catch {}
                }
            }
        };

        conn.ev.on("messages.upsert", listener);

        setTimeout(() => {
            if (listener) {
                conn.ev.off("messages.upsert", listener);
                listener = null;
            }
        }, 60000);

    } catch (error) {
        if (listener) conn.ev.off("messages.upsert", listener);
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

        const { default: yts } = await import("yt-search");
        let vid;
        let url = text.trim();

        if (/^https?:\/\//i.test(url)) {
            url = normalizeYouTubeUrl(url);
            const id = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/)[1];
            vid = await yts({ videoId: id });
        } else {
            const search = await yts(`${url} cartoon`);
            vid = search.videos?.[0];
            if (vid) url = vid.url;
        }

        if (!vid) return reply("❌ No cartoon found!");

        await conn.sendMessage(from, {
            image: { url: vid.thumbnail },
            caption: `🧸 *CARTOON DOWNLOADER*

📌 *Title:* ${vid.title}
📺 *Channel:* ${vid.author?.name || "Unknown"}

⏳ Preparing download...
> ERFAN-MD`
        }, { quoted: mek });

        const data = await getDeliriusVideoData(url);

        // Download MP4 into memory to avoid remote media fetch issues.
        const response = await axios.get(data.download, {
            responseType: "arraybuffer",
            timeout: 120000,
            maxContentLength: 500 * 1024 * 1024,
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

        return reply(
            `❌ Cartoon download failed: ${error.message}`
        );
    }
});
