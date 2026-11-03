# BIAI DealDesk — Project Instructions for AI Coding Agents

> Read this file before implementing or changing anything. This is the authoritative development agreement for this repository. Do not treat tentative product ideas as assignment requirements.

## Project objective
Build a small, demonstrable **Corporate Leads Pipeline** for BIAI Round 2, using only the supplied fictional sample data. The submission must work end-to-end and be explainable in a Loom video (maximum 5 minutes) and a live change demonstration.

## Authoritative sources (read before making feature decisions)
- `../BIAI-AI-Intern-Round2-Brief.md` — official task, evaluation, deliverables.
- `../sample-data/intern/task2-corporate-leads/corporate-leads.csv` — original 25 leads.
- `../sample-data/intern/task2-corporate-leads/stage-definitions.md` — stage meanings and rules.
- `../sample-data/intern/task2-corporate-leads/README.md` — dataset context.
- `docs/DESIGN.md` — proposed UX plan, not an override of the task.
- `docs/DECISIONS.md` — recorded choices and unresolved questions.
- `docs/COMMANDS.md` — verified workflow commands.

If a source file is missing or a requirement is ambiguous, **report that explicitly**. Do not manufacture rules, data, or results.

## Required product behavior
1. Display company leads, contact, industry, deal value (BDT), and stage.
2. Preserve ordered active stages: **New → Contacted → Meeting → Proposal → Invoice sent**. End stages: **Paid**, **Lost**.
3. Highlight overdue follow-ups and identify data problems (missing contact details, likely duplicates, invalid date order).
4. Draft a short, polite **English** follow-up email for a chosen lead, grounded in that lead's notes; this is a draft, not an actual sent email.
5. Support plain-language questions about the dataset, with correct computations and traceable answers.
6. Show how many of the 25 leads are flagged correctly, including how duplicates and date errors are handled.
7. Target **3–5 useful screens**, not an oversized application.

## Data integrity and correctness
- **Never alter, overwrite, fabricate, or replace the original source CSV.** If a corrected representation is needed, derive it in application code or create a clearly labeled derived file; retain original IDs and a transparent change/issue log.
- Use **2026-11-01** as the fixed evaluation date for overdue calculations from the supplied README/stage definitions. A follow-up date **strictly earlier** than that date is overdue; the reference date itself is not overdue.
- Distinguish missing values from zeros. A zero or empty deal value may mean no value agreed yet; do not turn it into an invented amount.
- Mark suspected duplicates for human review; never silently delete or merge leads.
- Flag date anomalies but do not silently auto-correct them.
- Never infer a company's industry, contact detail, revenue, or deal status unless it is supported by the sample data.
- If prose notes conflict with a structured field, surface that conflict rather than choosing a truth without disclosure.
- Verify counts/calculations against the actual 25 rows. Do not invent QA numbers.

## AI honesty
- Label genuinely model-generated outputs accurately. Never claim a fixed template is a live AI generation.
- Never pretend an LLM has verified data calculations. Ground numeric answers in deterministic code over the dataset.
- Never claim an email has been sent. The feature creates drafts for human review only.
- Do not send sample contacts or notes to third-party services without explicit user approval. If an AI API is proposed, explain costs, required keys, and the fallback/demo behavior first.

## Implementation constraints
- Environment: Windows PowerShell; Node.js 22 and npm 10; React + TypeScript + Vite project in `app/`.
- Use `npm.cmd` in PowerShell when relevant. Inspect `package.json` rather than assuming dependencies or scripts exist.
- Keep development lightweight for an Intel i5-6200U laptop with 8 GB RAM. Prefer simple components and minimal dependencies; no Docker or local LLM is required.
- Match existing project conventions. Prefer typed, readable code and pure functions for validation/calculation logic.
- Never commit secrets. Never add real customer data. Avoid unapproved external network access.
- Do not install packages, remove files, run deploy commands, reset Git, or make broad refactors without explaining why and obtaining approval when potentially disruptive.

## Agent working protocol
For **each** requested task:
1. Read the relevant source files and existing implementation.
2. State a short plan and any unknowns before modifying files.
3. Change **only** what the requested task needs; keep diffs small.
4. Validate the change using available project scripts/tests. If a command fails, report the exact failure and next diagnosis; do not claim success.
5. Finish with: files changed; behavior implemented; commands and outcomes; remaining concerns; proposed next small step.

Avoid generic dashboards, mock metrics represented as real, unrequested frameworks, wholesale rewrites, and changes to the source pack. If another coding agent is working, wait until its edits complete before making conflicting changes.

## Submission priorities
- Correctness and end-to-end operation outrank feature count.
- A polished, clear Loom presentation is a core graded deliverable.
- Explain AI use and limitations accurately, including which tasks were done by each model.
- The email specifies a submission deadline of **2026-11-05 21:00 Asia/Dhaka**. Do not replace this with the brief's general 72-hour statement.
