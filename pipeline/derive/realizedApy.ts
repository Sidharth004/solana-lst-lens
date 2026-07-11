// Advertised vs realized APY (DEVELOPMENT_PLAN section 6.1).
//
// realizedApy  = Sanctum avgApy (already computed from solValue over trailing epochs).
// advertisedApy = priority:
//   (1) manual override in data/manual/advertised-apy.json, else
//   (2) the single best epoch APY in the trailing window (the flattering number
//       a protocol would quote), else
//   (3) latestApy.
// apyGap = advertisedApy - realizedApy.

import type { NormalizedSanctumLst } from "../sources/sanctum.js";

export interface ApyResult {
  advertisedApy: number | null;
  realizedApy: number | null;
  apyGap: number | null;
}

export function deriveApy(
  lst: NormalizedSanctumLst,
  advertisedOverride: number | null | undefined,
): ApyResult {
  const realizedApy = lst.avgApy;

  let advertisedApy: number | null = null;
  if (advertisedOverride !== null && advertisedOverride !== undefined) {
    advertisedApy = advertisedOverride;
  } else if (lst.apyHistory.length > 0) {
    advertisedApy = Math.max(...lst.apyHistory.map((e) => e.apy));
  } else {
    advertisedApy = lst.latestApy;
  }

  const apyGap =
    advertisedApy !== null && realizedApy !== null
      ? advertisedApy - realizedApy
      : null;

  return { advertisedApy, realizedApy, apyGap };
}
