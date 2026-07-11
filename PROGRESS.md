# PROGRESS

## Current status
- Phase: 1 — Sanctum pipeline, **code-complete (live verification deferred)**; Phase 2 UI in progress next.
- Last session ended: 2026-07-11, built the full Phase 1 pipeline (sanctum source, realizedApy derive, run.ts orchestrator). Verified graceful degradation (no key → empty dataset, no crash, history untouched, exit 1). Live data verification is BLOCKED on `SANCTUM_API_KEY`. Per user decision, building Phase 2 UI against a mock dataset first.
- Next action: Build Phase 2 web UI (white theme) against a mock `web/public/data/latest.json`. Then, once `SANCTUM_API_KEY` is provided, run `pnpm pipeline` to complete Phase 1 live verification (valid latest.json with real LSTs, history +1 entry, idempotent re-run).

## Phases completed
- [x] Phase 0 — Scaffold (commit: `chore: scaffold repo, schema, and manual data layer`): full file structure, `shared/schema.ts`, manual data layer seeded, append-only history helpers, fetchJson/merge libs, minimal Vite+React web shell. `tsc --noEmit` passes across workspace.
- [~] Phase 1 — Sanctum pipeline (commit: `feat: sanctum pipeline producing iteration-1 dataset`): `sources/sanctum.ts` (fetch /lsts + per-LST /apys, normalized, bounded concurrency), `derive/realizedApy.ts` (advertised vs realized, section 6.1), `run.ts` orchestrator (writes latest.json/meta.json, appends history by date). Typechecks; degradation path verified. **Live data run still pending a key.**
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
- **Phase 1 live verification pending a `SANCTUM_API_KEY`.** Code is complete and typechecks; with no key the pipeline writes an empty dataset + status=failed (verified). Once a key is in `.env`, run `pnpm pipeline` and confirm: real LSTs in latest.json, history +1 dated entry, re-run replaces (not duplicates) today's entry.
- **API-shape assumptions to confirm against live data** (see NOTES Phase 1): APY fields normalized via `toPercent` (fraction vs percent heuristic); fee via `feeToPercent` (fraction vs bps); `tvl` assumed already in SOL; `solValue` = exchange rate. Adjust normalizers once the real payload is seen.
- Phase 2 built against a **mock** `web/public/data/latest.json` (gitignored). Swap to real data by running the pipeline + copying `data/latest.json`.
- `pipeline/sources/{stakewiz,defillama,jupiter}.ts` and `derive/{yieldSplit,decentralization,deployment}.ts` are valid empty stubs.

## Gotchas for next session
- **Node/icu4c:** the machine's Homebrew node was broken (linked against icu4c 74; only icu4c 78 present). Fixed via `brew reinstall node` → node 26.5.0. If `node` errors with a missing `libicui18n.*.dylib`, re-run `brew reinstall node`.
- pnpm is provided by corepack: `corepack enable && corepack prepare pnpm@latest --activate`.
- Sanctum `/lsts/{id}/apys` is one call per LST — mind rate limits (429). Daily polling is fine; a big backfill is not.
