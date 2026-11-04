# Decisions and Open Questions

This is a short **decision log**, not an AI brain dump. Record important choices and why we made them. A documented decision should be testable or defensible in the BIAI interview.

## Confirmed
- **Task:** Corporate Leads Pipeline (Task 2), not the CRM.
- **Source of truth:** BIAI's attached brief, sample corporate leads CSV, README, and stage definitions.
- **Local development:** Windows PowerShell, Node.js, npm, VS Code, React + TypeScript + Vite.
- **Reference date:** 2026-11-01 for dataset overdue logic.
- **Working style:** Small tasks, human review, explicit tests, and minimal changes per agent run.

## Planned, not yet implemented
- Working name: **BIAI DealDesk**.
- Simple dashboard, pipeline, lead detail, and data-health/question interface.
- Source CSV remains untouched; app computes issues and metrics from it.

## Open questions
- Data-correction UI and persistence approach.
- Production browser authentication and distributed AI rate limiting before public integration.
- Natural-language question implementation and supported query scope.
- Demo deployment location.

## Change log template
Add new entries like:

`2026-11-03 | Decision | Why | Trade-off | How verified`

Do **not** mark features complete without running and reporting their checks.

## Lead register — 2026-11-03
- Bundle a byte-identical CSV copy at `src/data/corporate-leads.csv` through Vite's raw import. Use a small typed CSV state machine with quoted-field support; no new dependencies or external requests.
- Preserve all original IDs, fields and source order. Empty deal values remain `null` and zero remains `0`; both display as “Not agreed”. Currency is BDT with English digit grouping.
- Compare validated ISO dates strictly against `2026-11-01`, with no implicit end-stage exclusion. L25 stays overdue even though its date order is flagged. No dates are corrected.
- Search company, contact name, email, phone or lead ID; intersect search with the seven-stage selector and overdue checkbox. Source and overdue totals remain independent of filtered results.
- Use a navy/teal table on desktop and labeled lead cards on narrow screens. Original notes are expandable. Matching company names or nonempty email addresses identify possible duplicates for review; no merge occurs. This is a limited review aid, not a complete data-health audit.
- Removed unused `src/App.js` and `src/main.js`: the entry point explicitly uses `.tsx`, TypeScript has `noEmit`, and the stale JSX files caused ESLint parsing failures.
- Verified 25 records, all nine expected overdue IDs, L09 excluded, duplicate pairs retained, stage counts, quoted/empty fields and filter combinations with `node --test tests/leads.test.mjs` (7 passing tests). Build and lint pass. Browser interactions and desktop/mobile screenshots were checked.

## Data Health — 2026-11-03

- Add a separate Data health view with category filtering and expandable, read-only source records. Navigation preserves the Lead Register's filter state; no routing dependency or backend was added. Reload starts at the register.
- Pure typed rules in `src/data/health.ts` operate on the parsed source records. No LLM, correction, merge, deletion or external lookup is involved.
- Name, email and phone are the explicit contact-completeness baseline; each missing field is one definite data error. Contact role is optional because the source does not establish it as essential. An available phone does not fill in an absent name/email.
- A next follow-up strictly before last contact is a definite date-sequence error. Equal dates and missing last-contact dates do not trigger this rule. The CSV parser already validates date formats.
- Duplicate detection produces one issue per matching pair, with evidence for every matching nonempty field. Normalize email case/outer spaces; phone punctuation and Bangladesh +880/00880 mobile prefixes; company case, punctuation, whitespace and trailing Ltd/Limited. No fuzzy synonym expansion or transitive merging. Shared contacts/names always require human confirmation, even where source notes call the row a duplicate.
- Note rules are conservative, sentence-based matches for explicit source statements: “No phone or email on file yet.” against populated fields; Paid plus a partial-percent advance and an explicit second payment due; a sent price list/proposal while at New/Contacted/Meeting; and an explicit email-typo note. Questions, requests and negated sent statements are covered by negative tests. These are narrow dataset rules, not general natural-language understanding.
- All field/note conflicts require review: either the structured field or prose may be stale/wrong. L20 is included because its note explicitly says “Price list sent.” while its stage is Contacted; the official Proposal definition includes a sent price list. L22's “Paid?” question alone does not establish a contradiction. L18 is a verification request, not proof of an invalid email; capitalization alone is not an error.
- Severity is independent of certainty: High for date order/payment conflict, Medium for contact gaps/duplicates/other conflicts, Low for email verification. Severity is a review-priority decision, not a confidence score.
- Count distinct lead IDs across all issues, including both members of duplicate pairs. Global totals remain fixed while filtered counts describe the visible category. One lead can have multiple issues; category lead counts overlap.

Verified source results:

| Category | Issues | Matching lead IDs |
| --- | --- | --- |
| Missing contact | 3 | L06 (phone); L24 (name, email) |
| Possible duplicate | 2 pairs | L01/L23; L02/L03 |
| Date order | 1 | L25 |
| Field / note conflict | 3 | L06, L12, L20 |
| Email verification | 1 | L18 |

**10 unique leads out of 25; 10 issues: 4 definite errors and 6 review candidates.** The equal lead/issue totals are coincidental. L06 alone has 2 issues but counts as 1 lead; each duplicate pair is 1 issue covering 2 leads. These are detected flags, not a claim of independently verified precision or exhaustive data cleaning.

Scope limits: contact role, missing follow-up dates, general email validity/deliverability and arbitrary prose contradictions are not audited. Overdue dates remain operational flags in the register, not automatically data errors. All records, original IDs, values and dates remain unchanged.

Validation: 18 passing Node tests (7 existing and 11 new), production build and lint. Playwright exercised every category, reset, all associated-record expansions, navigation and retained register filters at 1366×768 and 390×844. It confirmed 25 source records, 9 overdue, no tested layout overflow and no browser errors. Screenshots are in `reports/data-health-screenshots/`. The original CSV SHA-256 remains `E2528AA4CC87EB5B718FC532912DB8A0BDDC714A736F0C31A80FFACAF86A66E1`.

## Server-side Gemini draft connection — 2026-11-03

- User explicitly authorized sending one fictional sample lead to Gemini for a live smoke test. No frontend or email-sending capability was added. Existing register, audit, parser and source data were left unchanged.
- Native fetch with the fixed `gemini-2.5-flash` generateContent endpoint. A shared Web handler is used by the Vercel Function and a loopback-only Vite middleware adapter. No SDK, dependencies, backend service or model/provider fallback was introduced.
- Only `{leadId}` is accepted. The server loads the actual source CSV, selects nonempty company/contact-name/contact-role/stage/notes fields, and supplies them as untrusted data separate from trusted instructions. Recipient email/phone, dates, values and other records are not provided as context. Source fields in the response are selected by deterministic code.
- `GEMINI_API_KEY` stays in the server environment; Vite loads it from ignored `.env.local` on server startup. No secret was printed or embedded in client code. Production additionally requires a separate 32–256 character `AI_DRAFT_ACCESS_TOKEN`; absence fails closed. Never expose that token in a browser bundle. Public UI integration still needs authenticated server-side access and shared/platform abuse protection.
- Limits: 1024-byte input, 3-second body deadline, 4096-byte context, one candidate, thinking budget 0, 512 output tokens, 20-second provider deadline, 32-KiB provider body, subject ≤120 characters and body ≤1800 characters/160 words. One in-flight generation, 5 attempts/minute and 30/hour per instance. No automatic retry; these in-memory limits are not distributed or persistent across cold starts.
- Errors use fixed safe messages. Provider response bodies, exception text, credentials and authorization headers are never logged or returned. Schema/size validation cannot prove factual grounding or guarantee resistance to prompt injection; all drafts require human review.
- Server files and the Vercel entry are now included in the existing Node TypeScript project. No TypeScript checks were disabled. Function bundling explicitly includes the CSV; actual Vercel deployment has not been performed.

Verification:

- `npm.cmd test`: **30 passed** (12 mocked backend tests plus 18 existing data tests). No routine test uses Gemini quota. The HTTP adapter is exercised on a real loopback socket with a mocked provider.
- `npm.cmd run build` and `npm.cmd run lint`: passed. Six built client files were checked against the local secret values and credential-variable names without printing those values; none were found.
- Running Vite endpoint: GET → 405, invalid JSON shape → 400, unknown L99 → 404, all without provider calls.
- Original and bundled CSV SHA-256 still match `E2528AA4CC87EB5B718FC532912DB8A0BDDC714A736F0C31A80FFACAF86A66E1`. `.env.local` is ignored.

### Exactly one live smoke attempt

Explicit command: `npm.cmd run smoke:ai`. Requested lead **L04**, model **gemini-2.5-flash**. The command used the same local HTTP adapter/core as Vite and made one provider request. Gemini returned **HTTP 404**; the endpoint returned **503 / MODEL_UNAVAILABLE** with the safe message “The requested Gemini model is unavailable. No alternative was selected.” Command exit code: 1. No retries and no alternative model/provider were used.

The selected source context was Karnaphuli Foods, Tanvir Hasan, Training Manager, Contacted, with notes: “Interested in sales team AI training. Did not reply to last two messages.” **No live draft was returned, so real output grounding could not be verified.** Mocked responses are not evidence of live model availability or quality.

Status: request/response contract and local backend are ready for frontend development against mocks, but live drafting is blocked by model availability/access for this request. Resolving the model/access issue and authorizing a new live test is the next step; public deployment also requires the documented protection work. See [AI-BACKEND.md](AI-BACKEND.md).

## Gemini model-access debugging — 2026-11-04

The user authorized one read-only model listing and, conditional on a supported free-tier-compatible model, one new L04 generation. Existing uncommitted work was preserved. No frontend, source CSV, dependencies, build configuration, billing settings or deployment were changed.

### Diagnosis and model selection

- The old request used `POST https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`, with the key in `x-goog-api-key`. This matches the [official generateContent API](https://aistudio.google.com/api-reference/generate-content). No incorrect method, API version or path construction was found.
- Google's [2.5 Flash page](https://aistudio.google.com/docs/models/gemini-2.5-flash) documents restricted/deprecated access. This is consistent with the previous generation's 404, but is not a proven account-specific explanation. The model still appeared in the catalog below. The original raw error was intentionally not retained; its exact provider-side cause cannot be established from the safe 503 alone.
- Exactly one `GET https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000` returned HTTP 200, with no next page. It used the existing key in a header; only status, validated model names and pagination presence were printed. No generation, retries or additional model lookups occurred in that diagnostic request. The [Models API](https://aistudio.google.com/api-reference/models/list-models) reports capabilities, not project billing tier or remaining generation quota.
- Selected `gemini-3.5-flash-lite`, the user's preferred model, advertised with `generateContent`. Google's [pricing table](https://aistudio.google.com/docs/pricing#gemini-3.5-flash-lite) documents free standard text input/output. No billing was enabled; the account's actual billing tier was not independently verified.

Full returned inventory filtered to `generateContent` (catalog visibility is not a claim that every model was tested or is suitable for email drafting):

```text
gemini-2.5-flash
gemini-2.5-pro
gemini-2.5-flash-preview-tts
gemini-2.5-pro-preview-tts
gemma-4-26b-a4b-it
gemma-4-31b-it
gemini-flash-latest
gemini-flash-lite-latest
gemini-pro-latest
gemini-2.5-flash-lite
gemini-2.5-flash-image
gemini-3-flash-preview
gemini-3.1-pro-preview
gemini-3.1-pro-preview-customtools
gemini-3.1-flash-lite-preview
gemini-3.1-flash-lite
gemini-3-pro-image-preview
gemini-3-pro-image
nano-banana-pro-preview
gemini-3.1-flash-image-preview
gemini-3.1-flash-image
gemini-3.1-flash-lite-image
gemini-nano-banana-2.1
gemini-3.5-flash
gemini-3.5-flash-lite
gemini-omni-flash-preview
gemini-omni-1.1-flash
gemini-3.5-transcribe
gemini-3.6-flash
gemini-3.7-flash
gemini-3.8-flash
gemini-4-argon
lyria-3-clip-preview
lyria-3-pro-preview
lyria-3.5
gemini-3.1-flash-tts-preview
gemini-3.8-flash-tts
gemini-3.8-flash-lite-tts
gemini-robotics-er-2-preview
gemini-2.5-computer-use-preview-10-2025
antigravity-preview-05-2026
antigravity-preview-09-2026
antigravity-preview-latest
deep-research-max-preview-04-2026
deep-research-preview-04-2026
deep-research-pro-preview-12-2025
```

### Minimal backend changes

`GEMINI_MODEL` is server-only and defaults to `gemini-3.5-flash-lite` when omitted. Vite, Vercel and the manual smoke script pass the setting to the same handler. Supported profiles are the new default and an explicit `gemini-2.5-flash` override; unknown/blank settings fail closed before spending quota. The 3.5 profile uses minimal thinking and omits deprecated sampling parameters. The original 2.5 profile retains its previous settings. Returned model identity is checked against the selection (numbered revisions accepted); no fallback occurs. Provider HTTP 400 is separately mapped to safe `502 PROVIDER_REQUEST_REJECTED`; 404 remains `503 MODEL_UNAVAILABLE`. The email request/response shape and source selection remain unchanged.

### Executed verification and blocker

- `npm.cmd test`: **33 passed**, including all 18 existing data tests and 15 mocked backend tests. Configuration tests cover defaults, overrides, matching request profiles, rejected settings/URL injection, model mismatch, caller-supplied model rejection, and safe 400/401/403/404/429/5xx handling without retries.
- `npm.cmd run build`: passed with TypeScript validation. `npm.cmd run lint`: passed.
- Exactly one `npm.cmd run smoke:ai` selected **gemini-3.5-flash-lite**, posted **L04** and exited **1**. Endpoint result: **HTTP 502 / PROVIDER_FAILURE**. No retry, fallback or second generation was made.
- No subject/body response was returned. L04's source notes remain: “Interested in sales team AI training. Did not reply to last two messages.” Live grounding could not be checked. Mocked success does not establish real generation success.
- The new failure is a different safe error from the previous model 404. It may represent an otherwise unmapped provider status or a transport exception; the handler intentionally suppresses raw details, so neither a specific provider status nor a resolved model-access problem is claimed.

Live drafting remains blocked. Further diagnosis would need a separately authorized attempt with narrowly scoped, secret-safe status diagnostics or a review of Google project access/quota. Existing production authentication and distributed rate-limit limitations still apply. Stop here without additional live requests.

## AI Follow-up frontend — 2026-11-04

- Added a third navigation view with original lead selection, contact/stage/notes context, existing Data Health warnings, and a responsive editable email workspace. Preserve navy/teal styling and the existing typeface. All 25 IDs remain selectable, including duplicates.
- Browser requests contain only `leadId`, go to the same-origin endpoint and carry no API key or production access token. The existing local Vite access rules support this flow; no backend or authentication changes were made. Production generation is explicitly disabled because secure browser authorization is not implemented.
- Keep drafts and edits per lead in memory across navigation, clear on reload, confirm replacement, and preserve prior edits if generation fails. Disable duplicate submissions and lead switching while pending. Copy actions use the current edited text and announce success/failure. There is no automatic sending, automatic retry or fabricated fallback.
- Validate response shape, selected ID and source fields. Render returned text through React fields; use fixed actionable error messages rather than arbitrary provider text. Source-field labels describe supplied context, not verified factual accuracy.
- `npm.cmd test`: **41 passed** (8 new client tests, 15 existing backend tests, 18 existing data tests). Build/type-check and lint passed. Playwright MCP completed **61 checks** at 1366×768 and 390×844 using HTTP interception only, plus production access checks at both sizes. The final browser flow intercepted 16 draft requests; no live provider requests occurred. All copy actions were checked against the Windows clipboard (normalizing CRLF in tests), including a simulated denial.
- Existing register search/stage/overdue filtering, 25 source records, 9 overdue records, Data Health counts/category/source inspection, mobile layouts and keyboard focus were checked. No uncaught application errors or failed assets. The 15 console resource errors were deliberately injected mock HTTP/network failures. CSV hashes are unchanged; six built client files contain no local credentials or server credential-variable names.
- Live generation remains blocked by the previously recorded provider failure. Production browser authentication remains a separate blocker. No billing, deployment, dependencies or Git commits were introduced. See [verification report](../reports/ai-follow-up-verification.md) for screenshots and limitations.
