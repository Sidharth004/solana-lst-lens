# PROGRESS

> Read this first in any new session, then `NOTES.md` for the deeper "why".
> `DEVELOPMENT_PLAN.md` is the original spec (now fully executed + extended).

## Current status (2026-07-25)
- **LIVE ON VERCEL:** **https://solana-lst-lens.vercel.app** (production, HTTP 200,
  serving app + data). Repo public at **https://github.com/Sidharth004/solana-lst-lens**.
- **Runs on 76 real LSTs.** Core data is keyless; two **free RPCs are now configured**
  (Alchemy + Helius, see below) for full/fast on-chain reads. The pipeline still
  degrades gracefully to the public RPC if neither is set.
- **What it is:** a neutral Solana LST comparison dashboard — "measured, not
  marketed." Vite+React white-theme frontend; a `tsx` pipeline that pulls public
  data, commits JSON to `data/` (git = the time-series DB), and a daily GitHub
  Actions cron. Zero recurring cost.
- **Latest work (this session):** exact on-chain **base staking APY** (replaces the
  hardcoded 4.5% in the yield split), full MEV coverage via Alchemy, and the Vercel
  deploy. On branch **`data-refresh-alchemy`** (pushed) + **`deploy`** (pushed, has
  `vercel.json`). NOT yet merged to `main`.
- **Operational TODO:** (1) merge `data-refresh-alchemy`/`deploy` → `main`; (2) GitHub
  Actions → repo **Read and write permissions** for the cron; (3) add `SOLANA_RPC_URL`
  + `HELIUS_RPC_URL` as **repo secrets** (done via `gh secret set`) so the cron gets
  full coverage; (4) **connect Vercel↔GitHub** for push-to-deploy — CLI auto-connect
  FAILED (Vercel GitHub app not installed on the repo); install it in the Vercel
  dashboard, else redeploy manually with `vercel --prod`.

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

## Known limitations / TODO
- **Advertised/Gap** = manual only (no keyless marketed-APY source). Curate top LSTs
  in `data/manual/advertised-apy.json` to light up the gap; columns hide until then.
- **MEV coverage** is now FULL/fast via Alchemy (`SOLANA_RPC_URL`); only partial on
  bare public RPC (rate-limited → heavy pools like JitoSOL under-counted).
- **Holders** = null (no public source). **3 LSTs ungraded** (Marinade/Lido/SPool use
  different account layouts). **Launch date** = Jupiter "first seen" (exact for LSTs
  listed since ~2024, lags for older). **Realized-APY charts** sparse — deepen as the
  daily cron accrues history (no historical-rate endpoint to backfill).
- Priority fees (the other chunk of "Other") not separated — possible future dig.
- `pipeline/sources/jitoMev.ts` is dead code (superseded by `jitoTips.ts`), kept per
  the no-delete rule.

## Deployment — Vercel (LIVE)
- **Production:** https://solana-lst-lens.vercel.app · project `sidharth004s-projects/
  solana-lst-lens` · `vercel.json` at repo root (build `pnpm build:site`, output
  `web/dist`, pnpm install, vite). Deployed via CLI (`vercel --prod`), authed as
  sidharth004. `.vercel/` is gitignored. Redeploy manually: `vercel --prod`.
- **Auto-deploy NOT wired:** `vercel link`'s GitHub auto-connect FAILED (Vercel GitHub
  app not installed on the repo). Install it in the Vercel dashboard (Project →
  Settings → Git → Connect), or `vercel git connect`, to get push-to-deploy. Until
  then the live data only updates when you redeploy after the cron commits.

## To finish shipping (operational)
1. Merge `data-refresh-alchemy` + `deploy` → `main`.
2. GitHub → Settings → Actions → General → Workflow permissions → **Read and write**
   (for the daily cron's commits). Repo secrets `SOLANA_RPC_URL` + `HELIUS_RPC_URL`
   already set via `gh secret set`.
3. Connect Vercel↔GitHub (above) so cron data commits auto-redeploy the site.

## Gotchas
- **node/icu4c:** if `node` errors with missing `libicui18n.*.dylib`, `brew reinstall node`.
- pnpm via corepack; esbuild build script is allow-listed in root `package.json`
  (`pnpm.onlyBuiltDependencies`).
- Kobe API needs a browser User-Agent and wraps `{validators:[…]}`.
- Public Solana RPC rate-limits the Jito MEV reads hard → slow + partial; use a
  dedicated RPC.
- Auth'd as GitHub user **Sidharth004** (`gh`); git author on this machine is
  sidharthkumthekar / kumthekarsid@gmail.com.
