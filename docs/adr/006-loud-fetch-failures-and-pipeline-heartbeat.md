# ADR-006: Fail loudly on Reddit fetch errors, and measure pipeline health separately from data age

**Status:** Accepted
**Date:** 2026-09-11
**Author:** program-the-brain-not-the-heartbeat

---

## Context

On 2026-09-11, u/buckit posted an interrupter-clause update to r/halifax at 17:18 UTC. The
site did not pick it up. Three hours later it was still showing the previous week's numbers,
and nothing anywhere reported a problem.

Investigation ruled out the obvious suspects. Running the real `parseRssEntries`,
`fetchBuckitPost` predicate and `parseRedditPost` against the live feed showed the post was
present, matched every gate (author, `interrupter` keyword, recency), and parsed correctly.
Cloudflare analytics showed the cron firing every hour with **zero errors and zero
exceptions**. Yet no KV write occurred.

A live `wrangler tail` caught the actual cause:

```
"0 * * * *" @ 2026-09-11, 6:00:42 p.m. - Ok
  (log) Cron: starting Reddit scan
  (error) Reddit fetch failed: 429
  (log) Cron: no matching post found — done
```

Reddit was rate-limiting the Worker (the public RSS feed is fetched from Cloudflare's shared
egress IPs), and the code reported it as _"no matching post found"_. The invocation was
recorded as `Ok`.

Three compounding design problems:

1. **Failure was indistinguishable from absence.** `fetchRedditFeed()` returned `null` on any
   non-OK response; `fetchListing()` and `fetchBuckitPost()` propagated `null`; `scheduled()`
   treated `null` as "buckit hasn't posted" and returned normally. A throttled Reddit and a
   quiet week produced byte-identical behaviour.
2. **Nothing was retained to diagnose after the fact.** `wrangler.toml` had no
   `[observability]` block, so the only way to observe the failure was a live tail running at
   the top of the hour.
3. **There was no signal that could have caught it.** The obvious candidate — the age of
   `latest_prediction.updated_at` — cannot work. That timestamp only moves when a _new post is
   found_, so it conflates "buckit hasn't posted" (normal for up to 7 days) with "the scraper
   is dead" (an outage). During this incident the data was only 21h old while the fetch had
   been failing far longer.

A separate latent bug surfaced during the same investigation: an interrupter-clause post often
lists only the fuel that moved. `scheduled()` wrote `parsed.gas` / `parsed.diesel` straight
into the record, so a diesel-only post would **blank the known gas price**.

## Decision

**1. A failed fetch throws; it is never a silent `null`.**

`fetchRedditFeed()` now returns a `Response` or throws `RedditFetchError`. `fetchListing()`
catches only around the _authenticated_ attempt, preserving the documented OAuth-to-RSS
fallback; a public-feed failure propagates to `scheduled()`, whose pre-existing (and until now
unreachable) `catch` branch logs `Cron: Reddit fetch error:`. Removing the `null` contract made
the `if (!posts) return null` guard in `fetchBuckitPost()` unreachable, and it was deleted.

**2. Pipeline health is measured separately from data age.**

Two independent signals, two thresholds:

| Signal           | Source                         | Threshold                         | Answers                |
| ---------------- | ------------------------------ | --------------------------------- | ---------------------- |
| `stale`          | `latest_prediction.updated_at` | `STALE_AFTER_HOURS` = 8 days      | Are these numbers old? |
| `pipeline_stale` | `last_successful_check`        | `PIPELINE_STALE_AFTER_HOURS` = 3h | Is the scraper alive?  |

`last_successful_check` is written on **every** successful fetch, whether or not a new post was
found — that is what makes it a heartbeat rather than a change log. Both are exposed on
`/api/latest` alongside `age_hours`, and the page marks an aged-out reading visibly rather than
presenting it with the same confidence as fresh data.

The 8-day data-age bound is deliberately set _past_ the weekly posting cadence. buckit posts
each Thursday and those prices remain correct through the following Wednesday, so a tighter
bound (48h was considered) would mark correct data stale roughly five days out of every seven.

**3. Workers Logs are retained.** `[observability] enabled = true`, `head_sampling_rate = 1`.
The Worker runs hourly plus light site traffic, so volume is negligible.

**4. A partial post merges rather than replaces.** `scheduled()` now carries the previous
reading forward for any fuel the post does not mention.

**5. Feed depth is reported.** The listing is capped at 100 posts, so the real bound on the
look-back is feed depth, not `LOOK_BACK_DAYS`. When the feed cannot reach back as far as the
window claims, that is logged rather than silently under-scanning.

## Consequences

**Positive:**

- A rate-limit outage is now visible three ways: a distinct error log, a retained log record,
  and `pipeline_stale` on the public API.
- The heartbeat would have caught this incident by ~02:00 rather than going unnoticed for hours.
- An interrupter-clause post can no longer destroy a price it did not mention.
- The two thresholds are named constants with the reasoning recorded next to them.

**Negative / Trade-offs:**

- `scheduled()` now performs one extra KV read (previous prediction) and one extra KV write
  (heartbeat) per run. At hourly cadence this is immaterial against free-tier limits.
- A carried-forward fuel reading is presented without distinguishing it from a freshly parsed
  one. Showing the last known price is better than showing none, but the record does not encode
  which half came from the current post.
- `pipeline_stale` is exposed but nothing yet _acts_ on it — there is no alerting. It makes the
  failure observable, not self-healing.
- None of this addresses the underlying 429. Authenticating to Reddit (per-client rate limits
  rather than per-IP) remains the actual fix for the root cause.
