const sessionManager = require('../whatsapp/sessionManager');
const { messages: messagesDb, campaigns: campaignsDb, blacklist: blacklistDb, settings: settingsDb } = require('../db/database');
const path = require('path');
const fs = require('fs');
const followUpEngine = require('./followUpEngine');

let io = null;
const SEND_TIMEOUT_MS = 30000; // 30 second timeout per message

function init(socketIO) {
    io = socketIO;
}

/**
 * Replace template placeholders like {{name}}, {{company}}, {{custom_field}}
 */
function renderTemplate(template, contact) {
    let result = template;
    result = result.replace(/\{\{name\}\}/gi, contact.name || '');
    result = result.replace(/\{\{company\}\}/gi, contact.company || '');
    result = result.replace(/\{\{phone\}\}/gi, contact.phone || '');

    // Replace any custom fields
    const customFields = typeof contact.custom_fields === 'string'
        ? JSON.parse(contact.custom_fields)
        : (contact.custom_fields || {});

    for (const [key, value] of Object.entries(customFields)) {
        const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'gi');
        result = result.replace(regex, value);
    }

    return result;
}

/**
 * Determine mimetype from file extension.
 */
function getMimetype(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const map = {
        '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
        '.gif': 'image/gif', '.webp': 'image/webp', '.mp4': 'video/mp4',
        '.avi': 'video/avi', '.mkv': 'video/x-matroska', '.mov': 'video/quicktime',
        '.pdf': 'application/pdf', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg',
        '.wav': 'audio/wav', '.aac': 'audio/aac',
        '.doc': 'application/msword',
        '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        '.xls': 'application/vnd.ms-excel',
        '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        '.ppt': 'application/vnd.ms-powerpoint',
        '.zip': 'application/zip', '.rar': 'application/x-rar-compressed',
    };
    return map[ext] || 'application/octet-stream';
}

/**
 * Send a single message with a timeout to prevent hanging forever.
 * Works with Baileys sock.sendMessage() API.
 */
function sendWithTimeout(sock, jid, content, options) {
    return Promise.race([
        sock.sendMessage(jid, content, options || {}),
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Message send timed out after 30s')), SEND_TIMEOUT_MS)
        ),
    ]);
}

/**
 * Build a Baileys media message payload from a loaded media object.
 */
function buildMediaPayload(media, caption) {
    if (media.mimetype.startsWith('image/')) {
        return { image: media.buffer, caption: caption || undefined };
    } else if (media.mimetype.startsWith('video/')) {
        return { video: media.buffer, caption: caption || undefined };
    } else if (media.mimetype.startsWith('audio/')) {
        return { audio: media.buffer, mimetype: media.mimetype };
    } else {
        // Document (PDF, DOC, etc.)
        return {
            document: media.buffer,
            mimetype: media.mimetype,
            fileName: media.filename,
            caption: caption || undefined,
        };
    }
}

/**
 * Send messages to a list of contacts with template substitution.
 * Creates a campaign record for analytics tracking.
 * Supports optional media attachment (image/document/audio).
 * If campaignId is provided, resumes/retries into that campaign record.
 */
async function sendBulk(sessionId, contacts, template, options = {}) {
    const campaignId = options.campaignId || null;
    console.log('[BulkSender] Starting campaign:', { sessionId, contactsCount: contacts.length, hasButtons: !!options.buttons, retryOfCampaign: campaignId });

    const sock = sessionManager.getClient(sessionId);
    if (!sock) {
        console.error('[BulkSender] Client not found for session:', sessionId);
        throw new Error('Session not found or not connected');
    }

    const minDelay = options.minDelay || parseInt(process.env.MIN_DELAY_MS) || 8000;
    const maxDelay = options.maxDelay || parseInt(process.env.MAX_DELAY_MS) || 18000;
    const dailyLimit = parseInt(settingsDb.get('bulk_daily_limit')) || 0; // 0 = unlimited
    const batchSize = parseInt(settingsDb.get('bulk_batch_size')) || 25;
    const batchPauseMin = (parseInt(settingsDb.get('bulk_batch_pause_min')) || 60) * 1000;
    const batchPauseMax = (parseInt(settingsDb.get('bulk_batch_pause_max')) || 120) * 1000;

    let sentToday = messagesDb.countSentToday(sessionId);
    if (dailyLimit > 0 && sentToday >= dailyLimit) {
        throw new Error(`Daily send limit reached for this session (${sentToday}/${dailyLimit}). Try again tomorrow or raise the limit in Settings.`);
    }

    const groupName = options.groupName || '';
    const mediaPath = options.mediaPath || null;
    const mediaPaths = options.mediaPaths || null;
    const buttonsData = options.buttons || null;
    const campaignName = options.name || null;

    // Prepare media file references (lazy load buffers during send loop to save memory)
    const resolveMediaPath = (mp) => {
        if (!mp) return null;
        if (fs.existsSync(mp)) return mp;
        const filename = path.basename(mp.split('?')[0]);
        const mediaDir = process.env.APP_USER_DATA_PATH
            ? path.join(process.env.APP_USER_DATA_PATH, 'uploads', 'media')
            : path.join(__dirname, '..', '..', 'uploads', 'media');
        const uploadDir = process.env.APP_USER_DATA_PATH
            ? path.join(process.env.APP_USER_DATA_PATH, 'uploads')
            : path.join(__dirname, '..', '..', 'uploads');
        if (fs.existsSync(path.join(mediaDir, filename))) return path.join(mediaDir, filename);
        if (fs.existsSync(path.join(uploadDir, filename))) return path.join(uploadDir, filename);
        return null;
    };

    const mediaList = [];
    if (mediaPaths && mediaPaths.length > 0) {
        for (const mp of mediaPaths) {
            const resolved = resolveMediaPath(mp);
            if (resolved) {
                mediaList.push({
                    path: resolved,
                    mimetype: getMimetype(resolved),
                    filename: path.basename(resolved),
                });
            }
        }
    } else if (mediaPath) {
        const resolved = resolveMediaPath(mediaPath);
        if (resolved) {
            mediaList.push({
                path: resolved,
                mimetype: getMimetype(resolved),
                filename: path.basename(resolved),
            });
        }
    }

    // Create campaign record or reuse existing one for retries
    let activeCampaignId;
    if (campaignId) {
        // Retry: update the existing campaign to running and adjust total
        campaignsDb.update(campaignId, { status: 'running', completed_at: null });
        activeCampaignId = campaignId;
    } else {
        activeCampaignId = campaignsDb.create(sessionId, groupName, template, contacts.length, buttonsData, mediaPath, mediaPaths, minDelay, maxDelay, campaignName);
    }

    const results = [];
    let sent = 0;
    let failed = 0;

    try {
        for (let i = 0; i < contacts.length; i++) {
            const contact = contacts[i];
            console.log(`[BulkSender] Processing contact ${i + 1}/${contacts.length}: ${contact.phone}`);

            // ─── Blacklist Check: skip blacklisted numbers ───
            if (blacklistDb.isBlacklisted(String(contact.phone).replace(/[^0-9]/g, ''))) {
                console.log(`[BulkSender] ${contact.phone} is blacklisted — skipping`);
                failed++;
                campaignsDb.addMessage(activeCampaignId, contact.phone, contact.name, 'failed', 'Number is blacklisted', '');
                campaignsDb.incrementFailed(activeCampaignId);
                if (io) {
                    io.emit('bulk:progress', {
                        campaignId: activeCampaignId, sessionId,
                        current: i + 1, total: contacts.length, sent, failed,
                        lastPhone: contact.phone, lastName: contact.name, lastStatus: 'failed', error: 'Blacklisted',
                    });
                }
                continue;
            }

            // ─── DND Check: skip if Do Not Disturb is active ───
            if (followUpEngine.isDndActive()) {
                console.log(`[BulkSender] DND active — skipping ${contact.phone}`);
                failed++;
                campaignsDb.addMessage(activeCampaignId, contact.phone, contact.name, 'failed', 'DND active', '');
                campaignsDb.incrementFailed(activeCampaignId);
                if (io) {
                    io.emit('bulk:progress', {
                        campaignId: activeCampaignId, sessionId,
                        current: i + 1, total: contacts.length, sent, failed,
                        lastPhone: contact.phone, lastName: contact.name, lastStatus: 'failed', error: 'DND active',
                    });
                }
                continue;
            }

            // ─── Daily Limit Check: stop the campaign once the session's daily cap is hit ───
            if (dailyLimit > 0 && sentToday >= dailyLimit) {
                console.log(`[BulkSender] Daily limit reached (${sentToday}/${dailyLimit}) — stopping remaining sends`);
                for (let j = i; j < contacts.length; j++) {
                    const c = contacts[j];
                    failed++;
                    campaignsDb.addMessage(activeCampaignId, c.phone, c.name, 'failed', 'Daily send limit reached — resume tomorrow', '');
                    campaignsDb.incrementFailed(activeCampaignId);
                    if (io) {
                        io.emit('bulk:progress', {
                            campaignId: activeCampaignId, sessionId,
                            current: j + 1, total: contacts.length, sent, failed,
                            lastPhone: c.phone, lastName: c.name, lastStatus: 'failed', error: 'Daily send limit reached',
                        });
                    }
                }
                break;
            }

            // Re-check session is still connected before each send
            const currentSock = sessionManager.getClient(sessionId);
            if (!currentSock) {
                const errMsg = 'Session disconnected during campaign';
                console.error(`[BulkSender] ${errMsg}`);
                // Mark all remaining contacts as failed
                for (let j = i; j < contacts.length; j++) {
                    const c = contacts[j];
                    const renderedMsg = renderTemplate(template, c);
                    failed++;
                    campaignsDb.addMessage(activeCampaignId, c.phone, c.name, 'failed', errMsg, renderedMsg);
                    campaignsDb.incrementFailed(activeCampaignId);
                    if (io) {
                        io.emit('bulk:progress', {
                            campaignId: activeCampaignId, sessionId,
                            current: j + 1, total: contacts.length, sent, failed,
                            lastPhone: c.phone, lastName: c.name, lastStatus: 'failed', error: errMsg,
                        });
                    }
                }
                break;
            }

            let message = renderTemplate(template, contact);
            const phoneStr = String(contact.phone).trim();
            // Clean phone number — preserve @g.us/@s.whatsapp.net if already present
            const phone = phoneStr.replace(/[^\d@\.\-a-zA-Z\+]/gi, '');

            // Construct JID — use @s.whatsapp.net for individuals (Baileys format)
            let chatId;
            if (phone.includes('@')) {
                chatId = phone; // Already has @g.us or @s.whatsapp.net
            } else {
                chatId = `${phone.replace(/[\-\+]/g, '')}@s.whatsapp.net`;
            }

            try {
                // ─── Verify number is registered on WhatsApp ───
                // Baileys sendMessage does not error for unregistered numbers
                // (messages silently vanish), so check explicitly
                if (!chatId.endsWith('@g.us')) {
                    let lookupList = null;
                    try {
                        lookupList = await currentSock.onWhatsApp(chatId);
                    } catch (e) {
                        console.warn(`[BulkSender] onWhatsApp lookup failed for ${phone}: ${e.message} — attempting send anyway`);
                    }
                    // Baileys filters unregistered numbers out of the result,
                    // so an empty array means the number is not on WhatsApp
                    if (Array.isArray(lookupList)) {
                        const lookup = lookupList.find(r => r.exists);
                        if (!lookup) {
                            throw new Error(`Invalid WhatsApp number: ${phone} — number is not registered on WhatsApp`);
                        }
                        if (lookup.jid) chatId = lookup.jid; // Use canonical JID
                    }
                }

                // ─── Simulate human presence before sending (brief "online" + "typing") ───
                try {
                    await currentSock.presenceSubscribe(chatId);
                    await currentSock.sendPresenceUpdate('composing', chatId);
                    await new Promise(r => setTimeout(r, 1000 + Math.floor(Math.random() * 1500)));
                    await currentSock.sendPresenceUpdate('paused', chatId);
                } catch (e) { /* ignore presence errors — not critical to delivery */ }

                // ─── Construct & Send Message ───
                if (mediaList.length > 0) {
                    // Non-blocking async file read for first media buffer
                    const firstBuffer = await fs.promises.readFile(mediaList[0].path);
                    const firstMedia = { ...mediaList[0], buffer: firstBuffer };
                    const firstPayload = buildMediaPayload(firstMedia, message);
                    await sendWithTimeout(currentSock, chatId, firstPayload);

                    // Additional media sent standalone (no caption)
                    for (let mi = 1; mi < mediaList.length; mi++) {
                        const extraBuffer = await fs.promises.readFile(mediaList[mi].path);
                        const extraMedia = { ...mediaList[mi], buffer: extraBuffer };
                        const extraPayload = buildMediaPayload(extraMedia, null);
                        await sendWithTimeout(currentSock, chatId, extraPayload);
                    }
                } else {
                    // Text-only message
                    await sendWithTimeout(currentSock, chatId, { text: message });
                }

                // Send interactive Poll as clickable buttons (if configured)
                if (buttonsData && buttonsData.length > 0) {
                    const pollOptions = buttonsData.map(b => b.label || b.body || 'Option');
                    const pollPayload = {
                        poll: {
                            name: 'Choose an option:',
                            values: pollOptions,
                            selectableCount: 1,
                        },
                    };
                    const sentPoll = await sendWithTimeout(currentSock, chatId, pollPayload);

                    // Store the sent poll for vote decoding later
                    if (sentPoll?.key?.id && sentPoll?.message) {
                        sessionManager.storePollMessage(chatId, sentPoll.key.id, sentPoll.message);
                    }
                }

                messagesDb.add(sessionId, contact.phone, 'out', message, 'sent');
                campaignsDb.addMessage(activeCampaignId, contact.phone, contact.name, 'sent', null, message);
                campaignsDb.incrementSent(activeCampaignId);
                sent++;
                sentToday++;
                results.push({ phone: contact.phone, status: 'sent', message });

                if (io) {
                    io.emit('bulk:progress', {
                        campaignId: activeCampaignId, sessionId,
                        current: i + 1, total: contacts.length, sent, failed,
                        lastPhone: contact.phone, lastName: contact.name, lastStatus: 'sent',
                    });
                }
            } catch (err) {
                // Build a more descriptive error message
                let errorDetail = err.message || 'Unknown error';
                if (errorDetail.includes('timed out')) {
                    errorDetail = 'Message send timed out — WhatsApp server did not respond within 30s';
                } else if (errorDetail.includes('not registered') || errorDetail.includes('invalid')) {
                    errorDetail = `Invalid WhatsApp number: ${phone} — number is not registered on WhatsApp`;
                } else if (errorDetail.includes('disconnected') || errorDetail.includes('ECONNRESET')) {
                    errorDetail = 'Connection lost — WhatsApp session was disconnected during send';
                }
                console.error(`[BulkSender] Error sending to ${contact.phone}:`, errorDetail);
                failed++;
                results.push({ phone: contact.phone, status: 'failed', error: errorDetail });
                messagesDb.add(sessionId, contact.phone, 'out', message, 'failed');
                campaignsDb.addMessage(activeCampaignId, contact.phone, contact.name, 'failed', errorDetail, message);
                campaignsDb.incrementFailed(activeCampaignId);

                if (io) {
                    io.emit('bulk:progress', {
                        campaignId: activeCampaignId, sessionId,
                        current: i + 1, total: contacts.length, sent, failed,
                        lastPhone: contact.phone, lastName: contact.name,
                        lastStatus: 'failed', error: errorDetail,
                    });
                }
            }

            // Random delay between sends (except after the last message).
            // Every `batchSize` messages, take a longer human-like break instead.
            if (i < contacts.length - 1) {
                if (batchSize > 0 && (i + 1) % batchSize === 0) {
                    const pause = Math.floor(Math.random() * (batchPauseMax - batchPauseMin) + batchPauseMin);
                    console.log(`[BulkSender] Batch of ${batchSize} reached — pausing ${Math.round(pause / 1000)}s`);
                    await new Promise(r => setTimeout(r, pause));
                } else {
                    const delay = Math.floor(Math.random() * (maxDelay - minDelay) + minDelay);
                    await new Promise(r => setTimeout(r, delay));
                }
            }
        }
    } catch (err) {
        // Catch any unexpected errors so campaign doesn't stay "running" forever
        console.error('[BulkSender] Campaign crashed:', err);
        if (io) {
            io.emit('bulk:error', { campaignId: activeCampaignId, sessionId, error: err.message });
        }
    }

    // Mark campaign complete (always runs, even after crash)
    campaignsDb.complete(activeCampaignId);

    // Notify webhooks about campaign completion
    try {
        const { webhooks: webhooksDb } = require('../db/database');
        const hooks = webhooksDb.getEnabled();
        for (const hook of hooks) {
            let events;
            try { events = JSON.parse(hook.events); } catch (e) { events = []; }
            if (!events.includes('campaign.completed')) continue;
            const payload = { event: 'campaign.completed', timestamp: new Date().toISOString(), data: { campaignId: activeCampaignId, sessionId, sent, failed, total: contacts.length } };
            fetch(hook.url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Webhook-Source': 'ajm-bot' },
                body: JSON.stringify(payload),
            }).then(resp => webhooksDb.recordTrigger(hook.id, resp.status)).catch(() => webhooksDb.recordTrigger(hook.id, 0));
        }
    } catch (e) { /* non-critical */ }

    if (io) {
        io.emit('bulk:complete', { campaignId: activeCampaignId, sessionId, sent, failed, total: contacts.length });
    }

    return { campaignId: activeCampaignId, sent, failed, total: contacts.length, results };
}

module.exports = { init, sendBulk, renderTemplate };
