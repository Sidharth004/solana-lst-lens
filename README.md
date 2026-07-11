# Solana LST Comparison Dashboard

A neutral, data-driven comparison of Solana Liquid Staking Tokens (LSTs). Beyond
raw data, it adds an interpretive layer: advertised vs realized APY, yield-source
split, a decentralization contribution score, DeFi deployment, and a goal-based
intent router.

The site reads as neutral — row order is decided by the active sort, never
hard-coded. No token gets a permanent highlight.

- **Frontend:** Vite + React + TypeScript, plain CSS, white theme.
- **Pipeline:** Node + TypeScript scripts run via `tsx`, plain `fetch`.
- **Storage:** committed JSON in `data/` — git is the time-series database.
- **Scheduler:** GitHub Actions cron (Phase 3).
- **Hosting:** Cloudflare Pages / Vercel free tier, static output (Phase 3).

No recurring cost beyond a domain.

## Prerequisites

- Node 20+ (developed on 26.5.0).
- pnpm (via corepack: `corepack enable && corepack prepare pnpm@latest --activate`).

## Setup

```bash
pnpm install
cp .env.example .env   # then fill in SANCTUM_API_KEY
```

Get a free `SANCTUM_API_KEY` from the Ironforge gateway
(<https://ironforge.network>). DeFiLlama, Stakewiz, and Jupiter lite-api need no key.

## Run the data pipeline

```bash
pnpm pipeline           # tsx pipeline/run.ts
```

This fetches from the data sources, merges the human-authored `data/manual/`
layer, writes `data/latest.json` + `data/meta.json`, and appends a dated snapshot
to each file in `data/history/`. It is idempotent per day (re-running replaces
today's snapshot rather than duplicating it) and never deletes files.

## Run the web app

```bash
# copy the latest dataset into the app's public dir, then start the dev server
mkdir -p web/public/data && cp data/latest.json web/public/data/latest.json
pnpm dev                # vite dev server for the web workspace
```

## Typecheck

```bash
pnpm typecheck          # pipeline/shared (root tsconfig) + web (web tsconfig)
```

## Repository layout

```
shared/schema.ts   Single source of truth for all data types.
data/manual/       Human-authored layer (taxonomy, overrides). Pipeline never writes here.
data/history/      Append-only time series (git = the DB).
data/latest.json   Current dataset the web app renders.
pipeline/          Fetch sources -> derive metrics -> write data/.
web/               Vite + React dashboard.
```

## Deploy

Static output only — no runtime server. The single recurring cost is the domain.

### Daily data refresh (GitHub Actions)

`.github/workflows/update-data.yml` runs `pnpm pipeline` on a daily cron
(`0 6 * * *` UTC) and on manual `workflow_dispatch`. It commits **only** `data/**`
back to the repo with a bot identity — never deleting files, never force-pushing,
and no-opping cleanly when there's no diff. Git history is the time series.

Setup:

1. Push this repo to GitHub.
2. Add repo secret **`SANCTUM_API_KEY`** (Settings → Secrets and variables →
   Actions). Optionally add `HELIUS_RPC_URL`.
3. Ensure Actions can push: Settings → Actions → General → Workflow permissions →
   "Read and write permissions".
4. Trigger a first run from the Actions tab (Run workflow) to confirm it commits
   updated `data/`.

### Static site (Cloudflare Pages — recommended, or Vercel)

The site is prerendered static assets that fetch `/data/latest.json` at runtime.

- **Build command:** `pnpm build:site`
  (copies `data/latest.json` + `meta.json` into `web/public/data/`, then
  `vite build`).
- **Output / build directory:** `web/dist`
- **Node version:** 20+ (set `NODE_VERSION=20` env on Cloudflare if needed).
- pnpm is auto-detected from `packageManager` in `package.json` +
  `pnpm-lock.yaml`.

Cloudflare Pages: connect the GitHub repo, set the build command and output
directory above, deploy, then attach the custom domain. Each daily data commit
from the workflow re-triggers a Pages build, so the live site tracks the latest
snapshot.

Vercel: same build command and output dir (`web/dist`); framework preset "Other".

> Note: `web/public/data/` is gitignored — it's a build artifact reproduced by
> `pnpm build:site`. The source of truth is `data/latest.json`.

## Ground rules

See `DEVELOPMENT_PLAN.md` for the full spec. In short: never delete files;
the pipeline degrades gracefully (one failing source → that field is `null`);
the manual layer is sacred; git history is the database; every displayed number
is rounded; estimates are labeled. Read `PROGRESS.md` first in any new session.
