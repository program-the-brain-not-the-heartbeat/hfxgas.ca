# Contributing to Buckit

Thank you for your interest in contributing.

## Before You Start

Read [CLAUDE.md](CLAUDE.md) for full project context, architecture, and constraints.

## Setup

```sh
git clone https://github.com/program-the-brain-not-the-heartbeat/buckit
cd buckit
task setup
```

## Development Workflow

```sh
task dev            # Start local dev server
task dev:cron       # Test the cron handler locally
task test           # Run tests
task check          # Full quality check (lint + format + test) — same as CI
```

## Pull Request Requirements

- [ ] `task check` passes with no errors
- [ ] 100% test coverage maintained (coverage gate is enforced in CI)
- [ ] Tests added for every new route, utility, or MCP tool
- [ ] No secrets in code, comments, or commit messages
- [ ] Conventional Commits format (`feat:`, `fix:`, `docs:`, `chore:`, `test:`, `refactor:`)
- [ ] CHANGELOG.md updated if applicable
- [ ] No personal information of any kind in any file

## Commit Format

```
feat: add diesel price support
fix: handle Reddit API rate limiting gracefully
docs: update webhook API reference
chore: bump wrangler to 3.x
test: add coverage for empty KV state
refactor: extract price regex into constant
```

## Privacy

This project has a strict no-personal-information policy. Do not include real names, addresses, contact details, or any PII in any file — including code, comments, commit messages, or documentation.

## No Warranty / No Support

Contributions are accepted as-is. Maintainers reserve the right to close issues or PRs without explanation. No support is provided.
