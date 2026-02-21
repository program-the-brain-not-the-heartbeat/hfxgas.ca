# GitHub Copilot Instructions

See [AGENTS.md](../AGENTS.md) for full project context.

## Key Points

- **Plain JavaScript only** — no TypeScript, no build step
- **All developer tasks via `task`** — not npm scripts
- **100% test coverage required** — Vitest + @cloudflare/vitest-pool-workers
- **Conventional Commits** enforced (feat:, fix:, docs:, chore:, test:, refactor:)
- **No personal information** anywhere in code, comments, or commits
- **No paid APIs** — Workers AI free tier only
- **Readability over cleverness** — prefer simple, explicit code

## Route Table

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | / | No | Display website |
| GET | /api/latest | No | JSON prediction |
| GET | /images/:key | No | R2 image |
| GET | /robots.txt | No | SEO |
| GET | /sitemap.xml | No | SEO |
| GET | /llms.txt | No | GEO |
| POST | /webhook | Yes | Manual override |
| GET | /mcp | No | MCP server |

## File Map

| File | Purpose |
|------|---------|
| `src/index.js` | All Worker logic |
| `mcp/server.js` | MCP server (workers-mcp) |
| `test/index.test.js` | Full test suite |
| `test/mcp.test.js` | MCP tests |
| `wrangler.toml` | Cloudflare config |
| `Taskfile.yml` | DX tasks |
