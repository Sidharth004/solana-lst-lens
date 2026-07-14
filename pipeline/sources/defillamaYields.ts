// DeFiLlama yields (keyless) — bootstrap APY for LSTs on day 1, before enough
// exchange-rate history has accumulated to measure realized APY ourselves.
// Base: https://yields.llama.fi/pools
//
// We index the liquid-staking pools on Solana by UPPERCASE symbol. Never throws.

import { fetchJson } from "../lib/fetchJson.js";

interface Pool {
  chain?: string;
  project?: string;
  symbol?: string;
  apy?: number; // percent
  apyPct30D?: number; // change in APY over 30d (percentage points)
}

export interface YieldInfo {
  apy: number; // percent
  trend30d: number | null; // percentage-point change over 30d (signed)
}

export interface YieldsResult {
  ok: boolean;
  /** UPPERCASE symbol -> yield info. */
  bySymbolUpper: Record<string, YieldInfo>;
}

const STAKING_RE = /stak|marinade|jito|sanctum|blaze|jpool|lst|vault|hylo/i;

export async function fetchDefiLlamaYields(): Promise<YieldsResult> {
  const resp = await fetchJson<{ data?: Pool[] }>("https://yields.llama.fi/pools", {
    label: "yields.llama.fi/pools",
    timeoutMs: 40000,
  });
  const pools = resp?.data;
  if (!Array.isArray(pools)) return { ok: false, bySymbolUpper: {} };

  const out: Record<string, YieldInfo> = {};
  for (const p of pools) {
    if (p.chain !== "Solana") continue;
    if (typeof p.apy !== "number" || !Number.isFinite(p.apy)) continue;
    const sym = p.symbol?.toUpperCase();
    if (!sym || !sym.endsWith("SOL")) continue;
    if (!STAKING_RE.test(`${p.project ?? ""} ${p.symbol ?? ""}`)) continue;
    // Keep the highest-APY pool for a symbol (the staking pool over an LP pool).
    if (out[sym] === undefined || p.apy > out[sym]!.apy) {
      out[sym] = {
        apy: p.apy,
        trend30d:
          typeof p.apyPct30D === "number" && Number.isFinite(p.apyPct30D)
            ? p.apyPct30D
            : null,
      };
    }
  }
  return { ok: Object.keys(out).length > 0, bySymbolUpper: out };
}
