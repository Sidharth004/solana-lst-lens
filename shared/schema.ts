// SINGLE source of truth for all data types.
// Both the pipeline (Node/tsx) and the web app (Vite/React) import from here so
// the data shape cannot drift. Fields introduced in later phases are declared
// optional/nullable now and populated as those phases land.

export type LstType =
  | "single-validator"
  | "multi-validator"
  | "lst-of-lsts"
  | "exchange-backed"
  | "dat-backed"
  | "blockspace-yield"
  | "other";

export const LST_TYPES: readonly LstType[] = [
  "single-validator",
  "multi-validator",
  "lst-of-lsts",
  "exchange-backed",
  "dat-backed",
  "blockspace-yield",
  "other",
];

/** Human-readable labels for each LST type (UI). */
export const LST_TYPE_LABELS: Record<LstType, string> = {
  "single-validator": "Single-validator",
  "multi-validator": "Multi-validator",
  "lst-of-lsts": "LST of LSTs",
  "exchange-backed": "Exchange-backed",
  "dat-backed": "DAT-backed",
  "blockspace-yield": "Blockspace-yield",
  other: "Other",
};

export interface YieldSplit {
  baseStakingApy: number | null; // network inflation component (minus fee)
  mevApy: number | null; // MEV + priority fees attributed
  otherApy: number | null; // fee-sharing / residual
  blockspaceApy: number | null; // rkuSOL only; null until live
  isEstimate: boolean; // always true when any part is modeled
}

export type Grade = "A" | "B" | "C" | "D" | "F";

export interface Decentralization {
  validatorCount: number | null;
  stakeConcentration: number | null; // 0..1 Herfindahl across the pool's set
  avgValidatorRank: number | null; // mean network rank of delegated validators
  delinquentValidatorCount: number | null; // validators in the set flagged delinquent
  grade: Grade | null; // editorial composite
  isEstimate: boolean;
  /** How the set was resolved: "single" (vote_account), "rpc" (validator list), or null. */
  source: "single" | "rpc" | null;
}

export interface Deployment {
  byProtocol: Record<string, number>; // { kamino: 1234.5, drift: 678.9 } in SOL
  totalDeployed: number | null;
  note: string; // double-counting caveat
}

export interface ExitCost {
  sampleSizeSol: number; // size the quote was taken at, e.g. 1000
  priceImpactPct: number | null;
  netApyAfterExit: number | null; // realizedApy minus annualized exit drag (optional)
}

export interface Lst {
  symbol: string;
  mint: string;
  name: string;
  logoUri: string | null;
  type: LstType;
  issuer: string | null;

  tvlSol: number | null;
  holders: number | null;
  feePct: number | null;
  exchangeRate: number | null; // solValue

  advertisedApy: number | null; // marketed number (manual override or proxy)
  realizedApy: number | null; // measured delivered yield
  /** What realizedApy is based on, so the timeframe is transparent per LST. */
  realizedApyBasis: "measured" | "recent" | "lifetime" | null;
  apyGap: number | null; // advertised - realized
  yieldTrend30d: number | null; // % change in APY over the last 30d (DeFiLlama apyPct30D)

  yieldSplit: YieldSplit; // phase 4
  decentralization: Decentralization; // phase 4
  deployment: Deployment | null; // phase 5
  exitCost: ExitCost | null; // phase 5

  auditCount: number | null; // manual
  launchDate: string | null;
}

export interface Dataset {
  updatedAt: string; // ISO
  epoch: number | null;
  lsts: Lst[];
}

/** Run status + provenance written to data/meta.json each pipeline run. */
export interface Meta {
  updatedAt: string; // ISO timestamp of the run
  epoch: number | null;
  lstCount: number;
  status: "ok" | "partial" | "failed";
  /** Per-source health so the UI/log can show what degraded. */
  sources: Record<string, SourceStatus>;
}

export interface SourceStatus {
  ok: boolean;
  note?: string;
}

// ---------------------------------------------------------------------------
// History (append-only time series; git is the database).
// ---------------------------------------------------------------------------

export interface ExchangeRateSnapshot {
  date: string; // YYYY-MM-DD
  epoch: number | null;
  bySymbol: Record<string, number>; // SYMBOL -> solValue
}

export interface ApySnapshot {
  date: string;
  epoch: number | null;
  bySymbol: Record<string, number>; // SYMBOL -> realized apy
}

export interface TvlSnapshot {
  date: string;
  bySymbol: Record<string, number>; // SYMBOL -> tvl (SOL)
}

// ---------------------------------------------------------------------------
// Manual layer (human-authored; the pipeline reads and merges, never writes).
// ---------------------------------------------------------------------------

export interface TaxonomyEntry {
  type: LstType;
  issuer?: string | null;
  auditCount?: number | null;
  notes?: string;
}

/** data/manual/lst-taxonomy.json */
export interface Taxonomy {
  $schema?: string;
  bySymbol: Record<string, TaxonomyEntry>;
}

/** data/manual/advertised-apy.json — advertised APY overrides per symbol (percent, e.g. 8.2). */
export interface AdvertisedApyOverrides {
  $schema?: string;
  bySymbol: Record<string, number>;
}

/** data/manual/overrides.json — misc manual corrections / constants. */
export interface Overrides {
  $schema?: string;
  /** Network base staking APY constant (percent) used by the yield-split model. */
  networkBaseStakingApy?: number | null;
  /** Per-symbol arbitrary corrections merged onto the fetched Lst. */
  bySymbol?: Record<string, Partial<Lst>>;
}

/** data/manual/defi-protocols.json — protocols to track for DeFi deployment. */
export interface DefiProtocolsConfig {
  $schema?: string;
  protocols: DefiProtocolEntry[];
}

export interface DefiProtocolEntry {
  slug: string; // DeFiLlama slug, e.g. "kamino-lend"
  label: string; // display name, e.g. "Kamino"
  /** LST symbols to match inside chainTvls.Solana.tokens. Empty = match all tracked. */
  symbols?: string[];
}
