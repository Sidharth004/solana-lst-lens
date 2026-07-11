# NOTES

Running log: decisions, rejected approaches, obsolete files, long rationale.
`PROGRESS.md` is the fast-reload summary; this file is the deeper "why".

## Phase 0 — Scaffold

### Decisions
- **Workspace shape.** pnpm workspace lists only `web`. `pipeline/` and `shared/`
  live at the repo root and run via `tsx` (no build). This keeps the pipeline a
  set of plain scripts and avoids a second package.json to maintain.
- **Schema import path.** Web uses a `@shared/*` alias (vite `resolve.alias` +
  `server.fs.allow: ['..']`) instead of duplicating types. Pipeline imports
  `../shared/schema` by relative path. Single source of truth preserved.
- **Graceful degradation is in the primitives.** `lib/fetchJson.ts` never throws:
  timeout via AbortController, 2 retries with exponential backoff, retries only
  on 429/5xx, returns `null` otherwise. API keys are redacted from logs.
- **History is append-only by construction.** `lib/history.ts#appendSnapshot`
  reads the array, upserts today's entry by `date` (so re-running the pipeline
  on the same day replaces rather than duplicates), keeps it sorted, and writes
  back. There is deliberately no delete/truncate path.
- **Manual layer merge.** `lib/merge.ts#deepMerge` recurses objects, replaces
  arrays/scalars, and skips `undefined` so a partial override never blanks a
  fetched field. Manual layer always wins on conflict.
- **networkBaseStakingApy = 6.5** seeded in `overrides.json` as the Phase 4
  yield-split fallback constant (percent). Revisit monthly.

### Rejected / considered
- Considered a monorepo with `pipeline` as its own workspace package — rejected
  as unnecessary ceremony for scripts run by `tsx`.
- Considered copying `schema.ts` into `web/` — rejected; violates the single
  source-of-truth rule.

### Obsolete files
- (none yet)

### Environment
- Homebrew node was broken (linked against icu4c 74; only icu4c 78 installed).
  `brew reinstall node` rebuilt it → node 26.5.0, npm 11.17, pnpm 10.8 (corepack).
