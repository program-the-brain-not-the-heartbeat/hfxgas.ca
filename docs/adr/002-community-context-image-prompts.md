# ADR-002: Community-sourced context for AI image prompts

**Status:** Accepted
**Date:** 2026-02-21
**Author:** program-the-brain-not-the-heartbeat

---

## Context

The Worker generates a meme image every time gas or diesel prices change direction (up or down). The initial implementation used hardcoded season-based context strings (blizzards in winter, beach vibes in summer, etc.) to add "Halifax flavour" to the AI image prompt.

This approach was accurate in terms of locale but not in terms of relevance — the meme had no connection to what Halifax and Nova Scotia were actually talking about that week. The result was a technically correct but generically seasonal image.

## Decision

Replace season-based hardcoded context with **live community post titles** fetched from r/halifax and r/novascotia at cron time.

**Implementation:**

- New function `fetchCommunityContext(env)` runs in **parallel** with `fetchBuckitPost(env)` via `Promise.all`
- Fetches: `GET /r/halifax/top.json?t=week&limit=10` and `GET /r/novascotia/top.json?t=week&limit=10`
- Both fetches run concurrently via `Promise.allSettled` — if one subreddit is unavailable, the other's titles are still used
- Up to 20 titles (10 per subreddit), each truncated to 60 chars, joined with `; ` as the prompt context
- Prompt format: `"This week in Halifax and Nova Scotia: [title1]; [title2]; ..."`
- **Fallback:** if both fetches fail or return no titles, `buildImagePrompt` falls back to the existing season-based context (no behaviour change for empty context)

**Parameters chosen:**

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Time window | `t=week` (7 days) | Matches the gas price prediction cycle |
| Posts per subreddit | `limit=10` | Enough topical variety without exceeding prompt length |
| Max title length | 60 chars | Keeps the joined prompt manageable for the AI model |
| Total titles | ≤ 20 | Sufficient community context without bloat |

## Consequences

**Positive:**
- Meme images are genuinely topical — if there's a pothole crisis or ferry delay that week, that shows up in the image
- Community-rooted rather than algorithmically generic
- Gracefully degrades: one subreddit down → still works; both down → falls back to seasons

**Negative / Trade-offs:**
- Two additional Reddit API calls per cron run (3 total instead of 1)
- Reddit API may rate-limit or be temporarily unavailable — handled via `Promise.allSettled` and fallback
- Image content is now non-deterministic between runs for the same post ID (community context changes weekly)
- Slightly longer prompt may affect Flux 1 Schnell output quality marginally — acceptable trade-off
