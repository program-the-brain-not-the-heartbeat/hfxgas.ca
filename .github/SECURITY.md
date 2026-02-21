# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability, please open a GitHub issue with the label `security`.

**Do not** include exploit details in a public issue. If the vulnerability is sensitive, describe the general category of issue and we will follow up privately.

## Scope

Issues in scope:
- Authentication bypass on `POST /webhook` or MCP write tools
- XSS via unescaped user-provided content (notes field)
- Unauthorized KV writes

Out of scope:
- Prediction data accuracy
- Reddit API availability
- Cloudflare infrastructure issues

## Response

This project is maintained on a best-effort basis with no SLA. No warranty of any kind is provided.
