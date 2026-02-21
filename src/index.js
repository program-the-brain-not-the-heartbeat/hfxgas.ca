/**
 * Buckit — Halifax Gas Price Prediction
 * Cloudflare Worker: cron scraper + display website
 *
 * Author: program-the-brain-not-the-heartbeat
 * License: MIT
 * Repo: https://github.com/program-the-brain-not-the-heartbeat/buckit
 *
 * DISCLAIMER: Prediction data sourced from publicly available Reddit posts by
 * /u/buckit on r/halifax. This site has no affiliation with /u/buckit.
 * No warranty of accuracy. Not financial advice. No tracking. Use at your own risk.
 *
 * MCP note: This project uses workers-mcp for the MCP server (src: mcp/server.js).
 * Future: webmcp (webmcp.dev) migration planned when Cloudflare Workers support matures.
 */

// ── Utilities ───────────────────────────────────────────────────────────────

/**
 * Apply security headers to a Response.
 * Called on every outbound response to enforce consistent security posture.
 * @param {Response} response
 * @returns {Response}
 */
export function withSecurityHeaders(response) {
  const headers = new Headers(response.headers);

  // Prevent MIME-type sniffing
  headers.set('X-Content-Type-Options', 'nosniff');

  // Deny framing entirely (clickjacking protection)
  headers.set('X-Frame-Options', 'DENY');

  // Don't send Referer on cross-origin navigations — protects any secrets in URLs
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Disable browser features this site doesn't use
  headers.set('Permissions-Policy', 'geolocation=(), microphone=(), camera=(), payment=()');

  // Content-Security-Policy:
  //   - default-src 'self'         — no unexpected external resources
  //   - script-src: allow self + Chart.js CDN + inline scripts (needed for modal/tab JS)
  //   - style-src: allow self + inline styles (used extensively in renderHtml)
  //   - img-src: allow self + data: URIs (SVG placeholders)
  //   - connect-src 'self'         — no external XHR/fetch from the page
  //   - frame-ancestors 'none'     — belt-and-suspenders alongside X-Frame-Options
  //   - object-src 'none'          — no Flash/plugins
  //   - base-uri 'self'            — prevent base tag injection
  headers.set(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "base-uri 'self'",
    ].join('; ')
  );

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * Escape HTML special characters to prevent XSS.
 * @param {string} str
 * @returns {string}
 */
export function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Format a UTC ISO timestamp to Halifax local time.
 * @param {string|null} iso
 * @returns {string}
 */
export function formatDate(iso) {
  if (!iso) return 'Unknown';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return 'Unknown';
    return d.toLocaleString('en-CA', {
      timeZone: 'America/Halifax',
      dateStyle: 'full',
      timeStyle: 'short',
    });
  } catch {
    return 'Unknown';
  }
}

/**
 * Format a UTC ISO timestamp as a human-readable relative string (e.g. "3 days ago").
 * @param {string|null} iso
 * @returns {string}
 */
export function formatRelativeTime(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const diff = Date.now() - d.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
    if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
    return `${days} day${days !== 1 ? 's' : ''} ago`;
  } catch {
    return '';
  }
}

/**
 * Detect the current Halifax season from a UTC Date for weather-aware image prompts.
 * @param {Date} date
 * @returns {'winter'|'spring'|'summer'|'fall'}
 */
export function getSeason(date) {
  const month = date.getUTCMonth() + 1; // 1–12, UTC to avoid timezone drift
  if (month >= 12 || month <= 2) return 'winter';
  if (month >= 3 && month <= 5) return 'spring';
  if (month >= 6 && month <= 8) return 'summer';
  return 'fall';
}

/**
 * Build a community-aware, MEME-worthy image generation prompt.
 * Uses top r/halifax + r/novascotia post titles as context when available;
 * falls back to season-based context if community context is empty.
 * @param {'up'|'down'} direction
 * @param {string} postId - used as deterministic seed context
 * @param {string[]} [communityContext] - top post titles from r/halifax + r/novascotia
 * @param {Date} [date] - used for season fallback
 * @returns {string}
 */
export function buildImagePrompt(direction, postId, communityContext = [], date = new Date()) {
  const directionLabel = direction === 'up' ? 'going UP' : 'going DOWN';
  const mood =
    direction === 'up'
      ? 'suffering, despair, Canadians crying at the pump'
      : 'celebration, relief, Canadians cheering';

  let contextStr;
  if (communityContext.length > 0) {
    // Use actual community topics from r/halifax + r/novascotia this week
    const topics = communityContext
      .slice(0, 20)
      .map((t) => t.slice(0, 60).trim())
      .join('; ');
    contextStr = 'This week in Halifax and Nova Scotia: ' + topics;
  } else {
    // Fallback: season-based context
    const season = getSeason(date);
    const weatherContexts = {
      winter: 'Halifax winter blizzard, heavy snowfall, pothole season, Canadian drivers scraping windshields',
      spring: 'Halifax spring thaw, potholes everywhere, mud season, April showers',
      summer: 'Halifax summer road trip, beach vibes, lobster season, sunny Maritime highway',
      fall: 'Halifax fall foliage, East Coast rain and wind, pre-winter anxiety, foggy Nova Scotia',
    };
    contextStr = weatherContexts[season];
  }

  return (
    `Halifax Nova Scotia gas prices ${directionLabel} this week. ${contextStr}. ` +
    `${mood}. Funny editorial cartoon meme, work-safe, vibrant flat design colours, ` +
    `bold text space at top, Canadian humour, no text in image. ` +
    `Seed context: ${postId.slice(0, 8)}.`
  );
}

// ── Reddit Parser ────────────────────────────────────────────────────────────

/**
 * Parse a single adjustment string like "UP 3.6", "DOWN 0.7", "NO CHANGE".
 * @param {string} adj
 * @returns {{ direction: 'up'|'down'|'no-change', adjustment: number|null }}
 */
export function parseAdjustment(adj) {
  const s = adj.trim().toLowerCase();
  if (/no.?change/.test(s)) return { direction: 'no-change', adjustment: 0 };
  const m = s.match(/^(up|down)\s+([\d.]+)/);
  if (m) return { direction: m[1] === 'up' ? 'up' : 'down', adjustment: parseFloat(m[2]) };
  if (/\bup\b/.test(s)) return { direction: 'up', adjustment: null };
  if (/\bdown\b/.test(s)) return { direction: 'down', adjustment: null };
  return { direction: null, adjustment: null };
}

/**
 * Parse direction and price data from a /u/buckit Reddit post.
 *
 * Handles two formats:
 *
 * 1. Markdown table (primary — used since ~2024):
 *    |Type|Adjustment|New Min Price|
 *    |Regular| UP 3.6 |162.1|
 *    |Diesel| DOWN 0.7 |154.4|
 *    Prices are in CENTS (162.1 = $1.621/L)
 *
 * 2. Free-text fallback (older posts):
 *    "Gas prices going up this week - currently $1.659/L, next week $1.719/L"
 *
 * @param {{ title: string, selftext: string }} post
 * @returns {{
 *   gas: { direction: 'up'|'down'|'no-change'|null, adjustment: number|null, price: number|null }|null,
 *   diesel: { direction: 'up'|'down'|'no-change'|null, adjustment: number|null, price: number|null }|null,
 *   notes: string|null,
 * }}
 */
export function parseRedditPost(post) {
  const selftext = post.selftext ?? '';
  const fullText = `${post.title} ${selftext}`;

  // ── Strategy 1: markdown table ──────────────────────────────────────────
  // Match rows like: |Regular| UP 3.6 |162.1|  or  |Diesel| NO CHANGE |154.4|
  // Also handles "Gas" / "Gasoline" synonyms for the Regular row.
  const tableRowRe = /\|\s*(regular|gas(?:oline)?|diesel)\s*\|\s*([^|]+)\|\s*([\d.]+)\s*\|/gi;
  let gas = null;
  let diesel = null;
  let tableMatch;

  while ((tableMatch = tableRowRe.exec(fullText)) !== null) {
    const typeRaw = tableMatch[1].toLowerCase();
    const adjRaw = tableMatch[2];
    const priceRaw = parseFloat(tableMatch[3]);
    // Prices in the table are in CENTS (e.g. 162.1 → $1.621/L)
    const priceInDollars = priceRaw > 10 ? priceRaw / 100 : priceRaw;
    const parsed = parseAdjustment(adjRaw);

    if (typeRaw === 'diesel') {
      diesel = { ...parsed, price: isNaN(priceInDollars) ? null : priceInDollars };
    } else {
      // regular / gas / gasoline → gas slot
      gas = { ...parsed, price: isNaN(priceInDollars) ? null : priceInDollars };
    }
  }

  // ── Strategy 2: free-text fallback ─────────────────────────────────────
  if (!gas && !diesel) {
    const textLower = fullText.toLowerCase();
    let direction = null;
    if (/\bup\b|increas|higher|rise|raising/.test(textLower)) direction = 'up';
    if (/\bdown\b|decreas|lower|drop|fall|reduc/.test(textLower)) direction = 'down';
    if (/no.?change/.test(textLower)) direction = 'no-change';

    // Price extraction — $X.XXX or $X.XX (dollar format in free-text posts)
    const priceRe = /\$(\d+\.\d{2,3})/g;
    const prices = [];
    let pm;
    while ((pm = priceRe.exec(fullText)) !== null) prices.push(parseFloat(pm[1]));

    const price = prices.length >= 2 ? prices[1] : prices[0] ?? null;
    const slot = { direction, adjustment: null, price };

    if (/diesel/.test(textLower)) {
      diesel = slot;
    } else {
      gas = slot;
    }
  }

  // ── Notes: last non-table line of selftext ──────────────────────────────
  // Strip the markdown table lines; whatever remains is human-written context.
  const notesLines = selftext
    .split('\n')
    .filter((l) => !/^\|/.test(l.trim()) && !/^:-/.test(l.trim()))
    .join(' ')
    .trim();
  const notes = notesLines.length > 0 ? notesLines.slice(0, 500) : null;

  return { gas, diesel, notes };
}

// ── Reddit Scraper ───────────────────────────────────────────────────────────

/**
 * Fetch the latest posts from r/halifax and return the most recent /u/buckit fuel post.
 * @param {object} env
 * @returns {Promise<object|null>}
 */
async function fetchBuckitPost(env) {
  const url = `https://www.reddit.com/r/${env.REDDIT_SUBREDDIT}/new.json?limit=100`;
  const res = await fetch(url, {
    headers: { 'User-Agent': env.REDDIT_USER_AGENT },
  });

  if (!res.ok) {
    console.error(`Reddit fetch failed: ${res.status}`);
    return null;
  }

  const data = await res.json();
  const posts = data?.data?.children ?? [];

  // Match weekly gas posts AND interrupter clause posts (can happen any day).
  // We look back 7 days to avoid missing anything; dedup in scheduled() prevents reprocessing.
  const sevenDaysAgo = Date.now() / 1000 - 7 * 86400;
  const fuelKeywords = /gas|gasoline|diesel|fuel|price|interrupter/i;

  return (
    posts
      .map((c) => c.data)
      .find(
        (p) =>
          p.author.toLowerCase() === env.REDDIT_AUTHOR.toLowerCase() &&
          fuelKeywords.test(p.title) &&
          p.created_utc > sevenDaysAgo
      ) ?? null
  );
}

// ── Community Context Fetch ───────────────────────────────────────────────────

/**
 * Fetch top community post titles from r/halifax and r/novascotia for image prompt context.
 * Runs both fetches in parallel via Promise.allSettled; gracefully handles individual failures.
 * @param {object} env
 * @returns {Promise<string[]>} Up to 20 post titles (10 per subreddit)
 */
export async function fetchCommunityContext(env) {
  const subreddits = ['halifax', 'novascotia'];
  const results = await Promise.allSettled(
    subreddits.map((sub) =>
      fetch(`https://www.reddit.com/r/${sub}/top.json?t=week&limit=10`, {
        headers: { 'User-Agent': env.REDDIT_USER_AGENT },
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => data?.data?.children?.map((c) => c.data.title).filter(Boolean) ?? [])
        .catch(() => [])
    )
  );
  return results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
}

// ── AI Image Generation ──────────────────────────────────────────────────────

/**
 * Generate an AI image using Workers AI and store it in R2.
 * Falls back to a deterministic SVG placeholder on failure.
 * @param {string} postId
 * @param {'up'|'down'} direction
 * @param {string[]} communityContext - top post titles from r/halifax + r/novascotia
 * @param {object} env
 * @returns {Promise<string|null>} R2 key of stored image, or null on failure
 */
async function generateAndStoreImage(postId, direction, communityContext, env) {
  const prompt = buildImagePrompt(direction, postId, communityContext);
  const r2Key = `images/${postId}.png`;

  try {
    const result = await env.AI.run('@cf/black-forest-labs/flux-1-schnell', {
      prompt,
      num_steps: 4,
    });

    if (!result?.image) {
      console.error('AI image generation returned no image');
      return null;
    }

    // Workers AI returns base64; decode to bytes for R2
    const imageBytes = Uint8Array.from(atob(result.image), (c) => c.charCodeAt(0));

    await env.IMAGES.put(r2Key, imageBytes, {
      httpMetadata: { contentType: 'image/png' },
      customMetadata: { postId, direction, generatedAt: new Date().toISOString() },
    });

    return r2Key;
  } catch (err) {
    console.error('Image generation failed:', err);
    return null;
  }
}

// ── KV Helpers ───────────────────────────────────────────────────────────────

/**
 * Write a new prediction to KV (latest + history).
 * @param {object} prediction
 * @param {object} env
 */
async function writePrediction(prediction, env) {
  const maxHistory = parseInt(env.MAX_HISTORY ?? '10', 10);

  await env.PREDICTIONS.put('latest_prediction', JSON.stringify(prediction));

  const raw = await env.PREDICTIONS.get('prediction_history');
  const history = raw ? JSON.parse(raw) : [];
  history.unshift(prediction);
  if (history.length > maxHistory) history.splice(maxHistory);
  await env.PREDICTIONS.put('prediction_history', JSON.stringify(history));
}

// ── HTML Renderer ────────────────────────────────────────────────────────────

/**
 * Build Chart.js dataset JSON for gas + diesel price history.
 * @param {Array<object>} history
 * @returns {{ labels: string[], gasData: (number|null)[], dieselData: (number|null)[] }}
 */
export function buildChartData(history) {
  const reversed = [...history].reverse();
  const labels = reversed.map((h, i) => {
    if (h.updated_at) {
      try {
        const d = new Date(h.updated_at);
        return d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric', timeZone: 'America/Halifax' });
      } catch { /* fall through */ }
    }
    return `#${i + 1}`;
  });
  const gasData = reversed.map((h) => h.gas?.price ?? null);
  const dieselData = reversed.map((h) => h.diesel?.price ?? null);
  return { labels, gasData, dieselData };
}

/**
 * Render a single fuel card (gas or diesel) for the sign board.
 * @param {'gas'|'diesel'} type
 * @param {{ direction: string|null, adjustment: number|null, price: number|null }|null} slot
 * @returns {string}
 */
function renderFuelCard(type, slot) {
  const label = type === 'gas' ? 'Regular' : 'Diesel';
  const hasSlot = slot !== null;
  const dir = slot?.direction ?? null;
  const isUp = dir === 'up';
  const isDown = dir === 'down';
  const isNoChange = dir === 'no-change';

  const accentColor = isUp ? 'var(--color-up)' : isDown ? 'var(--color-down)' : 'var(--color-neutral)';
  const bgColor = isUp ? 'var(--color-up-bg)' : isDown ? 'var(--color-down-bg)' : 'var(--color-neutral-bg)';
  const borderColor = isUp ? 'var(--color-up-border)' : isDown ? 'var(--color-down-border)' : 'var(--color-neutral-border)';

  const arrowChar = isUp ? '↑' : isDown ? '↓' : isNoChange ? '=' : '–';
  const arrowLabel = isUp ? 'Price going up' : isDown ? 'Price going down' : isNoChange ? 'No change' : 'No prediction';

  // Hero: the adjustment delta is the most important number
  const adjDisplay = (isUp || isDown) && slot?.adjustment != null
    ? `${isUp ? '+' : '−'}${slot.adjustment.toFixed(1)}¢`
    : isNoChange ? 'No Change' : '–';

  const priceDisplay = slot?.price != null ? `$${slot.price.toFixed(3)}/L` : '';

  const dirLabelText = isUp ? '▲ UP' : isDown ? '▼ DOWN' : isNoChange ? '= NO CHANGE' : '';

  return `<div class="fuel-card fuel-card--${type}${!hasSlot ? ' fuel-card--empty' : ''}" data-dir="${escapeHtml(dir ?? 'none')}">
  <div class="fuel-card-header">
    <span class="fuel-type-badge">${escapeHtml(label.toUpperCase())}</span>
    ${dirLabelText ? `<span class="fuel-dir-label" style="color:${accentColor};background:${bgColor};border-color:${borderColor}">${escapeHtml(dirLabelText)}</span>` : ''}
  </div>
  <div class="fuel-card-body">
    <span class="fuel-arrow" aria-label="${escapeHtml(arrowLabel)}" style="color:${accentColor};filter:${(isUp || isDown) ? `drop-shadow(0 0 12px ${accentColor})` : 'none'}">${arrowChar}</span>
    <div class="fuel-numbers">
      <span class="fuel-adj" style="color:${accentColor}">${escapeHtml(adjDisplay)}</span>
      ${priceDisplay ? `<span class="fuel-price">${escapeHtml(priceDisplay)}</span>` : ''}
    </div>
  </div>
</div>`;
}

/**
 * Render the full website HTML.
 * @param {{ prediction: object|null, history: object[], imageKey: string|null, siteUrl: string }} opts
 * @returns {string}
 */
export function renderHtml({ prediction, history, imageKey, siteUrl }) {
  const p = prediction;
  const hasData = p !== null;

  // Derive top-level accent from gas direction, fallback diesel
  const primaryDir = p?.gas?.direction ?? p?.diesel?.direction ?? null;
  const isUp = primaryDir === 'up';
  const isDown = primaryDir === 'down';
  const accentColor = isUp ? 'var(--color-up)' : isDown ? 'var(--color-down)' : 'var(--color-neutral)';

  const updatedAt = formatDate(p?.updated_at ?? null);
  const relativeTime = formatRelativeTime(p?.updated_at ?? null);
  const notesHtml = p?.notes ? `<p class="notes">${escapeHtml(p.notes)}</p>` : '';

  // AI image
  const imageHtml = imageKey
    ? `<section class="image-section" aria-label="AI-generated prediction illustration">
        <div class="image-card">
          <img
            src="/images/${escapeHtml(imageKey.replace('images/', ''))}"
            alt="AI-generated illustration: Halifax gas prices ${isUp ? 'going up' : 'going down'} — ${getSeason(new Date())} scene"
            loading="lazy"
            decoding="async"
            class="prediction-image"
          />
        </div>
      </section>`
    : '';

  // History cards + Chart.js
  const chartData = buildChartData(history);
  const chartJson = JSON.stringify(chartData);
  const hasHistory = history.length > 0;
  const hasChartData = chartData.gasData.some((v) => v !== null) || chartData.dieselData.some((v) => v !== null);

  const historyHtml = hasHistory
    ? `<section class="history-section" aria-label="Prediction history">
        <h2 class="section-label">History</h2>
        ${hasChartData ? `<div class="chart-wrap" aria-label="Price history chart">
          <canvas id="historyChart" height="120"></canvas>
        </div>` : ''}
        <ul class="history-list" role="list">
          ${history
            .map((h, i) => {
              const gDir = h.gas?.direction;
              const dDir = h.diesel?.direction;
              const gArrow = gDir === 'up' ? '↑' : gDir === 'down' ? '↓' : gDir === 'no-change' ? '=' : '–';
              const dArrow = dDir === 'up' ? '↑' : dDir === 'down' ? '↓' : dDir === 'no-change' ? '=' : '–';
              const gColor = gDir === 'up' ? 'var(--color-up)' : gDir === 'down' ? 'var(--color-down)' : 'var(--color-neutral)';
              const dColor = dDir === 'up' ? 'var(--color-up)' : dDir === 'down' ? 'var(--color-down)' : 'var(--color-neutral)';
              const gasAdj = (gDir === 'up' || gDir === 'down') && h.gas?.adjustment != null
                ? `${gDir === 'up' ? '+' : '−'}${h.gas.adjustment.toFixed(1)}¢` : '';
              const dieselAdj = (dDir === 'up' || dDir === 'down') && h.diesel?.adjustment != null
                ? `${dDir === 'up' ? '+' : '−'}${h.diesel.adjustment.toFixed(1)}¢` : '';
              return `
              <li class="history-card" style="animation-delay: ${i * 50}ms">
                <div class="hc-fuels">
                  ${h.gas ? `<span class="hc-fuel" style="color:${gColor}" title="Regular gas">
                    <span class="hc-arrow">${gArrow}</span>
                    <span class="hc-adj">${gasAdj || (gDir === 'no-change' ? '=' : '')}</span>
                    <span class="hc-price">${h.gas.price != null ? `$${h.gas.price.toFixed(3)}` : ''}</span>
                  </span>` : ''}
                  ${h.diesel ? `<span class="hc-fuel hc-fuel--diesel" style="color:${dColor}" title="Diesel">
                    <span class="hc-arrow">${dArrow}</span>
                    <span class="hc-adj">${dieselAdj || (dDir === 'no-change' ? '=' : '')}</span>
                    <span class="hc-price">${h.diesel.price != null ? `$${h.diesel.price.toFixed(3)}` : ''}</span>
                  </span>` : ''}
                </div>
                <div class="hc-meta">
                  <span class="hc-time">${escapeHtml(formatRelativeTime(h.updated_at))}</span>
                  ${h.notes ? `<span class="hc-notes">${escapeHtml(h.notes.slice(0, 80))}${h.notes.length > 80 ? '…' : ''}</span>` : ''}
                </div>
              </li>`;
            })
            .join('')}
        </ul>
      </section>`
    : `<section class="history-section" aria-label="Prediction history" style="display:none" aria-hidden="true"></section>`;

  const ogImage = imageKey ? `${siteUrl}/images/${imageKey.replace('images/', '')}` : `${siteUrl}/og-default.png`;
  const gasSummary = p?.gas ? `gas ${p.gas.direction} to $${p.gas.price?.toFixed(3)}/L` : '';
  const dieselSummary = p?.diesel ? `diesel ${p.diesel.direction} to $${p.diesel.price?.toFixed(3)}/L` : '';
  const summaryParts = [gasSummary, dieselSummary].filter(Boolean).join(', ');
  const description = hasData
    ? `Halifax fuel prices: ${summaryParts || 'update available'}. Community estimate by u/buckit on r/halifax.`
    : 'Halifax gas price prediction — community estimate by u/buckit on r/halifax. Updated every Thursday.';

  return `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Halifax Gas Price Prediction | hfxgas.ca</title>
  <meta name="description" content="${escapeHtml(description)}" />
  <link rel="canonical" href="${escapeHtml(siteUrl)}" />
  <meta property="og:title" content="Halifax Gas Price Prediction | hfxgas.ca" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:url" content="${escapeHtml(siteUrl)}" />
  <meta property="og:image" content="${escapeHtml(ogImage)}" />
  <meta property="og:type" content="website" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="Halifax Gas Price Prediction | hfxgas.ca" />
  <meta name="twitter:description" content="${escapeHtml(description)}" />
  <meta name="twitter:image" content="${escapeHtml(ogImage)}" />
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "WebSite", "name": "hfxgas.ca", "url": "${siteUrl}", "description": "Halifax Nova Scotia gas and diesel price prediction, updated every Thursday." },
      { "@type": "Dataset", "name": "Halifax Gas Price Predictions",
        "description": "Weekly gas and diesel price predictions for Halifax, Nova Scotia, sourced from Reddit /u/buckit on r/halifax.",
        "url": "${siteUrl}", "creator": { "@type": "Person", "name": "u/buckit" },
        "spatialCoverage": "Halifax, Nova Scotia, Canada", "temporalCoverage": "Weekly",
        "license": "https://creativecommons.org/licenses/by/4.0/", "isBasedOn": "https://www.reddit.com/r/halifax" }
    ]
  }
  </script>
  <!-- Chart.js for price history -->
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js"></script>
  <style>
    :root {
      --background:        hsl(0 0% 100%);
      --foreground:        hsl(240 10% 3.9%);
      --card:              hsl(0 0% 100%);
      --popover:           hsl(0 0% 100%);
      --popover-foreground:hsl(240 10% 3.9%);
      --primary:           hsl(240 5.9% 10%);
      --primary-foreground:hsl(0 0% 98%);
      --secondary:         hsl(240 4.8% 95.9%);
      --muted:             hsl(240 4.8% 95.9%);
      --muted-foreground:  hsl(240 3.8% 46.1%);
      --border:            hsl(240 5.9% 90%);
      --ring:              hsl(240 5.9% 10%);
      --radius:            0.5rem;
      --color-up:          hsl(20 90% 48%);
      --color-up-bg:       hsl(20 90% 97%);
      --color-up-border:   hsl(20 80% 88%);
      --color-down:        hsl(142 69% 36%);
      --color-down-bg:     hsl(142 60% 96%);
      --color-down-border: hsl(142 55% 84%);
      --color-neutral:     hsl(240 4% 52%);
      --color-neutral-bg:  hsl(240 4% 96%);
      --color-neutral-border:hsl(240 4% 86%);
      --sign-bg:           hsl(240 10% 8%);
      --sign-border:       hsl(240 8% 18%);
      --sign-scanline:     hsl(0 0% 0% / 0.07);
      --font-sans: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif;
      --font-mono: ui-monospace, 'Cascadia Code', 'SF Mono', monospace;
      --font-display: 'Arial Black', 'Arial Bold', 'Trebuchet MS', Arial, sans-serif;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --background:        hsl(240 10% 3.9%);
        --foreground:        hsl(0 0% 98%);
        --card:              hsl(240 8% 7%);
        --popover:           hsl(240 10% 6%);
        --popover-foreground:hsl(0 0% 98%);
        --primary:           hsl(0 0% 98%);
        --secondary:         hsl(240 3.7% 15.9%);
        --muted:             hsl(240 3.7% 15.9%);
        --muted-foreground:  hsl(240 5% 64.9%);
        --border:            hsl(240 3.7% 15.9%);
        --ring:              hsl(240 4.9% 83.9%);
        --color-up:          hsl(20 90% 60%);
        --color-up-bg:       hsl(20 80% 12%);
        --color-up-border:   hsl(20 70% 22%);
        --color-down:        hsl(142 65% 48%);
        --color-down-bg:     hsl(142 50% 10%);
        --color-down-border: hsl(142 50% 20%);
        --color-neutral:     hsl(240 5% 58%);
        --color-neutral-bg:  hsl(240 5% 14%);
        --color-neutral-border:hsl(240 5% 22%);
        --sign-bg:           hsl(240 12% 5%);
        --sign-border:       hsl(240 8% 14%);
      }
    }
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html { font-size: 100%; -webkit-text-size-adjust: 100%; }
    body { font-family: var(--font-sans); background: var(--background); color: var(--foreground); min-height: 100dvh; display: flex; flex-direction: column; line-height: 1.5; -webkit-font-smoothing: antialiased; }
    img { max-width: 100%; height: auto; display: block; }
    ul { list-style: none; }
    a { color: inherit; }
    main { flex: 1; width: 100%; max-width: 640px; margin: 0 auto; padding: clamp(1.25rem,4vw,2rem) clamp(0.875rem,4vw,1.25rem); display: flex; flex-direction: column; gap: 0.875rem; }

    /* Wordmark */
    .wordmark { display: flex; align-items: center; justify-content: space-between; padding: 0 0.125rem; }
    .wordmark-logo { font-family: var(--font-display); font-size: clamp(1.35rem,4vw,1.6rem); font-weight: 900; letter-spacing: -0.04em; color: var(--foreground); text-decoration: none; line-height: 1; }
    .wordmark-logo span { color: var(--muted-foreground); font-weight: 700; }

    /* Sign board */
    .sign-board { background: var(--sign-bg); border: 1px solid var(--sign-border); border-radius: calc(var(--radius)*2); overflow: hidden; position: relative; box-shadow: inset 0 1px 0 hsl(0 0% 100%/0.04), 0 1px 3px hsl(0 0% 0%/0.12), 0 4px 16px hsl(0 0% 0%/0.1); }
    .sign-board::before { content:''; position:absolute; inset:0; background:repeating-linear-gradient(0deg,transparent,transparent 3px,var(--sign-scanline) 3px,var(--sign-scanline) 4px); pointer-events:none; z-index:2; }
    .sign-board::after { content:''; position:absolute; top:0; left:0; right:0; height:3px; background:${accentColor}; box-shadow:0 0 16px ${accentColor}; z-index:3; }
    .sign-inner { position:relative; z-index:1; padding:clamp(1.5rem,5vw,2.5rem) clamp(1rem,4vw,2rem) clamp(1.25rem,4vw,2rem); display:flex; flex-direction:column; align-items:center; text-align:center; gap:0; }

    /* Fuel cards side-by-side */
    .fuel-cards { display:grid; grid-template-columns:1fr 1fr; gap:0.75rem; width:100%; margin-bottom:1rem; }
    @media (max-width:340px) { .fuel-cards { grid-template-columns:1fr; } }
    .fuel-card { background:hsl(240 8% 11%); border:1px solid hsl(240 6% 20%); border-radius:calc(var(--radius)*1.25); padding:0.875rem 1rem 1rem; display:flex; flex-direction:column; gap:0.5rem; }
    .fuel-card[data-dir="up"]        { border-color:hsl(20 50% 28%); }
    .fuel-card[data-dir="down"]      { border-color:hsl(142 40% 22%); }
    .fuel-card[data-dir="no-change"] { border-color:hsl(240 5% 26%); }
    .fuel-card--empty { opacity:0.4; }
    .fuel-card-header { display:flex; align-items:center; justify-content:space-between; gap:0.5rem; }
    .fuel-type-badge { font-family:var(--font-mono); font-size:0.6rem; font-weight:700; letter-spacing:0.12em; color:hsl(240 5% 52%); text-transform:uppercase; }
    .fuel-dir-label { font-family:var(--font-mono); font-size:0.56rem; font-weight:700; letter-spacing:0.1em; text-transform:uppercase; border:1px solid; border-radius:9999px; padding:0.15rem 0.5rem; }
    .fuel-card-body { display:flex; align-items:center; gap:0.5rem; }
    .fuel-arrow { font-size:clamp(2.5rem,10vw,3.5rem); line-height:0.85; font-weight:900; font-family:var(--font-display); flex-shrink:0; }
    .fuel-numbers { display:flex; flex-direction:column; align-items:flex-start; gap:0.1rem; min-width:0; }
    /* Hero: adjustment delta */
    .fuel-adj { font-size:clamp(1.25rem,5.5vw,1.875rem); font-weight:900; font-family:var(--font-display); line-height:1; letter-spacing:-0.02em; white-space:nowrap; font-variant-numeric:tabular-nums; }
    /* Secondary: absolute price */
    .fuel-price { font-size:0.75rem; color:hsl(240 5% 46%); font-family:var(--font-mono); font-variant-numeric:tabular-nums; white-space:nowrap; }

    /* Sign meta */
    .sign-meta { display:flex; flex-direction:column; align-items:center; gap:0.2rem; width:100%; }
    .updated-at { font-size:0.68rem; color:hsl(240 4% 36%); margin-bottom:0.2rem; }
    .notes { font-size:0.77rem; color:hsl(240 4% 44%); max-width:38ch; line-height:1.6; margin-bottom:0.5rem; padding:0.4rem 0.7rem; background:hsl(240 6% 12%); border-left:2px solid ${accentColor}50; border-radius:0 calc(var(--radius)*0.6) calc(var(--radius)*0.6) 0; text-align:left; font-style:italic; }
    .disclaimer { font-size:0.67rem; color:hsl(240 4% 32%); line-height:1.7; }
    .disclaimer a { color:hsl(240 4% 42%); text-decoration:underline; text-underline-offset:2px; }
    .disclaimer a:hover { color:hsl(240 5% 60%); }

    /* Empty state */
    .empty-state { display:flex; flex-direction:column; align-items:center; gap:0.75rem; padding:1rem 0; width:100%; }
    .empty-pump { color:hsl(240 5% 28%); }
    .empty-state h2 { font-size:1.2rem; font-weight:700; color:hsl(240 5% 50%); font-family:var(--font-display); }
    .empty-state p { font-size:0.8rem; color:hsl(240 4% 38%); max-width:26ch; text-align:center; line-height:1.6; }
    .thursday-badge { font-family:var(--font-mono); font-size:0.62rem; font-weight:700; letter-spacing:0.12em; text-transform:uppercase; color:hsl(240 4% 38%); border:1px dashed hsl(240 5% 26%); border-radius:9999px; padding:0.2rem 0.7rem; }

    /* AI image */
    .image-card { background:var(--card); border:1px solid var(--border); border-radius:calc(var(--radius)*2); padding:0.5rem; box-shadow:0 1px 3px hsl(0 0% 0%/0.06),0 4px 12px hsl(0 0% 0%/0.05); }
    .prediction-image { width:100%; border-radius:calc(var(--radius)*1.5); object-fit:cover; }

    /* History */
    .section-label { font-size:0.62rem; font-weight:600; color:var(--muted-foreground); text-transform:uppercase; letter-spacing:0.12em; margin-bottom:0.75rem; font-family:var(--font-mono); }
    .chart-wrap { background:var(--card); border:1px solid var(--border); border-radius:var(--radius); padding:0.75rem 0.875rem 0.5rem; margin-bottom:0.75rem; }
    .history-list { display:flex; flex-direction:column; gap:0.35rem; }
    .history-card { background:var(--card); border:1px solid var(--border); border-radius:var(--radius); padding:0.625rem 0.875rem; opacity:0; display:flex; align-items:center; gap:0.75rem; }
    .hc-fuels { display:flex; gap:0.75rem; flex:1; min-width:0; flex-wrap:wrap; align-items:baseline; }
    .hc-fuel { display:flex; align-items:baseline; gap:0.25rem; white-space:nowrap; }
    .hc-fuel--diesel { padding-left:0.625rem; border-left:1px solid var(--border); }
    .hc-arrow { font-size:1.05rem; font-weight:900; font-family:var(--font-display); line-height:1; }
    .hc-adj { font-size:0.8rem; font-weight:700; font-family:var(--font-display); font-variant-numeric:tabular-nums; }
    .hc-price { font-size:0.7rem; opacity:0.6; font-family:var(--font-mono); font-variant-numeric:tabular-nums; }
    .hc-meta { display:flex; flex-direction:column; align-items:flex-end; gap:0.1rem; flex-shrink:0; }
    .hc-time { font-size:0.6rem; color:var(--muted-foreground); white-space:nowrap; }
    .hc-notes { font-size:0.6rem; color:var(--muted-foreground); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:12ch; font-style:italic; }

    /* Footer */
    footer { padding:1.125rem 1rem 1.5rem; border-top:1px solid var(--border); display:flex; flex-wrap:wrap; align-items:center; justify-content:center; gap:0.2rem 0.875rem; font-size:0.775rem; color:var(--muted-foreground); }
    footer a { text-decoration:underline; text-underline-offset:2px; }
    footer a:hover { color:var(--foreground); }
    footer a:focus-visible { outline:2px solid var(--ring); outline-offset:2px; border-radius:2px; }
    .footer-sep { opacity:0.35; user-select:none; }
    .dev-link { background:none; border:none; color:var(--muted-foreground); font-size:0.775rem; cursor:pointer; text-decoration:underline; text-underline-offset:2px; font-family:var(--font-sans); padding:0; }
    .dev-link:hover { color:var(--foreground); }
    .dev-link:focus-visible { outline:2px solid var(--ring); outline-offset:2px; border-radius:2px; }

    /* Modal */
    .modal-backdrop { display:none; position:fixed; inset:0; background:hsl(0 0% 0%/0.5); backdrop-filter:blur(2px); -webkit-backdrop-filter:blur(2px); z-index:100; align-items:center; justify-content:center; padding:1rem; }
    .modal-backdrop.open { display:flex; }
    .modal { background:var(--popover); color:var(--popover-foreground); border:1px solid var(--border); border-radius:calc(var(--radius)*1.5); padding:1.5rem; width:100%; max-width:540px; max-height:85dvh; overflow-y:auto; position:relative; box-shadow:0 4px 6px hsl(0 0% 0%/0.07),0 16px 48px hsl(0 0% 0%/0.18); }
    .modal-close { position:absolute; top:0.875rem; right:0.875rem; display:flex; align-items:center; justify-content:center; width:1.75rem; height:1.75rem; background:transparent; border:none; font-size:1.1rem; cursor:pointer; color:var(--muted-foreground); border-radius:calc(var(--radius)*0.5); }
    .modal-close:hover { background:var(--muted); }
    .modal-close:focus-visible { outline:2px solid var(--ring); outline-offset:2px; }
    .modal h2 { font-size:1.1rem; font-weight:600; letter-spacing:-0.01em; margin-bottom:0.25rem; padding-right:2rem; }
    .modal-subtitle { font-size:0.825rem; color:var(--muted-foreground); margin-bottom:1.25rem; }
    .tabs { display:flex; gap:0; margin-bottom:1.25rem; border-bottom:1px solid var(--border); }
    .tab-btn { background:none; border:none; font-family:var(--font-sans); font-size:0.825rem; color:var(--muted-foreground); cursor:pointer; padding:0.5rem 0.875rem; border-bottom:2px solid transparent; margin-bottom:-1px; }
    .tab-btn.active { color:var(--foreground); border-bottom-color:var(--foreground); font-weight:500; }
    .tab-btn:hover { color:var(--foreground); }
    .tab-btn:focus-visible { outline:2px solid var(--ring); outline-offset:2px; border-radius:calc(var(--radius)*0.5); }
    .tab-panel { display:none; }
    .tab-panel.active { display:block; }
    .tab-panel p { font-size:0.825rem; color:var(--muted-foreground); margin-bottom:0.75rem; line-height:1.65; }
    .tab-panel h3 { font-size:0.65rem; text-transform:uppercase; letter-spacing:0.1em; color:var(--muted-foreground); margin-bottom:0.4rem; margin-top:1.125rem; font-family:var(--font-mono); font-weight:600; }
    .code-block { background:var(--sign-bg); border:1px solid var(--sign-border); border-radius:var(--radius); padding:0.875rem 1rem; font-family:var(--font-mono); font-size:0.775rem; overflow-x:auto; white-space:pre; position:relative; color:hsl(240 5% 72%); line-height:1.6; }
    .copy-btn { position:absolute; top:0.5rem; right:0.5rem; display:inline-flex; align-items:center; gap:0.25rem; background:var(--secondary); border:1px solid var(--border); border-radius:calc(var(--radius)*0.6); padding:0.18rem 0.5rem; font-size:0.67rem; cursor:pointer; color:var(--muted-foreground); font-family:var(--font-sans); font-weight:500; }
    .copy-btn:hover { color:var(--foreground); }
    .modal-links { display:flex; flex-direction:column; gap:0.375rem; margin-top:0.625rem; }
    .modal-links a { font-size:0.825rem; color:var(--foreground); text-underline-offset:2px; padding:0.25rem 0; }
    .modal-links a:hover { color:var(--muted-foreground); }
    .about-body h3 { font-size:0.72rem; text-transform:uppercase; letter-spacing:0.1em; color:var(--muted-foreground); margin-bottom:0.4rem; margin-top:1.125rem; font-family:var(--font-mono); font-weight:600; }
    .about-body h3:first-child { margin-top:0; }
    .about-body p { font-size:0.825rem; color:var(--muted-foreground); margin-bottom:0.625rem; line-height:1.65; }
    .about-body p:last-child { margin-bottom:0; }
    .about-body a { color:var(--foreground); text-underline-offset:2px; }
    .about-body a:hover { color:var(--muted-foreground); }

    /* Animations */
    @media (prefers-reduced-motion: no-preference) {
      .history-card { animation:fadeSlideIn 0.25s cubic-bezier(0.16,1,0.3,1) forwards; }
      @keyframes fadeSlideIn { from{opacity:0;transform:translateY(4px)} to{opacity:1;transform:translateY(0)} }
      .modal-backdrop.open .modal { animation:modalIn 0.2s cubic-bezier(0.16,1,0.3,1); }
      @keyframes modalIn { from{opacity:0;transform:translateY(6px) scale(0.98)} to{opacity:1;transform:translateY(0) scale(1)} }
      .fuel-arrow { animation:arrowBounce 2.2s cubic-bezier(0.37,0,0.63,1) infinite; }
      @keyframes arrowBounce {
        0%,100%{transform:translateY(0) scale(1)}
        40%{transform:translateY(${isUp ? '-7px' : isDown ? '7px' : '0'}) scale(${isUp || isDown ? '1.04' : '1.06'})}
        60%{transform:translateY(${isUp ? '-4px' : isDown ? '4px' : '0'}) scale(${isUp || isDown ? '1.02' : '1.03'})}
      }
      .sign-board { animation:signReveal 0.35s cubic-bezier(0.16,1,0.3,1) forwards; }
      @keyframes signReveal { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
      .wordmark { animation:fadeSlideIn 0.22s cubic-bezier(0.16,1,0.3,1) both; }
    }
    @media (prefers-reduced-motion: reduce) { .history-card{opacity:1} }

    /* Responsive */
    @media (max-width: 400px) {
      .hc-fuel--diesel { padding-left:0.4rem; }
      .hc-time { display:none; }
    }
  </style>
</head>
<body>
  <main>
    <header class="wordmark" role="banner">
      <a href="/" class="wordmark-logo" aria-label="hfxgas.ca home">hfxgas<span>.ca</span></a>
    </header>

    <!-- Sign Board -->
    <section aria-label="Current gas price prediction">
      <div class="sign-board">
        <div class="sign-inner">
          ${hasData ? `
          <div class="fuel-cards">
            ${renderFuelCard('gas', p.gas)}
            ${renderFuelCard('diesel', p.diesel)}
          </div>
          <div class="sign-meta">
            <time class="updated-at" datetime="${escapeHtml(p?.updated_at ?? '')}">
              Updated ${relativeTime} &mdash; ${updatedAt} (Halifax)
            </time>
            ${notesHtml}
          </div>
          ` : `
          <div class="empty-state">
            <svg class="empty-pump" width="64" height="64" viewBox="0 0 64 64" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
              <rect x="8" y="14" width="30" height="42" rx="3" stroke="currentColor" stroke-width="2.5" fill="none"/>
              <rect x="14" y="20" width="18" height="12" rx="2" stroke="currentColor" stroke-width="2" fill="none" opacity="0.5"/>
              <path d="M38 24 L50 18 L52 20 L52 38 Q52 42 48 42 L44 42" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
              <circle cx="46" cy="44" r="3" stroke="currentColor" stroke-width="2" fill="none"/>
              <line x1="14" y1="40" x2="32" y2="40" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity="0.4"/>
              <line x1="14" y1="46" x2="26" y2="46" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity="0.4"/>
            </svg>
            <h2>No prediction yet.</h2>
            <p>u/buckit posts every Thursday — check back soon!</p>
            <span class="thursday-badge">Updated weekly · Thursdays</span>
          </div>
          `}
          <p class="disclaimer">
            Community estimate by
            <a href="https://www.reddit.com/u/buckit" rel="noopener noreferrer" target="_blank">u/buckit</a>
            &nbsp;&middot;&nbsp; Not financial advice &nbsp;&middot;&nbsp; No tracking
          </p>
        </div>
      </div>
    </section>

    ${imageHtml}
    ${historyHtml}
  </main>

  <footer>
    <span>Prediction by
      <a href="https://www.reddit.com/u/buckit" rel="noopener noreferrer" target="_blank">u/buckit</a>
      on <a href="https://www.reddit.com/r/halifax" rel="noopener noreferrer" target="_blank">r/halifax</a>
    </span>
    <span class="footer-sep">&middot;</span>
    <button class="dev-link" id="aboutModalTrigger" aria-haspopup="dialog">About</button>
    <span class="footer-sep">&middot;</span>
    <button class="dev-link" id="devModalTrigger" aria-haspopup="dialog">Developer? Prompter?</button>
    <span class="footer-sep">&middot;</span>
    <span>Site by <a href="https://github.com/program-the-brain-not-the-heartbeat" rel="noopener noreferrer" target="_blank">program-the-brain-not-the-heartbeat</a></span>
  </footer>

  <!-- About Modal -->
  <div class="modal-backdrop" id="aboutModal" role="dialog" aria-modal="true" aria-labelledby="aboutModalTitle">
    <div class="modal">
      <button class="modal-close" id="aboutModalClose" aria-label="Close about modal">&times;</button>
      <h2 id="aboutModalTitle">About hfxgas.ca</h2>
      <p class="modal-subtitle">Halifax fuel price predictions, automated.</p>
      <div class="about-body">
        <h3>What is this?</h3>
        <p>Every Thursday, a Reddit user named <a href="https://www.reddit.com/u/buckit" rel="noopener noreferrer" target="_blank">u/buckit</a> posts the upcoming week&rsquo;s Halifax gas and diesel price predictions to <a href="https://www.reddit.com/r/halifax" rel="noopener noreferrer" target="_blank">r/halifax</a>. This site automatically finds that post, reads the numbers, and displays them in a clean format — so you don&rsquo;t have to dig through Reddit.</p>
        <h3>How does it work?</h3>
        <p>A <a href="https://workers.cloudflare.com/" rel="noopener noreferrer" target="_blank">Cloudflare Worker</a> runs four times every Thursday. It fetches the newest posts from r/halifax, looks for u/buckit&rsquo;s prediction, parses the markdown table for regular and diesel prices, then stores the result and updates this page — all automatically, with no human in the loop.</p>
        <p>The site also handles <strong>interrupter clause</strong> posts — when the Nova Scotia Utility and Review Board issues an emergency mid-week rate adjustment, those posts are caught too, any day of the week.</p>
        <h3>The meme image</h3>
        <p>When prices go up or down (not &ldquo;no change&rdquo;), the Worker generates a meme image using <a href="https://developers.cloudflare.com/workers-ai/" rel="noopener noreferrer" target="_blank">Cloudflare Workers AI</a> — specifically the <strong>Flux&nbsp;1&nbsp;Schnell</strong> text-to-image model, which runs entirely in Cloudflare&rsquo;s infrastructure.</p>
        <p>The prompt is built automatically from two sources: the price direction (up&nbsp;= despair, down&nbsp;= celebration) and the top posts from r/halifax and r/novascotia that week. Whatever Halifax and Nova Scotia are talking about &mdash; potholes, storms, local events &mdash; becomes the backdrop for the meme. Very Canadian.</p>
        <p>Images are stored in <a href="https://developers.cloudflare.com/r2/" rel="noopener noreferrer" target="_blank">Cloudflare R2</a> and served directly from this site with no third-party CDN. The whole thing — Worker, AI, storage — runs on Cloudflare&rsquo;s free tier. The only cost is the domain name.</p>
        <h3>Who made this?</h3>
        <p>A developer with the moniker <strong>program-the-brain-not-the-heartbeat</strong> from Cape Breton, Nova Scotia who got tired of searching Reddit every Thursday. The source code is open-source (MIT licensed) on <a href="https://github.com/program-the-brain-not-the-heartbeat/buckit" rel="noopener noreferrer" target="_blank">GitHub</a>.</p>
        <h3>Is the data accurate?</h3>
        <p>This site displays community estimates posted by u/buckit. The author of this site has no affiliation with u/buckit and cannot verify the accuracy of the predictions. Prices may be off by a cent or two (&ldquo;May be +/- 0.1&rdquo;). <strong>Not financial advice.</strong> Always confirm at the pump.</p>
        <h3>Privacy</h3>
        <p>This site has no tracking, no cookies, no analytics, and no ads. Nothing about your visit is collected or stored.</p>
      </div>
    </div>
  </div>

  <!-- Developer Modal -->
  <div class="modal-backdrop" id="devModal" role="dialog" aria-modal="true" aria-labelledby="devModalTitle">
    <div class="modal">
      <button class="modal-close" id="modalClose" aria-label="Close developer modal">&times;</button>
      <h2 id="devModalTitle">Developer? Prompter?</h2>
      <div class="tabs" role="tablist">
        <button class="tab-btn active" role="tab" aria-selected="true" aria-controls="tab-api" id="btn-api">REST API</button>
        <button class="tab-btn" role="tab" aria-selected="false" aria-controls="tab-mcp" id="btn-mcp">MCP Server</button>
        <button class="tab-btn" role="tab" aria-selected="false" aria-controls="tab-docs" id="btn-docs">Docs</button>
      </div>
      <div id="tab-api" class="tab-panel active" role="tabpanel" aria-labelledby="btn-api">
        <p>Plain JSON API via Cloudflare KV. No API key required for read access.</p>
        <h3>Latest prediction</h3>
        <div class="code-block" id="code-api">GET ${escapeHtml(siteUrl)}/api/latest
Accept: application/json<button class="copy-btn" onclick="copyCode('code-api')">Copy</button></div>
        <h3>LLM-friendly summary</h3>
        <div class="code-block" id="code-llms">GET ${escapeHtml(siteUrl)}/llms.txt<button class="copy-btn" onclick="copyCode('code-llms')">Copy</button></div>
      </div>
      <div id="tab-mcp" class="tab-panel" role="tabpanel" aria-labelledby="btn-mcp">
        <p>Connect to this site's MCP server from Claude Desktop or any MCP-compatible client.</p>
        <h3>Claude Desktop config</h3>
        <div class="code-block" id="code-mcp">{
  "mcpServers": {
    "hfxgas": { "url": "${escapeHtml(siteUrl)}/mcp" }
  }
}<button class="copy-btn" onclick="copyCode('code-mcp')">Copy</button></div>
        <h3>Available tools (no auth)</h3>
        <div class="code-block">get_latest_prediction
get_prediction_history
get_status</div>
      </div>
      <div id="tab-docs" class="tab-panel" role="tabpanel" aria-labelledby="btn-docs">
        <p>Full documentation, architecture diagrams, and deployment guide.</p>
        <div class="modal-links">
          <a href="https://program-the-brain-not-the-heartbeat.github.io/buckit" rel="noopener noreferrer" target="_blank">VitePress Docs &#x2192;</a>
          <a href="https://github.com/program-the-brain-not-the-heartbeat/buckit" rel="noopener noreferrer" target="_blank">GitHub Repository &#x2192;</a>
        </div>
      </div>
    </div>
  </div>

  <script>
    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => { b.classList.remove('active'); b.setAttribute('aria-selected','false'); });
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
        btn.classList.add('active'); btn.setAttribute('aria-selected','true');
        document.getElementById(btn.getAttribute('aria-controls')).classList.add('active');
      });
    });
    // Modal
    const modal=document.getElementById('devModal');
    const trigger=document.getElementById('devModalTrigger');
    const closeBtn=document.getElementById('modalClose');
    function openModal(){modal.classList.add('open');closeBtn.focus();document.addEventListener('keydown',trapFocus);}
    function closeModal(){modal.classList.remove('open');trigger.focus();document.removeEventListener('keydown',trapFocus);}
    trigger.addEventListener('click',openModal);
    closeBtn.addEventListener('click',closeModal);
    modal.addEventListener('click',e=>{if(e.target===modal)closeModal();});
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&modal.classList.contains('open'))closeModal();});
    function trapFocus(e){
      if(e.key!=='Tab')return;
      const focusable=modal.querySelectorAll('button,a,[tabindex]:not([tabindex="-1"])');
      const first=focusable[0];const last=focusable[focusable.length-1];
      if(e.shiftKey?document.activeElement===first:document.activeElement===last){e.preventDefault();(e.shiftKey?last:first).focus();}
    }
    // About modal
    const aboutModal=document.getElementById('aboutModal');
    const aboutTrigger=document.getElementById('aboutModalTrigger');
    const aboutCloseBtn=document.getElementById('aboutModalClose');
    function openAboutModal(){aboutModal.classList.add('open');aboutCloseBtn.focus();document.addEventListener('keydown',trapAboutFocus);}
    function closeAboutModal(){aboutModal.classList.remove('open');aboutTrigger.focus();document.removeEventListener('keydown',trapAboutFocus);}
    aboutTrigger.addEventListener('click',openAboutModal);
    aboutCloseBtn.addEventListener('click',closeAboutModal);
    aboutModal.addEventListener('click',e=>{if(e.target===aboutModal)closeAboutModal();});
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&aboutModal.classList.contains('open'))closeAboutModal();});
    function trapAboutFocus(e){
      if(e.key!=='Tab')return;
      const focusable=aboutModal.querySelectorAll('button,a,[tabindex]:not([tabindex="-1"])');
      const first=focusable[0];const last=focusable[focusable.length-1];
      if(e.shiftKey?document.activeElement===first:document.activeElement===last){e.preventDefault();(e.shiftKey?last:first).focus();}
    }
    function copyCode(id){
      const el=document.getElementById(id);
      const text=el.childNodes[0].textContent.trim();
      navigator.clipboard.writeText(text).catch(()=>{});
    }
    // Chart.js history
    const chartData = ${chartJson};
    const canvas = document.getElementById('historyChart');
    if (canvas && typeof Chart !== 'undefined') {
      const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      const gridColor  = isDark ? 'hsl(240 8% 16%)' : 'hsl(240 5% 92%)';
      const labelColor = isDark ? 'hsl(240 5% 55%)' : 'hsl(240 4% 46%)';
      const datasets = [];
      if (chartData.gasData.some(v => v !== null)) {
        datasets.push({
          label: 'Regular', data: chartData.gasData,
          borderColor: 'hsl(20 90% 52%)', backgroundColor: 'hsl(20 90% 52% / 0.12)',
          pointBackgroundColor: 'hsl(20 90% 52%)', tension: 0.35,
          fill: true, borderWidth: 2, pointRadius: 3, pointHoverRadius: 5,
          spanGaps: true,
        });
      }
      if (chartData.dieselData.some(v => v !== null)) {
        datasets.push({
          label: 'Diesel', data: chartData.dieselData,
          borderColor: 'hsl(200 75% 48%)', backgroundColor: 'hsl(200 75% 48% / 0.1)',
          pointBackgroundColor: 'hsl(200 75% 48%)', tension: 0.35,
          fill: true, borderWidth: 2, pointRadius: 3, pointHoverRadius: 5,
          spanGaps: true,
        });
      }
      new Chart(canvas, {
        type: 'line',
        data: { labels: chartData.labels, datasets },
        options: {
          responsive: true, maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { display: datasets.length > 1, labels: { color: labelColor, font: { size: 11 }, boxWidth: 12, padding: 12 } },
            tooltip: {
              backgroundColor: isDark ? 'hsl(240 10% 10%)' : 'hsl(0 0% 100%)',
              borderColor: isDark ? 'hsl(240 8% 18%)' : 'hsl(240 5% 90%)',
              borderWidth: 1, titleColor: labelColor, bodyColor: labelColor,
              callbacks: { label: ctx => ' ' + ctx.dataset.label + ': $' + (ctx.parsed.y?.toFixed(3) ?? '') + '/L' },
            },
          },
          scales: {
            x: { grid: { color: gridColor }, ticks: { color: labelColor, font: { size: 10 }, maxTicksLimit: 8 } },
            y: {
              grid: { color: gridColor }, ticks: { color: labelColor, font: { size: 10 },
                callback: v => '$' + v.toFixed(2) },
            },
          },
        },
      });
    }
  </script>
</body>
</html>`;
}

// ── Route Handlers ───────────────────────────────────────────────────────────

async function handleRoot(env) {
  const [predRaw, histRaw, imageKey] = await Promise.all([
    env.PREDICTIONS.get('latest_prediction'),
    env.PREDICTIONS.get('prediction_history'),
    env.PREDICTIONS.get('latest_image_key'),
  ]);

  const prediction = predRaw ? JSON.parse(predRaw) : null;
  const history = histRaw ? JSON.parse(histRaw) : [];
  const siteUrl = env.SITE_URL ?? 'https://hfxgas.ca';

  const html = renderHtml({ prediction, history, imageKey, siteUrl });

  return new Response(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

async function handleApiLatest(env) {
  const raw = await env.PREDICTIONS.get('latest_prediction');
  if (!raw) return new Response(JSON.stringify(null), { headers: { 'content-type': 'application/json' } });
  return new Response(raw, { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
}

async function handleImage(key, env) {
  const obj = await env.IMAGES.get(`images/${key}`);
  if (!obj) return new Response('Not Found', { status: 404 });
  return new Response(obj.body, {
    headers: {
      'content-type': 'image/png',
      'cache-control': 'public, max-age=31536000, immutable',
    },
  });
}

async function handleRobots(env) {
  const siteUrl = env.SITE_URL ?? 'https://hfxgas.ca';
  return new Response(`User-agent: *\nAllow: /\n\nSitemap: ${siteUrl}/sitemap.xml\n`, {
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
}

async function handleSitemap(env) {
  const siteUrl = env.SITE_URL ?? 'https://hfxgas.ca';
  const raw = await env.PREDICTIONS.get('latest_prediction');
  const p = raw ? JSON.parse(raw) : null;
  const lastmod = p?.updated_at ? p.updated_at.slice(0, 10) : new Date().toISOString().slice(0, 10);

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${siteUrl}/</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>`;

  return new Response(xml, {
    headers: { 'content-type': 'application/xml; charset=utf-8' },
  });
}

async function handleLlmsTxt(env) {
  const siteUrl = env.SITE_URL ?? 'https://hfxgas.ca';
  const raw = await env.PREDICTIONS.get('latest_prediction');
  const p = raw ? JSON.parse(raw) : null;

  const gasSummary = p?.gas ? `${p.gas.direction} to $${p.gas.price?.toFixed(3) ?? 'unknown'}/L` : null;
  const dieselSummary = p?.diesel ? `${p.diesel.direction} to $${p.diesel.price?.toFixed(3) ?? 'unknown'}/L` : null;

  const body = `# hfxgas.ca — Halifax Gas Price Prediction

> Weekly gas price prediction for Halifax, Nova Scotia, Canada.
> Data source: Reddit /u/buckit on r/halifax (community estimate).
> Updated every Thursday. Not financial advice. No tracking.

## Current Prediction
${p ? `${gasSummary ? `- Regular gas: ${gasSummary}` : ''}
${dieselSummary ? `- Diesel: ${dieselSummary}` : ''}
- Updated: ${p.updated_at}` : 'No prediction available yet.'}

## API Access (no key required)
- Latest prediction JSON: ${siteUrl}/api/latest
- MCP server (Claude Desktop): ${siteUrl}/mcp

## Attribution
Prediction data by u/buckit on r/halifax (https://www.reddit.com/r/halifax).
Site by program-the-brain-not-the-heartbeat (https://github.com/program-the-brain-not-the-heartbeat).
Source code: https://github.com/program-the-brain-not-the-heartbeat/buckit
`;

  return new Response(body, {
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
}

async function handleWebhook(request, env) {
  // Auth — Bearer token only.
  // Query-parameter secrets (?secret=) are explicitly rejected: they leak into
  // server logs, browser history, and Referer headers.
  const url = new URL(request.url);
  if (url.searchParams.has('secret')) {
    console.warn('Webhook: rejected ?secret= query param — use Authorization: Bearer <token>');
    return new Response(JSON.stringify({ error: 'Use Authorization: Bearer header, not ?secret= query param' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }

  const authHeader = request.headers.get('authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

  if (!token || token !== env.WEBHOOK_SECRET) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }

  // Webhook accepts either:
  //   a) New format: { gas: { direction, price }, diesel: { direction, price }, notes }
  //   b) Legacy format: { direction, predicted_price, current_price, fuel_type, notes }
  const { notes = null } = body;

  const VALID_DIRECTIONS = ['up', 'down', 'no-change'];

  function validateFuelSlot(slot, name) {
    if (!slot) return null;
    if (!VALID_DIRECTIONS.includes(slot.direction)) {
      return { error: `${name}.direction must be one of: up, down, no-change` };
    }
    if (slot.price !== undefined && slot.price !== null && (typeof slot.price !== 'number' || isNaN(slot.price))) {
      return { error: `${name}.price must be a number if provided` };
    }
    return null;
  }

  let gas = null;
  let diesel = null;

  if (body.gas !== undefined || body.diesel !== undefined) {
    // New format
    const gasErr = validateFuelSlot(body.gas, 'gas');
    if (gasErr) return new Response(JSON.stringify(gasErr), { status: 400, headers: { 'content-type': 'application/json' } });
    const dieselErr = validateFuelSlot(body.diesel, 'diesel');
    if (dieselErr) return new Response(JSON.stringify(dieselErr), { status: 400, headers: { 'content-type': 'application/json' } });
    gas = body.gas ? { direction: body.gas.direction, adjustment: body.gas.adjustment ?? null, price: body.gas.price ?? null } : null;
    diesel = body.diesel ? { direction: body.diesel.direction, adjustment: body.diesel.adjustment ?? null, price: body.diesel.price ?? null } : null;
  } else {
    // Legacy format — map to new model
    const { direction, predicted_price, current_price, fuel_type = 'gas' } = body;
    if (!VALID_DIRECTIONS.includes(direction)) {
      return new Response(JSON.stringify({ error: 'Invalid direction — must be "up", "down", or "no-change"' }), {
        status: 400, headers: { 'content-type': 'application/json' },
      });
    }
    if (!['gas', 'diesel'].includes(fuel_type)) {
      return new Response(JSON.stringify({ error: 'Invalid fuel_type — must be "gas" or "diesel"' }), {
        status: 400, headers: { 'content-type': 'application/json' },
      });
    }
    if (typeof predicted_price !== 'number' || isNaN(predicted_price)) {
      return new Response(JSON.stringify({ error: 'predicted_price must be a number' }), {
        status: 400, headers: { 'content-type': 'application/json' },
      });
    }
    if (current_price !== undefined && (typeof current_price !== 'number' || isNaN(current_price))) {
      return new Response(JSON.stringify({ error: 'current_price must be a number if provided' }), {
        status: 400, headers: { 'content-type': 'application/json' },
      });
    }
    const slot = { direction, adjustment: null, price: predicted_price };
    if (fuel_type === 'diesel') { diesel = slot; } else { gas = slot; }
  }

  const prediction = {
    gas,
    diesel,
    notes: notes ? String(notes).slice(0, 500) : null,
    source: 'webhook',
    updated_at: new Date().toISOString(),
    post_id: null,
  };

  await writePrediction(prediction, env);

  return new Response(JSON.stringify({ ok: true, prediction }), {
    headers: { 'content-type': 'application/json' },
  });
}

// ── Fetch Handler ─────────────────────────────────────────────────────────────

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname, method } = { pathname: url.pathname, method: request.method };

    let response;

    // GET /
    if (pathname === '/' && method === 'GET') {
      response = await handleRoot(env);
    }

    // GET /api/latest
    else if (pathname === '/api/latest' && method === 'GET') {
      response = await handleApiLatest(env);
    }

    // GET /images/:key
    else if (pathname.match(/^\/images\/([a-zA-Z0-9_-]+\.png)$/) && method === 'GET') {
      const imageMatch = pathname.match(/^\/images\/([a-zA-Z0-9_-]+\.png)$/);
      response = await handleImage(imageMatch[1], env);
    }

    // GET /robots.txt
    else if (pathname === '/robots.txt' && method === 'GET') {
      response = await handleRobots(env);
    }

    // GET /sitemap.xml
    else if (pathname === '/sitemap.xml' && method === 'GET') {
      response = await handleSitemap(env);
    }

    // GET /llms.txt
    else if (pathname === '/llms.txt' && method === 'GET') {
      response = await handleLlmsTxt(env);
    }

    // POST /webhook
    else if (pathname === '/webhook' && method === 'POST') {
      response = await handleWebhook(request, env);
    }

    // /mcp — handled by MCP server (separate entrypoint in wrangler.toml)

    // 404
    else {
      response = new Response(JSON.stringify({ error: 'Not Found' }), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      });
    }

    // Apply security headers to every response
    return withSecurityHeaders(response);
  },

  // ── Scheduled Handler ────────────────────────────────────────────────────
  async scheduled(_event, env, _ctx) {
    console.log('Cron: starting Reddit scan');

    let post;
    let communityContext = [];
    try {
      [post, communityContext] = await Promise.all([
        fetchBuckitPost(env),
        fetchCommunityContext(env),
      ]);
    } catch (err) {
      console.error('Cron: Reddit fetch error:', err);
      return;
    }

    if (!post) {
      console.log('Cron: no matching post found — done');
      return;
    }

    // Dedup — skip if already processed
    const lastId = await env.PREDICTIONS.get('last_processed_post_id');
    if (lastId === post.id) {
      console.log(`Cron: post ${post.id} already processed — skipping`);
      return;
    }

    console.log(`Cron: processing post ${post.id} — "${post.title}"`);

    const parsed = parseRedditPost(post);

    const prediction = {
      gas: parsed.gas,
      diesel: parsed.diesel,
      notes: parsed.notes,
      source: 'reddit',
      post_id: post.id,
      post_url: `https://www.reddit.com${post.permalink}`,
      reddit_title: post.title,
      updated_at: new Date().toISOString(),
    };

    // Generate image using gas direction (primary), fallback to diesel
    const imageDirection = parsed.gas?.direction ?? parsed.diesel?.direction;
    const actionableDirection = imageDirection === 'up' || imageDirection === 'down' ? imageDirection : null;
    if (actionableDirection) {
      const imageKey = await generateAndStoreImage(post.id, actionableDirection, communityContext, env);
      if (imageKey) {
        await env.PREDICTIONS.put('latest_image_key', imageKey);
        prediction.image_key = imageKey;
      }
    }

    await writePrediction(prediction, env);
    await env.PREDICTIONS.put('last_processed_post_id', post.id);

    const gasSummary = parsed.gas ? `gas=${parsed.gas.direction} $${parsed.gas.price?.toFixed(3)}` : 'gas=none';
    const dieselSummary = parsed.diesel ? `diesel=${parsed.diesel.direction} $${parsed.diesel.price?.toFixed(3)}` : 'diesel=none';
    console.log(`Cron: done — ${gasSummary}, ${dieselSummary}`);
  },
};
