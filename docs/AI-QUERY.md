# Ask Your Pipeline

## Current access — Task 008, 2026-11-05

Production Ask now unlocks after reviewer session status is confirmed, alongside AI Follow-up. The query request format, Gemini schema and deterministic executor are unchanged. Server-only reviewer configuration, signed HttpOnly cookies, CSRF rules and deployment steps are documented in [Reviewer access](REVIEWER-ACCESS.md). No live provider request was made during Task 008; the earlier smoke-test failure below is a historical result, not a new test of the user's working integration.

Implemented 2026-11-04. **Live interpretation is blocked:** the one authorized live test returned upstream HTTP 400, exposed safely as `502 PROVIDER_REQUEST_REJECTED`. No retry was made. Mocked verification is not evidence of working live interpretation. See [verification](../reports/query-verification.md).

## Architecture and contract

`POST /api/ai/query` accepts only `{"question":"..."}`. Gemini interprets the question into a JSON plan; it never provides the trusted final answer. The server validates every property and combination, executes the plan against the canonical 25 records plus existing Data Health results, and constructs the answer, criteria, warnings and supporting IDs deterministically. No keyword recognizer, deterministic NLP fallback, model-supplied totals, eval, generated SQL, arbitrary tools or second model call exists.

The shared core is `server/query.ts`. Vite uses the existing loopback HTTP adapter; `api/ai/query.ts` exposes the same handler as a Vercel Function. The model selection and authorization helpers are shared with email drafting. `GEMINI_MODEL` remains server-only, defaults to `gemini-3.5-flash-lite`, and supports the existing explicit `gemini-2.5-flash` override. No automatic fallback occurs. Email behavior is unchanged.

Only the question, field/schema descriptions and business rules go to Gemini. The server does not attach CSV rows, contacts or notes. Users should still avoid including unnecessary personal information in their questions. Questions are explicitly untrusted data. Source text is used only as data by the executor, never as instructions.

Successful answers include `status`, `question`, `model`, `referenceDate`, the validated `plan`, deterministic `answer`, `criteria`, `warnings`, `sourceCount`, `matchedLeadIds`, `displayedLeadIds`, `issueIds`, aggregate `value`, `groups`, and associated original `records`. Clarification/unsupported responses contain `status`, `question` and a safe limitation message; they contain no calculated answer. Errors use the existing `{error:{code,message}}` format and `no-store` responses.

## Supported plans

The exact typed contract is in `src/ai/query-contract.ts`; complete runtime validation is in `server/query-plan.ts`.

| Operation | Behavior |
| --- | --- |
| `list` | Matching original leads, optional top N (1–25), ascending/descending record-field sorting |
| `count` | Distinct lead IDs or distinct matching Data Health issue IDs |
| `sum` | Positive agreed deal values in BDT, computed in integer cents |
| `group` | Lead counts, issue counts or agreed BDT totals by stage or industry; order by group or computed value |

Filters support up to four OR groups with up to six AND predicates each. Allowlisted comparisons include equality, membership, literal case-insensitive text containment, date/value ordering and missing/present values, with field-specific restrictions. Values are bounded strings and validated as real dates, finite decimal thresholds, official stages or audit enums where appropriate. Unknown keys, extra fields, unsupported operators and incompatible combinations fail closed. All required fields must be supplied even for a limitation response.

Fields include ID, company, contact name/role/email/phone, industry, source, stage, agreed value, last contact, next follow-up, overdue, value-agreed status and existing audit category/severity/certainty. Grouping includes all source groups, including zero matches. Stage comparisons apply only to the five active stages; Paid and Lost require explicit selection. Stage sorting uses all seven official stages. Multiple audit predicates must match the same issue.

Every result explains its criteria and includes supporting IDs. List limits affect displayed rows, not the matching-source count. Each question is independent; references to unspecified prior results require clarification. There is no conversation history sent to Gemini.

## Data rules and limitations

- Reference date is fixed at **2026-11-01**. Earlier follow-ups are overdue, including end-stage records; missing dates and the reference date itself are not overdue.
- All 25 records remain distinct, including duplicate candidates. Zero/empty values mean not agreed and are excluded from value comparisons, ranking and sums, with disclosure.
- Totals warn when contributing records include both members of a suspected duplicate pair. Audit flags and structured fields are recorded evidence, not established business truth.
- Issue counts deduplicate issue IDs; flagged-lead counts deduplicate lead IDs. Grouped issue counts can overlap when a duplicate issue spans groups, and the response warns accordingly.
- Unsupported requests include forecasts, unrecorded revenue/payments, arbitrary interpretation of notes, averages, arithmetic between aggregates, deduplicated company totals, and filtering aggregate groups. No corrected contact data or inferred facts are invented.
- A syntactically valid model plan can still misunderstand intent. Users must review the displayed criteria. Mocked tests verify execution and safe boundaries, not general language understanding or immunity to prompt injection.

## Access, spending and failure handling

Local development preserves the existing actual-loopback socket, Host, Origin and request-site restrictions. Browser request bodies carry only the question, without key or bearer token. Production accepts a valid reviewer session cookie or the existing separate trusted `AI_DRAFT_ACCESS_TOKEN` and fails closed without valid authorization. The production UI enables Ask only after a confirmed reviewer session. The server verifies the cookie, expiry and exact same origin on each request; the UI check is not authentication.

Limits: 800 question characters, 4096 request bytes, three-second body deadline, 20-second provider deadline, 25-second browser deadline, 1536 output tokens, 32 KiB provider response, one in-flight interpretation, five attempts/minute and 30/hour per handler instance. Failed provider attempts count. There are no retries, redirects, external tools or unsupported `candidateCount` parameters. Provider output is checked for truncation, model mismatch, malformed plans and current-secret echoes. Raw provider bodies and internal secrets are never returned or logged.

Query and email limits are independent and in memory. They reset on restart and do not aggregate across Vercel instances. Reviewer sessions now provide browser authentication; distributed abuse controls and provider budget/quota monitoring are still needed. No deployment or authentication weakening was performed.

Provider HTTP 400 maps to `PROVIDER_REQUEST_REJECTED`; 404 to `MODEL_UNAVAILABLE`; 429 to `PROVIDER_QUOTA_EXCEEDED`; invalid model output to `INVALID_QUERY_PLAN`; deadline expiry to `PROVIDER_TIMEOUT`. Other existing safe configuration/access/provider errors remain available. No failure is replaced with fabricated results.

## Verification commands

`npm.cmd test`, `npm.cmd run build`, and `npm.cmd run lint` consume no provider quota. Generate browser-only fixtures with `node tests/browser/query-fixtures.mjs`, then run `reports/query-browser-run.js` through Playwright MCP against port 5173. The fixture generator never interprets user questions or ships with the app. Production checks use `tests/browser/query-production.playwright.js` against a built preview on port 5174. Close the test page to discard interception routes.

`npm.cmd run smoke:query` explicitly makes one real provider call and independently checks the returned IDs/count against the original CSV. **Do not rerun it as routine verification.** The authorized attempt has already been used and failed. Further live diagnosis requires a separately authorized attempt. Google documents structured output configuration and limitations in its [official documentation](https://aistudio.google.com/docs/structured-output); the safe HTTP 400 alone does not identify the rejected field or establish its cause.
