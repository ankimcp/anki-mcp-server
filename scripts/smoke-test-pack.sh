#!/bin/bash
# Smoke-tests the published npm package the way a real consumer installs it:
# `npm pack` + `npm install <tarball>` with no lockfile in play, then confirms
# the STDIO server boots and answers `initialize` / `tools/list` without needing
# Anki/AnkiConnect to be reachable. Regression coverage for #56 (mixed
# @nestjs/* pinning resolved to an inconsistent tree outside the repo lockfile).
set -euo pipefail

# Pick a bounded-timeout runner. `timeout` is standard on Linux CI (coreutils);
# macOS ships neither `timeout` nor `gtimeout` by default (gtimeout comes from
# `brew install coreutils`). Fall back to perl's alarm as a last resort so this
# script also runs locally on macOS.
if command -v timeout >/dev/null 2>&1; then
  RUN_WITH_TIMEOUT=(timeout)
elif command -v gtimeout >/dev/null 2>&1; then
  RUN_WITH_TIMEOUT=(gtimeout)
else
  RUN_WITH_TIMEOUT=(perl -e 'alarm shift @ARGV; exec @ARGV or die $!')
fi

TMP_DIR="$(mktemp -d)"
cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT INT TERM

dump_streams_and_fail() {
  echo "ERROR: $1" >&2
  echo "--- stdout ---" >&2
  echo "${OUTPUT-}" >&2
  echo "--- stderr ---" >&2
  cat "$TMP_DIR/stderr.log" >&2
  exit 1
}

echo "=== Pack ==="
npm pack --pack-destination "$TMP_DIR" >/dev/null
TARBALL="$(ls "$TMP_DIR"/*.tgz)"
echo "Packed: $TARBALL"

echo ""
echo "=== Install (no lockfile, mirrors a real consumer's npm install) ==="
INSTALL_DIR="$TMP_DIR/inst"
mkdir -p "$INSTALL_DIR"
npm install "$TARBALL" --prefix "$INSTALL_DIR" --no-save >/dev/null

SERVER_BIN="$INSTALL_DIR/node_modules/.bin/ankimcp"
if [ ! -x "$SERVER_BIN" ]; then
  echo "ERROR: $SERVER_BIN not found (or not executable) after install" >&2
  exit 1
fi

HTTP_ENTRY="$INSTALL_DIR/node_modules/@ankimcp/anki-mcp-server/dist/main-http.js"
if [ ! -f "$HTTP_ENTRY" ]; then
  echo "ERROR: $HTTP_ENTRY not found after install" >&2
  exit 1
fi

echo ""
echo "=== Require HTTP entry point (validates its require graph: express, etc.) ==="
# main-http.js bootstraps and starts listening as soon as it's required, so
# there's no clean "load without running" check available here. Bound it with
# a timeout instead: a bare require crash (e.g. MODULE_NOT_FOUND, or the
# bootstrap's own catch handler calling process.exit(1)) fails fast; reaching
# the timeout means it got past module resolution and into listen(), which is
# what we're actually verifying.
#
# Must run as a script with real CLI flags, not `node -e "require(...)"` —
# Commander parses argv from process.argv, and `node -e` mangles slicing so
# --port/--host never reach it, silently falling back to the 3000/127.0.0.1
# defaults and making this check bind the wrong port.
set +e
HTTP_OUTPUT="$(NO_UPDATE_NOTIFIER=1 "${RUN_WITH_TIMEOUT[@]}" 5 node "$HTTP_ENTRY" --port 39217 --host 127.0.0.1 2>&1)"
HTTP_EXIT=$?
set -e

if echo "$HTTP_OUTPUT" | grep -q "MODULE_NOT_FOUND"; then
  echo "ERROR: MODULE_NOT_FOUND detected while requiring main-http.js" >&2
  echo "$HTTP_OUTPUT" >&2
  exit 1
fi

if [ $HTTP_EXIT -ne 0 ] && [ $HTTP_EXIT -ne 124 ] && [ $HTTP_EXIT -ne 142 ]; then
  echo "ERROR: main-http.js failed to boot (exit $HTTP_EXIT)" >&2
  echo "$HTTP_OUTPUT" >&2
  exit 1
fi
echo "main-http.js require OK (booted and started listening, or ran to the bounded timeout with no MODULE_NOT_FOUND)"

echo ""
echo "=== Boot server and exercise initialize + tools/list over STDIO ==="

REQUESTS_FILE="$TMP_DIR/requests.jsonl"
cat >"$REQUESTS_FILE" <<'EOF'
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"smoke-test","version":"0.0.0"}}}
{"jsonrpc":"2.0","method":"notifications/initialized"}
{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}
EOF

set +e
OUTPUT="$(NO_UPDATE_NOTIFIER=1 "${RUN_WITH_TIMEOUT[@]}" 10 "$SERVER_BIN" --stdio <"$REQUESTS_FILE" 2>"$TMP_DIR/stderr.log")"
EXIT_CODE=$?
set -e

# 124 (timeout) / 142 (perl alarm's SIGALRM exit) are expected: the server
# never exits on its own while serving stdio, so it's killed once the timeout
# elapses. 10s is plenty of headroom for initialize + tools/list to complete.
if [ $EXIT_CODE -ne 0 ] && [ $EXIT_CODE -ne 124 ] && [ $EXIT_CODE -ne 142 ]; then
  echo "ERROR: server exited with code $EXIT_CODE" >&2
  echo "--- stderr ---" >&2
  cat "$TMP_DIR/stderr.log" >&2
  exit 1
fi

if echo "$OUTPUT" | grep -q "MODULE_NOT_FOUND"; then
  echo "ERROR: MODULE_NOT_FOUND detected in server output" >&2
  echo "$OUTPUT" >&2
  exit 1
fi

extract_response() {
  jq -c --argjson id "$1" 'select(.id == $id)' <<<"$OUTPUT" 2>"$TMP_DIR/jq-err.log"
}

if ! INIT_LINE="$(extract_response 1)"; then
  dump_streams_and_fail "stdout did not parse as JSON-RPC while looking for the initialize response ($(cat "$TMP_DIR/jq-err.log"))"
fi
if [ -z "$INIT_LINE" ]; then
  dump_streams_and_fail "no response to initialize request"
fi

SERVER_NAME="$(echo "$INIT_LINE" | jq -r '.result.serverInfo.name // empty')"
if [ -z "$SERVER_NAME" ]; then
  echo "ERROR: initialize response missing result.serverInfo" >&2
  echo "$INIT_LINE" >&2
  exit 1
fi
echo "initialize OK - serverInfo.name=$SERVER_NAME"

if ! TOOLS_LINE="$(extract_response 2)"; then
  dump_streams_and_fail "stdout did not parse as JSON-RPC while looking for the tools/list response ($(cat "$TMP_DIR/jq-err.log"))"
fi
if [ -z "$TOOLS_LINE" ]; then
  dump_streams_and_fail "no response to tools/list request"
fi

TOOL_COUNT="$(echo "$TOOLS_LINE" | jq -r '.result.tools | length')"
if [ -z "$TOOL_COUNT" ] || [ "$TOOL_COUNT" -eq 0 ]; then
  echo "ERROR: tools/list returned an empty tools array" >&2
  echo "$TOOLS_LINE" >&2
  exit 1
fi

echo "tools/list OK - $TOOL_COUNT tools"
echo ""
echo "=== Smoke test passed ==="
