# Retrospective

---

## 2026-06-20 — Reddit API 403 Outage

### What happened

The site stopped updating on approximately **2026-05-29**. For 22 days, every hourly cron run silently found nothing to process. The root cause was that Reddit began returning `403 Forbidden` on all unauthenticated calls to their JSON API endpoints (`reddit.com/r/{sub}/new.json`, `reddit.com/r/{sub}/top.json`). The worker logged `Reddit fetch failed: 403` and returned early — but because the scheduled handler logs nothing to a user-visible surface and there were no alerts configured, the failure went undetected.

During this time, `/u/buckit` continued posting normally. At least one price change went unreported on the site.

### Why it wasn't caught sooner

- **No uptime monitoring.** There is no alert when the `latest_prediction.updated_at` timestamp goes stale. The only signal was a human noticing the date hadn't changed.
- **Silent failure mode.** The cron handler logs `no matching post found — done` both when Reddit has no matching post *and* when the fetch fails non-ok (it logs the error but returns without throwing). From the outside, the two look identical in behaviour.
- **No external canary.** The `/api/latest` endpoint returns whatever is in KV — including stale data — with a `200 OK`. There is nothing checking that the data is fresh.

### Root cause

Reddit deprecated unauthenticated access to their JSON API (`.json` endpoints) for automated clients. This was [announced and gradually rolled out](https://www.reddit.com/r/redditdev/comments/1g6cjht/) as part of Reddit's API monetization effort. The RSS/Atom feed (`new.rss`, `top.rss`) was not included in this restriction and remains publicly accessible.

### Fix applied

Migrated all Reddit fetches from the JSON API to the Atom RSS feed:

| Before | After |
|--------|-------|
| `GET /r/halifax/new.json?limit=100` | `GET /r/halifax/new.rss?limit=100` |
| `GET /r/novascotia/top.json?t=week&limit=10` | `GET /r/novascotia/top.rss?t=week&limit=10` |

The RSS feed encodes post content differently from the JSON API:
- Post body is HTML-entity-encoded inside `<content type="html">`
- The user-authored markdown (rendered to HTML) is wrapped in `<!-- SC_OFF -->...<div class="md">...</div><!-- SC_ON -->` markers
- Markdown tables are pre-rendered to HTML `<table>/<td>` elements
- Metadata (author, post ID, timestamp) is in standard Atom elements

New utilities added:
- `decodeHtmlEntities()` — decodes the double-encoding present in RSS content
- `parseRssEntries()` — converts Atom XML into the same post-object shape the rest of the code already expected
- `parseRedditPost()` gained a new HTML table strategy for the RSS-rendered table format

The fix required no changes to the cron logic, the KV schema, the data model, or any API contract — only the fetch and parse layer changed.

### What should be done to prevent this

1. **Add a freshness check to `/api/latest`** — if `updated_at` is older than N days, include a `stale: true` flag in the response so external monitors can detect it.
2. **Configure a simple uptime check** — a cron-triggered HTTP check (e.g. via Cloudflare Workers Cron Triggers + a separate monitoring Worker, or a free external service like UptimeRobot) that verifies `updated_at` is within the expected window and pages on failure.
3. **Log a distinct error code for fetch failures vs. no-post-found** — currently both look identical in the Worker logs unless you read carefully.

---

_Additional retrospective to be written when the project is declared complete._
