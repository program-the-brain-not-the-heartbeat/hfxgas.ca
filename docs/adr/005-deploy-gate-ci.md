# ADR-005: Deploy blocked by CI — lint, format, and tests must pass

**Status:** Accepted
**Date:** 2026-02-21
**Author:** program-the-brain-not-the-heartbeat

---

## Context

The initial `deploy.yml` GitHub Actions workflow ran the deploy job independently of CI:

```yaml
jobs:
  deploy:
    needs: []  # Runs independently — CI is a separate job
```

This meant that a push to `main` would trigger both the CI workflow (`ci.yml`) and the deploy workflow (`deploy.yml`) in parallel. If CI failed (test failure, lint error, format violation), the deploy still succeeded — the broken code went to production while CI was still running.

## Decision

Move the check steps (lint, format, test) **into `deploy.yml`** as a prerequisite `check` job, and make the `deploy` job depend on it:

```yaml
jobs:
  check:
    name: Lint, Format, Test
    runs-on: ubuntu-latest
    steps:
      - ... (lint, format:check, vitest run)

  deploy:
    name: Deploy to Cloudflare Workers
    needs: [check]   # ← Deploy only if check passes
    steps:
      - ... (wrangler deploy)
```

The `ci.yml` workflow remains for PRs (it only runs on `pull_request` and `push` to `main`, providing feedback on branches before merge). The checks in `deploy.yml` are the definitive gate for production.

## Consequences

**Positive:**
- A broken commit cannot reach production — ever
- The deploy is an atomic operation: checks pass → deploy happens; checks fail → deploy is blocked
- Clear causal chain in the GitHub Actions UI: failed `check` job shows exactly which step failed before the deploy was attempted
- No external tool or process needed to enforce the gate — it's in the workflow itself

**Negative / Trade-offs:**
- Adds ~2–3 minutes to the deploy time (running checks before deploying)
- The checks run twice on a push to `main` — once in `ci.yml` (for PR/branch feedback) and once in `deploy.yml` (as the deploy gate). This is a small cost for the safety guarantee.
- `task deploy:skip-checks` remains available locally for true emergencies. There is no equivalent bypass in GitHub Actions — CI must pass.
