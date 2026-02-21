# ADR-003: Security headers on all responses via withSecurityHeaders()

**Status:** Accepted
**Date:** 2026-02-21
**Author:** program-the-brain-not-the-heartbeat

---

## Context

The Worker serves a public-facing website at hfxgas.ca. The initial implementation had no HTTP security headers beyond `cache-control`. A security audit identified several missing defence-in-depth headers that are standard practice for production web applications.

The headers to add:

| Header | Attack mitigated |
|--------|-----------------|
| `X-Content-Type-Options: nosniff` | MIME-type sniffing |
| `X-Frame-Options: DENY` | Clickjacking |
| `Referrer-Policy: strict-origin-when-cross-origin` | URL leakage via `Referer` header (especially important given the webhook secret was previously passable in URLs) |
| `Content-Security-Policy` | XSS, resource injection, framing |
| `Permissions-Policy` | Browser feature abuse (geolocation, camera, etc.) |

## Decision

Add a single `withSecurityHeaders(response)` utility function that wraps any `Response` and adds all security headers. Apply it at the **top of the `fetch()` handler** — one place, catches every route automatically.

```js
// In fetch():
let response;
if (pathname === '/') { response = await handleRoot(env); }
else if (...) { ... }
// ...
return withSecurityHeaders(response);
```

**CSP policy chosen:**

```
default-src 'self'
script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net
style-src 'self' 'unsafe-inline'
img-src 'self' data:
connect-src 'self'
frame-ancestors 'none'
object-src 'none'
base-uri 'self'
```

`'unsafe-inline'` is required for `script-src` and `style-src` because the HTML is rendered as a single-file response from a Worker (no separate script/style files). Extracting inline JS/CSS to separate files would require a build step, which contradicts [ADR-001](#)'s no-build-step constraint.

`frame-ancestors 'none'` duplicates `X-Frame-Options: DENY` for browsers that support CSP Level 2+.

## Consequences

**Positive:**
- Single point of application — no header can be accidentally omitted from a new route
- `withSecurityHeaders` is exported and unit-tested independently
- Blocks clickjacking, MIME sniffing, and most XSS vectors
- `frame-ancestors 'none'` is belt-and-suspenders alongside `X-Frame-Options`

**Negative / Trade-offs:**
- `'unsafe-inline'` in CSP weakens the XSS protection compared to a nonce-based or hash-based CSP. Acceptable trade-off given: (a) no user input is ever rendered unescaped, (b) all HTML is generated server-side from a trusted template with `escapeHtml()` on all dynamic values, (c) extracting inline JS would require a build step
- `Strict-Transport-Security` (HSTS) is not set by the Worker — Cloudflare enforces HTTPS at the edge automatically and sets HSTS on the domain itself. No action needed at the Worker layer.
