---
name: qa
description: Run QA regression suite and analyze results. Use when asked to run tests, check quality, verify changes, or run regression.
---

# QA Regression Skill

Run the project QA suite and analyze results.

## Commands

| Command | Purpose |
|---|---|
| `pnpm qa:fast` | Fast regression — Jest tests + lint |
| `pnpm qa:verify` | Full verification — qa:fast + lint |
| `pnpm qa:investigate` | Analyze last failing run |
| `pnpm qa:repair-last-run` | Auto-repair last run |
| `pnpm test` | Jest unit tests only |
| `pnpm test:e2e` | Playwright E2E tests |

## Workflow

1. Run `pnpm qa:fast` first for a quick check
2. If failures occur, run `pnpm qa:investigate` to analyze root causes
3. Fix the issues identified
4. Re-run `pnpm qa:verify` to confirm everything passes
5. For E2E issues, run `pnpm test:e2e` separately (requires running dev server)

## Scripts Location

All QA scripts are in `scripts/qa/`:
- `fast-regression.sh` — Shell script for fast regression
- `investigate-last-run.ts` — TypeScript analyzer for failures
- `repair-last-run.ts` — Auto-repair tool
