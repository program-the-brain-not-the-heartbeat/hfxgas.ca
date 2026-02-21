# ADR-001: Cloudflare Workers as the sole platform

**Status:** Accepted
**Date:** 2026-02-21
**Author:** program-the-brain-not-the-heartbeat

---

## Context

The project needs to run a scheduled Reddit scraper (weekly cron), serve a public website, expose a JSON API, and store prediction data and images — all without operational overhead and ideally at zero recurring cost beyond the domain name.

Options considered:

| Option | Pros | Cons |
|--------|------|------|
| **Cloudflare Workers** | Free tier generous; cron triggers built-in; global edge; KV + R2 + AI all bundled; zero cold-start | 128 MB memory limit; no persistent connections; JS only |
| **Vercel + Supabase** | Familiar DX; PostgreSQL | Requires database management; free tier limits per month |
| **AWS Lambda + S3** | Very flexible | Cold starts; billing complexity; ops overhead |
| **VPS (DigitalOcean, etc.)** | Full control | Monthly cost; requires uptime monitoring; sysadmin burden |

## Decision

Use **Cloudflare Workers exclusively** for all runtime concerns:

- `scheduled()` handler for the weekly cron (4 Thursday windows)
- `fetch()` handler for HTTP routes (GET /, POST /webhook, API, images)
- **KV** for prediction storage (low-read-frequency, small payloads — perfect fit)
- **R2** for image storage (object storage, zero egress costs)
- **Workers AI** for image generation (Flux 1 Schnell — no external API keys needed)
- **Workers MCP** for the Model Context Protocol server

## Consequences

**Positive:**
- Zero recurring infrastructure cost
- No servers to maintain, patch, or monitor
- Cron triggers are native — no external scheduler needed
- Global edge deployment by default
- All bindings (KV, R2, AI) are tightly integrated — no network hops between services

**Negative / Trade-offs:**
- 128 MB memory limit rules out large in-memory operations
- No persistent TCP connections (no WebSockets without Durable Objects)
- JavaScript only (no Python, Go, etc.) — acceptable given the scope
- Vendor lock-in to Cloudflare's platform
- Free tier `num_steps` cap on Workers AI image generation (mitigated by using `num_steps: 4`)
