// Read multi-validator pools' on-chain validator list via a Solana RPC, to
// resolve which validators each LST delegates to (and how much) for the
// decentralization score.
//
// Standard SPL stake-pool (and SanctumSplMulti fork) ValidatorList layout:
//   [0]   account_type   u8   (2 = ValidatorList)
//   [1]   max_validators u32 LE
//   [5]   count          u32 LE
//   [9..] ValidatorStakeInfo[count], 73 bytes each:
//         active_stake_lamports u64 LE @ +0
//         ...                       (transient/epoch/seeds/status = 41 bytes)
//         vote_account_address  Pubkey @ +41 (32 bytes)
//
// RPC defaults to the free public endpoint (rate-limited but fine for ~33 pools);
// override with SOLANA_RPC_URL / HELIUS_RPC_URL. Never throws.

import bs58 from "bs58";

const DEFAULT_RPC = "https://api.mainnet-beta.solana.com";
const ITEM_SIZE = 73;
const VOTE_OFFSET = 41;
const ACCOUNT_TYPE_VALIDATOR_LIST = 2;
const LAMPORTS_PER_SOL = 1e9;

/** Pool programs whose validator list uses the standard SPL layout. */
const SUPPORTED_PROGRAMS = new Set(["Spl", "SanctumSplMulti"]);

export interface RpcValidator {
  voteIdentity: string;
  activatedStake: number; // SOL
}

export interface PoolRef {
  mint: string;
  validatorList: string | null;
  program: string | null;
}

export interface ValidatorListsResult {
  ok: boolean;
  byMint: Map<string, RpcValidator[]>;
  note: string;
}

async function postRpc(
  rpcUrl: string,
  pubkey: string,
  timeoutMs = 30000,
  retries = 2,
): Promise<Buffer | null> {
  const body = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "getAccountInfo",
    params: [pubkey, { encoding: "base64" }],
  });
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(rpcUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
        signal: controller.signal,
      });
      if (res.status === 429 || res.status >= 500) {
        // rate-limited / transient — back off and retry
      } else if (!res.ok) {
        return null;
      } else {
        const json = (await res.json()) as {
          result?: { value?: { data?: [string, string] } };
        };
        const b64 = json.result?.value?.data?.[0];
        return b64 ? Buffer.from(b64, "base64") : null;
      }
    } catch {
      /* timeout/network — retry */
    } finally {
      clearTimeout(timer);
    }
    if (attempt < retries) await sleep(400 * 2 ** attempt);
  }
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function parseValidatorList(buf: Buffer): RpcValidator[] {
  if (buf.length < 9) return [];
  if (buf.readUInt8(0) !== ACCOUNT_TYPE_VALIDATOR_LIST) return [];
  const count = buf.readUInt32LE(5);
  const out: RpcValidator[] = [];
  for (let i = 0; i < count; i++) {
    const off = 9 + i * ITEM_SIZE;
    if (off + ITEM_SIZE > buf.length) break;
    const active = Number(buf.readBigUInt64LE(off)) / LAMPORTS_PER_SOL;
    if (active <= 0) continue; // skip transient-only / empty slots
    const vote = bs58.encode(buf.subarray(off + VOTE_OFFSET, off + VOTE_OFFSET + 32));
    out.push({ voteIdentity: vote, activatedStake: active });
  }
  return out;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await fn(items[i]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export async function fetchValidatorSets(
  pools: PoolRef[],
  rpcUrl: string = process.env.SOLANA_RPC_URL || process.env.HELIUS_RPC_URL || DEFAULT_RPC,
): Promise<ValidatorListsResult> {
  const targets = pools.filter(
    (p) => p.validatorList && p.program && SUPPORTED_PROGRAMS.has(p.program),
  );
  const byMint = new Map<string, RpcValidator[]>();
  if (targets.length === 0) return { ok: true, byMint, note: "no multi-validator pools" };

  // Public RPC rate-limits hard; keep concurrency low.
  await mapLimit(targets, 3, async (p) => {
    const buf = await postRpc(rpcUrl, p.validatorList as string);
    if (!buf) return;
    const validators = parseValidatorList(buf);
    if (validators.length > 0) byMint.set(p.mint, validators);
  });

  return {
    ok: byMint.size > 0,
    byMint,
    note: `${byMint.size}/${targets.length} validator lists resolved`,
  };
}
