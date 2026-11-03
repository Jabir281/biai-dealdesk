# BIAI DealDesk — Design Direction (Draft)

**Status:** Proposal, not final architecture. Requirements come from the official brief and stage definitions.

## The user problem
BIAI's team needs to see the state of fictional corporate training opportunities, identify leads needing attention, and choose useful next actions without searching a spreadsheet manually.

## Product principle
**Clarity before cleverness.** A sales teammate should answer: What needs my attention? Why? What should I do next?

## Proposed 3–4 views
1. **Overview:** Real counts and BDT values calculated from the source rows; overdue and data-quality highlights.
2. **Pipeline:** Filterable lead table/cards organized by the seven defined stages, with contact, industry, deal value and follow-up date.
3. **Lead detail:** Notes, source fields, visible data warnings, explanation for flags, and AI-assisted email draft with explicit review/copy action.
4. **Ask the pipeline / Data health:** Plain-language query results grounded in deterministic data calculations, and a transparent issue list. Could combine into one view if simpler.

## Quality bar
- Fast, lightweight, legible on a standard laptop display.
- Keyboard-accessible actions and clear field labels.
- Strong empty/error/loading states.
- No fictional analytics, stock testimonials, random graphs, or flashy motion that masks data problems.
- Every displayed number must be traceable to the supplied CSV and documented transformations.
- Keep email drafting and plain-language questioning distinguishable from ordinary filtering/calculations.

## Decisions to settle when we reach them
- Whether AI drafts are produced through an approved API, an optional backend, or presented as a carefully labeled non-AI fallback.
- Whether to persist manual corrections (and where), without touching the source CSV.
- Hosting approach and any key-handling requirements.

**Do not implement these decisions until they are discussed and recorded in `DECISIONS.md`.**
