# AGENTS.md — Buckit

Generic AI agent context (Copilot, Cursor, Gemini, etc.).

## Project

Buckit monitors r/halifax for /u/buckit's weekly gas price prediction posts, generates an AI meme image, and serves a display-signage website at hfxgas.ca. Runs on Cloudflare Workers (free tier only).

## Routes

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | / | No | Display website (HTML) |
| GET | /api/latest | No | Latest prediction as JSON |
| GET | /images/:key | No | AI-generated image from R2 |
| GET | /robots.txt | No | SEO: allow all crawlers |
| GET | /sitemap.xml | No | SEO: sitemap |
| GET | /llms.txt | No | GEO: LLM-friendly plain text |
| POST | /webhook | Yes | Manual prediction override |
| GET | /mcp | No | MCP server endpoint |
| * | * | — | 404 |

## Data Model

Predictions use a dual-fuel model. Both `gas` and `diesel` may be `null` if absent from the post:

```json
{
  "gas":    { "direction": "up|down|no-change|null", "adjustment": 3.6, "price": 1.621 },
  "diesel": { "direction": "up|down|no-change|null", "adjustment": 0.7, "price": 1.544 },
  "notes": "optional string",
  "source": "reddit|webhook",
  "post_id": "1q7msj6",
  "updated_at": "2026-02-21T14:00:00.000Z"
}
```

## Webhook Schema

`POST /webhook` with `Authorization: Bearer <WEBHOOK_SECRET>` or `?secret=<WEBHOOK_SECRET>`.

### New format (preferred)

```json
{
  "gas":    { "direction": "up|down|no-change", "adjustment": 3.6, "price": 1.621 },
  "diesel": { "direction": "up|down|no-change", "adjustment": 0.7, "price": 1.544 },
  "notes": "optional string"
}
```

### Legacy format (backward compatible)

```json
{
  "direction": "up|down|no-change",
  "predicted_price": 1.72,
  "current_price": 1.66,
  "fuel_type": "gas|diesel",
  "notes": "optional string"
}
```

## Post Format

/u/buckit posts a markdown table in the selftext:

```
|Type|Adjustment|New Min Price|
:--|:--|:--|
|Regular| UP 3.6 |162.1|
|Diesel| DOWN 0.7 |154.4|
```

Prices are in **cents** (162.1 → $1.621/L). `parseAdjustment()` handles `UP X.X`, `DOWN X.X`, `NO CHANGE`.

## MCP Tools

| Tool | Auth | Description |
|------|------|-------------|
| `get_latest_prediction` | None | Current prediction from KV |
| `get_prediction_history` | None | Last N predictions (max 10) |
| `get_status` | None | Health check: last run, image key, post ID |
| `post_prediction` | WEBHOOK_SECRET | Submit manual override |
| `trigger_reddit_scan` | WEBHOOK_SECRET | Trigger Reddit scan manually |

## Cron Schedule (Thursday — Halifax time)

- `0 12 * * 4` — 12:00 UTC (9:00 AM Halifax)
- `0 14 * * 4` — 14:00 UTC (11:00 AM Halifax)
- `0 16 * * 4` — 16:00 UTC (1:00 PM Halifax)
- `0 18 * * 4` — 18:00 UTC (3:00 PM Halifax)

**Interrupter clause:** The look-back window is 7 days (not 24 hours). Posts on any day of the week within the last 7 days are eligible. This handles NSUARB emergency mid-week rate adjustments.

## Storage

**KV (PREDICTIONS):** `latest_prediction`, `prediction_history`, `latest_image_key`, `last_processed_post_id`
**R2 (IMAGES):** `images/{post_id}.png`
**AI:** `@cf/black-forest-labs/flux-1-schnell` via `env.AI.run()` — only called for `up`/`down` directions (not `no-change`)

## Key Exports (src/index.js)

| Export | Description |
|--------|-------------|
| `escapeHtml(str)` | XSS-safe HTML escaping |
| `formatDate(iso)` | ISO → Halifax local time string |
| `formatRelativeTime(iso)` | ISO → "3 days ago" |
| `getSeason(date)` | UTC date → winter/spring/summer/fall |
| `buildImagePrompt(direction, postId, date)` | Weather-aware AI prompt |
| `parseAdjustment(adj)` | "UP 3.6" → `{direction, adjustment}` |
| `parseRedditPost(post)` | Reddit post → `{gas, diesel, notes}` |
| `buildChartData(history)` | History array → Chart.js dataset |
| `renderHtml({prediction, history, imageKey, siteUrl})` | Full HTML string |

## Contribution Rules

- PRs must have 100% test coverage (enforced via Vitest in CI)
- Tests required for every new route, utility, and MCP tool
- No secrets in code or commits — use `.dev.vars` locally, Cloudflare secrets in production
- Conventional Commits format enforced via commitlint
- Run `task check` before opening a PR
- Privacy: no personal information anywhere in codebase, comments, or commit messages

## Tech Stack

- **Runtime:** Cloudflare Workers (plain JavaScript, no TypeScript, no build step)
- **Storage:** Cloudflare KV + R2
- **AI:** Cloudflare Workers AI
- **MCP:** workers-mcp (future: webmcp)
- **Testing:** Vitest + @cloudflare/vitest-pool-workers
- **DX:** Taskfile, ESLint, Prettier, Husky, commitlint
- **Docs:** VitePress (GitHub Pages)
- **CI/CD:** GitHub Actions
