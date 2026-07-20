# PROGRESS

> Read this first in any new session, then `NOTES.md` for the deeper "why".
> `DEVELOPMENT_PLAN.md` is the original spec (now fully executed + extended).

## Current status (2026-07-20)
- **Live, keyless, published.** The dashboard runs on **76 real LSTs** with **NO API
  key**. Repo is public at **https://github.com/Sidharth004/solana-lst-lens**
  (`main`, in sync). All 6 phases + a keyless data pivot + a large differentiator
  pass are done and pushed.
- **What it is:** a neutral Solana LST comparison dashboard — "measured, not
  marketed." Vite+React white-theme frontend; a `tsx` pipeline that pulls keyless
  public data, commits JSON to `data/` (git = the time-series DB), and a daily
  GitHub Actions cron. Zero recurring cost.
- **Not yet done (operational):** not connected to a live host (Cloudflare Pages)
  yet; the GitHub Actions cron is committed but needs repo **Actions → Read and
  write permissions** enabled to push its daily commits.

## How to run / see it locally
```
pnpm install
pnpm pipeline            # fetch live data -> data/latest.json + append history (~1min; ~3min if it reads Jito MEV on public RPC)
pnpm prepare-web-data    # copy data/ -> web/public/data/ (gitignored)
pnpm dev                 # vite dev server -> http://localhost:5173
```
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
- **On-chain RPC** (`SOLANA_RPC_URL`||`HELIUS_RPC_URL`||public mainnet): multi-validator
  lists (decentralization), stake-pool `epoch_fee` (fees), and **Jito TipDistribution
  accounts** (real per-validator MEV).
- Gated `sanctum-api.ironforge.network` is NOT used (its key isn't self-serve).

## Features live (all on real data)
- Realized APY (measured; basis-labeled measured/recent/lifetime), **Net take-home**
  (realized − exit drag), **30d yield trend** arrow, Advertised+Gap (manual-curation
  only — columns hidden until curated).
- **Yield split** base / **MEV (real, on-chain Jito tips)** / other, estimate-flagged.
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
- Yield split: base = min(networkBase 4.5%, realized); MEV = real on-chain (carved from
  residual); fee is % of rewards (shown separately, NOT subtracted).
- MEV: Jito `TipDistribution` PDA per (validator, epoch), program `4R3gSG8B…c2r7`,
  seed `TIP_DISTRIBUTION_ACCOUNT`; `max_total_claim`×(1−commission)÷stake, last 3
  epochs, stake-weighted per LST. Offsets: opt-tag@72, max_total_claim@105, commission@145.
- Deps beyond React/Vite: `smol-toml` (registry), `bs58` (validator votes),
  `@solana/web3.js` (pipeline-only, PDA derivation).

## Known limitations / TODO
- **Advertised/Gap** = manual only (no keyless marketed-APY source). Curate top LSTs
  in `data/manual/advertised-apy.json` to light up the gap; columns hide until then.
- **MEV coverage is partial on public RPC** (rate-limited → heavy pools like JitoSOL
  under-counted; ~3min). Set `SOLANA_RPC_URL` (free Helius) for full/fast coverage.
- **Holders** = null (no public source). **3 LSTs ungraded** (Marinade/Lido/SPool use
  different account layouts). **Launch date** = Jupiter "first seen" (exact for LSTs
  listed since ~2024, lags for older). **Realized-APY charts** sparse — deepen as the
  daily cron accrues history (no historical-rate endpoint to backfill).
- Priority fees (the other chunk of "Other") not separated — possible future dig.
- `pipeline/sources/jitoMev.ts` is dead code (superseded by `jitoTips.ts`), kept per
  the no-delete rule.

## To ship the live site (operational, no key)
1. GitHub → Settings → Actions → General → Workflow permissions → **Read and write**.
2. Actions tab → run **Update data** once (optionally add `SOLANA_RPC_URL` repo secret
   for full MEV).
3. Cloudflare Pages: connect repo, build `pnpm build:site`, output `web/dist`,
   `NODE_VERSION=20`; attach domain. (Data commits re-trigger the build.)

## Gotchas
- **node/icu4c:** if `node` errors with missing `libicui18n.*.dylib`, `brew reinstall node`.
- pnpm via corepack; esbuild build script is allow-listed in root `package.json`
  (`pnpm.onlyBuiltDependencies`).
- Kobe API needs a browser User-Agent and wraps `{validators:[…]}`.
- Public Solana RPC rate-limits the Jito MEV reads hard → slow + partial; use a
  dedicated RPC.
- Auth'd as GitHub user **Sidharth004** (`gh`); git author on this machine is
  sidharthkumthekar / kumthekarsid@gmail.com.
