// Aggregate DeFi deployment per LST (DEVELOPMENT_PLAN section 6.4 / phase 5).
//
// For each LST, sum how much of it sits in each tracked protocol, expressed in
// SOL (raw token amount × exchange rate). Carries the DeFiLlama double-counting
// caveat so the UI can footnote it.

import type { Deployment } from "../../shared/schema.js";
import type { ProtocolDeployment } from "../sources/defillama.js";

export const DOUBLE_COUNT_NOTE =
  "Source: DeFiLlama. LSTs can be double-counted (once as SOL, once as the LST in a lending market); treat as an upper bound.";

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

/**
 * @param symbol        LST symbol (any case)
 * @param exchangeRate  LST -> SOL (solValue); used to convert token counts to SOL
 * @param protocols     per-protocol latest Solana token maps (UPPERCASE keys)
 * @param restrictBySymbol optional: protocol -> allowed symbols (from manual config)
 */
export function computeDeployment(
  symbol: string,
  exchangeRate: number | null,
  protocols: ProtocolDeployment[],
  restrictBySlug: Record<string, string[] | undefined>,
): Deployment | null {
  const upper = symbol.toUpperCase();
  const rate = exchangeRate ?? 1;
  const byProtocol: Record<string, number> = {};

  for (const p of protocols) {
    if (!p.ok) continue;
    const allowed = restrictBySlug[p.slug];
    if (allowed && allowed.length > 0 && !allowed.map((s) => s.toUpperCase()).includes(upper)) {
      continue;
    }
    const amount = p.tokensBySymbolUpper[upper];
    if (typeof amount === "number" && amount > 0) {
      byProtocol[p.label] = round2(amount * rate);
    }
  }

  if (Object.keys(byProtocol).length === 0) return null;

  const totalDeployed = round2(
    Object.values(byProtocol).reduce((a, b) => a + b, 0),
  );

  return { byProtocol, totalDeployed, note: DOUBLE_COUNT_NOTE };
}
