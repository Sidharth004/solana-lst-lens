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

## Phase 1 — Sanctum pipeline

### Decisions
- **realizedApy = Sanctum `avgApy`** (from /lsts), per section 6.1 — not recomputed
  from exchange-rate history. Note: the plan's verify text says "a failing apys
  call yields null realized APY"; here realized comes from `avgApy` (always in
  /lsts), while the per-LST `/apys` call feeds the *advertised* best-epoch proxy.
  A failing `/apys` call therefore degrades `advertisedApy` (→ latestApy), which
  is the more defensible reading of section 6.1. Documented deviation.
- **advertisedApy priority:** manual override → best epoch in trailing /apys →
  latestApy. `apyGap = advertised - realized`.
- **Bounded concurrency (5)** for the per-LST /apys calls via a small `mapLimit`
  to avoid 429s. One call per LST.
- **Defensive parsing.** `/lsts` and `/apys` responses are coerced whether they
  come back as a bare array or wrapped (`{lsts|apys|data: [...]}`). Every field is
  optional in the raw types.
- **History append only when data exists.** A fully failed run (0 LSTs) skips the
  history append entirely so we never write an empty snapshot into the series.
- **Exit code:** partial runs exit 0 (some data is fine); only a total failure
  (0 LSTs) sets exit 1 so CI surfaces it.

### Unit/shape assumptions to confirm against a live payload
- **APY normalization (`toPercent`):** magnitude < 1 ⇒ fraction (×100), else
  already a percent. Ambiguous only for a genuine sub-1% APY (never realistic for
  an LST), so safe in practice.
- **Fee normalization (`feeToPercent`):** ≤ 1 ⇒ fraction (×100), else basis
  points (÷100).
- **`tvl` assumed already denominated in SOL** → stored as `tvlSol`. If Sanctum
  returns USD or atomic lamports, adjust in `sources/sanctum.ts`.
- **`solValue` = LST→SOL exchange rate** (ground truth for realized yield).
- **Rounding:** apy 3dp, exchangeRate 6dp, tvl 2dp, fee 3dp — to kill float
  artifacts in the committed JSON; the UI rounds again for display.

### Blocked
- Live verification needs `SANCTUM_API_KEY` (401 without it). Per user, Phase 2
  UI is being built first against a mock dataset; Phase 1 live run happens once a
  key is available.

## Phase 2 — Web app (white theme)

### Decisions
- **Neutrality by construction.** `lib/sort.ts#sortLsts` is the only thing that
  orders rows; nulls always sink to the bottom so missing data never reads as
  best/worst. Default sort is `tvlSol desc` ("biggest first") — a neutral view,
  not an editorial pin.
- **Everything rounded at the edge.** `lib/format.ts` formats every displayed
  number (pct 2dp, compact SOL like `14.83M`, thousands-grouped ints). Nulls
  render as `—`.
- **ApyGap thresholds:** amber > 0.5 points, red > 1.5 points. Metric-driven
  only — no per-token styling anywhere.
- **IntentRouter (iteration 1):** four goal pills. "Max yield" (realized desc)
  and "Newest yield sources" (launchDate desc) are live now; "Most decentralized"
  and "Cheapest exit" apply a defensible proxy and carry a "soon" tag until their
  metrics land (Phase 4/5). Full routing = Phase 6.
- **Schema import via `@shared` alias** works in both `vite build` and dev
  (vite `resolve.alias` + `server.fs.allow: ['..']`). Single source of truth held.
- Mock dataset lives at `web/public/data/latest.json` (gitignored). Generator:
  `scratchpad/gen-mock.mjs` (13 realistic LSTs). Not committed — real data
  replaces it once the pipeline runs.

### Known cosmetic note
- On first load the default `tvlSol desc` sort coincides with the "Cheapest exit"
  proxy (also tvl desc), so that pill shows active. Harmless; resolves in Phase 5
  when cheapest-exit becomes priceImpact-asc.

### Verification
- Headless Chrome (system `/Applications/Google Chrome.app`) screenshots at
  1200×1400 and 680×1500 confirmed the table, cards, pills, badges, gap chips,
  responsive stacking, and rounded numbers. No browser automation deps needed —
  Chrome's `--headless=new --screenshot` is enough.
