// TRUE per-validator MEV, read on-chain from Jito's TipDistribution accounts.
//
// Jito routes each validator's MEV tips into a TipDistributionAccount PDA, one
// per (validator, epoch), under program 4R3gSG8B…c2r7 with seed
// "TIP_DISTRIBUTION_ACCOUNT". Once the epoch's merkle root is uploaded, the
// account holds `max_total_claim` = total tips for that validator that epoch.
// Staker MEV = max_total_claim × (1 − validator_commission). Dividing by the
// validator's active stake and annualizing gives its real MEV yield.
//
// We read the last few finalized epochs for every validator our LSTs delegate
// to, then run.ts stake-weights them into an exact per-LST MEV APY. Never throws.

import { PublicKey } from "@solana/web3.js";
import type { StakewizResult } from "./stakewiz.js";

const PROGRAM = new PublicKey("4R3gSG8BpU4t19KYj8CfnbtRpnT8gtk4dvTHxVRwc2r7");
const SEED = Buffer.from("TIP_DISTRIBUTION_ACCOUNT");
const EPOCHS_PER_YEAR = 365 / 2.5;
const N_EPOCHS = 3; // average the last 3 finalized epochs (MEV is spiky per-epoch)
const LAMPORTS = 1e9;

// TipDistributionAccount layout (anchor), when merkle_root = Some:
//  8 disc | 32 vote | 32 auth | 1 option-tag | 32 root | 8 max_total_claim | …
//  … 8 max_num_nodes | 8 total_claimed | 8 num_claimed | 8 epoch | 2 commission_bps
const OPT_TAG = 72;
const MAX_TOTAL_CLAIM = 72 + 1 + 32; // 105
const COMMISSION_BPS = MAX_TOTAL_CLAIM + 8 * 4 + 8; // 145

function rpcUrl(): string {
  return (
    process.env.SOLANA_RPC_URL ||
    process.env.HELIUS_RPC_URL ||
    "https://api.mainnet-beta.solana.com"
  );
}

async function rpc<T>(method: string, params: unknown[], retries = 2): Promise<T | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(rpcUrl(), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      });
      if (res.ok) return ((await res.json()) as { result?: T }).result ?? null;
    } catch {
      /* retry */
    }
    if (attempt < retries) await new Promise((r) => setTimeout(r, 400 * 2 ** attempt));
  }
  return null;
}

function chunk<T>(a: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n));
  return out;
}

function tdaAddress(vote: PublicKey, epoch: number): string {
  const eb = Buffer.alloc(8);
  eb.writeBigUInt64LE(BigInt(epoch));
  return PublicKey.findProgramAddressSync([SEED, vote.toBuffer(), eb], PROGRAM)[0].toBase58();
}

/** Staker tips (SOL) for a TDA, or null if no uploaded merkle root. */
function parseStakerTips(buf: Buffer): number | null {
  if (buf.length < COMMISSION_BPS + 2) return null;
  if (buf.readUInt8(OPT_TAG) !== 1) return null; // merkle_root = None (not finalized)
  const total = Number(buf.readBigUInt64LE(MAX_TOTAL_CLAIM));
  const commissionBps = buf.readUInt16LE(COMMISSION_BPS);
  const stakerShare = total * (1 - Math.min(commissionBps, 10000) / 10000);
  return stakerShare / LAMPORTS;
}

export interface JitoTipsResult {
  ok: boolean;
  /** vote account -> real staker MEV APY (percent). */
  mevApyByVote: Map<string, number>;
  note: string;
}

export async function fetchJitoTips(
  votes: string[],
  stakewiz: StakewizResult,
): Promise<JitoTipsResult> {
  const empty = new Map<string, number>();
  const epochInfo = await rpc<{ epoch: number }>("getEpochInfo", []);
  const cur = epochInfo?.epoch;
  if (!cur) return { ok: false, mevApyByVote: empty, note: "no epoch info" };

  // Last N finalized epochs (current-1's root usually isn't uploaded yet).
  const epochs = Array.from({ length: N_EPOCHS }, (_, i) => cur - 2 - i);

  const votePks: PublicKey[] = [];
  for (const v of votes) {
    try {
      votePks.push(new PublicKey(v));
    } catch {
      /* skip malformed */
    }
  }

  // (vote, tda) jobs across all epochs.
  const jobs: { vote: string; tda: string }[] = [];
  for (const vpk of votePks) {
    const vote = vpk.toBase58();
    for (const e of epochs) jobs.push({ vote, tda: tdaAddress(vpk, e) });
  }

  // vote -> summed staker tips (SOL) + count of epochs with data.
  const acc = new Map<string, { sum: number; n: number }>();
  const groups = chunk(jobs, 100);
  let cursor = 0;
  async function worker(): Promise<void> {
    while (cursor < groups.length) {
      const g = groups[cursor++]!;
      const resp = await rpc<{ value: ({ data?: [string, string] } | null)[] }>(
        "getMultipleAccounts",
        [g.map((j) => j.tda), { encoding: "base64" }],
      );
      const vals = resp?.value ?? [];
      g.forEach((j, i) => {
        const d = vals[i]?.data?.[0];
        if (!d) return;
        const tips = parseStakerTips(Buffer.from(d, "base64"));
        if (tips === null) return;
        const cur2 = acc.get(j.vote) ?? { sum: 0, n: 0 };
        cur2.sum += tips;
        cur2.n += 1;
        acc.set(j.vote, cur2);
      });
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, groups.length) }, worker));

  const mevApyByVote = new Map<string, number>();
  for (const [vote, { sum, n }] of acc) {
    const stake = stakewiz.byVoteIdentity.get(vote)?.activatedStake;
    if (!stake || stake <= 0 || n === 0) continue;
    const apy = (sum / n / stake) * EPOCHS_PER_YEAR * 100;
    if (apy > 0 && apy < 5) mevApyByVote.set(vote, Math.round(apy * 1000) / 1000);
  }

  return {
    ok: mevApyByVote.size > 0,
    mevApyByVote,
    note: `${mevApyByVote.size} validators, epochs ${epochs.join("/")}`,
  };
}
