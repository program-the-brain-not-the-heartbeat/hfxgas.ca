# Buckit

> Halifax gas price prediction display — powered by Cloudflare Workers.

[![CI](https://github.com/program-the-brain-not-the-heartbeat/hfxgas.ca/actions/workflows/ci.yml/badge.svg)](https://github.com/program-the-brain-not-the-heartbeat/hfxgas.ca/actions/workflows/ci.yml)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Cloudflare Workers](https://img.shields.io/badge/runs%20on-Cloudflare%20Workers-orange.svg)](https://workers.cloudflare.com/)

Live site: **[hfxgas.ca](https://hfxgas.ca)**

---

## What It Does

Every Thursday (and on interrupter clause days), /u/buckit posts Halifax fuel price predictions to r/halifax. Buckit automatically:

1. Detects the post via a Cloudflare cron trigger (4 windows on Thursdays; 7-day window catches interrupter clauses any day)
2. Parses both **regular gas and diesel** predictions from the markdown table — direction, price delta, and new minimum price
3. Generates a contextual AI meme image (Workers AI — free tier) when direction is up or down
4. Displays everything on a display-signage-style website with side-by-side fuel cards and a Chart.js history chart

**Zero manual intervention required after initial deployment.**

---

## Architecture

```
Cloudflare Cron (Thu ×4)
        │
        ▼
Reddit r/halifax/new.json
        │
        ▼
  Detect /u/buckit post
        │
        ├─▶ parseRedditPost() → { gas, diesel, notes } (markdown table + free-text fallback)
        │
        ├─▶ Workers AI (@cf/black-forest-labs/flux-1-schnell)
        │         │
        │         └─▶ R2 bucket (images/{post_id}.png)
        │
        └─▶ KV (latest_prediction, prediction_history, latest_image_key)
                  │
                  ▼
           GET / → renderHtml() → display-signage website
```

Full architecture: [docs/architecture.md](docs/architecture.md)

---

## Quick Start (Deploy Your Own)

```sh
# 1. Clone
git clone https://github.com/program-the-brain-not-the-heartbeat/hfxgas.ca
cd buckit

# 2. Install
task setup

# 3. Create Cloudflare resources (run once)
task kv:create   # Note the namespace ID — paste it into wrangler.toml
task r2:create
task secret      # Enter your WEBHOOK_SECRET when prompted

# 4. Deploy
task deploy
```

Non-technical? See [docs/run-your-own.md](docs/run-your-own.md).

---

## Developer Commands

All interactions go through `task`. No npm scripts.

| Command | Description |
|---------|-------------|
| `task setup` | First-time install + git hooks |
| `task dev` | Local dev server |
| `task dev:cron` | Test cron handler locally |
| `task test` | Run tests with coverage |
| `task check` | Lint + format check + test (CI gate) |
| `task deploy` | Deploy (runs check first) |
| `task logs` | Stream live Worker logs |
| `task refresh` | Force redeploy (emergency) |
| `task refresh:full` | Checks + redeploy |
| `task kv:clear` | Clear KV data (destructive) |
| `task docs:dev` | VitePress docs dev server |

---

## Operations & Manual Overrides

### Force a Reddit scan right now

The cron runs automatically on Thursdays, but you can trigger a scan manually at any time via the MCP `trigger_reddit_scan` tool:

```sh
curl -s -X POST https://hfxgas.ca/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "method": "tools/call",
    "params": {
      "name": "trigger_reddit_scan",
      "arguments": { "secret": "YOUR_WEBHOOK_SECRET" }
    }
  }' | jq .
```

This runs the full cron pipeline live: fetches r/halifax, looks for a /u/buckit post, parses it, generates an AI image, and writes to KV — identical to what happens on Thursday.

> **Note:** If /u/buckit hasn't posted yet, it returns `{ ok: true }` silently (no post found). Check `task logs` to see the output.

Or via the Taskfile (set `WEBHOOK_SECRET` in your environment first):

```sh
WEBHOOK_SECRET=your_secret task scan
```

### Manually post a prediction (webhook override)

Use this when the cron missed a post, Reddit was down, or you need to correct a wrong prediction:

```sh
curl -s -X POST https://hfxgas.ca/webhook \
  -H "Authorization: Bearer YOUR_WEBHOOK_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "gas":    { "direction": "up",   "adjustment": 3.6, "price": 1.621 },
    "diesel": { "direction": "down", "adjustment": 0.7, "price": 1.544 },
    "notes": "Optional context from the post."
  }' | jq .
```

Valid `direction` values: `"up"`, `"down"`, or `"no-change"`. Full schema and legacy single-fuel format in [docs/webhook.md](docs/webhook.md).

### Check current KV state

```sh
# What's live right now
curl -s https://hfxgas.ca/api/latest | jq .

# Last processed post ID (dedup key)
npx wrangler kv key get --binding PREDICTIONS last_processed_post_id

# Full prediction history
npx wrangler kv key get --binding PREDICTIONS prediction_history | jq .

# Which R2 image key is live
npx wrangler kv key get --binding PREDICTIONS latest_image_key
```

### Stream live logs

```sh
task logs
# or directly:
npx wrangler tail
```

Useful for watching cron runs in real time on Thursdays.

### Reset to empty state

```sh
task kv:clear
# Deletes: latest_prediction, prediction_history, latest_image_key, last_processed_post_id
```

---

## Troubleshooting

### Site shows "No prediction yet" after Thursday

1. **Check logs** — `task logs`, then trigger `task dev:cron` or use `task scan` to see what the cron finds
2. **Check if the post exists** — search r/halifax manually for /u/buckit's post
3. **Check the dedup key** — if `last_processed_post_id` matches the current post ID, the cron skipped it (already processed). Clear it: `npx wrangler kv key delete --binding PREDICTIONS last_processed_post_id`
4. **Force via webhook** — use the manual webhook override above with the real prices
5. **Check cron schedule** — cron windows are 12:00, 14:00, 16:00, 18:00 Halifax time (UTC−3/−4 depending on DST)

### Webhook returns 401

- Verify `WEBHOOK_SECRET` is set: `npx wrangler secret list`
- Re-set it if needed: `task secret`
- Make sure you're sending it as `Authorization: Bearer <secret>` (with the `Bearer ` prefix)

### Webhook returns 400

- `predicted_price` must be a number (e.g. `175.9`), not a string (`"175.9"`)
- `direction` must be `"up"`, `"down"`, or `"no-change"` (lowercase)
- `fuel_type` must be `"gas"` or `"diesel"` if provided

### AI image not appearing

- Images are only generated by the Thursday cron — the webhook override does **not** generate images
- Check R2: `npx wrangler r2 object list buckit-images`
- If the AI call failed, the prediction still saves but `latest_image_key` is null — site shows just the price board

### Cron isn't firing

- Confirm it's deployed: `npx wrangler deployments list`
- Check triggers in dashboard: Cloudflare → Workers & Pages → `buckit` → Triggers
- Expected schedules: `0 12/14/16/18 * * 4` (four windows every Thursday UTC)
- Test locally: `task dev:cron`

### Tests failing after code changes

```sh
task test          # run all 155 tests
task lint:fix      # auto-fix linting issues
task format        # auto-fix formatting
task check         # full CI gate (lint + format + test)
```

### Emergency deploy (skip checks)

```sh
task deploy:skip-checks
```

Use only if CI checks are broken and you need to push a critical fix.

---

## Testing a Live Deployment

The fastest way to verify everything works end-to-end is to POST a test prediction via the webhook — no need to wait for Thursday.

### Inject a test prediction

```sh
# Prices going UP (amber state)
curl -s -X POST https://hfxgas.ca/webhook \
  -H "Authorization: Bearer YOUR_WEBHOOK_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "gas":    { "direction": "up",   "adjustment": 3.6, "price": 1.621 },
    "diesel": { "direction": "down", "adjustment": 0.7, "price": 1.544 },
    "notes": "Crude oil up this week, expect a jump Thursday morning at the pumps."
  }' | jq .

# Prices going DOWN (green state)
curl -s -X POST https://hfxgas.ca/webhook \
  -H "Authorization: Bearer YOUR_WEBHOOK_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "gas":    { "direction": "down", "adjustment": 2.1, "price": 1.564 },
    "diesel": { "direction": "down", "adjustment": 1.5, "price": 1.525 },
    "notes": "Refinery margins improving, relief at the pump incoming."
  }' | jq .
```

Then open **[hfxgas.ca](https://hfxgas.ca)** to see the result.

> **Note:** The webhook does not trigger AI image generation — that only happens via the Thursday cron. Images appear automatically after the first real /u/buckit post is processed.

### Verify the API

```sh
curl -s https://hfxgas.ca/api/latest | jq .
curl -s https://hfxgas.ca/llms.txt
```

### Reset to empty state

```sh
npx wrangler kv key delete --binding PREDICTIONS latest_prediction
npx wrangler kv key delete --binding PREDICTIONS prediction_history
npx wrangler kv key delete --binding PREDICTIONS latest_image_key
```

### Test cron locally

```sh
task dev:cron   # triggers the scheduled handler against local miniflare
```

---

## API

### REST

```
GET /api/latest         → latest prediction as JSON (no auth)
GET /llms.txt           → LLM-friendly plain text summary (no auth)
POST /webhook           → manual override (WEBHOOK_SECRET required)
```

### MCP Server

```json
{
  "mcpServers": {
    "hfxgas": {
      "url": "https://hfxgas.ca/mcp"
    }
  }
}
```

Read tools (`get_latest_prediction`, `get_prediction_history`, `get_status`) require no auth.

Full MCP docs: [docs/mcp.md](docs/mcp.md)

---

## Tech Stack

| Layer | Tech |
|-------|------|
| Runtime | Cloudflare Workers (plain JavaScript) |
| Storage | Cloudflare KV + R2 |
| AI | Cloudflare Workers AI |
| MCP | workers-mcp (future: webmcp) |
| Testing | Vitest + @cloudflare/vitest-pool-workers |
| DX | Taskfile, ESLint, Prettier, Husky, commitlint |
| Docs | VitePress (GitHub Pages) |
| CI/CD | GitHub Actions |

**Cost: ~$0/month** (Cloudflare free tier). Domain ~$15 CAD/year.

---

## Documentation

- [Architecture](docs/architecture.md)
- [Deployment Guide](docs/deployment.md)
- [Development Setup](docs/development.md)
- [Webhook API](docs/webhook.md)
- [MCP Server](docs/mcp.md)
- [SEO & GEO](docs/seo.md)
- [Run Your Own](docs/run-your-own.md)
- [Project Timeline](docs/PROJECT_TIMELINE.md)

VitePress site: https://program-the-brain-not-the-heartbeat.github.io/buckit

---

## Legal

Prediction data is sourced from publicly available Reddit posts by /u/buckit on r/halifax. The author of this project has no affiliation with /u/buckit. No warranty of accuracy. Not financial advice. No support offered. No tracking.

See [DISCLAIMER.md](DISCLAIMER.md) for the full disclaimer.

Source code is MIT licensed — copyright `program-the-brain-not-the-heartbeat`. The license applies to the source code only, not to the prediction data.
