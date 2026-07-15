// Sort + filter logic. Row order is ALWAYS a function of the active sort — no
// token is ever hard-coded to a position (neutrality requirement).

import type { Lst } from "@shared/schema";

export type SortKey =
  | "symbol"
  | "type"
  | "advertisedApy"
  | "realizedApy"
  | "apyGap"
  | "tvlSol"
  | "holders"
  | "feePct"
  | "launchDate"
  | "deployment"
  | "exitCost"
  | "decentralization"
  | "netApyAfterExit"
  | "yieldTrend30d";

export type SortDir = "asc" | "desc";

export interface SortState {
  key: SortKey;
  dir: SortDir;
}

function value(lst: Lst, key: SortKey): number | string | null {
  switch (key) {
    case "symbol":
      return lst.symbol.toLowerCase();
    case "type":
      return lst.type;
    case "launchDate":
      return lst.launchDate ?? null;
    case "deployment":
      return lst.deployment?.totalDeployed ?? null;
    case "exitCost":
      return lst.exitCost?.priceImpactPct ?? null;
    case "netApyAfterExit":
      return lst.exitCost?.netApyAfterExit ?? null;
    case "yieldTrend30d":
      return lst.yieldTrend30d;
    case "decentralization": {
      // Grade (A best) as the primary rank, low concentration as the tiebreak.
      const grade = lst.decentralization.grade;
      if (grade === null) return null;
      const rank = { A: 5, B: 4, C: 3, D: 2, F: 1 }[grade];
      const conc = lst.decentralization.stakeConcentration ?? 0.5;
      return rank * 10 + (1 - conc);
    }
    default:
      return lst[key];
  }
}

/**
 * Stable sort. Nulls always sort to the bottom regardless of direction so
 * missing data never masquerades as the best or worst value.
 */
export function sortLsts(lsts: Lst[], state: SortState): Lst[] {
  const { key, dir } = state;
  const factor = dir === "asc" ? 1 : -1;
  return lsts
    .map((lst, i) => ({ lst, i }))
    .sort((a, b) => {
      const av = value(a.lst, key);
      const bv = value(b.lst, key);
      const aNull = av === null || av === "";
      const bNull = bv === null || bv === "";
      if (aNull && bNull) return a.i - b.i;
      if (aNull) return 1; // nulls to bottom
      if (bNull) return -1;
      if (typeof av === "string" && typeof bv === "string") {
        const cmp = av < bv ? -1 : av > bv ? 1 : 0;
        return cmp !== 0 ? cmp * factor : a.i - b.i;
      }
      const cmp = (av as number) - (bv as number);
      return cmp !== 0 ? cmp * factor : a.i - b.i;
    })
    .map((x) => x.lst);
}

// --- sort presets (the "Sort by" dropdown) ----------------------------------

export interface SortPreset {
  id: string;
  label: string;
  sort: SortState;
}

// Direction-aware, human-labelled sorts. Grouping is by intent; every option maps
// to a (key, dir) the table already understands. Nulls always sink to the bottom.
export const SORT_PRESETS: SortPreset[] = [
  { id: "tvl", label: "TVL — largest first", sort: { key: "tvlSol", dir: "desc" } },
  { id: "realized", label: "Realized APY — highest", sort: { key: "realizedApy", dir: "desc" } },
  { id: "net", label: "Net take-home APY — highest", sort: { key: "netApyAfterExit", dir: "desc" } },
  { id: "decent", label: "Decentralization — best grade", sort: { key: "decentralization", dir: "desc" } },
  { id: "exit", label: "Exit cost — cheapest", sort: { key: "exitCost", dir: "asc" } },
  { id: "deployed", label: "DeFi deployed — most", sort: { key: "deployment", dir: "desc" } },
  { id: "trendUp", label: "Yield trend — rising", sort: { key: "yieldTrend30d", dir: "desc" } },
  { id: "trendDown", label: "Yield trend — declining", sort: { key: "yieldTrend30d", dir: "asc" } },
  { id: "gap", label: "APY gap — most overstated", sort: { key: "apyGap", dir: "desc" } },
  { id: "name", label: "Name — A→Z", sort: { key: "symbol", dir: "asc" } },
];

/** The preset id matching the active sort, or "" when it's a custom header sort. */
export function presetIdFor(sort: SortState): string {
  return (
    SORT_PRESETS.find((p) => p.sort.key === sort.key && p.sort.dir === sort.dir)?.id ?? ""
  );
}

// --- intent router ----------------------------------------------------------

export type IntentId = "maxYield" | "mostDecentralized" | "cheapestExit" | "bestTakeHome";

export interface Intent {
  id: IntentId;
  label: string;
  hint: string;
  sort: SortState;
  /** true once the intent's dedicated metric is live (Phase 4/5/6). */
  live: boolean;
}

// Iteration-1 wiring: each pill applies a sort now. The metrics behind
// "most decentralized" and "cheapest exit" land in Phase 4/5; until then they
// apply a defensible proxy and are marked not-yet-live in the UI.
export const INTENTS: Intent[] = [
  {
    id: "maxYield",
    label: "Max yield",
    hint: "Highest realized APY",
    sort: { key: "realizedApy", dir: "desc" },
    live: true,
  },
  {
    id: "mostDecentralized",
    label: "Most decentralized",
    hint: "Best decentralization grade first, then least stake-concentrated",
    sort: { key: "decentralization", dir: "desc" },
    live: true,
  },
  {
    id: "cheapestExit",
    label: "Cheapest exit",
    hint: "Lowest price impact to swap out to SOL (1000-SOL sample)",
    sort: { key: "exitCost", dir: "asc" },
    live: true,
  },
  {
    id: "bestTakeHome",
    label: "Best take-home",
    hint: "Highest realized APY after subtracting the exit-cost drag",
    sort: { key: "netApyAfterExit", dir: "desc" },
    live: true,
  },
];
