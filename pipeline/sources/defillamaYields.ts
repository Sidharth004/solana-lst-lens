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
}

export interface YieldsResult {
  ok: boolean;
  /** UPPERCASE symbol -> apy (percent). */
  apyBySymbolUpper: Record<string, number>;
}

const STAKING_RE = /stak|marinade|jito|sanctum|blaze|jpool|lst|vault|hylo/i;

export async function fetchDefiLlamaYields(): Promise<YieldsResult> {
  const resp = await fetchJson<{ data?: Pool[] }>("https://yields.llama.fi/pools", {
    label: "yields.llama.fi/pools",
    timeoutMs: 40000,
  });
  const pools = resp?.data;
  if (!Array.isArray(pools)) return { ok: false, apyBySymbolUpper: {} };

  const out: Record<string, number> = {};
  for (const p of pools) {
    if (p.chain !== "Solana") continue;
    if (typeof p.apy !== "number" || !Number.isFinite(p.apy)) continue;
    const sym = p.symbol?.toUpperCase();
    if (!sym || !sym.endsWith("SOL")) continue;
    if (!STAKING_RE.test(`${p.project ?? ""} ${p.symbol ?? ""}`)) continue;
    // Keep the highest APY seen for a symbol (a staking pool over an LP pool).
    if (out[sym] === undefined || p.apy > out[sym]!) out[sym] = p.apy;
  }
  return { ok: Object.keys(out).length > 0, apyBySymbolUpper: out };
}
