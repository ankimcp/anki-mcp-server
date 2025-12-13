#!/usr/bin/env node
/**
 * Manual test for CLI output utility
 * Run with: node dist/cli/__tests__/cli-output.manual.js
 * (after building with npm run build)
 */

import { cli } from "../cli-output";

// Demo all output types
cli.success("Successfully connected to Anki");
cli.error("Failed to connect to AnkiConnect");
cli.warn("AnkiConnect is not running");
cli.info("Server listening on http://localhost:3000");
cli.blank();
cli.dim("(Use Ctrl+C to stop)");
cli.blank();
cli.box("Ngrok Tunnel Active", "https://abc123.ngrok.io");
