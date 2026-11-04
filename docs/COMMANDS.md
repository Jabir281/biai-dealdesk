# Verified/Expected Commands — Windows PowerShell

Run these commands from `D:\BIAI\app` unless otherwise indicated. **These are commands to try, not evidence that the project is currently working.**

## Check the environment
```powershell
node -v
npm.cmd -v
git --version
codex --version
```

## Inspect package scripts and dependencies
```powershell
Get-Content .\package.json
Test-Path .\node_modules\.bin\vite.cmd
```

## Restore dependencies if required
```powershell
npm.cmd install
```

## Develop and validate
```powershell
npm.cmd run dev
npm.cmd run build
```

If `package.json` defines a lint script, also run:
```powershell
npm.cmd run lint
```

## Lead register data checks
```powershell
node --test tests/leads.test.mjs
```

Run both the Lead Register and Data Health suites:
```powershell
node --test tests/leads.test.mjs tests/health.test.mjs
```

Data Health verification on 2026-11-03: all 18 tests passed (7 existing, 11 new). New coverage includes duplicate pairs/normalization, missing contact fields, date order, explicit note evidence and negative cases, unique-ID counting, and frozen-input immutability.

Verified on 2026-11-03 with Node 22.18.0: 7 passing tests, including the exact source and overdue IDs, CSV quoting/empty fields, duplicate retention and combined filters. `npm.cmd run build` and `npm.cmd run lint` also pass after removal of the unused generated JSX `.js` files.

## AI backend

`npm.cmd test` runs all mocked backend and existing data tests without provider quota.
`npm.cmd run dev` serves `/api/ai/draft` through the same handler used by the Vercel Function.
`npm.cmd run smoke:ai` explicitly initiates one real L04 request; do not include it in routine validation or retries.
See [AI-BACKEND.md](AI-BACKEND.md) for request format, configuration, limits and deployment protection.

## AI Follow-up frontend checks

`npm.cmd test` includes the browser request-client tests using mocked fetch; it never runs live generation.

With the existing Vite app running at `http://localhost:5173/`, use Playwright MCP `browser_run_code_unsafe` with `filename: "D:/BIAI/app/tests/browser/ai-follow-up.playwright.js"`. The script intercepts every draft request, tests desktop/mobile interactions and writes screenshots. It does not need a Playwright package installed in the app. Close the automated browser page afterwards to discard its mock routes.

To verify the production access blocker, run `npm.cmd run build`, then `npm.cmd run preview -- --host 127.0.0.1 --port 5174 --strictPort`, and run the MCP script `tests/browser/ai-follow-up-production.playwright.js`. Stop that temporary preview when finished. The production UI must make no draft requests.

See [AI Follow-up verification](../reports/ai-follow-up-verification.md). Do not run `smoke:ai` as part of frontend testing while live generation is blocked.

## Git checks (only if a Git repository has been initialized)
```powershell
git status --short
git diff --stat
```

## Important operating rules
- Do **not** run `npm install` repeatedly without reading its errors.
- Do **not** use `npm audit fix --force` as a generic remedy.
- Do **not** delete `node_modules`, lockfiles, or source folders without identifying the reason and checking what will be lost.
- Do **not** use `git reset --hard`, `git clean -fd`, or blind overwrite commands.
- Do **not** copy API keys into browser-side React code or commit them to Git.
- Do **not** run a second coding agent against the same files while one is actively editing.
