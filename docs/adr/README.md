# Architecture Decision Records

ADRs capture significant decisions made during the design and operation of Buckit — what was decided, why, and what trade-offs were accepted.

| ADR | Title | Status |
|-----|-------|--------|
| [001](./001-cloudflare-workers-platform.md) | Cloudflare Workers as the sole platform | Accepted |
| [002](./002-community-context-image-prompts.md) | Community-sourced context for AI image prompts | Accepted |
| [003](./003-security-headers.md) | Security headers on all responses via `withSecurityHeaders()` | Accepted |
| [004](./004-no-query-param-secrets.md) | Reject webhook secrets passed as query parameters | Accepted |
| [005](./005-deploy-gate-ci.md) | Deploy blocked by CI — lint, format, and tests must pass | Accepted |

## Format

Each ADR follows this structure:

- **Status** — `Proposed`, `Accepted`, `Deprecated`, or `Superseded by ADR-NNN`
- **Date** — When the decision was made
- **Context** — The problem or situation that required a decision
- **Decision** — What was decided and how it was implemented
- **Consequences** — The positive and negative outcomes of the decision
