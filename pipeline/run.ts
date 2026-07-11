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
import { deriveApy } from "./derive/realizedApy.js";
import { deepMerge, readJson } from "./lib/merge.js";
import { appendSnapshot } from "./lib/history.js";

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

/** Latest epoch seen across all LSTs' APY history, else null. */
function inferEpoch(lsts: NormalizedSanctumLst[]): number | null {
  let max: number | null = null;
  for (const l of lsts) {
    for (const e of l.apyHistory) {
      if (max === null || e.epoch > max) max = e.epoch;
    }
  }
  return max;
}

// --- build ------------------------------------------------------------------

function buildLst(
  src: NormalizedSanctumLst,
  taxonomy: Taxonomy,
  advertised: AdvertisedApyOverrides,
  overrides: Overrides,
): Lst {
  const tax = taxonomy.bySymbol[src.symbol];
  const advOverride = advertised.bySymbol[src.symbol];
  const { advertisedApy, realizedApy, apyGap } = deriveApy(src, advOverride);

  const base: Lst = {
    symbol: src.symbol,
    mint: src.mint,
    name: src.name,
    logoUri: src.logoUri,
    type: tax?.type ?? typeFromProgram(src.poolProgram),
    issuer: tax?.issuer ?? null,

    tvlSol: round(src.tvlSol, 2),
    holders: src.holders,
    feePct: round(src.feePct, 3),
    exchangeRate: round(src.exchangeRate, 6),

    advertisedApy: round(advertisedApy, 3),
    realizedApy: round(realizedApy, 3),
    apyGap: round(apyGap, 3),

    yieldSplit: {
      baseStakingApy: null,
      mevApy: null,
      otherApy: null,
      blockspaceApy: null,
      isEstimate: true,
    },
    decentralization: {
      validatorCount: null,
      stakeConcentration: null,
      avgValidatorRank: null,
      grade: null,
      isEstimate: true,
    },
    deployment: null,
    exitCost: null,

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
  const apiKey = process.env.SANCTUM_API_KEY ?? "";

  const [taxonomy, advertised, overrides] = await Promise.all([
    readJson<Taxonomy>(path.join(MANUAL, "lst-taxonomy.json"), { bySymbol: {} }),
    readJson<AdvertisedApyOverrides>(path.join(MANUAL, "advertised-apy.json"), {
      bySymbol: {},
    }),
    readJson<Overrides>(path.join(MANUAL, "overrides.json"), { bySymbol: {} }),
  ]);

  const sources: Record<string, SourceStatus> = {};

  const sanctum = await fetchSanctumLsts(apiKey);
  sources.sanctum = { ok: sanctum.ok, note: sanctum.note };

  const lsts = sanctum.lsts.map((s) =>
    buildLst(s, taxonomy, advertised, overrides),
  );

  const epoch = inferEpoch(sanctum.lsts);
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
