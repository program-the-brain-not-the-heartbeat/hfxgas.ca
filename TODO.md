# TODO — Future Ideas

A scratchpad of potential improvements for Buckit. Not a roadmap — just ideas worth revisiting.

---

## Data & Analysis

- **Historical dataset export** — Expose a `/api/history` endpoint or GitHub-hosted CSV of all predictions over time. Useful for downstream analysis.
- **Prediction vs. actual accuracy tracking** — Every Thursday after u/buckit posts, the Worker could also scrape Friday's pump price (e.g. from GasBuddy or NS government releases) and store the delta. Over time: how accurate is buckit?
- **Accuracy leaderboard / stats page** — A simple `/stats` page showing mean absolute error, hit rate (within ±0.1¢), longest streak of correct direction.
- **Diesel-only history** — Currently diesel is stored but underweighted in UX. A dedicated diesel chart or trend view.
- **Price trend analysis** — Simple linear regression over the last N weeks displayed on the chart. Are prices trending up or down overall?
- **Seasonal patterns** — Annotate the history chart with Nova Scotia winter/summer fuel tax changes.
- **Dataset on GitHub** — Auto-commit a `data/predictions.csv` to the repo every week via a GitHub Actions step triggered from the Worker (via webhook → dispatch).

---

## Features

- **Email / push notification on prediction** — Optional opt-in (no server-side storage needed; use a mailto: link or Cloudflare Email Workers).
- **"Remind me Thursday" ICS calendar link** — A `/reminder.ics` route returning a recurring Thursday event.
- **RSS / Atom feed** — `/feed.xml` with one entry per prediction. Dead-simple to implement.
- **Image alt-text improvement** — Currently AI-generated images have generic alt text. Could derive something more descriptive from the direction + adjustment.
- **Multi-region support** — The architecture could monitor multiple subreddits (r/novascotia, r/halifax) simultaneously. Already partially supported via `REDDIT_SUBREDDIT` env var.
- **Dark mode chart colors** — The Chart.js chart uses fixed `hsl()` colors. Could listen to `matchMedia` changes and update datasets dynamically.
- **History pagination** — If `MAX_HISTORY` is large, the homepage can get long. A "Show more" button or infinite scroll.

---

## Developer / Ops

- **Wrangler v4 upgrade** — Currently pinned to v3.114.17. v4 has `--remote` flag support and improved logging. Upgrade when stable.
- **AI image prompt refinement** — The current prompt is basic. Could incorporate Halifax weather (via a free weather API), season, or current price level for richer memes.
- **Image caching headers** — R2 images are served without `Cache-Control`. Adding `max-age=31536000, immutable` (keyed by post ID) would improve CDN performance.
- **Structured logging** — Replace `console.log/error` with a lightweight structured logger emitting JSON. Easier to query in Cloudflare's log tail.
- **Health endpoint** — `GET /health` returning Worker version, last scan time, KV key count — useful for uptime monitoring.
- **Alerting on missed Thursday scan** — If no prediction is written by Friday 00:00 AST, send an alert (Cloudflare Email Workers → your email).
- **Playwright visual regression tests** — Snapshot the homepage HTML on each PR to catch unintended UI changes.
- **`task kv:dump`** — A task that exports all KV data to a local JSON file for backup / inspection.

---

## Access for /u/buckit

> See `docs/webhook.md` for the full API reference and `docs/buckit-access.md` for a plain-English guide.

- **One-click update shortcut** — A simple `task buckit:update` that prompts for the week's numbers and POSTs to the webhook. No coding required for u/buckit if they have Node + wrangler installed.
- **Slack / Discord bot** — u/buckit could post to a channel; a bot could parse and call the webhook automatically.
- **Reddit bot** — Monitor u/buckit's post via Reddit's push API (instead of polling) and update immediately on post detection.
- **Manual image regeneration** — An MCP `regenerate_image` tool (auth-gated) to request a fresh AI image without re-submitting a prediction.

---

## Domain / Infrastructure

- **hfxgas.ca renewal reminder** — Domain registered 2026-02-21, expires 2029-02-20. Renewal cost: ~$30.64 USD. Set a calendar reminder for January 2029.
- **Cloudflare Zero Trust access** — Optionally gate the `/webhook` route behind Cloudflare Access for an extra auth layer beyond the `WEBHOOK_SECRET`.
- **Multiple Worker environments** — A `staging` Worker pointed at a separate KV namespace for safely testing changes before production.
- **Automated costs report** — Track and log free-tier usage (KV reads/writes, R2 storage, AI inferences) monthly to detect if we're approaching limits.

---

## Documentation

- **Video walkthrough** — A short screen recording of the full data flow (Reddit post → cron → parse → KV → homepage) would help contributors onboard faster.
- **Contribution guide improvements** — Add a "good first issue" label to GitHub issues; document how to add a new route end-to-end.
