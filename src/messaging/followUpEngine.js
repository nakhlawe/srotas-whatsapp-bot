const { followUps: followUpsDb, settings: settingsDb } = require('../db/database');
const sessionManager = require('../whatsapp/sessionManager');

let io = null;
let notifyWebhooks = null;
let checkInterval = null;

function init(socketIO, webhookNotifier) {
    io = socketIO;
    notifyWebhooks = webhookNotifier;
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

    if (startMinutes > endMinutes) {
        return currentMinutes >= startMinutes || currentMinutes < endMinutes;
    }
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
}

async function processFollowUps() {
    try {
        const pending = followUpsDb.getPending();
        if (!pending.length) return;

        for (const item of pending) {
            if (isDndActive()) {
                console.log(`[FollowUp] DND active — deferring follow-up #${item.id}`);
                continue;
            }

            try {
                const sock = sessionManager.getClient(item.session_id);
                if (!sock) {
                    console.log(`[FollowUp] Session ${item.session_id} not connected — skipping #${item.id}`);
                    continue;
                }

                const phone = item.phone.replace(/[^0-9]/g, '');
                const jid = `${phone}@s.whatsapp.net`;
                await sock.sendMessage(jid, { text: item.message });
                followUpsDb.markSent(item.id);
                console.log(`[FollowUp] Sent follow-up #${item.id} to ${phone}`);

                if (notifyWebhooks) {
                    notifyWebhooks('followup.sent', { id: item.id, phone, message: item.message });
                }

                if (io) {
                    io.emit('followup:sent', { id: item.id, phone });
                }
            } catch (err) {
                console.error(`[FollowUp] Failed to send #${item.id}:`, err.message);
                followUpsDb.markFailed(item.id);
            }
        }
    } catch (err) {
        console.error('[FollowUp] Error processing follow-ups:', err.message);
    }
}

function start() {
    if (checkInterval) return;
    console.log('[FollowUp] Engine started — checking every 30 seconds');
    processFollowUps();
    checkInterval = setInterval(processFollowUps, 30 * 1000);
}

function stop() {
    if (checkInterval) {
        clearInterval(checkInterval);
        checkInterval = null;
    }
}

module.exports = { init, start, stop, isDndActive, processFollowUps };
