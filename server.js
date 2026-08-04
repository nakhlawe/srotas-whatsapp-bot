require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// When run as an Electron utility process (see main.js), a force-quit of the
// main process can sever this process's stdout/stderr pipe abruptly. The
// next console.log/error call would otherwise throw EPIPE as an uncaught
// exception and crash this process with a raw stack trace — ignore it
// instead and keep running (the next app launch's orphan recovery will
// clean this process up if it's no longer needed).
process.stdout.on('error', (err) => { if (err.code !== 'EPIPE') throw err; });
process.stderr.on('error', (err) => { if (err.code !== 'EPIPE') throw err; });

process.on('uncaughtException', (err) => {
    try {
        if (process.env.APP_USER_DATA_PATH) {
            fs.appendFileSync(path.join(process.env.APP_USER_DATA_PATH, 'crash.log'), `[Server Uncaught] ${err.message}\n${err.stack}\n`);
        }
    } catch (e) {}
});

const sessionManager = require('./src/whatsapp/sessionManager');
const messageHandler = require('./src/whatsapp/messageHandler');
const bulkSender = require('./src/messaging/bulkSender');
const scheduler = require('./src/messaging/scheduler');
const importer = require('./src/contacts/importer');
const license = require('./src/license');
const { db, sessions: sessionsDb, contacts: contactsDb, groups: groupsDb, campaigns: campaignsDb, settings: settingsDb, messages: messagesDb, quickReplies: quickRepliesDb, templates: templatesDb, autoReplyLogs, blacklist: blacklistDb, webhooks: webhooksDb, followUps: followUpsDb, waGroupCategories: waGroupCategoriesDb, waContacts: waContactsDb, groupActivityLog: groupActivityLogDb } = require('./src/db/database');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: '*' },
    pingTimeout: 60000,
    pingInterval: 25000,
    maxHttpBufferSize: 1e6,       // 1 MB max payload (default is 100 MB)
    perMessageDeflate: false,     // Disable compression to save CPU
    httpCompression: false,
});

// Fix #23: Validate numeric :id parameter on non-session API endpoints
app.param('id', (req, res, next, id) => {
    if (!req.path.startsWith('/api/sessions/') && isNaN(parseInt(id, 10))) {
        return res.status(400).json({ error: 'Invalid ID format — numeric ID required' });
    }
    next();
});

const pkg = require('./package.json');

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Upload directory
const UPLOAD_DIR = process.env.APP_USER_DATA_PATH
    ? path.join(process.env.APP_USER_DATA_PATH, 'uploads')
    : path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({ dest: UPLOAD_DIR });

// Initialize modules
sessionManager.init(io);
bulkSender.init(io);
messageHandler.init();
scheduler.init(io);

// ─── Webhook Notifier ───
async function notifyWebhooks(event, data) {
    try {
        const hooks = webhooksDb.getEnabled();
        for (const hook of hooks) {
            let events;
            try { events = JSON.parse(hook.events); } catch (e) { events = []; }
            if (!events.includes(event)) continue;

            const payload = { event, timestamp: new Date().toISOString(), data };
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 10000);
            fetch(hook.url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Webhook-Source': 'ajm-bot',
                    ...(hook.secret ? { 'X-Webhook-Secret': hook.secret } : {}),
                },
                body: JSON.stringify(payload),
                signal: controller.signal,
            }).then(resp => {
                clearTimeout(timeout);
                webhooksDb.recordTrigger(hook.id, resp.status);
            }).catch(() => {
                clearTimeout(timeout);
                webhooksDb.recordTrigger(hook.id, 0);
            });
        }
    } catch (e) { /* non-critical */ }
}

// ─── Follow-up Engine ───
const followUpEngine = require('./src/messaging/followUpEngine');
followUpEngine.init(io, notifyWebhooks);
followUpEngine.start();

// ═══════════════════════════════════════
// API ROUTES — License & Activation
// ═══════════════════════════════════════

app.get('/api/license-status', (req, res) => {
    const activated = license.isActivated();
    if (!activated) return res.json({ activated: false });

    const { settings: settingsDb } = require('./src/db/database');
    const savedKey = settingsDb.get('license_key');
    let expiryDate = null, daysRemaining = null, isLifetime = false;

    if (savedKey === 'SROTAS-EASTER-EGG-2026') {
        isLifetime = true;
    } else if (savedKey) {
        try {
            const cleanKey = savedKey.replace(/-/g, '').toUpperCase();
            const EPOCH = new Date('2024-01-01T00:00:00Z').getTime();
            const daysSinceEpoch = parseInt(cleanKey.slice(0, 4), 16);
            const expiryMs = EPOCH + (daysSinceEpoch + 1) * 24 * 60 * 60 * 1000;
            expiryDate = new Date(expiryMs).toISOString().split('T')[0];
            daysRemaining = Math.max(0, Math.ceil((expiryMs - Date.now()) / (24 * 60 * 60 * 1000)));
        } catch (e) { /* ignore decode errors */ }
    }

    const keyMasked = savedKey
        ? savedKey.replace(/-/g, '').slice(0, 4) + '-****-****-' + savedKey.replace(/-/g, '').slice(-4)
        : null;

    res.json({ activated, isLifetime, expiryDate, daysRemaining, keyMasked });
});

app.post('/api/activate', (req, res) => {
    try {
        const { key } = req.body;
        if (!key) return res.status(400).json({ error: 'License key is required' });

        const result = license.activate(key);
        if (result.success) {
            res.json({ success: true, message: 'Software activated successfully.' });
        } else {
            res.status(400).json({
                error: result.reason === 'License expired'
                    ? 'This license key has expired.'
                    : 'Invalid license key. Please check and try again.'
            });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/deactivate', (req, res) => {
    try {
        const { settings: settingsDb } = require('./src/db/database');
        settingsDb.set('license_activated', 'false');
        settingsDb.set('license_key', '');
        res.json({ success: true, message: 'License deactivated successfully.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── Admin: Key Generator (Easter egg only) ───
app.post('/api/admin/generate-key', (req, res) => {
    const { settings: settingsDb } = require('./src/db/database');
    const savedKey = settingsDb.get('license_key');
    if (savedKey !== 'SROTAS-EASTER-EGG-2026') {
        return res.status(403).json({ error: 'Forbidden' });
    }
    const days = parseInt(req.body.days);
    if (!days || days < 1 || days > 9999) {
        return res.status(400).json({ error: 'Invalid duration. Must be 1–9999 days.' });
    }
    try {
        const key = license.generateKey(days);
        const expiryDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        // Persist to history
        let history = [];
        try { history = JSON.parse(settingsDb.get('admin_issued_keys') || '[]'); } catch (e) { }
        history.unshift({ key, days, expiryDate, generatedAt: new Date().toISOString() });
        settingsDb.set('admin_issued_keys', JSON.stringify(history.slice(0, 100)));
        res.json({ key, expiryDate, days });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/admin/history', (req, res) => {
    const { settings: settingsDb } = require('./src/db/database');
    const savedKey = settingsDb.get('license_key');
    if (savedKey !== 'SROTAS-EASTER-EGG-2026') return res.status(403).json({ error: 'Forbidden' });
    try { res.json(JSON.parse(settingsDb.get('admin_issued_keys') || '[]')); }
    catch (e) { res.json([]); }
});

// ═══════════════════════════════════════
// API ROUTES — Version / Update Check
// ═══════════════════════════════════════

app.get('/api/version', (req, res) => {
    res.json({ version: pkg.version });
});

app.get('/api/check-update', async (req, res) => {
    try {
        const currentVersion = pkg.version;

        const response = await fetch('https://api.github.com/repos/itsdkyp/srotas-whatsapp-bot/releases/latest', {
            headers: { 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'srotas-bot' }
        });

        if (!response.ok) {
            // No releases yet or repo is private
            return res.json({ currentVersion, latestVersion: currentVersion, updateAvailable: false });
        }

        const release = await response.json();
        const latestVersion = (release.tag_name || '').replace(/^v/, '');

        // Simple semver compare
        const compareSemver = (a, b) => {
            const pa = a.split('.').map(Number);
            const pb = b.split('.').map(Number);
            for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
                const na = pa[i] || 0, nb = pb[i] || 0;
                if (na > nb) return 1;
                if (na < nb) return -1;
            }
            return 0;
        };

        const updateAvailable = compareSemver(latestVersion, currentVersion) > 0;

        let downloadWindows = null;
        let downloadMac = null;

        if (release.assets && Array.isArray(release.assets)) {
            const winAsset = release.assets.find(a => a.name.endsWith('.exe'));
            const macAsset = release.assets.find(a => a.name.endsWith('.dmg'));
            if (winAsset) downloadWindows = winAsset.browser_download_url;
            if (macAsset) downloadMac = macAsset.browser_download_url;
        }

        res.json({
            currentVersion,
            latestVersion,
            updateAvailable,
            releaseUrl: release.html_url || '',
            releaseNotes: release.body || '',
            publishedAt: release.published_at || '',
            downloadWindows,
            downloadMac
        });
    } catch (err) {
        res.json({ currentVersion: pkg.version, latestVersion: pkg.version, updateAvailable: false, error: 'Could not reach GitHub. Check your internet connection.' });
    }
});

// ═══════════════════════════════════════
// API ROUTES — Sessions
// ═══════════════════════════════════════

app.get('/api/sessions', (req, res) => {
    res.json(sessionManager.listSessions());
});

app.post('/api/sessions', async (req, res) => {
    try {
        const { name } = req.body;
        if (!name) return res.status(400).json({ error: 'Name is required' });
        const sessionId = await sessionManager.addSession(name);
        const state = sessionManager.getSessionState(sessionId);
        res.json({ sessionId, name, status: state.status, qr: state.qr });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/sessions/:id', async (req, res) => {
    try {
        await sessionManager.removeSession(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/sessions/:id/restart', async (req, res) => {
    try {
        await sessionManager.restartSession(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/sessions/:id/relink', async (req, res) => {
    try {
        await sessionManager.relinkSession(req.params.id);
        const state = sessionManager.getSessionState(req.params.id);
        res.json({ success: true, status: state.status, qr: state.qr });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/sessions/:id/auto-reply', (req, res) => {
    const { enabled } = req.body;
    sessionManager.setAutoReply(req.params.id, enabled);
    res.json({ success: true });
});

app.put('/api/sessions/:id/ai-replies', (req, res) => {
    try {
        const { enabled } = req.body;
        console.log(`[API] Setting AI replies for session ${req.params.id} to ${enabled}`);
        sessionsDb.setAiReplies(req.params.id, enabled);
        res.json({ success: true });
    } catch (err) {
        console.error('[API] Error setting AI replies:', err);
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/sessions/:id/quick-replies', (req, res) => {
    try {
        const { enabled } = req.body;
        console.log(`[API] Setting quick replies for session ${req.params.id} to ${enabled}`);
        sessionsDb.setQuickReplies(req.params.id, enabled);
        res.json({ success: true });
    } catch (err) {
        console.error('[API] Error setting quick replies:', err);
        res.status(500).json({ error: err.message });
    }
});

// ═══════════════════════════════════════
// API ROUTES — Groups
// ═══════════════════════════════════════

app.get('/api/groups', (req, res) => {
    res.json(groupsDb.getAll());
});

app.post('/api/groups', (req, res) => {
    try {
        const { name, description } = req.body;
        if (!name || !name.trim()) return res.status(400).json({ error: 'Group name is required' });
        const existing = groupsDb.getByName(name.trim());
        if (existing) return res.status(400).json({ error: 'Group already exists' });
        groupsDb.create(name.trim(), description || '');
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/groups/:id', (req, res) => {
    try {
        const { name } = req.body;
        if (!name) return res.status(400).json({ error: 'New name is required' });
        groupsDb.rename(parseInt(req.params.id), name.trim());
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/groups/:id', (req, res) => {
    try {
        groupsDb.delete(parseInt(req.params.id));
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ═══════════════════════════════════════
// API ROUTES — Contacts
// ═══════════════════════════════════════

app.get('/api/contacts', (req, res) => {
    const { group, search, page, limit } = req.query;

    if (page || limit) {
        const p = parseInt(page) || 1;
        const l = parseInt(limit) || 50;
        const offset = (p - 1) * l;
        return res.json(contactsDb.getPaginated(group === 'all' ? undefined : group, l, offset, search));
    }

    if (search) return res.json(contactsDb.search(search));
    res.json(contactsDb.getAll(group === 'all' ? undefined : group));
});

app.get('/api/contacts/export-csv', (req, res) => {
    const { group } = req.query;
    const rows = contactsDb.getAll(group === 'all' ? undefined : group);

    let csv = 'phone,name,company,group_name\n';
    const escapeCsv = (val) => {
        if (val === null || val === undefined) return '""';
        let str = String(val);
        if (/^[=+\-@]/.test(str)) str = "'" + str; // Fix #7: Prevent formula injection
        return `"${str.replace(/"/g, '""')}"`;
    };
    for (const c of rows) {
        csv += `${escapeCsv(c.phone)},${escapeCsv(c.name)},${escapeCsv(c.company)},${escapeCsv(c.group_name)}\n`;
    }

    res.header('Content-Type', 'text/csv');
    res.attachment(`contacts-${group || 'all'}-${Date.now()}.csv`);
    return res.send(csv);
});

app.get('/api/contacts/groups', (req, res) => {
    res.json(contactsDb.getGroups());
});

app.post('/api/contacts', (req, res) => {
    try {
        const { phone, name, company, group } = req.body;
        if (!phone || !phone.trim()) return res.status(400).json({ error: 'Phone number is required' });
        contactsDb.create(phone.trim(), name || '', company || '', {}, group || 'default');
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/contacts/:id', (req, res) => {
    try {
        const { phone, name, company, group_name } = req.body;
        const id = parseInt(req.params.id);
        const existing = contactsDb.getById(id);
        if (!existing) return res.status(404).json({ error: 'Contact not found' });
        contactsDb.update(id, {
            phone: phone !== undefined ? phone.trim() : existing.phone,
            name: name !== undefined ? name : existing.name,
            company: company !== undefined ? company : existing.company,
            group_name: group_name !== undefined ? group_name : existing.group_name,
        });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/contacts/upload', upload.single('file'), (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
        const result = importer.parseFile(req.file.path);
        result.uploadId = req.file.filename;
        delete result.rows; // raw rows stay server-side; re-parsed by uploadId on confirm
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/contacts/import', (req, res) => {
    try {
        const { contacts, group } = req.body;
        if (!contacts || !contacts.length) return res.status(400).json({ error: 'No contacts provided' });
        // Ensure group exists
        const g = group || 'default';
        if (!groupsDb.getByName(g)) {
            groupsDb.create(g, '');
        }
        contactsDb.bulkCreate(contacts, g);
        res.json({ success: true, count: contacts.length });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Confirms a CSV/Excel import after the user has reviewed/edited the column
// mapping (which column is phone/name/company, and what {{placeholder}} key
// each remaining column should use) returned by /api/contacts/upload.
app.post('/api/contacts/import-mapped', (req, res) => {
    try {
        const { uploadId, group, mapping } = req.body;
        if (!uploadId || !mapping || !mapping.phone) {
            return res.status(400).json({ error: 'uploadId and a phone column mapping are required' });
        }
        const filePath = path.join(UPLOAD_DIR, uploadId);
        if (!fs.existsSync(filePath)) {
            return res.status(400).json({ error: 'Upload has expired — please re-select the file and try again' });
        }

        const { rows } = importer.parseFile(filePath);
        const contacts = importer.buildContacts(rows, mapping);
        if (!contacts.length) return res.status(400).json({ error: 'No valid contacts found with the given mapping' });

        const g = group || 'default';
        if (!groupsDb.getByName(g)) {
            groupsDb.create(g, '');
        }
        contactsDb.bulkCreate(contacts, g);
        res.json({ success: true, count: contacts.length });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/contacts/sync/:sessionId', async (req, res) => {
    try {
        const sessionId = req.params.sessionId;
        const state = sessionManager.getSessionState(sessionId);
        console.log('[Sync Contacts] Looked up session:', sessionId, 'Found state:', state);
        if (state.status !== 'ready') {
            return res.status(400).json({ error: `Session is not ready (status: ${state.status}). Please ensure WhatsApp is connected.` });
        }
        const contacts = await sessionManager.getWhatsAppContacts(sessionId);
        res.json(contacts);
    } catch (err) {
        console.error('[Sync Contacts] Error:', err.message);
        // Return empty array for expected cases instead of 500
        if (err.message.includes('none have a saved name') || err.message.includes('No contacts found')) {
            return res.json([]);
        }
        res.status(500).json({ error: err.message || 'Failed to sync WhatsApp contacts' });
    }
});

app.get('/api/contacts/wa-groups/:sessionId', async (req, res) => {
    try {
        const sessionId = req.params.sessionId;
        const state = sessionManager.getSessionState(sessionId);
        if (state.status !== 'ready') {
            return res.status(400).json({ error: `Session is not ready (status: ${state.status}). Please ensure WhatsApp is connected.` });
        }
        const groups = await sessionManager.getWhatsAppGroups(sessionId);
        res.json(groups);
    } catch (err) {
        console.error('[WA Groups] Error:', err.message);
        res.status(500).json({ error: err.message || 'Failed to fetch WhatsApp groups' });
    }
});

app.get('/api/contacts/grab-group/:sessionId/:groupId', async (req, res) => {
    try {
        const { sessionId, groupId } = req.params;
        const state = sessionManager.getSessionState(sessionId);
        if (state.status !== 'ready') {
            return res.status(400).json({ error: `Session is not ready (status: ${state.status}). Please ensure WhatsApp is connected.` });
        }
        const contacts = await sessionManager.getGroupParticipants(sessionId, groupId);
        res.json(contacts);
    } catch (err) {
        console.error('[Grab Group] Error:', err.message);
        res.status(500).json({ error: err.message || 'Failed to grab group contacts' });
    }
});

app.get('/api/contacts/debug-group/:sessionId/:groupId', async (req, res) => {
    try {
        const { sessionId, groupId } = req.params;
        const sock = sessionManager.getClient(sessionId);
        if (!sock) return res.status(400).json({ error: 'No sock' });
        const metadata = await sock.groupMetadata(groupId);
        res.json({ participants: metadata.participants });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ═══════════════════════════════════════
// API ROUTES — WhatsApp Group Management
// ═══════════════════════════════════════

app.post('/api/wa-groups/create', async (req, res) => {
    try {
        const { sessionId, name, participants } = req.body;
        if (!sessionId || !name || !participants || !participants.length) {
            return res.status(400).json({ error: 'sessionId, name, and participants (array of phone numbers) are required' });
        }
        const result = await sessionManager.createGroup(sessionId, name, participants);
        res.json({ success: true, ...result });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/wa-groups/:groupId/add', async (req, res) => {
    try {
        const { sessionId, participants } = req.body;
        if (!sessionId || !participants || !participants.length) {
            return res.status(400).json({ error: 'sessionId and participants are required' });
        }
        const result = await sessionManager.addGroupParticipants(sessionId, req.params.groupId, participants);
        res.json({ success: true, result });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/wa-groups/:groupId/remove', async (req, res) => {
    try {
        const { sessionId, participants } = req.body;
        if (!sessionId || !participants || !participants.length) {
            return res.status(400).json({ error: 'sessionId and participants are required' });
        }
        const result = await sessionManager.removeGroupParticipants(sessionId, req.params.groupId, participants);
        res.json({ success: true, result });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/wa-groups/:groupId/promote', async (req, res) => {
    try {
        const { sessionId, participants } = req.body;
        const result = await sessionManager.promoteGroupParticipants(sessionId, req.params.groupId, participants);
        res.json({ success: true, result });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/wa-groups/:groupId/demote', async (req, res) => {
    try {
        const { sessionId, participants } = req.body;
        const result = await sessionManager.demoteGroupParticipants(sessionId, req.params.groupId, participants);
        res.json({ success: true, result });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/wa-groups/:groupId/rename', async (req, res) => {
    try {
        const { sessionId, name } = req.body;
        if (!sessionId || !name) return res.status(400).json({ error: 'sessionId and name are required' });
        await sessionManager.renameGroup(sessionId, req.params.groupId, name);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/wa-groups/:groupId/description', async (req, res) => {
    try {
        const { sessionId, description } = req.body;
        await sessionManager.updateGroupDescription(sessionId, req.params.groupId, description);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/wa-groups/:groupId/leave', async (req, res) => {
    try {
        const { sessionId } = req.body;
        await sessionManager.leaveGroup(sessionId, req.params.groupId);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/wa-groups/:groupId/invite', async (req, res) => {
    try {
        const { sessionId } = req.query;
        const code = await sessionManager.getGroupInviteCode(sessionId, req.params.groupId);
        res.json({ inviteCode: code, inviteLink: `https://chat.whatsapp.com/${code}` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/wa-groups/rate-limit', (req, res) => {
    res.json({ count: sessionManager.getGroupActionCount(), limit: 5, window: '1 minute' });
});

// ─── Groups with pending join requests ───
app.get('/api/wa-groups/pending-requests/:sessionId', (req, res) => {
    try {
        const { sessionId } = req.params;
        const result = sessionManager.getGroupsWithPendingRequests(sessionId);
        res.json({ success: true, groups: result });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── Group Join Requests ───
app.get('/api/wa-groups/:groupId/join-requests/:sessionId', async (req, res) => {
    try {
        const { sessionId, groupId } = req.params;
        const result = await sessionManager.getGroupJoinRequests(sessionId, groupId);
        res.json({ success: true, ...result });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/wa-groups/:groupId/join-requests/approve/:sessionId', async (req, res) => {
    try {
        const { sessionId, groupId } = req.params;
        const { participants } = req.body;
        if (!participants || !participants.length) return res.status(400).json({ error: 'participants array is required' });
        const result = await sessionManager.approveGroupJoinRequest(sessionId, groupId, participants);
        res.json({ success: true, result });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/wa-groups/:groupId/join-requests/reject/:sessionId', async (req, res) => {
    try {
        const { sessionId, groupId } = req.params;
        const { participants } = req.body;
        if (!participants || !participants.length) return res.status(400).json({ error: 'participants array is required' });
        const result = await sessionManager.rejectGroupJoinRequest(sessionId, groupId, participants);
        res.json({ success: true, result });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── Group Export ───

app.get('/api/wa-groups/:groupId/export/:sessionId', async (req, res) => {
    try {
        const { sessionId, groupId } = req.params;
        const state = sessionManager.getSessionState(sessionId);
        if (state.status !== 'ready') {
            return res.status(400).json({ error: `Session is not ready (status: ${state.status})` });
        }
        const data = await sessionManager.exportGroup(sessionId, groupId);
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/wa-groups/:groupId/export-summary-csv/:sessionId', async (req, res) => {
    try {
        const { sessionId, groupId } = req.params;
        const state = sessionManager.getSessionState(sessionId);
        if (state.status !== 'ready') {
            return res.status(400).json({ error: `Session is not ready (status: ${state.status})` });
        }
        const data = await sessionManager.exportGroup(sessionId, groupId);

        let csv = 'group_name,member_count,admin_count,invite_link\n';
        const esc = (v) => `"${String(v || '').replace(/"/g, '""')}"`;
        csv += `${esc(data.name)},${data.participantCount},${data.adminCount},${esc(data.inviteLink)}\n`;

        res.header('Content-Type', 'text/csv');
        res.attachment(`${data.name}-summary-${Date.now()}.csv`);
        res.send(csv);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/wa-groups/:groupId/export-csv/:sessionId', async (req, res) => {
    try {
        const { sessionId, groupId } = req.params;
        const state = sessionManager.getSessionState(sessionId);
        if (state.status !== 'ready') {
            return res.status(400).json({ error: `Session is not ready (status: ${state.status})` });
        }
        const data = await sessionManager.exportGroup(sessionId, groupId);

        let csv = 'member_phone,member_name,db_name,is_admin,invite_link\n';
        const esc = (v) => `"${String(v || '').replace(/"/g, '""')}"`;
        if (data.participants && data.participants.length > 0) {
            for (const p of data.participants) {
                const dbContact = contactsDb.getByPhone(p.phone);
                const dbName = dbContact ? (dbContact.name || '') : '';
                const bestName = dbName || p.name;
                csv += `${esc(p.phone)},${esc(p.name)},${esc(dbName)},${p.isAdmin ? 'Yes' : 'No'},${esc(data.inviteLink)}\n`;
            }
        } else {
            csv += `${esc(data.name)} group has no members\n`;
        }

        res.header('Content-Type', 'text/csv');
        res.attachment(`${data.name}-export-${Date.now()}.csv`);
        res.send(csv);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/wa-groups/export-all/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;
        const state = sessionManager.getSessionState(sessionId);
        if (state.status !== 'ready') {
            return res.status(400).json({ error: `Session is not ready (status: ${state.status})` });
        }
        const data = await sessionManager.exportAllGroups(sessionId);
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/wa-groups/export-all-csv/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;
        const state = sessionManager.getSessionState(sessionId);
        if (state.status !== 'ready') {
            return res.status(400).json({ error: `Session is not ready (status: ${state.status})` });
        }
        const groups = await sessionManager.exportAllGroups(sessionId);

        let csv = 'group_name,group_id,member_count,admin_count,invite_link,creator,created_at,member_phone,member_name,db_name,is_admin\n';
        const esc = (v) => `"${String(v || '').replace(/"/g, '""')}"`;
        for (const g of groups) {
            if (g.error) {
                csv += `${esc(g.name)},${esc(g.id)},,,,,,,\n`;
                continue;
            }
            if (g.participants && g.participants.length > 0) {
                for (const p of g.participants) {
                    const dbContact = contactsDb.getByPhone(p.phone);
                    const dbName = dbContact ? (dbContact.name || '') : '';
                    csv += `${esc(g.name)},${esc(g.id)},${g.participantCount},${g.adminCount},${esc(g.inviteLink)},${esc(g.creator)},${esc(g.createdAt)},${esc(p.phone)},${esc(p.name)},${esc(dbName)},${p.isAdmin ? 'Yes' : 'No'}\n`;
                }
            } else {
                csv += `${esc(g.name)},${esc(g.id)},${g.participantCount},${g.adminCount},${esc(g.inviteLink)},${esc(g.creator)},${esc(g.createdAt)},,,,,\n`;
            }
        }

        res.header('Content-Type', 'text/csv');
        res.attachment(`whatsapp-groups-export-${Date.now()}.csv`);
        res.send(csv);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── Group Export Summary (no member details) ───

// ─── Sort groups by member count ───
app.get('/api/wa-groups/sorted/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;
        const { order } = req.query; // 'asc' or 'desc'
        const groups = await sessionManager.getWhatsAppGroups(sessionId);
        groups.sort((a, b) => order === 'asc' ? a.participantCount - b.participantCount : b.participantCount - a.participantCount);
        res.json(groups);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── Auto-categorize groups by member count ───
app.post('/api/wa-groups/auto-categorize/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;
        const { ranges } = req.body; // e.g. [{ label: 'Small', min: 0, max: 50 }, ...]
        const defaultRanges = [
            { label: 'صغير (1-50)', min: 0, max: 50 },
            { label: 'متوسط (51-200)', min: 51, max: 200 },
            { label: 'كبير (201-500)', min: 201, max: 500 },
            { label: 'كبير جداً (500+)', min: 501, max: Infinity },
        ];
        const cats = ranges || defaultRanges;
        const groups = await sessionManager.getWhatsAppGroups(sessionId);
        const results = [];
        for (const cat of cats) {
            const matching = groups.filter(g => g.participantCount >= cat.min && g.participantCount <= cat.max);
            if (!matching.length) continue;
            let categoryId = null;
            const existing = waGroupCategoriesDb.getAll().find(c => c.name === cat.label);
            if (existing) {
                categoryId = existing.id;
            } else {
                const r = waGroupCategoriesDb.create(cat.label, `Auto-categorized: ${cat.min}-${cat.max === Infinity ? '+' : cat.max} members`);
                categoryId = r.lastInsertRowid || r;
            }
            for (const g of matching) {
                try {
                    waGroupCategoriesDb.addGroup(categoryId, sessionId, g.id, g.name);
                } catch (_) {}
            }
            results.push({ category: cat.label, groupCount: matching.length });
        }
        res.json({ success: true, results });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/wa-groups/export-all-summary-csv/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;
        const state = sessionManager.getSessionState(sessionId);
        if (state.status !== 'ready') {
            return res.status(400).json({ error: `Session is not ready (status: ${state.status})` });
        }
        const groups = await sessionManager.exportAllGroupsSummary(sessionId);

        let csv = 'group_name,member_count,admin_count,invite_link\n';
        const esc = (v) => `"${String(v || '').replace(/"/g, '""')}"`;
        for (const g of groups) {
            csv += `${esc(g.name)},${g.participantCount || 0},${g.adminCount || 0},${esc(g.inviteLink || '')}\n`;
        }

        res.header('Content-Type', 'text/csv');
        res.attachment(`whatsapp-groups-summary-${Date.now()}.csv`);
        res.send(csv);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/wa-groups/export-selected-csv/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;
        const { groupIds } = req.body;
        if (!groupIds || !Array.isArray(groupIds) || !groupIds.length) {
            return res.status(400).json({ error: 'groupIds array is required' });
        }
        const state = sessionManager.getSessionState(sessionId);
        if (state.status !== 'ready') {
            return res.status(400).json({ error: `Session is not ready (status: ${state.status})` });
        }
        const allGroups = await sessionManager.exportAllGroupsSummary(sessionId);
        const selected = allGroups.filter(g => groupIds.includes(g.id));

        let csv = 'group_name,member_count,admin_count,invite_link\n';
        const esc = (v) => `"${String(v || '').replace(/"/g, '""')}"`;
        for (const g of selected) {
            csv += `${esc(g.name)},${g.participantCount || 0},${g.adminCount || 0},${esc(g.inviteLink || '')}\n`;
        }

        res.header('Content-Type', 'text/csv');
        res.attachment(`selected-groups-export-${Date.now()}.csv`);
        res.send(csv);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/wa-groups/:groupId/participants/:sessionId', async (req, res) => {
    try {
        const { groupId, sessionId } = req.params;
        const participants = await sessionManager.getGroupParticipants(sessionId, groupId);
        const enriched = participants.map(p => {
            const dbContact = contactsDb.getByPhone(p.phone);
            const waContact = waContactsDb.getByPhone(p.phone);
            return {
                ...p,
                dbName: dbContact ? (dbContact.name || '') : '',
                dbCompany: dbContact ? (dbContact.company || '') : '',
                groupName: dbContact ? dbContact.group_name : '',
                waName: waContact ? (waContact.name || '') : '',
            };
        });
        res.json(enriched);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/contacts/:id', (req, res) => {
    contactsDb.delete(parseInt(req.params.id));
    res.json({ success: true });
});

app.delete('/api/contacts/group/:name', (req, res) => {
    contactsDb.deleteGroup(req.params.name);
    res.json({ success: true });
});

app.post('/api/contacts/bulk-delete', (req, res) => {
    try {
        const { contactIds } = req.body;
        if (!contactIds || !Array.isArray(contactIds) || !contactIds.length) {
            return res.status(400).json({ error: 'No contact IDs provided' });
        }
        for (const id of contactIds) {
            contactsDb.delete(parseInt(id));
        }
        res.json({ success: true, deleted: contactIds.length });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/contacts/move-to-group', (req, res) => {
    try {
        const { contactIds, group, copy } = req.body;
        if (!contactIds || !contactIds.length) return res.status(400).json({ error: 'No contacts selected' });
        if (!group) return res.status(400).json({ error: 'Group name is required' });

        // Ensure group exists
        if (!groupsDb.getByName(group)) {
            groupsDb.create(group, '');
        }

        for (const id of contactIds) {
            const contact = contactsDb.getById(id);
            if (!contact) continue;

            if (copy) {
                // Copy: create a new contact in the target group
                const customFields = typeof contact.custom_fields === 'string'
                    ? JSON.parse(contact.custom_fields || '{}')
                    : (contact.custom_fields || {});
                contactsDb.create(contact.phone, contact.name, contact.company, customFields, group);
            } else {
                // Move: update group_name
                contactsDb.updateGroup(id, group);
            }
        }

        res.json({ success: true, count: contactIds.length });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ═══════════════════════════════════════
// API ROUTES — Messaging
// ═══════════════════════════════════════

app.post('/api/messages/send-bulk', async (req, res) => {
    try {
        const { sessionId, contactIds, group, template, minDelay, maxDelay, mediaPath, mediaPaths, buttons } = req.body;
        if (!sessionId || !template) {
            return res.status(400).json({ error: 'sessionId and template are required' });
        }

        let contacts;
        if (contactIds && contactIds.length) {
            contacts = contactIds.map(id => contactsDb.getById(id)).filter(Boolean);
        } else if (group) {
            contacts = contactsDb.getAll(group);
        } else {
            return res.status(400).json({ error: 'Provide contactIds or group' });
        }

        if (!contacts.length) return res.status(400).json({ error: 'No contacts found' });

        // Start bulk send in background
        res.json({ status: 'started', total: contacts.length });
        bulkSender.sendBulk(sessionId, contacts, template, {
            minDelay, maxDelay, groupName: group || '', mediaPath, mediaPaths: mediaPaths || null, buttons: buttons || null, name: req.body.name || null,
        }).catch(err => {
            console.error('[Server] Campaign failed:', err.message);
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/messages/preview', (req, res) => {
    const { template, contact } = req.body;
    const rendered = bulkSender.renderTemplate(template || '', contact || {});
    res.json({ rendered });
});

app.get('/api/messages', (req, res) => {
    const { phone, limit } = req.query;
    if (phone) return res.json(messagesDb.getByContact(phone, parseInt(limit) || 50));
    res.json(messagesDb.getRecent(parseInt(limit) || 100));
});

// ═══════════════════════════════════════
// API ROUTES — Campaigns
// ═══════════════════════════════════════

app.get('/api/campaigns', (req, res) => {
    const campaigns = campaignsDb.getAll();
    const sessions = sessionsDb.getAll();

    // Enrich campaigns with session information
    const enrichedCampaigns = campaigns.map(c => {
        const session = sessions.find(s => s.id === c.session_id);
        return {
            ...c,
            session_name: session ? session.name : 'Unknown',
            session_phone: session ? session.phone : '—'
        };
    });

    res.json(enrichedCampaigns);
});

app.get('/api/campaigns/:id', (req, res) => {
    const id = parseInt(req.params.id);
    const campaign = campaignsDb.getById(id);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    const messages = campaignsDb.getMessages(id);
    const errorBreakdown = campaignsDb.getErrorBreakdown(id);

    // Get session information
    const sessions = sessionsDb.getAll();
    const session = sessions.find(s => s.id === campaign.session_id);

    // Calculate duration
    let durationMs = null;
    if (campaign.started_at && campaign.completed_at) {
        durationMs = new Date(campaign.completed_at) - new Date(campaign.started_at);
    }

    res.json({
        ...campaign,
        messages,
        errorBreakdown,
        durationMs,
        session_name: session ? session.name : 'Unknown',
        session_phone: session ? session.phone : '—'
    });
});

app.delete('/api/campaigns/:id', (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const campaign = campaignsDb.getById(id);
        if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
        campaignsDb.deleteWithMessages(id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/campaigns/:id/retry', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const campaign = campaignsDb.getById(id);
        if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
        if (campaign.status === 'running') return res.status(400).json({ error: 'Campaign is already running' });

        const { sessionId } = req.body;
        if (!sessionId) return res.status(400).json({ error: 'sessionId is required' });

        // Get failed messages from this campaign
        const failedMessages = campaignsDb.getFailedMessages(id);
        if (!failedMessages.length) return res.status(400).json({ error: 'No failed messages to retry' });

        // Build contact objects from failed messages
        const contacts = failedMessages.map(m => {
            // Try to find the contact in DB for full data, or use basic info
            const dbContact = contactsDb.getByPhone(m.contact_phone);
            return dbContact || { phone: m.contact_phone, name: m.contact_name || '', company: '', custom_fields: '{}' };
        });

        // Remove old failed records so retry doesn't create duplicates
        campaignsDb.removeFailedMessages(id);
        // Adjust campaign counters: reset failed count and total to reflect retry
        campaignsDb.update(id, {
            failed: 0,
            total: campaign.sent + contacts.length,
        });

        // Parse buttons config from original campaign
        let retryButtons = null;
        if (campaign.buttons_config) {
            try { retryButtons = JSON.parse(campaign.buttons_config); } catch (e) { }
        }

        res.json({ status: 'started', total: contacts.length });
        // Parse media paths from original campaign
        let retryMediaPaths = null;
        if (campaign.media_paths) {
            try { retryMediaPaths = JSON.parse(campaign.media_paths); } catch (e) { }
        }

        bulkSender.sendBulk(sessionId, contacts, campaign.template, {
            groupName: campaign.group_name || '',
            campaignId: id,
            buttons: retryButtons,
            mediaPath: campaign.media_path || null,
            mediaPaths: retryMediaPaths,
            minDelay: campaign.min_delay || 8000,
            maxDelay: campaign.max_delay || 18000,
        }).catch(err => {
            console.error('[Server] Retry campaign failed:', err.message);
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/campaigns/:id/restart', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const campaign = campaignsDb.getById(id);
        if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
        if (campaign.status === 'running') return res.status(400).json({ error: 'Campaign is already running' });

        const { sessionId } = req.body;
        if (!sessionId) return res.status(400).json({ error: 'sessionId is required' });

        // Get all contacts from the original group
        const contacts = campaign.group_name ? contactsDb.getAll(campaign.group_name) : [];
        if (!contacts.length) return res.status(400).json({ error: 'No contacts found in group' });

        // Parse buttons config from original campaign
        let buttons = null;
        if (campaign.buttons_config) {
            try { buttons = JSON.parse(campaign.buttons_config); } catch (e) { }
        }

        res.json({ status: 'started', total: contacts.length });
        // Parse media paths from original campaign
        let restartMediaPaths = null;
        if (campaign.media_paths) {
            try { restartMediaPaths = JSON.parse(campaign.media_paths); } catch (e) { }
        }

        bulkSender.sendBulk(sessionId, contacts, campaign.template, {
            groupName: campaign.group_name || '',
            buttons,
            mediaPath: campaign.media_path || null,
            mediaPaths: restartMediaPaths,
            minDelay: campaign.min_delay || 8000,
            maxDelay: campaign.max_delay || 18000,
        }).catch(err => {
            console.error('[Server] Restart campaign failed:', err.message);
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ═══════════════════════════════════════
// API ROUTES — Media Upload
// ═══════════════════════════════════════

const MEDIA_DIR = process.env.APP_USER_DATA_PATH
    ? path.join(process.env.APP_USER_DATA_PATH, 'uploads', 'media')
    : path.join(__dirname, 'uploads', 'media');
if (!fs.existsSync(MEDIA_DIR)) fs.mkdirSync(MEDIA_DIR, { recursive: true });

// Serve uploaded files directly over HTTP so frontend can preview/display them
app.use('/api/media/file', express.static(MEDIA_DIR));
app.use('/api/uploads', express.static(UPLOAD_DIR));

app.post('/api/media/upload', upload.array('media', 10), (req, res) => {
    try {
        if (!req.files || !req.files.length) return res.status(400).json({ error: 'No files uploaded' });

        const files = req.files.map(file => {
            const ext = path.extname(file.originalname) || '';
            const filename = `${file.filename}${ext}`;
            const dest = path.join(MEDIA_DIR, filename);
            fs.copyFileSync(file.path, dest);
            fs.unlinkSync(file.path);
            return {
                path: `/api/media/file/${filename}`,
                diskPath: dest,
                filename: file.originalname,
                mimetype: file.mimetype,
                size: file.size,
            };
        });

        res.json({ success: true, files });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ═══════════════════════════════════════
// API ROUTES — AI Image Generation
// ═══════════════════════════════════════

app.post('/api/media/generate-image', async (req, res) => {
    try {
        const imageGenerator = require('./src/ai/imageGenerator');
        if (!imageGenerator.isImageGenAvailable()) {
            return res.status(400).json({ error: 'Gemini API key not configured — add it in Settings to generate images' });
        }
        const { message } = req.body;
        if (!message || !message.trim()) {
            return res.status(400).json({ error: 'Message text is required to generate an image' });
        }
        const image = await imageGenerator.generateCampaignImage(message.trim());
        res.json({ success: true, image: image.data, mimetype: image.mimeType });
    } catch (err) {
        console.error('[ImageGen] Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ═══════════════════════════════════════
// API ROUTES — Company Logo (used in AI-generated images)
// ═══════════════════════════════════════

const LOGO_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp'];

app.post('/api/settings/logo', upload.single('logo'), (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No logo file uploaded' });

        const ext = path.extname(req.file.originalname).toLowerCase();
        if (!LOGO_EXTENSIONS.includes(ext)) {
            fs.unlinkSync(req.file.path);
            return res.status(400).json({ error: 'Logo must be a PNG, JPG, or WEBP image' });
        }
        if (req.file.size > 5 * 1024 * 1024) {
            fs.unlinkSync(req.file.path);
            return res.status(400).json({ error: 'Logo must be under 5 MB' });
        }

        // Remove any previous logo file
        const oldPath = settingsDb.get('company_logo_path');
        if (oldPath && fs.existsSync(oldPath)) {
            try { fs.unlinkSync(oldPath); } catch (e) { }
        }

        const dest = path.join(UPLOAD_DIR, `company-logo${ext}`);
        fs.copyFileSync(req.file.path, dest);
        fs.unlinkSync(req.file.path);
        settingsDb.set('company_logo_path', dest);

        res.json({ success: true, has_logo: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/settings/logo', (req, res) => {
    const logoPath = settingsDb.get('company_logo_path');
    if (!logoPath || !fs.existsSync(logoPath)) {
        return res.status(404).json({ error: 'No company logo uploaded' });
    }
    res.sendFile(logoPath);
});

app.delete('/api/settings/logo', (req, res) => {
    try {
        const logoPath = settingsDb.get('company_logo_path');
        if (logoPath && fs.existsSync(logoPath)) {
            try { fs.unlinkSync(logoPath); } catch (e) { }
        }
        settingsDb.set('company_logo_path', '');
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ═══════════════════════════════════════
// API ROUTES — Quick Replies
// ═══════════════════════════════════════

app.get('/api/quick-replies', (req, res) => {
    res.json(quickRepliesDb.getAll());
});

app.post('/api/quick-replies', (req, res) => {
    try {
        const { triggerKey, label, response, mediaPath } = req.body;
        if (!triggerKey || !label || !response) {
            return res.status(400).json({ error: 'triggerKey, label, and response are required' });
        }
        quickRepliesDb.create(triggerKey.toLowerCase().trim(), label.trim(), response, mediaPath || null);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/quick-replies/:id', (req, res) => {
    try {
        const { triggerKey, label, response, mediaPath } = req.body;
        quickRepliesDb.update(parseInt(req.params.id), triggerKey, label, response, mediaPath || null);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/quick-replies/:id/toggle', (req, res) => {
    const { enabled } = req.body;
    quickRepliesDb.toggleEnabled(parseInt(req.params.id), enabled);
    res.json({ success: true });
});

app.delete('/api/quick-replies/:id', (req, res) => {
    quickRepliesDb.delete(parseInt(req.params.id));
    res.json({ success: true });
});

// ═══════════════════════════════════════
// API ROUTES — Message Templates
// ═══════════════════════════════════════

app.get('/api/templates', (req, res) => {
    res.json(templatesDb.getAll());
});

app.post('/api/templates', (req, res) => {
    try {
        const { name, content, mediaPaths, buttons } = req.body;
        if (!name || !content) return res.status(400).json({ error: 'name and content are required' });
        const id = templatesDb.create(name.trim(), content, mediaPaths || null, buttons || null);
        res.json({ success: true, id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/templates/:id', (req, res) => {
    try {
        const { name, content, mediaPaths, buttons } = req.body;
        templatesDb.update(parseInt(req.params.id), name, content, mediaPaths || null, buttons || null);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/templates/:id', (req, res) => {
    templatesDb.delete(parseInt(req.params.id));
    res.json({ success: true });
});

// ═══════════════════════════════════════
// API ROUTES — Analytics/Dashboard
// ═══════════════════════════════════════

app.get('/api/analytics', async (req, res) => {
    try {
        const range = req.query.range || '30days';
        const now = new Date();

        // Get all data
        const allCampaigns = campaignsDb.getAll() || [];
        const allSessions = sessionsDb.getAll() || [];

        console.log('[Analytics] Total campaigns:', allCampaigns.length);
        console.log('[Analytics] Total sessions:', allSessions.length);

        // Filter campaigns by date range
        const filteredCampaigns = allCampaigns.filter(c => {
            if (!c.started_at) return false;
            if (range === 'all') return true;

            const campaignDate = new Date(c.started_at);
            if (range === 'today') {
                return campaignDate.toDateString() === now.toDateString();
            }
            if (range === 'yesterday') {
                const yesterday = new Date(now);
                yesterday.setDate(yesterday.getDate() - 1);
                return campaignDate.toDateString() === yesterday.toDateString();
            }
            if (range === '7days') {
                const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
                return campaignDate >= weekAgo;
            }
            if (range === '30days') {
                const monthAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
                return campaignDate >= monthAgo;
            }
            return true;
        });

        console.log('[Analytics] Filtered campaigns:', filteredCampaigns.length);

        // Calculate stats
        const totalSent = filteredCampaigns.reduce((sum, c) => sum + (c.sent || 0), 0);
        const totalFailed = filteredCampaigns.reduce((sum, c) => sum + (c.failed || 0), 0);
        const totalMessages = totalSent + totalFailed;
        const deliveryRate = totalMessages > 0 ? Math.round((totalSent / totalMessages) * 100) : 0;

        // Fix #14: Count unique contacts reached via SQL instead of loading contacts into memory
        let uniquePeopleReached = 0;
        if (filteredCampaigns.length > 0) {
            try {
                const ids = filteredCampaigns.map(c => c.id);
                const placeholders = ids.map(() => '?').join(',');
                const row = db.prepare(`SELECT COUNT(DISTINCT contact_phone) as cnt FROM campaign_messages WHERE campaign_id IN (${placeholders}) AND status = 'sent'`).get(...ids);
                uniquePeopleReached = row ? row.cnt : 0;
            } catch (err) {
                console.error('[Analytics] Error counting unique contacts:', err.message);
            }
        }

        // Count media files sent
        const mediaSent = filteredCampaigns.reduce((sum, c) => {
            const sentCount = c.sent || 0;
            if (!sentCount) return sum;

            if (c.media_paths) {
                try {
                    const paths = JSON.parse(c.media_paths);
                    return sum + (paths.length * sentCount);
                } catch (e) {
                    console.error('[Analytics] Error parsing media_paths:', e);
                }
            } else if (c.media_path) {
                return sum + sentCount;
            }
            return sum;
        }, 0);

        // Messages over time
        const messagesOverTime = generateMessagesOverTime(filteredCampaigns, range);

        // Hourly pattern
        const hourlyPattern = generateHourlyPattern(filteredCampaigns);

        // Top campaigns
        const topCampaigns = filteredCampaigns
            .filter(c => c.sent > 0)
            .sort((a, b) => (b.sent || 0) - (a.sent || 0))
            .slice(0, 5)
            .map(c => ({
                id: c.id,
                name: c.name || `Campaign #${c.id}`,
                date: c.started_at,
                group: c.group_name || 'No group',
                sent: c.sent || 0,
                failed: c.failed || 0
            }));

        // Sessions summary
        const sessions = allSessions.map(s => ({
            name: s.name,
            status: s.status || 'unknown',
            phone: s.phone
        }));

        // Group activity stats
        let groupActivity = { total: 0, actions: {}, addMember: 0, removeMember: 0, createGroup: 0, renameGroup: 0, leaveGroup: 0, promoteMember: 0, demoteMember: 0, approveRequest: 0, rejectRequest: 0 };
        try { groupActivity = groupActivityLogDb.stats(sinceIso); } catch (e) { }

        // Build sinceIso for auto_reply_logs filtering
        let sinceIso = null;
        if (range === 'today') {
            const d = new Date(now);
            d.setHours(0, 0, 0, 0);
            sinceIso = d.toISOString();
        } else if (range === 'yesterday') {
            const d = new Date(now);
            d.setDate(d.getDate() - 1);
            d.setHours(0, 0, 0, 0);
            sinceIso = d.toISOString();
        } else if (range === '7days') {
            sinceIso = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
        } else if (range === '30days') {
            sinceIso = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
        }
        // 'all' => sinceIso stays null (no date filter)

        // AI & Quick Reply Analytics from real tracking data
        const autoStats = autoReplyLogs.getStats(sinceIso);
        const aiAnalytics = autoStats.ai;
        const quickReplyAnalytics = autoStats.quickReply;

        // Group stats
        let groupStats = { totalCategories: 0, totalGroupsInCategories: 0, totalGroups: 0, totalMembers: 0, sessions: [] };
        try {
            const categories = waGroupCategoriesDb.getAll();
            groupStats.totalCategories = categories.length;
            groupStats.totalGroupsInCategories = categories.reduce((sum, c) => sum + (c.group_count || 0), 0);

            // Get WhatsApp group counts from ready sessions (non-blocking, best-effort)
            const readySessions = allSessions.filter(s => s.status === 'ready');
            const sessionGroupData = await Promise.allSettled(readySessions.map(async (s) => {
                try {
                    const groups = await sessionManager.getWaGroups(s.id);
                    const list = Array.isArray(groups) ? groups : (groups.value || []);
                    return {
                        sessionId: s.id,
                        sessionName: s.name,
                        groupCount: list.length,
                        memberCount: list.reduce((sum, g) => sum + (g.participantCount || g.size || 0), 0),
                    };
                } catch { return null; }
            }));
            const sessionData = sessionGroupData.filter(r => r.status === 'fulfilled' && r.value).map(r => r.value);
            groupStats.totalGroups = sessionData.reduce((sum, s) => sum + s.groupCount, 0);
            groupStats.totalMembers = sessionData.reduce((sum, s) => sum + s.memberCount, 0);
            groupStats.sessions = sessionData;
        } catch (e) { }

        const response = {
            stats: {
                totalMessages,
                peopleReached: uniquePeopleReached,
                mediaSent,
                deliveryRate,
                messagesChange: 0,
                peopleChange: 0,
                mediaChange: 0,
                deliveryChange: 0
            },
            messagesOverTime,
            hourlyPattern,
            topCampaigns,
            sessions,
            aiAnalytics,
            quickReplyAnalytics,
            groupStats,
            groupActivity
        };

        console.log('[Analytics] Response stats:', response.stats);
        console.log('[Analytics] Top campaigns count:', topCampaigns.length);
        console.log('[Analytics] Sessions count:', sessions.length);

        res.json(response);

    } catch (err) {
        console.error('[Analytics] Error:', err);
        res.status(500).json({
            error: err.message,
            stats: {
                totalMessages: 0,
                peopleReached: 0,
                mediaSent: 0,
                deliveryRate: 0,
                messagesChange: 0,
                peopleChange: 0,
                mediaChange: 0,
                deliveryChange: 0
            },
            messagesOverTime: { labels: [], sent: [], failed: [] },
            hourlyPattern: { labels: [], counts: [] },
            topCampaigns: [],
            sessions: []
        });
    }
});

function generateMessagesOverTime(campaigns, range) {
    const labels = [];
    const sent = [];
    const failed = [];
    const now = new Date();

    if (range === 'today') {
        // Hourly for today (24 hours)
        for (let i = 0; i < 24; i++) {
            const hour = i.toString().padStart(2, '0');
            labels.push(`${hour}:00`);
            sent.push(0);
            failed.push(0);
        }

        campaigns.forEach(c => {
            if (c.started_at) {
                const campaignDate = new Date(c.started_at);
                const isToday = campaignDate.toDateString() === now.toDateString();
                if (isToday) {
                    const hour = campaignDate.getHours();
                    sent[hour] += c.sent || 0;
                    failed[hour] += c.failed || 0;
                }
            }
        });
    } else if (range === 'yesterday') {
        // Hourly for yesterday (24 hours)
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);

        for (let i = 0; i < 24; i++) {
            const hour = i.toString().padStart(2, '0');
            labels.push(`${hour}:00`);
            sent.push(0);
            failed.push(0);
        }

        campaigns.forEach(c => {
            if (c.started_at) {
                const campaignDate = new Date(c.started_at);
                const isYesterday = campaignDate.toDateString() === yesterday.toDateString();
                if (isYesterday) {
                    const hour = campaignDate.getHours();
                    sent[hour] += c.sent || 0;
                    failed[hour] += c.failed || 0;
                }
            }
        });
    } else if (range === '7days') {
        // Daily for last 7 days
        for (let i = 6; i >= 0; i--) {
            const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
            const dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getDay()];
            const label = `${dayName} ${date.getMonth() + 1}/${date.getDate()}`;
            labels.push(label);
            sent.push(0);
            failed.push(0);
        }

        campaigns.forEach(c => {
            if (c.started_at) {
                const campaignDate = new Date(c.started_at);
                const daysDiff = Math.floor((now.getTime() - campaignDate.getTime()) / (1000 * 60 * 60 * 24));
                if (daysDiff >= 0 && daysDiff < 7) {
                    const index = 6 - daysDiff;
                    sent[index] += c.sent || 0;
                    failed[index] += c.failed || 0;
                }
            }
        });
    } else if (range === '30days') {
        // Daily for last 30 days (show every 3rd day to avoid clutter)
        for (let i = 29; i >= 0; i--) {
            const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
            const label = `${date.getMonth() + 1}/${date.getDate()}`;
            labels.push(label);
            sent.push(0);
            failed.push(0);
        }

        campaigns.forEach(c => {
            if (c.started_at) {
                const campaignDate = new Date(c.started_at);
                const daysDiff = Math.floor((now.getTime() - campaignDate.getTime()) / (1000 * 60 * 60 * 24));
                if (daysDiff >= 0 && daysDiff < 30) {
                    const index = 29 - daysDiff;
                    sent[index] += c.sent || 0;
                    failed[index] += c.failed || 0;
                }
            }
        });
    } else {
        // All time: Group by week for last 12 weeks
        const weeks = 12;
        for (let i = weeks - 1; i >= 0; i--) {
            const weekStart = new Date(now.getTime() - i * 7 * 24 * 60 * 60 * 1000);
            const label = `Week ${weekStart.getMonth() + 1}/${weekStart.getDate()}`;
            labels.push(label);
            sent.push(0);
            failed.push(0);
        }

        campaigns.forEach(c => {
            if (c.started_at) {
                const campaignDate = new Date(c.started_at);
                const weeksDiff = Math.floor((now.getTime() - campaignDate.getTime()) / (1000 * 60 * 60 * 24 * 7));
                if (weeksDiff >= 0 && weeksDiff < weeks) {
                    const index = weeks - 1 - weeksDiff;
                    sent[index] += c.sent || 0;
                    failed[index] += c.failed || 0;
                }
            }
        });
    }

    return { labels, sent, failed };
}

function generateHourlyPattern(campaigns) {
    const labels = [];
    const counts = Array(24).fill(0);

    for (let i = 0; i < 24; i++) {
        labels.push(i + 'h');
    }

    campaigns.forEach(c => {
        if (c.started_at) {
            const hour = new Date(c.started_at).getHours();
            counts[hour] += (c.sent || 0) + (c.failed || 0);
        }
    });

    return { labels, counts };
}

// ═══════════════════════════════════════
// API ROUTES — Settings
// ═══════════════════════════════════════

app.get('/api/settings', (req, res) => {
    const all = settingsDb.getAll();

    const defaultPrompt = `You are an intelligent, professional, and friendly customer support AI assistant for AJM. Your primary goal is to assist customers by providing accurate information about our services and answering questions based on the information below.

Business Information
Business Name: AJM
What We Do: AJM is a digital agency that connects people with technology through comprehensive services including:
- Web & App Development
- Digital Marketing
- Cloud Solutions
- AI & Automation

Contact Information:
- Email: hello@ajm.tech
- Website: https://web-ajm.vercel.app
- Business Hours: Monday to Friday, 9 AM - 6 PM IST

Core Guidelines
1. Tone & Approach: Maintain a polite, empathetic, and professional tone at all times. Be conversational yet professional. Show enthusiasm about helping customers understand our services.
2. Information Delivery: Provide clear, concise, and accurate information. Structure responses logically with relevant details. Use bullet points or short paragraphs for readability. Avoid technical jargon unless specifically requested.
3. Honesty & Transparency: Only provide information you are certain about based on this knowledge base. If information is not available in your knowledge base, clearly state: "I don't have specific details about that at the moment. For the most accurate information, please visit our website at web-ajm.vercel.app or email us at hello@ajm.tech". NEVER make up pricing, timelines, or specific service details. NEVER offer to connect customers to a human representative - instead, provide contact information.
4. Self-Service Focus: Guide customers to relevant resources (website, email). Provide clear next steps they can take independently. Empower customers with information to make informed decisions.

Response Templates
Greetings: "Hello! Welcome to AJM. How can I help you today?"

Service Inquiries: When asked about services, briefly explain the service category, mention 2-3 key capabilities, and direct them to the website or email for detailed discussions. Example: "We offer comprehensive web and app development services, including custom websites, mobile applications, and progressive web apps. For a detailed discussion about your specific project needs, please visit web-ajm.vercel.app or email us at hello@ajm.tech"

Pricing Questions: "Our pricing is customized based on project scope, requirements, and timeline. Each project is unique, and we believe in providing tailored solutions. To get an accurate quote for your specific needs, please visit our website at web-ajm.vercel.app to learn more about our services, or email us at hello@ajm.tech with your project details. We'll get back to you with a personalized proposal."

Technical Questions: If you have information, provide a clear, concise answer focusing on benefits and capabilities. If you don't: "That's a great technical question! For detailed technical specifications and implementation discussions, I'd recommend reaching out to our team directly at hello@ajm.tech. They can provide in-depth information tailored to your specific requirements."

Timeline Questions: "Project timelines vary based on scope and complexity. Typical projects range from a few weeks to several months. For an accurate timeline estimate for your project, please email us at hello@ajm.tech with your requirements, and our team will provide a detailed project plan."

Support/Issues: "I understand you're experiencing an issue. To ensure you get the best support possible: Email us at hello@ajm.tech with details about the issue. Include any relevant screenshots or error messages. Our team monitors this email during business hours (Monday-Friday, 9 AM - 6 PM IST) and will respond promptly."

Contact Information Requests: "You can reach AJM through: Email: hello@ajm.tech, Website: https://web-ajm.vercel.app, Business Hours: Monday to Friday, 9 AM - 6 PM IST. Feel free to send us a message anytime, and we'll respond during business hours!"

What NOT to Do
- Do NOT offer to connect customers to a human representative
- Do NOT promise specific deliverables, timelines, or pricing without qualification
- Do NOT provide information about services not explicitly mentioned in this knowledge base
- Do NOT apologize excessively - be confident and solution-focused
- Do NOT use phrases like "I'm just an AI" or "I'm limited" - instead provide the information you have and direct them appropriately
- Do NOT create false urgency or use pushy sales tactics

Service Knowledge Base
- Web & App Development: Custom websites, mobile applications, progressive web apps, e-commerce platforms, and responsive design solutions.
- Digital Marketing: Strategic digital marketing services to enhance online presence and reach target audiences effectively.
- Cloud Solutions: Cloud infrastructure, deployment, and management services to ensure scalability and reliability.
- AI & Automation: Intelligent automation solutions and AI integration to streamline business processes and enhance efficiency.

Example Interactions
Customer: "How much does a website cost?"
Bot: "Website costs vary based on complexity, features, and specific requirements. We create custom solutions tailored to each client's needs. For an accurate quote, please visit web-ajm.vercel.app or email us at hello@ajm.tech with details about your project, and we'll provide a personalized proposal."

Customer: "Can you build a mobile app?"
Bot: "Yes! We specialize in web and app development, including mobile applications. We can build native iOS and Android apps, as well as cross-platform solutions. To discuss your mobile app project in detail, please email us at hello@ajm.tech with your requirements, and our team will guide you through the process."

Customer: "I need help with my website, it's not loading"
Bot: "I understand you're having trouble accessing your website. To get this resolved quickly, please email hello@ajm.tech with: Your website URL, Description of the issue, Any error messages you're seeing, When the issue started. Our team will investigate and assist you promptly during business hours (Monday-Friday, 9 AM - 6 PM IST)."

Customer: "Do you offer SEO services?"
Bot: "Yes! SEO is part of our Digital Marketing services. We help businesses improve their online visibility and reach their target audience more effectively. For specific SEO strategies and a customized plan for your business, please visit web-ajm.vercel.app or email hello@ajm.tech to discuss your goals with our team."

Remember: Your role is to be an informative guide, not a gatekeeper. Provide helpful information, set clear expectations, and empower customers to take the next step through the appropriate channels (website or email). Be confident, helpful, and always represent AJM professionally.

CRITICAL INSTRUCTIONS FOR AI:
- Respond to the user naturally and directly.
- Keep your response concise and relevant.
- Do NOT fall into a repetition loop.
- Do NOT overuse emojis.
- Vary your sentence structure dynamically based on the context.`;

    // Only use DB prompt if it's substantive, otherwise use default
    const currentPrompt = (all.system_prompt && all.system_prompt.length > 20)
        ? all.system_prompt
        : defaultPrompt;

    res.json({
        theme: all.theme || 'dark',
        ai_provider: all.ai_provider || process.env.AI_PROVIDER || 'gemini',
        ai_model: all.ai_model || 'gemini-3.1-pro-preview',
        ai_chat_history: all.ai_chat_history !== undefined ? all.ai_chat_history === '1' || all.ai_chat_history === 'true' : false,
        ai_chat_history_limit: all.ai_chat_history_limit || 20,
        ai_use_system_prompt: all.ai_use_system_prompt !== undefined ? all.ai_use_system_prompt === '1' || all.ai_use_system_prompt === 'true' : true,
        system_prompt: currentPrompt,
        min_delay: all.min_delay || process.env.MIN_DELAY_MS || '8000',
        max_delay: all.max_delay || process.env.MAX_DELAY_MS || '18000',
        gemini_api_key: all.gemini_api_key || '',
        openai_api_key: all.openai_api_key || '',
        anti_ban_enabled: all.anti_ban_enabled !== undefined ? all.anti_ban_enabled === '1' || all.anti_ban_enabled === 'true' : true,
        anti_ban_ignore_bots: all.anti_ban_ignore_bots !== undefined ? all.anti_ban_ignore_bots === '1' || all.anti_ban_ignore_bots === 'true' : true,
        anti_ban_cooldown_sec: all.anti_ban_cooldown_sec || '30',
        anti_ban_typing_delay_min: all.anti_ban_typing_delay_min || '3',
        anti_ban_typing_delay_max: all.anti_ban_typing_delay_max || '6',
        bulk_daily_limit: all.bulk_daily_limit || '0',
        bulk_batch_size: all.bulk_batch_size || '25',
        bulk_batch_pause_min: all.bulk_batch_pause_min || '60',
        bulk_batch_pause_max: all.bulk_batch_pause_max || '120',
        has_company_logo: !!(all.company_logo_path && fs.existsSync(all.company_logo_path)),
        image_generation_prompt: all.image_generation_prompt || '',
        admin_phones: all.admin_phones || '',
        app_name: all.app_name || 'AJM.bot',
        company_name: all.company_name || '',
        company_field: all.company_field || '',
        company_description: all.company_description || '',
        company_email: all.company_email || '',
        company_website: all.company_website || '',
        company_hours: all.company_hours || '',
    });
});

app.put('/api/settings', (req, res) => {
    const allowed = ['theme', 'ai_provider', 'ai_model', 'ai_image_model', 'ai_chat_history', 'ai_chat_history_limit', 'ai_use_system_prompt', 'system_prompt', 'image_generation_prompt', 'min_delay', 'max_delay', 'gemini_api_key', 'openai_api_key', 'anti_ban_enabled', 'anti_ban_ignore_bots', 'anti_ban_cooldown_sec', 'anti_ban_typing_delay_min', 'anti_ban_typing_delay_max', 'bulk_daily_limit', 'bulk_batch_size', 'bulk_batch_pause_min', 'bulk_batch_pause_max', 'admin_phones', 'app_name', 'company_name', 'company_field', 'company_description', 'company_email', 'company_website', 'company_hours'];
    for (const key of allowed) {
        if (req.body[key] !== undefined && req.body[key] !== '••••••••') {
            settingsDb.set(key, req.body[key]);
        }
    }
    res.json({ success: true });
});

// ═══════════════════════════════════════
// API ROUTES — Scheduler
// ═══════════════════════════════════════

app.get('/api/schedules', (req, res) => {
    const schedules = scheduler.getAll();
    const sessions = sessionsDb.getAll();
    const enriched = schedules.map(s => {
        const session = sessions.find(sess => sess.id === s.session_id);
        return {
            ...s,
            session_name: session ? session.name : 'Unknown Device',
        };
    });
    res.json(enriched);
});

app.post('/api/schedules', (req, res) => {
    try {
        const { name, sessionId, groupName, template, frequency, dayOfWeek, dayOfMonth, sendTime } = req.body;
        if (!name || !sessionId || !groupName || !template || !frequency) {
            return res.status(400).json({ error: 'name, sessionId, groupName, template, and frequency are required' });
        }
        const id = scheduler.create({ name, sessionId, groupName, template, frequency, dayOfWeek, dayOfMonth, sendTime });
        res.json({ success: true, id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/schedules/:id', (req, res) => {
    try {
        scheduler.update(parseInt(req.params.id), req.body);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/schedules/:id/toggle', (req, res) => {
    const { enabled } = req.body;
    scheduler.toggleEnabled(parseInt(req.params.id), enabled);
    res.json({ success: true });
});

app.delete('/api/schedules/:id', (req, res) => {
    scheduler.remove(parseInt(req.params.id));
    res.json({ success: true });
});

// ═══════════════════════════════════════
// API ROUTES — Blacklist
// ═══════════════════════════════════════

app.get('/api/blacklist', (req, res) => {
    const { search } = req.query;
    if (search) return res.json(blacklistDb.search(search));
    res.json(blacklistDb.getAll());
});

app.post('/api/blacklist', (req, res) => {
    try {
        const { phone, reason } = req.body;
        if (!phone || !phone.trim()) return res.status(400).json({ error: 'Phone number is required' });
        blacklistDb.add(phone.trim().replace(/[^0-9+]/g, ''), reason || '', 'manual');
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/blacklist/:id', (req, res) => {
    try {
        blacklistDb.removeById(parseInt(req.params.id));
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/blacklist/import', (req, res) => {
    try {
        const { phones, reason } = req.body;
        if (!phones || !Array.isArray(phones) || !phones.length) {
            return res.status(400).json({ error: 'Array of phone numbers is required' });
        }
        const cleaned = phones.map(p => String(p).replace(/[^0-9+]/g, '')).filter(Boolean);
        const inserted = blacklistDb.importMany(cleaned, reason || 'bulk import', 'import');
        res.json({ success: true, added: inserted, total: cleaned.length });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/blacklist/export', (req, res) => {
    const rows = blacklistDb.getAll();
    let csv = 'phone,reason,source,created_at\n';
    for (const r of rows) {
        const esc = (v) => `"${String(v || '').replace(/"/g, '""')}"`;
        csv += `${esc(r.phone)},${esc(r.reason)},${esc(r.source)},${esc(r.created_at)}\n`;
    }
    res.header('Content-Type', 'text/csv');
    res.attachment(`blacklist-${Date.now()}.csv`);
    return res.send(csv);
});

// ═══════════════════════════════════════
// API ROUTES — DND (Do Not Disturb)
// ═══════════════════════════════════════

app.get('/api/settings/dnd', (req, res) => {
    const enabled = settingsDb.get('dnd_enabled');
    const startTime = settingsDb.get('dnd_start_time') || '22:00';
    const endTime = settingsDb.get('dnd_end_time') || '08:00';
    res.json({
        enabled: enabled === '1' || enabled === 'true',
        startTime,
        endTime,
    });
});

app.put('/api/settings/dnd', (req, res) => {
    try {
        const { enabled, startTime, endTime } = req.body;
        if (enabled !== undefined) settingsDb.set('dnd_enabled', enabled ? '1' : '0');
        if (startTime) settingsDb.set('dnd_start_time', startTime);
        if (endTime) settingsDb.set('dnd_end_time', endTime);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ═══════════════════════════════════════
// API ROUTES — Webhooks
// ═══════════════════════════════════════

app.get('/api/webhooks', (req, res) => {
    res.json(webhooksDb.getAll());
});

app.post('/api/webhooks', (req, res) => {
    try {
        const { url, name, events, secret } = req.body;
        if (!url || !url.trim()) return res.status(400).json({ error: 'Webhook URL is required' });
        try { new URL(url); } catch (e) { return res.status(400).json({ error: 'Invalid URL format' }); }
        webhooksDb.create(url.trim(), name || '', events || ['message.received'], secret || '');
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/webhooks/:id', (req, res) => {
    try {
        webhooksDb.update(parseInt(req.params.id), req.body);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/webhooks/:id', (req, res) => {
    try {
        webhooksDb.delete(parseInt(req.params.id));
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/webhooks/:id/test', async (req, res) => {
    try {
        const hook = webhooksDb.getById(parseInt(req.params.id));
        if (!hook) return res.status(404).json({ error: 'Webhook not found' });
        const payload = { event: 'test', timestamp: new Date().toISOString(), data: { message: 'This is a test webhook from AJM.bot' } };
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        try {
            const resp = await fetch(hook.url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Webhook-Source': 'ajm-bot' },
                body: JSON.stringify(payload),
                signal: controller.signal,
            });
            clearTimeout(timeout);
            webhooksDb.recordTrigger(hook.id, resp.status);
            res.json({ success: resp.ok, status: resp.status });
        } catch (fetchErr) {
            clearTimeout(timeout);
            webhooksDb.recordTrigger(hook.id, 0);
            res.json({ success: false, status: 0, error: fetchErr.message });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/webhooks/events', (req, res) => {
    res.json([
        { key: 'message.received', label: 'Message Received' },
        { key: 'message.sent', label: 'Message Sent' },
        { key: 'campaign.started', label: 'Campaign Started' },
        { key: 'campaign.completed', label: 'Campaign Completed' },
        { key: 'session.status', label: 'Session Status Change' },
    ]);
});

// ═══════════════════════════════════════
// API ROUTES — Follow-ups
// ═══════════════════════════════════════

app.get('/api/follow-ups', (req, res) => {
    const { status } = req.query;
    let items = followUpsDb.getAll();
    if (status === 'pending') items = items.filter(i => i.status === 'pending');
    else if (status === 'sent') items = items.filter(i => i.status === 'sent');
    else if (status === 'failed') items = items.filter(i => i.status === 'failed');

    const sessions = sessionsDb.getAll();
    const enriched = items.map(item => {
        const session = sessions.find(s => s.id === item.session_id);
        return { ...item, session_name: session ? session.name : 'Unknown' };
    });
    res.json(enriched);
});

app.get('/api/follow-ups/stats', (req, res) => {
    res.json(followUpsDb.stats());
});

app.post('/api/follow-ups', (req, res) => {
    try {
        const { name, phone, sessionId, message, delayMinutes } = req.body;
        if (!phone || !sessionId || !message) {
            return res.status(400).json({ error: 'phone, sessionId, and message are required' });
        }
        if (!delayMinutes || delayMinutes < 1) {
            return res.status(400).json({ error: 'delayMinutes must be at least 1' });
        }
        followUpsDb.create(name || 'Follow-up', phone.trim(), sessionId, message, parseInt(delayMinutes));
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/follow-ups/:id', (req, res) => {
    try {
        followUpsDb.update(parseInt(req.params.id), req.body);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/follow-ups/:id', (req, res) => {
    try {
        followUpsDb.delete(parseInt(req.params.id));
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/follow-ups/:id/run', async (req, res) => {
    try {
        const item = followUpsDb.getById(parseInt(req.params.id));
        if (!item) return res.status(404).json({ error: 'Follow-up not found' });
        if (item.status !== 'pending') return res.status(400).json({ error: 'Follow-up is not pending' });

        const sock = sessionManager.getClient(item.session_id);
        if (!sock) return res.status(400).json({ error: 'Session not connected' });

        const phone = item.phone.replace(/[^0-9]/g, '');
        const jid = `${phone}@s.whatsapp.net`;
        await sock.sendMessage(jid, { text: item.message });
        followUpsDb.markSent(item.id);
        res.json({ success: true });
    } catch (err) {
        try { followUpsDb.markFailed(parseInt(req.params.id)); } catch (e) { }
        res.status(500).json({ error: err.message });
    }
});

// ═══════════════════════════════════════
// API ROUTES — WhatsApp Group Categories
// ═══════════════════════════════════════

app.get('/api/wa-group-categories', (req, res) => {
    res.json(waGroupCategoriesDb.getAll());
});

app.post('/api/wa-group-categories', (req, res) => {
    try {
        const { name, description } = req.body;
        if (!name || !name.trim()) return res.status(400).json({ error: 'Category name is required' });
        waGroupCategoriesDb.create(name.trim(), description || '');
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/wa-group-categories/:id', (req, res) => {
    try {
        const { name } = req.body;
        if (!name || !name.trim()) return res.status(400).json({ error: 'Category name is required' });
        waGroupCategoriesDb.rename(parseInt(req.params.id), name.trim());
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/wa-group-categories/:id', (req, res) => {
    try {
        waGroupCategoriesDb.delete(parseInt(req.params.id));
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/wa-group-categories/:id/groups', (req, res) => {
    try {
        const members = waGroupCategoriesDb.getMembers(parseInt(req.params.id));
        res.json(members);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/wa-group-categories/:id/add-group', (req, res) => {
    try {
        const { sessionId, groupId, groupName } = req.body;
        if (!sessionId || !groupId) return res.status(400).json({ error: 'sessionId and groupId are required' });
        waGroupCategoriesDb.addGroup(parseInt(req.params.id), sessionId, groupId, groupName || '');
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/wa-group-categories/:id/remove-group', (req, res) => {
    try {
        const { sessionId, groupId } = req.body;
        if (!sessionId || !groupId) return res.status(400).json({ error: 'sessionId and groupId are required' });
        waGroupCategoriesDb.removeGroup(parseInt(req.params.id), sessionId, groupId);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/wa-group-categories/group-member/:memberId', (req, res) => {
    try {
        waGroupCategoriesDb.removeGroupById(parseInt(req.params.memberId));
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/wa-group-categories/group/:sessionId/:groupId', (req, res) => {
    try {
        const categories = waGroupCategoriesDb.getCategoriesForGroup(req.params.sessionId, req.params.groupId);
        res.json(categories);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Bulk action: add participant(s) to all groups in a category
app.post('/api/wa-group-categories/:id/bulk-add', async (req, res) => {
    try {
        const { sessionId, participants } = req.body;
        if (!sessionId || !participants || !participants.length) {
            return res.status(400).json({ error: 'sessionId and participants are required' });
        }
        const members = waGroupCategoriesDb.getMembers(parseInt(req.params.id));
        if (!members.length) return res.status(400).json({ error: 'Category has no groups' });

        const results = [];
        for (const m of members) {
            try {
                const r = await sessionManager.addGroupParticipants(sessionId, m.group_id, participants);
                results.push({ groupId: m.group_id, groupName: m.group_name, status: 'ok', result: r });
            } catch (err) {
                results.push({ groupId: m.group_id, groupName: m.group_name, status: 'error', error: err.message });
            }
        }
        res.json({ success: true, results });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Bulk action: remove participant(s) from all groups in a category
app.post('/api/wa-group-categories/:id/bulk-remove', async (req, res) => {
    try {
        const { sessionId, participants } = req.body;
        if (!sessionId || !participants || !participants.length) {
            return res.status(400).json({ error: 'sessionId and participants are required' });
        }
        const members = waGroupCategoriesDb.getMembers(parseInt(req.params.id));
        if (!members.length) return res.status(400).json({ error: 'Category has no groups' });

        const results = [];
        for (const m of members) {
            try {
                const r = await sessionManager.removeGroupParticipants(sessionId, m.group_id, participants);
                results.push({ groupId: m.group_id, groupName: m.group_name, status: 'ok', result: r });
            } catch (err) {
                results.push({ groupId: m.group_id, groupName: m.group_name, status: 'error', error: err.message });
            }
        }
        res.json({ success: true, results });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Bulk action: add participant(s) to multiple groups by ID (not tied to a category)
app.post('/api/groups/bulk-add', async (req, res) => {
    try {
        const { sessionId, groupIds, participants } = req.body;
        if (!sessionId || !groupIds || !groupIds.length || !participants || !participants.length) {
            return res.status(400).json({ error: 'sessionId, groupIds, and participants are required' });
        }
        const results = [];
        for (const groupId of groupIds) {
            try {
                const r = await sessionManager.addGroupParticipants(sessionId, groupId, participants);
                results.push({ groupId, status: 'ok', result: r });
            } catch (err) {
                results.push({ groupId, status: 'error', error: err.message });
            }
        }
        res.json({ success: true, results });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Bulk action: remove participant(s) from multiple groups by ID
app.post('/api/groups/bulk-remove', async (req, res) => {
    try {
        const { sessionId, groupIds, participants } = req.body;
        if (!sessionId || !groupIds || !groupIds.length || !participants || !participants.length) {
            return res.status(400).json({ error: 'sessionId, groupIds, and participants are required' });
        }
        const results = [];
        for (const groupId of groupIds) {
            try {
                const r = await sessionManager.removeGroupParticipants(sessionId, groupId, participants);
                results.push({ groupId, status: 'ok', result: r });
            } catch (err) {
                results.push({ groupId, status: 'error', error: err.message });
            }
        }
        res.json({ success: true, results });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ═══════════════════════════════════════
// SPA Fallback for Next.js routing
// ═══════════════════════════════════════
app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) return next();
    const indexPath = path.join(__dirname, 'public', 'index.html');
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        next();
    }
});

// ═══════════════════════════════════════
// Socket.IO connection
// ═══════════════════════════════════════

io.on('connection', (socket) => {
    console.log('Dashboard connected');
    socket.on('disconnect', () => console.log('Dashboard disconnected'));
});

// ═══════════════════════════════════════
// Global Exception & JSON Error Middleware
// ═══════════════════════════════════════
app.use((err, req, res, next) => {
    console.error('[API Error]', err.stack || err.message || err);
    res.status(err.status || 500).json({
        success: false,
        error: err.message || 'Internal Server Error'
    });
});

// ═══════════════════════════════════════
// Start server
// ═══════════════════════════════════════

const PORT = process.env.PORT || 3000;
if (process.env.NODE_ENV !== 'test') {
    server.listen(PORT, () => {
        const actualPort = server.address().port;
        console.log(`SERVER_PORT=${actualPort}`);
        console.log(`\n🤖 AJM.bot Dashboard running at http://localhost:${actualPort}\n`);

        // Fix #11: Clean up old messages on startup and every 24h
        try { messagesDb.cleanup(90); } catch (e) { }
        setInterval(() => {
            try { messagesDb.cleanup(90); } catch (e) { }
        }, 24 * 60 * 60 * 1000);
    });

    // Fix #21: Graceful shutdown
    const shutdown = async () => {
        console.log('[Shutdown] Graceful shutdown initiated...');
        try { scheduler.stop(); } catch (e) { }
        try {
            const sessions = sessionManager.listSessions();
            for (const s of sessions) {
                const sock = sessionManager.getClient(s.id);
                if (sock) { try { sock.end(); } catch (_) { } }
            }
        } catch (e) { }
        try { db.close(); } catch (e) { }
        process.exit(0);
    };
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
}

module.exports = app;
