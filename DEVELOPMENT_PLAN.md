# Solana LST Comparison Dashboard — Development Plan

This document is the complete build spec. Read it fully before writing any code.
Build in phases. After finishing a phase, run its verification checklist, commit,
then automatically continue to the next phase without waiting for further
instruction — unless a verification step fails, in which case stop and report.

---

## 0. What we are building

A neutral, data-driven comparison dashboard for Solana Liquid Staking Tokens (LSTs).
Its differentiator versus every existing tool (Sanctum Explore, Helius, Solana
Compass, DeFiLlama) is not the raw data — it is the interpretive layer:

1. **Advertised vs realized APY** — the yield each LST actually delivered,
   measured from its on-chain exchange rate, next to the number it markets.
2. **Yield source split** — base staking / MEV / other, reconstructed rather
   than taken on trust.
3. **Decentralization contribution score** — an editorial index of what each
   LST does to validator concentration.
4. **DeFi deployment** — how much of each LST sits in Kamino, Drift, etc.
5. **A smart intent router** — routes users by goal (max yield, most
   decentralized, cheapest exit, newest yield sources).

The site must read as neutral. Row placement is decided by the active sort,
never hard-coded. No token gets a permanent highlight.

### Design constraints (non-negotiable)

- **Primary color white.** Clean, light, data-dense. No cyberpunk, no neon, no
  dark theme as default, no glow/gradients.
- **Zero recurring cost** beyond a domain. No paid servers, no paid database.
  Everything runs on static hosting + a scheduled job + committed JSON.
- **Neutral presentation.** Sort decides order. rkuSOL sits wherever its metric
  ranks it.

---

## 1. Hard rules for the build

These override any other instinct. Re-read them at the start of every phase.

1. **NEVER delete files.** Do not run `rm`, do not delete, do not overwrite a
   file wholesale to "clean up". Add and edit only. If something seems
   obsolete, leave it and note it in `NOTES.md`. The data pipeline appends and
   updates in place; it must never remove history files or truncate the history
   arrays.
2. **The pipeline is idempotent and resumable.** Each data source is its own
   module wrapped in try/catch. If one source fails, that field degrades to
   `null` for that run and the pipeline still completes. One failing API must
   never abort the whole update or corrupt `latest.json`.
3. **The manual data layer is sacred.** `data/manual/` holds human-authored
   files (LST taxonomy, advertised APY overrides, notes). The pipeline reads
   these and MERGES them in. The pipeline must never write to or overwrite
   `data/manual/`.
4. **Git is the time-series database.** Each daily run appends dated snapshots
   to append-only history files and commits them. Never reset or squash this
   history.
5. **One schema, imported everywhere.** Types live in `shared/schema.ts`. Both
   the pipeline and the web app import from it so the data shape cannot drift.
6. **Round every displayed number.** No float artifacts on screen.
7. **Label estimates as estimates.** Any modeled or approximated value (yield
   split, decentralization composite) is flagged in the UI as such.
8. **Maintain `PROGRESS.md` as the session handoff file.** This project spans
   many chat sessions and usage windows. Assume the next session starts with
   ZERO memory of this one. At the start of every session, read `PROGRESS.md`
   first to reload context. At the end of every milestone (and before you run
   out of room), update it. It must always be current enough that a fresh
   Claude with no chat history can pick up exactly where you left off using
   only `PROGRESS.md` + `DEVELOPMENT_PLAN.md`. See section 1a for its format.

---

## 1a. `PROGRESS.md` — the session continuity file

Create `PROGRESS.md` in the repo root in Phase 0 and keep it updated. It is the
first thing to read in any new session and the last thing to write in any
session. Never delete it; only append/update. Keep it concise but complete —
it is a handoff note to a version of yourself with no memory of this chat.

Required sections (keep this exact structure):

```
# PROGRESS

## Current status
- Phase: <number + name>, <not started | in progress | complete>
- Last session ended: <date>, <one line on where you stopped>
- Next action: <the very next concrete step to take>

## Phases completed
- [x] Phase 0 — Scaffold (commit <hash/msg>): <1-line summary of what exists>
- [ ] Phase 1 — ...
(update the checkbox and summary as each phase closes)

## What works right now
- <e.g. `pnpm pipeline` produces latest.json with iteration-1 fields>
- <e.g. web dev server renders the sortable table on real data>

## Key decisions made
- <e.g. realizedApy = Sanctum avgApy; advertised = best-epoch proxy>
- <e.g. decentralization weighting: count 30 / spread 40 / rank 30>
(record anything a fresh session would otherwise re-derive or get wrong)

## Environment / setup state
- API keys configured: <SANCTUM_API_KEY yes/no, where stored>
- Deploy: <not set up | Cloudflare Pages connected, domain X>
- Cron: <not set up | running daily, last successful run date>

## Known issues / TODO / deferred
- <e.g. MEV split still base-vs-residual only; Jito endpoint not wired>
- <anything half-done, flaky, or intentionally postponed>

## Gotchas for next session
- <e.g. Sanctum apys endpoint is per-LST, one call each, mind rate limits>
- <anything that wasted time this session so it doesn't repeat>
```

Rules for `PROGRESS.md`:
- Update it at the end of EVERY phase, not just at the end.
- If a session is about to hit a length or usage limit mid-phase, stop at a
  clean point, write the exact next step into "Next action", and commit.
- Always commit `PROGRESS.md` together with the phase's code commit.
- It records state and decisions, not a diary. If a fact stops being true,
  correct it in place rather than appending contradictions.
- `NOTES.md` remains the deeper log (rejected approaches, obsolete files,
  long rationale). `PROGRESS.md` is the fast-reload summary. When in doubt,
  put the "where am I / what next" in `PROGRESS.md` and the "why" in `NOTES.md`.

---

## 2. Tech stack

- **Language:** TypeScript throughout (pipeline + web).
- **Web:** Vite + React + TypeScript. Plain CSS (CSS variables), no CSS
  framework required. TanStack Table optional for sorting; a hand-rolled
  sortable table is fine and lighter.
- **Pipeline:** Node 20+ TypeScript scripts run via `tsx`. Plain `fetch`.
- **Scheduler:** GitHub Actions cron (free for public repos).
- **Storage:** committed JSON in `data/`. No DB.
- **Hosting:** Cloudflare Pages (or Vercel) free tier, static output.
- **Package manager:** pnpm (npm is fine if pnpm unavailable).

Rationale: static frontend + cron-written JSON means no runtime server, so the
only recurring cost is the domain.

Optional Solana references (consult only if you touch raw on-chain reads):
- `https://solana.com/llms-full.txt` — full docs for LLMs.
- Solana Foundation "rpc-quick-lookups" and "framework-kit" skills
  (`npx skills add https://github.com/solana-foundation/solana-dev-skill`).
We avoid raw on-chain reads where a REST API already exposes the data.

---

## 3. File structure

Create exactly this structure. Do not delete anything already present; add to it.

```
lst-dashboard/
├── DEVELOPMENT_PLAN.md          # this file
├── PROGRESS.md                  # session handoff: read first, update every milestone
├── NOTES.md                     # running log: decisions, obsolete items, TODOs
├── README.md                    # how to run pipeline + web locally
├── package.json                 # workspace root
├── pnpm-workspace.yaml
├── .env.example                 # documents required env vars (no secrets)
├── .gitignore                   # node_modules, .env, web build output
│
├── shared/
│   └── schema.ts                # SINGLE source of truth for all data types
│
├── data/
│   ├── latest.json              # current full dataset the web app renders
│   ├── meta.json                # last-updated timestamp, epoch, run status
│   ├── manual/                  # HUMAN-AUTHORED — pipeline never writes here
│   │   ├── lst-taxonomy.json    # your LST type classifications + criteria
│   │   ├── advertised-apy.json  # optional advertised-APY overrides per LST
│   │   ├── defi-protocols.json  # protocol slugs + mints to track for deployment
│   │   └── overrides.json       # any manual corrections / audit counts / notes
│   └── history/                 # APPEND-ONLY time series (git = the DB)
│       ├── exchange-rates.json  # [{date, epoch, bySymbol:{SYMBOL: solValue}}]
│       ├── apy.json             # [{date, epoch, bySymbol:{SYMBOL: apy}}]
│       └── tvl.json             # [{date, bySymbol:{SYMBOL: tvl}}]
│
├── pipeline/
│   ├── run.ts                   # orchestrator: calls each source, writes data/
│   ├── sources/
│   │   ├── sanctum.ts           # LST metadata, APY, exchange rate, exit quote
│   │   ├── stakewiz.ts          # validator set + stake + commission
│   │   ├── defillama.ts         # DeFi deployment (token breakdown per protocol)
│   │   └── jupiter.ts           # exit-cost quotes (alt to sanctum)
│   ├── derive/
│   │   ├── realizedApy.ts       # advertised vs realized
│   │   ├── yieldSplit.ts        # base / MEV / other
│   │   ├── decentralization.ts  # concentration score
│   │   └── deployment.ts        # aggregate DeFi deployment per LST
│   ├── lib/
│   │   ├── fetchJson.ts         # fetch with retry, timeout, graceful failure
│   │   ├── history.ts           # append-only helpers (read, append, write back)
│   │   └── merge.ts             # merge manual layer over fetched data
│   └── tsconfig.json
│
├── web/
│   ├── index.html
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── public/
│   │   └── data/                # latest.json copied here at build (or fetched)
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── theme.css            # white theme, CSS variables, tokens
│       ├── data.ts              # loads latest.json, typed via shared/schema
│       ├── components/
│       │   ├── Table.tsx        # sortable table
│       │   ├── YieldBar.tsx     # stacked base/MEV/other bar
│       │   ├── ApyGap.tsx       # advertised vs realized cell
│       │   ├── ScoreBadge.tsx   # decentralization grade
│       │   ├── IntentRouter.tsx # goal pills → applies a sort/filter
│       │   ├── MetricCards.tsx  # summary tiles
│       │   └── RowDetail.tsx    # expanded per-LST detail (phase 4+)
│       └── lib/
│           ├── format.ts        # number/percent formatting (always rounded)
│           └── sort.ts          # sort + filter logic
│
└── .github/
    └── workflows/
        └── update-data.yml      # daily cron: run pipeline, commit data/
```

---

## 4. Data sources reference

All primary sources are free. Base URLs, auth, and the fields we consume are
below. Verify each endpoint with a single test call before wiring it in.

### 4.1 Sanctum API (PRIMARY)

- Base URL: `https://sanctum-api.ironforge.network`
- Auth: `apiKey` query param on every request. Get a free key from Ironforge
  (the gateway hosting Sanctum's API). Store as `SANCTUM_API_KEY`.
- Rate limit: returns 429 if exceeded; daily polling is well within limits.

Endpoints we use:

| Endpoint | Purpose | Key fields consumed |
|---|---|---|
| `GET /lsts?apiKey=` | All LSTs + current stats | `symbol`, `mint`, `name`, `logoUri`, `decimals`, `pool.program`, `pool.validatorList`, `holders`, `launchDate`, `categories`, `managerFeeConfig.withholdRate`, `tvl`, `latestApy`, `avgApy`, `solValue` |
| `GET /lsts/{mintOrSymbol}/apys?limit=10&apiKey=` | Per-epoch APY history | array of `{epoch, epochEndTs, apy}` |
| `GET /validators/apy?apiKey=` | Per-validator APY (incl. MEV) | map of voteAccount → `{avgApy, timeseries:[{epoch,epochEndTs,apy}]}` |
| `GET /swap/token/order?apiKey=&inp={mint}&out=So111...112&amt={atomics}&mode=ExactIn` | Exit quote (omit `signer` to use as pure quote) | `inpAmt`, `outAmt`, nested `swapSrcData.data.priceImpactPct`, `fees[]` |

Notes:
- `solValue` is the LST→SOL exchange rate. It is the ground truth for realized
  yield. `avgApy` is Sanctum's realized APY computed from it.
- `pool.program` seeds the LST type: `Marinade`, `Lido`, `SanctumSpl`
  (single-validator), `SanctumSplMulti` (multi-validator), `Spl`, `SPool`,
  `ReservePool`. Your manual taxonomy in `data/manual/lst-taxonomy.json`
  refines/overrides this.
- `managerFeeConfig.withholdRate` is the protocol fee.
- `pool.validatorList` is the on-chain validator list account — the join key to
  compute the decentralization score.
- SOL mint for exit quotes: `So11111111111111111111111111111111111111112`.

### 4.2 Stakewiz API (validators / decentralization)

- Base URL: `https://api.stakewiz.com`
- Auth: none. Free.

| Endpoint | Purpose | Key fields |
|---|---|---|
| `GET /validators` | All validators | `vote_identity`, `activated_stake`, `commission`, `delinquent`, `skip_rate`, `rank`, `wiz_score`, `name` |
| `GET /validator/{VOTE_IDENTITY}` | Single validator | same as above |

Used to size each LST's validator set, its internal stake concentration, and
the average network rank of the validators it delegates to.

### 4.3 DeFiLlama API (DeFi deployment)

- Base URL: `https://api.llama.fi` (TVL) and `https://yields.llama.fi` (yields).
- Auth: none. Free. No rate limit for normal traffic.

| Endpoint | Purpose | Key fields |
|---|---|---|
| `GET /protocol/{slug}` | Per-protocol TVL with token breakdown | `chainTvls.Solana.tokens` (raw token amounts) and `.tokensInUsd`, each `[{date, tokens:{SYMBOL: value}}]` |
| `GET /protocols` | List protocols + slugs | `name`, `slug`, `chains`, `category` |

To get "how much jitoSOL sits in Kamino": fetch `/protocol/kamino-lend` (or the
correct slug from `data/manual/defi-protocols.json`), read the latest entry of
`chainTvls.Solana.tokens`, pull the LST symbol's amount.

Caveat to surface in the UI: DeFiLlama can double-count LSTs (once as SOL, once
as the LST in a lending market). Add a footnote wherever deployment is shown.

### 4.4 Jupiter API (exit cost, alternative)

- Base URL: `https://lite-api.jup.ag` (free tier; no key).
- `GET /swap/v1/quote?inputMint={lstMint}&outputMint=So111...112&amount={atomics}&slippageBps=50`
  → `outAmount`, `priceImpactPct`, `routePlan`.
- Either this or Sanctum's `/swap/token/order` gives exit cost. Sanctum already
  wraps Jupiter, so prefer Sanctum first and keep Jupiter as fallback.

### 4.5 Solana RPC (only if needed)

- Free tier from Helius (`HELIUS_RPC_URL`) or the public endpoint.
- Only needed if a validator list must be read directly on-chain because
  `/validators/apy` + stakewiz don't cover a pool. Avoid unless required.

---

## 5. Data schema (`shared/schema.ts`)

Define these types first; everything imports them. Fields that come later
phases start optional/nullable.

```ts
export type LstType =
  | "single-validator"
  | "multi-validator"
  | "lst-of-lsts"
  | "exchange-backed"
  | "dat-backed"
  | "blockspace-yield"
  | "other";

export interface YieldSplit {
  baseStakingApy: number | null;   // network inflation component
  mevApy: number | null;           // MEV + priority fees attributed
  otherApy: number | null;         // fee-sharing / residual
  blockspaceApy: number | null;    // rkuSOL only; null until live
  isEstimate: boolean;             // always true when any part is modeled
}

export interface Decentralization {
  validatorCount: number | null;
  stakeConcentration: number | null; // 0..1 Herfindahl across the pool's set
  avgValidatorRank: number | null;    // mean network rank of delegated validators
  grade: "A" | "B" | "C" | "D" | "F" | null; // editorial composite
  isEstimate: boolean;
}

export interface Deployment {
  byProtocol: Record<string, number>; // { kamino: 1234.5, drift: 678.9 } in SOL
  totalDeployed: number | null;
  note: string;                        // double-counting caveat
}

export interface ExitCost {
  sampleSizeSol: number;   // size the quote was taken at, e.g. 1000
  priceImpactPct: number | null;
  netApyAfterExit: number | null; // realizedApy minus annualized exit drag (optional)
}

export interface Lst {
  symbol: string;
  mint: string;
  name: string;
  logoUri: string | null;
  type: LstType;
  issuer: string | null;

  tvlSol: number | null;
  holders: number | null;
  feePct: number | null;
  exchangeRate: number | null;   // solValue

  advertisedApy: number | null;  // marketed number (manual override or proxy)
  realizedApy: number | null;    // 10-epoch measured (Sanctum avgApy)
  apyGap: number | null;         // advertised - realized

  yieldSplit: YieldSplit;        // phase 4
  decentralization: Decentralization; // phase 4
  deployment: Deployment | null; // phase 5
  exitCost: ExitCost | null;     // phase 5

  auditCount: number | null;     // manual
  launchDate: string | null;
}

export interface Dataset {
  updatedAt: string;   // ISO
  epoch: number | null;
  lsts: Lst[];
}
```

---

## 6. Derived metric formulas

### 6.1 Advertised vs realized APY

- `realizedApy` = Sanctum `avgApy` over the trailing 10 epochs (already computed
  from `solValue`). If you prefer to compute it yourself: take the oldest and
  newest `solValue` in `data/history/exchange-rates.json` over ~10 epochs and
  annualize: `((rateNow / rateThen) ** (epochsPerYear / epochsElapsed)) - 1`,
  with `epochsPerYear ≈ 365 / 2.5`.
- `advertisedApy`: use, in priority order, (1) a manual value in
  `data/manual/advertised-apy.json` if present, else (2) the single best epoch
  APY in the trailing window from `/lsts/{id}/apys` (the flattering number a
  protocol would quote), else (3) `latestApy`.
- `apyGap = advertisedApy - realizedApy`. Flag amber in UI when gap > 0.5%.

### 6.2 Yield split (base / MEV / other) — estimate

- `baseStakingApy` = network base staking APY (inflation-driven, ~6–7%) minus
  the LST's `feePct`. Source the network base rate from the median validator
  `avgApy` in `/validators/apy`, or hardcode a monthly-updated constant in
  `data/manual/overrides.json`.
- `mevApy` (best effort): stake-weight the MEV portion across the pool's
  validators. If per-validator MEV is not readily separable, approximate MEV +
  fees as the residual `realizedApy - baseStakingApy` and put it in `otherApy`,
  leaving `mevApy` null. Mark `isEstimate: true`.
- For LST-of-LSTs (INF type), `otherApy` (fee-sharing) ≈ `realizedApy` minus the
  TVL-weighted realized APY of the underlying basket.
- `blockspaceApy`: null for all LSTs except rkuSOL, and null for rkuSOL too
  until the marketplace is live. Render as a "coming" segment, never a fake
  number.

### 6.3 Decentralization score

Inputs per LST (join `pool.validatorList` → the pool's validator set → stakewiz):
- `validatorCount` = number of validators in the set.
- `stakeConcentration` = Herfindahl index of stake shares within the set (0 = perfectly spread, 1 = all in one).
- `avgValidatorRank` = mean stakewiz rank of the delegated validators (higher rank number = smaller validator = better for decentralization).

Composite `grade` is YOUR editorial index — document the weighting in
`NOTES.md` and label it in the UI as "our index". A simple starting formula:
normalize each input to 0–100, weight validatorCount 30% / (1−concentration)
40% / avgValidatorRank 30%, then bucket into A/B/C/D/F. Keep the raw inputs
visible so the composite is auditable.

---

## 7. Phase plan

At the START of every session: read `PROGRESS.md`, then `DEVELOPMENT_PLAN.md`,
to reload context before doing anything.

Complete each phase, run its checklist, then update BOTH `PROGRESS.md`
(section 1a) and `NOTES.md`, and commit them together with the phase's code
using the stated message. Then auto-advance to the next phase. If you are about
to hit a usage/length limit mid-phase, stop cleanly, write the exact next step
into `PROGRESS.md` → "Next action", commit, and end.

### Phase 0 — Scaffold

- Create the full file structure from section 3 (empty stubs where needed).
- Write `shared/schema.ts` (section 5).
- Create `PROGRESS.md` using the section 1a format, with Phase 0 in progress.
- Create `NOTES.md` with an empty log.
- Write `.env.example` listing: `SANCTUM_API_KEY`, `HELIUS_RPC_URL` (optional).
- Write `.gitignore` (node_modules, .env, web/dist, web/public/data if copied).
- Seed `data/manual/lst-taxonomy.json` with a documented empty structure and 2–3
  example entries (e.g. jitoSOL → multi-validator, INF → lst-of-lsts, rkuSOL →
  blockspace-yield). Seed the other manual files with commented empty shapes.
- Seed `data/history/*.json` as empty arrays `[]`.
- Write `README.md` with local run instructions.
- Write `lib/fetchJson.ts` (timeout, 2 retries, returns null on failure — never
  throws to caller), `lib/history.ts` (read array, append entry, write back;
  never truncates), `lib/merge.ts` (deep-merge manual over fetched).
- **Verify:** `pnpm install` succeeds; `tsc --noEmit` passes across workspace;
  `PROGRESS.md` exists and reflects Phase 0.
- **Commit:** `chore: scaffold repo, schema, and manual data layer` (include
  `PROGRESS.md` and `NOTES.md` in this commit).
- Auto-advance.

### Phase 1 — Pipeline core (iteration 1 data)

- `sources/sanctum.ts`: fetch `/lsts`, and for each LST fetch
  `/lsts/{symbol}/apys?limit=10`. Return normalized partial `Lst` objects.
- `derive/realizedApy.ts`: implement section 6.1.
- `run.ts`: orchestrate → build `Dataset` with iteration-1 fields (identity,
  type from taxonomy merge, tvl, holders, fee, exchangeRate, advertisedApy,
  realizedApy, apyGap) → write `data/latest.json` and `data/meta.json` →
  append today's snapshot to `data/history/exchange-rates.json`, `apy.json`,
  `tvl.json` via the append-only helper.
- Merge `data/manual/` over fetched data (taxonomy, advertised overrides).
- Ensure graceful degradation: a failing per-LST apys call yields null realized
  APY for that LST only.
- **Verify:** `pnpm pipeline` (i.e. `tsx pipeline/run.ts`) produces a valid
  `latest.json` matching the schema; history files gained exactly one entry;
  re-running does not duplicate the same-date history entry (idempotent upsert
  by date); no file was deleted.
- **Commit:** `feat: sanctum pipeline producing iteration-1 dataset`
- Auto-advance.

### Phase 2 — Web app (iteration 1 UI), white theme

- `theme.css`: white surfaces, hairline borders, one restrained accent, semantic
  amber/red for the APY gap. No neon, no dark default. Follow the mockup already
  approved (clean, Stripe/Linear-like).
- `data.ts`: load `latest.json` (import at build or fetch from `/data/`).
- `components/Table.tsx`: sortable columns — LST, type, advertised, realized,
  gap, TVL, holders, fee. Sort decides order; no hard-coded highlight.
- `components/ApyGap.tsx`: advertised over realized, amber when gap > 0.5%.
- `components/MetricCards.tsx`: tracked LSTs, total SOL staked, median APY gap.
- `components/IntentRouter.tsx`: goal pills (visual + apply a sort now; full
  routing logic lands in phase 6).
- Native/LST toggle if native validator data is included later; LST-only for now.
- **Verify:** `pnpm --filter web dev` renders the table from real `latest.json`;
  sorting works; looks correct in a narrow (≈680px) and wide viewport; numbers
  are rounded; white theme confirmed.
- **Commit:** `feat: white dashboard rendering iteration-1 columns`
- Auto-advance.

### Phase 3 — Deploy + daily cron (ship v1)

- `.github/workflows/update-data.yml`: schedule `cron: "0 6 * * *"` (once daily)
  plus `workflow_dispatch`. Steps: checkout, setup node + pnpm, install, run
  `tsx pipeline/run.ts` with `SANCTUM_API_KEY` from repo secrets, then commit
  changed `data/**` back to the repo (use a bot commit; do NOT force-push, do
  NOT delete files). Guard so an empty diff doesn't error.
- Build config for Cloudflare Pages (or Vercel): build command
  `pnpm --filter web build`, output `web/dist`. Copy/point `latest.json` into
  the web build (either import from `data/` at build time or copy into
  `web/public/data/`).
- Document deploy steps in `README.md` (connect repo, set build command, add
  `SANCTUM_API_KEY` as a build/secret env, point domain).
- **Verify:** manual `workflow_dispatch` run updates `data/` and commits; a
  Pages/Vercel preview builds and renders the live data. Confirm no files were
  deleted by the workflow.
- **Commit:** `ci: daily data refresh + static deploy config`
- This is the shippable v1. Auto-advance.

### Phase 4 — Interpretive layer (iteration 2)

- `sources/stakewiz.ts`: fetch `/validators`, index by `vote_identity`.
- `derive/decentralization.ts`: implement section 6.3; requires mapping each
  pool's `validatorList` to its validator set. If the validator list isn't
  exposed via Sanctum for a pool, read it from RPC (helius) as a fallback, or
  mark decentralization null for that LST (graceful).
- `derive/yieldSplit.ts`: implement section 6.2 (base/MEV/other, estimate flag).
- Extend `latest.json` with `yieldSplit` and `decentralization`.
- Web: add `YieldBar.tsx` (stacked base/MEV/other, plus a hollow blockspace
  segment for rkuSOL), `ScoreBadge.tsx` (A–F), and an "estimate" tooltip.
  Add a legend. Add fee-sourcing detail to `RowDetail.tsx`.
- **Verify:** yield bars and scores render; estimate flags visible; a source
  failure degrades only its column; no file deletion.
- **Commit:** `feat: yield split + decentralization score`
- Auto-advance.

### Phase 5 — Deployment + exit cost (iteration 3)

- `data/manual/defi-protocols.json`: list target protocol slugs (kamino-lend,
  drift, marginfi, save, loopscale if listed) + the LST mints/symbols to match.
- `sources/defillama.ts`: for each protocol fetch `/protocol/{slug}`, read the
  latest `chainTvls.Solana.tokens`, extract each tracked LST's amount.
- `derive/deployment.ts`: aggregate per LST into `Deployment` with the
  double-counting note.
- `sources/jupiter.ts` (or reuse Sanctum `/swap/token/order`): quote an exit at
  a fixed sample size (e.g. 1000 SOL-equivalent) → `ExitCost`.
- Web: add deployment column/detail with the caveat footnote; add exit-cost
  column and optional net-after-exit APY.
- **Verify:** deployment numbers appear for at least the major LSTs; caveat
  footnote present; exit quotes populate; graceful on any miss.
- **Commit:** `feat: defi deployment + exit-cost`
- Auto-advance.

### Phase 6 — Smart funnel + history (iteration 4)

- `components/IntentRouter.tsx`: wire the pills to real behavior — max yield
  (sort realized desc), most decentralized (grade then concentration), cheapest
  exit (priceImpact asc), newest yield sources (blockspace/new types first).
- History charts in `RowDetail.tsx`: exchange rate and realized APY over time
  from `data/history/`. Use a light charting lib or hand-rolled SVG.
- Risk flags: audit count (manual), depeg events derived from history (exchange
  rate deviations), delinquency exposure from stakewiz.
- **Verify:** each intent pill reorders correctly; history charts render from
  accumulated snapshots; risk flags show.
- **Commit:** `feat: intent router, history charts, risk flags`
- Done. Report completion and summarize what shipped.

---

## 8. GitHub Actions workflow (reference)

`.github/workflows/update-data.yml` must:
- run on `schedule` (daily) and `workflow_dispatch`;
- install deps, run the pipeline with secrets;
- commit only `data/**` changes with a bot identity;
- never delete files, never force-push;
- no-op cleanly when there's no diff.

Store `SANCTUM_API_KEY` (and `HELIUS_RPC_URL` if used) in repo
Settings → Secrets → Actions.

---

## 9. Environment variables

Document in `.env.example` (never commit real values):

```
SANCTUM_API_KEY=      # Ironforge gateway key for sanctum-api.ironforge.network
HELIUS_RPC_URL=       # optional, only if raw validator-list reads are needed
```

DeFiLlama, Stakewiz, and Jupiter lite-api need no key.

---

## 10. Definition of done for v1 (end of phase 3)

- Live static site, white theme, sortable table of LSTs.
- Advertised vs realized APY visible with the gap flagged.
- Data refreshes daily via cron with history accumulating in git.
- Manual taxonomy layer feeding the "type" column.
- No recurring cost beyond the domain. No files ever deleted.
- `PROGRESS.md` current, so any new session can resume from it alone.

Phases 4–6 layer the differentiators (yield split, decentralization, deployment,
exit cost, intent router) on top without changing the deploy model.
