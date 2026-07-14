// Pipeline orchestrator.
//
// Flow: load env + manual layer -> fetch Sanctum -> derive iteration-1 metrics
// -> merge manual overrides -> write data/latest.json + data/meta.json -> append
// today's snapshot to each data/history/*.json.
//
// HARD RULES honored here:
// - never deletes files; history is upserted by date (idempotent re-runs).
// - one failing source degrades its field to null; the run still completes.
// - the manual layer is read + merged, never written.

import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import type {
  AdvertisedApyOverrides,
  ApySnapshot,
  Dataset,
  DefiProtocolsConfig,
  ExchangeRateSnapshot,
  Lst,
  LstType,
  Meta,
  Overrides,
  SourceStatus,
  Taxonomy,
  TvlSnapshot,
} from "../shared/schema.js";
import { fetchSanctumLsts, type NormalizedSanctumLst } from "./sources/sanctum.js";
import { fetchStakewizValidators, type StakewizResult } from "./sources/stakewiz.js";
import { fetchDefiDeployment, type ProtocolDeployment } from "./sources/defillama.js";
import { fetchDefiLlamaYields, type YieldsResult } from "./sources/defillamaYields.js";
import { quoteExitCost } from "./sources/jupiter.js";
import { deriveApy, type RatePoint } from "./derive/realizedApy.js";
import { computeYieldSplit } from "./derive/yieldSplit.js";
import {
  computeDecentralization,
  type PoolValidator,
} from "./derive/decentralization.js";
import { computeDeployment } from "./derive/deployment.js";
import { deepMerge, readJson } from "./lib/merge.js";
import { appendSnapshot, readHistory } from "./lib/history.js";

// --- paths ------------------------------------------------------------------

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const DATA = path.join(ROOT, "data");
const MANUAL = path.join(DATA, "manual");
const HISTORY = path.join(DATA, "history");

// --- helpers ----------------------------------------------------------------

function loadEnv(): void {
  // Node 20.12+/26 expose process.loadEnvFile. Best-effort; envs may already
  // be set by the shell or CI, in which case a missing .env is fine.
  try {
    (process as unknown as { loadEnvFile?: (p?: string) => void }).loadEnvFile?.(
      path.join(ROOT, ".env"),
    );
  } catch {
    /* no .env file — rely on process.env */
  }
}

/** Round to a fixed number of decimals, returning null for null/NaN. */
function round(v: number | null | undefined, dp: number): number | null {
  if (v === null || v === undefined || !Number.isFinite(v)) return null;
  const f = 10 ** dp;
  return Math.round(v * f) / f;
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Seed an LstType from Sanctum's pool.program; taxonomy overrides this later. */
function typeFromProgram(program: string | null): LstType {
  switch (program) {
    case "Marinade":
    case "Lido":
    case "SanctumSplMulti":
    case "Spl":
    case "SPool":
      return "multi-validator";
    case "SanctumSpl":
      return "single-validator";
    case "ReservePool":
      return "other";
    default:
      return "other";
  }
}

// --- build ------------------------------------------------------------------

interface BuildContext {
  /** Network base staking APY (percent) for the yield-split model. */
  networkBaseStakingApy: number | null;
  stakewiz: StakewizResult;
  defiProtocols: ProtocolDeployment[];
  /** protocol slug -> allowed LST symbols (from manual defi-protocols.json). */
  restrictBySlug: Record<string, string[] | undefined>;
  /** DeFiLlama bootstrap APY + 30d trend (UPPERCASE symbol -> info). */
  yields: YieldsResult;
  /** symbol -> exchange-rate history points (excluding today). */
  rateHistoryBySymbol: Map<string, RatePoint[]>;
  todayDate: string;
  /** mint -> RPC-resolved validator set (feature 4); empty until wired. */
  validatorSetByMint: Map<string, RpcValidator[]>;
}

export interface RpcValidator {
  voteIdentity: string;
  activatedStake: number; // SOL delegated by the pool to this validator
}

/** Bounded-concurrency map (gentle on rate limits). */
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  async function worker(): Promise<void> {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await fn(items[i]!, i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

interface ResolvedValidators {
  validators: PoolValidator[];
  source: "single" | "rpc";
}

/**
 * Resolve the validator set a pool delegates to (for decentralization).
 *
 * - Single-validator pools (SanctumSpl) delegate to ONE validator, named by the
 *   registry's `vote_account` — resolved here with no RPC via Stakewiz.
 * - Multi-validator pools (SanctumSplMulti, Spl) need their on-chain validator
 *   list read via RPC; that map is prefetched in main() and passed on ctx.
 * - Anything else (Marinade, Lido, SPool) degrades to null (graceful).
 */
function resolvePoolValidators(
  src: NormalizedSanctumLst,
  ctx: BuildContext,
): ResolvedValidators | null {
  // Multi-validator: use the prefetched RPC-resolved set if available.
  const rpcSet = ctx.validatorSetByMint.get(src.mint);
  if (rpcSet && rpcSet.length > 0) {
    return {
      source: "rpc",
      validators: rpcSet.map((v) => ({
        voteIdentity: v.voteIdentity,
        activatedStake: v.activatedStake,
        rank: ctx.stakewiz.byVoteIdentity.get(v.voteIdentity)?.rank ?? null,
        delinquent: ctx.stakewiz.byVoteIdentity.get(v.voteIdentity)?.delinquent ?? false,
      })),
    };
  }

  // Single-validator: one validator named by vote_account.
  if (src.poolProgram === "SanctumSpl" && src.voteAccount) {
    const info = ctx.stakewiz.byVoteIdentity.get(src.voteAccount);
    return {
      source: "single",
      validators: [
        {
          voteIdentity: src.voteAccount,
          activatedStake: src.tvlSol ?? 1,
          rank: info?.rank ?? null,
          delinquent: info?.delinquent ?? false,
        },
      ],
    };
  }

  return null;
}

function buildLst(
  src: NormalizedSanctumLst,
  taxonomy: Taxonomy,
  advertised: AdvertisedApyOverrides,
  overrides: Overrides,
  ctx: BuildContext,
): Lst {
  const tax = taxonomy.bySymbol[src.symbol];
  const advOverride = advertised.bySymbol[src.symbol];

  // Rate series = accumulated history for this symbol + today's fetched rate.
  const histPts = ctx.rateHistoryBySymbol.get(src.symbol) ?? [];
  const rateSeries: RatePoint[] =
    src.exchangeRate !== null
      ? [...histPts, { date: ctx.todayDate, value: src.exchangeRate }]
      : histPts;
  const yieldInfo = ctx.yields.bySymbolUpper[src.symbol.toUpperCase()];

  const { advertisedApy, realizedApy, realizedApyBasis, apyGap } = deriveApy(src, {
    rateSeries,
    recentApy: yieldInfo?.apy ?? null,
    advertisedOverride: advOverride,
  });

  const type = tax?.type ?? typeFromProgram(src.poolProgram);

  const yieldSplit = computeYieldSplit({
    realizedApy,
    feePct: src.feePct,
    networkBaseStakingApy: ctx.networkBaseStakingApy,
    type,
  });

  const resolved = resolvePoolValidators(src, ctx);
  const decentralization = resolved
    ? computeDecentralization({
        validators: resolved.validators,
        networkValidatorCount: ctx.stakewiz.networkValidatorCount,
        source: resolved.source,
      })
    : {
        validatorCount: null,
        stakeConcentration: null,
        avgValidatorRank: null,
        delinquentValidatorCount: null,
        grade: null,
        isEstimate: true,
        source: null,
      };

  const deployment = computeDeployment(
    src.symbol,
    src.exchangeRate,
    ctx.defiProtocols,
    ctx.restrictBySlug,
  );

  const base: Lst = {
    symbol: src.symbol,
    mint: src.mint,
    name: src.name,
    logoUri: src.logoUri,
    type,
    issuer: tax?.issuer ?? null,

    tvlSol: round(src.tvlSol, 2),
    holders: src.holders,
    feePct: round(src.feePct, 3),
    exchangeRate: round(src.exchangeRate, 6),

    advertisedApy: round(advertisedApy, 3),
    realizedApy: round(realizedApy, 3),
    realizedApyBasis,
    apyGap: round(apyGap, 3),
    yieldTrend30d: round(yieldInfo?.trend30d ?? null, 2),

    yieldSplit,
    decentralization,
    deployment,
    exitCost: null, // enriched asynchronously after build (Jupiter quote)

    auditCount: tax?.auditCount ?? null,
    launchDate: src.launchDate,
  };

  // Manual overrides.bySymbol wins last (arbitrary partial Lst corrections).
  const manual = overrides.bySymbol?.[src.symbol];
  return manual ? deepMerge(base, manual) : base;
}

// --- main -------------------------------------------------------------------

async function main(): Promise<void> {
  loadEnv();

  const [taxonomy, advertised, overrides, defiConfig] = await Promise.all([
    readJson<Taxonomy>(path.join(MANUAL, "lst-taxonomy.json"), { bySymbol: {} }),
    readJson<AdvertisedApyOverrides>(path.join(MANUAL, "advertised-apy.json"), {
      bySymbol: {},
    }),
    readJson<Overrides>(path.join(MANUAL, "overrides.json"), { bySymbol: {} }),
    readJson<DefiProtocolsConfig>(path.join(MANUAL, "defi-protocols.json"), {
      protocols: [],
    }),
  ]);

  // Read the accumulated exchange-rate history up front so realized APY can be
  // measured from it (oldest -> today) for each LST.
  const rateHistory = await readHistory<ExchangeRateSnapshot>(
    path.join(HISTORY, "exchange-rates.json"),
  );
  const todayDate = todayUtc();
  const rateHistoryBySymbol = new Map<string, RatePoint[]>();
  for (const snap of rateHistory) {
    if (snap.date === todayDate) continue; // today's point is added from the fresh fetch
    for (const [sym, value] of Object.entries(snap.bySymbol)) {
      const arr = rateHistoryBySymbol.get(sym) ?? [];
      arr.push({ date: snap.date, value });
      rateHistoryBySymbol.set(sym, arr);
    }
  }

  const sources: Record<string, SourceStatus> = {};

  const [sanctum, stakewiz, defillama, yields] = await Promise.all([
    fetchSanctumLsts(),
    fetchStakewizValidators(),
    fetchDefiDeployment(defiConfig.protocols),
    fetchDefiLlamaYields(),
  ]);
  sources.sanctum = { ok: sanctum.ok, note: sanctum.note };
  sources.stakewiz = {
    ok: stakewiz.ok,
    note: stakewiz.ok ? `${stakewiz.networkValidatorCount} validators` : stakewiz.note,
  };
  sources.defillama = {
    ok: defillama.ok,
    note: `${defillama.protocols.filter((p) => p.ok).length}/${defillama.protocols.length} protocols`,
  };
  sources.defillamaYields = {
    ok: yields.ok,
    note: `${Object.keys(yields.bySymbolUpper).length} APY bootstraps`,
  };

  const restrictBySlug: Record<string, string[] | undefined> = {};
  for (const p of defiConfig.protocols) restrictBySlug[p.slug] = p.symbols;

  // mint -> RPC-resolved validator set for multi-validator pools (feature 4).
  const validatorSetByMint = new Map<string, RpcValidator[]>();

  const ctx: BuildContext = {
    networkBaseStakingApy: overrides.networkBaseStakingApy ?? null,
    stakewiz,
    defiProtocols: defillama.protocols,
    restrictBySlug,
    yields,
    rateHistoryBySymbol,
    todayDate,
    validatorSetByMint,
  };

  const lsts = sanctum.lsts.map((s) =>
    buildLst(s, taxonomy, advertised, overrides, ctx),
  );

  // Enrich exit cost via Jupiter (one keyless quote per LST, bounded concurrency).
  const srcBySymbol = new Map(sanctum.lsts.map((s) => [s.symbol, s]));
  let exitOk = 0;
  await mapLimit(lsts, 3, async (lst) => {
    const src = srcBySymbol.get(lst.symbol);
    if (!src) return;
    const exit = await quoteExitCost({
      mint: lst.mint,
      decimals: src.decimals,
      exchangeRate: lst.exchangeRate,
      realizedApy: lst.realizedApy,
      sampleSizeSol: 1000,
    });
    if (exit) {
      lst.exitCost = exit;
      exitOk++;
    }
  });
  sources.jupiter = { ok: exitOk > 0, note: `${exitOk}/${lsts.length} exit quotes` };

  // Public sources don't expose the Solana epoch directly; leave null.
  const epoch: number | null = null;
  const updatedAt = new Date().toISOString();

  const dataset: Dataset = { updatedAt, epoch, lsts };

  const status: Meta["status"] = sanctum.ok
    ? "ok"
    : lsts.length > 0
      ? "partial"
      : "failed";

  const meta: Meta = {
    updatedAt,
    epoch,
    lstCount: lsts.length,
    status,
    sources,
  };

  // Write current dataset + meta.
  await writeFile(
    path.join(DATA, "latest.json"),
    JSON.stringify(dataset, null, 2) + "\n",
    "utf8",
  );
  await writeFile(
    path.join(DATA, "meta.json"),
    JSON.stringify(meta, null, 2) + "\n",
    "utf8",
  );

  // Append today's snapshot to the append-only history (idempotent by date).
  const date = todayUtc();
  const rateBySymbol: Record<string, number> = {};
  const apyBySymbol: Record<string, number> = {};
  const tvlBySymbol: Record<string, number> = {};
  for (const l of lsts) {
    if (l.exchangeRate !== null) rateBySymbol[l.symbol] = l.exchangeRate;
    if (l.realizedApy !== null) apyBySymbol[l.symbol] = l.realizedApy;
    if (l.tvlSol !== null) tvlBySymbol[l.symbol] = l.tvlSol;
  }

  // Only append history when we actually have data, so a fully failed run
  // doesn't write an empty snapshot into the time series.
  if (lsts.length > 0) {
    const rateSnap: ExchangeRateSnapshot = { date, epoch, bySymbol: rateBySymbol };
    const apySnap: ApySnapshot = { date, epoch, bySymbol: apyBySymbol };
    const tvlSnap: TvlSnapshot = { date, bySymbol: tvlBySymbol };
    const r = await appendSnapshot(path.join(HISTORY, "exchange-rates.json"), rateSnap);
    const a = await appendSnapshot(path.join(HISTORY, "apy.json"), apySnap);
    const t = await appendSnapshot(path.join(HISTORY, "tvl.json"), tvlSnap);
    console.log(
      `[pipeline] history: exchange-rates=${r.total}${r.replaced ? " (replaced today)" : ""}, ` +
        `apy=${a.total}${a.replaced ? " (replaced)" : ""}, tvl=${t.total}${t.replaced ? " (replaced)" : ""}`,
    );
  } else {
    console.warn("[pipeline] no LSTs fetched — skipping history append (nothing to record)");
  }

  console.log(
    `[pipeline] status=${status} lsts=${lsts.length} epoch=${epoch ?? "?"} -> data/latest.json`,
  );

  // Exit non-zero only on a total failure so CI surfaces it but partial runs pass.
  if (status === "failed") process.exitCode = 1;
}

main().catch((err) => {
  console.error("[pipeline] fatal:", err);
  process.exitCode = 1;
});
