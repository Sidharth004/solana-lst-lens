// Decentralization score (DEVELOPMENT_PLAN section 6.3).
//
// Editorial composite — labeled "our index" in the UI, with the raw inputs kept
// visible so it's auditable. Weighting (documented in NOTES):
//   validatorCount     30%   (more validators = better, log-scaled)
//   (1 - concentration) 40%  (flatter stake distribution = better)
//   avgValidatorRank   30%   (delegating to smaller/lower-ranked validators =
//                             better for network decentralization)
//
// Inputs per LST come from joining the pool's validator set to Stakewiz. When
// the validator set can't be resolved (no Sanctum key / RPC), the orchestrator
// passes null and the whole score degrades to null for that LST (graceful).

import type { Decentralization, Grade } from "../../shared/schema.js";

export interface PoolValidator {
  voteIdentity: string;
  activatedStake: number; // SOL delegated by THIS pool to the validator
  rank: number | null; // Stakewiz network rank (1 = largest)
}

export interface DecentralizationInputs {
  validators: PoolValidator[];
  /** Total validators in the network, to normalize avg rank. */
  networkValidatorCount: number | null;
}

/** Herfindahl-Hirschman index of stake shares within the set: 0 spread, 1 concentrated. */
export function herfindahl(stakes: number[]): number | null {
  const total = stakes.reduce((a, b) => a + (b > 0 ? b : 0), 0);
  if (total <= 0) return null;
  let h = 0;
  for (const s of stakes) {
    if (s <= 0) continue;
    const share = s / total;
    h += share * share;
  }
  return h;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/** Normalize validator count to 0..1 on a log scale (1 -> 0, ~300+ -> ~1). */
function normCount(n: number): number {
  if (n <= 1) return 0;
  return clamp01(Math.log10(n) / Math.log10(300));
}

/**
 * Normalize average network rank to 0..1 where delegating to smaller validators
 * (higher rank numbers) scores higher. avgRank 1 -> 0, avgRank >= networkCount -> 1.
 */
function normRank(avgRank: number, networkCount: number | null): number {
  const denom = networkCount && networkCount > 1 ? networkCount : 300;
  return clamp01((avgRank - 1) / (denom - 1));
}

function toGrade(score100: number): Grade {
  if (score100 >= 80) return "A";
  if (score100 >= 65) return "B";
  if (score100 >= 50) return "C";
  if (score100 >= 35) return "D";
  return "F";
}

export function computeDecentralization(
  inp: DecentralizationInputs,
): Decentralization {
  const nullResult: Decentralization = {
    validatorCount: null,
    stakeConcentration: null,
    avgValidatorRank: null,
    grade: null,
    isEstimate: true,
  };

  const vals = inp.validators.filter((v) => v.activatedStake > 0);
  if (vals.length === 0) return nullResult;

  const validatorCount = vals.length;
  const concentration = herfindahl(vals.map((v) => v.activatedStake));

  const ranked = vals.map((v) => v.rank).filter((r): r is number => r !== null && r > 0);
  const avgValidatorRank =
    ranked.length > 0 ? ranked.reduce((a, b) => a + b, 0) / ranked.length : null;

  // Composite (only over the components we actually have).
  const parts: Array<{ weight: number; value: number }> = [];
  parts.push({ weight: 0.3, value: normCount(validatorCount) });
  if (concentration !== null) {
    parts.push({ weight: 0.4, value: clamp01(1 - concentration) });
  }
  if (avgValidatorRank !== null) {
    parts.push({ weight: 0.3, value: normRank(avgValidatorRank, inp.networkValidatorCount) });
  }
  const wsum = parts.reduce((a, p) => a + p.weight, 0);
  const score100 =
    wsum > 0 ? (parts.reduce((a, p) => a + p.weight * p.value, 0) / wsum) * 100 : 0;

  return {
    validatorCount,
    stakeConcentration: concentration !== null ? Math.round(concentration * 1000) / 1000 : null,
    avgValidatorRank: avgValidatorRank !== null ? Math.round(avgValidatorRank) : null,
    grade: toGrade(score100),
    isEstimate: true,
  };
}
