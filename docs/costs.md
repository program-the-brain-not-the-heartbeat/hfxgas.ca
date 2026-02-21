# Costs

Buckit is designed to run entirely on free tiers. The only hard cost is the domain.

## Domain

| Item | Registrar | Term | Cost |
|------|-----------|------|------|
| `hfxgas.ca` | Cloudflare Registrar | 3 years (2026–2029) | $26.88 CAD |

- Registered 2026-02-21, expires 2029-02-20
- WHOIS privacy enabled by default (Cloudflare Registrar)
- Renews at cost — no Cloudflare markup
- **Renewal reminder:** February 2029

## Cloudflare (Free Tier)

| Service | Usage | Free Limit | Cost |
|---------|-------|-----------|------|
| Workers | 1 cron/week + HTTP requests | 100,000 req/day | Free |
| Workers AI | 1 image/week (Flux 1 Schnell) | 10,000 neurons/day | Free |
| KV | ~4 keys, tiny payloads | 100,000 reads/day | Free |
| R2 | ~1 PNG/week (~100–200 KB each) | 10 GB storage, 1M Class B ops/month | Free |
| Domain routing | Custom domain on Worker | Included | Free |

## Workers AI: Model and Spend Details

Buckit uses **`@cf/black-forest-labs/flux-1-schnell`** — a 12-billion parameter text-to-image model by Black Forest Labs, running on Cloudflare's GPU infrastructure.

### Pricing (as of 2026-02-21)

| Metric | USD | Neurons |
|--------|-----|---------|
| Per 512×512 tile | $0.0000528 | 4.80 neurons |
| Per step | $0.0001056 | 9.60 neurons |

> Neurons are Cloudflare's unit of AI compute. Free tier: **10,000 neurons/day** at no charge.
> Paid tier: $0.011 per 1,000 neurons above the free daily allocation.

### Cost Per Image (Buckit usage)

Buckit calls the model with `num_steps: 4`. Output size defaults to 512×512 (1 tile).

| Component | Count | Neurons |
|-----------|-------|---------|
| Output tile (512×512) | 1 | 4.80 |
| Steps | 4 | 4 × 9.60 = 38.40 |
| **Total per image** | | **43.20 neurons** |

**Cost per image:** 43.20 neurons × ($0.011 / 1,000) = **~$0.000475 USD** (~0.05¢)

At the free tier limit of 10,000 neurons/day, a single image consumes **0.43% of the daily free budget** — meaning Buckit can generate ~231 images per day before hitting the free tier ceiling. One image per week is trivially within the free tier.

### Annual AI Cost Estimate

| Scenario | Images/year | Neurons/year | Cost |
|----------|-------------|--------------|------|
| Normal operation (1/week) | ~52 | ~2,246 | **$0 (free tier)** |
| Heavy use (1/day) | 365 | ~15,768 | ~$0.063 USD/year |

### Cumulative Spend

Since launch (2026-02-21):

| Period | Images generated | AI cost estimate |
|--------|-----------------|-----------------|
| Launch → March 2026 | TBD | TBD |

> This table will be updated as actual usage data is collected from the Cloudflare Workers AI dashboard.

## Total Recurring Cost

| Period | Cost |
|--------|------|
| Per year | ~$8.96 CAD (domain only) |
| Per month | ~$0.75 CAD |
| Per week | ~$0.17 CAD |

> Everything else is free. No servers, no databases, no paid APIs.

## Claude Code Development Costs

Buckit was built using [Claude Code](https://claude.ai/claude-code) (Anthropic). These are one-time development costs, not recurring.

### Model Used

| Model | Context window | Input pricing | Output pricing |
|-------|---------------|---------------|----------------|
| Claude Sonnet 4.5 / Claude Opus 4 | 200K tokens | ~$3–$15 / 1M tokens | ~$15–$75 / 1M tokens |

> Exact model versions varied across sessions. Claude Code selects the model automatically based on task complexity.

### Session Log

| Date | Session Description | Approx. cost |
|------|--------------------|----|
| 2026-02-21 | Initial project build: Worker, KV, R2, AI image generation, webhook, tests, MCP server, VitePress docs, CI/CD, domain setup | TBD |
| 2026-02-21 | Community context image prompts (r/halifax + r/novascotia top posts), security hardening (CSP headers, query param secret rejection, deploy gate), ADR documentation | TBD |

> **Note:** Exact token counts and costs were not captured during these sessions. Claude Code usage costs can be monitored via [console.anthropic.com](https://console.anthropic.com) → Usage. The sessions above represent the full project build from zero to production deployment.

### Estimate

A complex multi-session project build of this scope (Worker + tests + docs + CI) typically costs **$5–$25 USD** in API usage across all sessions. These are one-time development costs with no ongoing charge.

## Cost Monitoring

- **Workers AI usage**: [Cloudflare Dashboard → AI → Workers AI](https://dash.cloudflare.com/?to=/:account/ai/workers-ai)
- **KV reads/writes**: Cloudflare Dashboard → Workers & Pages → KV → Metrics
- **R2 storage**: Cloudflare Dashboard → R2 → buckit-images → Metrics
- **Domain renewal**: 2029-02-20 — set a calendar reminder 60 days before
- **Claude API usage**: [console.anthropic.com → Usage](https://console.anthropic.com)
