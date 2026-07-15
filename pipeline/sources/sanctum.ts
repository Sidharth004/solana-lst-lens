// Sanctum data — KEYLESS public sources (no API key required).
//
// The gated sanctum-api.ironforge.network requires a data-API key that the
// self-serve Ironforge gateway does not issue, so we use Sanctum's public data:
//   - LST registry: sanctum-lst-list.toml (identity, mint, pool, validator list)
//   - Exchange rate + TVL: extra-api.sanctum.so (lamports; ÷1e9 for SOL)
//
// APY is NOT taken from here (extra-api's apy/latest currently returns 0.0 at the
// epoch boundary). Realized APY is measured from the exchange-rate history we
// accumulate daily, with a DeFiLlama bootstrap (see derive/realizedApy + run.ts).
//
// Never throws: on failure it returns what it has and flags ok:false.

import { parse as parseToml } from "smol-toml";
import { fetchJson } from "../lib/fetchJson.js";

const LST_LIST_URL =
  "https://raw.githubusercontent.com/igneous-labs/sanctum-lst-list/master/sanctum-lst-list.toml";
const EXTRA_API = "https://extra-api.sanctum.so";
const LAMPORTS_PER_SOL = 1e9;

// Only surface LSTs with at least this much TVL (SOL) — the registry lists 245
// entries, many dead/dust. Keeps the dashboard meaningful. Tunable.
const MIN_TVL_SOL = 1000;

// --- registry (TOML) --------------------------------------------------------

interface TomlPool {
  program?: string;
  pool?: string;
  validator_list?: string;
  vote_account?: string;
}
interface TomlLst {
  mint?: string;
  name?: string;
  symbol?: string;
  logo_uri?: string;
  decimals?: number;
  pool?: TomlPool;
}

export interface NormalizedSanctumLst {
  symbol: string;
  mint: string;
  name: string;
  logoUri: string | null;
  decimals: number | null;
  poolProgram: string | null;
  poolAddress: string | null;
  validatorList: string | null;
  voteAccount: string | null;
  holders: number | null; // not exposed by public sources -> null
  launchDate: string | null; // not exposed -> null
  categories: string[];
  feePct: number | null; // not exposed by public sources -> null
  tvlSol: number | null;
  exchangeRate: number | null; // solValue (SOL per token)
  inceptionApy: number | null; // annualized yield since launch, from exchange rate (percent)
}

export interface SanctumResult {
  ok: boolean;
  lsts: NormalizedSanctumLst[];
  note?: string;
}

async function fetchRegistry(): Promise<TomlLst[]> {
  const res = await fetch(LST_LIST_URL, { headers: { accept: "text/plain" } }).catch(
    () => null,
  );
  if (!res || !res.ok) {
    console.warn(`[sanctum] LST list fetch failed (${res?.status ?? "network"})`);
    return [];
  }
  try {
    const text = await res.text();
    const parsed = parseToml(text) as { sanctum_lst_list?: TomlLst[] };
    return Array.isArray(parsed.sanctum_lst_list) ? parsed.sanctum_lst_list : [];
  } catch (err) {
    console.warn(`[sanctum] failed to parse LST list TOML: ${(err as Error).message}`);
    return [];
  }
}

// --- extra-api (rate, tvl, apy) ---------------------------------------------

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function lstQuery(symbols: string[]): string {
  return symbols.map((s) => `lst=${encodeURIComponent(s)}`).join("&");
}

function lamportsToSol(v: string | number | undefined): number | null {
  if (v === undefined || v === null) return null;
  const n = typeof v === "string" ? Number(v) : v;
  if (!Number.isFinite(n)) return null;
  return n / LAMPORTS_PER_SOL;
}

async function fetchMap(
  pathBase: string,
  field: string,
  symbols: string[],
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const group of chunk(symbols, 40)) {
    const url = `${EXTRA_API}${pathBase}?${lstQuery(group)}`;
    const resp = await fetchJson<Record<string, Record<string, string>>>(url, {
      label: `extra-api ${pathBase}`,
      timeoutMs: 30000,
    });
    const map = resp?.[field];
    if (map) Object.assign(out, map);
  }
  return out;
}

export async function fetchSanctumLsts(): Promise<SanctumResult> {
  const registry = await fetchRegistry();
  const withSymbol = registry.filter((l) => l.symbol && l.mint);
  if (withSymbol.length === 0) {
    return { ok: false, lsts: [], note: "LST registry empty/unavailable" };
  }

  const symbols = withSymbol.map((l) => l.symbol as string);
  const [solValues, tvls, inception] = await Promise.all([
    fetchMap("/v1/sol-value/current", "solValues", symbols),
    fetchMap("/v1/tvl/current", "tvls", symbols),
    // apy/latest returns 0 at the epoch boundary; apy/inception is the annualized
    // yield since launch, measured from the exchange rate — real and broad.
    fetchMap("/v1/apy/inception", "apys", symbols),
  ]);

  const lsts: NormalizedSanctumLst[] = [];
  for (const l of withSymbol) {
    const symbol = l.symbol as string;
    const tvlSol = lamportsToSol(tvls[symbol]);
    if (tvlSol === null || tvlSol < MIN_TVL_SOL) continue;

    const incRaw = inception[symbol];
    const incNum = incRaw !== undefined ? Number(incRaw) : NaN;
    const inceptionApy = Number.isFinite(incNum) && incNum > 0 ? incNum * 100 : null;

    lsts.push({
      symbol,
      mint: l.mint as string,
      name: l.name ?? symbol,
      logoUri: l.logo_uri ?? null,
      decimals: l.decimals ?? null,
      poolProgram: l.pool?.program ?? null,
      poolAddress: l.pool?.pool ?? null,
      validatorList: l.pool?.validator_list ?? null,
      voteAccount: l.pool?.vote_account ?? null,
      holders: null,
      launchDate: null,
      categories: [],
      feePct: null,
      tvlSol,
      exchangeRate: lamportsToSol(solValues[symbol]),
      inceptionApy,
    });
  }

  return { ok: lsts.length > 0, lsts, note: `${lsts.length}/${symbols.length} LSTs above ${MIN_TVL_SOL} SOL TVL` };
}
