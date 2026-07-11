// DeFiLlama API (DeFi deployment). Free, no auth. Base: https://api.llama.fi
//
// For each tracked protocol we fetch /protocol/{slug}, read the LATEST entry of
// chainTvls.Solana.tokens (raw token amounts), and return a symbol->amount map.
// Amounts are counts of the LST token; the derive step converts to SOL using
// each LST's exchange rate. Never throws.

import { fetchJson } from "../lib/fetchJson.js";
import type { DefiProtocolEntry } from "../../shared/schema.js";

const BASE = "https://api.llama.fi";

interface TokenEntry {
  date?: number;
  tokens?: Record<string, number>;
}

interface ProtocolResponse {
  name?: string;
  chainTvls?: Record<string, { tokens?: TokenEntry[] }>;
}

export interface ProtocolDeployment {
  slug: string;
  label: string;
  ok: boolean;
  /** UPPERCASE token symbol -> latest raw token amount on Solana. */
  tokensBySymbolUpper: Record<string, number>;
}

export interface DefiLlamaResult {
  ok: boolean;
  protocols: ProtocolDeployment[];
}

function latestSolanaTokens(resp: ProtocolResponse): Record<string, number> {
  const chainTvls = resp.chainTvls ?? {};
  // DeFiLlama keys this "Solana"; be tolerant of casing.
  const solana =
    chainTvls.Solana ?? chainTvls.solana ?? chainTvls["SOLANA"] ?? undefined;
  const series = solana?.tokens;
  if (!Array.isArray(series) || series.length === 0) return {};
  const last = series[series.length - 1];
  const tokens = last?.tokens ?? {};
  const out: Record<string, number> = {};
  for (const [sym, amt] of Object.entries(tokens)) {
    if (typeof amt === "number" && Number.isFinite(amt)) {
      out[sym.toUpperCase()] = amt;
    }
  }
  return out;
}

export async function fetchDefiDeployment(
  protocols: DefiProtocolEntry[],
): Promise<DefiLlamaResult> {
  const results: ProtocolDeployment[] = [];
  for (const p of protocols) {
    const resp = await fetchJson<ProtocolResponse>(
      `${BASE}/protocol/${encodeURIComponent(p.slug)}`,
      { label: `defillama /protocol/${p.slug}`, timeoutMs: 40000 },
    );
    if (!resp) {
      results.push({ slug: p.slug, label: p.label, ok: false, tokensBySymbolUpper: {} });
      continue;
    }
    results.push({
      slug: p.slug,
      label: p.label,
      ok: true,
      tokensBySymbolUpper: latestSolanaTokens(resp),
    });
  }
  return { ok: results.some((r) => r.ok), protocols: results };
}
