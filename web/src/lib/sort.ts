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
  | "launchDate";

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

// --- intent router ----------------------------------------------------------

export type IntentId = "maxYield" | "mostDecentralized" | "cheapestExit" | "newest";

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
    hint: "Decentralization score — full ranking in Phase 4",
    sort: { key: "type", dir: "asc" },
    live: false,
  },
  {
    id: "cheapestExit",
    label: "Cheapest exit",
    hint: "Exit cost — proxied by depth (TVL) until Phase 5",
    sort: { key: "tvlSol", dir: "desc" },
    live: false,
  },
  {
    id: "newest",
    label: "Newest yield sources",
    hint: "Newest LSTs and novel yield types first",
    sort: { key: "launchDate", dir: "desc" },
    live: true,
  },
];
