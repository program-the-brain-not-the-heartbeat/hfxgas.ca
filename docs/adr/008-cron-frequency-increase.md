# ADR-008: Poll every 15 minutes (5 on Thursdays), not hourly

**Status:** Accepted
**Date:** 2026-10-29
**Author:** program-the-brain-not-the-heartbeat

---

## Context

The cron ran hourly on the hour (`0 * * * *`). A new buckit post landing shortly after an
hourly run had to wait up to ~59 minutes before the site reflected it — observed directly: a
post published at 17:28 UTC wasn't picked up until the 18:00 run, 32 minutes later.

This was previously riskier to tighten: ADR-006's fix made failed Reddit fetches loud rather
than silent, but prod still falls back to the public RSS feed (shared Cloudflare egress IPs,
which Reddit 429-throttles) whenever `REDDIT_CLIENT_ID` isn't configured. Polling more often
without first fixing that would have meant hitting the throttled endpoint more often, making
the known failure mode worse. The installed-app OAuth support (getRedditToken's
`installed_client` grant, shipped same day) and setting `REDDIT_CLIENT_ID` in Cloudflare
removed that blocker: prod now authenticates per-client rather than sharing a rate limit
across all of Cloudflare's egress IPs.

## Decision

`crons = ["*/15 * * * *", "*/5 * * * 4"]` — every 15 minutes normally, every 5 minutes on
Thursdays (buckit's usual posting day; the two triggers overlap at the :00/:15/:30/:45 marks,
so Thursday is effectively just "every 5 minutes").

Detection lag is now at most ~15 minutes (≤5 on Thursdays), down from ≤59.

## Consequences

**Positive:**

- A new post is reflected on the site within minutes instead of up to an hour.
- Invocation volume (~96/day, 288 on Thursdays) stays trivially within the Workers free
  tier's 100,000 requests/day — see `docs/costs.md`.
- Image generation and KV writes are unaffected: both are gated by `last_processed_post_id`
  dedup in `scheduled()`, so extra polls that find nothing new do no extra work there.

**Negative / Trade-offs:**

- ~4–12x more Reddit fetch calls. Low risk now that the OAuth path is live (per-client rate
  limit, not shared-IP), but if `REDDIT_CLIENT_ID` is ever unset again, this cadence would
  throttle the public RSS fallback considerably faster than the old hourly schedule did.
- Slightly more Workers Logs volume (`[observability]` in `wrangler.toml` retains every
  invocation) — still negligible against free-tier limits.
