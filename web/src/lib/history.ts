// History extraction + risk-flag derivation for the web app.

import type { ApySnapshot, ExchangeRateSnapshot, Lst } from "@shared/schema";

export interface HistoryData {
  exchangeRates: ExchangeRateSnapshot[];
  apy: ApySnapshot[];
}

export const EMPTY_HISTORY: HistoryData = { exchangeRates: [], apy: [] };

export interface Point {
  date: string;
  value: number;
}

interface DatedBySymbol {
  date: string;
  bySymbol: Record<string, number>;
}

/** Pull one symbol's time series from a dated bySymbol array (sorted by date). */
export function seriesFor(snaps: DatedBySymbol[], symbol: string): Point[] {
  return snaps
    .map((s) => ({ date: s.date, value: s.bySymbol[symbol] }))
    .filter((p): p is Point => typeof p.value === "number" && Number.isFinite(p.value));
}

// --- risk flags -------------------------------------------------------------

export type RiskSeverity = "high" | "medium" | "info";

export interface RiskFlag {
  label: string;
  severity: RiskSeverity;
  detail: string;
}

const DEPEG_DROP = 0.003; // >0.3% single-step drop in the LST→SOL rate

/** Largest single-step downward move in the exchange rate (should only accrue). */
export function maxDrawdown(series: Point[]): number {
  let worst = 0;
  for (let i = 1; i < series.length; i++) {
    const prev = series[i - 1]!.value;
    const cur = series[i]!.value;
    if (prev > 0) {
      const drop = (prev - cur) / prev;
      if (drop > worst) worst = drop;
    }
  }
  return worst;
}

export function deriveRiskFlags(lst: Lst, rateSeries: Point[]): RiskFlag[] {
  const flags: RiskFlag[] = [];

  if (lst.apyGap !== null && lst.apyGap > 1.5) {
    flags.push({
      label: "APY overstated",
      severity: "high",
      detail: `Advertised APY exceeds realized by ${lst.apyGap.toFixed(2)} points.`,
    });
  }

  const conc = lst.decentralization.stakeConcentration;
  if (conc !== null && conc > 0.5) {
    flags.push({
      label: "Stake concentrated",
      severity: "high",
      detail: `Stake is concentrated (Herfindahl ${conc.toFixed(2)}); few validators dominate the set.`,
    });
  }

  const dd = maxDrawdown(rateSeries);
  if (dd > DEPEG_DROP) {
    flags.push({
      label: "Depeg event",
      severity: "high",
      detail: `Exchange rate fell ${(dd * 100).toFixed(2)}% in a single step — the LST should normally only accrue.`,
    });
  }

  if (lst.auditCount === 0) {
    flags.push({
      label: "Unaudited",
      severity: "medium",
      detail: "No audits recorded in the manual layer.",
    });
  }

  return flags;
}

export function highestSeverity(flags: RiskFlag[]): RiskSeverity | null {
  if (flags.some((f) => f.severity === "high")) return "high";
  if (flags.some((f) => f.severity === "medium")) return "medium";
  if (flags.length > 0) return "info";
  return null;
}
