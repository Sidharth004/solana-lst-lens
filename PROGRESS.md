# PROGRESS

> Read this first in any new session, then `NOTES.md` for the deeper "why".
> `GUIDE.md` (LST concepts → mastery, worked from real `data/latest.json`
> numbers) and `GUIDE-BASICS.md` (the same middle section re-taught slowly,
> with *Check yourself* exercises) are the reader-facing explainers.
> `DEVELOPMENT_PLAN.md` is the original spec (now fully executed + extended).

## Current status (2026-07-31)
- **LIVE ON VERCEL:** **https://solana-lst-lens.vercel.app** (production, HTTP 200,
  serving app + data). Repo public at **https://github.com/Sidharth004/solana-lst-lens**.
- **Runs on 76 real LSTs.** Core data is keyless; two **free RPCs are now configured**
  (Alchemy + Helius, see below) for full/fast on-chain reads. The pipeline still
  degrades gracefully to the public RPC if neither is set.
- **What it is:** a neutral Solana LST comparison dashboard — "measured, not
  marketed." Vite+React white-theme frontend; a `tsx` pipeline that pulls public
  data, commits JSON to `data/` (git = the time-series DB), and a daily GitHub
  Actions cron. Zero recurring cost.
- **Latest work (this session):** **native-staking baseline** (measured, in the
  dataset + metric card + a reference row + per-row "vs native" delta), a
  **compare tray** (star rows → side-by-side panel, shareable via `#compare=`),
  **range-toggle history charts** with a hover readout (replacing the sparklines
  in RowDetail), and table ergonomics (working sticky header, no TVL wrap,
  relative "updated N ago", dimmed no-data rows + a hide toggle, and a fix for a
  page-wide horizontal scroll on phones). Benchmarked against Helius's staking
  table and Helius's Orb explorer — see "Competitive read" below. Also wrote
  **`GUIDE.md` + `GUIDE-BASICS.md`** (~2.1k lines): a from-zero explainer of
  staking, MEV, commission, and every column this dashboard measures.
- **Previous session:** exact on-chain base staking APY (replaced the hardcoded
  4.5%), full MEV coverage via Alchemy, and the Vercel deploy.
- **Operational TODO — ALL CLEAR as of 2026-08-31.** (1) ~~merge `deploy` → `main`~~
  DONE, both branches at `ce449e1`; (2) ~~Actions read/write permission~~ DONE;
  (3) repo secrets — done; (4) ~~stale prod~~ DONE, deployed manually and verified.
  The one REMAINING item is **connecting the Vercel project to the GitHub repo** —
  root cause of the "auto-deploy" myth, see "Deployment" below.

## How to run / see it locally
```
pnpm install
pnpm pipeline            # fetch live data -> data/latest.json + append history (~90s w/ Alchemy+Helius in .env; slower on bare public RPC)
pnpm prepare-web-data    # copy data/ -> web/public/data/ (gitignored)
pnpm dev                 # vite dev server -> http://localhost:5173 (5174 if taken)
pnpm build:site          # prod build (prepare-web-data + vite) -> web/dist
```
- `.env` (gitignored) holds `SOLANA_RPC_URL` (Alchemy) + `HELIUS_RPC_URL` (Helius);
  see `.env.example`. Both also set as GitHub repo secrets for the cron.
- Headless screenshot (no browser driver needed):
  `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --screenshot=out.png --window-size=1400,1100 http://localhost:5173/`
- Deep-link a row: `http://localhost:5173/#lst=JitoSOL`. Mock (offline) data: `node scripts/gen-mock.mjs`.
- `pnpm typecheck` (pipeline+shared+web) and `pnpm --filter web build` both pass.

## Data sources — ALL KEYLESS (no signup/secret)
- **LST registry:** `sanctum-lst-list` TOML (igneous-labs GitHub) — identity, mint,
  pool program, `pool` (stake-pool acct), `validator_list`, `vote_account`.
- **Rate / TVL / since-launch APY:** `extra-api.sanctum.so` (lamports ÷1e9; APY via
  `/v1/apy/inception`, since `apy/latest` returns 0).
- **Recent APY + 30d trend:** DeFiLlama `yields.llama.fi/pools`.
- **DeFi deployment:** DeFiLlama `api.llama.fi/protocol/{slug}`.
- **Validators (rank/stake/delinquency):** `api.stakewiz.com/validators`.
- **Exit cost + token metadata (first-seen date, website):** Jupiter `lite-api.jup.ag`.
- **On-chain RPC** — TWO free RPCs configured in `.env` + as GitHub repo secrets:
  - **`SOLANA_RPC_URL` = Alchemy** (workhorse): Jito TipDistribution accounts (MEV),
    stake-pool fees, multi-validator lists (decentralization), rkuSOL supply, AND
    **vote-account commission** reads (`getMultipleAccounts` jsonParsed).
  - **`HELIUS_RPC_URL` = Helius** (one method only): `getInflationReward` for the
    exact base-staking measurement — **Alchemy's free tier BLOCKS this method**
    (`-32001`), so it routes to Helius (caps arrays at 64/call), then public.
  - Fallback order is Alchemy → Helius → public mainnet; the pipeline still runs
    keyless on public mainnet (slow, partial MEV, base may fall back to 4.5).
- Gated `sanctum-api.ironforge.network` is NOT used (its key isn't self-serve).

## Features live (all on real data)
- **Native-staking baseline** (`dataset.nativeStaking`, built in `run.ts` from
  `inflationRewards` + `jitoTips`): network gross ~4.40% × (1 − median on-chain
  validator commission, ~4%) = base ~4.23%, **+ median measured MEV** ~0.09% =
  **total ~4.32%**. MEV is included on purpose — an LST's realized APY already
  contains it, so an inflation-only baseline would flatter every LST. Shown as a
  metric card, a non-ranked reference row at the top of the table, a per-row
  "+X.XX pts vs native" delta, and a line in RowDetail. 31 of the 33 LSTs with a
  measured realized APY beat it.
- **Compare tray**: star up to 4 rows → side-by-side panel over every measured
  metric, with the better value marked only where better is unambiguous (ties and
  preferences like type/issuer stay unmarked). Persists to localStorage and to
  `#compare=A,B,C`, so a comparison is a shareable link (`web/src/lib/hash.ts`
  merges it with the existing `#lst=` deep link).
- **History charts** (`components/Chart.tsx`): 30D/90D/1Y/All range toggle, value
  gridlines, date axis, and a crosshair that reports the value for the day you
  point at. Replaces the sparklines in RowDetail (`Sparkline.tsx` is retained but
  now unused, per the no-delete rule).
- Realized APY (measured; basis-labeled measured/recent/lifetime), **Net take-home**
  (realized − exit drag), **30d yield trend** arrow, Advertised+Gap (manual-curation
  only — columns hidden until curated).
- **Yield split** base / **MEV (real, on-chain Jito tips)** / other, estimate-flagged.
  **Base is now EXACT** (not the old flat 4.5%): `pipeline/sources/inflationRewards.ts`
  measures network gross (~4.42%) from `getInflationReward` on commission-charging
  gauge validators (top ~250 by stake), reads each delegated validator's real
  commission from its vote account (jsonParsed), and sets base = gross×(1−commission),
  stake-weighted per LST. 30/32 split LSTs exact; INF/mSOL fall back to 4.5 (different
  account layouts). Commission from Stakewiz is UNRELIABLE — use the vote account.
- **Decentralization grade A–F** 72/76 (single via vote_account, multi via on-chain
  validator list) + validators/concentration/rank/delinquency.
- **DeFi deployment** (double-count caveat), **exit cost** (Jupiter), **fee** (on-chain
  stake pool, 69/76), **issuer** (name-derived, 75/76), **first-seen date** + **website**
  (Jupiter), **risk flags** (APY overstated / concentrated / depeg / delinquent /
  unaudited) with row ⚠, **history sparklines**.
- UI: sortable table, **Sort-by dropdown**, 4 **intent pills**, **search** (symbol/name/
  issuer), **ⓘ tooltips** on differentiators, **per-LST links** (Sanctum/Jupiter/Explorer/
  website), expandable RowDetail, `#lst=` deep-link, responsive, everything rounded.
- **rkuSOL** (Raiku, not in registry) supplemented via `data/manual/extra-lsts.json`
  (rate via Jupiter, TVL via on-chain supply).

## Phases (all done) + commits (newest first)
On `deploy` (newest): `<vercel>` Vercel deploy config · then on `data-refresh-alchemy`:
`47bea4a` robust exact-base (jsonParsed commission + Helius) · `a3069f7` exact on-chain
base staking (replaces 4.5%) · `e1f62e2` data refresh on Alchemy (full MEV). Then `main`:
`c854f4b` TRUE per-validator MEV (on-chain Jito tips) · `eb2fd36` MEV estimate +
first-seen + website · `8b1e5aa` on-chain fee + issuer + realized-window fix ·
`a506dfc` rkuSOL/extra-lsts · `5be34d1` taxonomy fix · `92cc015` search · `581381b`
tooltips · `622c53a` per-LST links · `b1cb1ce` Sort-by dropdown · `710c915`
hide-empty-columns polish · `1bab503` RPC multi-validator decentralization · `f73485a`
yield trend + net + broadened realized · `6fca4bf` single-validator decentralization ·
`a1db857` keyless pivot (real data) · then Phases 0–6 (`0035c64`…`16c833d`).

## Key decisions / architecture
- pnpm 10 (corepack) workspace: root = `pipeline/` + `shared/`; `web/` is the only
  package. `tsx` runs the pipeline (no build). Schema in `shared/schema.ts`, imported
  by web via `@shared/*` alias.
- `lib/fetchJson` never throws (graceful degradation); `lib/history.appendSnapshot`
  upserts by date (idempotent, never truncates). `data/manual/` is read+merged, never
  written. `meta.json` reports per-source health.
- Realized APY: measured-from-history (needs ≥14d window + plausibility band 0.5–30%)
  → DeFiLlama recent → extra-api inception; basis labeled per cell.
- Yield split: base = min(EXACT measured base, realized) — see inflationRewards.ts;
  4.5% is now only a fallback when a pool has no coverage. MEV = real on-chain (carved
  from residual); fee is % of rewards (shown separately, NOT subtracted). NEXT accuracy
  step (Tier 2, not built): exact realized *total* from per-epoch exchange rate, which
  makes `other` exact by conservation.
- Base staking (inflationRewards.ts): getInflationReward on a VOTE account returns only
  the COMMISSION (0 for 0%-commission validators → can't get staker reward directly), so
  we recover network gross from commission-charging gauges and apply real per-validator
  commission. getInflationReward is Alchemy-blocked (Helius/public only) + array cap 64;
  commission via vote-account jsonParsed (Stakewiz commission does NOT match on-chain).
- MEV: Jito `TipDistribution` PDA per (validator, epoch), program `4R3gSG8B…c2r7`,
  seed `TIP_DISTRIBUTION_ACCOUNT`; `max_total_claim`×(1−commission)÷stake, last 3
  epochs, stake-weighted per LST. Offsets: opt-tag@72, max_total_claim@105, commission@145.
- Deps beyond React/Vite: `smol-toml` (registry), `bs58` (validator votes),
  `@solana/web3.js` (pipeline-only, PDA derivation).

## Competitive read (2026-07-31)
Benchmarked against the two tools people actually use for this:
- **helius.dev/staking/rewards** — `Native | LST` toggle; columns are only Rank,
  Name, Total APY, Commission, Active Stake (Weight), Actions; 57 pages; "last
  updated 14m ago"; a rewards calculator; FAQ. Their embedded LST records carry
  just `apy, commission, activeStake, stakeWeight, voteAddress, symbol, website`
  — thinner than ours on every axis except **freshness**. Their table also
  renders commission **basis points as percent** ("Figment 700.00%"), which is
  exactly the class of error this dashboard exists to catch.
- **orb.helius.dev** (Orb, Helius's explorer; `orbmarkets.io` is the same app and
  both sit behind a Vercel bot checkpoint — plain fetches 429, headless Chrome
  gets through). Token pages show price + 24h change, APY, volume, supply,
  liquidity, market cap, FDV, creator; a price chart with 1H/24H/7D/1M/1Y; tabs
  Markets/History/Holders/Metadata/Social; a **per-venue markets table** (venue,
  rate, liquidity, 24h volume/trades/uniques); an AI assistant; FAQ. Orb is
  market-data-driven, so an LST with little DEX liquidity renders **empty** there
  (BNSOL — our largest pool by TVL — has no chart, no holders, no market data).
  Our stake-pool-based view sees it fine.
- **Where we're still behind:** liquidity/depth (their per-venue market table),
  and freshness (they're minutes old, we're a daily cron).
- **Next accuracy step, still not built:** *exit cost at size* — quote 100 / 1k /
  10k SOL through Jupiter instead of one 1000-SOL nominal quote, turning "Exit"
  into a real depth/slippage curve. This is the one thing Orb has that we don't,
  it's keyless, and it was explicitly deferred this session.

## Known limitations / TODO
- **Advertised/Gap** = manual only (no keyless marketed-APY source). Curate top LSTs
  in `data/manual/advertised-apy.json` to light up the gap; columns hide until then.
- **MEV coverage** is now FULL/fast via Alchemy (`SOLANA_RPC_URL`); only partial on
  bare public RPC (rate-limited → heavy pools like JitoSOL under-counted).
- **Holders** = null (no public source). **4 LSTs ungraded** — INF, stSOL, mSOL,
  rkuSOL (Marinade/Lido/SPool + rkuSOL use account layouts the validator-set reader
  doesn't parse; the "3" here previously was wrong, 72/76 graded ⇒ 4 ungraded). **Launch date** = Jupiter "first seen" (exact for LSTs
  listed since ~2024, lags for older). **Realized-APY charts** sparse — deepen as the
  daily cron accrues history (no historical-rate endpoint to backfill).
- Priority fees (the other chunk of "Other") not separated — possible future dig.
- `pipeline/sources/jitoMev.ts` is dead code (superseded by `jitoTips.ts`), kept per
  the no-delete rule.

## Deployment — Vercel (LIVE)
- **Production:** https://solana-lst-lens.vercel.app · project `sidharth004s-projects/
  solana-lst-lens` · `vercel.json` at repo root (build `pnpm build:site`, output
  `web/dist`, pnpm install, vite). `.vercel/` is gitignored. Manual redeploy is
  still `vercel --prod` (authed as sidharth004).
- **Auto-deploy is NOT working — ROOT CAUSE FOUND** (2026-08-31). The 2026-07-31
  note claimed it was wired; it never was. Four pushes to `main`/`deploy` produced
  no redeploy across ~8 min of 30s polling. `vercel whoami` prints the giveaway:
  *"To deploy every commit automatically, connect a Git Repository"* — Vercel only
  says that when the project has **no Git repo connected**. So the Vercel GitHub
  app still isn't installed on the repo, exactly as `memory` said and PROGRESS
  denied. **Fix: Vercel dashboard → project → Settings → Git → Connect.**
- **Consequence while unconnected:** the daily cron refreshes the *repo* but not the
  *site*. Prod only moves when someone runs `vercel --prod` by hand. This is the
  last thing standing between the project and being genuinely self-updating.
- Deployed manually 2026-08-31: `dpl_F3N2wFqUopVpPG1JbbUWdmer6da2`, aliased to the
  production domain; verified prod serving `updatedAt` 2026-08-31T19:20 with 11/11
  sources and `nativeStaking` present.

## Daily data cron (fixed 2026-08-31 — it had NEVER run)
- `.github/workflows/update-data.yml`, 06:00 UTC, commits only `data/**` back to `main`.
- **It failed all 47 runs from its first (2026-07-16) through 2026-08-30** — not one
  success, so the "daily time-series" was never accruing and prod sat 38 days stale.
  Each run died in ~10s before installing anything, which is why nothing downstream
  ever complained. **Lesson: a green-looking dashboard says nothing about the cron —
  check `gh run list` explicitly.**
- Cause: `pnpm/action-setup@v4` aborts with "Multiple versions of pnpm specified" when
  the workflow sets `version:` AND `package.json` has `packageManager`. Fixed in
  `464fb0e` by deleting the `version:` input (packageManager is the source of truth);
  `node-version` also 20 → 22 since the runners now force Node 20 actions onto 24.
- Second, independent blocker, fixed the same day: the repo's
  `default_workflow_permissions` was `read`, so the workflow's `git push` would have
  failed even with pnpm working. The in-workflow `permissions: contents: write` block
  did NOT save it — the repo-level default is the cap.
- First green run: `33428940457` (workflow_dispatch), 32s, all 10 sources ok, bot
  commit `4a0fad6`. Epochs jumped 1007→1023 — 16 epochs of drift, all real data.

## To finish shipping (operational)
Everything below is now DONE except item 1.
1. **Connect the Vercel project to the GitHub repo** (dashboard → Settings → Git).
   Until then prod is manual-only: `vercel --prod`. This is the ONLY remaining gap.
2. ~~Merge `deploy` → `main`~~ **DONE 2026-08-31.** `main` had diverged (the CI fix
   + the bot's old-pipeline data), so it was a real merge, not a fast-forward: data
   conflicts resolved in favour of `deploy`, then the pipeline re-run to regenerate
   `data/` correctly. Both branches now at `ce449e1`.
3. ~~Workflow permissions~~ **DONE** — `default_workflow_permissions` is `write`.
4. ~~Stale prod~~ **DONE** — deployed and verified.

## Gotchas
- **node/icu4c:** if `node` errors with missing `libicui18n.*.dylib`, `brew reinstall node`.
- pnpm via corepack; esbuild build script is allow-listed in root `package.json`
  (`pnpm.onlyBuiltDependencies`).
- Kobe API needs a browser User-Agent and wraps `{validators:[…]}`.
- Public Solana RPC rate-limits the Jito MEV reads hard → slow + partial; use a
  dedicated RPC.
- Auth'd as GitHub user **Sidharth004** (`gh`); git author on this machine is
  sidharthkumthekar / kumthekarsid@gmail.com.
