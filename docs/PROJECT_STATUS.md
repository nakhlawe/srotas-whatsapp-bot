# AJM.bot — Project Status & Implementation Details

## 📌 Project Overview
AJM.bot is a robust, self-hosted WhatsApp automation dashboard built with Node.js. It allows users to manage multiple WhatsApp sessions, manage contacts/groups, send bulk campaigns w/ media, schedule messages, and handle auto-replies using AI or canned "Quick Responses".

## 🛠 Technical Architecture

### Tech Stack
- **Backend**: Node.js + Express
- **WhatsApp**: `whatsapp-web.js` (Puppeteer-based)
- **Database**: SQLite (`better-sqlite3`) for high performance and zero-config storage.
- **Frontend**: Vanilla JS + CSS (Single Page Application design).
- **Real-time**: Socket.IO for QR codes, status updates, and campaign progress.

### Database
- **Location**: `/data/bot.db` (automatically created on startup).
- **Schema**:
  - `sessions`: Stores auth info (`client.id`) and configuration.
  - `contacts` & `groups`: CRM system.
  - `campaigns` & `campaign_messages`: History of bulk sends.
  - `messages`: Log of incoming/outgoing chats.
  - `settings`: System-wide config (API keys, prompts).
  - `quick_replies`: Canned response triggers.

---

## ✅ Feature Deep Dive: How It Works

### 1. Session Management
- **QR Login**: The server spawns a headless Chrome instance. The QR code is emitted via Socket.IO to the frontend in real-time.
- **Persistence**: Session files are stored in `.wwebjs_auth/` so re-login isn't needed after restart.
- **Stability**: On server restart, a cleanup routine forcefully removes stale Puppeteer lock files (`SingletonLock`) to prevent "zombie" processes that block initialization.

### 2. Bulk Campaigns & Messaging
- **Queue System**: Messages are sent sequentially with a randomized delay (defined in Settings, e.g., 3-5 seconds) to mimic human behavior and reduce ban risk.
- **Templating**:
  - **Dynamic Placeholders**: `{{name}}`, `{{phone}}`, `{{company}}` are replaced per contact.
  - **Custom Fields**: Any column in an uploaded CSV (e.g., `Order ID`, `City`) is automatically detected and available as a variable `{{Order ID}}`.
- **Media**: Files are uploaded to `uploads/media/`, then sent using `MessageMedia.fromFilePath()`.

### 3. Automation Logic
- **Priority Handling**:
  1. **Quick Replies**: Incoming messages are first checked against the `quick_replies` table. If a trigger keyword (e.g., "pricing") matches, the canned response is sent immediately.
  2. **AI Auto-Reply**: If no Quick Reply matches *and* Auto-Reply is enabled for that session, the message is passed to the LLM (Gemini/OpenAI).
- **Context Window**: The AI receives the last 10-20 messages of conversation history to maintain context.

### 4. Contact Management
- **Group from Selected**: You can select specific contacts in the UI and instantly create a new group. The backend supports "Copy" (keep in old group too) or "Move" (remove from old group) modes.
- **WhatsApp Sync**: Uses the `client.getContacts()` API to fetch your phone's actual address book and import it into the bot's database.

### 5. Interactive Messaging (New)
- **Quick Replies**:
  - Keyword-based triggers (fuzzy match on whole words).
  - Supports text + media attachments.
- **Custom Buttons**:
  - Campaign builder supports adding up to 3 interactive buttons.
  - **Smart Fallback**: If the recipient's device (or Multi-Device beta) doesn't support native buttons, the bot automatically converts them into a numbered text menu (e.g., "1. Yes\n2. No") to ensure delivery.
- **Image Captions**: Full support for sending images with captions in a single message bubble.

---

## ⚠️ Current Limitations (What Doesn't Work Yet)

1.  **Media Storage (Incoming)**:
    - The bot *sends* media fine, but incoming media (images/voice notes) from users are not currently saved to disk. They appear as `[Media]` in the logs.

2.  **Rate Limiting**:
    - The current protection is just a fixed/random delay. Intelligent "warm-up" patterns (gradually increasing volume) are not implemented.

3.  **Single User**:
    - The dashboard is single-user. There is no login system for the dashboard itself; anyone with network access to port 3000 can control it.

4.  **Hosting**:
    - Requires a server with GUI support dependencies (for Puppeteer), even in headless mode. Not easily deployable to serverless functions (Vercel/Netlify) due to the persistent filesystem and browser requirement.

---

## 🔮 Roadmap (What Can Be Added)

- [ ] **Webhook Integration**: Send incoming messages to an external URL (e.g., Zapier, Slack, or a custom CRM) for advanced workflows.
- [ ] **Multi-User Dashboard**: Add username/password login for the admin panel.
- [ ] **Chat Interface**: A full "Live Chat" view in the dashboard to manually reply to conversations (currently you can only see logs).
- [ ] **Advanced Analytics**: Visual graphs for message volume, response times, and campaign success rates over time.
- [ ] **Contact Tags**: More flexible than just "Groups".
- [ ] **Flow Builder**: A visual drag-and-drop builder for creating complex auto-reply trees (If User says A -> Send B -> Wait for C).

---

## 📂 Directory Structure Overview

```
/
├── data/                  # SQLite database (bot.db)
├── .wwebjs_auth/          # WhatsApp session files (DO NOT DELETE if you want to keep login)
├── uploads/               # Temp storage for CSVs and media
├── public/                # Frontend (HTML/CSS/JS)
├── src/
│   ├── ai/                # LLM integration
│   ├── whatsapp/          # Client & Message handling
│   ├── messaging/         # Bulk sender & Scheduler
│   ├── contacts/          # Import/Export logic
│   └── db/                # Database layer
└── server.js              # Entry point
```
