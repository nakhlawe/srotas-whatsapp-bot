# AJM WhatsApp Bot — MCP Server

Exposes the AJM WhatsApp Bot REST API (`../server.js`) as [MCP](https://modelcontextprotocol.io) tools, so any MCP-compatible AI agent — Claude Code, Claude Desktop, Cursor, Copilot Chat, or a custom agent — can manage devices, contacts, campaigns, templates, scheduling, and analytics through natural language, instead of the dashboard.

This is a thin client: it does **no auth of its own**. It just forwards calls to the already-running bot server, which is why the bot must be activated (license key entered) and have at least one linked WhatsApp session before these tools do anything useful — that's the same gate the dashboard has.

## Prerequisites

- The AJM WhatsApp Bot server is running (desktop app open, `npm run dev`, or the Docker container) and reachable, default `http://localhost:3000`.
- The license is activated and at least one WhatsApp session is linked (`ready`), for anything that sends messages.

## Install

```bash
cd mcp-server
npm install
```

## Configure

### Claude Code

A project-level `.mcp.json` already exists at the repo root — Claude Code picks it up automatically when you open this project. No extra steps needed.

### Claude Desktop / Cursor / other clients

Add to that client's MCP config (e.g. `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "srotas-whatsapp-bot": {
      "command": "node",
      "args": ["/absolute/path/to/srotas-whatsapp-bot/mcp-server/src/index.js"],
      "env": {
        "WHATSAPP_BOT_API_URL": "http://localhost:3000"
      }
    }
  }
}
```

Set `WHATSAPP_BOT_API_URL` if the bot server runs somewhere other than `localhost:3000` (e.g. a Docker deployment on a different host/port).

## Tool coverage

Sessions/devices, contact groups & contacts (incl. WhatsApp sync/import), message templates, quick replies, campaigns (send/retry/restart/analytics), AI image generation + company logo, application settings, scheduler, and dashboard analytics — see `src/tools/*.js` for the full list (53 tools total). License activation/deactivation and admin key generation are intentionally **not** exposed here; those stay dashboard-only.

## Playbook

See [`.claude/skills/whatsapp-bot-mcp/SKILL.md`](../.claude/skills/whatsapp-bot-mcp/SKILL.md) for the structured scenario playbook an agent should follow when using these tools (device selection, confirmation rules before sending, common marketing flows). It's written as a Claude Code skill but is plain markdown any agent can be pointed at.
