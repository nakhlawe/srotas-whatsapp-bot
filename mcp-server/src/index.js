#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { registerLicenseTools } from './tools/license.js';
import { registerSessionTools } from './tools/sessions.js';
import { registerContactTools } from './tools/contacts.js';
import { registerTemplateTools } from './tools/templates.js';
import { registerQuickReplyTools } from './tools/quickReplies.js';
import { registerCampaignTools } from './tools/campaigns.js';
import { registerMediaTools } from './tools/media.js';
import { registerSettingsTools } from './tools/settings.js';
import { registerAnalyticsTools } from './tools/analytics.js';
import { registerSchedulerTools } from './tools/scheduler.js';

const server = new McpServer({
    name: 'ajm-whatsapp-bot',
    version: '1.0.0',
});

registerLicenseTools(server);
registerSessionTools(server);
registerContactTools(server);
registerTemplateTools(server);
registerQuickReplyTools(server);
registerCampaignTools(server);
registerMediaTools(server);
registerSettingsTools(server);
registerAnalyticsTools(server);
registerSchedulerTools(server);

async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('AJM WhatsApp Bot MCP server running on stdio');
}

main().catch((err) => {
    console.error('Fatal error starting AJM WhatsApp Bot MCP server:', err);
    process.exit(1);
});
