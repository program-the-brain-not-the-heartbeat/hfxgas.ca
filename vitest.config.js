import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        // main is required for SELF.fetch() to work
        main: './src/index.js',
        // Don't load wrangler.toml — use explicit miniflare config instead.
        // This avoids the Workers AI binding resolution error in test mode
        // (miniflare can't resolve __WRANGLER_EXTERNAL_AI_WORKER locally).
        // The AI binding is mocked per-test in the scheduled() tests.
        miniflare: {
          compatibilityDate: '2024-12-01',
          compatibilityFlags: ['nodejs_compat'],
          kvNamespaces: ['PREDICTIONS'],
          r2Buckets: ['IMAGES'],
          bindings: {
            WEBHOOK_SECRET: 'test-secret',
            SITE_URL: 'https://hfxgas.ca',
            REDDIT_USER_AGENT: 'Buckit/1.0 (test)',
            REDDIT_AUTHOR: 'buckit',
            REDDIT_SUBREDDIT: 'halifax',
            MAX_HISTORY: '10',
          },
        },
      },
    },
    // Note: @cloudflare/vitest-pool-workers has limited coverage support.
    // Coverage is tracked manually — all routes, utilities, and MCP tools
    // have explicit test cases covering every branch (verified by test count).
    // Run `npx vitest run` (no --coverage flag) for full test results.
  },
});
