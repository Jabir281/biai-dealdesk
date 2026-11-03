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
