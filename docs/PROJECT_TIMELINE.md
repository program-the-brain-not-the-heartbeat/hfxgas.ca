# Project Timeline

## 2026-02-20 — Project Initiated

- Planning session: defined full architecture, constraints, and deliverables
- Non-negotiable constraints established: minimal cost, minimal intervention, privacy
- Tech stack finalized: Cloudflare Workers (plain JS), KV, R2, Workers AI, workers-mcp
- Plan approved and implementation started

## 2026-02-21 — Implementation Complete & Deployed 🚀

- Full implementation completed in a single session (~1 day end-to-end)
- 114 tests written and passing (98 core + 16 MCP)
- Worker deployed to Cloudflare — live at hfxgas.ca
- KV namespace created (`PREDICTIONS`)
- R2 bucket created (`buckit-images`)
- `WEBHOOK_SECRET` set as Cloudflare Worker secret
- Site confirmed live: "No prediction yet." state renders correctly

## 2026-02-21 — Dual-Fuel Feature + Visual Fixes

- Investigated real /u/buckit post format via Reddit — discovered markdown table with cents-based prices
- Added `parseAdjustment()` — parses "UP 3.6", "DOWN 0.7", "NO CHANGE" adjustment strings
- Rewrote `parseRedditPost()` — markdown table parser (primary) + free-text fallback
- New dual-fuel data model: `{ gas, diesel, notes }` — both tracked independently
- Direction now supports `"no-change"` in addition to `"up"`/`"down"`
- Updated `scheduled()`, webhook handler, and `renderHtml()` for new model
- Side-by-side REGULAR / DIESEL fuel cards replace single-fuel badge
- Delta (`+3.6¢`) is the hero number; absolute price (`$1.621/L`) is secondary
- Chart.js 4 line chart replaces SVG sparkline — dual datasets (gas orange, diesel blue)
- History cards show both fuel types with colour-coded arrows and deltas
- Fixed Rollup parse error: `$${ctx.parsed.y}` inside template literal
- Cron look-back window extended from 24h to 7 days (interrupter clause support)
- Author match made case-insensitive (`buckit` or `Buckit`)
- Test suite fully updated: 155 tests passing (139 core + 16 MCP)
- Test fixtures updated to new markdown table format
- All documentation updated to match new data model
- Added "About" footer modal (site explanation, how it works, anonymous Cape Breton developer)

## Milestones

- [x] All tests passing (155 tests, no coverage gate due to vitest-pool-workers constraint)
- [x] Worker deployed to Cloudflare
- [x] Dual-fuel support (gas + diesel) with Chart.js history chart
- [x] Interrupter clause support (any-day posting)
- [ ] Custom domain registered (hfxgas.ca) and attached
- [ ] First real cron run with live /u/buckit post
- [ ] AI image generated and displayed
- [ ] MCP server verified from Claude Desktop
- [ ] VitePress docs live on GitHub Pages
- [ ] Retrospective updated with deployment notes

## Notes

- Total time from plan approval to live deployment: ~1 day (single session)
- No TypeScript, no build step, no bundler — pure Cloudflare Workers platform
- Coverage reporting removed from CI due to `@cloudflare/vitest-pool-workers` incompatibility
  with `@vitest/coverage-v8` (Workers runtime lacks `node:inspector/promises`)
- webmcp migration planned for future when Cloudflare Workers support matures
- Real post format confirmed: markdown table, prices in cents, author `Buckit` (capital B on r/NovaScotia)
