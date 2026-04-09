# Analysis: mediaActions Path Traversal Report

**Date:** 2026-04-08
**Related report:** [2026-04-08-media-path-traversal-report.md](./2026-04-08-media-path-traversal-report.md)

---

## Verdict: Valid finding, medium severity (not high)

The technical finding is correct. The `path` parameter in `storeMediaFile` is unsanitized and passed directly to AnkiConnect, which reads the file with the local user's permissions. Combined with `retrieveMediaFile`, this enables reading arbitrary files as base64.

## Code path confirmed

```
mediaActions.tool.ts:64-65  →  path accepted as unconstrained string in Zod schema
storeMediaFile.action.ts:72-73  →  path forwarded directly to AnkiConnect
retrieveMediaFile.action.ts:38  →  returns file contents as base64
```

Additionally, the `url` parameter (line 74-75) has a similar lack of validation — potential SSRF vector (e.g., cloud metadata endpoints like `http://169.254.169.254/`). The reporter did not mention this.

## Why medium, not high

The full exploit chain requires all of these to succeed:

1. **Prompt injection** — The LLM must be manipulated into calling `storeMediaFile` with a malicious path (e.g., via adversarial text in an Anki card). Non-trivial but possible.

2. **Bypassing human-in-the-loop** — MCP clients like Claude Desktop display tool call parameters to the user before execution. The `path: "/home/user/.ssh/id_rsa"` would be visible. The tool is marked `destructiveHint: true`, which typically triggers confirmation prompts. Some clients may auto-approve, but most standard clients do not for destructive operations.

3. **Exfiltration** — Even if the LLM retrieves base64 data, it appears in the user's conversation, not the attacker's. The attacker needs a separate channel to receive it. AnkiConnect's `storeMediaFile` URL fetch does GET only, so it can't POST data out.

4. **`--read-only` mode blocks it** — `storeMediaFile` is in the `WRITE_ACTIONS` set (`anki-connect.client.ts:28`), so read-only deployments are unaffected.

## PoC critique

The reporter's PoC uses direct `client.call_tool()` calls — this demonstrates direct API access, not prompt injection. If an attacker controls the MCP client directly, they can already do anything (delete all notes, call any tool). The meaningful threat model is prompt injection through untrusted content, which is harder to execute reliably.

## Assessment of proposed fixes

### Option A: Remove `path` parameter — Rejected

The README recommends file paths as best practice:
> **Use file paths** (e.g., `/Users/you/image.png`) - Fast and efficient
> **Avoid base64** - Extremely slow and token-inefficient

Removing `path` forces all local files through base64 (massive token overhead and slow) or URL (requires files to be web-accessible). This is a significant UX regression for the primary use case (user asks LLM to add a local image to a flashcard).

### Option B: Allowlist directory — Accepted as opt-in

A strict mandatory allowlist is too restrictive for most users. A user saying "add this image from my Desktop to my flashcard" shouldn't need to pre-configure an env var. But it's a good opt-in hardening layer via `MEDIA_IMPORT_DIR` for security-conscious deployments.

## Independent reviews

Two independent agent reviews were conducted (TypeScript specialist + Security auditor). Key findings beyond the original report:

### Additional findings (from security auditor)

1. **SSRF via `updateNoteFields` audio/picture `url` fields** (CWE-918, Medium) — Same unsanitized URL pass-through, different tool. Marked `destructiveHint: false`, so clients may auto-approve more readily.
2. **Filename path traversal (output direction)** (CWE-22, Low) — `filename` param in `storeMediaFile` is unsanitized. Could potentially write outside `collection.media/` if AnkiConnect doesn't sanitize. Depends on downstream behavior.
3. **Pattern injection in `getMediaFilesNames`** (CWE-155, Informational) — `pattern` forwarded to AnkiConnect's glob. Low practical impact.
4. **Suggestion: default `--read-only` when `--ngrok` is used** — Worth considering for highest-risk deployment mode.

### Key insight from both reviewers

Both independently rejected the denylist-as-primary approach (our initial recommendation). **Denylists are fundamentally incomplete** — you cannot enumerate all sensitive files across all OSes. Instead, both proposed a **file extension allowlist** as the primary defense: only allow paths ending in media extensions (`.jpg`, `.mp3`, `.png`, `.wav`, etc.). This is strictly better because:
- It's an allowlist (complete by definition)
- Sensitive files never have media extensions
- Zero UX impact on legitimate use

## Decision: Chosen approach

### Layer 1: MIME type allowlist (always on, primary defense)

Use `mime` v4 library to resolve the file extension to a MIME type. By default, only allow:
- `image/*`
- `audio/*`
- `video/*`

Everything else is rejected. Files with no recognized extension (e.g., `id_rsa`, `credentials`) return `null` from `mime` and are blocked.

### Layer 2: User-defined extra types via `MEDIA_ALLOWED_TYPES` (opt-in)

If a user needs to allow non-media files (e.g., PDFs, APKG archives), they can set:
```
MEDIA_ALLOWED_TYPES=application/pdf,application/apkg
```
These are added on top of the default media allowlist. Without this env var, only media MIME types pass.

### Layer 3: Directory restriction via `MEDIA_IMPORT_DIR` (opt-in)

If set, the resolved path must also be inside the configured directory:
```
MEDIA_IMPORT_DIR=/Users/me/anki-media
```
Without this env var, any directory is allowed (as long as Layer 1/2 passes).

### Error handling

Validation errors should help the user understand what went wrong and how to fix it, without revealing specifics that help an attacker probe the security rules (e.g., don't echo back the resolved path or the detected MIME type).

Examples:
- MIME check fail: `"File type not allowed. Only media files (images, audio, video) are accepted. To allow additional file types, set the MEDIA_ALLOWED_TYPES environment variable."`
- Directory check fail: `"File path is outside the allowed import directory (/Users/me/anki-media). Update MEDIA_IMPORT_DIR to change the allowed directory."` (include the configured dir — the user set it themselves)

Details like the resolved path and detected MIME type go to **server logs only** (warn-level), not in the error response.

### Layer 4: URL/SSRF validation (always on)

Using `ipaddr.js` to validate URLs passed to `storeMediaFile` and `updateNoteFields` audio/picture fields. By default, block:
- Non-HTTP(S) schemes (`file://`, `ftp://`, `gopher://`, etc.)
- Private IP ranges (10.x, 172.16-31.x, 192.168.x)
- Loopback (127.x)
- Link-local / cloud metadata (169.254.x)
- Reserved/unspecified ranges

### Layer 5: User-defined allowed IPs via `MEDIA_ALLOWED_HOSTS` (opt-in)

If a user legitimately needs to fetch media from a private network (e.g., a NAS or local server), they can explicitly allow it:
```
MEDIA_ALLOWED_HOSTS=192.168.1.50,10.0.0.5
```
These hosts bypass the private IP check. Without this env var, all private/reserved IPs are blocked.

Error example: `"URL blocked: requests to private/internal networks are not allowed. To allow specific hosts, set the MEDIA_ALLOWED_HOSTS environment variable."`

### Also needed

- Filename sanitization (strip `../`, path separators, limit to basename)
- Update `path` schema description to explicitly say "media file"
- Warn-level logging on every `path`/`url` usage (server-side only, not returned to LLM)

## Severity summary table

| # | Finding | CWE | Severity | Read-Only Blocks? |
|---|---------|-----|----------|-------------------|
| 1 | Arbitrary file read via `path` param | CWE-22, CWE-552 | Medium | Yes |
| 2 | SSRF via `storeMediaFile` `url` param | CWE-918 | Medium | Yes |
| 3 | SSRF via `updateNoteFields` audio/picture `url` | CWE-918 | Medium | Yes |
| 4 | Filename path traversal (output direction) | CWE-22 | Low | Partially |
| 5 | Pattern injection in `getMediaFilesNames` | CWE-155 | Informational | No |

## Affected files for fix

- `src/mcp/primitives/essential/tools/mediaActions/actions/storeMediaFile.action.ts` — Add path + URL validation
- `src/mcp/primitives/essential/tools/mediaActions/mediaActions.tool.ts` — Update schema descriptions
- `src/mcp/primitives/essential/tools/update-note-fields.tool.ts` — URL validation for audio/picture URLs
- New: validation utility (file type validation, URL/SSRF checks)
- Tests for validators

## Library research (2026-04-08)

### Path validation: `mime` v4

**Chosen:** [`mime`](https://www.npmjs.com/package/mime) v4 — 104M downloads/week, zero dependencies, bundled TypeScript types, MIT license, ESM-only.

Usage: `mime.getType(filePath)` returns MIME type string or `null`. Check result starts with `image/`, `audio/`, or `video/` to allow only media files.

**Rejected alternatives:**
- `mime-types` — works but CJS-only, no bundled types, less modern
- `file-type` — wrong tool; detects type by reading file magic bytes, but we need to validate *before* reading the file

**Note:** `mime` is ESM-only since v4. Project already handles ESM deps via `transformIgnorePatterns` in Jest config (ky, unified, remark-parse). Add `mime` to that pattern.

### SSRF prevention: `ipaddr.js`

**Chosen:** [`ipaddr.js`](https://www.npmjs.com/package/ipaddr.js) v2 — 80M downloads/week, zero dependencies, bundled TypeScript types, MIT license, CJS.

No good drop-in SSRF library exists for ky/native fetch. All agent-based libraries (`request-filtering-agent`, `ssrf-req-filter`, `got-ssrf`) are incompatible. Build ~30-40 lines on top of `ipaddr.js` following the OWASP SSRF prevention guide for Node.js:

1. Parse URL with `new URL(input)` — validates scheme and structure
2. Check `url.protocol` is `http:` or `https:` — blocks `file://`, `ftp://`, `gopher://`
3. Resolve hostname with `dns.promises.lookup()`
4. Parse resolved IP with `ipaddr.parse()`
5. Check `addr.range()` against blocked ranges: `'private'`, `'loopback'`, `'linkLocal'`, `'reserved'`, `'unspecified'`

**Rejected alternatives:**
- `request-filtering-agent` — agent-based, incompatible with ky/native fetch
- `ssrf-req-filter` — same issue + unmaintained + no TypeScript types
- `got-ssrf` — locked to `got` peer dependency
- `dssrf` — 5 GitHub stars, misleading docs (claims zero deps, ships `got`), too new
- `private-ip` — **has active CVE-2025-8020** (multicast range bypass), do not use
