// Advertised vs realized APY (DEVELOPMENT_PLAN section 6.1), keyless edition.
//
// realizedApy — measured from the LST→SOL exchange rate over time (the project's
//   differentiator). Given the accumulated exchange-rate history plus today's
//   rate, annualize the oldest→newest move over the window:
//     ((rateNow / rateThen) ** (365 / daysElapsed)) - 1
//   Requires a span of at least MIN_DAYS. Until enough history exists it falls
//   back to a bootstrap APY (DeFiLlama yield, else extra-api latest).
// advertisedApy — manual override, else the bootstrap (marketed) APY.
// apyGap = advertisedApy - realizedApy.

import type { NormalizedSanctumLst } from "../sources/sanctum.js";

export interface RatePoint {
  date: string; // YYYY-MM-DD
  value: number; // exchange rate (SOL per token)
}

export type RealizedBasis = "measured" | "recent" | "lifetime" | null;

export interface ApyResult {
  advertisedApy: number | null;
  realizedApy: number | null;
  realizedApyBasis: RealizedBasis;
  apyGap: number | null;
}

const MIN_DAYS = 3; // need a few days of accrual before a rate-measured APY is meaningful

function daysBetween(a: string, b: string): number {
  const ms = new Date(b).getTime() - new Date(a).getTime();
  return ms / (1000 * 60 * 60 * 24);
}

/** Annualize the oldest→newest exchange-rate move. Null if the span is too short. */
export function realizedFromHistory(series: RatePoint[]): number | null {
  const pts = series
    .filter((p) => Number.isFinite(p.value) && p.value > 0)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  if (pts.length < 2) return null;
  const first = pts[0]!;
  const last = pts[pts.length - 1]!;
  const days = daysBetween(first.date, last.date);
  if (days < MIN_DAYS) return null;
  const growth = last.value / first.value;
  if (!(growth > 0)) return null;
  const apy = (growth ** (365 / days) - 1) * 100;
  return Number.isFinite(apy) ? apy : null;
}

export interface DeriveApyContext {
  /** Exchange-rate history for this symbol, INCLUDING today's point. */
  rateSeries: RatePoint[];
  /** Recent realized APY (percent) from DeFiLlama, if any. */
  recentApy: number | null;
  /** Manual advertised override (percent), if any. */
  advertisedOverride: number | null | undefined;
}

export function deriveApy(lst: NormalizedSanctumLst, ctx: DeriveApyContext): ApyResult {
  // Realized = our measured trailing yield (best) -> DeFiLlama recent -> since-launch.
  // Basis is reported so each cell's timeframe is transparent (not silently mixed).
  const measured = realizedFromHistory(ctx.rateSeries);
  let realizedApy: number | null;
  let realizedApyBasis: RealizedBasis;
  if (measured !== null) {
    realizedApy = measured;
    realizedApyBasis = "measured";
  } else if (ctx.recentApy !== null) {
    realizedApy = ctx.recentApy;
    realizedApyBasis = "recent";
  } else if (lst.inceptionApy !== null) {
    realizedApy = lst.inceptionApy;
    realizedApyBasis = "lifetime";
  } else {
    realizedApy = null;
    realizedApyBasis = null;
  }

  // Advertised only exists where a human has recorded the marketed number — we
  // never fabricate one, so the gap shows only where it's real.
  const advertisedApy =
    ctx.advertisedOverride !== null && ctx.advertisedOverride !== undefined
      ? ctx.advertisedOverride
      : null;

  const apyGap =
    advertisedApy !== null && realizedApy !== null ? advertisedApy - realizedApy : null;

  return { advertisedApy, realizedApy, realizedApyBasis, apyGap };
}
