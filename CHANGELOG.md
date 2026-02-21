# Changelog

All notable changes to this project will be documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added
- Initial project scaffold
- Cloudflare Worker with `fetch()` and `scheduled()` handlers
- Reddit scraper: detects /u/buckit fuel price posts on r/halifax (case-insensitive author match, 7-day window for interrupter clauses)
- `parseAdjustment()`: parses "UP 3.6", "DOWN 0.7", "NO CHANGE" adjustment strings
- `parseRedditPost()`: markdown table parser (primary) + free-text fallback; returns `{gas, diesel, notes}` dual-fuel model
- Dual-fuel data model: both `gas` and `diesel` tracked independently with `direction`, `adjustment`, and `price`
- `direction` supports `"up"`, `"down"`, `"no-change"`, and `null`
- Workers AI image generation (`@cf/black-forest-labs/flux-1-schnell`) — only triggered for `up`/`down` directions
- KV storage: `latest_prediction`, `prediction_history`, `latest_image_key`, `last_processed_post_id`
- R2 storage for AI-generated images
- Display-signage-style website with shadcn design tokens, automatic dark mode
- Side-by-side REGULAR / DIESEL fuel cards: delta (e.g. `+3.6¢`) as hero, absolute price (`$1.621/L`) as secondary
- `buildChartData()`: prepares Chart.js datasets from history (gas = orange, diesel = blue)
- Chart.js 4 line chart (CDN) for price history with dual datasets
- History cards showing both fuel types with colour-coded arrows and deltas
- "No change" state: neutral grey `=` styling, no AI image generated
- `renderFuelCard()`: renders a single fuel card with direction, delta, price, aria-label
- "Developer? Prompter?" modal with REST API, MCP, and Docs tabs
- "About" footer link with site explanation modal
- MCP server at `/mcp` (workers-mcp) — public read tools, auth-gated write tools
- SEO: meta tags, OG, Twitter Card, JSON-LD, canonical
- GEO: `/llms.txt` per llmstxt.org spec
- Manual webhook override (`POST /webhook`) — accepts new dual-fuel format and legacy single-fuel format
- Taskfile DX interface (setup, dev, test, deploy, logs, refresh, etc.)
- ESLint + Prettier + Husky pre-commit + commitlint
- 155 tests passing (139 core + 16 MCP) — Vitest + @cloudflare/vitest-pool-workers
- WCAG 2.2 AA compliance (prefers-reduced-motion, color + symbol dual-coding, ARIA)
- GitHub Actions: CI, deploy, and VitePress docs workflows
- VitePress docs site
- CLAUDE.md, AGENTS.md, DISCLAIMER.md, MIT LICENSE
- Full documentation suite
