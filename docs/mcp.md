# MCP Server

Buckit exposes its prediction data via the [Model Context Protocol](https://modelcontextprotocol.io/).

## Quick Start

Add to your Claude Desktop config (`~/.config/claude/claude_desktop_config.json` on Mac/Linux, `%APPDATA%\Claude\claude_desktop_config.json` on Windows):

```json
{
  "mcpServers": {
    "hfxgas": {
      "url": "https://hfxgas.ca/mcp"
    }
  }
}
```

No API key required for read tools.

## Available Tools

### Read Tools (No Auth)

#### `get_latest_prediction`

Returns the current prediction from KV.

```json
{
  "direction": "up",
  "currentPrice": 1.659,
  "predictedPrice": 1.719,
  "fuelType": "gas",
  "notes": "Fill up tonight.",
  "source": "reddit",
  "post_id": "abc123",
  "updated_at": "2024-11-14T17:00:00.000Z"
}
```

#### `get_prediction_history`

Returns the last N predictions (default 10, max 10).

Parameters:
- `limit` (optional, number, max 10)

#### `get_status`

Returns health/status information.

```json
{
  "ok": true,
  "last_updated": "2024-11-14T17:00:00.000Z",
  "last_post_id": "abc123",
  "latest_image_key": "images/abc123.png",
  "has_prediction": true
}
```

### Write Tools (WEBHOOK_SECRET Required)

Pass your secret in the `secret` parameter.

#### `post_prediction`

Submit a manual prediction override.

Parameters:
- `direction` — `"up"` or `"down"`
- `predicted_price` — number (e.g. `1.72`)
- `current_price` — number (optional)
- `fuel_type` — `"gas"` or `"diesel"` (optional, default `"gas"`)
- `notes` — string (optional)
- `secret` — your WEBHOOK_SECRET

#### `trigger_reddit_scan`

Manually trigger a Reddit scan.

Parameters:
- `secret` — your WEBHOOK_SECRET

## Implementation

The MCP server is built with [`workers-mcp`](https://github.com/cloudflare/workers-mcp) using the `WorkerEntrypoint` + `ProxyToSelf` pattern.

Source: `mcp/server.js`

### Future Migration

A migration to [webmcp](https://webmcp.dev/) is planned for when Cloudflare Workers support matures. The current `workers-mcp` implementation will remain stable in the meantime.

## Auth Model

Mirrors the public web API:

| Tool | Auth | Reason |
|------|------|--------|
| `get_latest_prediction` | None | Same as `GET /api/latest` |
| `get_prediction_history` | None | Same as `GET /` (history rendered publicly) |
| `get_status` | None | Read-only health info |
| `post_prediction` | WEBHOOK_SECRET | Same as `POST /webhook` |
| `trigger_reddit_scan` | WEBHOOK_SECRET | Privileged action |

## Claude Usage Examples

After connecting:

```
"What's the predicted gas price in Halifax this week?"
"Has gas been going up or down the last few weeks?"
"What's the current status of the hfxgas prediction system?"
```
