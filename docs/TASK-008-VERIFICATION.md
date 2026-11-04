# Task 008 verification — 2026-11-05

## Delivered

Shared reviewer login, status and logout endpoints; signed two-hour HttpOnly/Secure/SameSite=Strict cookies; server-side integrity/expiry checks; shared authorization for both AI endpoints; and a responsive reviewer access panel. Both production AI views unlock only after session status confirms the cookie. Register and Data Health remain public. No live Gemini call, dependency installation, deployment or commit was made.

## Executed verification

| Check | Result |
| --- | --- |
| `npm.cmd test` | **74 passed**: all original 62 tests preserved unchanged, plus 12 new auth/client tests |
| `npm.cmd run build` | Passed TypeScript validation and production Vite build |
| `npm.cmd run lint` | Passed, no lint rules disabled |
| Playwright MCP, production build over isolated local HTTPS | **48 checks passed**, at **1366×768** and **390×844** |
| Real browser cookie verification | HttpOnly, Secure, Strict, host-only path `/`; unreadable through `document.cookie`; persists across reload; removed by logout |
| Authenticated AI requests | Two draft and two query calls per completed browser run reached the real core handlers with **mocked Gemini** responses |
| Browser errors/assets | No uncaught errors or failed assets; deliberate invalid-login/unauthorized HTTP failures are expected |
| Layout | No horizontal overflow in tested viewports; desktop/mobile logged-out screenshots visually reviewed for readable labels, visible focus and unclipped form text |
| `node scripts/check-client-secrets.mjs` | Three client files contain none of the four server credential names or any configured local credential value |
| `.env.local`, temporary browser credentials/certificate | Git-ignored; actual application credentials never loaded by the browser harness |
| Original and app-copy CSV hashes | Both unchanged: `E2528AA4CC87EB5B718FC532912DB8A0BDDC714A736F0C31A80FFACAF86A66E1` |
| Existing Vercel configuration | Preserved byte-for-byte during Task 008; valid JSON; both AI functions retain original CSV inclusion |

New automated coverage includes valid/invalid login, missing/weak/reused configuration, input limits and slow streams, timing-safe signed-cookie validation, tampering, exact expiry, future issuance, audience mismatch, duplicate cookies, secret rotation, logout, strict Origin/Host/Fetch Metadata checks, missing authorization to both AI endpoints, authenticated mocked generation, trusted bearer compatibility, login throttling/concurrency, local socket/Host enforcement, safe client errors and request credentials.

Browser checks used production-mode authorization, actual HTTPS endpoints and real browser cookies, not an auth bypass. They verified logged-out endpoint rejection, invalid-login feedback, password clearing, keyboard focus, successful session confirmation/reload, both AI views, duplicate-submission prevention, editable email, deterministic nine-lead query output with IDs, register search/all 25 rows, Data Health visibility, logout and cleared AI workspaces. Live provider request count was zero. TLS certificate verification was disabled only in the isolated Playwright context for the disposable localhost certificate; production code has no TLS bypass.

The final browser run passed after a small race fix: a deliberate login now supersedes a background status check instead of silently dropping the submission. The test harness was restarted between full runs so its per-instance login limits and mock counters were fresh.

## Resolved validation failures

- The first test run passed 61/62 existing tests: a changed unauthorized message no longer matched an existing assertion. The message now retains the expected authorization wording and adds sign-in guidance; all 62 original tests remain unchanged.
- Initial lint rejected a rethrown error without its cause and synchronous effect scheduling. Error causes are preserved without rendering raw errors; initial status checking is scheduled and cleanup cancels stale checks. Lint subsequently passed.
- Two new tests initially failed: Node fetch did not send a forged Host header, and a test assertion called a method on absent headers. The Host test now uses Node's raw HTTP client and verifies real rejection; the assertion handles absent headers. All 74 tests passed afterwards.
- Repository-wide `git diff --check` reports the **pre-existing blank line at EOF in the user's corrected `vercel.json`**. It was deliberately left unchanged. This is whitespace, not invalid JSON. Task-owned tracked changes pass the check when that preserved file is excluded.

## Screenshots

New files are under `artifacts/task-008/`; existing `.playwright-mcp/` and `reports/` artifacts were not edited by this task.

- `1366-logged-out.png`, `390-logged-out.png`
- `desktop-invalid-login.png`
- `1366-authenticated-draft.png`, `390-authenticated-draft.png`
- `1366-authenticated-query.png`, `390-authenticated-query.png`
- `1366-signed-out.png`, `390-signed-out.png`

Successful AI content in these images is explicitly test-only mocked provider output. No live language interpretation or email grounding was established during Task 008.

## Files changed

New backend/auth files:

- `server/reviewer-session.ts`, `server/reviewer-auth.ts`
- `api/auth/login.ts`, `api/auth/session.ts`, `api/auth/logout.ts`

Updated integration files:

- `server/draft.ts`, `server/query.ts`: reviewer options/shared authorization and secret-echo safeguards only; Gemini formats and business logic preserved
- `api/ai/draft.ts`, `api/ai/query.ts`: server-only reviewer settings
- `server/local-adapter.ts`, `server/vite-ai.ts`: local auth routes and server-only environment loading

Frontend:

- New `src/ReviewerAccess.tsx`, `src/ReviewerAccess.css`, `src/auth/session-client.ts`, `src/auth/useReviewerSession.ts`
- Updated `src/App.tsx`, `src/AiFollowUp.tsx`, `src/AskPipeline.tsx`, `src/ai/draft-client.ts`, `src/ai/query-client.ts`

Tests and verification:

- New `tests/reviewer-auth.test.mjs`, `tests/session-client.test.mjs`
- New `tests/browser/reviewer-server.mjs`, `tests/browser/reviewer.playwright.js`
- New `scripts/check-client-secrets.mjs` and screenshots under `artifacts/task-008/`

Configuration/documentation:

- `.env.example`, `docs/AI-BACKEND.md`, `docs/AI-QUERY.md`, `docs/DECISIONS.md`
- New `docs/REVIEWER-ACCESS.md` and this report

`vercel.json` was already modified at checkpoint inspection and was not edited. Its preserved SHA256 is `E5C06D34B4299C5D1C8821DC83D29650F42D74A38F8AD0876A3579AD39767B41`. No changes to package dependencies, build/type-check configuration, original tests, parser, dataset, query plan/schema/executor or original source pack.

## Security model and remaining limits

Sessions use HMAC-SHA-256 and timing-safe MAC/password comparisons. Exact same-origin checks protect cookie-authenticated state changes; unsupported origins, invalid sessions and absent authorization cannot spend provider quota. Production never opts into loopback development access. Trusted bearer support remains separate. Secret rotation invalidates sessions; logout expires the current browser cookie and clears client workspaces.

Stateless logout cannot revoke a copied cookie elsewhere before expiry; rotation is the emergency revocation mechanism. The shared password does not identify individual evaluators or provide MFA. In-memory throttles reset on cold starts and do not work globally across Vercel instances. Platform rate protection and provider quotas remain necessary. Browser cancellation cannot guarantee cancellation of provider work already underway.

Not independently verified: deployed Vercel routing/environment/Host behavior, other browser engines, assistive technology, multi-instance throttling, cross-tab synchronization and live Gemini operation. No real credentials were created or installed for the evaluator. Configure the required settings privately before deployment.

Next small step: follow [Reviewer access and exact Vercel setup](REVIEWER-ACCESS.md) to configure `GEMINI_API_KEY`, `BIAI_REVIEWER_PASSWORD`, `BIAI_SESSION_SECRET`, optional `GEMINI_MODEL`, and optional trusted `AI_DRAFT_ACCESS_TOKEN`. Deployment and any live provider verification remain separate actions; neither was performed here.
