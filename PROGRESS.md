# PROGRESS

## Current status
- Phase: 2 — Web app, **complete (verified against mock data)**. Phase 3 (deploy + cron) next.
- Last session ended: 2026-07-11, built the full white-theme dashboard and verified it renders in wide (1200px) and narrow (680px) viewports via headless Chrome screenshots. Two things still pending a `SANCTUM_API_KEY`: Phase 1 live data run, and swapping the mock dataset for real data.
- Next action: Phase 3 — GitHub Actions daily cron (`.github/workflows/update-data.yml`) + Cloudflare Pages/Vercel static build config + README deploy docs. (Phase 1 live verification also still open — run `pnpm pipeline` once a key exists.)

## Phases completed
- [x] Phase 0 — Scaffold (commit: `chore: scaffold repo, schema, and manual data layer`): full file structure, `shared/schema.ts`, manual data layer seeded, append-only history helpers, fetchJson/merge libs, minimal Vite+React web shell. `tsc --noEmit` passes across workspace.
- [~] Phase 1 — Sanctum pipeline (commit: `feat: sanctum pipeline producing iteration-1 dataset`): `sources/sanctum.ts` (fetch /lsts + per-LST /apys, normalized, bounded concurrency), `derive/realizedApy.ts` (advertised vs realized, section 6.1), `run.ts` orchestrator (writes latest.json/meta.json, appends history by date). Typechecks; degradation path verified. **Live data run still pending a key.**
- [x] Phase 2 — Web app (commit: `feat: white dashboard rendering iteration-1 columns`): white theme (`theme.css`), `data.ts` loader, `lib/format.ts` + `lib/sort.ts`, components `MetricCards`, `IntentRouter` (visual, applies a sort), `ApyGap` (amber >0.5 / red >1.5), sortable `Table`. Builds clean; verified rendering at 1200px + 680px against mock data.
- [ ] Phase 3 — Deploy + daily cron (ship v1)
- [ ] Phase 4 — Yield split + decentralization
- [ ] Phase 5 — DeFi deployment + exit cost
- [ ] Phase 6 — Intent router, history charts, risk flags

## What works right now
- `pnpm install` succeeds (root + web workspace).
- `pnpm typecheck` passes (pipeline/shared via root tsconfig + web via its own tsconfig).
- `pnpm pipeline` runs the full orchestrator (writes empty dataset without a key; real data once `SANCTUM_API_KEY` is set).
- `pnpm --filter web build` builds clean. `web/dist` serves the dashboard; it fetches `/data/latest.json`.
- Dashboard renders MetricCards + IntentRouter + sortable Table from `web/public/data/latest.json` (currently a mock). Verified wide + narrow.

## How to see the dashboard locally
- Generate/refresh the mock: `node <scratchpad>/gen-mock.mjs .` writes `web/public/data/latest.json` (gitignored). Or copy real data: `cp data/latest.json web/public/data/latest.json`.
- `pnpm dev` (vite) → open the printed URL. Headless screenshot: `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --screenshot=out.png --window-size=1200,1400 http://localhost:PORT/`.

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
