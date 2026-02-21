import { defineConfig } from 'vitepress';

export default defineConfig({
  title: 'Buckit Docs',
  description: 'Halifax gas price prediction — Cloudflare Workers',
  base: '/buckit/',
  themeConfig: {
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Guide', link: '/deployment' },
      { text: 'API', link: '/webhook' },
      { text: 'MCP', link: '/mcp' },
      { text: 'GitHub', link: 'https://github.com/program-the-brain-not-the-heartbeat/hfxgas.ca' },
    ],
    sidebar: [
      {
        text: 'Getting Started',
        items: [
          { text: 'Deployment', link: '/deployment' },
          { text: 'Development', link: '/development' },
          { text: 'Run Your Own', link: '/run-your-own' },
          { text: 'Manual Updates (u/buckit)', link: '/buckit-access' },
        ],
      },
      {
        text: 'Reference',
        items: [
          { text: 'Architecture', link: '/architecture' },
          { text: 'Webhook API', link: '/webhook' },
          { text: 'MCP Server', link: '/mcp' },
          { text: 'SEO & GEO', link: '/seo' },
          { text: 'Costs', link: '/costs' },
        ],
      },
      {
        text: 'Project',
        items: [
          { text: 'Timeline', link: '/project-timeline' },
          { text: 'Future Ideas', link: '/todo' },
        ],
      },
      {
        text: 'Architecture Decisions',
        items: [
          { text: 'ADR Index', link: '/adr/README' },
          { text: 'ADR-001: Cloudflare Workers Platform', link: '/adr/001-cloudflare-workers-platform' },
          { text: 'ADR-002: Community Context Image Prompts', link: '/adr/002-community-context-image-prompts' },
          { text: 'ADR-003: Security Headers', link: '/adr/003-security-headers' },
          { text: 'ADR-004: No Query-Param Secrets', link: '/adr/004-no-query-param-secrets' },
          { text: 'ADR-005: Deploy Gate CI', link: '/adr/005-deploy-gate-ci' },
        ],
      },
    ],
    socialLinks: [
      { icon: 'github', link: 'https://github.com/program-the-brain-not-the-heartbeat/hfxgas.ca' },
    ],
    footer: {
      message: 'MIT License. No warranties. Not financial advice.',
      copyright: 'program-the-brain-not-the-heartbeat',
    },
    editLink: {
      pattern: 'https://github.com/program-the-brain-not-the-heartbeat/hfxgas.ca/edit/main/docs/:path',
      text: 'Edit this page on GitHub',
    },
  },
  markdown: {
    theme: { light: 'github-light', dark: 'github-dark' },
  },
});
