// EXACT per-validator base staking APY, from on-chain inflation rewards.
//
// Replaces the hardcoded `networkBaseStakingApy` guess (overrides.json) with a
// measured number. Solana credits inflation (staking) rewards to stake accounts
// each epoch; `getInflationReward` on a VOTE account returns the *commission* the
// validator skimmed. From that we recover the exact GROSS base rate, and a
// staker's NET base is `gross × (1 − commission)`.
//
//   gross_apy_v = (commission_lamports / (commission/100)) / stake × epochs/yr
//   base_apy_v  = networkGross × (1 − commission/100)
//
// Why gross-then-commission (not the reward directly)? A vote account's reward IS
// the commission — it's 0 for a 0%-commission validator (what LSTs delegate to),
// so the staker reward isn't recoverable from it. Recovering the network gross
// (a global constant) from commission-charging validators, then applying each
// validator's real commission, gets the exact answer with no stake-account PDAs.
//
// Commission comes from the vote account itself (getAccountInfo jsonParsed) — the
// only reliable source (Stakewiz's commission field doesn't match on-chain, and
// the RPC's commissionBps isn't returned by every provider). run.ts stake-weights
// the per-validator base into an exact per-LST base.
//
// RPC routing: getInflationReward is blocked by Alchemy's free tier (-32001), so
// it probes/routes to Helius or the public endpoint. Vote-account reads use any
// configured RPC. Never throws.

import type { StakewizResult } from "./stakewiz.js";

const EPOCHS_PER_YEAR = 365 / 2.5;
const LAMPORTS = 1e9;
const REWARD_CHUNK = 64; // Helius caps getInflationReward at 64 addresses/call.
const ACCT_CHUNK = 100;
// Gross is only stable to recover where commission is a few percent (dividing a
// tiny commission by a tiny rate amplifies rounding). Sample gross from these.
const GROSS_MIN_PCT = 3;
const GROSS_MAX_PCT = 10;
// Extra high-stake validators queried purely to measure gross (LSTs delegate to
// 0%-commission validators, from which gross can't be recovered).
const N_GAUGE = 250;
// Plausibility band for a staker's net base APY (drop outliers -> null fallback).
const BASE_MIN = 1;
const BASE_MAX = 9;

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

/** Candidate RPCs that serve getInflationReward (Alchemy free tier does not). */
function inflationRpcs(): string[] {
  const list: string[] = [];
  if (process.env.HELIUS_RPC_URL) list.push(process.env.HELIUS_RPC_URL);
  const generic = process.env.SOLANA_RPC_URL;
  if (generic && !/alchemy\.com/i.test(generic)) list.push(generic);
  list.push("https://api.mainnet-beta.solana.com");
  return [...new Set(list)];
}

/** Any RPC works for account reads; prefer the configured one. */
function acctRpc(): string {
  return (
    process.env.SOLANA_RPC_URL ||
    process.env.HELIUS_RPC_URL ||
    "https://api.mainnet-beta.solana.com"
  );
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

interface ParsedVoteAccount {
  data?: { parsed?: { info?: { commission?: number } } };
}

/** vote -> on-chain commission (percent), via getMultipleAccounts jsonParsed. */
async function fetchCommissions(votes: string[]): Promise<Map<string, number>> {
  const url = acctRpc();
  const out = new Map<string, number>();
  for (const group of chunk(votes, ACCT_CHUNK)) {
    const res = await rpcOn<{ value: (ParsedVoteAccount | null)[] }>(url, "getMultipleAccounts", [
      group,
      { encoding: "jsonParsed" },
    ]);
    const vals = res?.value ?? [];
    group.forEach((vote, i) => {
      const c = vals[i]?.data?.parsed?.info?.commission;
      if (typeof c === "number") out.set(vote, c);
    });
  }
  return out;
}

export interface InflationRewardsResult {
  ok: boolean;
  /** vote account -> exact NET base staking APY (percent). */
  baseApyByVote: Map<string, number>;
  /** measured network gross base rate (percent). */
  networkGrossApy: number | null;
  /** Median on-chain commission (percent) across the high-stake gauge set —
   *  what a typical native delegation actually pays. */
  medianCommissionPct: number | null;
  /** How many gauge validators the commission median is drawn from. */
  commissionSample: number | null;
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
    medianCommissionPct: null,
    commissionSample: null,
    note,
  });

  // Gauge: highest-stake network validators (to catch commission-charging ones
  // for the gross measurement) ∪ the LSTs' delegated set (what we score).
  const gauge = [...stakewiz.byVoteIdentity.values()]
    .filter((v) => v.activatedStake != null && v.activatedStake > 0)
    .sort((a, b) => (b.activatedStake ?? 0) - (a.activatedStake ?? 0))
    .slice(0, N_GAUGE)
    .map((v) => v.voteIdentity);
  const queryVotes = [...new Set([...votes, ...gauge])];
  if (queryVotes.length === 0) return fail("no votes");

  // Pick an RPC that serves getInflationReward.
  const candidates = inflationRpcs();
  let rpcUrl: string | null = null;
  let epoch: number | null = null;
  for (const url of candidates) {
    const info = await rpcOn<{ epoch: number }>(url, "getEpochInfo", []);
    if (!info?.epoch) continue;
    const probe = await rpcOn<unknown[]>(url, "getInflationReward", [
      [queryVotes[0]],
      { epoch: info.epoch - 2 },
    ]);
    if (probe !== null) {
      rpcUrl = url;
      epoch = info.epoch - 2; // last finalized epoch (base is stable, 1 is enough)
      break;
    }
  }
  if (!rpcUrl || epoch === null) return fail("no RPC serves getInflationReward");

  // Real on-chain commission per validator (the reliable source).
  const commByVote = await fetchCommissions(queryVotes);

  // Exact commission reward (lamports) per validator for the epoch.
  const amountByVote = new Map<string, number>();
  for (const group of chunk(queryVotes, REWARD_CHUNK)) {
    const res = await rpcOn<({ amount?: number } | null)[]>(rpcUrl, "getInflationReward", [
      group,
      { epoch },
    ]);
    if (!res) continue;
    group.forEach((vote, i) => {
      const amt = res[i]?.amount;
      if (typeof amt === "number") amountByVote.set(vote, amt);
    });
  }
  if (amountByVote.size === 0) return fail("no reward rows");

  // 1) Recover the network GROSS base rate from commission-charging validators.
  const grossSamples: number[] = [];
  for (const vote of queryVotes) {
    const comm = commByVote.get(vote);
    const stake = stakewiz.byVoteIdentity.get(vote)?.activatedStake;
    const amt = amountByVote.get(vote);
    if (comm == null || comm < GROSS_MIN_PCT || comm > GROSS_MAX_PCT) continue;
    if (!stake || stake <= 0 || !amt || amt <= 0) continue;
    const gross = (amt / LAMPORTS / (comm / 100) / stake) * EPOCHS_PER_YEAR * 100;
    if (gross > 0 && gross < 15) grossSamples.push(gross);
  }
  const networkGross = median(grossSamples);
  if (networkGross === null) return fail("could not measure gross base rate");

  // 2) Net base APY per delegated validator = networkGross × (1 − commission).
  //    Works for 0%-commission validators and never exceeds the gross ceiling.
  const baseApyByVote = new Map<string, number>();
  for (const vote of votes) {
    const comm = commByVote.get(vote);
    if (comm == null) continue;
    const base = networkGross * (1 - Math.min(Math.max(comm, 0), 100) / 100);
    if (base >= BASE_MIN && base <= BASE_MAX) {
      baseApyByVote.set(vote, Math.round(base * 1000) / 1000);
    }
  }

  // 3) Typical native-staking commission: the median across the high-stake gauge
  //    set (the validators a native delegator realistically picks from). LSTs
  //    delegate to 0%-commission validators, so the LST set would understate it.
  const gaugeCommissions = gauge
    .map((vote) => commByVote.get(vote))
    .filter((c): c is number => typeof c === "number" && c >= 0 && c <= 100);
  const medianCommissionPct = median(gaugeCommissions);

  return {
    ok: baseApyByVote.size > 0,
    baseApyByVote,
    networkGrossApy: Math.round(networkGross * 1000) / 1000,
    medianCommissionPct,
    commissionSample: gaugeCommissions.length || null,
    note: `${baseApyByVote.size} validators, gross ${networkGross.toFixed(2)}% from ${grossSamples.length} gauges, epoch ${epoch}`,
  };
}
