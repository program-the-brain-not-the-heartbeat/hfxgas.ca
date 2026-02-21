# Development Setup

## Requirements

- Node.js 20+
- [Task](https://taskfile.dev/) runner
- A Cloudflare account (free tier)

## Getting Started

```sh
git clone https://github.com/program-the-brain-not-the-heartbeat/hfxgas.ca
cd buckit
task setup
```

`task setup` installs dependencies and sets up the Husky git hooks.

## Local Development

### Start the Dev Server

```sh
task dev
```

Opens at `http://localhost:8787`. Hot-reloads on save.

Set up local secrets by creating `.dev.vars`:

```sh
# .dev.vars (gitignored — never commit this file)
WEBHOOK_SECRET=any-local-value
```

### Test the Cron Handler

```sh
task dev:cron
```

This starts Wrangler in test-scheduled mode, triggers the cron endpoint, and shows the output.

For Reddit scraping tests, use the fixtures in `test/fixtures/reddit-post.json`.

## Testing

```sh
task test           # Run all tests
task test:watch     # Watch mode
task test:ui        # Vitest UI in browser
```

Coverage is enforced at 100% (lines, functions, branches, statements). PRs with coverage below 100% will be blocked by CI.

> **Note:** `--coverage` flag is not supported with `@cloudflare/vitest-pool-workers` (missing `node:inspector/promises`). Run `npx vitest run` directly for full test output without coverage instrumentation.

## Code Quality

```sh
task lint           # ESLint
task lint:fix       # ESLint with auto-fix
task format         # Prettier write
task format:check   # Prettier check (what CI uses)
task check          # All three: lint + format:check + test
```

The pre-commit hook runs `lint` and `format:check` automatically.
The commit-msg hook enforces Conventional Commits via commitlint.

## Commit Format

```
type(scope): description

feat:     new feature
fix:      bug fix
docs:     documentation only
chore:    maintenance, deps, config
test:     adding or fixing tests
refactor: code change without behavior change
style:    formatting, no logic change
```

## Security Model

All responses pass through `withSecurityHeaders()` in the fetch handler. This adds:

| Header | Value |
|--------|-------|
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Content-Security-Policy` | `default-src 'self'`; frame-ancestors `'none'`; object-src `'none'`; etc. |
| `Permissions-Policy` | `geolocation=(), microphone=(), camera=(), payment=()` |

When adding new routes or response paths, ensure they flow through the fetch handler's `withSecurityHeaders()` wrap. Do not return `Response` objects directly from `fetch()` — assign to `response` and let the wrapper handle it.

Webhook authentication uses `Authorization: Bearer <token>` only. The `?secret=` query parameter is **explicitly rejected** with HTTP 400 — passing secrets in URLs leaks them into server logs, browser history, and `Referer` headers. See [ADR-004](./adr/004-no-query-param-secrets.md).

## CI / Deploy Gate

GitHub Actions `deploy.yml` runs lint + format + tests before deploying. A failing check blocks deployment — there is no bypass path. The `deploy:skip-checks` task is local-only for emergency use.

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `WEBHOOK_SECRET` | Auth secret for POST /webhook (Bearer token) | — |
| `SITE_URL` | Canonical site URL | `https://hfxgas.ca` |
| `REDDIT_USER_AGENT` | User-Agent for Reddit fetch | Buckit/1.0 |
| `REDDIT_AUTHOR` | Reddit author to monitor | `buckit` |
| `REDDIT_SUBREDDIT` | Subreddit to monitor | `halifax` |
| `MAX_HISTORY` | Max history entries in KV | `10` |

## Project Structure

```
src/index.js        Worker: all handlers + utilities
mcp/server.js       MCP server (BuckitMCP WorkerEntrypoint)
test/               Tests + fixtures
docs/               Documentation source (single source of truth)
docs/adr/           Architecture Decision Records
vitepress/          VitePress docs site (index.md + config only — rest synced from docs/)
.github/            Workflows + templates
Taskfile.yml        All developer tasks
wrangler.toml       Cloudflare config
```
