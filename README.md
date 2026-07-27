# 🤖 AJM WhatsApp Bot

**v1.5.2** · A high-performance, full-stack WhatsApp automation and marketing platform powered by a modern dark-themed web dashboard. Built on top of lightweight WebSocket technology (**Baileys Engine**), it eliminates heavy browser overhead while delivering enterprise-grade multi-account management, bulk messaging, scheduled campaigns, and AI-powered conversational auto-replies.

---

## ⚡ Key Highlights & Architecture (v1.2+)

Unlike older WhatsApp automation tools that launch resource-heavy headless Chromium browsers (`whatsapp-web.js` / Puppeteer), AJM WhatsApp Bot utilizes direct WebSocket communication via **Baileys**:

- **Ultra-Low Memory Footprint:** Consumes a fraction of system RAM and CPU compared to Chromium-based solutions.
- **Native Multi-Device Support:** Fully compatible with WhatsApp Multi-Device protocol. Connect multiple numbers concurrently.
- **Anti-Ban & Safety Hardened:**
  - **Legitimate Client Identity:** Identifies as official `macOS Desktop` client (`Browsers.macOS('Desktop')`) to prevent automated scraper flags.
  - **History Flood Prevention:** Configured with `syncFullHistory: false` to stop massive historical chat downloads upon reconnecting, eliminating rate-limit disconnects (`Error 440`).
  - **Self-Healing Reconnection:** Continuous exponential backoff reconnection engine ensures maximum uptime without manual intervention.

---

## 📦 Installation & Deployment

Choose the method that best fits your workflow:

| Method | Best For | Description |
|---|---|---|
| [🖥️ Desktop App](#%EF%B8%8F-desktop-app-windows--macos) | End Users & Non-Technical Operators | Standalone Electron installer (.exe / .dmg) |
| [🐳 Docker](#-docker-production) | Server / VPS / Cloud Production | Pre-built container with persistent volume storage |
| [💻 Local Development](#-local-development-npm) | Developers & Contributors | Node.js native execution |

---

## 🖥️ Desktop App (Windows & macOS)

Download the latest standalone installer from the [GitHub Releases page](https://github.com/itsdkyp/srotas-whatsapp-bot/releases/latest).

### Windows
1. Download `AJM.WhatsApp.Bot.Setup.1.5.2.exe`.
2. Run the installer and follow the setup wizard.
3. Launch **AJM WhatsApp Bot** from your Desktop or Start Menu. The built-in background server starts automatically and opens the dashboard in your browser.

### macOS
1. Download `AJM.WhatsApp.Bot-1.5.2-arm64.dmg` (Apple Silicon M1/M2/M3) or the universal `.dmg` / `.pkg`.
2. Drag the application icon into your `Applications` folder.
3. Open the app from Applications or Spotlight.

---

## 🐳 Docker (Production)

Deploy effortlessly on Linux servers, AWS, DigitalOcean, or local Docker environments.

### Quick Start

```bash
# 1. Clone this repository
git clone https://github.com/itsdkyp/srotas-whatsapp-bot.git
cd srotas-whatsapp-bot/deploy

# 2. Create environment configuration
cp .env.example .env
# Edit .env and configure your API keys (Gemini/OpenAI)

# 3. Launch the production stack
docker compose -f docker-compose.prod.yml up -d

# 4. Access the web dashboard
open http://localhost:3000
```

### Persistent Data Volumes
Data survives container updates and restarts via Docker named volumes:

| Volume Name | Mounted Path | Contents |
|---|---|---|
| `deploy_whatsapp-data` | `/app/data` | Main SQLite database (campaigns, templates, contacts, logs) |
| `deploy_whatsapp-uploads` | `/app/uploads` | Imported CSV / Excel spreadsheets |
| `deploy_whatsapp-auth` | `/app/auth` | Baileys multi-device cryptographic session keys |

---

## 💻 Local Development (npm)

### Prerequisites
- **Node.js** 18.x or higher
- **npm** 9.x+

### Setup Instructions

```bash
# 1. Clone repository
git clone https://github.com/itsdkyp/srotas-whatsapp-bot.git
cd srotas-whatsapp-bot

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env

# 4. Build frontend UI bundle & start development server
npm run build:ui
npm run dev

# 5. Open dashboard
open http://localhost:3000
```

### Resetting Local State / Clean Factory Reset
If you want to clear all connected WhatsApp devices and wipe local analytics:
```bash
rm -rf data/     # Wipes SQLite database (resets devices, contacts, templates)
rm -rf auth/     # Clears WhatsApp cryptographic session tokens (forces QR scan)
npm run dev
```

---

## ✨ Core Features & Workflow

### 🔑 License Management
- Requires activation on first launch.
- Real-time license verification with visual health indicators on the **Settings** page (Active / Expiring Soon / Expired).

### 📱 Multi-Account Session Manager
- Connect and operate multiple WhatsApp numbers simultaneously.
- Go to **Devices** → **+ Add Account**, assign a custom label, and scan the QR code from your phone (`WhatsApp > Settings > Linked Devices > Link a Device`).
- Individual sessions run isolated WebSocket sockets with real-time status monitoring (`Connected`, `QR Pending`, `Disconnected`).

### 📂 Excel & CSV Contact Importer
- Import spreadsheets (`.csv`, `.xlsx`, `.xls`) with automatic column detection.
- Must include a `phone` column formatted with country code (e.g., `+919876543210`, `+14155552671`).
- Additional columns (like `name`, `company`, `city`, `amount`) are dynamically indexed and can be injected into message templates as dynamic variables (`{{name}}`, `{{company}}`, etc.).
- **Unsaved Contact Name Resolution:** Contacts synced from WhatsApp (not yet saved in your address book) automatically display their WhatsApp push name (`~PushName`) throughout the dashboard, so numbers aren't shown as blank/unlabeled entries. Personal contact sync stays isolated per session and is merged non-destructively with your manually imported contact list.

### 📢 Personalized Bulk Campaign Sender
- Create dynamic campaigns targeting specific contact groups.
- Live progress tracking (Total, Sent, Failed) with detailed activity logs.
- **Smart Retries:** In the **Campaign Analytics** modal, select any connected device from the dropdown selector to instantly **Retry Failed** messages or **Restart** the entire campaign from a backup number.
- Configurable random jitter delays (e.g., 8,000ms – 18,000ms) between messages to mimic natural human behavior and prevent carrier blocks.
- **Unregistered Number Detection:** Every recipient is validated against WhatsApp (`onWhatsApp()`) before sending, so campaigns correctly report numbers that aren't on WhatsApp as failed instead of silently marking them "sent".

### 🕐 Recurring Scheduler
- Automate one-off or recurring broadcasts (Daily, Weekly, Monthly).
- Specify delivery time, target group, source device, and message template.

### 🎨 AI Campaign Image Generation
- Generate a marketing image directly from your campaign message text via Gemini image generation (`gemini-2.5-flash-image` by default, overridable with the `ai_image_model` setting). Requires a configured Gemini API key.
- Click **Generate Image with AI** in the campaign media section; the result is added to the attachments list (first, so it carries the caption) and shown in the live WhatsApp preview.
- **Company Logo Compositing:** Upload a company logo (PNG/JPG/WEBP, 5 MB max) from **Settings → AI Engine**. Once set, it's passed to Gemini and naturally composited into every generated image.

### 🤖 AI-Powered Auto-Reply (Gemini & OpenAI)
- Turn any connected WhatsApp number into an intelligent 24/7 conversational customer service agent.
- Go to **Settings** → choose **AI Provider** (`Google Gemini` or `OpenAI`) and enter your API key.
- Customize the **System Prompt** to define persona, business rules, and instructions.
- Toggle **Auto-Reply ON** per device. The engine queries SQLite conversation memory to maintain multi-turn conversational context, including messages you send manually from your phone.

### ⚡ Keyword Quick Replies
- Create instant keyword triggers (e.g., exact match or regex rules for terms like `price`, `help`, `catalog`).
- Dispatches immediate pre-written responses before AI intervention.

---

## ⚙️ Environment Configuration (`.env`)

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP dashboard server port |
| `AI_PROVIDER` | `gemini` | AI Provider selection (`gemini` or `openai`) |
| `GEMINI_API_KEY` | — | Google AI Studio Gemini API Key |
| `OPENAI_API_KEY` | — | OpenAI API Key |
| `MIN_DELAY_MS` | `8000` | Minimum delay (ms) between bulk outgoing messages |
| `MAX_DELAY_MS` | `18000` | Maximum delay (ms) between bulk outgoing messages |

---

## 🔌 API Reference

### License & Health
- `GET /api/license-status` — Returns license activation state, lifetime flag, and days remaining.
- `POST /api/activate` — Activate instance with `{ "key": "XXXX-XXXX-XXXX-XXXX" }`.

### Device Sessions
- `GET /api/sessions` — List all configured WhatsApp sessions and connection statuses.
- `POST /api/sessions` — Initialize new session `{ "name": "Support Bot" }`.
- `DELETE /api/sessions/:id` — Logout and purge session data.
- `POST /api/sessions/:id/restart` — Force restart socket connection.
- `PUT /api/sessions/:id/auto-reply` — Enable/disable AI auto-replies `{ "enabled": true }`.

### Campaigns & Analytics
- `GET /api/campaigns` — Fetch historical campaign executions and performance counts.
- `POST /api/messages/send-bulk` — Launch bulk broadcast `{ "deviceId", "group", "template", "minDelay", "maxDelay" }`.
- `POST /api/campaigns/:id/retry` — Retry failed recipients using specific device `{ "sessionId" }`.
- `POST /api/campaigns/:id/restart` — Re-run entire campaign using specific device `{ "sessionId" }`.

### AI Media & Branding
- `POST /api/media/generate-image` — Generate a marketing image from campaign text via Gemini (requires a configured Gemini API key). Composites the company logo when one is set.
- `POST /api/settings/logo` — Upload a company logo (PNG/JPG/WEBP, 5 MB max) used for image compositing.
- `GET /api/settings/logo` — Fetch the current company logo.
- `DELETE /api/settings/logo` — Remove the configured company logo.

---

## 📁 Project Structure

```
srotas-whatsapp-bot/
├── main.js                         # Electron Desktop Application wrapper
├── server.js                       # Express API Server & WebSocket Engine
├── package.json                    # Project dependencies & build scripts
├── .env.example                    # Environment variable template
│
├── src/
│   ├── db/database.js              # SQLite database schema, initialization & queries
│   ├── license/index.js            # Cryptographic license verification
│   ├── whatsapp/
│   │   ├── sessionManager.js       # Core Baileys WebSocket multi-device engine
│   │   └── messageHandler.js       # Incoming message router & AI auto-reply dispatcher
│   ├── contacts/importer.js        # Spreadsheet stream parser (.csv / .xlsx)
│   ├── messaging/
│   │   ├── bulkSender.js           # Campaign queue engine with rate limiting & retries
│   │   └── scheduler.js            # Background cron runner for scheduled campaigns
│   └── ai/
│       ├── provider.js             # Unified adapter for Google Gemini & OpenAI API
│       ├── imageGenerator.js       # Gemini campaign image generation & logo compositing
│       └── memory.js               # SQLite conversational buffer management
│
├── frontend/                       # Next.js 16 (App Router) React Dashboard UI
│   ├── src/app/                    # Application views (Campaigns, Scheduler, Devices, etc.)
│   ├── src/components/             # Radix UI & Shadcn styled components
│   └── src/lib/                    # Frontend REST API & Socket.io client hooks
│
├── public/                         # Compiled static single-page web bundle
├── deploy/                         # Docker & Nginx production deployment stacks
├── auth/                           # Baileys session cryptographic state (auto-generated)
└── data/                           # Local SQLite database files (auto-generated)
```

---

## 🛠️ Troubleshooting & Frequently Asked Questions

### 1. Account says "Your account is restricted right now" upon linking
If WhatsApp temporarily restricts your number when linking:
- Tap **Request Review** inside your mobile WhatsApp app and submit: *"My account was temporarily restricted due to a connection sync error on my WhatsApp Desktop web client. Please restore access."* First-time reviews are typically processed by automated systems within 15 to 60 minutes.
- **Prevention:** This occurred on older versions due to heavy chat history downloads. Version 1.2.6+ identifies as `macOS Desktop` and disables historical sync (`syncFullHistory: false`), preventing automated anti-scraping flags.

### 2. QR Code stuck or session disconnected repeatedly
If a session gets corrupted or gets stuck in `qr_pending`:
1. In the dashboard under **Devices**, click the **Delete** icon next to the affected session.
2. Click **+ Add Account** to generate a clean, fresh QR code.
3. If running via terminal, you can manually clear session storage:
   ```bash
   rm -rf auth/session-<device_id>
   ```

### 3. UI showing old views or missing buttons after update
Next.js static web applications cache aggressively in browser memory:
- Perform a **Hard Refresh** on your dashboard (`http://localhost:3000`):
  - **macOS:** `Cmd + Shift + R`
  - **Windows / Linux:** `Ctrl + F5` or `Ctrl + Shift + R`

---

## ⚠️ Important Disclaimer & Safety Guidelines

- **WhatsApp Terms of Service:** Automated messaging on non-official API channels may violate WhatsApp's Terms of Service. Always obtain user consent before sending promotional messages.
- **Rate Limits & Anti-Spam:** Keep message delays reasonable (minimum 8–18 seconds). Sending thousands of unsolicited messages to unsaved contacts rapidly will trigger WhatsApp automated spam filters.

---

## 📜 License

ISC © [AJM Tech](https://ajm.tech)
