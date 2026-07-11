// Sanctum API (PRIMARY source) — LST metadata, current stats, and per-epoch APY.
//
// Base URL: https://sanctum-api.ironforge.network
// Auth: apiKey query param on every request.
//
// This module fetches /lsts and, for each LST, /lsts/{symbol}/apys?limit=10,
// and returns normalized partial data. It NEVER throws: on failure it returns
// what it has and flags `ok: false` so the orchestrator can mark the run partial.

import { fetchJson } from "../lib/fetchJson.js";

const BASE = "https://sanctum-api.ironforge.network";

// --- raw response shapes (defensive: fields are all optional) ---------------

interface RawPool {
  program?: string;
  validatorList?: string;
}

interface RawManagerFeeConfig {
  withholdRate?: number;
}

interface RawLst {
  symbol?: string;
  mint?: string;
  name?: string;
  logoUri?: string;
  decimals?: number;
  pool?: RawPool;
  holders?: number;
  launchDate?: string | number;
  categories?: string[];
  managerFeeConfig?: RawManagerFeeConfig;
  tvl?: number;
  latestApy?: number;
  avgApy?: number;
  solValue?: number;
}

interface RawApyEntry {
  epoch?: number;
  epochEndTs?: number;
  apy?: number;
}

// --- normalized output ------------------------------------------------------

export interface SanctumApyPoint {
  epoch: number;
  epochEndTs: number | null;
  apy: number; // normalized to percent
}

export interface NormalizedSanctumLst {
  symbol: string;
  mint: string;
  name: string;
  logoUri: string | null;
  decimals: number | null;
  poolProgram: string | null;
  validatorList: string | null;
  holders: number | null;
  launchDate: string | null;
  categories: string[];
  feePct: number | null; // percent
  tvlSol: number | null;
  exchangeRate: number | null; // solValue
  latestApy: number | null; // percent
  avgApy: number | null; // percent (Sanctum's realized APY)
  apyHistory: SanctumApyPoint[]; // trailing epochs, normalized to percent
}

export interface SanctumResult {
  ok: boolean;
  lsts: NormalizedSanctumLst[];
  note?: string;
}

/**
 * Normalize an APY-like value to a percent number.
 * Sanctum may express APY as a fraction (0.072) or a percent (7.2). LST APYs
 * sit in the ~4–10% band, so a magnitude < 1 is a fraction and gets ×100.
 * Documented heuristic — pin down against live data if it ever misclassifies.
 */
export function toPercent(v: number | null | undefined): number | null {
  if (v === null || v === undefined || !Number.isFinite(v)) return null;
  return Math.abs(v) < 1 ? v * 100 : v;
}

/**
 * Normalize the manager fee (withholdRate) to a percent.
 * Observed forms: fraction (0.05 = 5%) or basis points (500 = 5%). Values ≤ 1
 * are treated as a fraction (×100); larger values are treated as bps (÷100).
 */
export function feeToPercent(v: number | null | undefined): number | null {
  if (v === null || v === undefined || !Number.isFinite(v)) return null;
  if (v <= 1) return v * 100;
  return v / 100;
}

function normalizeLaunchDate(v: string | number | undefined): string | null {
  if (v === undefined || v === null) return null;
  if (typeof v === "number") {
    // Heuristic: seconds vs ms epoch.
    const ms = v < 1e12 ? v * 1000 : v;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  return v;
}

function coerceLstArray(payload: unknown): RawLst[] {
  if (Array.isArray(payload)) return payload as RawLst[];
  if (payload && typeof payload === "object") {
    const obj = payload as Record<string, unknown>;
    if (Array.isArray(obj.lsts)) return obj.lsts as RawLst[];
    if (Array.isArray(obj.data)) return obj.data as RawLst[];
  }
  return [];
}

function coerceApyArray(payload: unknown): RawApyEntry[] {
  if (Array.isArray(payload)) return payload as RawApyEntry[];
  if (payload && typeof payload === "object") {
    const obj = payload as Record<string, unknown>;
    if (Array.isArray(obj.apys)) return obj.apys as RawApyEntry[];
    if (Array.isArray(obj.data)) return obj.data as RawApyEntry[];
  }
  return [];
}

/** Run tasks with a bounded concurrency to be gentle on the rate limit. */
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
  const workers = Array.from({ length: Math.min(limit, items.length) }, worker);
  await Promise.all(workers);
  return results;
}

async function fetchApyHistory(
  idOrSymbol: string,
  apiKey: string,
): Promise<SanctumApyPoint[]> {
  const url = `${BASE}/lsts/${encodeURIComponent(idOrSymbol)}/apys?limit=10&apiKey=${apiKey}`;
  const raw = await fetchJson<unknown>(url, { label: `sanctum /lsts/${idOrSymbol}/apys` });
  if (!raw) return [];
  return coerceApyArray(raw)
    .map((e) => ({
      epoch: e.epoch ?? -1,
      epochEndTs: e.epochEndTs ?? null,
      apy: toPercent(e.apy) ?? NaN,
    }))
    .filter((e) => e.epoch >= 0 && Number.isFinite(e.apy));
}

export async function fetchSanctumLsts(apiKey: string): Promise<SanctumResult> {
  if (!apiKey) {
    return { ok: false, lsts: [], note: "SANCTUM_API_KEY not set" };
  }

  const listUrl = `${BASE}/lsts?apiKey=${apiKey}`;
  const rawList = await fetchJson<unknown>(listUrl, { label: "sanctum /lsts" });
  if (!rawList) {
    return { ok: false, lsts: [], note: "/lsts fetch failed" };
  }

  const rawLsts = coerceLstArray(rawList).filter((l) => l.symbol && l.mint);

  const lsts = await mapLimit(rawLsts, 5, async (l): Promise<NormalizedSanctumLst> => {
    const symbol = l.symbol as string;
    const apyHistory = await fetchApyHistory(l.mint ?? symbol, apiKey);
    return {
      symbol,
      mint: l.mint as string,
      name: l.name ?? symbol,
      logoUri: l.logoUri ?? null,
      decimals: l.decimals ?? null,
      poolProgram: l.pool?.program ?? null,
      validatorList: l.pool?.validatorList ?? null,
      holders: l.holders ?? null,
      launchDate: normalizeLaunchDate(l.launchDate),
      categories: l.categories ?? [],
      feePct: feeToPercent(l.managerFeeConfig?.withholdRate),
      tvlSol: l.tvl ?? null,
      exchangeRate: l.solValue ?? null,
      latestApy: toPercent(l.latestApy),
      avgApy: toPercent(l.avgApy),
      apyHistory,
    };
  });

  return { ok: true, lsts };
}
