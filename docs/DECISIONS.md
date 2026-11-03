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
