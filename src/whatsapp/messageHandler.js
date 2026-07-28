const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const memory = require('../ai/memory');
const { generateReply } = require('../ai/provider');
const { sessions: sessionDb, quickReplies: quickRepliesDb, campaigns: campaignsDb, autoReplyLogs, settings: settingsDb, blacklist: blacklistDb } = require('../db/database');
const sessionManager = require('./sessionManager');
const fs = require('fs');
const path = require('path');

const lastReplyTimestamps = new Map();

// Fix #13: Prune stale cooldown entries every 15 minutes
setInterval(() => {
    const cutoff = Date.now() - 10 * 60 * 1000; // 10 minutes
    for (const [key, ts] of lastReplyTimestamps) {
        if (ts < cutoff) lastReplyTimestamps.delete(key);
    }
}, 15 * 60 * 1000);

// Fix #24: Mask phone numbers in logs (show first 2 + last 4 digits)
function maskPhone(phone) {
    if (!phone || phone.length < 6) return '***';
    return phone.slice(0, 2) + '****' + phone.slice(-4);
}

// Fix #18: Cached anti-ban settings (refreshed via refreshSettings())
let _cachedSettings = null;
function getAntiBanSettings() {
    if (_cachedSettings) return _cachedSettings;
    return refreshSettings();
}
function refreshSettings() {
    const antiBanEnabled = settingsDb.get('anti_ban_enabled');
    _cachedSettings = {
        enabled: antiBanEnabled === undefined || antiBanEnabled === '1' || antiBanEnabled === 'true' || antiBanEnabled === true,
        ignoreBots: (() => {
            const v = settingsDb.get('anti_ban_ignore_bots');
            return v === undefined || v === '1' || v === 'true' || v === true;
        })(),
        cooldownSec: parseInt(settingsDb.get('anti_ban_cooldown_sec')) || 30,
        typingDelayMin: parseInt(settingsDb.get('anti_ban_typing_delay_min')) || 3,
        typingDelayMax: parseInt(settingsDb.get('anti_ban_typing_delay_max')) || 6,
    };
    return _cachedSettings;
}

function isDndActive() {
    const enabled = settingsDb.get('dnd_enabled');
    if (enabled !== '1' && enabled !== 'true') return false;
    const startTime = settingsDb.get('dnd_start_time') || '22:00';
    const endTime = settingsDb.get('dnd_end_time') || '08:00';
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const [startH, startM] = startTime.split(':').map(Number);
    const [endH, endM] = endTime.split(':').map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;
    if (startMinutes > endMinutes) return currentMinutes >= startMinutes || currentMinutes < endMinutes;
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
}

// ─── Webhook Notifier (lazy-loaded from server.js export) ───
let _notifyWebhooks = null;
function notifyWebhooks(event, data) {
    // Webhooks are notified from server.js; this is a no-op placeholder
    // to keep the interface consistent for future direct-from-handler notifications
}

async function simulateTypingDelay(sock, jid) {
    const settings = getAntiBanSettings();
    if (!settings.enabled) return;

    const actualMin = Math.min(settings.typingDelayMin, settings.typingDelayMax);
    const actualMax = Math.max(settings.typingDelayMin, settings.typingDelayMax);
    const delayMs = Math.floor(Math.random() * (actualMax - actualMin + 1) + actualMin) * 1000;

    try {
        await sock.presenceSubscribe(jid);
        await sock.sendPresenceUpdate('composing', jid);
        await new Promise(r => setTimeout(r, delayMs));
        await sock.sendPresenceUpdate('paused', jid);
    } catch (e) { /* ignore presence errors */ }
}

/**
 * Check if an incoming message matches a campaign button reply.
 * Returns the button's reply content if matched, null otherwise.
 */
function checkCampaignButtonReply(contactPhone, content) {
    const trimmed = content.trim();

    // Get recent campaigns that have buttons configured
    const campaigns = campaignsDb.getActiveCampaignsWithButtons();

    for (const campaign of campaigns) {
        let buttons;
        try {
            buttons = JSON.parse(campaign.buttons_config);
        } catch (e) { continue; }

        if (!buttons || !buttons.length) continue;

        // Check if this contact was a recipient of this campaign
        const recipients = campaignsDb.getRecentRecipients(campaign.id);
        const phoneClean = contactPhone.replace(/[^0-9]/g, '');
        const isRecipient = recipients.some(r => r.replace(/[^0-9]/g, '') === phoneClean);
        if (!isRecipient) continue;

        // Check if the reply matches a button number or label
        for (let i = 0; i < buttons.length; i++) {
            const btn = buttons[i];
            const num = String(i + 1);
            const label = (btn.label || btn.body || '').toLowerCase().trim();

            if (trimmed === num || trimmed.toLowerCase() === label) {
                return btn.reply || btn.body || null;
            }
        }
    }
    return null;
}

// ═══════════════════════════════════════
// Chat Commands — Group Management
// ═══════════════════════════════════════

function getAdminPhones() {
    const raw = settingsDb.get('admin_phones') || '';
    return raw.split(',').map(p => p.replace(/[^0-9]/g, '').trim()).filter(Boolean);
}

function isAdmin(phone) {
    const admins = getAdminPhones();
    if (admins.length === 0) return true; // If no admin configured, allow all
    return admins.includes(phone.replace(/[^0-9]/g, ''));
}

function findGroupByName(groups, name) {
    const lower = name.toLowerCase().trim();
    return groups.find(g => g.name.toLowerCase().trim() === lower);
}

async function handleChatCommand(sessionId, contactPhone, jid, content, sock, msg) {
    // Only admins can use commands
    if (!isAdmin(contactPhone)) {
        await sock.sendMessage(jid, { text: 'You are not authorized to use commands.' }, { quoted: msg });
        return true;
    }

    const parts = content.replace(/^[\/!]/, '').trim().split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1);

    try {
        switch (cmd) {
            // ─── /groups — List all WhatsApp groups ───
            case 'groups': {
                const groups = await sessionManager.getWhatsAppGroups(sessionId);
                if (!groups.length) {
                    await sock.sendMessage(jid, { text: 'No WhatsApp groups found.' }, { quoted: msg });
                } else {
                    let text = `*WhatsApp Groups (${groups.length})*\n\n`;
                    groups.forEach((g, i) => {
                        text += `${i + 1}. ${g.name}\n   Members: ${g.participantCount}\n   ID: ${g.id}\n\n`;
                    });
                    await sock.sendMessage(jid, { text }, { quoted: msg });
                }
                return true;
            }

            // ─── /members <group name> — List group members ───
            case 'members': {
                const groupName = args.join(' ');
                if (!groupName) {
                    await sock.sendMessage(jid, { text: 'Usage: /members <group name>' }, { quoted: msg });
                    return true;
                }
                const groups = await sessionManager.getWhatsAppGroups(sessionId);
                const group = findGroupByName(groups, groupName);
                if (!group) {
                    await sock.sendMessage(jid, { text: `Group "${groupName}" not found. Use /groups to see all groups.` }, { quoted: msg });
                    return true;
                }
                const participants = await sessionManager.getGroupParticipants(sessionId, group.id);
                let text = `*${group.name}* — ${participants.length} members\n\n`;
                participants.forEach((p, i) => {
                    text += `${i + 1}. ${p.name || p.phone} (${p.phone})\n`;
                });
                await sock.sendMessage(jid, { text }, { quoted: msg });
                return true;
            }

            // ─── /add <phone> <group name> — Add member to group ───
            case 'add': {
                if (args.length < 2) {
                    await sock.sendMessage(jid, { text: 'Usage: /add <phone> <group name>\nExample: /add 919876543210 Sales Team' }, { quoted: msg });
                    return true;
                }
                const phone = args[0].replace(/[^0-9]/g, '');
                const gName = args.slice(1).join(' ');
                const groups = await sessionManager.getWhatsAppGroups(sessionId);
                const group = findGroupByName(groups, gName);
                if (!group) {
                    await sock.sendMessage(jid, { text: `Group "${gName}" not found. Use /groups to see all groups.` }, { quoted: msg });
                    return true;
                }
                await sock.sendMessage(jid, { text: `Adding ${phone} to ${group.name}...` }, { quoted: msg });
                const result = await sessionManager.addGroupParticipants(sessionId, group.id, [phone]);
                const status = result && result[0] ? result[0].status : 'unknown';
                await sock.sendMessage(jid, { text: `Result: ${phone} → ${group.name}\nStatus: ${status}` }, { quoted: msg });
                return true;
            }

            // ─── /remove <phone> <group name> — Remove member from group ───
            case 'remove': {
                if (args.length < 2) {
                    await sock.sendMessage(jid, { text: 'Usage: /remove <phone> <group name>\nExample: /remove 919876543210 Sales Team' }, { quoted: msg });
                    return true;
                }
                const phone = args[0].replace(/[^0-9]/g, '');
                const gName = args.slice(1).join(' ');
                const groups = await sessionManager.getWhatsAppGroups(sessionId);
                const group = findGroupByName(groups, gName);
                if (!group) {
                    await sock.sendMessage(jid, { text: `Group "${gName}" not found. Use /groups to see all groups.` }, { quoted: msg });
                    return true;
                }
                await sock.sendMessage(jid, { text: `Removing ${phone} from ${group.name}...` }, { quoted: msg });
                const result = await sessionManager.removeGroupParticipants(sessionId, group.id, [phone]);
                const status = result && result[0] ? result[0].status : 'unknown';
                await sock.sendMessage(jid, { text: `Result: ${phone} removed from ${group.name}\nStatus: ${status}` }, { quoted: msg });
                return true;
            }

            // ─── /create <group name> <phone1, phone2, ...> — Create new group ───
            case 'create': {
                if (args.length < 2) {
                    await sock.sendMessage(jid, { text: 'Usage: /create <group name> <phone1, phone2, ...>\nExample: /create Sales Team 919876543210,919876543211' }, { quoted: msg });
                    return true;
                }
                const gName = args[0];
                const phones = args.slice(1).join(',').split(',').map(p => p.replace(/[^0-9]/g, '')).filter(Boolean);
                if (phones.length === 0) {
                    await sock.sendMessage(jid, { text: 'Please provide at least one phone number.' }, { quoted: msg });
                    return true;
                }
                await sock.sendMessage(jid, { text: `Creating group "${gName}" with ${phones.length} members...` }, { quoted: msg });
                const result = await sessionManager.createGroup(sessionId, gName, phones);
                await sock.sendMessage(jid, { text: `Group created!\nName: ${result.name}\nID: ${result.id}\nMembers: ${result.participants}` }, { quoted: msg });
                return true;
            }

            // ─── /rename <group name> <new name> — Rename a group ───
            case 'rename': {
                if (args.length < 2) {
                    await sock.sendMessage(jid, { text: 'Usage: /rename <current name> <new name>' }, { quoted: msg });
                    return true;
                }
                const groups = await sessionManager.getWhatsAppGroups(sessionId);
                // Try to find group name: first word(s) up to the last word as new name
                let group = null;
                let newName = '';
                for (let i = args.length - 1; i >= 1; i--) {
                    const tryName = args.slice(0, i).join(' ');
                    group = findGroupByName(groups, tryName);
                    if (group) {
                        newName = args.slice(i).join(' ');
                        break;
                    }
                }
                if (!group) {
                    await sock.sendMessage(jid, { text: 'Group not found. Use /groups to see all groups.' }, { quoted: msg });
                    return true;
                }
                await sessionManager.renameGroup(sessionId, group.id, newName);
                await sock.sendMessage(jid, { text: `Group renamed: "${group.name}" → "${newName}"` }, { quoted: msg });
                return true;
            }

            // ─── /leave <group name> — Leave a group ───
            case 'leave': {
                const gName = args.join(' ');
                if (!gName) {
                    await sock.sendMessage(jid, { text: 'Usage: /leave <group name>' }, { quoted: msg });
                    return true;
                }
                const groups = await sessionManager.getWhatsAppGroups(sessionId);
                const group = findGroupByName(groups, gName);
                if (!group) {
                    await sock.sendMessage(jid, { text: `Group "${gName}" not found.` }, { quoted: msg });
                    return true;
                }
                await sessionManager.leaveGroup(sessionId, group.id);
                await sock.sendMessage(jid, { text: `Left group: ${group.name}` }, { quoted: msg });
                return true;
            }

            // ─── /invite <group name> — Get invite link ───
            case 'invite': {
                const gName = args.join(' ');
                if (!gName) {
                    await sock.sendMessage(jid, { text: 'Usage: /invite <group name>' }, { quoted: msg });
                    return true;
                }
                const groups = await sessionManager.getWhatsAppGroups(sessionId);
                const group = findGroupByName(groups, gName);
                if (!group) {
                    await sock.sendMessage(jid, { text: `Group "${gName}" not found.` }, { quoted: msg });
                    return true;
                }
                const code = await sessionManager.getGroupInviteCode(sessionId, group.id);
                await sock.sendMessage(jid, { text: `Invite link for ${group.name}:\nhttps://chat.whatsapp.com/${code}` }, { quoted: msg });
                return true;
            }

            // ─── /admin <phone1, phone2, ...> — Set admin phones ───
            case 'admin': {
                if (args.length === 0) {
                    const current = getAdminPhones();
                    await sock.sendMessage(jid, {
                        text: current.length
                            ? `Current admins: ${current.join(', ')}\n\nUsage: /admin phone1,phone2\nUse /admin clear to remove all.`
                            : 'No admins set — all users can use commands.\n\nUsage: /admin phone1,phone2'
                    }, { quoted: msg });
                    return true;
                }
                if (args[0] === 'clear') {
                    settingsDb.set('admin_phones', '');
                    await sock.sendMessage(jid, { text: 'Admin list cleared — all users can now use commands.' }, { quoted: msg });
                } else {
                    const phones = args.join(',').split(',').map(p => p.replace(/[^0-9]/g, '')).filter(Boolean);
                    settingsDb.set('admin_phones', phones.join(','));
                    await sock.sendMessage(jid, { text: `Admins set to: ${phones.join(', ')}` }, { quoted: msg });
                }
                return true;
            }

            // ─── /help — Show all commands ───
            case 'help': {
                const helpText = `*AJM.bot Group Commands*

/groups — List all WhatsApp groups
/members <group> — List group members
/add <phone> <group> — Add member
/remove <phone> <group> — Remove member
/create <group> <phones> — Create group
/rename <group> <new name> — Rename group
/leave <group> — Leave a group
/invite <group> — Get invite link
/admin — Manage admin phones
/help — Show this help

*Notes:*
- Commands work from any chat with the bot
- Only admins can use commands
- Rate limit: 5 actions per minute
- Use group name exactly as shown in /groups`;
                await sock.sendMessage(jid, { text: helpText }, { quoted: msg });
                return true;
            }

            default:
                return false; // Unknown command — let it fall through to AI
        }
    } catch (err) {
        console.error(`[ChatCommand] Error executing /${cmd}:`, err.message);
        await sock.sendMessage(jid, { text: `Error: ${err.message}` }, { quoted: msg });
        return true;
    }
}

function init() {
    // ─── Poll Vote Handler (for clickable campaign buttons) ───
    sessionManager.onVote(async (sessionId, vote) => {
        try {
            // vote has: voter, selectedOptions (compatible format from sessionManager)
            const voterPhone = vote.voter?.replace('@c.us', '');
            if (!voterPhone) return;

            const selectedOptions = vote.selectedOptions || [];
            if (!selectedOptions.length) return;

            const selectedName = selectedOptions[0]?.name;
            if (!selectedName) return;

            console.log(`[PollVote] ${maskPhone(voterPhone)} selected "${selectedName}"`);

            // Find the campaign button that matches this vote
            const campaigns = campaignsDb.getActiveCampaignsWithButtons();
            for (const campaign of campaigns) {
                let buttons;
                try { buttons = JSON.parse(campaign.buttons_config); } catch (e) { continue; }
                if (!buttons || !buttons.length) continue;

                // Check if voter was a recipient
                const recipients = campaignsDb.getRecentRecipients(campaign.id);
                const phoneClean = voterPhone.replace(/[^0-9]/g, '');
                const isRecipient = recipients.some(r => r.replace(/[^0-9]/g, '') === phoneClean);
                if (!isRecipient) continue;

                // Find matching button by label
                const matched = buttons.find(b => {
                    const label = (b.label || b.body || '').trim();
                    return label === selectedName;
                });

                if (matched && matched.reply) {
                    const sock = sessionManager.getClient(sessionId);
                    if (!sock) continue;
                    const chatId = phoneClean.includes('@') ? phoneClean : `${phoneClean}@s.whatsapp.net`;
                    await sock.sendMessage(chatId, { text: matched.reply });
                    console.log(`[PollVote] Sent auto-reply to ${maskPhone(voterPhone)} for "${selectedName}"`);
                    return;
                }
            }
        } catch (err) {
            console.error('[PollVote] Error handling vote:', err.message);
        }
    });

    // ─── Listen for incoming messages on all sessions ───
    sessionManager.onMessage(async (sessionId, msg, sock) => {
        try {
            const jid = msg.key.remoteJid;

            // Skip status broadcasts and group messages
            if (!jid) return;
            if (jid === 'status@broadcast') return;
            if (jid.endsWith('@g.us')) return;

            // Messages sent manually from the phone arrive here with fromMe —
            // store them so AI context includes the user's own replies, but
            // never auto-respond to them
            if (msg.key.fromMe) {
                const ownText = sessionManager.extractMessageText(msg);
                if (ownText) {
                    const phone = jid.replace('@s.whatsapp.net', '').split(':')[0];
                    memory.addMessage(phone, 'out', ownText, sessionId);
                }
                return;
            }

            const contactPhone = jid.replace('@s.whatsapp.net', '').split(':')[0];
            let content = sessionManager.extractMessageText(msg);
            const msgType = sessionManager.getMessageType(msg);

            // Handle stickers and media that might not have text
            let mediaData = null;
            if (sessionManager.hasMedia(msg)) {
                try {
                    // Download media for AI to analyze (stickers, images)
                    if (msgType === 'sticker' || msgType === 'image') {
                        const buffer = await downloadMediaMessage(msg, 'buffer', {});
                        const mimetype = msg.message?.imageMessage?.mimetype
                            || msg.message?.stickerMessage?.mimetype
                            || 'image/jpeg';
                        mediaData = {
                            data: buffer.toString('base64'),
                            mimetype,
                        };
                    }
                } catch (e) {
                    console.error('[MessageHandler] Failed to download media:', e.message);
                }
            }

            if (!content || content.trim() === '') {
                if (msgType === 'sticker') content = '[User sent a Sticker]';
                else if (msgType === 'image') content = '[User sent an Image]';
                else if (msgType === 'video') content = '[User sent a Video]';
                else if (sessionManager.hasMedia(msg)) content = '[User sent Media]';
                else content = '[Unsupported Message]';
            }

            // Store incoming message
            memory.addMessage(contactPhone, 'in', content, sessionId);

            // Record start time for response tracking
            const msgStartTime = Date.now();

            // Get session settings first
            const session = sessionDb.getById(sessionId);
            if (!session) return;

            // ─── Campaign Button Reply Check (highest priority - always works) ───
            const buttonReply = checkCampaignButtonReply(contactPhone, content);
            if (buttonReply) {
                console.log(`[CampaignButton] Match for "${content}" from ${maskPhone(contactPhone)} — sending reply`);
                await sock.sendMessage(jid, { text: buttonReply }, { quoted: msg });
                memory.addMessage(contactPhone, 'out', `[Button Reply] ${buttonReply}`, sessionId);
                return;
            }

            // ─── Chat Command Handler (Group Management) ───
            if (content && (content.startsWith('/') || content.startsWith('!'))) {
                const cmdHandled = await handleChatCommand(sessionId, contactPhone, jid, content.trim(), sock, msg);
                if (cmdHandled) return;
            }

            // ─── Master Auto-Reply Switch Check ───
            if (!session.auto_reply) {
                console.log(`[AutoReply] Master switch is OFF for session ${sessionId} - skipping all responses`);
                return;
            }

            // ─── Blacklist Check ───
            if (blacklistDb.isBlacklisted(contactPhone)) {
                console.log(`[Blacklist] ${maskPhone(contactPhone)} is blacklisted — ignoring message`);
                return;
            }

            // ─── DND Check ───
            if (isDndActive()) {
                console.log(`[DND] Do Not Disturb active — ignoring message from ${maskPhone(contactPhone)}`);
                return;
            }

            // ─── Anti-Ban Checks (Ignore Bots & Cooldowns) ───
            const abSettings = getAntiBanSettings();
            if (abSettings.enabled) {
                if (abSettings.ignoreBots) {
                    if (jid.endsWith('@lid') || jid.includes('broadcast') || contactPhone.length < 10) {
                        console.log(`[AntiBan] Ignored automated system/LID account: ${maskPhone(contactPhone)}`);
                        return;
                    }
                    const lowerContent = content.toLowerCase();
                    const botKeywords = ['to continue, please type', 'welcome to *', 'sbi whatsapp banking', 'domino\'s', 'verification code', 'otp', 'do not reply', 'automated message'];
                    if (botKeywords.some(k => lowerContent.includes(k))) {
                        console.log(`[AntiBan] Ignored message with bot keywords from ${maskPhone(contactPhone)}`);
                        return;
                    }
                }

                const lastTime = lastReplyTimestamps.get(`${sessionId}:${contactPhone}`);
                if (lastTime && Date.now() - lastTime < abSettings.cooldownSec * 1000) {
                    const remaining = Math.ceil((abSettings.cooldownSec * 1000 - (Date.now() - lastTime)) / 1000);
                    console.log(`[AntiBan] Cooldown active for ${maskPhone(contactPhone)} (${remaining}s remaining) — skipping response to prevent loops/spam.`);
                    return;
                }
            }

            // ─── Quick Reply Check (only if enabled for this session) ───
            if (session.quick_replies_enabled) {
                const trimmedContent = content.trim().toLowerCase();

                // Fetch all enabled quick replies to check for matches
                const enabledReplies = quickRepliesDb.getEnabled();
                let matchedReply = null;

                // Sort by trigger length (descending) to match longest specific triggers first
                enabledReplies.sort((a, b) => b.trigger_key.length - a.trigger_key.length);

                for (const qr of enabledReplies) {
                    const trigger = qr.trigger_key.toLowerCase().trim();

                    // If the trigger contains only word characters, use word boundary \b
                    const isWordCharOnly = /^\w+$/i.test(trigger);

                    let isMatch = false;
                    if (isWordCharOnly) {
                        const regex = new RegExp(`\\b${escapeRegExp(trigger)}\\b`, 'i');
                        isMatch = regex.test(trimmedContent);
                    } else {
                        isMatch = trimmedContent.includes(trigger);
                    }

                    if (isMatch) {
                        matchedReply = qr;
                        break;
                    }
                }

                if (matchedReply) {
                    console.log(`[QuickReply] Match found for "${matchedReply.trigger_key}" in "${trimmedContent}"`);

                    await simulateTypingDelay(sock, jid);

                    // Send canned response
                    if (matchedReply.media_path && fs.existsSync(matchedReply.media_path)) {
                        try {
                            const mediaBuffer = fs.readFileSync(matchedReply.media_path);
                            const ext = path.extname(matchedReply.media_path).toLowerCase();
                            const mimeMap = {
                                '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
                                '.gif': 'image/gif', '.mp4': 'video/mp4', '.pdf': 'application/pdf',
                                '.doc': 'application/msword', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg',
                            };
                            const mimetype = mimeMap[ext] || 'application/octet-stream';

                            if (mimetype.startsWith('image/')) {
                                await sock.sendMessage(jid, {
                                    image: mediaBuffer,
                                    caption: matchedReply.response,
                                }, { quoted: msg });
                            } else if (mimetype.startsWith('video/')) {
                                await sock.sendMessage(jid, {
                                    video: mediaBuffer,
                                    caption: matchedReply.response,
                                }, { quoted: msg });
                            } else if (mimetype.startsWith('audio/')) {
                                await sock.sendMessage(jid, { audio: mediaBuffer, mimetype }, { quoted: msg });
                                if (matchedReply.response) {
                                    await sock.sendMessage(jid, { text: matchedReply.response });
                                }
                            } else {
                                await sock.sendMessage(jid, {
                                    document: mediaBuffer,
                                    mimetype,
                                    fileName: path.basename(matchedReply.media_path),
                                    caption: matchedReply.response,
                                }, { quoted: msg });
                            }
                        } catch (e) {
                            console.error('[QuickReply] Media send failed:', e.message);
                            await sock.sendMessage(jid, { text: matchedReply.response }, { quoted: msg });
                        }
                    } else {
                        await sock.sendMessage(jid, { text: matchedReply.response }, { quoted: msg });
                    }

                    lastReplyTimestamps.set(`${sessionId}:${contactPhone}`, Date.now());
                    memory.addMessage(contactPhone, 'out', `[Quick Reply: ${matchedReply.label}] ${matchedReply.response}`, sessionId);
                    console.log(`[QuickReply → ${maskPhone(contactPhone)}] Trigger: "${matchedReply.trigger_key}" → Sent: "${matchedReply.label}"`);

                    // Log quick reply analytics
                    try {
                        autoReplyLogs.add(sessionId, contactPhone, 'quick_reply', matchedReply.trigger_key, Date.now() - msgStartTime);
                    } catch (e) { /* non-critical */ }

                    return; // Don't proceed to AI
                } else {
                    console.log(`[QuickReply] No match found for: "${trimmedContent}"`);
                }
            } else {
                console.log(`[QuickReply] Disabled for session ${sessionId}`);
            }

            // ─── AI Auto-Reply (only if enabled for this session) ───
            if (!session.ai_replies_enabled) {
                console.log(`[AI] Disabled for session ${sessionId}`);
                return;
            }

            // Get conversation history for context (if enabled)
            const chatHistoryEnabled = settingsDb.get('ai_chat_history');
            const useHistory = chatHistoryEnabled === undefined || chatHistoryEnabled === '1' || chatHistoryEnabled === 'true' || chatHistoryEnabled === true;

            // Add typing indicator so user knows AI is thinking
            try {
                await sock.presenceSubscribe(jid);
                await sock.sendPresenceUpdate('composing', jid);
            } catch (e) {
                // ignore
            }

            let history = [];
            if (useHistory) {
                // Use DB-based history (populated by messaging-history.set sync + real-time messages)
                const historyLimit = parseInt(settingsDb.get('ai_chat_history_limit')) || 20;
                history = memory.getHistory(contactPhone, historyLimit);
            }

            // Generate AI reply
            const reply = await generateReply(history, content, mediaData);

            if (reply && reply.trim()) {
                await simulateTypingDelay(sock, jid);

                // Send reply
                await sock.sendMessage(jid, { text: reply.trim() }, { quoted: msg });

                // Clear typing indicator
                try {
                    await sock.sendPresenceUpdate('paused', jid);
                } catch (e) { }

                lastReplyTimestamps.set(`${sessionId}:${contactPhone}`, Date.now());
                // Store outgoing message
                memory.addMessage(contactPhone, 'out', reply.trim(), sessionId);
                console.log(`[AutoReply → ${maskPhone(contactPhone)}] ${reply.trim().substring(0, 80)}...`);

                // Notify webhooks
                notifyWebhooks('message.received', {
                    phone: contactPhone, content, reply: reply.trim(), sessionId, type: 'ai'
                });

                // Log AI reply analytics
                try {
                    autoReplyLogs.add(sessionId, contactPhone, 'ai', null, Date.now() - msgStartTime, history.length);
                } catch (e) { /* non-critical */ }
            }
        } catch (err) {
            console.error(`[MessageHandler] Error processing message:`, err.message);
        }
    });
}

function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = { init, refreshSettings };
