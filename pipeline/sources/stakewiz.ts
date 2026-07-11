// Stakewiz API (validators / decentralization). Free, no auth.
// Base URL: https://api.stakewiz.com
//
// We fetch /validators once and index by vote_identity so the decentralization
// derive can look up rank/stake/delinquency for the validators a pool delegates
// to. Never throws; returns an empty index on failure.

import { fetchJson } from "../lib/fetchJson.js";

const BASE = "https://api.stakewiz.com";

interface RawValidator {
  vote_identity?: string;
  activated_stake?: number;
  commission?: number;
  delinquent?: boolean;
  skip_rate?: number;
  rank?: number;
  wiz_score?: number;
  name?: string;
  is_jito?: boolean;
  jito_commission_bps?: number;
}

export interface ValidatorInfo {
  voteIdentity: string;
  activatedStake: number | null; // SOL
  commission: number | null;
  delinquent: boolean;
  skipRate: number | null;
  rank: number | null;
  wizScore: number | null;
  name: string | null;
  isJito: boolean;
  jitoCommissionBps: number | null;
}

export interface StakewizResult {
  ok: boolean;
  /** vote_identity -> ValidatorInfo */
  byVoteIdentity: Map<string, ValidatorInfo>;
  networkValidatorCount: number | null;
  note?: string;
}

function normalize(v: RawValidator): ValidatorInfo | null {
  if (!v.vote_identity) return null;
  return {
    voteIdentity: v.vote_identity,
    activatedStake: v.activated_stake ?? null,
    commission: v.commission ?? null,
    delinquent: v.delinquent ?? false,
    skipRate: v.skip_rate ?? null,
    rank: v.rank ?? null,
    wizScore: v.wiz_score ?? null,
    name: v.name ?? null,
    isJito: v.is_jito ?? false,
    jitoCommissionBps: v.jito_commission_bps ?? null,
  };
}

export async function fetchStakewizValidators(): Promise<StakewizResult> {
  const raw = await fetchJson<RawValidator[]>(`${BASE}/validators`, {
    label: "stakewiz /validators",
    timeoutMs: 30000,
  });
  const byVoteIdentity = new Map<string, ValidatorInfo>();
  if (!raw || !Array.isArray(raw)) {
    return { ok: false, byVoteIdentity, networkValidatorCount: null, note: "fetch failed" };
  }
  for (const r of raw) {
    const info = normalize(r);
    if (info) byVoteIdentity.set(info.voteIdentity, info);
  }
  return {
    ok: true,
    byVoteIdentity,
    networkValidatorCount: byVoteIdentity.size,
  };
}
