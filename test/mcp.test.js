/**
 * Buckit MCP Server — test suite
 *
 * Tests MCP tool methods directly by binding them to a mock env,
 * avoiding the WorkerEntrypoint constructor ExecutionContext requirement.
 */

import { describe, it, expect } from 'vitest';
import { BuckitMCP } from '../mcp/server.js';

function makeMcp(kvData = {}) {
  const store = { ...kvData };
  const mockEnv = {
    WEBHOOK_SECRET: 'test-secret',
    SITE_URL: 'https://hfxgas.ca',
    REDDIT_USER_AGENT: 'Buckit/1.0 (test)',
    REDDIT_AUTHOR: 'buckit',
    REDDIT_SUBREDDIT: 'halifax',
    MAX_HISTORY: '10',
    PREDICTIONS: {
      get: async (key) => store[key] ?? null,
      put: async (key, value) => { store[key] = value; },
    },
    IMAGES: { get: async () => null, put: async () => {} },
    AI: { run: async () => ({ image: null }) },
  };

  // Bind methods directly to avoid WorkerEntrypoint constructor issues in tests
  return {
    get_latest_prediction: BuckitMCP.prototype.get_latest_prediction.bind({ env: mockEnv }),
    get_prediction_history: BuckitMCP.prototype.get_prediction_history.bind({ env: mockEnv }),
    get_status: BuckitMCP.prototype.get_status.bind({ env: mockEnv }),
    post_prediction: BuckitMCP.prototype.post_prediction.bind({ env: mockEnv }),
    trigger_reddit_scan: BuckitMCP.prototype.trigger_reddit_scan.bind({ env: mockEnv }),
  };
}

describe('get_latest_prediction (no auth required)', () => {
  it('returns null when no prediction in KV', async () => {
    const mcp = makeMcp();
    const result = await mcp.get_latest_prediction();
    expect(result).toBeNull();
  });

  it('returns prediction when available', async () => {
    const pred = { direction: 'up', predictedPrice: 1.72, fuelType: 'gas', updated_at: new Date().toISOString() };
    const mcp = makeMcp({ latest_prediction: JSON.stringify(pred) });
    const result = await mcp.get_latest_prediction();
    expect(result.direction).toBe('up');
    expect(result.predictedPrice).toBe(1.72);
  });
});

describe('get_prediction_history (no auth required)', () => {
  it('returns empty array when no history', async () => {
    const mcp = makeMcp();
    const result = await mcp.get_prediction_history();
    expect(result).toEqual([]);
  });

  it('returns history array', async () => {
    const history = [
      { direction: 'up', predictedPrice: 1.72, fuelType: 'gas', updated_at: new Date().toISOString() },
      { direction: 'down', predictedPrice: 1.65, fuelType: 'gas', updated_at: new Date().toISOString() },
    ];
    const mcp = makeMcp({ prediction_history: JSON.stringify(history) });
    const result = await mcp.get_prediction_history();
    expect(result.length).toBe(2);
  });

  it('respects limit parameter', async () => {
    const history = Array.from({ length: 8 }, (_, i) => ({
      direction: 'up',
      predictedPrice: 1.5 + i * 0.01,
      fuelType: 'gas',
      updated_at: new Date().toISOString(),
    }));
    const mcp = makeMcp({ prediction_history: JSON.stringify(history) });
    const result = await mcp.get_prediction_history(3);
    expect(result.length).toBe(3);
  });

  it('caps limit at 10', async () => {
    const history = Array.from({ length: 10 }, (_, i) => ({
      direction: 'up',
      predictedPrice: 1.5 + i * 0.01,
      fuelType: 'gas',
      updated_at: new Date().toISOString(),
    }));
    const mcp = makeMcp({ prediction_history: JSON.stringify(history) });
    const result = await mcp.get_prediction_history(100);
    expect(result.length).toBe(10);
  });
});

describe('get_status (no auth required)', () => {
  it('returns ok status with nulls when empty', async () => {
    const mcp = makeMcp();
    const result = await mcp.get_status();
    expect(result.ok).toBe(true);
    expect(result.last_updated).toBeNull();
    expect(result.last_post_id).toBeNull();
    expect(result.latest_image_key).toBeNull();
    expect(result.has_prediction).toBe(false);
  });

  it('returns status with data when prediction exists', async () => {
    const pred = { direction: 'up', predictedPrice: 1.72, fuelType: 'gas', updated_at: '2024-11-14T17:00:00.000Z' };
    const mcp = makeMcp({
      latest_prediction: JSON.stringify(pred),
      latest_image_key: 'images/abc123.png',
      last_processed_post_id: 'abc123',
    });
    const result = await mcp.get_status();
    expect(result.ok).toBe(true);
    expect(result.last_updated).toBe('2024-11-14T17:00:00.000Z');
    expect(result.last_post_id).toBe('abc123');
    expect(result.latest_image_key).toBe('images/abc123.png');
    expect(result.has_prediction).toBe(true);
  });
});

describe('post_prediction (secret required)', () => {
  const validArgs = {
    direction: 'up',
    predicted_price: 1.72,
    current_price: 1.66,
    fuel_type: 'gas',
    notes: 'Test note',
    secret: 'test-secret',
  };

  it('writes prediction to KV with valid secret', async () => {
    const mcp = makeMcp();
    const result = await mcp.post_prediction(validArgs);
    expect(result.ok).toBe(true);
    expect(result.prediction.direction).toBe('up');
    expect(result.prediction.source).toBe('mcp');
  });

  it('rejects with no secret → 401', async () => {
    const mcp = makeMcp();
    const result = await mcp.post_prediction({ ...validArgs, secret: '' });
    expect(result.error).toBe('Unauthorized');
    expect(result.status).toBe(401);
  });

  it('rejects with wrong secret → 401', async () => {
    const mcp = makeMcp();
    const result = await mcp.post_prediction({ ...validArgs, secret: 'bad-secret' });
    expect(result.error).toBe('Unauthorized');
    expect(result.status).toBe(401);
  });

  it('rejects invalid direction → 400', async () => {
    const mcp = makeMcp();
    const result = await mcp.post_prediction({ ...validArgs, direction: 'sideways' });
    expect(result.status).toBe(400);
  });

  it('rejects invalid fuel_type → 400', async () => {
    const mcp = makeMcp();
    const result = await mcp.post_prediction({ ...validArgs, fuel_type: 'jet' });
    expect(result.status).toBe(400);
  });

  it('rejects non-number predicted_price → 400', async () => {
    const mcp = makeMcp();
    const result = await mcp.post_prediction({ ...validArgs, predicted_price: 'alot' });
    expect(result.status).toBe(400);
  });
});

describe('trigger_reddit_scan (secret required)', () => {
  it('rejects with no secret → 401', async () => {
    const mcp = makeMcp();
    const result = await mcp.trigger_reddit_scan({ secret: '' });
    expect(result.error).toBe('Unauthorized');
    expect(result.status).toBe(401);
  });

  it('rejects with wrong secret → 401', async () => {
    const mcp = makeMcp();
    const result = await mcp.trigger_reddit_scan({ secret: 'wrong' });
    expect(result.error).toBe('Unauthorized');
    expect(result.status).toBe(401);
  });
});
