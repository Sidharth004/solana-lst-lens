# PROGRESS

## Current status
- ALL SIX PHASES + KEYLESS pivot + **differentiator pass** (2026-07-15). Live real data, no API key. Remaining work is operational: push to GitHub + connect a host.
- Differentiators now live: decentralization grades **72/75** (single via vote_account, multi via on-chain validator-list RPC — JitoSOL B/705 validators/7 delinquent, JupSOL D); realized-APY coverage 32/75 + basis labels (self-healing via history); yield-trend arrows; net-take-home column + intent; delinquency risk flags. Advertised/gap is manual-curation-only (no keyless marketed source) and its columns hide until curated.
- Open follow-ups: curate marketed APYs in `data/manual/advertised-apy.json` to light up the gap; add a holders/fee source (still null); 3 LSTs ungraded (Marinade/Lido/SPool layouts unsupported).
- Last session (2026-07-12): the gated `sanctum-api.ironforge.network` data API turned out **not** to be self-serve (the Ironforge signup only yields an RPC-gateway key, which 403s on `/lsts`). Pivoted the pipeline to keyless public sources — `sanctum-lst-list` TOML + `extra-api.sanctum.so` (rate/TVL) + DeFiLlama yields (APY bootstrap). **`pnpm pipeline` now produces 75 real LSTs, status=ok, all 5 sources green.** History idempotent. Dashboard verified on real data at 1400px.
- Next action: Operational only — `git push` to GitHub (cron needs **no secrets** now), enable Actions read/write, connect Cloudflare Pages (`pnpm build:site` → `web/dist`), attach domain. Optional future: RPC validator-list resolver to light up decentralization; add a holders + fee source (both currently null).

## Next action to ship v1 (needs user) — NO API KEY NEEDED
1. `git push` the repo to GitHub.
2. Settings → Actions → General → Workflow permissions → **Read and write**. (No secrets required.)
3. Actions tab → run **Update data** once → confirms it commits refreshed `data/`.
4. Connect **Cloudflare Pages**: build command `pnpm build:site`, output `web/dist`, `NODE_VERSION=20`; attach domain.
   (Local preview any time: `pnpm pipeline && pnpm prepare-web-data && pnpm dev`.)

## Phases completed
- [x] Phase 0 — Scaffold (commit: `chore: scaffold repo, schema, and manual data layer`): full file structure, `shared/schema.ts`, manual data layer seeded, append-only history helpers, fetchJson/merge libs, minimal Vite+React web shell. `tsc --noEmit` passes across workspace.
- [~] Phase 1 — Sanctum pipeline (commit: `feat: sanctum pipeline producing iteration-1 dataset`): `sources/sanctum.ts` (fetch /lsts + per-LST /apys, normalized, bounded concurrency), `derive/realizedApy.ts` (advertised vs realized, section 6.1), `run.ts` orchestrator (writes latest.json/meta.json, appends history by date). Typechecks; degradation path verified. **Live data run still pending a key.**
- [x] Phase 2 — Web app (commit: `feat: white dashboard rendering iteration-1 columns`): white theme (`theme.css`), `data.ts` loader, `lib/format.ts` + `lib/sort.ts`, components `MetricCards`, `IntentRouter` (visual, applies a sort), `ApyGap` (amber >0.5 / red >1.5), sortable `Table`. Builds clean; verified rendering at 1200px + 680px against mock data.
- [~] Phase 3 — Deploy + daily cron (commit: `ci: daily data refresh + static deploy config`): `.github/workflows/update-data.yml` (daily cron + dispatch, commits only `data/**`, no delete/force-push), `scripts/prepare-web-data.mjs` + `pnpm build:site`, README deploy docs. `build:site` verified locally. **Live cron + Pages deploy pending GitHub remote + `SANCTUM_API_KEY`.**
- [~] Phase 4 — Yield split + decentralization (commit: `feat: yield split + decentralization score`): `sources/stakewiz.ts` (live), `derive/yieldSplit.ts` + `derive/decentralization.ts` (pure, 22/22 unit tests), wired into `run.ts`; UI `YieldBar`+legend, `ScoreBadge`, expandable `RowDetail`, `#lst=` deep-link. Yield split live-ready. **Decentralization data source (pool→validator set) deferred — needs RPC; degrades to null now.**
- [x] Phase 5 — DeFi deployment + exit cost (commit: `feat: defi deployment + exit-cost`): `sources/defillama.ts` + `derive/deployment.ts` (SOL-denominated, double-count note), `sources/jupiter.ts` exit quotes (keyless), wired into `run.ts` (bounded concurrency). Both sources live-tested end-to-end. UI: Deployed + Exit columns, footnote, detail section; "Cheapest exit" intent now live.
- [x] Phase 6 — Intent router + history + risk flags (commit: `feat: intent router, history charts, risk flags`): all four intent pills live (max yield / most decentralized by grade / cheapest exit / newest); `components/Sparkline.tsx` hand-rolled SVG charts in RowDetail (exchange rate + realized APY from `data/history/`); `lib/history.ts` risk flags (APY overstated, stake concentrated, depeg, unaudited) + row ⚠ marker; `data.ts` loads history; `prepare-web-data.mjs` copies history into the build.
- [ ] Phase 6 — Intent router, history charts, risk flags

## What works right now
- `pnpm install` succeeds (root + web workspace).
- `pnpm typecheck` passes (pipeline/shared via root tsconfig + web via its own tsconfig).
- `pnpm pipeline` runs the full orchestrator (writes empty dataset without a key; real data once `SANCTUM_API_KEY` is set).
- `pnpm --filter web build` builds clean. `web/dist` serves the dashboard; it fetches `/data/latest.json`.
- Dashboard renders MetricCards + IntentRouter + sortable Table from `web/public/data/latest.json` (currently a mock). Verified wide + narrow.

## How to see the dashboard locally
- Generate/refresh the mock: `node scripts/gen-mock.mjs` writes `web/public/data/latest.json` (gitignored). Or use real data: `pnpm pipeline && pnpm prepare-web-data`.
- `pnpm dev` (vite) → open the printed URL. Headless screenshot: `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --screenshot=out.png --window-size=1200,1400 http://localhost:PORT/`.

## Key decisions made
- Package manager: **pnpm 10.x** via corepack. Node **26.5.0** (see gotcha below).
- Workspace: root holds `pipeline/` + `shared/`; `web/` is the only pnpm workspace package. Root scripts: `pipeline`, `dev`, `build`, `typecheck`.
- Schema lives in `shared/schema.ts`; web imports it via the `@shared/*` alias (vite alias + `server.fs.allow: ['..']`). Pipeline imports it by relative path.
- Pipeline runs via `tsx` (no build step). `fetchJson` returns `null` on any failure and never throws → graceful degradation. `history.appendSnapshot` upserts by date (idempotent re-runs) and never truncates.
- `data/manual/` is read + merged, never written. `overrides.networkBaseStakingApy = 6.5` seeded for the Phase 4 yield model.

## Environment / setup state
- API keys configured: **SANCTUM_API_KEY not yet set** — needed to run the Phase 1 pipeline against live data. Store in `.env` locally (gitignored) and as a GitHub Actions secret for the cron (Phase 3).
- Deploy: config written (Cloudflare Pages: build `pnpm build:site`, output `web/dist`). Not yet connected to a host/domain.
- Cron: workflow committed (`.github/workflows/update-data.yml`, daily 06:00 UTC + dispatch). Not yet run — needs the repo on GitHub + `SANCTUM_API_KEY` secret + Actions write permission.

## Known issues / TODO / deferred
- **Phase 1 live verification pending a `SANCTUM_API_KEY`.** Code is complete and typechecks; with no key the pipeline writes an empty dataset + status=failed (verified). Once a key is in `.env`, run `pnpm pipeline` and confirm: real LSTs in latest.json, history +1 dated entry, re-run replaces (not duplicates) today's entry.
- **API-shape assumptions to confirm against live data** (see NOTES Phase 1): APY fields normalized via `toPercent` (fraction vs percent heuristic); fee via `feeToPercent` (fraction vs bps); `tvl` assumed already in SOL; `solValue` = exchange rate. Adjust normalizers once the real payload is seen.
- Phase 2 built against a **mock** `web/public/data/latest.json` (gitignored). Swap to real data by running the pipeline + copying `data/latest.json`.
- `pipeline/sources/{stakewiz,defillama,jupiter}.ts` and `derive/{yieldSplit,decentralization,deployment}.ts` are valid empty stubs.

## Gotchas for next session
- **Node/icu4c:** the machine's Homebrew node was broken (linked against icu4c 74; only icu4c 78 present). Fixed via `brew reinstall node` → node 26.5.0. If `node` errors with a missing `libicui18n.*.dylib`, re-run `brew reinstall node`.
- pnpm is provided by corepack: `corepack enable && corepack prepare pnpm@latest --activate`.
- Sanctum `/lsts/{id}/apys` is one call per LST — mind rate limits (429). Daily polling is fine; a big backfill is not.
