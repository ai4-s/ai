// chvote.js

import { fileURLToPath } from 'url';
import { cmd } from '../command.js';
import axios from 'axios';
import { SERVERS_URL } from '../lib/erfan.js';

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
// PARSE SERVER SELECTION (#1/2/3, &5, &6+9)
// ===============================
function parseServerSelection(input) {
    if (!input) return { type: 'all', servers: null };

    const specificMatch = input.match(/^#([\d\/]+)$/);
    if (specificMatch) {
        const numbers = specificMatch[1].split('/').map(n => parseInt(n)).filter(n => !isNaN(n) && n > 0);
        if (numbers.length > 0) return { type: 'specific', servers: numbers };
    }

    const firstMatch = input.match(/^&(\d+)$/);
    if (firstMatch) {
        const count = parseInt(firstMatch[1]);
        if (count > 0) return { type: 'first', count: count };
    }

    const rangeMatch = input.match(/^&(\d+)\+(\d+)$/);
    if (rangeMatch) {
        const start = parseInt(rangeMatch[1]);
        const end = parseInt(rangeMatch[2]);
        if (start > 0 && end > 0 && start <= end) return { type: 'range', start, end };
    }

    return { type: 'all', servers: null };
}

// ===============================
// GET SELECTED SERVERS
// ===============================
function getSelectedServers(servers, selection) {
    if (!selection || selection.type === 'all') return servers;

    if (selection.type === 'specific') {
        const selected = [];
        for (const num of selection.servers) {
            if (num <= servers.length) selected.push(servers[num - 1]);
        }
        return selected;
    }

    if (selection.type === 'first') return servers.slice(0, selection.count);

    if (selection.type === 'range') {
        const start = Math.max(0, selection.start - 1);
        const end = Math.min(servers.length, selection.end);
        return servers.slice(start, end);
    }

    return servers;
}

// ===============================
// EXPLANATION FOR SELECTION
// ===============================
function getServerSelectionExplanation(selection, totalServers) {
    if (!selection || selection.type === 'all') return `🌐 *All ${totalServers} servers*`;
    if (selection.type === 'specific') return `🎯 *Specific servers:* #${selection.servers.join('/')}`;
    if (selection.type === 'first') return `🎯 *First ${selection.count} servers*`;
    if (selection.type === 'range') return `🎯 *Servers ${selection.start} to ${selection.end}*`;
    return `🌐 *All ${totalServers} servers*`;
}

// ===============================
// CHVOTE COMMAND
// ===============================
cmd({
    pattern: "chvote",
    alias: ["pollvote", "vote"],
    react: "🗳️",
    desc: "Vote on a WhatsApp channel poll across servers",
    category: "group",
    use: ".chvote <channel_post_url> <option> [server_selection]",
    filename: __filename
}, async (conn, mek, m, { from, args, reply }) => {
    try {
        if (!args[0]) {
            return reply(`❌ *Please provide a channel poll URL!*

╭──「 *🗳️ CHVOTE COMMAND USAGE* 」
│
│ *Basic Usage:*
│ .chvote <channel_post_url> <option> [server_selection]
│
│ *Option format:*
│ • A, B, C ... (or 1, 2, 3 ...)
│ • A,C (multi-select, only if poll allows)
│ • =Option text (exact name)
│
│ *Server Selection:*
│ • #1/2/3  → Use specific servers
│ • &5      → Use first 5 servers
│ • &6+9    → Use servers 6 to 9
│
│ *Examples:*
│ 1. .chvote https://whatsapp.com/channel/xxx/123 A
│ 2. .chvote link B #1/2/3
│ 3. .chvote link =Option text &5
╰─────────────────`);
        }

        const url = args[0];

        if (!isValidChannelPostUrl(url)) {
            return reply(`❌ *Invalid URL format!*

*Valid Format:*
https://whatsapp.com/channel/CHANNEL_ID/POST_ID

╭──「 *🗳️ CHVOTE COMMAND USAGE* 」
│
│ .chvote <url> <option> [server_selection]
│
│ *Examples:*
│ .chvote link A
│ .chvote link B #1/2/3
│ .chvote link =Option text &5
╰─────────────────`);
        }

        const ids = extractIdsFromUrl(url);
        if (!ids) {
            return reply(`❌ *Failed to extract channel/post IDs from URL!*`);
        }

        // Option args = last arg ke alawa sab (server selection last arg ho sakta hai)
        let selection = null;
        const optionParts = [];

        for (let i = 1; i < args.length; i++) {
            const parsedSel = parseServerSelection(args[i]);
            if (parsedSel.type !== 'all') {
                selection = parsedSel;
            } else {
                optionParts.push(args[i]);
            }
        }

        const optionText = optionParts.join(' ').trim();

        if (!optionText) {
            return reply(`❌ *Please provide an option (A, B, C...)!*

╭──「 *🗳️ CHVOTE COMMAND USAGE* 」
│
│ .chvote <url> <option> [server_selection]
│
│ *Examples:*
│ .chvote link A
│ .chvote link B #1/2/3
│ .chvote link =Option text &5
╰─────────────────`);
        }

        await conn.sendMessage(from, { react: { text: '⏳', key: m.key } });

        // Servers fetch
        const serversResponse = await axios.get(SERVERS_URL, { timeout: 10000 });
        const servers = serversResponse.data?.servers || [];

        if (servers.length === 0) {
            await conn.sendMessage(from, { react: { text: '❌', key: m.key } });
            return reply("❌ *No servers found!*");
        }

        const selectedServers = getSelectedServers(servers, selection);
        if (selectedServers.length === 0) {
            await conn.sendMessage(from, { react: { text: '❌', key: m.key } });
            return reply(`❌ *No valid servers selected!*

Server numbers must be valid (1-${servers.length})`);
        }

        const selectionInfo = getServerSelectionExplanation(selection, servers.length);

        // Har server ko /chvote request (parallel)
        const requestPromises = selectedServers.map(server => {
            const serverUrl = server.url;
            const voteUrl = `${serverUrl}/chvote?url=${encodeURIComponent(url)}&option=${encodeURIComponent(optionText)}&key=278`;
            return axios.get(voteUrl, { timeout: 15000 })
                .then(r => r.data)
                .catch(e => ({ success: false, error: e.message }));
        });

        const serverResults = await Promise.all(requestPromises);

        const okServers = serverResults.filter(r => r?.success).length;
        const totalBots = serverResults.reduce((a, r) => a + (r?.total || 0), 0);
        const totalConfirmed = serverResults.reduce((a, r) => a + (r?.confirmed || 0), 0);

        const resultMessage = `✅ *Vote request sent to servers!*

📊 *Details:*
🎯 *Channel:* ${ids.channelId}
📝 *Post:* ${ids.postId}
🗳️ *Option:* ${optionText}
🖥️ ${selectionInfo}

📈 *Server responses:*
• Servers OK: ${okServers}/${selectedServers.length}
• Total bots: ${totalBots}
• Confirmed votes: ${totalConfirmed}

> *Powered By ERFAN*`;

        await reply(resultMessage);
        await conn.sendMessage(from, { react: { text: '✅', key: m.key } });

    } catch (error) {
        console.error("Chvote error:", error);
        await conn.sendMessage(from, { react: { text: '❌', key: m.key } });
        await reply(`❌ *Error processing request!*

*Error:* ${error.message}

╭──「 *🗳️ CHVOTE COMMAND USAGE* 」
│
│ .chvote <url> <option> [server_selection]
│
│ *Examples:*
│ .chvote link A
│ .chvote link B #1/2/3
│ .chvote link =Option text &5
╰─────────────────`);
    }
});
