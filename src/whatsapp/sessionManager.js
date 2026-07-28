const makeWASocket = require('@whiskeysockets/baileys').default;
const {
    useMultiFileAuthState,
    DisconnectReason,
    makeCacheableSignalKeyStore,
    fetchLatestBaileysVersion,
    getAggregateVotesInPollMessage,
    Browsers,
} = require('@whiskeysockets/baileys');
const qrcode = require('qrcode');
const pino = require('pino');
const { randomUUID } = require('crypto');
const fs = require('fs');
const path = require('path');
const { sessions: sessionDb, messages: messagesDb, waContacts: waContactsDb, db: rawDb } = require('../db/database');

// ═══════════════════════════════════════
// In-memory state
// ═══════════════════════════════════════

const clients = new Map();            // sessionId → Baileys socket
const sessionStates = new Map();      // sessionId → { status, qr }
const contactStores = new Map();      // sessionId → Map<phone, { phone, name }>
const pollMessageStore = new Map();   // msgKey → { message, createdAt } (for vote decoding)
const pendingReconnects = new Map();  // sessionId → auto-reconnect timeout handle
const contactSyncInFlight = new Map();    // sessionId → Promise (dedupe overlapping personal-contact syncs)
const groupSyncInFlight = new Map();      // "sessionId:groupId" → Promise (dedupe overlapping group imports)
const lastFullResyncAttempt = new Map();  // sessionId → timestamp of last resyncAppState fallback

// Prune pollMessageStore every 30 minutes (remove entries older than 7 days)
setInterval(() => {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    for (const [key, entry] of pollMessageStore) {
        if (entry.createdAt < cutoff) pollMessageStore.delete(key);
    }
}, 30 * 60 * 1000);

// Cached Baileys version (refreshed every 24 hours)
let cachedBaileysVersion = null;
let baileysVersionFetchedAt = 0;
const BAILEYS_VERSION_TTL = 24 * 60 * 60 * 1000; // 24 hours

// Minimum gap between resyncAppState fallback attempts per session — without
// this, an account with no nameable contacts (fresh number, or contacts that
// have never sent a pushName) would pay the ~6s resync-and-wait cost on every
// single sync call instead of just once in a while.
const RESYNC_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

let io = null; // Socket.IO instance — set via init()

// Quiet logger for Baileys internals (reduce noise)
const baileysLogger = pino({ level: 'silent' });

// ═══════════════════════════════════════
// Initialization
// ═══════════════════════════════════════

function init(socketIO) {
    io = socketIO;

    // Restore persisted sessions on startup with a stagger
    const saved = sessionDb.getAll();
    let startupDelayMs = 0;
    for (const s of saved) {
        if (s.status !== 'removed') {
            setTimeout(() => {
                createClient(s.id, s.name);
            }, startupDelayMs);
            startupDelayMs += 2000; // Baileys is fast — shorter stagger than Chromium
        }
    }
}

// ═══════════════════════════════════════
// Auth directory helpers
// ═══════════════════════════════════════

function getAuthDir(sessionId) {
    return process.env.APP_USER_DATA_PATH
        ? path.join(process.env.APP_USER_DATA_PATH, '.wwebjs_auth', `session-${sessionId}`)
        : path.join(__dirname, '..', '..', '.wwebjs_auth', `session-${sessionId}`);
}

// ═══════════════════════════════════════
// Extract text from Baileys message
// ═══════════════════════════════════════

function extractMessageText(msg) {
    const m = msg.message;
    if (!m) return null;

    return m.conversation
        || m.extendedTextMessage?.text
        || m.imageMessage?.caption
        || m.videoMessage?.caption
        || m.documentMessage?.caption
        || m.buttonsResponseMessage?.selectedButtonId
        || m.listResponseMessage?.singleSelectReply?.selectedRowId
        || (m.stickerMessage ? '[Sticker]' : null)
        || (m.imageMessage && !m.imageMessage.caption ? '[Image]' : null)
        || (m.videoMessage && !m.videoMessage.caption ? '[Video]' : null)
        || (m.audioMessage ? '[Audio]' : null)
        || (m.documentMessage && !m.documentMessage.caption ? '[Document]' : null)
        || (m.contactMessage ? '[Contact]' : null)
        || (m.locationMessage ? '[Location]' : null)
        || null;
}

/**
 * Determine message type from Baileys message object.
 */
function getMessageType(msg) {
    const m = msg.message;
    if (!m) return 'unknown';
    if (m.stickerMessage) return 'sticker';
    if (m.imageMessage) return 'image';
    if (m.videoMessage) return 'video';
    if (m.audioMessage) return 'audio';
    if (m.documentMessage) return 'document';
    if (m.contactMessage) return 'contact';
    if (m.locationMessage) return 'location';
    if (m.pollCreationMessage || m.pollCreationMessageV3) return 'poll';
    return 'text';
}

/**
 * Check if a Baileys message contains downloadable media.
 */
function hasMedia(msg) {
    const m = msg.message;
    if (!m) return false;
    return !!(m.imageMessage || m.videoMessage || m.audioMessage || m.documentMessage || m.stickerMessage);
}

// ═══════════════════════════════════════
// Create & manage Baileys sessions
// ═══════════════════════════════════════

// Cancel any pending auto-reconnect and fully detach the current socket for a
// session before replacing it — without this, the old socket's still-attached
// listeners (and any in-flight reconnect timer) keep firing after a manual
// restart/relink, producing a second concurrent connection for the same session.
async function teardownSocket(sessionId, { logout = false } = {}) {
    const pending = pendingReconnects.get(sessionId);
    if (pending) {
        clearTimeout(pending);
        pendingReconnects.delete(sessionId);
    }

    const sock = clients.get(sessionId);
    if (!sock) return;

    try { sock.ev.removeAllListeners(); } catch (e) { }

    if (logout) {
        try {
            await sock.logout();
        } catch (e) {
            console.log(`[Session ${sessionId}] logout: ${e.message}`);
            try { sock.end(); } catch (_) { }
        }
    } else {
        try { sock.end(); } catch (e) {
            console.log(`[Session ${sessionId}] end: ${e.message}`);
        }
    }

    clients.delete(sessionId);
}

async function createClient(sessionId, name, retryCount = 0) {
    const pending = pendingReconnects.get(sessionId);
    if (pending) {
        clearTimeout(pending);
        pendingReconnects.delete(sessionId);
    }

    const authDir = getAuthDir(sessionId);
    if (!fs.existsSync(authDir)) fs.mkdirSync(authDir, { recursive: true });

    const { state, saveCreds } = await useMultiFileAuthState(authDir);
    // Use cached version if available and fresh (avoids GitHub API call on every reconnect)
    if (!cachedBaileysVersion || Date.now() - baileysVersionFetchedAt > BAILEYS_VERSION_TTL) {
        try {
            const { version: fetched } = await fetchLatestBaileysVersion();
            cachedBaileysVersion = fetched;
            baileysVersionFetchedAt = Date.now();
        } catch (e) {
            console.warn('[Baileys] Failed to fetch latest version, using cached or default');
        }
    }
    const version = cachedBaileysVersion || [2, 3000, 1015901307];

    // Initialize per-session contact store, hydrated from SQLite — Baileys only
    // replays contact mutations once per app-state version, so without persistence
    // the store would be empty after every server restart
    if (!contactStores.has(sessionId)) {
        const store = new Map();
        try {
            for (const c of waContactsDb.getBySession(sessionId)) {
                store.set(c.phone, { phone: c.phone, name: c.name || '' });
            }
        } catch (e) {
            console.error(`[Session ${name}] Failed to load persisted contacts:`, e.message);
        }
        contactStores.set(sessionId, store);
    }

    const sock = makeWASocket({
        version,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, baileysLogger),
        },
        logger: baileysLogger,
        printQRInTerminal: false,
        // Use standard desktop client header to prevent WhatsApp anti-bot systems from revoking linked sessions
        browser: Browsers.macOS('Desktop'),
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 60000,
        generateHighQualityLinkPreview: false,
        markOnlineOnConnect: false,
        // Allow initial contact & chat list sync on pairing while filtering out old historical messages (>7 days) to prevent rate limit error 440
        shouldSyncHistoryMessage: (msg) => {
            const ts = Number(msg.messageTimestamp || msg.timestamp || 0);
            return !ts || (Date.now() / 1000 - ts) < 86400 * 7;
        },
    });

    const existingState = sessionStates.get(sessionId);
    if (!state.creds?.registered || !existingState || existingState.status !== 'ready') {
        sessionStates.set(sessionId, { status: 'initializing', qr: null });
        if (io) io.emit('session:status', { sessionId, status: 'initializing' });
    }

    // ─── Save credentials on update ───
    sock.ev.on('creds.update', saveCreds);

    // ─── Connection updates (QR, connected, disconnected) ───
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            // Ignore transient QR emissions during reconnection if credentials are already paired/registered
            if (state.creds?.registered) {
                console.log(`[Session ${name}] Ignoring transient QR emission (session already registered)`);
                return;
            }
            const qrDataUrl = await qrcode.toDataURL(qr, { width: 300 });
            sessionStates.set(sessionId, { status: 'qr_pending', qr: qrDataUrl });
            sessionDb.updateStatus(sessionId, 'qr_pending');
            if (io) io.emit('session:qr', { sessionId, qr: qrDataUrl });
        }

        if (connection === 'open') {
            const phone = sock.user?.id?.split(':')[0] || sock.user?.id?.split('@')[0] || '';
            sessionStates.set(sessionId, { status: 'ready', qr: null });
            sessionDb.updateStatus(sessionId, 'ready');
            sessionDb.updatePhone(sessionId, phone);
            if (io) io.emit('session:ready', { sessionId, phone });
            console.log(`[Session ${name}] Connected — phone: ${phone}`);
            // Reset so a future disconnect's backoff reflects consecutive recent
            // failures, not this session's entire lifetime disconnect history.
            retryCount = 0;
        }

        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;

            clients.delete(sessionId);

            if (statusCode === DisconnectReason.loggedOut) {
                // User explicitly logged out from their phone — don't reconnect
                sessionStates.set(sessionId, { status: 'disconnected', qr: null });
                sessionDb.updateStatus(sessionId, 'disconnected');
                if (io) io.emit('session:disconnected', { sessionId, reason: 'logged_out' });
                console.log(`[Session ${name}] Logged out from device`);
            } else if (statusCode === DisconnectReason.badSession) {
                // Corrupted session — clear auth
                sessionStates.set(sessionId, { status: 'auth_failure', qr: null });
                sessionDb.updateStatus(sessionId, 'auth_failure');
                if (io) io.emit('session:auth_failure', { sessionId, error: 'bad_session' });
                console.error(`[Session ${name}] Auth failure — bad session`);
            } else {
                // Continuous self-healing auto-reconnect for network drops, timeouts (408), stream restarts (515), or rate limits (440)
                const isStreamRestart = statusCode === 515 || statusCode === 428;
                // Stream restarts usually recover on the very next attempt, so keep
                // retrying fast at first — but if it keeps recurring (flaky network,
                // firewall/AV interference), ramp up instead of hammering forever at
                // a flat 500ms, which was pegging CPU on some real Windows machines.
                const delay = isStreamRestart
                    ? Math.min(500 * Math.pow(1.8, retryCount), 15000)
                    : Math.min(3000 * (retryCount + 1), 30000); // Cap backoff at 30 seconds during prolonged internet outages or rate limits
                console.log(`[Session ${name}] Disconnected (code ${statusCode}), reconnecting in ${delay}ms (retry #${retryCount + 1})...`);
                // Stay quiet in the UI for the first couple of stream-restart
                // attempts (usually resolves instantly), but surface it once it's
                // clearly not a one-off — otherwise a real reconnect loop is
                // completely invisible from the dashboard.
                if (!isStreamRestart || retryCount >= 2) {
                    sessionStates.set(sessionId, { status: 'reconnecting', qr: null });
                    if (io) io.emit('session:status', { sessionId, status: 'reconnecting' });
                }
                const timer = setTimeout(() => {
                    pendingReconnects.delete(sessionId);
                    createClient(sessionId, name, retryCount + 1);
                }, delay);
                pendingReconnects.set(sessionId, timer);
            }
        }
    });

    // ─── Contacts sync (build in-memory store + persist to SQLite) ───
    const storeContacts = (contacts) => {
        const store = contactStores.get(sessionId) || new Map();
        const changed = [];
        for (const c of contacts) {
            if (!c.id && !c.jid) continue;
            let targetId = (c.jid && String(c.jid).includes('@s.whatsapp.net')) ? String(c.jid) : (c.id && String(c.id).includes('@s.whatsapp.net')) ? String(c.id) : String(c.jid || c.id || '');
            let phone = targetId.split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
            if (c.phoneNumber) {
                const num = String(c.phoneNumber).replace(/[^0-9]/g, '');
                if (num.length >= 7 && num.length <= 13) phone = num;
            }
            if (!phone || phone.length < 5 || phone.length >= 14) continue;
            if (phone.length === 10 && /^[6-9]/.test(phone)) phone = '91' + phone;
            const existing = store.get(phone) || { phone, name: '' };
            const newName = c.name || c.notify || c.verifiedName || c.pushname || c.pushName || '';
            if (newName && (!existing.name || existing.name === phone)) {
                existing.name = newName;
            }
            store.set(phone, existing);
            if (c.id && String(c.id).includes('@lid')) {
                store.set(String(c.id).split('@')[0], existing);
            }
            if (newName) changed.push(existing);
        }
        contactStores.set(sessionId, store);
        if (changed.length) {
            try {
                waContactsDb.upsertMany(sessionId, changed);
            } catch (e) {
                console.error(`[Session ${name}] Failed to persist contacts:`, e.message);
            }
        }
    };

    const recordPushName = (jid, pushName) => {
        if (!pushName || typeof pushName !== 'string' || !pushName.trim()) return;
        let phone = String(jid).split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
        if (!phone || phone.length < 5 || phone.length >= 14) return;
        if (phone.length === 10 && /^[6-9]/.test(phone)) phone = '91' + phone;
        const store = contactStores.get(sessionId) || new Map();
        const existing = store.get(phone) || { phone, name: '' };
        if (!existing.name || existing.name === phone) {
            existing.name = pushName.trim();
            store.set(phone, existing);
            contactStores.set(sessionId, store);
            try {
                waContactsDb.upsertMany(sessionId, [existing]);
            } catch (_) {}
        }
    };

    sock.ev.on('contacts.upsert', storeContacts);
    sock.ev.on('contacts.update', storeContacts);

    // ─── History sync → store contacts + messages in SQLite for AI context ───
    sock.ev.on('messaging-history.set', ({ contacts: syncedContacts, messages: syncedMessages }) => {
        // The initial history sync carries the contact list — app-state
        // contactAction mutations alone don't cover it
        if (syncedContacts && syncedContacts.length) {
            storeContacts(syncedContacts);
        }

        console.log(`[Session ${name}] Syncing ${syncedMessages.length} historical messages`);

        const insertTx = rawDb.transaction(() => {
            for (const msg of syncedMessages) {
                try {
                    const jid = msg.key.remoteJid;
                    const participant = msg.key.participant || jid;
                    if (msg.pushName && participant) {
                        recordPushName(participant, msg.pushName);
                    }
                    if (!jid || jid === 'status@broadcast' || jid.endsWith('@g.us')) continue;

                    const phone = jid.replace('@s.whatsapp.net', '').split(':')[0];
                    const direction = msg.key.fromMe ? 'out' : 'in';
                    const text = extractMessageText(msg);
                    if (!text) continue;

                    messagesDb.add(sessionId, phone, direction, text, 'synced');
                } catch (e) {
                    // Skip malformed messages silently
                }
            }
        });

        try {
            insertTx();
        } catch (e) {
            console.error(`[Session ${name}] History sync DB error:`, e.message);
        }
    });

    // ─── Real-time messages → route to registered handlers ───
    sock.ev.on('messages.upsert', ({ messages: newMessages, type }) => {
        if (type !== 'notify') return; // Only process real-time messages

        for (const msg of newMessages) {
            const participant = msg.key.participant || msg.key.remoteJid;
            if (msg.pushName && participant) {
                recordPushName(participant, msg.pushName);
            }
            for (const handler of _messageHandlers) {
                handler(sessionId, msg, sock);
            }
        }
    });

    // ─── Poll vote updates → route to registered vote handlers ───
    sock.ev.on('messages.update', (updates) => {
        for (const { key, update } of updates) {
            if (!update?.pollUpdates) continue;

            // Decode poll votes
            const pollEntry = pollMessageStore.get(`${key.remoteJid}:${key.id}`);
            if (!pollEntry) continue;
            const pollMsg = pollEntry.message;

            try {
                const votes = getAggregateVotesInPollMessage({
                    message: pollMsg,
                    pollUpdates: update.pollUpdates,
                });

                // Build a vote event similar to whatsapp-web.js format
                for (const vote of votes) {
                    if (!vote.voters || vote.voters.length === 0) continue;
                    for (const voterJid of vote.voters) {
                        const voter = voterJid.replace('@s.whatsapp.net', '').split(':')[0];
                        const voteData = {
                            voter: `${voter}@c.us`, // Keep @c.us format for compatibility with messageHandler
                            selectedOptions: [{ name: vote.name }],
                        };
                        for (const handler of _voteHandlers) {
                            handler(sessionId, voteData);
                        }
                    }
                }
            } catch (e) {
                console.error(`[Session ${name}] Poll vote decode error:`, e.message);
            }
        }
    });

    // Store reference
    clients.set(sessionId, sock);

    return sessionId;
}

// ═══════════════════════════════════════
// Session CRUD
// ═══════════════════════════════════════

async function addSession(name) {
    const sessionId = randomUUID().slice(0, 8);
    sessionDb.create(sessionId, name);
    await createClient(sessionId, name);
    return sessionId;
}

async function removeSession(sessionId) {
    await teardownSocket(sessionId, { logout: true });
    sessionStates.delete(sessionId);
    contactStores.delete(sessionId);
    contactSyncInFlight.delete(sessionId);
    lastFullResyncAttempt.delete(sessionId);
    for (const key of groupSyncInFlight.keys()) {
        if (key.startsWith(`${sessionId}:`)) groupSyncInFlight.delete(key);
    }
    try { waContactsDb.deleteBySession(sessionId); } catch (e) { }
    sessionDb.delete(sessionId);

    // Clean up auth files
    const authDir = getAuthDir(sessionId);
    if (fs.existsSync(authDir)) {
        fs.rmSync(authDir, { recursive: true, force: true });
    }
}

async function restartSession(sessionId) {
    const dbSession = sessionDb.getAll().find(s => s.id === sessionId);
    if (!dbSession) throw new Error('Session not found');

    // Close existing socket (and cancel any pending auto-reconnect for it)
    await teardownSocket(sessionId);
    sessionStates.delete(sessionId);

    // Re-create — will reconnect using saved auth keys (no new QR needed)
    await createClient(sessionId, dbSession.name);
}

async function relinkSession(sessionId) {
    const dbSession = sessionDb.getAll().find(s => s.id === sessionId);
    if (!dbSession) throw new Error('Session not found');

    // Close existing socket (and cancel any pending auto-reconnect for it)
    await teardownSocket(sessionId);
    sessionStates.delete(sessionId);

    // Clear stored auth data so a fresh QR is generated
    const authDir = getAuthDir(sessionId);
    if (fs.existsSync(authDir)) {
        fs.rmSync(authDir, { recursive: true, force: true });
        console.log(`[Session ${sessionId}] Cleared auth data for relink`);
    }

    sessionDb.updateStatus(sessionId, 'initializing');

    // Re-create — will trigger a fresh QR since auth is cleared
    await createClient(sessionId, dbSession.name);
}

// ═══════════════════════════════════════
// WhatsApp Data Retrieval
// ═══════════════════════════════════════
// ── Pre-build LID -> Phone map from groups and contacts ──
// WhatsApp increasingly hides real numbers behind an opaque "@lid" id for
// privacy (especially in larger groups). This cross-references every group
// you're in plus your known contacts to resolve as many LIDs to real phone
// numbers as possible; anything left unresolved is dropped by extractPhone
// rather than imported as a garbage 15+ digit "phone number".
async function buildLidToPhoneMap(sock) {
    const lidToPhoneMap = new Map();

    try {
        const groups = await sock.groupFetchAllParticipating().catch(() => ({}));
        if (groups && typeof groups === 'object') {
            for (const g of Object.values(groups)) {
                if (g && g.participants && Array.isArray(g.participants)) {
                    for (const p of g.participants) {
                        let lid = '';
                        let phone = '';
                        if (p.lid || (p.id && String(p.id).includes('@lid'))) {
                            lid = String(p.lid || p.id).split('@')[0].replace(/[^0-9]/g, '');
                        }
                        if (p.jid || (p.id && String(p.id).includes('@s.whatsapp.net'))) {
                            phone = String(p.jid || p.id).split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
                        } else if (p.phoneNumber) {
                            phone = String(p.phoneNumber).replace(/[^0-9]/g, '');
                        }
                        if (lid && phone && phone.length <= 13) {
                            lidToPhoneMap.set(lid, phone);
                        }
                    }
                }
            }
        }
    } catch (_) {}

    // Also scan sock.contacts for paired lid/phone
    if (sock.contacts && typeof sock.contacts === 'object') {
        for (const [jid, c] of Object.entries(sock.contacts)) {
            if (c.lid && c.id && String(c.id).includes('@s.whatsapp.net')) {
                const lid = String(c.lid).split('@')[0].replace(/[^0-9]/g, '');
                const phone = String(c.id).split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
                if (lid && phone && phone.length <= 13) lidToPhoneMap.set(lid, phone);
            }
        }
    }

    return lidToPhoneMap;
}

// ── Extract a clean phone from any Baileys JID or participant/contact object ──
function extractPhoneFromJid(jid, obj, lidToPhoneMap) {
    if (!jid && !obj) return null;
    let raw = '';
    if (obj?.jid && String(obj.jid).includes('@s.whatsapp.net')) {
        raw = String(obj.jid);
    } else if (obj?.id && String(obj.id).includes('@s.whatsapp.net')) {
        raw = String(obj.id);
    } else if (jid && String(jid).includes('@s.whatsapp.net')) {
        raw = String(jid);
    } else {
        raw = String(obj?.jid || obj?.id || jid || '');
    }
    if (raw.endsWith('@g.us') || raw.includes('broadcast')) return null;
    if (obj?.phoneNumber) {
        const num = String(obj.phoneNumber).replace(/[^0-9]/g, '');
        if (num.length >= 7 && num.length <= 13) return num;
    }
    let clean = raw.split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
    if (raw.endsWith('@lid') || clean.length >= 14) {
        const resolved = lidToPhoneMap.get(clean) || lidToPhoneMap.get(raw.split('@')[0]);
        if (resolved && resolved.length <= 13) clean = resolved;
        else return null; // Ignore unmapped LIDs so they don't appear as fake contacts with numbers as names
    }
    if (clean.length < 7 || clean.length > 13) return null;
    if (clean.length === 10 && /^[6-9]/.test(clean)) clean = '91' + clean;
    return clean;
}

// Merge names/phones from every available Baileys & DB source into `store`,
// in place. Shared by getWhatsAppContacts (personal sync) and
// getGroupParticipants (group import) so both benefit from the same breadth
// of name resolution — group import previously only checked the thin
// contactStores map and missed names Baileys already had cached elsewhere.
async function enrichContactStore(sock, sessionId, store, lidToPhoneMap) {
    lidToPhoneMap = lidToPhoneMap || await buildLidToPhoneMap(sock);
    const extractPhone = (jid, obj) => extractPhoneFromJid(jid, obj, lidToPhoneMap);

    // Source 1 (Base): SQLite wa_contacts table for this session
    try {
        const dbContacts = waContactsDb.getBySession(sessionId) || [];
        for (const c of dbContacts) {
            if (!c.phone || c.phone.length < 5 || c.phone.length >= 14) continue;
            const existing = store.get(c.phone);
            if (!existing) {
                store.set(c.phone, { phone: c.phone, name: c.name || '' });
            } else if (!existing.name && c.name) {
                existing.name = c.name;
            }
        }
    } catch (_) { /* non-fatal */ }

    // Source 2 (Base): SQLite messages table — anyone who ever sent/received a message via this bot
    try {
        const dbMessages = rawDb.prepare('SELECT DISTINCT contact_phone FROM messages WHERE session_id = ?').all(sessionId) || [];
        for (const m of dbMessages) {
            const phone = m.contact_phone;
            if (!phone || phone.length < 5 || phone.length >= 14) continue;
            if (!store.has(phone)) {
                store.set(phone, { phone, name: '' });
            }
        }
    } catch (_) { /* non-fatal */ }

    // Source 3: sock.contacts — Baileys internal contacts map (keyed by JID)
    if (sock.contacts && typeof sock.contacts === 'object') {
        for (const [jid, c] of Object.entries(sock.contacts)) {
            const phone = extractPhone(jid, c);
            if (!phone) continue;
            const existing = store.get(phone);
            const name = c.name || c.notify || c.verifiedName || c.pushname || c.pushName || '';
            if (!existing) {
                store.set(phone, { phone, name });
            } else if (!existing.name && name) {
                existing.name = name;
            }
        }
    }

    // Source 4: sock.store?.contacts — if makeInMemoryStore was attached
    if (sock.store?.contacts && typeof sock.store.contacts === 'object') {
        for (const [jid, c] of Object.entries(sock.store.contacts)) {
            const phone = extractPhone(jid, c);
            if (!phone) continue;
            const existing = store.get(phone);
            const name = c.name || c.notify || c.verifiedName || c.pushname || c.pushName || '';
            if (!existing) {
                store.set(phone, { phone, name });
            } else if (!existing.name && name) {
                existing.name = name;
            }
        }
    }

    // Source 5: sock.chats — everyone you've ever messaged
    const chatsObj = sock.chats || sock.store?.chats;
    if (chatsObj && typeof chatsObj === 'object') {
        const chatEntries = typeof chatsObj.all === 'function'
            ? chatsObj.all()
            : Array.isArray(chatsObj) ? chatsObj : Object.values(chatsObj);
        for (const chat of chatEntries) {
            const phone = extractPhone(chat.id || chat.jid, chat);
            if (!phone) continue;
            const existing = store.get(phone);
            const name = chat.name || chat.notify || chat.verifiedName || chat.pushname || chat.pushName || '';
            if (!existing) {
                store.set(phone, { phone, name });
            } else if (!existing.name && name) {
                existing.name = name;
            }
        }
    }

    contactStores.set(sessionId, store);
}

async function getWhatsAppContacts(sessionId) {
    // Dedupe overlapping calls (double-clicks, or personal sync + group import
    // firing close together) — they'd otherwise race on the same shared store
    // and duplicate expensive Baileys calls (resyncAppState) for no benefit.
    const existingSync = contactSyncInFlight.get(sessionId);
    if (existingSync) return existingSync;

    const syncPromise = (async () => {
        const sock = clients.get(sessionId);
        if (!sock) throw new Error('Session not found or not connected');

        const store = contactStores.get(sessionId) || new Map();
        const hasAnyName = () => Array.from(store.values()).some(c => c.name);

        // First pass — collect from currently available Baileys & DB sources
        await enrichContactStore(sock, sessionId, store);

        // If no contact has a resolved name yet, trigger a WhatsApp app-state
        // resync to push real contact data from the cloud. Gated on "no name
        // resolved" rather than "store is empty" — a previous partial sync can
        // leave phone-only stub entries persisted in SQLite, which would
        // otherwise make the store look non-empty forever and permanently
        // suppress this fallback. Cooldown-gated too, so an account that
        // genuinely has no nameable contacts doesn't pay the ~6s resync cost
        // on every single sync call.
        const lastAttempt = lastFullResyncAttempt.get(sessionId) || 0;
        if (!hasAnyName() && (Date.now() - lastAttempt) > RESYNC_COOLDOWN_MS) {
            lastFullResyncAttempt.set(sessionId, Date.now());
            console.log(`[Sync Contacts] No resolved names yet for session ${sessionId}, triggering app-state resync...`);
            try {
                await sock.resyncAppState([
                    'critical_block_low',
                    'critical_unblock_low',
                    'regular_high',
                    'regular_low',
                ]).catch(() => {});
            } catch (_) {}

            // Wait up to 6 seconds for contacts.upsert events to fire
            const deadline = Date.now() + 6000;
            while (Date.now() < deadline) {
                await new Promise(r => setTimeout(r, 600));
                if (hasAnyName()) break;
            }

            // Second pass after resync
            await enrichContactStore(sock, sessionId, store);
        }

        // Persist all discovered contacts to SQLite for future restarts — this
        // still includes phone-only stubs (without a resolved name), since
        // they're useful lookup seeds for later enrichment even though we
        // don't hand them back to the caller below.
        const toSave = Array.from(store.values()).filter(c => c.phone && c.phone.length > 4);
        if (toSave.length > 0) {
            try { waContactsDb.upsertMany(sessionId, toSave); } catch (_) {}
        }

        // Personal contact sync only returns contacts with an actual resolved
        // name — i.e. people genuinely saved in your address book (or known by
        // pushName), not every phone number ever seen in a message/chat.
        // Group import (getGroupParticipants) intentionally keeps nameless
        // numbers, since bulk-messaging a group doesn't require knowing names.
        let result = toSave
            .filter(c => c.name)
            .map(c => ({
                phone: c.phone,
                name: c.name,
                pushname: c.name,
                notify: c.name,
                company: '',
            }));

        // Self-fallback only applies to a truly blank account (no phone numbers
        // found at all, named or not) — gated on toSave, not result, so an
        // account with plenty of real (just nameless) numbers gets the more
        // specific error below instead of a misleading fake contact.
        if (!result.length && !toSave.length) {
            const selfId = sock.user?.id || '';
            const selfPhone = selfId.replace(/[:@].*$/, '');
            if (selfPhone && selfPhone.length > 4) {
                result = [{
                    phone: selfPhone,
                    name: 'My Account (Self Test)',
                    company: 'Self',
                }];
                try { waContactsDb.upsertMany(sessionId, result); } catch (_) {}
            }
        }

        if (!result.length && toSave.length > 0) {
            throw new Error(
                `Found ${toSave.length} WhatsApp contact(s), but none have a saved name yet — ` +
                'only named contacts are synced here. Save their names in your phone\'s contacts, ' +
                'or use "Grab Members" on a group to import numbers without names.'
            );
        }

        if (!result.length) {
            throw new Error(
                'No contacts found. This usually means WhatsApp hasn\'t synced contacts yet.\n' +
                'Try: (1) Make sure your phone has contacts saved, (2) Send or receive at least one message, then sync again.'
            );
        }

        return result;
    })();

    contactSyncInFlight.set(sessionId, syncPromise);
    try {
        return await syncPromise;
    } finally {
        contactSyncInFlight.delete(sessionId);
    }
}



async function getWhatsAppGroups(sessionId) {
    const sock = clients.get(sessionId);
    if (!sock) throw new Error('Session not found or not connected');

    try {
        const groups = await sock.groupFetchAllParticipating();
        return Object.values(groups).map(g => ({
            id: g.id,
            name: g.subject || g.id,
            participantCount: g.participants ? g.participants.length : 0,
        }));
    } catch (error) {
        console.error(`[Session ${sessionId}] Error fetching groups:`, error.message);
        throw error;
    }
}

async function getGroupParticipants(sessionId, groupId) {
    // Dedupe overlapping calls for the *same* group (double-clicks) without
    // blocking imports of a *different* group for the same session, which is
    // why this is keyed by sessionId+groupId rather than sessionId alone.
    const lockKey = `${sessionId}:${groupId}`;
    const existingSync = groupSyncInFlight.get(lockKey);
    if (existingSync) return existingSync;

    const syncPromise = (async () => {
        const sock = clients.get(sessionId);
        if (!sock) throw new Error('Session not found or not connected');

        try {
            const metadata = await sock.groupMetadata(groupId);
            if (!metadata || !metadata.participants) throw new Error('Group not found');

            const store = contactStores.get(sessionId) || new Map();
            const lidToPhoneMap = await buildLidToPhoneMap(sock);
            await enrichContactStore(sock, sessionId, store, lidToPhoneMap);

            const buildResult = () => metadata.participants
                .map(p => {
                    const phone = extractPhoneFromJid(p.jid || p.id, p, lidToPhoneMap);
                    if (!phone) return null; // Unresolved @lid participant — skip rather than import a fake number
                    const contact = store.get(phone);
                    const displayName = contact?.name || p.name || p.notify || p.verifiedName || p.pushname || p.pushName || '';
                    const isAdmin = p.admin === 'admin' || p.admin === 'superadmin' || false;
                    return {
                        phone,
                        name: displayName,
                        pushname: displayName,
                        notify: displayName,
                        company: '',
                        isAdmin,
                        admin: p.admin || null,
                    };
                })
                .filter(Boolean);

            let result = buildResult();

            // If nobody resolved a name, give this the same resync-and-wait
            // fallback getWhatsAppContacts has — Baileys' contact/chat data may
            // simply not be populated yet right after a (re)connect. Shares the
            // same session-wide cooldown so grabbing several groups back-to-back
            // doesn't hammer resyncAppState repeatedly.
            const lastAttempt = lastFullResyncAttempt.get(sessionId) || 0;
            if (result.length && !result.some(c => c.name) && (Date.now() - lastAttempt) > RESYNC_COOLDOWN_MS) {
                lastFullResyncAttempt.set(sessionId, Date.now());
                console.log(`[Grab Group] No resolved names yet for session ${sessionId}, triggering app-state resync...`);
                try {
                    await sock.resyncAppState([
                        'critical_block_low',
                        'critical_unblock_low',
                        'regular_high',
                        'regular_low',
                    ]).catch(() => {});
                } catch (_) {}

                const deadline = Date.now() + 6000;
                while (Date.now() < deadline) {
                    await new Promise(r => setTimeout(r, 600));
                    if (Array.from(store.values()).some(c => c.name)) break;
                }

                await enrichContactStore(sock, sessionId, store, lidToPhoneMap);
                result = buildResult();
            }

            return result;
        } catch (error) {
            console.error(`[Session ${sessionId}] Error fetching group participants:`, error.message);
            throw error;
        }
    })();

    groupSyncInFlight.set(lockKey, syncPromise);
    try {
        return await syncPromise;
    } finally {
        groupSyncInFlight.delete(lockKey);
    }
}

// ═══════════════════════════════════════
// Group Management (write operations)
// ═══════════════════════════════════════

const groupActionTimestamps = []; // timestamps of recent group actions
const GROUP_ACTION_LIMIT = 5;     // max actions per window
const GROUP_ACTION_WINDOW = 60 * 1000; // 1 minute window

function isGroupActionAllowed() {
    const now = Date.now();
    // Prune old timestamps
    while (groupActionTimestamps.length > 0 && groupActionTimestamps[0] < now - GROUP_ACTION_WINDOW) {
        groupActionTimestamps.shift();
    }
    if (groupActionTimestamps.length >= GROUP_ACTION_LIMIT) {
        return false;
    }
    groupActionTimestamps.push(now);
    return true;
}

function getGroupActionCount() {
    const now = Date.now();
    while (groupActionTimestamps.length > 0 && groupActionTimestamps[0] < now - GROUP_ACTION_WINDOW) {
        groupActionTimestamps.shift();
    }
    return groupActionTimestamps.length;
}

async function createGroup(sessionId, subject, participants) {
    const sock = clients.get(sessionId);
    if (!sock) throw new Error('Session not found or not connected');
    if (!isGroupActionAllowed()) {
        throw new Error(`Rate limit: max ${GROUP_ACTION_LIMIT} group actions per minute. Wait and try again.`);
    }
    // Format phone numbers to JIDs
    const jids = participants.map(p => {
        const clean = String(p).replace(/[^0-9]/g, '');
        return `${clean}@s.whatsapp.net`;
    });
    const result = await sock.groupCreate(subject, jids);
    return { id: result.id, name: result.subject, participants: jids.length };
}

async function addGroupParticipants(sessionId, groupId, participants) {
    const sock = clients.get(sessionId);
    if (!sock) throw new Error('Session not found or not connected');
    if (!isGroupActionAllowed()) {
        throw new Error(`Rate limit: max ${GROUP_ACTION_LIMIT} group actions per minute. Wait and try again.`);
    }
    const jids = participants.map(p => {
        const clean = String(p).replace(/[^0-9]/g, '');
        return `${clean}@s.whatsapp.net`;
    });
    const result = await sock.groupParticipantsUpdate(groupId, jids, 'add');
    return result;
}

async function removeGroupParticipants(sessionId, groupId, participants) {
    const sock = clients.get(sessionId);
    if (!sock) throw new Error('Session not found or not connected');
    if (!isGroupActionAllowed()) {
        throw new Error(`Rate limit: max ${GROUP_ACTION_LIMIT} group actions per minute. Wait and try again.`);
    }
    const jids = participants.map(p => {
        const clean = String(p).replace(/[^0-9]/g, '');
        return `${clean}@s.whatsapp.net`;
    });
    const result = await sock.groupParticipantsUpdate(groupId, jids, 'remove');
    return result;
}

async function promoteGroupParticipants(sessionId, groupId, participants) {
    const sock = clients.get(sessionId);
    if (!sock) throw new Error('Session not found or not connected');
    if (!isGroupActionAllowed()) {
        throw new Error(`Rate limit: max ${GROUP_ACTION_LIMIT} group actions per minute. Wait and try again.`);
    }
    const jids = participants.map(p => {
        const clean = String(p).replace(/[^0-9]/g, '');
        return `${clean}@s.whatsapp.net`;
    });
    return await sock.groupParticipantsUpdate(groupId, jids, 'promote');
}

async function demoteGroupParticipants(sessionId, groupId, participants) {
    const sock = clients.get(sessionId);
    if (!sock) throw new Error('Session not found or not connected');
    if (!isGroupActionAllowed()) {
        throw new Error(`Rate limit: max ${GROUP_ACTION_LIMIT} group actions per minute. Wait and try again.`);
    }
    const jids = participants.map(p => {
        const clean = String(p).replace(/[^0-9]/g, '');
        return `${clean}@s.whatsapp.net`;
    });
    return await sock.groupParticipantsUpdate(groupId, jids, 'demote');
}

async function renameGroup(sessionId, groupId, newSubject) {
    const sock = clients.get(sessionId);
    if (!sock) throw new Error('Session not found or not connected');
    if (!isGroupActionAllowed()) {
        throw new Error(`Rate limit: max ${GROUP_ACTION_LIMIT} group actions per minute. Wait and try again.`);
    }
    return await sock.groupUpdateSubject(groupId, newSubject);
}

async function updateGroupDescription(sessionId, groupId, description) {
    const sock = clients.get(sessionId);
    if (!sock) throw new Error('Session not found or not connected');
    if (!isGroupActionAllowed()) {
        throw new Error(`Rate limit: max ${GROUP_ACTION_LIMIT} group actions per minute. Wait and try again.`);
    }
    return await sock.groupUpdateDescription(groupId, description);
}

async function leaveGroup(sessionId, groupId) {
    const sock = clients.get(sessionId);
    if (!sock) throw new Error('Session not found or not connected');
    return await sock.groupLeave(groupId);
}

async function getGroupInviteCode(sessionId, groupId) {
    const sock = clients.get(sessionId);
    if (!sock) throw new Error('Session not found or not connected');
    return await sock.groupInviteCode(groupId);
}

// ═══════════════════════════════════════
// Getters & Setters
// ═══════════════════════════════════════

function getClient(sessionId) {
    return clients.get(sessionId) || null;
}

function listSessions() {
    const dbSessions = sessionDb.getAll();
    return dbSessions.map((s) => {
        const live = sessionStates.get(s.id);
        return {
            ...s,
            status: live ? live.status : s.status,
            qr: live ? live.qr : null,
            auto_reply: !!s.auto_reply,
        };
    });
}

function getSessionState(sessionId) {
    return sessionStates.get(sessionId) || { status: 'unknown', qr: null };
}

function setAutoReply(sessionId, enabled) {
    sessionDb.setAutoReply(sessionId, enabled);
}

// ═══════════════════════════════════════
// Message & Vote Handlers (same pattern as before)
// ═══════════════════════════════════════

const _messageHandlers = [];
const _voteHandlers = [];

function onMessage(handler) {
    _messageHandlers.push(handler);
}

function onVote(handler) {
    _voteHandlers.push(handler);
}

/**
 * Store a sent poll message for later vote decoding.
 * Called by bulkSender after sending a poll.
 */
function storePollMessage(jid, msgId, message) {
    pollMessageStore.set(`${jid}:${msgId}`, { message, createdAt: Date.now() });
}

// ═══════════════════════════════════════
// Exports — same public API as before
// ═══════════════════════════════════════

module.exports = {
    init,
    createClient,
    addSession,
    removeSession,
    restartSession,
    relinkSession,
    getClient,
    listSessions,
    getSessionState,
    setAutoReply,
    getWhatsAppContacts,
    getWhatsAppGroups,
    getGroupParticipants,
    onMessage,
    onVote,
    storePollMessage,
    // Group management
    createGroup,
    addGroupParticipants,
    removeGroupParticipants,
    promoteGroupParticipants,
    demoteGroupParticipants,
    renameGroup,
    updateGroupDescription,
    leaveGroup,
    getGroupInviteCode,
    getGroupActionCount,
    // Utility exports for other modules
    extractMessageText,
    getMessageType,
    hasMedia,
};
