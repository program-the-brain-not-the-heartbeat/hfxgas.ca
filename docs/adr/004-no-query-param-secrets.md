# ADR-004: Reject webhook secrets passed as query parameters

**Status:** Accepted
**Date:** 2026-02-21
**Author:** program-the-brain-not-the-heartbeat

---

## Context

The initial webhook implementation accepted the `WEBHOOK_SECRET` in two ways:

1. `Authorization: Bearer <token>` header (documented as "preferred")
2. `?secret=<token>` query parameter (documented as an alternative)

The query parameter method was added for convenience (easier to test in a browser or with simple curl invocations). However, secrets in query parameters are a well-known security anti-pattern:

**Where `?secret=` leaks:**
- **Server access logs** — Cloudflare logs all request URLs by default. The secret appears in plain text.
- **Browser history** — Any bookmark or history entry for a URL with `?secret=` stores the secret.
- **`Referer` header** — If the page with `?secret=` in the URL links to any external resource, the browser sends the full URL as `Referer`.
- **Proxy / CDN logs** — Any intermediary that logs URLs sees the secret.
- **Clipboard / screenshots** — Developers sharing URLs inadvertently share secrets.

This is directly relevant to Buckit because:
- The `Referrer-Policy` header was also missing initially (ADR-003), meaning any external link from a page loaded with `?secret=` would leak the secret
- Cloudflare access logs are visible to anyone with dashboard access

## Decision

**Reject `?secret=` query parameter requests with HTTP 400**, rather than silently accepting them or merely deprecating the behaviour.

```js
if (url.searchParams.has('secret')) {
  console.warn('Webhook: rejected ?secret= query param — use Authorization: Bearer <token>');
  return new Response(
    JSON.stringify({ error: 'Use Authorization: Bearer header, not ?secret= query param' }),
    { status: 400, headers: { 'content-type': 'application/json' } }
  );
}
```

The error message is explicit and actionable — it tells the caller exactly what to do instead.

**Accepted authentication:**

```sh
curl -X POST https://hfxgas.ca/webhook \
  -H "Authorization: Bearer YOUR_SECRET" \
  -H "Content-Type: application/json" \
  -d '...'
```

All existing integrations (task shortcuts, MCP tools, curl examples in docs) already used Bearer tokens. No backwards-compatible callers were broken.

## Consequences

**Positive:**
- Eliminates a well-known secret leakage vector
- Explicit 400 with clear error message is better than silent rejection or deprecation warning
- Consistent with standard API security practice (OAuth 2.0, GitHub API, etc.)
- The `Referrer-Policy` header (ADR-003) adds defence-in-depth even if secrets are passed in other URL contexts

**Negative / Trade-offs:**
- Any caller using `?secret=` will now receive a 400 instead of a 200. This is intentional and desirable — it forces the caller to fix their implementation.
- Slightly less convenient for quick manual testing in a browser URL bar. Mitigation: use curl or the `task buckit:gas` / `task buckit:diesel` shortcuts.
