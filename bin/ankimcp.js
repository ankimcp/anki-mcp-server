#!/usr/bin/env node

// Determine mode based on CLI flags
const isStdioMode = process.argv.includes('--stdio');
const isTunnelMode = process.argv.some(arg =>
  arg === '--tunnel' ||
  arg.startsWith('--tunnel=') ||
  arg === '--login' ||
  arg === '--logout'
);

if (isStdioMode) {
  // STDIO mode - for MCP clients like Cursor, Cline, Zed, etc.
  require('../dist/main-stdio.js');
} else if (isTunnelMode) {
  // Tunnel mode - for remote MCP access via tunnel service
  require('../dist/main-tunnel.js');
} else {
  // HTTP mode (default) - for web-based AI assistants
  require('../dist/main-http.js');
}
