// Yield split: base staking / MEV / other (DEVELOPMENT_PLAN section 6.2).
//
// Two of the three parts are now measured on-chain, so this is only lightly
// modeled (isEstimate stays true — the epoch window + `other` residual keep it
// an estimate, not a guarantee).
//
//   baseStakingApy = the LST's EXACT inflation-reward base (stake-weighted, net
//                    of commission; see sources/inflationRewards.ts), capped at
//                    realizedApy so the parts never exceed the whole. Falls back
//                    to the overrides constant only where a pool's validator set
//                    has no coverage.
//   mevApy         = REAL per-validator MEV, carved out of the residual (see
//                    sources/jitoTips.ts); null when the set has no Jito tips.
//   otherApy       = realizedApy - baseStakingApy - mevApy (priority fees +
//                    fee-sharing + residual).
//   blockspaceApy  = null for every LST (and null for rkuSOL too until the
//                    marketplace is live — the UI renders a hollow "coming"
//                    segment, never a fabricated number).

import type { LstType, YieldSplit } from "../../shared/schema.js";

export interface YieldSplitInputs {
  realizedApy: number | null;
  feePct: number | null;
  /** Base staking APY (percent): the LST's EXACT measured inflation-reward base
   *  where available (stake-weighted, net of commission), else the overrides
   *  constant as a fallback. */
  networkBaseStakingApy: number | null;
  /** Estimated MEV APY (percent) for this LST, carved out of the residual. */
  mevApy?: number | null;
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

  const { realizedApy, networkBaseStakingApy } = inp;
  // Note: feePct is the manager fee as a % of REWARDS (e.g. 4%), not APY points,
  // and realizedApy is already net of it — so it is NOT subtracted here.
  if (realizedApy === null || !Number.isFinite(realizedApy)) return empty;
  if (networkBaseStakingApy === null || !Number.isFinite(networkBaseStakingApy)) {
    // No base rate to model against — leave the whole thing as unattributed.
    return { ...empty, otherApy: round3(Math.max(realizedApy, 0)) };
  }

  // Base = network inflation staking, capped so parts don't exceed realized.
  // Residual = realized − base (MEV + priority fees + fee-sharing).
  const baseStakingApy = Math.min(Math.max(networkBaseStakingApy, 0), Math.max(realizedApy, 0));
  const residual = Math.max(realizedApy - baseStakingApy, 0);

  // Carve the estimated MEV out of the residual; the rest is "other".
  const mevRaw = inp.mevApy ?? null;
  const mevApy = mevRaw !== null && mevRaw > 0 ? Math.min(mevRaw, residual) : null;
  const otherApy = Math.max(residual - (mevApy ?? 0), 0);

  return {
    baseStakingApy: round3(baseStakingApy),
    mevApy: mevApy !== null ? round3(mevApy) : null,
    otherApy: round3(otherApy),
    blockspaceApy: null,
    isEstimate: true,
  };
}
