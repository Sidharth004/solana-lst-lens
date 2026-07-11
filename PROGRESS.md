# PROGRESS

## Current status
- Phase: 0 — Scaffold, **complete**
- Last session ended: 2026-07-11, finished scaffold (structure, schema, manual layer, lib helpers, web shell) and verified typecheck.
- Next action: Start Phase 1 — implement `pipeline/sources/sanctum.ts`, `pipeline/derive/realizedApy.ts`, and `pipeline/run.ts` to produce iteration-1 `data/latest.json`. Needs `SANCTUM_API_KEY` in `.env` to run against live data.

## Phases completed
- [x] Phase 0 — Scaffold (commit: `chore: scaffold repo, schema, and manual data layer`): full file structure, `shared/schema.ts`, manual data layer seeded, append-only history helpers, fetchJson/merge libs, minimal Vite+React web shell. `tsc --noEmit` passes across workspace.
- [ ] Phase 1 — Sanctum pipeline (iteration-1 dataset)
- [ ] Phase 2 — Web app (iteration-1 UI, white theme)
- [ ] Phase 3 — Deploy + daily cron (ship v1)
- [ ] Phase 4 — Yield split + decentralization
- [ ] Phase 5 — DeFi deployment + exit cost
- [ ] Phase 6 — Intent router, history charts, risk flags

## What works right now
- `pnpm install` succeeds (root + web workspace).
- `pnpm typecheck` passes (pipeline/shared via root tsconfig + web via its own tsconfig).
- `pnpm pipeline` runs a no-op placeholder (real orchestration lands in Phase 1).
- Web shell renders a placeholder page; real UI in Phase 2.

## Key decisions made
- Package manager: **pnpm 10.x** via corepack. Node **26.5.0** (see gotcha below).
- Workspace: root holds `pipeline/` + `shared/`; `web/` is the only pnpm workspace package. Root scripts: `pipeline`, `dev`, `build`, `typecheck`.
- Schema lives in `shared/schema.ts`; web imports it via the `@shared/*` alias (vite alias + `server.fs.allow: ['..']`). Pipeline imports it by relative path.
- Pipeline runs via `tsx` (no build step). `fetchJson` returns `null` on any failure and never throws → graceful degradation. `history.appendSnapshot` upserts by date (idempotent re-runs) and never truncates.
- `data/manual/` is read + merged, never written. `overrides.networkBaseStakingApy = 6.5` seeded for the Phase 4 yield model.

## Environment / setup state
- API keys configured: **SANCTUM_API_KEY not yet set** — needed to run the Phase 1 pipeline against live data. Store in `.env` locally (gitignored) and as a GitHub Actions secret for the cron (Phase 3).
- Deploy: not set up (Phase 3).
- Cron: not set up (Phase 3).

## Known issues / TODO / deferred
- Phase 1 verification requires a live `SANCTUM_API_KEY`. Without it the pipeline still completes but writes an empty/partial dataset (by design).
- `pipeline/sources/{stakewiz,defillama,jupiter}.ts` and `derive/{yieldSplit,decentralization,deployment}.ts` are valid empty stubs.

## Gotchas for next session
- **Node/icu4c:** the machine's Homebrew node was broken (linked against icu4c 74; only icu4c 78 present). Fixed via `brew reinstall node` → node 26.5.0. If `node` errors with a missing `libicui18n.*.dylib`, re-run `brew reinstall node`.
- pnpm is provided by corepack: `corepack enable && corepack prepare pnpm@latest --activate`.
- Sanctum `/lsts/{id}/apys` is one call per LST — mind rate limits (429). Daily polling is fine; a big backfill is not.
