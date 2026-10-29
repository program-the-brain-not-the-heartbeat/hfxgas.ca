# ADR-007: Meme scene is built from the top community story, not always a gas station

**Status:** Accepted
**Date:** 2026-10-29
**Author:** program-the-brain-not-the-heartbeat

---

## Context

ADR-002 added live r/halifax + r/novascotia post titles to the image prompt, but only
as a flavour clause layered onto a scene that was _always_ "Irving Oil gas station,
[random NS street]". Gas price direction drove the setting; community context was
decoration on top of it. The result: whatever Halifax was actually talking about that
week (a building collapse, a storm, a local controversy) showed up as a half-sentence
aside in an image that still looked like a generic gas-station meme every time.

## Decision

Flip which input drives the **scene** and which drives the **mood**:

- When community context is available, the scene is built directly from the week's
  top story titles — the Irving Oil gas station setting is dropped (unless a top
  story happens to be about one). Gas price direction becomes mood/subtext only
  (`"Mood reflects gas prices going UP/DOWN this week: ..."`), appended after the scene.
- When community context is empty (both subreddit fetches failed), behavior is
  unchanged from ADR-002: season-based context with the Irving Oil gas station setting.
- `buildImagePrompt()` now uses only the **top 3** titles (was up to 20) for a sharper,
  more specific scene instead of a noisy blended one.
- `fetchCommunityContext()` now **interleaves** r/halifax and r/novascotia results by
  rank (halifax #1, novascotia #1, halifax #2, ...) instead of concatenating r/halifax's
  10 titles before r/novascotia's. Without this, taking the top 3 of a concatenated list
  would silently drop r/novascotia most weeks.

## Consequences

**Positive:**

- Meme images are now visually about what the community is actually discussing, not a
  gas station with a caption referencing it.
- Blending top 3 across both subreddits (not just r/halifax) keeps r/novascotia
  represented even though it's fetched second.

**Negative / Trade-offs:**

- No real cross-subreddit score comparison exists (RSS doesn't expose vote counts), so
  "top 3" is approximated as 2 from r/halifax + 1 from r/novascotia via interleaving,
  not a true combined ranking.
- Weeks with a serious/heavy top story (e.g. a tragedy) now shape the whole scene
  rather than being a muted background aside — acceptable given the model prompt still
  excludes anything but a "meme-worthy" composition instruction, but worth revisiting
  if a specific week's output reads as tasteless.
