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

## Phase 3 — Deploy + daily cron

### Decisions
- **Static build feeds from committed data.** `scripts/prepare-web-data.mjs`
  copies `data/latest.json` + `meta.json` into `web/public/data/` before
  `vite build`. Exposed as `pnpm build:site` (the host's build command) and
  `pnpm prepare-web-data`. The app fetches `/data/latest.json` at runtime, so a
  data-only commit re-triggers a host build without touching app code.
- **Workflow commits only `data/`.** `git add data/` (never `-A`), guarded by
  `git diff --cached --quiet` so an empty diff is a clean no-op. No delete, no
  force-push. Bot identity `lst-data-bot`. `permissions: contents: write` +
  repo "Read and write" Actions setting required to push.
- **Cron `0 6 * * *`** (06:00 UTC) once daily, plus `workflow_dispatch`.
  `concurrency: update-data` (no cancel) prevents overlapping refreshes.
- **`packageManager: pnpm@10.8.0`** added so Cloudflare/Vercel select pnpm via
  corepack automatically.
- Pipeline exits 1 only on total failure, so a keyless/failed CI run fails the
  job (visible) and commits nothing; partial runs (some sources down) still
  commit what they got.

### Pending (needs user / remote)
- The plan's Phase 3 verify (a real `workflow_dispatch` run committing `data/`,
  and a Pages/Vercel preview on live data) requires the repo on GitHub + the
  `SANCTUM_API_KEY` secret. Local proxy done: `pnpm build:site` bundles the
  dataset into `web/dist/data/`.

## Phase 4 — Yield split + decentralization

### Yield split (estimate)
- `computeYieldSplit`: `base = clamp(networkBase − fee, 0, realized)`;
  `other = realized − base`; `mev = null` (not separable here, folded into
  other); `blockspace = null` for all (rkuSOL renders a hollow "coming" segment,
  never a number). `isEstimate` always true. Parts always sum to realized.
- `networkBase` from `overrides.networkBaseStakingApy` (6.5%). Could later be a
  live median validator APY from Sanctum `/validators/apy`.

### Decentralization index — DOCUMENTED WEIGHTING (plan 6.3 requires this here)
- Editorial composite, labeled "our index" in the UI. Raw inputs stay visible in
  RowDetail so it's auditable. Grade buckets: A ≥80, B ≥65, C ≥50, D ≥35, else F.
- Weighting (renormalized over whichever components are present):
  - **validatorCount 30%** — normalized log10(n)/log10(300), so 1→0, ~300+→1.
  - **(1 − stakeConcentration) 40%** — Herfindahl of stake shares within the
    pool's set; flatter distribution scores higher.
  - **avgValidatorRank 30%** — normalized (avgRank−1)/(networkCount−1); delegating
    to smaller/higher-ranked-number validators scores higher.
- Pure functions unit-tested (22 assertions, all pass): even 4-way HHI = 0.25,
  single = 1, empty = null; even large set → A/B, whale+top-rank → D/F.

### KNOWN GAP — decentralization data source
- The composite needs each pool's validator SET (which validators an LST
  delegates to). That mapping comes from the pool's on-chain `validatorList`
  account, which needs an RPC (`HELIUS_RPC_URL`) or a Sanctum endpoint exposing
  members. Not wired yet → `resolvePoolValidators()` returns null →
  decentralization degrades to null for every LST (graceful). Stakewiz is fetched
  and indexed by vote_identity, ready to join once the set resolver lands.
- Mock (`scripts/gen-mock.mjs`) supplies decentralization values so the UI
  (ScoreBadge, RowDetail) is verifiable now; INF is intentionally left null to
  exercise the graceful "—" path.

### UI
- `YieldBar` (stacked base/mev/other + hollow blockspace) + `YieldLegend`,
  `ScoreBadge` (A–F colored / null = —), `RowDetail` (yield split, fee & rate,
  decentralization raw inputs, meta). Rows are click-to-expand and deep-linkable
  via `#lst=SYMBOL` (also how the detail panel was screenshot-verified).
- Verified at 1240px (jitoSOL expanded) and 680px (responsive, detail stacks).

## Phase 5 — DeFi deployment + exit cost

### Decisions
- **DeFiLlama shape (live-confirmed):** `/protocol/{slug}` →
  `chainTvls.Solana.tokens` is an array of `{date, tokens:{SYMBOL: amount}}`;
  symbols are UPPERCASE, amounts are raw LST token counts. We take the LAST
  entry, uppercase-match tracked symbols, and convert to SOL via `amount ×
  exchangeRate`. `computeDeployment` sums per protocol into `byProtocol` (label
  keys) + `totalDeployed`, carrying the double-count caveat.
- **Double-counting caveat** surfaced both as a persistent table footnote and in
  each row's detail `note`.
- **Jupiter exit cost (keyless, lite-api):** size input so the quote is ~1000
  SOL-worth (`inputAtomics = 1000/rate × 10^decimals`), read `priceImpactPct`
  (Jupiter returns a fraction → ×100 to percent). `netApyAfterExit = realizedApy
  − priceImpactPct` (one-time haircut, not annualized). One quote per LST,
  bounded concurrency 3.
- **`meta.sources`** now reports per-source health (sanctum/stakewiz/defillama/
  jupiter) so a degraded run is legible.

### Live verification
- DeFiLlama: Kamino + Save return LST token maps; jitoSOL computed at ~1.18M SOL
  deployed (Kamino 1.09M + Save 89K) with real data. MarginFi/Drift returned no
  Solana token breakdown via `/protocol/{slug}` → degrade to null (adjust slugs
  in `data/manual/defi-protocols.json` if better ones exist).
- Jupiter: 1000-SOL jitoSOL exit → priceImpact 0.016%, net-after-exit 8.294%.
- Full `pnpm pipeline` (no sanctum key): no crash; stakewiz ok (1422), defillama
  ok (4/4), sanctum/jupiter degrade cleanly; status=failed only because 0 LSTs
  without the key.

### UI
- Columns: `Deployed †` (totalDeployed SOL) and `Exit` (priceImpact, 3dp). Detail
  adds a "DeFi deployment & exit" section (per-protocol breakdown, total, note,
  price impact, net-after-exit). Row-detail grid is now 2-col.
- New sort keys `deployment` / `exitCost`; "Cheapest exit" intent upgraded to
  live (`exitCost asc`), which also removes the earlier default-sort pill collision.
