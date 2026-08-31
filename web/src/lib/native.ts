// The native-staking baseline — "what if I just staked it myself?".
//
// Every LST charges a fee for pooling your stake; the only way to know whether
// that fee buys you anything is to compare against delegating directly. The
// pipeline measures the baseline on-chain (network gross inflation, median
// validator commission, median MEV); this module is the UI's shared reading of
// it so the wording and the arithmetic can't drift between components.

import type { Lst, NativeStaking } from "@shared/schema";
import { fmtPct } from "./format";

/** Realized APY minus the native baseline, in APY points. Null when either side is missing. */
export function vsNative(lst: Lst, native: NativeStaking | null | undefined): number | null {
  if (!native || native.totalApy === null) return null;
  if (lst.realizedApy === null || !Number.isFinite(lst.realizedApy)) return null;
  return Math.round((lst.realizedApy - native.totalApy) * 1000) / 1000;
}

/**
 * A difference between two APYs, e.g. "+0.82 pts". Written as points, not as a
 * percent: 5.14% minus 4.32% is 0.82 percentage points, and calling that "0.82%"
 * is the exact conflation this dashboard exists to avoid.
 */
export function fmtPoints(v: number | null, dp = 2): string {
  if (v === null || !Number.isFinite(v)) return "—";
  return `${v > 0 ? "+" : ""}${v.toFixed(dp)} pts`;
}

/** Explains how the baseline was measured — shown wherever the number appears. */
export function nativeTip(native: NativeStaking): string {
  const parts = [
    `What you'd earn staking SOL directly, with no LST: ${fmtPct(native.netBaseApy)} base`,
  ];
  if (native.medianMevApy !== null) parts.push(`+ ${fmtPct(native.medianMevApy)} MEV`);
  parts.push(`= ${fmtPct(native.totalApy)}.`);
  parts.push(
    `Base is the network's measured gross inflation rate (${fmtPct(native.grossApy)})` +
      (native.medianCommissionPct !== null
        ? ` less the median validator commission (${fmtPct(native.medianCommissionPct)})`
        : "") +
      `. MEV is included because an LST's realized APY already contains it —` +
      ` comparing against an inflation-only baseline would flatter every LST.`,
  );
  return parts.join(" ");
}
