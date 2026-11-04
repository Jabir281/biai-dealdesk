# Gemini draft backend

## Architecture

- `server/draft.ts`: one typed Web Request/Response handler for validation, authentication, source lookup, spend limits, prompt construction, native fetch, response validation and safe errors.
- `server/source-leads.ts`: reads the bundled, byte-identical CSV through the existing parser on the server, verifies 25 rows, and caches frozen records. The caller cannot supply notes, context, a model, provider URL or a file path.
- `api/ai/draft.ts`: Vercel Node.js Function using the documented Web-standard `export default { fetch }` signature. Production requires a separate access token; it never enables the local bypass.
- `server/local-adapter.ts` and `server/vite-ai.ts`: translate the local Node HTTP request to the same core handler in the existing Vite server. No second development server or duplicated generation logic.
- `vercel.json`: includes `src/data/corporate-leads.csv` in the function and sets a 30-second maximum duration. Node 22 is the intended deployment runtime. Hosting is not deployed or verified by this task.
- `tsconfig.node.json` now also includes `server/**/*.ts` and `api/**/*.ts`; the existing build type-checks this backend. Client build/type-check settings are unchanged.

The Function signature follows [Vercel's Node.js documentation](https://vercel.com/docs/functions/runtimes/node-js). File inclusion follows [Vercel's function configuration](https://vercel.com/docs/project-configuration/vercel-json#functions).

## Local workflow

Keep the existing `.env.local` private. It must contain `GEMINI_API_KEY` (never `VITE_GEMINI_API_KEY`). The Vite plugin loads this server-side setting on startup; restart Vite after changing it. `.env.local` and other `.env` files are Git-ignored; `.env.example` contains blank credential placeholders and a nonsecret model default.

Optional server-only `GEMINI_MODEL` defaults to `gemini-3.5-flash-lite` when omitted. Set it in `.env.local` for Vite/the smoke script or in server environment variables for Vercel; never use a `VITE_` prefix. Restart Vite after changes. Supported settings are `gemini-3.5-flash-lite` and the original `gemini-2.5-flash`, each with its own reviewed request profile. Blank/unknown values fail closed with `MODEL_NOT_CONFIGURED`, without contacting Google. Aliases and arbitrary URLs are not accepted; adding a different model requires reviewing its API parameters and pricing. There is no automatic fallback. The original model remains configurable for existing eligible users, but its earlier generation failed for this project.

```powershell
npm.cmd run dev
```

The endpoint is `POST http://localhost:5173/api/ai/draft` (use the actual Vite port if different). The dev adapter checks the socket's loopback address and Host/port, and the core rejects foreign Origin/cross-site requests. It is not intended to expose Vite publicly or through a tunnel. CLI requests without Origin work over loopback; this trusts other processes on the developer's computer.

An **explicit live request**, consuming quota, is:

```powershell
Invoke-RestMethod -Method Post -Uri http://localhost:5173/api/ai/draft -ContentType 'application/json' -Body '{"leadId":"L04"}'
```

Do not run this as a health check or on page load. There is no automatic retry or template fallback.

For a one-shot live smoke test using the same Node middleware and core as Vite:

```powershell
npm.cmd run smoke:ai
```

This explicitly starts a temporary loopback server, loads `.env.local` with Node's native environment loader, posts L04 once, prints only validated output/safe errors, then closes the server. It does not deploy anything and is never run by `test`, `build`, or Vite startup. A timeout may still consume provider quota; do not automatically repeat it.

## Contract

Request body must be a JSON object with **only** one string field, such as `{"leadId":"L04"}`. Extra fields are rejected, including caller-provided notes. Request bodies are limited to 1024 UTF-8 bytes, including streaming bodies; compressed input is rejected. Body-read deadline: 3 seconds.

A successful response contains:

```typescript
interface DraftResponse {
  subject: string
  body: string
  leadId: string
  sourceFields: string[]
  model: 'gemini-3.5-flash-lite' | 'gemini-2.5-flash'
  draftOnly: true
}
```

`sourceFields` is determined by the server: the nonempty company, contactName, contactRole, stage and notes fields supplied as model context. It is a provenance list of supplied fields, not a claim that every word of the response was independently fact-checked. Email/phone, deal value, dates, other leads and secrets are not sent. No email is sent by this endpoint.

Errors are JSON: `{"error":{"code":"...","message":"..."}}`. Responses are `no-store`. No provider body, key, authorization header, stack trace or internal exception text is returned or logged.

| HTTP | Code / meaning |
| --- | --- |
| 400 | `INVALID_REQUEST`: invalid JSON/shape/leadId or extra fields |
| 401 | `UNAUTHORIZED`: missing/incorrect production access token |
| 403 | `LOCAL_ACCESS_ONLY`: local socket, Host or Origin restriction |
| 404 | `LEAD_NOT_FOUND`: well-formed but unknown ID |
| 405 | `METHOD_NOT_ALLOWED`: only POST; no permissive CORS/preflight |
| 408 | `REQUEST_TIMEOUT`: body timeout/cancellation |
| 413 | `REQUEST_TOO_LARGE`: declared or streamed body exceeds limit |
| 415 | `UNSUPPORTED_MEDIA_TYPE`: wrong content type or compression |
| 429 | `RATE_LIMITED`: per-instance spending/concurrency guard; safe Retry-After |
| 500 | `SOURCE_UNAVAILABLE` / `SOURCE_TOO_LARGE`: source integrity/load limit |
| 502 | `PROVIDER_FAILURE` / `INVALID_PROVIDER_RESPONSE`: network/provider failure or unusable output; `PROVIDER_REQUEST_REJECTED`: Google HTTP 400 (server request configuration) |
| 503 | `AI_NOT_CONFIGURED`, `ACCESS_NOT_CONFIGURED`, `MODEL_NOT_CONFIGURED`, `PROVIDER_QUOTA_EXCEEDED`, `PROVIDER_ACCESS_DENIED`, or `MODEL_UNAVAILABLE` |
| 504 | `PROVIDER_TIMEOUT`: generation deadline or cancellation |

## Model, grounding and cost controls

- Fixed Google origin and `POST https://generativelanguage.googleapis.com/v1beta/models/{configuredModel}:generateContent`, matching the [official generateContent endpoint](https://aistudio.google.com/api-reference/generate-content). API key in `x-goog-api-key`, never in URL query parameters. No tools, search, SDK, retries or automatic model/provider fallback. Redirects are rejected. A reported different model is rejected; the selected model's numbered revisions are accepted.
- Single candidate, 512 output tokens maximum, JSON subject/body schema. 3.5 Flash-Lite uses `thinkingLevel: MINIMAL` and omits deprecated sampling parameters; the explicit 2.5 override retains `thinkingBudget: 0` and temperature 0.2. See [Google's migration guide](https://aistudio.google.com/docs/whats-new-gemini-3.6#api-changes-and-parameter-updates). At most 4096 UTF-8 bytes of selected source context. Provider response bounded to 32 KiB; generation deadline 20 seconds including response-body reading.
- Returned subject is nonempty, single-line and at most 120 characters. Body is nonempty, at most 1800 characters/160 words, plain text, and not a partial/truncated candidate. Output containing the current key/access token is rejected.
- Trusted system instructions explicitly separate untrusted JSON data, prohibit invented discounts/promises/appointments/payments/commitments, request polite English, require neutral clarification for contradictions, and respect explicit no-contact restrictions with an internal hold message.
- These controls reduce risk but do not prove semantic accuracy, English language compliance or immunity to prompt injection. Human review is required, especially for conflicting notes and no-contact restrictions. Tests check prompt/data separation and output shape; they do not pretend a mocked model verifies real grounding.
- Google documents free-tier standard text input/output for 3.5 Flash-Lite. Paid rates are $0.30/million input tokens and $2.50/million output tokens; 512 output tokens would cost at most $0.00128 plus input at those rates. Actual plan/quota depends on the key's project. Model listing does not establish its billing tier or remaining quota; no billing was enabled or changed. See [Google pricing](https://aistudio.google.com/docs/pricing#gemini-3.5-flash-lite) and [structured output documentation](https://aistudio.google.com/docs/structured-output).
- Google's [2.5 Flash model page](https://aistudio.google.com/docs/models/gemini-2.5-flash) limits API access to existing users until December 1, 2026 and documents later automatic routing. The old request's method, URL and version were correct. Its HTTP 404 means the requested model was unavailable for that generation, not evidence of an invalid JSON payload. It still appears in Models API results, so the precise account-side reason is unconfirmed; deprecation/access restrictions are a plausible explanation, not a proven diagnosis.

## Deployment protection and limits

Production requires **both** `GEMINI_API_KEY` and a separate, randomly generated `AI_DRAFT_ACCESS_TOKEN` of 32–256 characters. Send the latter as `Authorization: Bearer ...` from a trusted caller. Missing protection makes the function return 503; a missing/wrong caller token returns 401 before provider spending. Never use the Gemini key as the access token.

The shared handler permits one generation in flight and at most 5 attempts/minute and 30 attempts/hour **per instance**, counting failed provider attempts too. These in-memory limits reset on process restart/cold start and are not shared between serverless instances. They are not a distributed spend cap.

Do not put the access token in Vite environment variables, browser source, URLs or localStorage. This backend-only demo can be called by a trusted CLI/server. Before a public browser integration, add authenticated server-side sessions or a protected server intermediary, Vercel deployment/firewall rate protection (or a shared rate-limit store), and provider quotas/budget monitoring. Do not deploy an unauthenticated public AI endpoint. This task does not deploy the function or implement browser authentication.

## Verification

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run lint
```

Routine tests use fake credentials and mocked Gemini responses. Coverage includes success, strict validation, actual CSV lookup, unknown ID, missing key, body limits/deadline, local/prod access, secret-safe errors, quota/access/model failures, cancellation, bounded/malformed output, spend/concurrency limits, frozen source records, and real loopback HTTP adapter behavior. Existing Lead Register/Data Health tests run in the same suite.

Live smoke result is recorded in `docs/DECISIONS.md`. It must not be inferred from mocked success tests.

Latest debugging result (2026-11-04): one read-only Models API request returned HTTP 200 and advertised `generateContent` for the preferred `gemini-3.5-flash-lite`. One explicitly initiated generation then returned local HTTP 502 / `PROVIDER_FAILURE`, not a draft. The handler deliberately did not retain raw provider errors, so the underlying provider status versus a transport exception is not established. No retry was made. Live availability and L04 output grounding remain unverified; the successful catalog lookup is not evidence of generation success. See the dated decision record for the inventory and executed checks.

## AI Follow-up frontend — 2026-11-04

The AI Follow-up view now calls the existing endpoint from the local Vite app with only `{leadId}`. Requests use the current origin, no authorization/key headers, and no model/context supplied by the browser. Local Host/socket/Origin checks remain authoritative and unchanged. Requests occur only after an explicit Generate Draft action, have a 25-second client deadline, and never retry automatically. No live provider request was made while implementing this frontend.

Production browser access remains blocked: the Function requires a server-held bearer token, which must not be embedded in the UI. The production build therefore displays an access explanation and disables generation, while allowing source review. The UI availability check is not authentication and does not alter backend protection. Public generation requires the previously documented authenticated server intermediary/session and abuse controls in a separate task.

Successful responses are validated before display, including the selected lead ID and source-field allowlist. Subject/body remain editable and can be copied individually or together. Drafts persist in component memory per lead across view changes; reload clears them. Replacement requires confirmation and preserves the old draft on failure. Data Health warnings reuse existing audit results. There is no template/mock fallback in the application and no sending capability.

Validation and screenshots: [AI Follow-up verification](../reports/ai-follow-up-verification.md). Browser fixtures exist only in automated tests; their success screenshots do not establish live Gemini availability or grounding. Local frontend integration is ready for a separately authorized live test after the existing provider failure is resolved.
