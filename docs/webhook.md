# Webhook API

`POST /webhook` is a manual override for the cron-based Reddit scraper. Use it when:

- Reddit is down or unreachable
- /u/buckit's post is delayed or you need to correct an incorrect prediction
- You want to inject a test prediction to verify the site

## Authentication

Send the `WEBHOOK_SECRET` as an `Authorization: Bearer` header.

```sh
curl -X POST https://hfxgas.ca/webhook \
  -H "Authorization: Bearer YOUR_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"gas":{"direction":"up","adjustment":3.6,"price":1.621}}'
```

> **Security note:** Passing the secret as a `?secret=` query parameter is explicitly rejected (HTTP 400). Query-parameter secrets are logged in server logs, browser history, and `Referer` headers. Always use the `Authorization: Bearer` header.

## Request Schema

The webhook accepts two formats: the **new dual-fuel format** (preferred) and the **legacy single-fuel format** (backward compatible).

### New Format (preferred)

```json
{
  "gas": {
    "direction": "up" | "down" | "no-change",
    "adjustment": 3.6,
    "price": 1.621
  },
  "diesel": {
    "direction": "down" | "up" | "no-change",
    "adjustment": 0.7,
    "price": 1.544
  },
  "notes": "optional free-text note (max 500 chars)"
}
```

Either `gas` or `diesel` (or both) may be omitted — pass only what you know.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `gas` | object | No | Regular gas prediction slot |
| `gas.direction` | `"up"` \| `"down"` \| `"no-change"` | Yes (if gas present) | Price direction |
| `gas.adjustment` | number | No | Change in cents (e.g. `3.6` for +3.6¢) |
| `gas.price` | number | No | New minimum price per litre in dollars (e.g. `1.621`) |
| `diesel` | object | No | Diesel prediction slot (same fields as gas) |
| `notes` | string | No | Optional context (max 500 chars) |

### Legacy Format (backward compatible)

```json
{
  "direction": "up" | "down" | "no-change",
  "predicted_price": 1.72,
  "current_price": 1.66,
  "fuel_type": "gas" | "diesel",
  "notes": "optional string"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `direction` | `"up"` \| `"down"` \| `"no-change"` | Yes | Price direction |
| `predicted_price` | number | Yes | Predicted price per litre |
| `current_price` | number | No | Current price per litre |
| `fuel_type` | `"gas"` \| `"diesel"` | No | Defaults to `"gas"` |
| `notes` | string | No | Optional note (max 500 chars) |

## Response

### Success (200)

```json
{
  "ok": true,
  "prediction": {
    "gas": {
      "direction": "up",
      "adjustment": 3.6,
      "price": 1.621
    },
    "diesel": {
      "direction": "down",
      "adjustment": 0.7,
      "price": 1.544
    },
    "notes": null,
    "source": "webhook",
    "updated_at": "2024-11-14T17:30:00.000Z",
    "post_id": null
  }
}
```

### Error Responses

| Status | Reason |
|--------|--------|
| 400 | `?secret=` query parameter used — must use `Authorization: Bearer` header |
| 400 | Invalid JSON, invalid `direction`, invalid `fuel_type`, or non-number price |
| 401 | Missing or incorrect `WEBHOOK_SECRET` |

## Examples

### Both fuel types (new format)

```sh
curl -s -X POST https://hfxgas.ca/webhook \
  -H "Authorization: Bearer YOUR_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "gas":    { "direction": "up",        "adjustment": 3.6, "price": 1.621 },
    "diesel": { "direction": "down",      "adjustment": 0.7, "price": 1.544 },
    "notes": "May be +/- 0.1"
  }' | jq .
```

### No change (gas only)

```sh
curl -s -X POST https://hfxgas.ca/webhook \
  -H "Authorization: Bearer YOUR_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "gas": { "direction": "no-change", "adjustment": 0, "price": 1.585 }
  }' | jq .
```

### Legacy single-fuel (still works)

```sh
curl -s -X POST https://hfxgas.ca/webhook \
  -H "Authorization: Bearer YOUR_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "direction": "down",
    "predicted_price": 1.621,
    "current_price": 1.657,
    "fuel_type": "gas"
  }' | jq .
```

## Setting the Secret

```sh
task secret
```

Enter a long random string. Store it in a password manager.
