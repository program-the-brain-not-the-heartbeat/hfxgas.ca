# SEO & GEO

## SEO Implementation

### Meta Tags

Every page response includes:

```html
<title>Halifax Gas Price Prediction | hfxgas.ca</title>
<meta name="description" content="...dynamic prediction context...">
<link rel="canonical" href="https://hfxgas.ca">
<html lang="en" dir="ltr">
```

### Open Graph

```html
<meta property="og:title" content="Halifax Gas Price Prediction | hfxgas.ca">
<meta property="og:description" content="...">
<meta property="og:url" content="https://hfxgas.ca">
<meta property="og:image" content="https://hfxgas.ca/images/...">
<meta property="og:type" content="website">
```

### Twitter Card

```html
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="...">
<meta name="twitter:description" content="...">
<meta name="twitter:image" content="...">
```

### Structured Data (JSON-LD)

Two schemas are included:

**WebSite**
```json
{
  "@type": "WebSite",
  "name": "hfxgas.ca",
  "url": "https://hfxgas.ca",
  "description": "..."
}
```

**Dataset**
```json
{
  "@type": "Dataset",
  "name": "Halifax Gas Price Predictions",
  "creator": { "@type": "Person", "name": "u/buckit" },
  "spatialCoverage": "Halifax, Nova Scotia, Canada",
  "temporalCoverage": "Weekly",
  "license": "https://creativecommons.org/licenses/by/4.0/",
  "isBasedOn": "https://www.reddit.com/r/halifax"
}
```

### Routes

| Route | Purpose |
|-------|---------|
| `GET /robots.txt` | Allow all crawlers |
| `GET /sitemap.xml` | Single URL with `lastmod` from latest prediction |

## GEO (LLM-Friendly)

`GET /llms.txt` follows the [llmstxt.org](https://llmstxt.org/) specification. It provides a plain-text summary that LLM crawlers can parse:

```
# hfxgas.ca — Halifax Gas Price Prediction
> Weekly gas price prediction for Halifax, Nova Scotia...

## Current Prediction
- Direction: up
- Predicted price: $1.719/L
...

## API Access (no key required)
- Latest prediction JSON: https://hfxgas.ca/api/latest
- MCP server (Claude Desktop): https://hfxgas.ca/mcp
```

This makes the site queryable by LLMs without HTML parsing.

## Cache Control

All HTML responses use `Cache-Control: no-store` to ensure:
- Crawlers always see the latest prediction
- No stale content served from Cloudflare's edge cache
