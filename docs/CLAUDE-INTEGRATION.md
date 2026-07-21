# Claude integration — verify CLI + MCP server

design-diff stays **fully local**: it never calls the Anthropic API, never reads `ANTHROPIC_API_KEY`,
and does not depend on `@anthropic-ai/sdk`. This integration exposes the existing compare engine
(`server/jobs.ts`) two ways so **Claude Code / Claude Desktop can drive it in a closed
verify-fix-verify loop**, with the LLM itself running entirely in the MCP client, on your own
Claude subscription:

- **`npm run verify`** — a deterministic CLI gate (pass/fail on a score threshold). Good for a
  pre-commit hook, a CI job, or as the thing an agent shells out to.
- **`server/mcp.ts`** — an MCP stdio server exposing `compare` and `verify` as tools Claude can call
  directly, with images and per-element diffs returned as structured data/paths it can read.

Both reuse `server/jobs.ts`/`server/figma.ts` byte-for-byte — no capture/diff/prompt logic is
duplicated, and both write into `runs/<runId>/` exactly like the Express API does.

## `npm run verify` — CLI

```bash
npm run verify -- --ref <url> --target <url> [--breakpoints 1440,1024,768,390] [--threshold 90] [--full-page]
npm run verify -- --image <path/to/mock.png> --target <url> ...
npm run verify -- --figma <https://figma.com/design/...> --target <url> ...
```

Arguments:

| Flag | Required | Notes |
|---|---|---|
| `--ref` / `--image` / `--figma` | exactly one | reference source (URL, local image file, or Figma frame link) |
| `--target` | yes | URL being checked against the reference |
| `--breakpoints` | no | comma-separated viewport widths, default `1440,1024,768,390` |
| `--threshold` | no | minimum passing score %, default `90` |
| `--full-page` | no | capture the full scrollable page instead of just the viewport |

`--figma` reads the token from `FIGMA_TOKEN` in `.env` (same as the web UI) and fails clearly if
it's missing. Playwright can navigate `file://` URLs, so the gate also works against static
fixtures with no server running — see `fixtures/a.html` / `fixtures/b.html`.

**Exit codes:** `0` pass · `1` fail (a breakpoint scored below threshold, or a breakpoint errored)
· `2` hard error (bad arguments, couldn't launch/run the pipeline).

Sample failing run:

```
verify: running url vs file:///.../fixtures/b.html @ [1440, 1024, 768, 390]px (threshold 95%)

runId: verify-...
  1440 · 79% ✗
  1024 · 78% ✗
  768 · 77% ✗
  390 · 72% ✗

avg: 76%   worst: 390px   threshold: 95%

top element diffs (failing breakpoints):
  @1440px:
    [matched] <h1> «...» — font-family: Georgia, "Times New Roman", serif -> Arial, Helvetica, sans-serif; font-size: 48px -> 36px; ...
    ...
```

## MCP server — `server/mcp.ts`

A stdio MCP server (official `@modelcontextprotocol/sdk`, `McpServer` + `StdioServerTransport`)
exposing two tools:

- **`compare`** — inputs `{ referenceUrl? | figmaUrl? | imagePath?, targetUrl, breakpoints?, fullPage?,
  referenceCapture?, targetCapture? }` (exactly one of `referenceUrl`/`figmaUrl`/`imagePath`). Runs the
  full pipeline and returns `{ runId, summary, breakpoints: [{ breakpoint, scorePct|error, elementDiffs,
  styleDiff, images: { ref, target, diff } }], claudePrompt }`. `elementDiffs` are returned in full — the
  per-element, per-CSS-property checklist is the surgical part Claude acts on. Image paths are absolute
  filesystem paths under `runs/<runId>/`, so the client can `Read` them directly.
- **`verify`** — same inputs plus `threshold?` (default `90`). Returns
  `{ pass, threshold, failures: [{ breakpoint, scorePct|error }], summary }` — the loop's stop condition.

A pipeline failure (bad URL, missing `FIGMA_TOKEN`, capture timeout, etc.) comes back as an MCP tool
error (`isError: true` with the message from `job.error`), never as an uncaught crash.

### Run it directly

```bash
npx tsx server/mcp.ts
```

It prints a ready line to **stderr** (stdout is reserved for JSON-RPC frames) and then waits on stdio.

### Register with Claude Code

```bash
claude mcp add design-diff -- npx tsx server/mcp.ts
```

Or via a project `.mcp.json`:

```json
{
  "mcpServers": {
    "design-diff": {
      "command": "npx",
      "args": ["tsx", "server/mcp.ts"]
    }
  }
}
```

Claude Desktop uses the same shape under `mcpServers` in its own config file.

### The loop

1. Claude calls `compare` (or `verify`) against a reference and the target URL you're working on.
2. It reads `elementDiffs`/`styleDiff`/`claudePrompt` and (optionally) the returned image paths, and
   edits the target's code.
3. Claude calls `verify` again with the same inputs; repeats until `pass: true`.

The design stays intentionally simple: **the LLM lives in the MCP client** (Claude Code/Desktop, your
own subscription) — this server only answers tool calls with data produced by the same local
Playwright + pixelmatch + style/element-diff engine the Express UI uses. No network calls are made
here beyond what the engine itself already makes (the URLs you pass in, and Figma's API if you use
`figmaUrl`/`--figma`).

### Known limitation

Each tool call launches its own Chromium instance (`runJob` owns one `Browser` per job and closes it
when done) rather than pooling a long-lived browser across calls — simplest correct behavior for a
locally-invoked MCP server. See the `shortcut:` comment in `server/mcp.ts` if per-call launch overhead
ever becomes the bottleneck.
