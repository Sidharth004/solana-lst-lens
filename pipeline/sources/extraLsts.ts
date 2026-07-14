// Source LSTs that aren't in the sanctum-lst-list registry (new launches lag it).
// extra-api doesn't cover them, so we derive:
//   - exchange rate: Jupiter quote (1 token -> SOL), near-spot
//   - TVL: on-chain token supply (RPC getTokenSupply) x rate
// Everything else (deployment, exit, realized-from-history) flows through the
// normal pipeline. Never throws.

import { fetchJson } from "../lib/fetchJson.js";
import type { ExtraLstEntry } from "../../shared/schema.js";
import type { NormalizedSanctumLst } from "./sanctum.js";

const SOL_MINT = "So11111111111111111111111111111111111111112";
const JUP = "https://lite-api.jup.ag";
const LAMPORTS_PER_SOL = 1e9;

function rpcUrl(): string {
  return process.env.SOLANA_RPC_URL || process.env.HELIUS_RPC_URL || "https://api.mainnet-beta.solana.com";
}

/** SOL per token, from a small Jupiter quote (near-spot; low price impact). */
async function jupiterRate(mint: string, decimals: number): Promise<number | null> {
  const amount = 10 ** decimals; // 1 token
  const q = await fetchJson<{ inAmount?: string; outAmount?: string }>(
    `${JUP}/swap/v1/quote?inputMint=${mint}&outputMint=${SOL_MINT}&amount=${amount}&slippageBps=50`,
    { label: `jupiter rate ${mint.slice(0, 6)}…` },
  );
  if (!q?.outAmount) return null;
  const rate = Number(q.outAmount) / LAMPORTS_PER_SOL;
  return Number.isFinite(rate) && rate > 0 ? rate : null;
}

/** Circulating supply in whole tokens, via RPC getTokenSupply. */
async function tokenSupply(mint: string): Promise<number | null> {
  try {
    const res = await fetch(rpcUrl(), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getTokenSupply", params: [mint] }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { result?: { value?: { uiAmount?: number } } };
    const ui = json.result?.value?.uiAmount;
    return typeof ui === "number" && Number.isFinite(ui) ? ui : null;
  } catch {
    return null;
  }
}

export interface ExtraLstsResult {
  ok: boolean;
  lsts: NormalizedSanctumLst[];
  note: string;
}

export async function fetchExtraLsts(entries: ExtraLstEntry[]): Promise<ExtraLstsResult> {
  if (entries.length === 0) return { ok: true, lsts: [], note: "none" };

  const lsts = await Promise.all(
    entries.map(async (e): Promise<NormalizedSanctumLst | null> => {
      const [rate, supply] = await Promise.all([
        jupiterRate(e.mint, e.decimals),
        tokenSupply(e.mint),
      ]);
      const tvlSol = rate !== null && supply !== null ? supply * rate : null;
      return {
        symbol: e.symbol,
        mint: e.mint,
        name: e.name,
        logoUri: e.logoUri ?? null,
        decimals: e.decimals,
        poolProgram: e.program ?? null,
        validatorList: e.validatorList ?? null,
        voteAccount: null,
        holders: null,
        launchDate: null,
        categories: [],
        feePct: null,
        tvlSol,
        exchangeRate: rate,
        inceptionApy: null, // no extra-api coverage; realized fills via our history
      };
    }),
  );

  const ok = lsts.filter((l): l is NormalizedSanctumLst => l !== null);
  const resolved = ok.filter((l) => l.exchangeRate !== null).length;
  return { ok: resolved > 0, lsts: ok, note: `${resolved}/${entries.length} resolved` };
}
