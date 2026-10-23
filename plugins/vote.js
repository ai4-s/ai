// chvote.js

import { fileURLToPath } from 'url';
import { cmd } from '../command.js';

const __filename = fileURLToPath(import.meta.url);

// ===============================
// VALIDATE CHANNEL POST URL
// ===============================
function isValidChannelPostUrl(url) {
    const pattern = /^https?:\/\/(?:www\.)?whatsapp\.com\/channel\/[a-zA-Z0-9]+\/\d+$/;
    return pattern.test(url);
}

// ===============================
// EXTRACT CHANNEL ID + POST ID
// ===============================
function extractIdsFromUrl(url) {
    const match = url.match(/\/channel\/([a-zA-Z0-9]+)\/(\d+)/);
    if (match) {
        return { channelId: match[1], postId: match[2] };
    }
    return null;
}

// ===============================
// PARSE OPTION (A/B/C... or 1/2/3...)
// returns { label: 'A', index: 1 } (index is 1-based)
// ===============================
function parseOption(input) {
    if (!input) return null;
    const v = input.trim();

    if (/^[a-zA-Z]$/.test(v)) {
        return { label: v.toUpperCase(), index: v.toUpperCase().charCodeAt(0) - 64 };
    }
    if (/^\d+$/.test(v) && parseInt(v) > 0) {
        const n = parseInt(v);
        return { label: String.fromCharCode(64 + n), index: n };
    }
    return null;
}

// ===============================
// USAGE TEXT
// ===============================
const USAGE = `╭──「 *🗳️ VOTE COMMAND USAGE* 」
│
│ *Basic Usage:*
│ .vote <channel_post_url> <option>
│
│ *Option:* A, B, C ... (or 1, 2, 3 ...)
│
│ *Examples:*
│ 1. .vote https://whatsapp.com/channel/xxx/123 A
│ 2. .vote https://whatsapp.com/channel/xxx/123 B
╰─────────────────`;

// ===============================
// VOTE COMMAND
// ===============================
cmd({
    pattern: "vote",
    alias: ["chvote", "pollvote"],
    react: "🗳️",
    desc: "Vote on a WhatsApp channel poll",
    category: "group",
    use: ".vote <channel_post_url> <option>",
    filename: __filename
}, async (conn, mek, m, { from, args, reply }) => {
    try {
        // No arguments
        if (!args[0]) {
            return reply(`❌ *Please provide a channel poll URL!*\n\n${USAGE}`);
        }

        const url = args[0];

        // Invalid URL
        if (!isValidChannelPostUrl(url)) {
            return reply(`❌ *Invalid URL format!*

*Valid Format:*
https://whatsapp.com/channel/CHANNEL_ID/POST_ID

${USAGE}`);
        }

        const ids = extractIdsFromUrl(url);
        if (!ids) {
            return reply(`❌ *Failed to extract channel/post IDs from URL!*\n\n${USAGE}`);
        }

        // Option is required
        const option = parseOption(args[1]);
        if (!option) {
            return reply(`❌ *Please provide an option (A, B, C...)!*\n\n${USAGE}`);
        }

        await conn.sendMessage(from, { react: { text: '⏳', key: m.key } });

        // =====================================================
        // TODO: server request yahan aayegi (baad mein banayenge)
        // Available values:
        //   url            -> full channel post link
        //   ids.channelId  -> channel ID
        //   ids.postId     -> post ID
        //   option.label   -> 'A' / 'B' ...
        //   option.index   -> 1 / 2 ...
        // =====================================================

        const resultMessage = `✅ *Vote command received!*

📊 *Details:*
🎯 *Channel:* ${ids.channelId}
📝 *Post:* ${ids.postId}
🗳️ *Option:* ${option.label}

> *Powered By ERFAN*`;

        await reply(resultMessage);
        await conn.sendMessage(from, { react: { text: '✅', key: m.key } });

    } catch (error) {
        console.error("Vote error:", error);
        await conn.sendMessage(from, { react: { text: '❌', key: m.key } });
        await reply(`❌ *Error processing request!*

*Error:* ${error.message}

${USAGE}`);
    }
});
