/**
 * Buckit MCP Server
 *
 * Exposes prediction data from Cloudflare KV via the Model Context Protocol.
 * Uses workers-mcp for Cloudflare Workers transport.
 *
 * Future migration: webmcp (webmcp.dev) — tracked in docs/mcp.md
 *
 * Auth model:
 *   - Read tools (get_*): no auth required — public, same as GET /
 *   - Write/trigger tools: WEBHOOK_SECRET required
 *
 * Claude Desktop config (no key needed for read access):
 *   {
 *     "mcpServers": {
 *       "hfxgas": { "url": "https://hfxgas.ca/mcp" }
 *     }
 *   }
 */

import { WorkerEntrypoint } from 'cloudflare:workers';
import { ProxyToSelf } from 'workers-mcp';

export class BuckitMCP extends WorkerEntrypoint {
  /**
   * Get the latest gas price prediction.
   * No auth required — public read access.
   * @returns {Promise<object|null>}
   */
  async get_latest_prediction() {
    const raw = await this.env.PREDICTIONS.get('latest_prediction');
    return raw ? JSON.parse(raw) : null;
  }

  /**
   * Get the last N predictions (default 10, max 10).
   * No auth required — public read access.
   * @param {number} [limit=10]
   * @returns {Promise<object[]>}
   */
  async get_prediction_history(limit = 10) {
    const raw = await this.env.PREDICTIONS.get('prediction_history');
    const history = raw ? JSON.parse(raw) : [];
    return history.slice(0, Math.min(limit, 10));
  }

  /**
   * Get health/status: last cron run, last post ID, image key.
   * No auth required — public read access.
   * @returns {Promise<object>}
   */
  async get_status() {
    const [predRaw, imageKey, lastPostId] = await Promise.all([
      this.env.PREDICTIONS.get('latest_prediction'),
      this.env.PREDICTIONS.get('latest_image_key'),
      this.env.PREDICTIONS.get('last_processed_post_id'),
    ]);

    const pred = predRaw ? JSON.parse(predRaw) : null;

    return {
      ok: true,
      last_updated: pred?.updated_at ?? null,
      last_post_id: lastPostId ?? null,
      latest_image_key: imageKey ?? null,
      has_prediction: pred !== null,
    };
  }

  /**
   * Submit a manual prediction override.
   * Requires WEBHOOK_SECRET via X-Secret header or secret query param.
   * @param {{ direction: string, predicted_price: number, current_price?: number, fuel_type?: string, notes?: string, secret: string }} args
   * @returns {Promise<object>}
   */
  async post_prediction(args) {
    const { direction, predicted_price, current_price, fuel_type = 'gas', notes = null, secret } = args;

    if (!secret || secret !== this.env.WEBHOOK_SECRET) {
      return { error: 'Unauthorized', status: 401 };
    }
    if (!['up', 'down'].includes(direction)) {
      return { error: 'Invalid direction', status: 400 };
    }
    if (!['gas', 'diesel'].includes(fuel_type)) {
      return { error: 'Invalid fuel_type', status: 400 };
    }
    if (typeof predicted_price !== 'number' || isNaN(predicted_price)) {
      return { error: 'predicted_price must be a number', status: 400 };
    }

    const maxHistory = parseInt(this.env.MAX_HISTORY ?? '10', 10);
    const prediction = {
      direction,
      currentPrice: current_price ?? null,
      predictedPrice: predicted_price,
      fuelType: fuel_type,
      notes: notes ? String(notes).slice(0, 500) : null,
      source: 'mcp',
      updated_at: new Date().toISOString(),
      post_id: null,
    };

    await this.env.PREDICTIONS.put('latest_prediction', JSON.stringify(prediction));

    const raw = await this.env.PREDICTIONS.get('prediction_history');
    const history = raw ? JSON.parse(raw) : [];
    history.unshift(prediction);
    if (history.length > maxHistory) history.splice(maxHistory);
    await this.env.PREDICTIONS.put('prediction_history', JSON.stringify(history));

    return { ok: true, prediction };
  }

  /**
   * Manually trigger a Reddit scan (calls the scheduled handler).
   * Requires WEBHOOK_SECRET.
   * @param {{ secret: string }} args
   * @returns {Promise<object>}
   */
  async trigger_reddit_scan(args) {
    const { secret } = args;

    if (!secret || secret !== this.env.WEBHOOK_SECRET) {
      return { error: 'Unauthorized', status: 401 };
    }

    // Dynamically import the main worker and invoke its scheduled handler
    const { default: worker } = await import('../src/index.js');
    await worker.scheduled({}, this.env, {});

    return { ok: true, message: 'Reddit scan triggered' };
  }

  async fetch(request) {
    return new ProxyToSelf(this).fetch(request);
  }
}

export default {
  fetch(request, env, ctx) {
    return new BuckitMCP(ctx, env).fetch(request);
  },
};
