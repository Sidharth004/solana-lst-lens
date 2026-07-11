// Exit-cost quotes via Jupiter lite-api (free, no key). Base: https://lite-api.jup.ag
//
// We size the input so the quote is taken at ~sampleSizeSol worth of the LST
// (inputAtomics = sampleSizeSol / exchangeRate × 10^decimals), then read the
// price impact. Sanctum's /swap/token/order wraps Jupiter; we use Jupiter
// directly here as the keyless path. Never throws.

import { fetchJson } from "../lib/fetchJson.js";
import type { ExitCost } from "../../shared/schema.js";

const BASE = "https://lite-api.jup.ag";
export const SOL_MINT = "So11111111111111111111111111111111111111112";

interface JupQuote {
  inAmount?: string;
  outAmount?: string;
  priceImpactPct?: string | number;
}

export interface ExitQuoteParams {
  mint: string;
  decimals: number | null;
  exchangeRate: number | null;
  /** Realized APY (percent) to compute the optional net-after-exit figure. */
  realizedApy: number | null;
  sampleSizeSol?: number; // default 1000
  slippageBps?: number; // default 50
}

function toPercent(v: string | number | undefined): number | null {
  if (v === undefined) return null;
  const n = typeof v === "string" ? Number(v) : v;
  if (!Number.isFinite(n)) return null;
  // Jupiter returns priceImpactPct as a fraction (0.0001709 = 0.017%).
  return n * 100;
}

export async function quoteExitCost(params: ExitQuoteParams): Promise<ExitCost | null> {
  const sampleSizeSol = params.sampleSizeSol ?? 1000;
  const slippageBps = params.slippageBps ?? 50;
  const decimals = params.decimals ?? 9;
  const rate = params.exchangeRate && params.exchangeRate > 0 ? params.exchangeRate : 1;

  // Amount of the LST (in atomics) that is worth ~sampleSizeSol.
  const inputTokens = sampleSizeSol / rate;
  const inputAtomics = Math.round(inputTokens * 10 ** decimals);
  if (!Number.isFinite(inputAtomics) || inputAtomics <= 0) return null;

  const url =
    `${BASE}/swap/v1/quote?inputMint=${params.mint}` +
    `&outputMint=${SOL_MINT}&amount=${inputAtomics}&slippageBps=${slippageBps}`;
  const q = await fetchJson<JupQuote>(url, { label: `jupiter quote ${params.mint.slice(0, 6)}…` });
  if (!q) return null;

  const priceImpactPct = toPercent(q.priceImpactPct);
  const priceImpactRounded =
    priceImpactPct !== null ? Math.round(priceImpactPct * 1000) / 1000 : null;

  // Net-after-exit: realized APY minus the one-time exit haircut at this size.
  const netApyAfterExit =
    params.realizedApy !== null && priceImpactPct !== null
      ? Math.round((params.realizedApy - priceImpactPct) * 1000) / 1000
      : null;

  return {
    sampleSizeSol,
    priceImpactPct: priceImpactRounded,
    netApyAfterExit,
  };
}
