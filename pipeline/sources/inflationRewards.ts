// EXACT per-validator base staking APY, from on-chain inflation rewards.
//
// Replaces the hardcoded `networkBaseStakingApy` guess (overrides.json) with a
// measured number. Solana credits inflation (staking) rewards to stake accounts
// each epoch; `getInflationReward` on a VOTE account returns the *commission*
// the validator skimmed, plus the on-chain `commissionBps`. From that we recover
// the exact GROSS base rate — and a staker's NET base is `gross × (1 − commission)`.
//
//   gross_apy_v = (commission_lamports / (commissionBps/1e4)) / stake × epochs/yr
//   base_apy_v  = gross_used × (1 − commissionBps/1e4)
//
// Why not read the reward directly? A vote account's reward IS the commission —
// for a 0%-commission validator (common for LSTs) it is 0, so the staker reward
// isn't recoverable from the vote account. Reading the pool's individual stake
// accounts would need per-program PDA derivation; the gross-and-commission model
// gets the same exact answer with none of that. run.ts stake-weights per LST.
//
// NOTE: Alchemy's free tier blocks getInflationReward (-32001), so this source
// routes to HELIUS_RPC_URL / the public endpoint (and probes whichever works).
// It is only a handful of calls (N epochs × chunked vote arrays). Never throws.

import type { StakewizResult } from "./stakewiz.js";

const EPOCHS_PER_YEAR = 365 / 2.5;
// Base staking is stable epoch-to-epoch (unlike spiky MEV) and we median the
// gross across ~600 validators, so one finalized epoch is plenty — and keeps the
// call count low, since getInflationReward is throttled hard on the public RPC.
const N_EPOCHS = 1;
const LAMPORTS = 1e9;
const CHUNK = 128;
// Gross is only stable to recover when commission is a few percent (dividing a
// tiny commission by a tiny rate amplifies rounding). Sample gross from these.
const GROSS_MIN_BPS = 300;
const GROSS_MAX_BPS = 1000;
// Plausibility band for a staker's net base APY (drop outliers -> null fallback).
const BASE_MIN = 1;
const BASE_MAX = 9;

interface RewardRow {
  amount: number | null;
  commission: number | null; // legacy field (percent), usually null
  commissionBps?: number | null;
  epoch: number;
}

/** Candidate RPCs that actually serve getInflationReward (Alchemy free does not). */
function candidateRpcs(): string[] {
  const list: string[] = [];
  const helius = process.env.HELIUS_RPC_URL;
  const generic = process.env.SOLANA_RPC_URL;
  if (helius) list.push(helius);
  // Only try the generic override if it isn't the known-blocking Alchemy host.
  if (generic && !/alchemy\.com/i.test(generic)) list.push(generic);
  list.push("https://api.mainnet-beta.solana.com");
  return [...new Set(list)];
}

async function rpcOn<T>(url: string, method: string, params: unknown[]): Promise<T | null> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { result?: T; error?: unknown };
    if (json.error) return null;
    return json.result ?? null;
  } catch {
    return null;
  }
}

function chunk<T>(a: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n));
  return out;
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

export interface InflationRewardsResult {
  ok: boolean;
  /** vote account -> exact NET base staking APY (percent). */
  baseApyByVote: Map<string, number>;
  /** measured network gross base rate (percent) — the fallback for 0%-commission. */
  networkGrossApy: number | null;
  note: string;
}

export async function fetchInflationRewards(
  votes: string[],
  stakewiz: StakewizResult,
): Promise<InflationRewardsResult> {
  const empty = new Map<string, number>();
  const fail = (note: string): InflationRewardsResult => ({
    ok: false,
    baseApyByVote: empty,
    networkGrossApy: null,
    note,
  });

  // Pick the first RPC that serves getInflationReward.
  const candidates = candidateRpcs();
  let rpcUrl: string | null = null;
  const epochInfo = await (async () => {
    for (const url of candidates) {
      const info = await rpcOn<{ epoch: number }>(url, "getEpochInfo", []);
      if (info?.epoch) {
        // Probe: does this endpoint actually serve getInflationReward?
        const probe = await rpcOn<RewardRow[]>(url, "getInflationReward", [
          [votes[0]].filter(Boolean),
          { epoch: info.epoch - 2 },
        ]);
        if (probe !== null) {
          rpcUrl = url;
          return info;
        }
      }
    }
    return null;
  })();
  if (!epochInfo || !rpcUrl) return fail("no RPC serves getInflationReward");

  const cur = epochInfo.epoch;
  const epochs = Array.from({ length: N_EPOCHS }, (_, i) => cur - 2 - i);

  // vote -> per-epoch reward rows.
  const rowsByVote = new Map<string, RewardRow[]>();
  for (const epoch of epochs) {
    for (const group of chunk(votes, CHUNK)) {
      const res = await rpcOn<(RewardRow | null)[]>(rpcUrl, "getInflationReward", [
        group,
        { epoch },
      ]);
      if (!res) continue;
      group.forEach((vote, i) => {
        const row = res[i];
        if (!row) return;
        const arr = rowsByVote.get(vote) ?? [];
        arr.push({ ...row, epoch });
        rowsByVote.set(vote, arr);
      });
    }
  }
  if (rowsByVote.size === 0) return fail("no reward rows");

  // 1) Recover the network GROSS base rate from commission-charging validators.
  //    gross = commission / commission_rate; a per-validator sample is noisy, so
  //    we take the median across validators — gross is genuinely uniform across
  //    performant validators (the real differentiator is commission, step 2).
  const grossSamples: number[] = [];
  for (const [vote, rows] of rowsByVote) {
    const stake = stakewiz.byVoteIdentity.get(vote)?.activatedStake;
    if (!stake || stake <= 0) continue;
    const perEpoch: number[] = [];
    for (const r of rows) {
      const bps = r.commissionBps ?? null;
      if (bps === null || bps < GROSS_MIN_BPS || bps > GROSS_MAX_BPS) continue;
      if (!r.amount || r.amount <= 0) continue;
      const c = bps / 10000;
      const gross = (r.amount / LAMPORTS / c / stake) * EPOCHS_PER_YEAR * 100;
      if (gross > 0 && gross < 15) perEpoch.push(gross);
    }
    const g = median(perEpoch);
    if (g !== null) grossSamples.push(g);
  }
  const networkGross = median(grossSamples);
  if (networkGross === null) return fail("could not measure gross base rate");

  // 2) Net base APY per validator = networkGross × (1 − its real commission).
  //    Works for 0%-commission validators (staker gets the full gross) and can
  //    never exceed the gross ceiling.
  const baseApyByVote = new Map<string, number>();
  for (const [vote, rows] of rowsByVote) {
    if (!stakewiz.byVoteIdentity.get(vote)?.activatedStake) continue;
    // Representative commission = the latest epoch's on-chain bps we saw.
    const withBps = rows.filter((r) => r.commissionBps != null).sort((a, b) => b.epoch - a.epoch);
    const bps = withBps[0]?.commissionBps;
    if (bps == null) continue;
    const base = networkGross * (1 - Math.min(bps, 10000) / 10000);
    if (base >= BASE_MIN && base <= BASE_MAX) {
      baseApyByVote.set(vote, Math.round(base * 1000) / 1000);
    }
  }

  return {
    ok: baseApyByVote.size > 0,
    baseApyByVote,
    networkGrossApy: Math.round(networkGross * 1000) / 1000,
    note: `${baseApyByVote.size} validators, gross ${networkGross.toFixed(2)}%, epochs ${epochs.join("/")}`,
  };
}
