# Task 009 — Vercel runtime import hotfix

## Root cause

The confirmed production error was a packaging/module-resolution failure before session handling could run:

```text
Cannot find module '/var/task/server/reviewer-auth.ts'
imported from /var/task/api/auth/session.js
```

The application uses explicit `.ts` relative imports so Node's local TypeScript execution can run the existing tests and development handlers. Vercel emits the entrypoints and traced TypeScript dependencies as `.js`. The production entry still requested `.ts`, which was not present at that path in the runtime artifact. Changing the reviewer password cannot resolve this failure.

Before this hotfix, the root `tsconfig.json` contained only `files: []` and project references. Compiler settings in `tsconfig.node.json` are useful to local `tsc -b`, but Vercel documents that its Node TypeScript compilation does not support project references. The root config must carry the emission settings Vercel needs. [Vercel Node TypeScript documentation](https://vercel.com/docs/functions/runtimes/node-js#using-typescript-with-the-nodejs-runtime).

Vercel's published builder traces dependencies, transpiles TypeScript and stores compiled files with JavaScript extensions. The source confirms why retaining a `.ts` import can disagree with the packaged filename. The exact builder version used for the failed deployment was not available here. [Vercel builder source](https://github.com/vercel/vercel/blob/main/packages/node/src/build.ts).

The regression test reproduces the import mismatch using the actual `api/auth/session.ts` source: without rewriting, its emitted import ends in `reviewer-auth.ts`; with the new root option it ends in `reviewer-auth.js`.

## Fix and function construction

The root TypeScript config now explicitly sets `target: ES2023`, `module: NodeNext`, `moduleResolution: NodeNext` and `rewriteRelativeImportExtensions: true`. The existing project references and type-checking workflow remain. TypeScript rewrites relative TypeScript extensions in emitted JavaScript; no source import rewrites or duplicated tracked JavaScript files are required. [TypeScript option documentation](https://www.typescriptlang.org/tsconfig/rewriteRelativeImportExtensions.html).

Deployment still uses Vercel's standard Node.js builder for the five existing `api/**/*.ts` entrypoints and existing Web-standard `default.fetch` exports. It traces their shared server/data dependencies, emits JavaScript in the corresponding relative paths, and preserves the root `package.json` ESM setting. This is a module tree, not a new single-file bundler or custom runtime.

`vercel.json` now applies one `api/**/*.ts` function rule with the existing 30-second limit and `includeFiles: src/data/corporate-leads.csv`. Thus all five function packages explicitly include the byte-identical CSV. Auth imports `reviewer-auth → draft → source-leads`, even though auth requests do not themselves read the dataset. CSV inclusion handles the filesystem asset; it does **not** fix JavaScript imports—the root compiler option addresses that separately. This uses the supported function glob/includeFiles configuration. [Vercel function configuration](https://vercel.com/docs/project-configuration/vercel-json#functions).

Reviewed runtime dependency graph:

| Entry | Runtime dependencies beyond the entry | Emitted JS modules |
| --- | --- | --- |
| auth/login, auth/session, auth/logout | reviewer-auth, draft, reviewer-session, source-leads, data/leads | 6 each |
| ai/draft | draft, reviewer-session, source-leads, data/leads | 5 |
| ai/query | query, draft, reviewer-session, source-leads, data/leads, query-plan, query-engine, data/health, ai/query-contract | 10 |

All other runtime imports in those graphs are Node built-ins. Type-only imports are erased. `server/local-adapter.ts` and `server/vite-ai.ts` are development-only and are not part of production function graphs. No bare third-party runtime dependency, external module, computed import or source `.ts` file is needed in the checked artifacts.

## Regression check

`npm.cmd run check:server` performs an offline check using the already-installed TypeScript compiler. It is also part of `npm.cmd run build` and `npm.cmd test`.

1. Read the root compiler configuration and require the ESM/rewrite settings; validate the five entrypoints and CSV function rule.
2. Compile every production entrypoint and its transitive modules with type checking and `noEmitOnError`.
3. Parse emitted JavaScript imports and recursively verify that each resolves inside the generated artifact. Reject leftover `.ts` imports, missing JavaScript, computed imports or unreviewed external dependencies.
4. Create five isolated Vercel-style `.func` directories containing only each entry's emitted dependency graph, an ESM package marker, a Node 22 function descriptor, and the 5,485-byte unchanged CSV.
5. Start a fresh Node process in each artifact with **TypeScript stripping disabled**, no loader hooks and no inherited application secrets. Invoke the actual emitted function export. Use disposable test credentials and replace fetch with a provider mock before import. Verify login, session state, logout, rejected unauthorized/foreign-origin calls and authenticated AI results, including the exact nine overdue IDs.
6. Remove only the unique scratch directory created by the check. No generated deployment directory is tracked, and no application source is copied into tracked output.

Negative tests ensure the check catches the reported `.ts` import error and missing `.js` files. The check is intentionally an offline **Vercel-style artifact/runtime check**, not an actual Vercel CLI build. It does not reproduce Vercel's private hosting/launcher behavior or prove deployment success.

## Executed results — 2026-11-05

- `npm.cmd test`: **77 passed** (all existing 74 unchanged, three new packaging regressions).
- `npm.cmd run build`: passed TypeScript checking, Vite production build and all five isolated function checks.
- `npm.cmd run lint`: passed.
- `npm.cmd run check:server`: passed all five functions.
- `node scripts/check-client-secrets.mjs`: passed, three client files checked for server credential names and configured local credential values.
- `git diff --check`: passed. `vercel.json` parses correctly and matches the checked packaging configuration.
- Original and app-copy CSV SHA256 remain `E2528AA4CC87EB5B718FC532912DB8A0BDDC714A736F0C31A80FFACAF86A66E1`.
- No live Gemini calls, account access, package installation, commit, push or deployment. Existing untracked `.playwright-mcp/`, `artifacts/`, `reports/` and `reports.zip` were left alone.

Vercel CLI and `@vercel/node` are not installed in this workspace. No account-linked build was attempted and no authorization was requested. Actual hosted Vercel tracing, deployment settings and launcher execution remain unverified until a separately authorized fresh deployment. The known JavaScript-versus-TypeScript import mismatch is fixed and verified locally.

## Exact changed files

- `tsconfig.json`: root-level Node ESM and extension-rewrite settings.
- `vercel.json`: one function glob explicitly includes the CSV for all five endpoints.
- `package.json`: build-time runtime check and `check:server` script; no dependency changes.
- `scripts/check-server-imports.mjs`: emission, dependency-closure and isolated packaging check.
- `scripts/check-server-runtime.mjs`: secret-free child-process runtime exercises with mocked fetch.
- `tests/server-packaging.test.mjs`: actual import-emission reproduction and positive/negative packaging regressions.
- `docs/REVIEWER-ACCESS.md`, `docs/AI-BACKEND.md`, `docs/DECISIONS.md`: current packaging guidance.
- `docs/TASK-009-VERCEL-PACKAGING.md`: this report.

No frontend, authentication implementation, cookie/CSRF policy, API request format, Gemini model/schema, query executor, lead parser or source CSV was changed.

## Safe next Git/deployment steps

No Git mutation or deployment was executed. The owner can review `git diff` and `git status --short`, then explicitly select only the files listed above for a later commit; avoid staging the unrelated untracked artifacts or any `.env` file. Keep the existing lockfile and secret settings.

For a later authorized Vercel deployment, use the app directory containing `package.json` as Root Directory, Node.js 22, Vite, `npm run build`, and output `dist`. Ensure an old custom build command does not bypass the package build script. Create a **fresh deployment of the fixed revision**, rather than promoting the broken artifact; if necessary disable the old build cache. Keep the existing server-only reviewer and Gemini environment variables unchanged.

After deployment, first check `/api/auth/session`: with configured reviewer settings it should return 200 and an unauthenticated state; missing configuration should produce a controlled 503, never module-not-found 500. Then test sign-in, session persistence, cross-origin rejection, logout and unauthorized POST rejection for both AI endpoints. These checks need no Gemini generation. Any subsequent live AI verification is a separate, explicitly authorized quota-consuming action.
