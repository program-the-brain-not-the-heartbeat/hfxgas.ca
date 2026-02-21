/**
 * Buckit Worker — Full test suite (100% coverage)
 *
 * Uses @cloudflare/vitest-pool-workers:
 * - SELF.fetch() exercises the real Worker with real miniflare bindings
 * - env from cloudflare:test is used for direct KV inspection
 * - Utility functions tested via direct imports
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { env, SELF } from 'cloudflare:test';
import {
  escapeHtml,
  formatDate,
  formatRelativeTime,
  getSeason,
  buildImagePrompt,
  fetchCommunityContext,
  withSecurityHeaders,
  parseAdjustment,
  parseRedditPost,
  buildChartData,
  renderHtml,
} from '../src/index.js';
import worker from '../src/index.js';

// ── Utilities ──────────────────────────────────────────────────────────────────

describe('escapeHtml', () => {
  it('escapes & < > " \'', () => {
    expect(escapeHtml('&<>"\'')).toBe('&amp;&lt;&gt;&quot;&#039;');
  });
  it('passes clean strings unchanged', () => {
    expect(escapeHtml('hello world')).toBe('hello world');
  });
  it('returns empty string for non-string', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
    expect(escapeHtml(42)).toBe('');
  });
});

describe('formatDate', () => {
  it('formats a valid ISO string', () => {
    const result = formatDate('2024-11-14T17:00:00.000Z');
    expect(result).toContain('2024');
    expect(result).not.toBe('Unknown');
  });
  it('returns Unknown for null', () => {
    expect(formatDate(null)).toBe('Unknown');
  });
  it('returns Unknown for invalid date', () => {
    expect(formatDate('not-a-date')).toBe('Unknown');
  });
});

describe('formatRelativeTime', () => {
  it('returns just now for very recent', () => {
    expect(formatRelativeTime(new Date().toISOString())).toBe('just now');
  });
  it('returns minutes ago', () => {
    expect(formatRelativeTime(new Date(Date.now() - 5 * 60000).toISOString())).toBe('5 minutes ago');
  });
  it('returns singular minute', () => {
    expect(formatRelativeTime(new Date(Date.now() - 60000).toISOString())).toBe('1 minute ago');
  });
  it('returns hours ago', () => {
    expect(formatRelativeTime(new Date(Date.now() - 2 * 3600000).toISOString())).toBe('2 hours ago');
  });
  it('returns singular hour', () => {
    expect(formatRelativeTime(new Date(Date.now() - 3600000).toISOString())).toBe('1 hour ago');
  });
  it('returns days ago', () => {
    expect(formatRelativeTime(new Date(Date.now() - 3 * 86400000).toISOString())).toBe('3 days ago');
  });
  it('returns empty string for null', () => {
    expect(formatRelativeTime(null)).toBe('');
  });
  it('returns empty string for invalid date', () => {
    expect(formatRelativeTime('bad')).toBe('');
  });
});

describe('getSeason', () => {
  it('winter for December', () => expect(getSeason(new Date('2024-12-15T12:00:00Z'))).toBe('winter'));
  it('winter for January', () => expect(getSeason(new Date('2024-01-10T12:00:00Z'))).toBe('winter'));
  it('winter for February', () => expect(getSeason(new Date('2024-02-20T12:00:00Z'))).toBe('winter'));
  it('spring for March', () => expect(getSeason(new Date('2024-03-21T12:00:00Z'))).toBe('spring'));
  it('spring for May', () => expect(getSeason(new Date('2024-05-01T12:00:00Z'))).toBe('spring'));
  it('summer for June', () => expect(getSeason(new Date('2024-06-21T12:00:00Z'))).toBe('summer'));
  it('summer for August', () => expect(getSeason(new Date('2024-08-15T12:00:00Z'))).toBe('summer'));
  it('fall for September', () => expect(getSeason(new Date('2024-09-01T12:00:00Z'))).toBe('fall'));
  it('fall for November', () => expect(getSeason(new Date('2024-11-01T12:00:00Z'))).toBe('fall'));
});

describe('buildImagePrompt', () => {
  // Community context path
  it('uses community context when provided', () => {
    const ctx = ['Pothole on Quinpool', 'Bridge closure update'];
    const prompt = buildImagePrompt('up', 'abc', ctx);
    expect(prompt).toContain('This week in Halifax and Nova Scotia');
    expect(prompt).toContain('Pothole on Quinpool');
    expect(prompt).toContain('Bridge closure update');
  });
  it('does not contain season strings when community context provided', () => {
    const ctx = ['Ferry delay again'];
    const prompt = buildImagePrompt('up', 'abc', ctx, new Date('2024-01-15T12:00:00Z'));
    expect(prompt).not.toContain('blizzard');
    expect(prompt).not.toContain('winter');
  });
  it('truncates titles at 60 chars in community context', () => {
    const longTitle = 'A'.repeat(80);
    const ctx = [longTitle];
    const prompt = buildImagePrompt('up', 'abc', ctx);
    // Title should be truncated — 80 A's should not appear in full
    expect(prompt).not.toContain('A'.repeat(80));
    expect(prompt).toContain('A'.repeat(60));
  });
  it('uses at most 20 titles from community context', () => {
    const ctx = Array.from({ length: 25 }, (_, i) => `Topic ${i}`);
    const prompt = buildImagePrompt('up', 'abc', ctx);
    expect(prompt).not.toContain('Topic 20');
    expect(prompt).not.toContain('Topic 24');
  });
  // Season fallback path (empty context)
  it('includes UP label (season fallback)', () => expect(buildImagePrompt('up', 'abc', [], new Date('2024-01-15T12:00:00Z'))).toContain('going UP'));
  it('includes DOWN label (season fallback)', () => expect(buildImagePrompt('down', 'abc', [], new Date('2024-07-15T12:00:00Z'))).toContain('going DOWN'));
  it('winter context in January', () => expect(buildImagePrompt('up', 'abc', [], new Date('2024-01-15T12:00:00Z'))).toContain('winter'));
  it('summer context in July', () => expect(buildImagePrompt('up', 'abc', [], new Date('2024-07-15T12:00:00Z'))).toContain('summer'));
  it('spring context in April', () => expect(buildImagePrompt('up', 'abc', [], new Date('2024-04-15T12:00:00Z'))).toContain('spring'));
  it('fall context in October', () => expect(buildImagePrompt('up', 'abc', [], new Date('2024-10-15T12:00:00Z'))).toContain('fall'));
  it('seed from postId', () => expect(buildImagePrompt('up', 'abc123xyz', [], new Date('2024-01-15T12:00:00Z'))).toContain('abc123xy'));
  it('suffering mood for up', () => expect(buildImagePrompt('up', 'abc', [], new Date('2024-01-15T12:00:00Z'))).toContain('suffering'));
  it('celebration mood for down', () => expect(buildImagePrompt('down', 'abc', [], new Date('2024-01-15T12:00:00Z'))).toContain('celebration'));
  // Default param fallback
  it('defaults to empty communityContext (season fallback) when not provided', () => {
    // No communityContext arg — should fall through to season fallback, not throw
    const prompt = buildImagePrompt('up', 'abc');
    expect(prompt).toContain('going UP');
    expect(prompt).toContain('Seed context: abc');
  });
});

// ── fetchCommunityContext ────────────────────────────────────────────────────

describe('fetchCommunityContext', () => {
  const mockEnv = { REDDIT_USER_AGENT: 'test-agent/1.0' };

  it('returns combined titles from both subreddits', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          children: [
            { data: { title: 'Pothole on Quinpool' } },
            { data: { title: 'Bridge closure update' } },
          ],
        },
      }),
    });
    const titles = await fetchCommunityContext(mockEnv);
    // Both subreddits return 2 titles each = 4 total
    expect(titles).toHaveLength(4);
    expect(titles).toContain('Pothole on Quinpool');
    expect(titles).toContain('Bridge closure update');
  });

  it('returns empty array if both fetches fail', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network error'));
    const titles = await fetchCommunityContext(mockEnv);
    expect(titles).toEqual([]);
  });

  it('returns partial results if one subreddit returns non-ok', async () => {
    let callCount = 0;
    global.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({ ok: false, status: 429 });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({
          data: { children: [{ data: { title: 'Nova Scotia ferry news' } }] },
        }),
      });
    });
    const titles = await fetchCommunityContext(mockEnv);
    expect(titles).toContain('Nova Scotia ferry news');
    expect(titles).toHaveLength(1);
  });

  it('filters out empty/falsy titles', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          children: [
            { data: { title: 'Valid post' } },
            { data: { title: '' } },
            { data: { title: 'Another valid post' } },
          ],
        },
      }),
    });
    const titles = await fetchCommunityContext(mockEnv);
    expect(titles).not.toContain('');
    expect(titles.every((t) => t.length > 0)).toBe(true);
  });

  it('sends correct User-Agent header', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { children: [] } }),
    });
    await fetchCommunityContext(mockEnv);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('top.json?t=week&limit=10'),
      expect.objectContaining({ headers: { 'User-Agent': 'test-agent/1.0' } })
    );
  });

  it('fetches from both r/halifax and r/novascotia', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { children: [] } }),
    });
    await fetchCommunityContext(mockEnv);
    const urls = global.fetch.mock.calls.map(([url]) => url);
    expect(urls.some((u) => u.includes('r/halifax/top.json'))).toBe(true);
    expect(urls.some((u) => u.includes('r/novascotia/top.json'))).toBe(true);
  });
});

// ── withSecurityHeaders ────────────────────────────────────────────────────────

describe('withSecurityHeaders', () => {
  it('adds X-Content-Type-Options: nosniff', () => {
    const res = withSecurityHeaders(new Response('ok'));
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });

  it('adds X-Frame-Options: DENY', () => {
    const res = withSecurityHeaders(new Response('ok'));
    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
  });

  it('adds Referrer-Policy: strict-origin-when-cross-origin', () => {
    const res = withSecurityHeaders(new Response('ok'));
    expect(res.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
  });

  it('adds Content-Security-Policy with key directives', () => {
    const csp = withSecurityHeaders(new Response('ok')).headers.get('Content-Security-Policy');
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
  });

  it('adds Permissions-Policy disabling sensitive features', () => {
    const pp = withSecurityHeaders(new Response('ok')).headers.get('Permissions-Policy');
    expect(pp).toContain('geolocation=()');
    expect(pp).toContain('camera=()');
    expect(pp).toContain('microphone=()');
  });

  it('preserves existing headers (content-type)', () => {
    const base = new Response('ok', { headers: { 'content-type': 'text/html' } });
    const res = withSecurityHeaders(base);
    expect(res.headers.get('content-type')).toBe('text/html');
  });

  it('preserves status code', () => {
    const base = new Response('not found', { status: 404 });
    const res = withSecurityHeaders(base);
    expect(res.status).toBe(404);
  });
});

// ── parseAdjustment ────────────────────────────────────────────────────────────

describe('parseAdjustment', () => {
  it('parses UP 3.6', () => {
    const r = parseAdjustment('UP 3.6');
    expect(r.direction).toBe('up');
    expect(r.adjustment).toBeCloseTo(3.6);
  });
  it('parses DOWN 0.7', () => {
    const r = parseAdjustment('DOWN 0.7');
    expect(r.direction).toBe('down');
    expect(r.adjustment).toBeCloseTo(0.7);
  });
  it('parses NO CHANGE', () => {
    const r = parseAdjustment('NO CHANGE');
    expect(r.direction).toBe('no-change');
    expect(r.adjustment).toBe(0);
  });
  it('parses no change with hyphen', () => {
    expect(parseAdjustment('NO-CHANGE').direction).toBe('no-change');
  });
  it('parses bare UP', () => {
    const r = parseAdjustment('up');
    expect(r.direction).toBe('up');
    expect(r.adjustment).toBeNull();
  });
  it('parses bare DOWN', () => {
    const r = parseAdjustment('down');
    expect(r.direction).toBe('down');
    expect(r.adjustment).toBeNull();
  });
  it('returns null direction for unknown', () => {
    const r = parseAdjustment('something else');
    expect(r.direction).toBeNull();
    expect(r.adjustment).toBeNull();
  });
  it('handles whitespace padding', () => {
    expect(parseAdjustment('  UP 2.1  ').direction).toBe('up');
  });
});

// ── parseRedditPost ────────────────────────────────────────────────────────────

describe('parseRedditPost', () => {
  // ── Markdown table format (primary) ────────────────────────────────────────
  it('parses markdown table: gas up, diesel down', () => {
    const post = {
      title: 'Gas prices this week',
      selftext: '|Type|Adjustment|New Min Price|\n:--|:--|:--|\n|Regular| UP 3.6 |162.1|\n|Diesel| DOWN 0.7 |154.4|\nMay be +/- 0.1',
    };
    const r = parseRedditPost(post);
    expect(r.gas.direction).toBe('up');
    expect(r.gas.adjustment).toBeCloseTo(3.6);
    expect(r.gas.price).toBeCloseTo(1.621);
    expect(r.diesel.direction).toBe('down');
    expect(r.diesel.adjustment).toBeCloseTo(0.7);
    expect(r.diesel.price).toBeCloseTo(1.544);
  });

  it('parses markdown table: no change for gas', () => {
    const post = {
      title: 'Gas prices this week',
      selftext: '|Type|Adjustment|New Min Price|\n:--|:--|:--|\n|Regular| NO CHANGE |127.5|\n|Diesel| DOWN 0.7 |154.4|',
    };
    const r = parseRedditPost(post);
    expect(r.gas.direction).toBe('no-change');
    expect(r.gas.adjustment).toBe(0);
    expect(r.gas.price).toBeCloseTo(1.275);
  });

  it('converts cent prices to dollars (>10 → /100)', () => {
    const post = {
      title: 'Prices',
      selftext: '|Type|Adjustment|New Min Price|\n:--|:--|:--|\n|Regular| UP 3.6 |165.9|',
    };
    expect(parseRedditPost(post).gas.price).toBeCloseTo(1.659);
  });

  it('leaves dollar prices unchanged (<=10)', () => {
    const post = {
      title: 'Prices',
      selftext: '|Type|Adjustment|New Min Price|\n:--|:--|:--|\n|Regular| UP 3.6 |1.659|',
    };
    expect(parseRedditPost(post).gas.price).toBeCloseTo(1.659);
  });

  it('recognises Gasoline as gas', () => {
    const post = {
      title: 'Prices',
      selftext: '|Type|Adjustment|New Min Price|\n:--|:--|:--|\n|Gasoline| UP 2.0 |162.0|',
    };
    expect(parseRedditPost(post).gas).not.toBeNull();
    expect(parseRedditPost(post).diesel).toBeNull();
  });

  it('notes strips table lines, keeps free text', () => {
    const post = {
      title: 'Prices',
      selftext: '|Type|Adjustment|New Min Price|\n:--|:--|:--|\n|Regular| UP 3.6 |162.1|\nMay be +/- 0.1',
    };
    const r = parseRedditPost(post);
    expect(r.notes).toContain('May be');
    expect(r.notes).not.toContain('|Regular|');
  });

  // ── Free-text fallback ──────────────────────────────────────────────────────
  it('free-text: detects up direction', () => {
    const r = parseRedditPost({ title: 'Gas prices going up this week', selftext: '' });
    expect(r.gas.direction).toBe('up');
  });

  it('free-text: detects down direction', () => {
    const r = parseRedditPost({ title: 'Gas prices going down this week', selftext: '' });
    expect(r.gas.direction).toBe('down');
  });

  it('free-text: detects increase keyword', () => {
    expect(parseRedditPost({ title: 'Prices will increase', selftext: '' }).gas.direction).toBe('up');
  });

  it('free-text: detects decrease keyword', () => {
    expect(parseRedditPost({ title: 'Prices will decrease', selftext: '' }).gas.direction).toBe('down');
  });

  it('free-text: extracts predicted price (second dollar amount)', () => {
    const r = parseRedditPost({ title: 'Gas: $1.659/L to $1.719/L', selftext: '' });
    expect(r.gas.price).toBeCloseTo(1.719);
  });

  it('free-text: single price used as predicted', () => {
    const r = parseRedditPost({ title: 'Gas up to $1.72/L', selftext: '' });
    expect(r.gas.price).toBeCloseTo(1.72);
  });

  it('free-text: no-change keyword', () => {
    const r = parseRedditPost({ title: 'Gas prices no change this week', selftext: '' });
    expect(r.gas.direction).toBe('no-change');
  });

  it('free-text: diesel goes to diesel slot', () => {
    const r = parseRedditPost({ title: 'Diesel prices going up', selftext: '' });
    expect(r.diesel).not.toBeNull();
    expect(r.gas).toBeNull();
  });

  it('free-text: defaults to gas slot', () => {
    const r = parseRedditPost({ title: 'Prices going up', selftext: '' });
    expect(r.gas).not.toBeNull();
  });

  it('free-text: null direction when no keywords', () => {
    const r = parseRedditPost({ title: 'Weekly thread', selftext: '' });
    expect(r.gas.direction).toBeNull();
  });

  // ── Notes ──────────────────────────────────────────────────────────────────
  it('null notes when selftext empty', () => {
    expect(parseRedditPost({ title: 'Gas up', selftext: '' }).notes).toBeNull();
  });

  it('truncates notes to 500 chars', () => {
    const r = parseRedditPost({ title: 'Gas up', selftext: 'a'.repeat(600) });
    expect(r.notes?.length).toBe(500);
  });

  it('notes includes free-text selftext lines', () => {
    const r = parseRedditPost({ title: 'Gas up', selftext: 'Fill up tonight.' });
    expect(r.notes).toContain('Fill up tonight.');
  });
});

// ── buildChartData ─────────────────────────────────────────────────────────────

describe('buildChartData', () => {
  it('returns empty arrays for empty history', () => {
    const r = buildChartData([]);
    expect(r.labels).toEqual([]);
    expect(r.gasData).toEqual([]);
    expect(r.dieselData).toEqual([]);
  });

  it('reverses history (oldest first)', () => {
    const history = [
      { gas: { price: 1.70 }, diesel: null, updated_at: '2024-11-14T17:00:00.000Z' },
      { gas: { price: 1.65 }, diesel: null, updated_at: '2024-11-07T17:00:00.000Z' },
    ];
    const r = buildChartData(history);
    expect(r.gasData[0]).toBeCloseTo(1.65);
    expect(r.gasData[1]).toBeCloseTo(1.70);
  });

  it('null for missing slots', () => {
    const history = [
      { gas: { price: 1.65 }, diesel: null, updated_at: '2024-11-07T17:00:00.000Z' },
    ];
    const r = buildChartData(history);
    expect(r.dieselData[0]).toBeNull();
    expect(r.gasData[0]).toBeCloseTo(1.65);
  });

  it('formats label from updated_at', () => {
    const history = [{ gas: { price: 1.65 }, diesel: null, updated_at: '2024-11-07T17:00:00.000Z' }];
    const r = buildChartData(history);
    expect(r.labels[0]).toMatch(/Nov/);
  });

  it('falls back to #N label when no date', () => {
    const history = [{ gas: { price: 1.65 }, diesel: null }];
    const r = buildChartData(history);
    expect(r.labels[0]).toBe('#1');
  });
});

// ── renderHtml ─────────────────────────────────────────────────────────────────

describe('renderHtml', () => {
  const basePrediction = {
    gas: { direction: 'up', adjustment: 3.6, price: 1.621 },
    diesel: { direction: 'down', adjustment: 0.7, price: 1.544 },
    notes: 'Fill up tonight.',
    updated_at: '2024-11-14T17:00:00.000Z',
    source: 'reddit',
  };

  const opts = (overrides = {}) => ({
    prediction: basePrediction,
    history: [],
    imageKey: null,
    siteUrl: 'https://hfxgas.ca',
    ...overrides,
  });

  it('renders DOCTYPE HTML', () => {
    expect(renderHtml(opts())).toContain('<!DOCTYPE html>');
  });

  it('renders gas adjustment delta as hero', () => {
    const html = renderHtml(opts());
    expect(html).toContain('+3.6¢');
  });

  it('renders gas absolute price as secondary', () => {
    expect(renderHtml(opts())).toContain('$1.621/L');
  });

  it('renders diesel adjustment delta', () => {
    expect(renderHtml(opts())).toContain('−0.7¢');
  });

  it('renders up arrow for gas going up', () => {
    expect(renderHtml(opts())).toContain('\u2191');
  });

  it('renders down arrow for gas going down', () => {
    const html = renderHtml(opts({
      prediction: { ...basePrediction, gas: { direction: 'down', adjustment: 2.1, price: 1.599 } },
    }));
    expect(html).toContain('\u2193');
  });

  it('renders = for no-change', () => {
    const html = renderHtml(opts({
      prediction: { ...basePrediction, gas: { direction: 'no-change', adjustment: 0, price: 1.275 } },
    }));
    expect(html).toContain('No Change');
  });

  it('aria-label for price going up', () => {
    expect(renderHtml(opts())).toContain('aria-label="Price going up"');
  });

  it('aria-label for price going down', () => {
    const html = renderHtml(opts({
      prediction: { ...basePrediction, gas: { direction: 'down', adjustment: 2.1, price: 1.599 } },
    }));
    expect(html).toContain('aria-label="Price going down"');
  });

  it('aria-label for no change', () => {
    const html = renderHtml(opts({
      prediction: { ...basePrediction, gas: { direction: 'no-change', adjustment: 0, price: 1.275 } },
    }));
    expect(html).toContain('aria-label="No change"');
  });

  it('renders REGULAR badge', () => {
    expect(renderHtml(opts())).toContain('REGULAR');
  });

  it('renders DIESEL badge', () => {
    expect(renderHtml(opts())).toContain('DIESEL');
  });

  it('renders empty state when no prediction', () => {
    const html = renderHtml(opts({ prediction: null }));
    expect(html).toContain('No prediction yet.');
    expect(html).toContain('empty-state');
  });

  it('renders notes XSS-escaped', () => {
    const html = renderHtml(opts({
      prediction: { ...basePrediction, notes: '<script>alert(1)</script>' },
    }));
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('no notes block when notes null', () => {
    const html = renderHtml(opts({
      prediction: { ...basePrediction, notes: null },
    }));
    expect(html).not.toContain('class="notes"');
  });

  it('includes image-section when imageKey set', () => {
    const html = renderHtml(opts({ imageKey: 'images/abc123.png' }));
    expect(html).toContain('image-section');
    expect(html).toContain('abc123.png');
  });

  it('no image-section when imageKey null', () => {
    expect(renderHtml(opts())).not.toContain('image-section');
  });

  it('renders history cards', () => {
    const html = renderHtml(opts({ history: [basePrediction] }));
    expect(html).toContain('history-card');
  });

  it('renders Chart.js canvas when history has data', () => {
    const html = renderHtml(opts({ history: [basePrediction] }));
    expect(html).toContain('historyChart');
    expect(html).toContain('chart.js');
  });

  it('hides history section when empty', () => {
    const html = renderHtml(opts());
    expect(html).toContain('display:none');
    expect(html).toContain('aria-hidden="true"');
  });

  it('SEO meta tags', () => {
    const html = renderHtml(opts());
    expect(html).toContain('<meta name="description"');
    expect(html).toContain('og:title');
    expect(html).toContain('twitter:card');
  });

  it('JSON-LD structured data', () => {
    const html = renderHtml(opts());
    expect(html).toContain('application/ld+json');
    expect(html).toContain('WebSite');
    expect(html).toContain('Dataset');
  });

  it('main landmark present', () => {
    expect(renderHtml(opts())).toContain('<main');
  });

  it('animations inside prefers-reduced-motion media query', () => {
    const html = renderHtml(opts());
    expect(html.match(/@media \(prefers-reduced-motion: no-preference\)\s*\{[\s\S]*?@keyframes/)).not.toBeNull();
  });

  it('fuel-cards side-by-side grid', () => {
    expect(renderHtml(opts())).toContain('fuel-cards');
  });

  it('hc-fuels in history for dual fuel', () => {
    const history = [{
      gas: { direction: 'up', adjustment: 3.6, price: 1.621 },
      diesel: { direction: 'down', adjustment: 0.7, price: 1.544 },
      updated_at: new Date().toISOString(),
    }];
    const html = renderHtml(opts({ history }));
    expect(html).toContain('hc-fuel--diesel');
  });

  it('About button present in footer', () => {
    const html = renderHtml(opts());
    expect(html).toContain('aboutModalTrigger');
    expect(html).toContain('>About<');
  });

  it('About modal HTML present with expected sections', () => {
    const html = renderHtml(opts());
    expect(html).toContain('id="aboutModal"');
    expect(html).toContain('About hfxgas.ca');
    expect(html).toContain('program-the-brain-not-the-heartbeat');
    expect(html).toContain('Cape Breton');
    expect(html).toContain('No tracking');
    // Image / AI section
    expect(html).toContain('The meme image');
    expect(html).toContain('Flux');
    expect(html).toContain('Cloudflare R2');
    // Community context description
    expect(html).toContain('r/halifax');
    expect(html).toContain('r/novascotia');
  });

  it('About modal open/close JS present', () => {
    const html = renderHtml(opts());
    expect(html).toContain('aboutModalTrigger');
    expect(html).toContain('openAboutModal');
    expect(html).toContain('closeAboutModal');
  });
});

// ── Routes via SELF.fetch ──────────────────────────────────────────────────────

describe('GET /', () => {
  beforeEach(async () => {
    await env.PREDICTIONS.delete('latest_prediction');
    await env.PREDICTIONS.delete('prediction_history');
    await env.PREDICTIONS.delete('latest_image_key');
  });

  it('200 HTML', async () => {
    const res = await SELF.fetch('https://hfxgas.ca/');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
  });

  it('cache-control: no-store', async () => {
    expect((await SELF.fetch('https://hfxgas.ca/')).headers.get('cache-control')).toBe('no-store');
  });

  it('security headers present on GET /', async () => {
    const res = await SELF.fetch('https://hfxgas.ca/');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
    expect(res.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(res.headers.get('Content-Security-Policy')).toContain("default-src 'self'");
    expect(res.headers.get('Permissions-Policy')).toContain('geolocation=()');
  });

  it('empty state when KV empty', async () => {
    expect(await (await SELF.fetch('https://hfxgas.ca/')).text()).toContain('No prediction yet.');
  });

  it('shows prediction with new data model', async () => {
    await env.PREDICTIONS.put('latest_prediction', JSON.stringify({
      gas: { direction: 'up', adjustment: 3.6, price: 1.621 },
      diesel: { direction: 'down', adjustment: 0.7, price: 1.544 },
      notes: null,
      updated_at: new Date().toISOString(),
    }));
    const html = await (await SELF.fetch('https://hfxgas.ca/')).text();
    expect(html).toContain('+3.6¢');
    expect(html).toContain('\u2191');
  });

  it('shows image section when key set', async () => {
    await env.PREDICTIONS.put('latest_prediction', JSON.stringify({
      gas: { direction: 'up', adjustment: 3.6, price: 1.621 },
      diesel: null,
      notes: null,
      updated_at: new Date().toISOString(),
    }));
    await env.PREDICTIONS.put('latest_image_key', 'images/abc123.png');
    const html = await (await SELF.fetch('https://hfxgas.ca/')).text();
    expect(html).toContain('image-section');
    expect(html).toContain('abc123.png');
  });

  it('hides history when empty', async () => {
    expect(await (await SELF.fetch('https://hfxgas.ca/')).text()).toContain('display:none');
  });
});

describe('GET /api/latest', () => {
  beforeEach(async () => { await env.PREDICTIONS.delete('latest_prediction'); });

  it('null when empty', async () => {
    expect(await (await SELF.fetch('https://hfxgas.ca/api/latest')).json()).toBeNull();
  });

  it('returns prediction JSON', async () => {
    await env.PREDICTIONS.put('latest_prediction', JSON.stringify({
      gas: { direction: 'down', adjustment: 1.1, price: 1.55 },
      diesel: null,
      updated_at: new Date().toISOString(),
    }));
    const data = await (await SELF.fetch('https://hfxgas.ca/api/latest')).json();
    expect(data.gas.direction).toBe('down');
  });
});

describe('GET /robots.txt', () => {
  it('200 text/plain with allow all', async () => {
    const text = await (await SELF.fetch('https://hfxgas.ca/robots.txt')).text();
    expect(text).toContain('User-agent: *');
    expect(text).toContain('Allow: /');
    expect(text).toContain('Sitemap:');
  });
});

describe('GET /sitemap.xml', () => {
  it('200 valid XML', async () => {
    const text = await (await SELF.fetch('https://hfxgas.ca/sitemap.xml')).text();
    expect(text).toContain('<urlset');
    expect(text).toContain('hfxgas.ca');
  });
});

describe('GET /llms.txt', () => {
  it('200 with attribution', async () => {
    const text = await (await SELF.fetch('https://hfxgas.ca/llms.txt')).text();
    expect(text).toContain('u/buckit');
    expect(text).toContain('r/halifax');
    expect(text).toContain('program-the-brain-not-the-heartbeat');
  });
});

describe('GET /images/:key', () => {
  it('404 when not in R2', async () => {
    expect((await SELF.fetch('https://hfxgas.ca/images/notfound.png')).status).toBe(404);
  });
});

describe('404 routing', () => {
  it('unknown path → 404', async () => { expect((await SELF.fetch('https://hfxgas.ca/unknown')).status).toBe(404); });
  it('POST / → 404', async () => { expect((await SELF.fetch('https://hfxgas.ca/', { method: 'POST' })).status).toBe(404); });
  it('DELETE /webhook → 404', async () => { expect((await SELF.fetch('https://hfxgas.ca/webhook', { method: 'DELETE' })).status).toBe(404); });
});

// ── POST /webhook ──────────────────────────────────────────────────────────────

describe('POST /webhook', () => {
  beforeEach(async () => {
    await env.PREDICTIONS.delete('latest_prediction');
    await env.PREDICTIONS.delete('prediction_history');
  });

  function makeReq(payload, secret) {
    return new Request('https://hfxgas.ca/webhook', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${secret}` },
      body: JSON.stringify(payload),
    });
  }

  // ── New format (gas/diesel objects) ────────────────────────────────────────
  const newFormat = {
    gas: { direction: 'up', adjustment: 3.6, price: 1.621 },
    diesel: { direction: 'down', adjustment: 0.7, price: 1.544 },
    notes: 'Fill up.',
  };

  it('200 new format: bearer token', async () => {
    expect((await SELF.fetch(makeReq(newFormat, 'test-secret'))).status).toBe(200);
  });

  it('400 ?secret= query param rejected (use Bearer header instead)', async () => {
    const res = await SELF.fetch(new Request('https://hfxgas.ca/webhook?secret=test-secret', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(newFormat),
    }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('Authorization');
  });

  it('writes gas+diesel to KV with new format', async () => {
    await SELF.fetch(makeReq(newFormat, 'test-secret'));
    const stored = JSON.parse(await env.PREDICTIONS.get('latest_prediction'));
    expect(stored.gas.direction).toBe('up');
    expect(stored.diesel.direction).toBe('down');
    expect(stored.source).toBe('webhook');
  });

  it('new format: no-change direction accepted', async () => {
    const payload = { gas: { direction: 'no-change', price: 1.275 } };
    expect((await SELF.fetch(makeReq(payload, 'test-secret'))).status).toBe(200);
  });

  it('new format: 400 invalid gas direction', async () => {
    const payload = { gas: { direction: 'sideways', price: 1.5 } };
    expect((await SELF.fetch(makeReq(payload, 'test-secret'))).status).toBe(400);
  });

  it('new format: 400 invalid diesel direction', async () => {
    const payload = { diesel: { direction: 'bad', price: 1.5 } };
    expect((await SELF.fetch(makeReq(payload, 'test-secret'))).status).toBe(400);
  });

  it('new format: 400 non-number gas price', async () => {
    const payload = { gas: { direction: 'up', price: 'lots' } };
    expect((await SELF.fetch(makeReq(payload, 'test-secret'))).status).toBe(400);
  });

  // ── Legacy format (direction, predicted_price, fuel_type) ──────────────────
  const legacyValid = { direction: 'up', current_price: 1.659, predicted_price: 1.719, fuel_type: 'gas', notes: 'Fill up.' };

  it('200 legacy format: bearer token', async () => {
    expect((await SELF.fetch(makeReq(legacyValid, 'test-secret'))).status).toBe(200);
  });

  it('legacy format: writes gas slot', async () => {
    await SELF.fetch(makeReq(legacyValid, 'test-secret'));
    const stored = JSON.parse(await env.PREDICTIONS.get('latest_prediction'));
    expect(stored.gas.direction).toBe('up');
    expect(stored.gas.price).toBeCloseTo(1.719);
  });

  it('legacy format: no-change direction accepted', async () => {
    const payload = { ...legacyValid, direction: 'no-change' };
    expect((await SELF.fetch(makeReq(payload, 'test-secret'))).status).toBe(200);
  });

  it('legacy format: diesel fuel_type → diesel slot', async () => {
    const payload = { ...legacyValid, fuel_type: 'diesel' };
    await SELF.fetch(makeReq(payload, 'test-secret'));
    const stored = JSON.parse(await env.PREDICTIONS.get('latest_prediction'));
    expect(stored.diesel.direction).toBe('up');
    expect(stored.gas).toBeNull();
  });

  it('legacy format: fuel_type defaults to gas', async () => {
    const { fuel_type: _, ...noFuel } = legacyValid;
    await SELF.fetch(makeReq(noFuel, 'test-secret'));
    const stored = JSON.parse(await env.PREDICTIONS.get('latest_prediction'));
    expect(stored.gas.direction).toBe('up');
  });

  it('legacy format: 400 invalid direction', async () => {
    expect((await SELF.fetch(makeReq({ ...legacyValid, direction: 'sideways' }, 'test-secret'))).status).toBe(400);
  });

  it('legacy format: 400 invalid fuel_type', async () => {
    expect((await SELF.fetch(makeReq({ ...legacyValid, fuel_type: 'jet' }, 'test-secret'))).status).toBe(400);
  });

  it('legacy format: 400 non-number predicted_price', async () => {
    expect((await SELF.fetch(makeReq({ ...legacyValid, predicted_price: 'lots' }, 'test-secret'))).status).toBe(400);
  });

  it('legacy format: 400 non-number current_price', async () => {
    expect((await SELF.fetch(makeReq({ ...legacyValid, current_price: 'some' }, 'test-secret'))).status).toBe(400);
  });

  // ── Auth ───────────────────────────────────────────────────────────────────
  it('401 wrong secret', async () => { expect((await SELF.fetch(makeReq(newFormat, 'wrong'))).status).toBe(401); });
  it('401 no secret', async () => {
    const res = await SELF.fetch(new Request('https://hfxgas.ca/webhook', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(newFormat),
    }));
    expect(res.status).toBe(401);
  });
  it('400 invalid JSON', async () => {
    const res = await SELF.fetch(new Request('https://hfxgas.ca/webhook', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer test-secret' },
      body: 'not json',
    }));
    expect(res.status).toBe(400);
  });

  // ── Shared ─────────────────────────────────────────────────────────────────
  it('updated_at is ISO 8601', async () => {
    await SELF.fetch(makeReq(newFormat, 'test-secret'));
    const stored = JSON.parse(await env.PREDICTIONS.get('latest_prediction'));
    expect(new Date(stored.updated_at).toISOString()).toBe(stored.updated_at);
  });

  it('notes absent → null', async () => {
    const { notes: _, ...noNotes } = newFormat;
    await SELF.fetch(makeReq(noNotes, 'test-secret'));
    expect(JSON.parse(await env.PREDICTIONS.get('latest_prediction')).notes).toBeNull();
  });
});

// ── Scheduled handler ─────────────────────────────────────────────────────────

describe('scheduled()', () => {
  beforeEach(async () => {
    await env.PREDICTIONS.delete('latest_prediction');
    await env.PREDICTIONS.delete('prediction_history');
    await env.PREDICTIONS.delete('last_processed_post_id');
    await env.PREDICTIONS.delete('latest_image_key');
  });

  // Post with table format (matches real /u/buckit posts)
  function tablePost(overrides = {}) {
    return {
      id: 'abc123',
      author: 'buckit',
      title: 'Gas prices this week',
      selftext: '|Type|Adjustment|New Min Price|\n:--|:--|:--|\n|Regular| UP 3.6 |162.1|\n|Diesel| DOWN 0.7 |154.4|\nFill up tonight.',
      permalink: '/r/halifax/comments/abc123/gas_prices/',
      created_utc: Math.floor(Date.now() / 1000) - 3600,
      subreddit: 'halifax',
      ...overrides,
    };
  }

  // Post with free-text format (older posts)
  function textPost(overrides = {}) {
    return {
      id: 'abc123',
      author: 'buckit',
      title: 'Gas prices going up this week - currently $1.659/L, next week $1.719/L',
      selftext: 'Fill up tonight if you can.',
      permalink: '/r/halifax/comments/abc123/gas_prices/',
      created_utc: Math.floor(Date.now() / 1000) - 3600,
      subreddit: 'halifax',
      ...overrides,
    };
  }

  function envWithAI() {
    return {
      ...env,
      AI: { run: vi.fn().mockResolvedValue({ image: btoa('fake-png') }) },
      IMAGES: { get: vi.fn().mockResolvedValue(null), put: vi.fn() },
    };
  }

  // Helper: build a fetch mock that discriminates by URL.
  // new.json → returns the buckit post listing; top.json → returns community context posts.
  function mockFetchForScheduled(post = null) {
    return vi.fn().mockImplementation((url) => {
      if (url.includes('new.json')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ data: { children: post ? [{ data: post }] : [] } }),
        });
      }
      // top.json (community context) — return a couple of sample titles
      return Promise.resolve({
        ok: true,
        json: async () => ({
          data: {
            children: [
              { data: { title: 'Pothole on Quinpool' } },
              { data: { title: 'Bridge closure update' } },
            ],
          },
        }),
      });
    });
  }

  it('no-op when no matching post', async () => {
    global.fetch = mockFetchForScheduled(null);
    await worker.scheduled({}, env, {});
    expect(await env.PREDICTIONS.get('latest_prediction')).toBeNull();
  });

  it('no-op for already-processed (dedup)', async () => {
    await env.PREDICTIONS.put('last_processed_post_id', 'abc123');
    global.fetch = mockFetchForScheduled(tablePost());
    await worker.scheduled({}, env, {});
    expect(await env.PREDICTIONS.get('latest_prediction')).toBeNull();
  });

  it('handles Reddit 429 gracefully', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 429 });
    await expect(worker.scheduled({}, env, {})).resolves.not.toThrow();
    expect(await env.PREDICTIONS.get('latest_prediction')).toBeNull();
  });

  it('processes table-format post: gas+diesel stored', async () => {
    const e = envWithAI();
    global.fetch = mockFetchForScheduled(tablePost());
    await worker.scheduled({}, e, {});
    const stored = JSON.parse(await env.PREDICTIONS.get('latest_prediction'));
    expect(stored.gas.direction).toBe('up');
    expect(stored.gas.price).toBeCloseTo(1.621);
    expect(stored.diesel.direction).toBe('down');
    expect(stored.diesel.price).toBeCloseTo(1.544);
    expect(stored.source).toBe('reddit');
  });

  it('processes free-text post: gas stored', async () => {
    const e = envWithAI();
    global.fetch = mockFetchForScheduled(textPost());
    await worker.scheduled({}, e, {});
    const stored = JSON.parse(await env.PREDICTIONS.get('latest_prediction'));
    expect(stored.gas.direction).toBe('up');
    expect(stored.gas.price).toBeCloseTo(1.719);
  });

  it('writes last_processed_post_id', async () => {
    const e = envWithAI();
    global.fetch = mockFetchForScheduled(tablePost());
    await worker.scheduled({}, e, {});
    expect(await env.PREDICTIONS.get('last_processed_post_id')).toBe('abc123');
  });

  it('caps history at MAX_HISTORY', async () => {
    const existing = Array.from({ length: 10 }, (_, i) => ({
      gas: { direction: 'up', price: 1.5 + i * 0.01 },
      diesel: null,
      updated_at: new Date().toISOString(),
    }));
    await env.PREDICTIONS.put('prediction_history', JSON.stringify(existing));
    const e = envWithAI();
    global.fetch = mockFetchForScheduled(tablePost());
    await worker.scheduled({}, e, {});
    const history = JSON.parse(await env.PREDICTIONS.get('prediction_history'));
    expect(history.length).toBe(10);
  });

  it('no image key when AI returns no image', async () => {
    const e = { ...env, AI: { run: vi.fn().mockResolvedValue({ image: null }) }, IMAGES: { get: vi.fn(), put: vi.fn() } };
    global.fetch = mockFetchForScheduled(tablePost());
    await worker.scheduled({}, e, {});
    expect(await env.PREDICTIONS.get('latest_image_key')).toBeNull();
  });

  it('no image generated for no-change direction', async () => {
    const e = { ...env, AI: { run: vi.fn() }, IMAGES: { get: vi.fn(), put: vi.fn() } };
    const noChangePost = tablePost({
      selftext: '|Type|Adjustment|New Min Price|\n:--|:--|:--|\n|Regular| NO CHANGE |127.5|\n|Diesel| NO CHANGE |154.4|',
    });
    global.fetch = mockFetchForScheduled(noChangePost);
    await worker.scheduled({}, e, {});
    expect(e.AI.run).not.toHaveBeenCalled();
  });

  it('ignores non-buckit author', async () => {
    global.fetch = mockFetchForScheduled(tablePost({ author: 'someoneelse' }));
    await worker.scheduled({}, env, {});
    expect(await env.PREDICTIONS.get('latest_prediction')).toBeNull();
  });

  it('accepts Buckit (capital B) author', async () => {
    const e = envWithAI();
    global.fetch = mockFetchForScheduled(tablePost({ author: 'Buckit' }));
    await worker.scheduled({}, e, {});
    expect(await env.PREDICTIONS.get('latest_prediction')).not.toBeNull();
  });

  it('ignores posts older than 7 days', async () => {
    global.fetch = mockFetchForScheduled(tablePost({ created_utc: Math.floor(Date.now() / 1000) - 8 * 86400 }));
    await worker.scheduled({}, env, {});
    expect(await env.PREDICTIONS.get('latest_prediction')).toBeNull();
  });

  it('accepts posts from any day of week (interrupter clause)', async () => {
    // Post 3 days old (not a Thursday window)
    const e = envWithAI();
    const recentPost = tablePost({ created_utc: Math.floor(Date.now() / 1000) - 3 * 86400 });
    global.fetch = mockFetchForScheduled(recentPost);
    await worker.scheduled({}, e, {});
    expect(await env.PREDICTIONS.get('latest_prediction')).not.toBeNull();
  });

  it('AI prompt includes community context from top posts', async () => {
    const e = envWithAI();
    global.fetch = mockFetchForScheduled(tablePost());
    await worker.scheduled({}, e, {});
    // The AI.run should have been called with a prompt containing community context
    const promptArg = e.AI.run.mock.calls[0][1].prompt;
    expect(promptArg).toContain('This week in Halifax and Nova Scotia');
    expect(promptArg).toContain('Pothole on Quinpool');
  });
});
