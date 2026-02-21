# CLAUDE.md — Buckit

Project context for Claude Code. Read this before making any changes.

## What This Is

A Cloudflare Worker that monitors r/halifax every Thursday for /u/buckit's weekly gas price prediction post. It parses the post, generates a contextual AI meme image, and serves a display-signage-style website at hfxgas.ca. Fully automated — zero manual intervention required after initial deployment.

## Key Commands (use `task`, not npm)

```sh
task setup          # First-time setup (npm install + husky)
task dev            # Local dev server
task dev:cron       # Trigger cron locally, inspect output
task test           # Run all tests with coverage
task check          # Lint + format check + test (same as CI)
task lint           # ESLint only
task lint:fix       # ESLint with auto-fix
task format         # Prettier write
task format:check   # Prettier check (CI)
task deploy         # Deploy (runs check first)
task deploy:skip-checks  # Emergency deploy only
task logs           # Stream live Worker logs
task refresh        # Force redeploy (skip checks)
task refresh:full   # Full checks + redeploy
task kv:create      # Create PREDICTIONS KV namespace (run once)
task r2:create      # Create IMAGES R2 bucket (run once)
task secret         # Set WEBHOOK_SECRET in Cloudflare
task kv:clear       # Clear all KV data (destructive)
task docs:sync      # Sync docs/ into vitepress/ (needed before docs:dev/build)
task docs:dev       # Sync docs + start VitePress dev server
task docs:build     # Sync docs + build VitePress docs
```

## Architecture

```
scheduled() → Reddit fetch (r/halifax/new.json) → detect /u/buckit post (7-day window)
           → parseRedditPost() → parseAdjustment() × 2 → { gas, diesel, notes }
           → Workers AI image (only if direction is up/down) → R2 store
           → KV write (latest_prediction, prediction_history, latest_image_key)

fetch() → GET /          → KV read → renderHtml()
       → GET /api/latest → KV read → JSON
       → GET /images/:key → R2 passthrough
       → GET /robots.txt | /sitemap.xml | /llms.txt → SEO/GEO routes
       → POST /webhook   → auth check → KV write (manual override)
       → GET /mcp        → MCP server (BuckitMCP WorkerEntrypoint)
       → *               → 404
```

## Data Model

Predictions store both fuel types. Either may be `null`:

```json
{
  "gas":    { "direction": "up|down|no-change|null", "adjustment": 3.6, "price": 1.621 },
  "diesel": { "direction": "up|down|no-change|null", "adjustment": 0.7, "price": 1.544 },
  "notes": "May be +/- 0.1",
  "source": "reddit|webhook",
  "post_id": "1q7msj6",
  "updated_at": "2026-02-21T14:00:00.000Z"
}
```

## Reddit Post Format

/u/buckit uses a **markdown table** (since ~2024). Prices are in **cents** (162.1 = $1.621/L):

```
|Type|Adjustment|New Min Price|
:--|:--|:--|
|Regular| UP 3.6 |162.1|
|Diesel| DOWN 0.7 |154.4|
```

A free-text fallback handles older posts. The look-back window is **7 days** (not 24h) to catch interrupter clause posts on any weekday. Author match is case-insensitive (`buckit` or `Buckit`).

## File Map

| File | Purpose |
|------|---------|
| `src/index.js` | Worker: fetch handler, scheduled handler, all utilities |
| `mcp/server.js` | MCP server (workers-mcp + WorkerEntrypoint) |
| `test/index.test.js` | 100% coverage — all routes, cron, utilities |
| `test/mcp.test.js` | MCP tool tests |
| `test/fixtures/` | Sample Reddit post + parsed prediction JSON |
| `wrangler.toml` | Worker config — KV, R2, AI bindings, cron triggers |
| `Taskfile.yml` | All developer tasks |
| `vitest.config.js` | Vitest + @cloudflare/vitest-pool-workers config |
| `docs/` | Source-of-truth markdown docs (synced into vitepress/ at CI time) |
| `docs/buckit-access.md` | Plain-English guide for u/buckit to post manual updates |
| `vitepress/` | VitePress site config + index.md only — docs synced from docs/ at CI |
| `.github/workflows/` | ci.yml, deploy.yml, docs.yml |
| `TODO.md` | Future ideas and backlog (also published in the docs site) |

## Critical Constraints

- **Plain JavaScript only** — no TypeScript, no build step, no bundler
- **No npm runtime dependencies** beyond `workers-mcp` and `@modelcontextprotocol/sdk`
- **Free tier only** — Workers AI, KV, R2 all on Cloudflare free tier. No paid external APIs.
- **`cache-control: no-store`** on all HTML responses
- **100% test coverage** enforced via Vitest coverage thresholds — PRs blocked if coverage drops
- **Conventional Commits** enforced via commitlint (Husky commit-msg hook)

## Secret Handling

- `WEBHOOK_SECRET` — stored as Cloudflare Worker secret (`task secret`)
- Local dev: `.dev.vars` (gitignored — never commit)
- Never hardcode secrets. Never log secrets. Never commit `.dev.vars`.

## Privacy Rules (non-negotiable)

- No personal information, real names, addresses, or contact details anywhere in code, comments, commits, or documentation
- The only identifier used is: `program-the-brain-not-the-heartbeat`
- WHOIS privacy must be enabled on the domain (handled at Cloudflare Registrar)

## MCP Server

Uses `workers-mcp` + `WorkerEntrypoint` + `ProxyToSelf` pattern.
Auth model: read tools (`get_*`) are public; write/trigger tools require `WEBHOOK_SECRET`.
Future: webmcp (webmcp.dev) migration planned when Cloudflare Workers support matures — see `docs/mcp.md`.

## Code Style

- Readability over cleverness
- Prefer `const` over `let`; never use `var`
- Strict equality (`===`) always
- No unused variables
- Single quotes for strings
- Trailing commas in multi-line structures
- 100-char print width

## Testing Conventions

- Tests live in `test/` — never inline in source
- Mock `global.fetch` using `vi.fn()` for Reddit fetch tests
- Test fixtures in `test/fixtures/` — update them if the Reddit post format changes
- Use `envWithAI()` helper in scheduled() tests to mock `env.AI` and `env.IMAGES`
- Coverage gate: 100% lines, functions, branches, statements (enforced in CI)
- Note: `--coverage` flag fails in vitest-pool-workers (node:inspector/promises missing) — run `npx vitest run` without it for full test results
