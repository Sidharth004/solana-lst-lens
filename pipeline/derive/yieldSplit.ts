// Yield split: base staking / MEV / other (DEVELOPMENT_PLAN section 6.2).
//
// This is a MODELED estimate — isEstimate is always true.
//
//   baseStakingApy = networkBaseStakingApy - feePct, capped at realizedApy so
//                    the parts never exceed the whole.
//   mevApy         = null (per-validator MEV isn't separable at this layer;
//                    it's folded into `otherApy` as residual).
//   otherApy       = realizedApy - baseStakingApy  (MEV + fee-sharing + residual).
//   blockspaceApy  = null for every LST (and null for rkuSOL too until the
//                    marketplace is live — the UI renders a hollow "coming"
//                    segment, never a fabricated number).

import type { LstType, YieldSplit } from "../../shared/schema.js";

export interface YieldSplitInputs {
  realizedApy: number | null;
  feePct: number | null;
  /** Network base staking APY (percent), from overrides or a live median. */
  networkBaseStakingApy: number | null;
  type: LstType;
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

export function computeYieldSplit(inp: YieldSplitInputs): YieldSplit {
  const empty: YieldSplit = {
    baseStakingApy: null,
    mevApy: null,
    otherApy: null,
    blockspaceApy: null,
    isEstimate: true,
  };

  const { realizedApy, feePct, networkBaseStakingApy } = inp;
  if (realizedApy === null || !Number.isFinite(realizedApy)) return empty;
  if (networkBaseStakingApy === null || !Number.isFinite(networkBaseStakingApy)) {
    // No base rate to model against — leave the whole thing as unattributed.
    return { ...empty, otherApy: round3(Math.max(realizedApy, 0)) };
  }

  const fee = feePct ?? 0;
  // Base after fee, floored at 0 and capped so parts don't exceed realized.
  const baseRaw = Math.max(networkBaseStakingApy - fee, 0);
  const baseStakingApy = Math.min(baseRaw, Math.max(realizedApy, 0));
  const otherApy = Math.max(realizedApy - baseStakingApy, 0);

  return {
    baseStakingApy: round3(baseStakingApy),
    mevApy: null,
    otherApy: round3(otherApy),
    blockspaceApy: null,
    isEstimate: true,
  };
}
