# Updating hfxgas.ca (for u/buckit)

A plain-English guide for manually updating the site — no coding required.

This is useful when:
- You want to correct a prediction after posting
- The Thursday cron missed your post (e.g. it was posted very early or very late)
- You want to push an interrupter clause update on a non-Thursday

---

## Option 1: Simple curl command (easiest)

Open a terminal (Terminal on Mac, Command Prompt or PowerShell on Windows) and run:

```sh
curl -X POST https://hfxgas.ca/webhook \
  -H "Authorization: Bearer YOUR_SECRET_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "gas":    { "direction": "up",   "adjustment": 3.6, "price": 1.621 },
    "diesel": { "direction": "down", "adjustment": 0.7, "price": 1.544 },
    "notes":  "May be +/- 0.1"
  }'
```

Replace:
- `YOUR_SECRET_HERE` — the webhook secret (ask program-the-brain-not-the-heartbeat for this)
- `up` / `down` / `no-change` — the direction for each fuel
- `3.6` — the adjustment in cents (always positive; direction controls up/down)
- `1.621` — the new minimum price in dollars (e.g. 162.1¢ → `1.621`)

**No change this week?** Use `"no-change"` as the direction and `null` for adjustment:

```sh
curl -X POST https://hfxgas.ca/webhook \
  -H "Authorization: Bearer YOUR_SECRET_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "gas":    { "direction": "no-change", "adjustment": null, "price": 1.585 },
    "diesel": { "direction": "no-change", "adjustment": null, "price": 1.537 }
  }'
```

**Gas only** (omit the diesel field entirely):

```sh
curl -X POST https://hfxgas.ca/webhook \
  -H "Authorization: Bearer YOUR_SECRET_HERE" \
  -H "Content-Type: application/json" \
  -d '{"gas": {"direction": "up", "adjustment": 2.1, "price": 1.642}}'
```

---

## Option 2: Browser bookmark (no terminal needed)

> Coming soon — a simple HTML form at `/update` (auth-gated) is planned.
> For now, use Option 1 or Option 3.

---

## Option 3: Task command (if you have the repo cloned)

If you have the project set up locally and `WEBHOOK_SECRET` in your environment:

```sh
# Gas only
WEBHOOK_SECRET=your_secret task buckit:gas -- up 3.6 1.621

# Diesel only
WEBHOOK_SECRET=your_secret task buckit:diesel -- down 0.7 1.544
```

---

## Confirming it worked

After posting, visit [hfxgas.ca](https://hfxgas.ca) — the prediction should update within a few seconds.

You can also check the raw JSON:

```sh
curl https://hfxgas.ca/api/latest | jq .
```

---

## Field reference

| Field | Type | Values |
|---|---|---|
| `direction` | string | `"up"`, `"down"`, `"no-change"` |
| `adjustment` | number or null | Cents (always positive, e.g. `3.6` for 3.6¢) |
| `price` | number | Dollars (e.g. `1.621` for $1.621/L) |
| `notes` | string (optional) | Free text, e.g. `"May be +/- 0.1"` |

---

## Getting the secret

The `WEBHOOK_SECRET` is stored in Cloudflare as a Worker secret.
Contact **program-the-brain-not-the-heartbeat** to receive it securely.

It should be treated like a password — don't share it publicly.
