# Deployment Guide

## Prerequisites

- [Cloudflare account](https://dash.cloudflare.com/) (free tier is sufficient)
- [Node.js 20+](https://nodejs.org/)
- [Task](https://taskfile.dev/) (`npm install -g @go-task/cli`)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) (installed via `task setup`)

## First-Time Setup

### 1. Clone and Install

```sh
git clone https://github.com/program-the-brain-not-the-heartbeat/hfxgas.ca
cd buckit
task setup
```

### 2. Authenticate Wrangler

```sh
npx wrangler login
```

This opens a browser to authorize Wrangler with your Cloudflare account.

### 3. Create KV Namespace

```sh
task kv:create
```

Copy the namespace ID from the output and paste it into `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "PREDICTIONS"
id = "YOUR_NAMESPACE_ID_HERE"
preview_id = "YOUR_PREVIEW_NAMESPACE_ID_HERE"
```

### 4. Create R2 Bucket

```sh
task r2:create
```

The bucket name `buckit-images` is already configured in `wrangler.toml`.

### 5. Set the Webhook Secret

```sh
task secret
```

Enter a long, random string when prompted. This is your `WEBHOOK_SECRET` — store it securely (e.g. in a password manager). You'll need it to use `POST /webhook` and MCP write tools.

### 6. Configure Reddit OAuth (Optional)

For an installed Reddit app, set the client ID and leave `REDDIT_CLIENT_SECRET` unset:

```sh
npx wrangler secret put REDDIT_CLIENT_ID
```

If switching from a web/script app, remove its existing secret:

```sh
npx wrangler secret delete REDDIT_CLIENT_SECRET
```

The Worker uses the `installed_client` grant with an empty Basic Auth password and
`device_id=DO_NOT_TRACK_THIS_DEVICE`. Web/script apps remain supported: set both
`REDDIT_CLIENT_ID` and `REDDIT_CLIENT_SECRET` to use `client_credentials` instead.
Without a client ID, or if OAuth fails, the Worker falls back to Reddit RSS.

For local development, set `REDDIT_CLIENT_ID` in `.dev.vars` and omit the secret
for installed apps. Configure a descriptive `REDDIT_USER_AGENT` identifying your
app and Reddit username; keep personal configuration out of commits.

### 7. Deploy

```sh
task deploy
```

This runs `task check` first (lint + format + tests), then deploys.

Your Worker is now live at `https://buckit.<your-account>.workers.dev`.

### 7. Custom Domain (Optional)

1. Register `hfxgas.ca` (or your preferred domain) via [Cloudflare Registrar](https://www.cloudflare.com/products/registrar/) with **WHOIS privacy enabled**
2. In the Cloudflare dashboard: Workers & Pages → buckit → Settings → Custom Domains
3. Add your domain

Update `SITE_URL` in `wrangler.toml` to match your custom domain.

## GitHub Actions Auto-Deploy

The `deploy.yml` workflow deploys automatically on every push to `main` — **but only after all checks pass**.

The deploy job runs lint, format check, and the full test suite before deploying. If any check fails, the deploy is blocked. A broken commit cannot reach production.

Add these secrets to your GitHub repository (Settings → Secrets → Actions):

| Secret | Value |
|--------|-------|
| `CLOUDFLARE_API_TOKEN` | A Cloudflare API token with "Edit Cloudflare Workers" permission |
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account ID (from the dashboard URL) |

## Verifying Deployment

```sh
task logs   # Stream live Worker logs
```

Then visit your Worker URL. The site should show "No prediction yet." until the first Thursday cron runs.

To test manually without waiting for Thursday:

```sh
curl -X POST https://your-worker.workers.dev/webhook \
  -H "Authorization: Bearer YOUR_WEBHOOK_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"gas":{"direction":"up","adjustment":3.6,"price":1.621}}'
```

> **Authentication note:** The `Authorization: Bearer` header is the only accepted method. Passing the secret as `?secret=` is explicitly rejected (HTTP 400) — see [ADR-004](./adr/004-no-query-param-secrets.md).
