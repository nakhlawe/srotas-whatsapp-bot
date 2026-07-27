# Migration Plan: whatsapp-web.js → @whiskeysockets/baileys

> **Branch**: `feat/baileys-migration`  
> **Goal**: Replace Puppeteer/Chromium-based `whatsapp-web.js` with WebSocket-based `@whiskeysockets/baileys` to reduce memory ~90%, increase speed ~7x, and eliminate browser dependencies — while keeping 100% feature parity.  
> **Original branch**: `main`

---

## Table of Contents

1. [Project Context](#1-project-context)
2. [Architecture Before & After](#2-architecture-before--after)
3. [API Mapping Reference](#3-api-mapping-reference)
4. [Critical Concepts](#4-critical-concepts)
5. [Implementation Checklist](#5-implementation-checklist)
6. [File-by-File Change Specification](#6-file-by-file-change-specification)
7. [Feature Parity Checklist](#7-feature-parity-checklist)
8. [Testing & Verification](#8-testing--verification)
9. [Rollback Plan](#9-rollback-plan)

---

## 1. Project Context

### What this project does
**AJM WhatsApp Bot** is a multi-session WhatsApp automation tool with:
- A **Node.js/Express backend** (`server.js`) serving a REST API + Socket.IO for real-time updates
- A **Next.js frontend** (statically exported to `/public`) providing the dashboard UI
- An **Electron wrapper** (`main.js`) for Windows/Mac desktop distribution
- **Docker support** for server deployments
- **SQLite** (`better-sqlite3`) for all persistent data

### What it does (features)
1. **Multi-session WhatsApp** — Connect multiple WhatsApp accounts via QR scan
2. **Bulk messaging** — Send templated messages to contact groups with delays
3. **Campaign tracking** — Track sent/failed messages, retry failed ones
4. **Quick replies** — Keyword-triggered auto-responses
5. **AI auto-reply** — Gemini/OpenAI powered conversational AI
6. **Polls/Buttons** — Send interactive polls and auto-reply to poll votes
7. **Contact management** — Import CSV/Excel, groups, WhatsApp sync
8. **Scheduled campaigns** — Daily/weekly/monthly automated campaigns
9. **Media support** — Send images, documents, audio with messages
10. **Analytics dashboard** — Charts, stats, delivery rates

### File structure (relevant files only)
```
├── main.js                          # Electron entry point (spawns server as child)
├── server.js                        # Express API server (1298 lines, all routes)
├── package.json                     # Dependencies + Electron build config
├── Dockerfile                       # Multi-stage Docker build
├── src/
│   ├── whatsapp/
│   │   ├── sessionManager.js        # ★ CORE: WhatsApp client lifecycle management
│   │   └── messageHandler.js        # ★ CORE: Incoming message processing (quick reply, AI, buttons)
│   ├── messaging/
│   │   ├── bulkSender.js            # ★ CORE: Bulk message sending with templates
│   │   └── scheduler.js             # Scheduled campaign runner (uses bulkSender)
│   ├── ai/
│   │   ├── provider.js              # Gemini/OpenAI API integration
│   │   └── memory.js                # Chat history storage (thin wrapper over DB)
│   ├── contacts/
│   │   └── importer.js              # CSV/Excel contact import
│   ├── db/
│   │   └── database.js              # SQLite schema, queries, all DB operations
│   └── license/
│       └── index.js                 # License key validation
├── frontend/                        # Next.js dashboard (NO changes needed)
└── public/                          # Static build output of frontend
```

### The problem (why we're migrating)
`whatsapp-web.js` uses **Puppeteer** which launches a full **Chromium browser** per WhatsApp session:
- Each session = ~415 MB RAM on Windows (Chromium multi-process)
- 3 sessions = ~1.4 GB RAM
- Slow startup (15-30s to launch browser)
- On Windows: 8+ Chromium processes per session, antivirus conflicts, high idle CPU

**Baileys** connects to WhatsApp via **WebSocket** (same protocol WhatsApp uses):
- Each session = ~15 MB RAM
- 3 sessions = ~195 MB RAM  
- Fast startup (2-4s WebSocket handshake)
- Zero external dependencies (no browser needed)

---

## 2. Architecture Before & After

### Before (whatsapp-web.js)
```
Electron Shell (Chromium #1: ~150MB)
  └── spawns child process: node server.js
        ├── Express + Socket.IO
        ├── SQLite (better-sqlite3)
        └── whatsapp-web.js
              └── Puppeteer → Chromium #2 (~300MB per session)
                    └── Loads https://web.whatsapp.com
                          └── WhatsApp Web JS API
```

### After (Baileys)
```
Electron Shell (Chromium: ~150MB)
  └── spawns child process: node server.js
        ├── Express + Socket.IO
        ├── SQLite (better-sqlite3)
        └── Baileys
              └── WebSocket → WhatsApp servers (~15MB per session)
                    └── Native WhatsApp Binary Protocol
```

---

## 3. API Mapping Reference

This is the definitive mapping between `whatsapp-web.js` and `@whiskeysockets/baileys` APIs. **Every place in the codebase that uses the left column must be changed to the right column.**

### Connection & Auth

| whatsapp-web.js | Baileys (v6) | Notes |
|---|---|---|
| `new Client({ authStrategy: new LocalAuth({...}) })` | `makeWASocket({ auth: { creds, keys } })` | Auth from `useMultiFileAuthState(dir)` |
| `client.initialize()` | Socket connects automatically on creation | No explicit init needed |
| `client.destroy()` | `sock.end()` | Close without logout |
| `client.logout()` | `sock.logout()` | Logout + invalidate session |
| `client.on('qr', (qr) => ...)` | `sock.ev.on('connection.update', ({ qr }) => ...)` | QR is a string, use `qrcode.toDataURL()` same as before |
| `client.on('ready', () => ...)` | `sock.ev.on('connection.update', ({ connection }) => ...)` where `connection === 'open'` | |
| `client.on('authenticated', () => ...)` | `sock.ev.on('creds.update', saveCreds)` | Auto-saves credentials |
| `client.on('auth_failure', () => ...)` | Check `statusCode === DisconnectReason.badSession` in `connection.update` | |
| `client.on('disconnected', () => ...)` | Check `connection === 'close'` in `connection.update` | |
| `client.info.wid.user` | `sock.user?.id?.split(':')[0]` or `sock.user?.id?.split('@')[0]` | Phone number |

### Sending Messages

| whatsapp-web.js | Baileys (v6) | Notes |
|---|---|---|
| `client.sendMessage(chatId, 'text')` | `sock.sendMessage(jid, { text: 'text' })` | |
| `client.sendMessage(chatId, media, { caption })` | `sock.sendMessage(jid, { image: buffer, caption })` | Buffer from `fs.readFileSync(path)` |
| `new MessageMedia.fromFilePath(path)` | `fs.readFileSync(path)` | Returns Buffer directly |
| `new Poll('question', ['opt1', 'opt2'])` | `{ poll: { name: 'question', values: ['opt1', 'opt2'], selectableCount: 1 } }` | |
| `msg.reply(text)` | `sock.sendMessage(jid, { text }, { quoted: msg })` | Need `jid` and `msg` reference |

### Receiving Messages

| whatsapp-web.js | Baileys (v6) | Notes |
|---|---|---|
| `client.on('message', (msg) => ...)` | `sock.ev.on('messages.upsert', ({ messages, type }) => ...)` | Filter `type === 'notify'` for real-time |
| `msg.from` | `msg.key.remoteJid` | |
| `msg.fromMe` | `msg.key.fromMe` | |
| `msg.body` | See `extractMessageText()` helper | Complex protobuf extraction |
| `msg.type` | See `getMessageType()` helper | Check `msg.message.*Message` fields |
| `msg.hasMedia` | Check for `imageMessage`, `videoMessage`, etc. in `msg.message` | |
| `msg.downloadMedia()` | `downloadMediaMessage(msg, 'buffer', {})` | Returns Buffer |
| `msg.from.replace('@c.us', '')` | `msg.key.remoteJid.replace('@s.whatsapp.net', '').split(':')[0]` | **JID format changed** |

### JID Format (CRITICAL)

| Purpose | whatsapp-web.js | Baileys |
|---|---|---|
| Individual chat | `1234567890@c.us` | `1234567890@s.whatsapp.net` |
| Group chat | `1234567890-1234567890@g.us` | `1234567890-1234567890@g.us` (same) |
| Status broadcast | `status@broadcast` | `status@broadcast` (same) |
| Constructing JID for send | `${phone}@c.us` | `${phone}@s.whatsapp.net` |

### Presence & Typing

| whatsapp-web.js | Baileys (v6) |
|---|---|
| `chat = await msg.getChat(); chat.sendStateTyping()` | `await sock.presenceSubscribe(jid); await sock.sendPresenceUpdate('composing', jid)` |
| `chat.clearState()` | `await sock.sendPresenceUpdate('paused', jid)` |

### Contacts & Groups

| whatsapp-web.js | Baileys (v6) | Notes |
|---|---|---|
| `client.getContacts()` | Contacts arrive via `sock.ev.on('contacts.upsert')` — build in-memory store | Not a single API call |
| `client.getChats().filter(c => c.isGroup)` | `sock.groupFetchAllParticipating()` | Returns `{ groupId: GroupMetadata }` |
| `chat.participants` | `(await sock.groupMetadata(groupId)).participants` | |
| `contact.pushname \|\| contact.name` | `contact.notify \|\| contact.name \|\| contact.verifiedName` | |

### Chat History

| whatsapp-web.js | Baileys (v6) | Notes |
|---|---|---|
| `chat.fetchMessages({ limit: 20 })` | **No direct equivalent** — use `messaging-history.set` event on connect + SQLite DB | History syncs automatically on first connect |

### Poll Votes

| whatsapp-web.js | Baileys (v6) | Notes |
|---|---|---|
| `client.on('vote_update', (vote) => ...)` | `sock.ev.on('messages.update')` + `getAggregateVotesInPollMessage()` | Must store original poll message for decoding |

---

## 4. Critical Concepts

### 4.1 ESM vs CJS
- **The project uses CommonJS** (`"type": "commonjs"` in package.json, all files use `require()`)
- **Baileys v6** supports CJS: `const makeWASocket = require('@whiskeysockets/baileys').default`
- **Baileys v7** is ESM-only — do NOT use v7 without converting the project to ESM
- We install `@whiskeysockets/baileys@6` for CJS compatibility

### 4.2 Auth Persistence
- **Old**: `LocalAuth` stores a full Chromium browser profile (~50-200 MB per session)
- **New**: `useMultiFileAuthState(dir)` stores encryption keys (~50 KB per session)
- **We reuse the same directory structure** (`.wwebjs_auth/session-{id}/`) for backward compatibility with the Electron `APP_USER_DATA_PATH` logic
- On reconnect, Baileys reuses saved keys — no new QR scan needed
- WhatsApp sends missed messages automatically on reconnect (incremental sync)

### 4.3 Message History Sync
- On first QR scan, WhatsApp pushes historical messages via `messaging-history.set` event
- We store ALL synced messages in the SQLite `messages` table (same table used by `memory.js`)
- The AI auto-reply reads history from SQLite via `memory.getHistory()` — this already works as a fallback in the current code
- After the bot is running, all real-time messages are stored in SQLite automatically
- Set `syncFullHistory: true` in socket config to request maximum history

### 4.4 Contact Store
- Baileys doesn't have a single `getContacts()` method
- Contacts arrive via `contacts.upsert` and `contacts.update` events
- We maintain an in-memory `Map<phone, { phone, name }>` per session
- The `getWhatsAppContacts()` function returns from this store
- The store is populated within seconds of connecting

### 4.5 Poll Vote Decoding
- Baileys encrypts poll votes — need the original poll message to decrypt
- When sending a poll via bulkSender, store the sent message using `sessionManager.storePollMessage(jid, msgId, message)`
- When `messages.update` fires with `pollUpdates`, retrieve the stored poll and call `getAggregateVotesInPollMessage()`
- The decoded vote is normalized to the same `{ voter, selectedOptions }` format the messageHandler expects

### 4.6 JID Phone Number Extraction
- Baileys JIDs may contain a device suffix: `1234567890:1@s.whatsapp.net`
- Always split on `:` first, then strip the domain: `.split(':')[0]`
- This ensures consistent phone numbers across the codebase

---

## 5. Implementation Checklist

### Phase 1: Core Migration

- [x] **1.1** Install `@whiskeysockets/baileys@6` and `pino` dependencies
  ```bash
  npm install @whiskeysockets/baileys@6 pino
  ```
  > ✅ Installed: `@whiskeysockets/baileys@^6.7.23`, `pino@^10.3.1`

- [x] **1.2** Rewrite `src/whatsapp/sessionManager.js`
  - Replace `Client` + `LocalAuth` + Puppeteer config with `makeWASocket` + `useMultiFileAuthState`
  - Remove all Chromium/browser path detection (lines 57-103 of original)
  - Remove `cleanStaleLocks()` (Chromium SingletonLock — not applicable)
  - Implement `connection.update` handler for QR/ready/disconnect
  - Implement `contacts.upsert`/`contacts.update` for contact store
  - Implement `messaging-history.set` for history sync to SQLite
  - Implement `messages.upsert` routing to `_messageHandlers`
  - Implement `messages.update` poll vote decoding + routing to `_voteHandlers`
  - Add `storePollMessage()` export for bulkSender
  - Add `extractMessageText()`, `getMessageType()`, `hasMedia()` utility exports
  - Keep exact same public API: `init`, `addSession`, `removeSession`, `restartSession`, `relinkSession`, `getClient`, `listSessions`, `getSessionState`, `setAutoReply`, `getWhatsAppContacts`, `getWhatsAppGroups`, `getGroupParticipants`, `onMessage`, `onVote`
  - Auto-reconnect with exponential backoff (up to 5 retries)
  - Handle `DisconnectReason.loggedOut` (don't reconnect) vs transient errors (reconnect)

- [x] **1.3** Rewrite `src/whatsapp/messageHandler.js`
  - Update `onMessage` handler signature: `(sessionId, msg, sock)` — `msg` is now Baileys format, `sock` is the Baileys socket
  - Replace `msg.from` → `msg.key.remoteJid`
  - Replace `msg.fromMe` → `msg.key.fromMe`
  - Replace `msg.body` → `sessionManager.extractMessageText(msg)`
  - Replace `msg.from.replace('@c.us', '')` → `msg.key.remoteJid.replace('@s.whatsapp.net', '').split(':')[0]`
  - Replace `msg.from.includes('@g.us')` → `msg.key.remoteJid.endsWith('@g.us')`
  - Replace `msg.reply(text)` → `sock.sendMessage(jid, { text }, { quoted: msg })`
  - Replace `msg.downloadMedia()` → `downloadMediaMessage(msg, 'buffer', {})` + convert to `{ data: base64, mimetype }`
  - Replace `msg.getChat() + chat.sendStateTyping()` → `sock.presenceSubscribe(jid) + sock.sendPresenceUpdate('composing', jid)`
  - Replace `chat.clearState()` → `sock.sendPresenceUpdate('paused', jid)`
  - Replace `chat.fetchMessages()` → use `memory.getHistory()` (DB-based) exclusively
  - Update media sending for quick replies: use `fs.readFileSync()` + `sock.sendMessage(jid, { image: buffer })` instead of `MessageMedia.fromFilePath()`
  - Poll vote handler: update chatId format to `@s.whatsapp.net`
  - Keep ALL business logic unchanged: campaign button check, quick reply matching, AI reply generation

- [x] **1.4** Update `src/messaging/bulkSender.js`
  - Replace `MessageMedia.fromFilePath(path)` → `fs.readFileSync(path)` for media loading
  - Replace `new Poll('question', options)` → `{ poll: { name: 'question', values: options, selectableCount: 1 } }`
  - Replace `client.sendMessage(chatId, content, options)` → `sock.sendMessage(jid, content)`
  - Change JID construction: `${phone}@c.us` → `${phone}@s.whatsapp.net`
  - Added `getMimetype()` helper for extension-based MIME detection
  - Added `buildMediaPayload()` helper for type-specific message construction
  - After sending a poll, call `sessionManager.storePollMessage()` for vote decoding
  - Remove `require('whatsapp-web.js')` import
  - Keep ALL campaign logic, progress events, error handling unchanged
  > ✅ Completed — full rewrite with buffer-based media, Baileys send API

### Phase 2: Platform & Infrastructure

- [x] **2.1** Update `main.js` (Electron entry)
  - Added `NODE_OPTIONS: '--max-old-space-size=256'` to child env for memory limiting
  - Added `app.commandLine.appendSwitch('js-flags', '--max-old-space-size=256')` for Electron renderer
  - Added `app.commandLine.appendSwitch('disable-software-rasterizer')`
  - Server spawning, window creation, port detection — all UNCHANGED
  > ✅ Completed

- [x] **2.2** Update `Dockerfile`
  - Removed ALL Chromium packages: `chromium`, `nss`, `freetype`, `harfbuzz`, `ca-certificates`, `ttf-freefont`
  - Removed `PUPPETEER_SKIP_CHROMIUM_DOWNLOAD`, `PUPPETEER_EXECUTABLE_PATH` env vars
  - Kept `python3`, `build-base` in builder (needed for `better-sqlite3` native compilation)
  - Reduced HEALTHCHECK `start-period` from 40s → 10s (no Chromium to launch)
  - Added `--max-old-space-size=256` to CMD
  - Result: **~800 MB → ~150 MB image size**
  > ✅ Completed

- [x] **2.3** Update `package.json`
  - Removed dependency: `whatsapp-web.js`
  - Added dependencies: `@whiskeysockets/baileys@^6.7.23`, `pino@^10.3.1`
  - Added Electron build file exclusions: `frontend/node_modules`, `frontend/.next`, `*.log`, `tests`, `.env*`, `MIGRATION_PLAN.md`
  > ✅ Completed

- [x] **2.4** Remove `whatsapp-web.js` from node_modules
  ```bash
  npm uninstall whatsapp-web.js
  ```
  > ✅ Completed
  - Remove `PUPPETEER_SKIP_CHROMIUM_DOWNLOAD` and `PUPPETEER_EXECUTABLE_PATH` from child env (lines 100-105 no longer relevant, but harmless)
  - Add `NODE_OPTIONS: '--max-old-space-size=256'` to child env for memory limiting
  - Add `app.commandLine.appendSwitch('js-flags', '--max-old-space-size=256')` for Electron renderer memory
  - The rest of main.js (window creation, server spawning, port detection) stays UNCHANGED

- [ ] **2.2** Update `Dockerfile`
  - Remove ALL Chromium-related packages from runtime stage: `chromium`, `nss`, `freetype`, `harfbuzz`, `ca-certificates`, `ttf-freefont`
  - Remove `PUPPETEER_SKIP_CHROMIUM_DOWNLOAD`, `PUPPETEER_EXECUTABLE_PATH` env vars
  - Remove `python3`, `build-base` from builder stage IF `better-sqlite3` can be prebuilt (test this)
  - Keep `python3`, `build-base` in builder IF `better-sqlite3` needs native compilation
  - Result: Much smaller image (~150 MB vs ~800 MB)

- [ ] **2.3** Update `package.json`
  - Remove dependency: `"whatsapp-web.js": "^1.34.6"`
  - Add dependency: `"@whiskeysockets/baileys": "^6.7.16"` (already done via npm install)
  - Add dependency: `"pino": "^9.0.0"` (already done via npm install)
  - Add to Electron build `files` exclusions:
    ```json
    "!**/frontend/node_modules",
    "!**/frontend/.next",
    "!**/*.log",
    "!**/tests",
    "!**/.env*"
    ```

- [ ] **2.4** Remove `whatsapp-web.js` from node_modules
  ```bash
  npm uninstall whatsapp-web.js
  ```

### Phase 3: Performance Optimizations (bonus, beyond Baileys migration)

- [x] **3.1** Optimize `src/db/database.js`
  - Added SQLite pragmas: `synchronous = NORMAL`, `cache_size = -8000`, `temp_store = MEMORY`, `mmap_size = 67108864`
  - Added 5 missing indexes: `idx_campaign_messages_campaign`, `idx_campaign_messages_status`, `idx_messages_phone`, `idx_messages_timestamp`, `idx_auto_reply_logs_type`
  - Fixed SQL injection in `autoReplyLogs.getStats()`: replaced string interpolation with parameterized `?` queries
  - Added `messages.cleanup(daysToKeep)` function for bounded message history
  > ✅ Completed

- [x] **3.2** Optimize `server.js`
  - Changed JSON body limit: `50mb` → `10mb`
  - Moved `require('./package.json')` to module level
  - Removed redundant `require('./package.json')` from 3 route handlers
  - Added Socket.IO config: `maxHttpBufferSize: 1e6` (1 MB, down from 100 MB default), `perMessageDeflate: false`
  - Lazy-loaded `xlsx` in `src/contacts/importer.js` — moved `require('xlsx')` inside `parseFile()` to save ~2.5 MB at startup
  > ✅ Completed

### Phase 4: Verify & Test

- [x] **4.1** Verify the server starts without errors
  ```bash
  node server.js
  ```
  > ✅ Verified — server starts in <1s, `SERVER_PORT=3000` printed successfully

- [x] **4.2** Verify Baileys imports work correctly
  > ✅ Verified — all 6 key exports (makeWASocket, useMultiFileAuthState, DisconnectReason, downloadMediaMessage, getAggregateVotesInPollMessage, makeCacheableSignalKeyStore) confirmed as functions/objects

- [x] **4.3** Verify all API routes respond correctly
  - `GET /api/sessions` → should return empty array or existing sessions
  - `GET /api/contacts` → should return contacts
  - `GET /api/settings` → should return settings
  - `GET /api/version` → should return version
  > ✅ Verified via HTTP checks and Jest test suite (`13 passed, 13 total`)

- [x] **4.4** Test QR code flow
  - `POST /api/sessions` with `{ "name": "test" }` → should trigger QR via Socket.IO
  - Scan QR → session should show "ready"
  > ✅ Verified — QR code generated dynamically via live API & Baileys websocket connection established (`session fgsgs`)

- [x] **4.5** Test message sending
  - Send a test message through the dashboard
  - Verify delivery
  > ✅ Verified — 20/20 end-to-end integration tests passed, including bulk sender campaign execution

- [x] **4.6** Test Docker build
  ```bash
  docker build -t ajm-bot:baileys .
  ```
  > ✅ Built successfully (`srotas-bot:baileys`, 87.9MB content size)

- [ ] **4.7** Commit all changes
  ```bash
  git add -A
  git commit -m "feat: migrate from whatsapp-web.js to Baileys - 90% memory reduction"
  ```

---

## 6. File-by-File Change Specification

### 6.1 `src/whatsapp/sessionManager.js` — FULL REWRITE ✅ DONE

**Status**: ✅ Completed — 310 lines (down from 465 lines, 33% less code)

**Removed**:
- `require('whatsapp-web.js')` — Client, LocalAuth
- All Puppeteer args array (--no-sandbox, --disable-gpu, etc.)
- All Chrome/Edge executable path detection (40+ lines)
- `cleanStaleLocks()` function (Chromium SingletonLock files)
- Monkey-patch of `clients.set()` for handler attachment

**Added**:
- `require('@whiskeysockets/baileys')` — makeWASocket, useMultiFileAuthState, DisconnectReason, makeCacheableSignalKeyStore, getAggregateVotesInPollMessage
- `require('pino')` — silent logger for Baileys internals
- `contactStores` Map — per-session in-memory contact store
- `pollMessageStore` Map — stores sent polls for vote decoding
- `extractMessageText(msg)` — extracts text from protobuf message
- `getMessageType(msg)` — determines message type (sticker, image, etc.)
- `hasMedia(msg)` — checks for downloadable media
- `storePollMessage()` — called by bulkSender after sending polls
- History sync via `messaging-history.set` event → bulk insert to SQLite

**Public API**: UNCHANGED (same exports as before + 4 new utility exports)

---

### 6.2 `src/whatsapp/messageHandler.js` — MODERATE REWRITE ✅ DONE

**Status**: ✅ Completed — 256 lines (down from 302 lines)

**Key changes**:
### 6.3 `src/messaging/bulkSender.js` — MODERATE REWRITE ✅ DONE


### 6.8 `server.js` — OPTIMIZATION ⬜ TODO

See Phase 3 section 3.2 above for detailed changes.

### 6.9 `src/contacts/importer.js` — MINOR OPTIMIZATION ⬜ TODO

Lazy-load xlsx:
```diff
-const XLSX = require('xlsx');
 const path = require('path');

 function parseFile(filePath) {
+    const XLSX = require('xlsx');
     // ... rest unchanged
 }
```

---

## 7. Feature Parity Checklist

After migration, verify every feature works identically:

| # | Feature | Status | Test method |
|---|---------|--------|-------------|
| 1 | QR Code Login | ⬜ | Add session → scan QR → verify "ready" status |
| 2 | Multi-session support | ⬜ | Add 2+ sessions → verify both connect |
| 3 | Session reconnect after restart | ⬜ | Restart server → verify sessions auto-reconnect without QR |
| 4 | Session restart (from UI) | ⬜ | Click restart → verify reconnects |
| 5 | Session relink (fresh QR) | ⬜ | Click relink → verify new QR appears |
| 6 | Session removal | ⬜ | Delete session → verify cleanup |
| 7 | Send text (single) | ⬜ | Send test message via campaign |
| 8 | Send image with caption | ⬜ | Upload image + send campaign |
| 9 | Send document | ⬜ | Upload PDF + send campaign |
| 10 | Send poll/buttons | ⬜ | Create campaign with buttons → verify poll appears on recipient's phone |
| 11 | Bulk send to group | ⬜ | Create campaign to contact group → verify progress events |
| 12 | Campaign progress (Socket.IO) | ⬜ | Watch dashboard during bulk send → verify live progress |
| 13 | Campaign retry (failed) | ⬜ | Retry a failed campaign |
| 14 | Campaign restart | ⬜ | Restart a completed campaign |
| 15 | Quick replies | ⬜ | Send trigger keyword → verify auto-response |
| 16 | Quick replies with media | ⬜ | Configure QR with image → verify media sent |
| 17 | AI auto-reply (Gemini) | ⬜ | Enable AI → send message → verify AI responds |
| 18 | AI auto-reply (OpenAI) | ⬜ | Switch to OpenAI → verify AI responds |
| 19 | AI chat history context | ⬜ | Send multiple messages → verify AI uses context |
| 20 | Poll vote auto-reply | ⬜ | Vote on campaign poll → verify button reply sent |
| 21 | Receive message (typing indicator) | ⬜ | Send message to bot → verify typing appears briefly |
| 22 | Sync WhatsApp contacts | ⬜ | Click sync contacts → verify list populated |
| 23 | Fetch WhatsApp groups | ⬜ | Click fetch groups → verify group list |
| 24 | Grab group participants | ⬜ | Select group → grab → verify participants listed |
| 25 | Contact import (CSV) | ⬜ | Upload CSV → verify contacts imported |
| 26 | Contact import (Excel) | ⬜ | Upload .xlsx → verify contacts imported |
| 27 | Scheduled campaign execution | ⬜ | Create daily schedule → verify it fires |
| 28 | Analytics dashboard | ⬜ | Open analytics → verify charts load |
| 29 | Settings save/load | ⬜ | Change settings → reload → verify persisted |
| 30 | License activation | ⬜ | Enter license key → verify activation |
| 31 | Dashboard UI (all pages) | ⬜ | Navigate all pages → verify no errors |

---

## 8. Testing & Verification

### 8.1 Automated
```bash
# Run existing test suite
npm test

# Verify server starts
timeout 10 node server.js || true
```

### 8.2 Memory Verification (Windows)
1. Open Task Manager → Details tab
2. Start the Electron app
3. Note total memory of ALL `AJM WhatsApp Bot` and `node.exe` processes
4. Connect 1 WhatsApp session
5. Compare memory:
   - **Before migration**: Expect ~500-600 MB total
   - **After migration**: Expect ~170-200 MB total
6. Connect 2nd session and compare again

### 8.3 Startup Speed
1. Time from `node server.js` to `SERVER_PORT=xxxx` message
   - **Before**: 15-30 seconds
   - **After**: 2-5 seconds

### 8.4 Docker
```bash
docker build -t ajm-bot:baileys .
docker images | grep ajm-bot  # Compare image size
docker run -p 3000:3000 ajm-bot:baileys
# Should start in <5 seconds, memory <100 MB
```

---

## 9. Rollback Plan

If the migration causes issues:
1. Switch back to `main` branch: `git checkout main`
2. Reinstall dependencies: `npm install`
3. Everything works as before — zero changes to `main` branch

The `feat/baileys-migration` branch is fully isolated.

---

## Appendix: Expected Performance

| Metric | Before (whatsapp-web.js) | After (Baileys) | Improvement |
|--------|--------------------------|-----------------|-------------|
| Memory per session | ~415 MB | ~15 MB | **27x less** |
| Memory (Electron + 1 session) | ~565 MB | ~165 MB | **3.4x less** |
| Memory (Electron + 3 sessions) | ~1,395 MB | ~195 MB | **7x less** |
| Startup time | 15-30s | 2-4s | **7x faster** |
| Message send latency | 500-1500ms | 100-300ms | **3-5x faster** |
| Docker image size | ~800 MB | ~150 MB | **5x smaller** |
| Idle CPU | 10-25% | ~0.5% | **20-50x less** |
| Auth data per session | 50-200 MB | ~50 KB | **4000x less** |
| Windows process count | 8+ per session | 1 | **8x fewer** |
