// chvote.js
// .vote <channel_post_url> <option>
//
// Channel poll par bot ke apne account se vote karta hai.
// Vote ek plaintext <message type="poll"> stanza hota hai (channels E2E encrypted nahi hote):
//   <message to="CHANNEL@newsletter" id=".." server_id="POLL_SERVER_ID" type="poll">
//     <meta polltype="vote"/>
//     <votes><vote>{32-byte sha256(optionName)}</vote></votes>
//   </message>

import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { proto } from '@whiskeysockets/baileys';
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
// PARSE OPTION INPUT
// A / B / C ...  or 1 / 2 / 3 ...  or A,C (multi)  -> mode "index"
// anything else                                     -> mode "name" (exact option text)
// ===============================
function parseOptionInput(raw) {
    const input = (raw || '').trim();
    if (!input) return null;

    const tokens = input.split(',').map(t => t.trim()).filter(Boolean);
    const allIndexTokens = tokens.length > 0 && tokens.every(t => /^[a-zA-Z]$/.test(t) || /^\d{1,2}$/.test(t));

    if (allIndexTokens) {
        const indexes = [];
        for (const t of tokens) {
            const idx = /^\d+$/.test(t) ? parseInt(t) : t.toUpperCase().charCodeAt(0) - 64;
            if (idx < 1) return null;
            if (!indexes.includes(idx)) indexes.push(idx);
        }
        return { mode: 'index', indexes };
    }

    // exact option name (optionally written as =Option name)
    const name = input.startsWith('=') ? input.slice(1).trim() : input;
    if (!name) return null;
    return { mode: 'name', names: [name] };
}

// ===============================
// SHA-256 OF OPTION NAME (raw 32 bytes)
// Text ko bilkul waisa hi hash karna hai jaisa poll mein hai (normalize nahi karna)
// ===============================
function hashOption(name) {
    return crypto.createHash('sha256').update(Buffer.from(name, 'utf8')).digest();
}

// ===============================
// BINARY NODE HELPERS
// ===============================
function walkNodes(node, visit) {
    if (!node || typeof node !== 'object') return;
    if (typeof node.tag === 'string') visit(node);
    if (Array.isArray(node.content)) {
        for (const child of node.content) walkNodes(child, visit);
    }
}

function collectTags(node) {
    const tags = new Set();
    walkNodes(node, n => tags.add(n.tag));
    return [...tags];
}

// poll object dhoondo (pollCreationMessage / V2 / V3 / V4(future proof) / V5)
function findPollCreation(obj, depth = 0) {
    if (!obj || typeof obj !== 'object' || depth > 6) return null;
    for (const key of Object.keys(obj)) {
        const val = obj[key];
        if (/^pollCreationMessage/i.test(key) && val && Array.isArray(val.options) && val.options.length) {
            return val;
        }
    }
    for (const key of Object.keys(obj)) {
        const val = obj[key];
        if (val && typeof val === 'object') {
            const found = findPollCreation(val, depth + 1);
            if (found) return found;
        }
    }
    return null;
}

// fetch result ke andar se post ID wala poll nikalo
function extractPollFromResult(result, postId) {
    let poll = null;
    walkNodes(result, node => {
        if (poll || node.tag !== 'message') return;
        if (String(node.attrs?.server_id) !== String(postId)) return;

        const plain = Array.isArray(node.content)
            ? node.content.find(c => c?.tag === 'plaintext')
            : null;
        if (!plain || !plain.content) return;

        try {
            const bytes = plain.content instanceof Uint8Array ? plain.content : Buffer.from(plain.content);
            const msg = proto.Message.decode(bytes);
            const creation = findPollCreation(msg);
            if (creation) {
                poll = {
                    name: creation.name || '',
                    options: creation.options.map(o => o.optionName || ''),
                    selectableCount: creation.selectableOptionsCount || 0
                };
            }
        } catch {}
    });
    return poll;
}

// ===============================
// FETCH POLL (options ke naam)
// ===============================
async function fetchPoll(conn, jid, postId) {
    const idNum = Number(postId);
    const seenTags = new Set();

    const attempts = [
        () => conn.newsletterFetchMessages(jid, 5, undefined, idNum - 1),
        () => conn.newsletterFetchMessages(jid, 30, undefined, undefined),
        () => conn.query({
            tag: 'iq',
            attrs: { id: conn.generateMessageTag(), type: 'get', xmlns: 'newsletter', to: jid },
            content: [{ tag: 'messages', attrs: { type: 'jid', jid, count: '5', after: String(idNum - 1) } }]
        }),
        () => conn.query({
            tag: 'iq',
            attrs: { id: conn.generateMessageTag(), type: 'get', xmlns: 'newsletter', to: jid },
            content: [{ tag: 'messages', attrs: { type: 'jid', jid, count: '30' } }]
        })
    ];

    let lastError = null;
    for (const attempt of attempts) {
        try {
            const result = await attempt();
            collectTags(result).forEach(t => seenTags.add(t));
            const poll = extractPollFromResult(result, postId);
            if (poll) return { poll, seenTags: [...seenTags], lastError: null };
        } catch (e) {
            lastError = e.message;
        }
    }
    return { poll: null, seenTags: [...seenTags], lastError };
}

// ===============================
// SEND VOTE
// ===============================
async function sendPollVote(conn, jid, postId, optionNames) {
    const stanzaId = typeof conn.generateMessageTag === 'function'
        ? conn.generateMessageTag()
        : crypto.randomBytes(8).toString('hex').toUpperCase();

    await conn.query({
        tag: 'message',
        attrs: {
            to: jid,
            id: stanzaId,
            server_id: String(postId),
            type: 'poll'
        },
        content: [
            { tag: 'meta', attrs: { polltype: 'vote' } },
            {
                tag: 'votes',
                attrs: {},
                content: optionNames.map(name => ({ tag: 'vote', attrs: {}, content: hashOption(name) }))
            }
        ]
    });
    return stanzaId;
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
│ *Multiple:* A,C (only if poll allows)
│
│ *Examples:*
│ 1. .vote https://whatsapp.com/channel/xxx/123 A
│ 2. .vote https://whatsapp.com/channel/xxx/123 B
│
│ *If options can't be fetched, type exact option text:*
│ .vote link =Option text
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
        if (!args[0]) {
            return reply(`❌ *Please provide a channel poll URL!*\n\n${USAGE}`);
        }

        const url = args[0];

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

        const parsed = parseOptionInput(args.slice(1).join(' '));
        if (!parsed) {
            return reply(`❌ *Please provide an option (A, B, C...)!*\n\n${USAGE}`);
        }

        await conn.sendMessage(from, { react: { text: '⏳', key: m.key } });

        // Channel JID (same way as chreact)
        const channelMeta = await conn.newsletterMetadata("invite", ids.channelId);
        if (!channelMeta || !channelMeta.id) {
            await conn.sendMessage(from, { react: { text: '❌', key: m.key } });
            return reply('❌ *Channel not found or metadata failed!*');
        }
        const jid = channelMeta.id;
        const channelName = channelMeta.name || channelMeta.thread_metadata?.name?.text || ids.channelId;

        // Decide which option names to vote for
        let optionNames = [];
        let optionLabels = [];
        let pollTitle = '';

        if (parsed.mode === 'name') {
            optionNames = parsed.names;
            optionLabels = parsed.names;
        } else {
            const { poll, seenTags, lastError } = await fetchPoll(conn, jid, ids.postId);

            if (!poll) {
                await conn.sendMessage(from, { react: { text: '❌', key: m.key } });
                return reply(`❌ *Poll options could not be fetched!*

*Channel:* ${channelName}
*Post:* ${ids.postId}
${lastError ? `*Last error:* ${lastError}\n` : ''}*Tags seen:* ${seenTags.join(', ') || 'none'}

Type the exact option text instead:
.vote ${url} =Option text`);
            }

            pollTitle = poll.name;

            for (const idx of parsed.indexes) {
                if (idx > poll.options.length) {
                    await conn.sendMessage(from, { react: { text: '❌', key: m.key } });
                    const list = poll.options.map((o, i) => `${String.fromCharCode(65 + i)}. ${o}`).join('\n');
                    return reply(`❌ *Option ${String.fromCharCode(64 + idx)} does not exist!*\n\n*Poll options:*\n${list}`);
                }
                optionNames.push(poll.options[idx - 1]);
                optionLabels.push(`${String.fromCharCode(64 + idx)}. ${poll.options[idx - 1]}`);
            }

            if (poll.selectableCount === 1 && optionNames.length > 1) {
                await conn.sendMessage(from, { react: { text: '❌', key: m.key } });
                return reply('❌ *This poll allows only one option!*');
            }
        }

        // Send vote
        await sendPollVote(conn, jid, ids.postId, optionNames);

        await reply(`✅ *Vote sent successfully!*

📊 *Details:*
🎯 *Channel:* ${channelName}
📝 *Post:* ${ids.postId}
${pollTitle ? `❓ *Poll:* ${pollTitle}\n` : ''}🗳️ *Voted:* ${optionLabels.join(', ')}

> *Powered By ERFAN*`);
        await conn.sendMessage(from, { react: { text: '✅', key: m.key } });

    } catch (error) {
        console.error("Vote error:", error);
        await conn.sendMessage(from, { react: { text: '❌', key: m.key } });
        await reply(`❌ *Error processing request!*

*Error:* ${error.message}

${USAGE}`);
    }
});
