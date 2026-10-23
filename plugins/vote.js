// chvote.js
// .vote <channel_post_url> <option>
//
// Channel poll par bot ke apne account se vote karta hai aur phir WhatsApp se confirm karta hai.
//
// Vote stanza (plaintext, kyunki channels E2E encrypted nahi hote):
//   <message to="CHANNEL@newsletter" id=".." server_id="POLL_SERVER_ID" type="poll">
//     <meta polltype="vote"/>
//     <votes><vote>{32-byte sha256(optionName)}</vote></votes>
//   </message>
//
// Poll padhna (options ke naam + tally):
//   <iq to="s.whatsapp.net" xmlns="newsletter" type="get">
//     <messages type="jid" jid="CHANNEL@newsletter" count="N" before="M"/>
//   </iq>
//
// Apna vote wapas padhna (confirm ke liye):
//   <iq to="s.whatsapp.net" xmlns="newsletter" type="get">
//     <my_addons limit="20" jid="CHANNEL@newsletter"/>
//   </iq>

import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { proto } from '@whiskeysockets/baileys';
import { cmd } from '../command.js';

const __filename = fileURLToPath(import.meta.url);
const WA_SERVER = 's.whatsapp.net';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

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
// anything else                                     -> mode "name" (option ka text)
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

    const name = input.startsWith('=') ? input.slice(1).trim() : input;
    if (!name) return null;
    return { mode: 'name', names: [name] };
}

// ===============================
// HASH HELPERS
// sha256 of the exact option name (normalize nahi karna)
// ===============================
function hashOption(name) {
    return crypto.createHash('sha256').update(Buffer.from(name, 'utf8')).digest();
}
const toHex = (bytes) => Buffer.from(bytes).toString('hex');

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

function childOf(node, tag) {
    return Array.isArray(node?.content) ? node.content.find(c => c?.tag === tag) : undefined;
}

function votesOf(messageNode) {
    const votesNode = childOf(messageNode, 'votes');
    if (!votesNode || !Array.isArray(votesNode.content)) return [];
    return votesNode.content
        .filter(v => v?.tag === 'vote' && v.content)
        .map(v => ({ hash: toHex(v.content), count: parseInt(v.attrs?.count || '0', 10) || 0 }));
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

// history response ke andar se post ID wala poll nikalo (options + tally)
function extractPollFromResult(result, postId) {
    let poll = null;
    walkNodes(result, node => {
        if (poll || node.tag !== 'message') return;
        if (String(node.attrs?.server_id) !== String(postId)) return;

        const plain = childOf(node, 'plaintext');
        if (!plain || !plain.content) return;

        try {
            const bytes = plain.content instanceof Uint8Array ? plain.content : Buffer.from(plain.content);
            const msg = proto.Message.decode(bytes);
            const creation = findPollCreation(msg);
            if (creation) {
                poll = {
                    name: creation.name || '',
                    options: creation.options.map(o => o.optionName || ''),
                    selectableCount: creation.selectableOptionsCount || 0,
                    tallies: votesOf(node)
                };
            }
        } catch {}
    });
    return poll;
}

// ===============================
// FETCH POLL (options ke naam + tally)
// ===============================
async function fetchChannelPoll(conn, jid, postId) {
    const idNum = Number(postId);
    const seenTags = new Set();
    let lastError = null;

    const variants = [
        { count: '1', before: String(idNum + 1) },
        { count: '20', before: String(idNum + 1) },
        { count: '50' }
    ];

    for (const v of variants) {
        try {
            const result = await conn.query({
                tag: 'iq',
                attrs: { id: conn.generateMessageTag(), to: WA_SERVER, xmlns: 'newsletter', type: 'get' },
                content: [{ tag: 'messages', attrs: { type: 'jid', jid, ...v } }]
            });
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
// READ MY OWN VOTE (confirmation)
// returns array of hex hashes, or null if nothing found
// ===============================
async function readMyVote(conn, jid, postId) {
    const result = await conn.query({
        tag: 'iq',
        attrs: { id: conn.generateMessageTag(), to: WA_SERVER, xmlns: 'newsletter', type: 'get' },
        content: [{ tag: 'my_addons', attrs: { limit: '50', jid } }]
    });

    let hashes = null;
    walkNodes(result, node => {
        if (node.tag !== 'message') return;
        if (String(node.attrs?.server_id) !== String(postId)) return;
        hashes = votesOf(node).map(v => v.hash);
    });
    return { hashes, tags: collectTags(result) };
}

// ===============================
// SEND VOTE  (returns the server ack node)
// ===============================
async function sendPollVote(conn, jid, postId, hashes) {
    return conn.query({
        tag: 'message',
        attrs: {
            to: jid,
            id: conn.generateMessageTag(),
            server_id: String(postId),
            type: 'poll'
        },
        content: [
            { tag: 'meta', attrs: { polltype: 'vote' } },
            {
                tag: 'votes',
                attrs: {},
                content: hashes.map(h => ({ tag: 'vote', attrs: {}, content: h }))
            }
        ]
    });
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
│ *Or type the option text:*
│ .vote link =Option text
╰─────────────────`;

const fmtTallies = (poll) =>
    poll.options.map((o, i) => {
        const t = poll.tallies.find(x => x.hash === toHex(hashOption(o)));
        return `${String.fromCharCode(65 + i)}. ${o} → ${t ? t.count : 0}`;
    }).join('\n');

// ===============================
// VOTE COMMAND
// ===============================
cmd({
    pattern: "xvote",
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

        // Poll padho (options ke naam + current tally)
        const { poll, seenTags, lastError } = await fetchChannelPoll(conn, jid, ids.postId);

        let optionNames = [];
        let optionLabels = [];

        if (parsed.mode === 'index') {
            if (!poll) {
                await conn.sendMessage(from, { react: { text: '❌', key: m.key } });
                return reply(`❌ *Poll options could not be fetched!*

*Channel:* ${channelName}
*Post:* ${ids.postId}
${lastError ? `*Last error:* ${lastError}\n` : ''}*Tags seen:* ${seenTags.join(', ') || 'none'}

Type the exact option text instead:
.vote ${url} =Option text`);
            }

            for (const idx of parsed.indexes) {
                if (idx > poll.options.length) {
                    await conn.sendMessage(from, { react: { text: '❌', key: m.key } });
                    return reply(`❌ *Option ${String.fromCharCode(64 + idx)} does not exist!*\n\n*Poll options:*\n${fmtTallies(poll)}`);
                }
                optionNames.push(poll.options[idx - 1]);
                optionLabels.push(`${String.fromCharCode(64 + idx)}. ${poll.options[idx - 1]}`);
            }
        } else {
            // name mode: agar poll mila to asli option se match karo (case-insensitive)
            for (const typed of parsed.names) {
                if (poll) {
                    const i = poll.options.findIndex(o => o.trim().toLowerCase() === typed.trim().toLowerCase());
                    if (i === -1) {
                        await conn.sendMessage(from, { react: { text: '❌', key: m.key } });
                        return reply(`❌ *No option named "${typed}" in this poll!*\n\n*Poll options:*\n${fmtTallies(poll)}`);
                    }
                    optionNames.push(poll.options[i]);
                    optionLabels.push(`${String.fromCharCode(65 + i)}. ${poll.options[i]}`);
                } else {
                    optionNames.push(typed);
                    optionLabels.push(typed);
                }
            }
        }

        if (poll && poll.selectableCount === 1 && optionNames.length > 1) {
            await conn.sendMessage(from, { react: { text: '❌', key: m.key } });
            return reply('❌ *This poll allows only one option!*');
        }

        // Vote bhejo
        const hashes = optionNames.map(hashOption);
        const ack = await sendPollVote(conn, jid, ids.postId, hashes);

        // Confirm: apna vote WhatsApp se wapas padho
        await sleep(2000);
        let confirmed = false;
        let readback = null;
        try {
            readback = await readMyVote(conn, jid, ids.postId);
            const mine = readback.hashes || [];
            confirmed = hashes.length > 0 && hashes.every(h => mine.includes(toHex(h)));
        } catch (e) {
            readback = { error: e.message };
        }

        // Naya tally
        let after = null;
        try {
            after = (await fetchChannelPoll(conn, jid, ids.postId)).poll;
        } catch {}

        const ackInfo = ack?.attrs ? JSON.stringify(ack.attrs) : 'no ack';

        if (confirmed) {
            await reply(`✅ *Vote confirmed by WhatsApp!*

📊 *Details:*
🎯 *Channel:* ${channelName}
📝 *Post:* ${ids.postId}
${poll?.name ? `❓ *Poll:* ${poll.name}\n` : ''}🗳️ *Voted:* ${optionLabels.join(', ')}
${after ? `\n📈 *Votes now:*\n${fmtTallies(after)}\n` : ''}
> *Powered By ERFAN*`);
            await conn.sendMessage(from, { react: { text: '✅', key: m.key } });
        } else {
            await conn.sendMessage(from, { react: { text: '⚠️', key: m.key } });
            await reply(`⚠️ *Vote sent, but WhatsApp did NOT register it.*

🎯 *Channel:* ${channelName}
📝 *Post:* ${ids.postId}
🗳️ *Tried:* ${optionLabels.join(', ')}

*Server ack:* ${ackInfo}
*My vote on server:* ${readback?.error ? 'error: ' + readback.error : (readback?.hashes ? readback.hashes.length + ' vote(s) found, not matching' : 'none')}
${after ? `\n📈 *Votes now:*\n${fmtTallies(after)}\n` : ''}
_Note: channel owner ka account apne hi channel ke poll par vote shayad na kar sake. Kisi doosre account/channel par test karo._`);
        }

    } catch (error) {
        console.error("Vote error:", error);
        await conn.sendMessage(from, { react: { text: '❌', key: m.key } });
        await reply(`❌ *Error processing request!*

*Error:* ${error.message}

${USAGE}`);
    }
});
