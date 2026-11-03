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
- True AI draft integration and cost/key model.
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
