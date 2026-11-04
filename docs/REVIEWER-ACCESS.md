# Reviewer access — Task 008

Implemented 2026-11-05. This supersedes earlier documentation saying production browser AI access is unavailable. Both AI views now unlock after the browser confirms a valid reviewer session. No deployment or live Gemini request was performed in this task.

## Server configuration

All settings below are **server-only**. Never give them a `VITE_` prefix, include them in URLs, source code, documentation examples, screenshots, console output or Git. `.env.example` contains blank secret placeholders only. Keep local values in ignored `.env.local` and restart Vite after changes.

| Variable | Requirement |
| --- | --- |
| `GEMINI_API_KEY` | Existing Google API credential, required for both Gemini features |
| `GEMINI_MODEL` | Existing optional model selection; default remains `gemini-3.5-flash-lite` |
| `BIAI_REVIEWER_PASSWORD` | Required for reviewer login. Independently generated random password, 20–128 characters, at least 10 distinct characters and at least three of lowercase, uppercase, digits and symbols. No control characters or outer whitespace. |
| `BIAI_SESSION_SECRET` | Required for reviewer login. Independently generated 32 random bytes encoded as exactly 64 hexadecimal characters, with at least 10 distinct hexadecimal characters. |
| `AI_DRAFT_ACCESS_TOKEN` | Optional existing trusted server/CLI credential. Keep it separate from all other secrets. It is not required for reviewer-cookie access. |

Generate the password and signing secret independently using a secure password manager or cryptographic secret generator. Length/format checks catch weak/repetitive configuration but do not prove entropy. Do not reuse the Gemini credential or trusted bearer token. Missing or rejected reviewer configuration returns a safe 503; it does not open an unauthenticated route. Existing independently configured bearer access can still work when reviewer login is not configured.

## Exact Vercel setup

These steps are for the project owner; they were **not executed** during this task.

1. Open the existing Vercel project. In **Settings → Build and Deployment**, keep the Vite framework preset. Set the Root Directory to the repository directory containing this app's `package.json`; use build command `npm.cmd run build` only on Windows locally, and `npm run build` on Vercel. Output Directory is `dist`. Use Node.js 22 for the Functions/runtime.
2. In **Settings → Environment Variables**, add `GEMINI_API_KEY`, `BIAI_REVIEWER_PASSWORD` and `BIAI_SESSION_SECRET`, using the requirements above. Mark secret values Sensitive when available. Select **Production**. Add Preview separately only if evaluators will use a preview deployment; otherwise do not share production secrets with previews.
3. Keep or add server-only `GEMINI_MODEL` with the existing working model setting, or omit it to retain the default. Keep `AI_DRAFT_ACCESS_TOKEN` only if trusted CLI/server access is needed. Never put any credential into a frontend variable or supply it to the browser as a bearer token.
4. Save the variables. Environment changes apply to new deployments: when deployment is separately authorized, create a new deployment/redeploy the intended revision. This task does not deploy. See [Vercel environment variables](https://vercel.com/docs/environment-variables).
5. Preserve the existing valid `vercel.json`. Both `api/ai/draft.ts` and `api/ai/query.ts` already include `src/data/corporate-leads.csv` and a 30-second limit. New functions are discovered from `api/auth/login.ts`, `api/auth/session.ts` and `api/auth/logout.ts`; no rewrite or additional package is needed. The existing Web-standard function export is retained.
6. Use the deployment's **HTTPS** URL directly. Open Reviewer sign in and enter the shared reviewer password supplied through a private channel. The browser must accept first-party cookies. A confirmed session unlocks Generate Draft and Ask; the key and signing secret are never entered into the site. Each hostname has a separate cookie/session.
7. Before inviting evaluators, check that logged-out calls to both AI endpoints fail, login persists after reload, both views unlock and Sign out locks them again. Provider availability is a separate check that consumes quota; this task used mocks only. If Vercel Deployment Protection is enabled, arrange evaluator access through that protection too—it is separate from this app's reviewer login.
8. Configure platform/WAF rate protection for `/api/auth/login` and `/api/ai/*`, and Google project quota/budget controls. The app's in-memory counters are **not global limits across serverless instances**. See [Vercel Firewall](https://vercel.com/docs/vercel-firewall). Share the reviewer password only with intended evaluators and rotate it after assessment.

## Endpoints and security model

- `POST /api/auth/login`: JSON object containing only `password`; at most 1024 bytes, password at most 128 characters, three-second body deadline. Uses a fixed-length SHA-256 digest comparison with Node `timingSafeEqual`. Invalid login returns the same safe failure without credential details.
- `GET /api/auth/session`: returns only `authenticated`, `localDevelopment` and `expiresAt`. No credential or cookie value appears in JSON. It verifies integrity/expiry and does not extend the session.
- `POST /api/auth/logout`: expires the cookie idempotently, including an already expired or rotated session. Foreign/missing Origin is rejected. It does not invoke Gemini.
- Successful login issues `__Host-biai-reviewer`, with `HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=7200`, no Domain. The cookie contains a signed version, issue/expiry time, origin audience and random nonce. HMAC-SHA-256 authenticates the exact payload; comparison is timing-safe. The two-hour expiry is checked server-side, independently of the browser. Noncanonical, duplicated, forged, expired or tampered cookies are rejected. Changing either reviewer secret invalidates outstanding sessions.
- Cookie-authenticated AI requests, login and logout require an exact Origin/request-URL match, matching Host when supplied, HTTPS in production, and compatible Fetch Metadata. Missing/null Origin and sibling/cross-site metadata fail closed. Forwarded headers cannot override the check. SameSite and host-only Secure cookies add protection; cookies alone are not the CSRF defense. No permissive CORS or cross-origin preflight is added. This follows [OWASP origin verification guidance](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html).
- Both AI handlers use the same authorization function. Existing trusted bearer tokens remain accepted for CLI/server callers without Origin; browser bearer requests still reject foreign origins. No session or password is sent to Gemini. Existing input, schema, model, computation and spending controls remain in place.
- All authentication responses are `no-store`. Errors are fixed safe messages. The browser never reads the HttpOnly cookie, stores credentials in localStorage, or receives server secrets from an endpoint. Password input is cleared on submit/close. Authentication failure/expiry/logout locks both views; logout also clears in-memory AI workspaces and aborts their pending browser requests. Status is rechecked on window focus; BroadcastChannel informs other open tabs without transmitting credentials.

## Local workflow and limits

`npm.cmd run dev` exposes the three auth endpoints through the same actual-loopback socket/Host-checked middleware as the AI endpoints. The existing loopback development trust remains intact; session status confirms this local mode before the UI enables AI actions. Local developer AI access therefore does not require reviewer login. This mode is never enabled in the production functions. Login can be exercised with local reviewer settings; the cookie retains Secure even in local development. Browser acceptance of Secure cookies on plain HTTP localhost can vary—use the isolated HTTPS test harness for reliable cookie verification.

The login handler permits one body read in flight, five attempts per 15 minutes and a conservative 30-attempt hourly cap, counting invalid attempts too. Counters are bounded, in memory and per handler instance; they reset on cold starts and are not shared across instances or endpoints. Shared-instance throttling can also temporarily block another evaluator. Existing Gemini endpoint limits remain independent. No application-level global spend cap is claimed.

Sessions are stateless. Logout removes the current browser cookie and synchronizes open tabs, but a stolen copy remains valid until expiry unless either secret is rotated. There is no per-session revocation database, individual user identity, MFA or password recovery. The shared password is suitable for a limited reviewer audience, not a multi-user identity system. Aborting a browser request cannot guarantee cancellation of provider work already in progress. Non-AI views and fictional sample records intentionally remain public.

## Verification

Run `npm.cmd test`, `npm.cmd run build`, `npm.cmd run lint`, then `node scripts/check-client-secrets.mjs`. The bundle check compares configured local values in memory and prints only the outcome.

For browser checks, run `node tests/browser/reviewer-server.mjs` after building. This isolated test harness serves `dist` at `https://localhost:5180`, uses production-mode auth and real Secure cookies, generates disposable credentials/certificate under ignored `node_modules/.cache/biai-reviewer`, and mocks Gemini in the server. It never loads `.env.local` or production keys. It requires the existing Git-for-Windows OpenSSL executable. Run generated `node_modules/.cache/biai-reviewer/browser-run.js` through Playwright MCP; print only the Result section, not generated code containing temporary test credentials. Screenshots go to `artifacts/task-008/`, outside existing reports. Stop the harness afterwards.

Executed results and changed files: [Task 008 verification](TASK-008-VERIFICATION.md). Live Gemini and deployed Vercel execution were deliberately not tested.
