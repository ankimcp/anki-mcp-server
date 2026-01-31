#!/usr/bin/env node

// Runtime Node.js version check (require(esm) needs Node 20.19+ or 22.12+)
const [major, minor] = process.versions.node.split('.').map(Number);
if (
    (major < 20) ||
    (major === 21) ||
    (major === 20 && minor < 19) ||
    (major === 22 && minor < 12)
) {
  console.error(
    `Error: Node.js ${process.versions.node} is not supported.\n` +
    'This package requires Node.js 20.19.0+ or 22.12.0+ (Node 21.x is not supported).\n' +
    'Download: https://nodejs.org/'
  );
  process.exit(1);
}

// Check if --stdio flag is present
const isStdioMode = process.argv.includes('--stdio');

if (isStdioMode) {
  // STDIO mode - for MCP clients like Cursor, Cline, Zed, etc.
  require('../dist/main-stdio.js');
} else {
  // HTTP mode (default) - for web-based AI assistants
  require('../dist/main-http.js');
}
