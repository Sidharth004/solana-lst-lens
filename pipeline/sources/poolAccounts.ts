// Read the protocol fee from each pool's on-chain SPL stake-pool account.
//
// SPL StakePool account layout (account_type = 1). The epoch fee (a fraction of
// staking rewards the manager takes) lives at a fixed offset:
//   epoch_fee.denominator  u64 LE @ 330
//   epoch_fee.numerator    u64 LE @ 338
// feePct = numerator / denominator * 100.
//
// Batched with getMultipleAccounts (100/call). SanctumSpl / SanctumSplMulti / Spl
// share this layout; Marinade/Lido/SPool differ and are skipped. Never throws.

const LAMPORTS = 1e9; // unused here but documents units; kept for clarity
void LAMPORTS;

const SUPPORTED = new Set(["Spl", "SanctumSpl", "SanctumSplMulti"]);
const FEE_DEN_OFFSET = 330;
const FEE_NUM_OFFSET = 338;
const ACCOUNT_TYPE_STAKE_POOL = 1;

export interface PoolRef {
  mint: string;
  poolAddress: string | null;
  program: string | null;
}

export interface PoolFeesResult {
  ok: boolean;
  /** mint -> fee percent (of rewards). */
  feeByMint: Map<string, number>;
  note: string;
}

function rpcUrl(): string {
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

function parseFeePct(buf: Buffer): number | null {
  if (buf.length < FEE_NUM_OFFSET + 8) return null;
  if (buf.readUInt8(0) !== ACCOUNT_TYPE_STAKE_POOL) return null;
  const den = Number(buf.readBigUInt64LE(FEE_DEN_OFFSET));
  const num = Number(buf.readBigUInt64LE(FEE_NUM_OFFSET));
  if (!den || den <= 0) return num === 0 ? 0 : null;
  const pct = (num / den) * 100;
  return Number.isFinite(pct) && pct >= 0 && pct < 100 ? Math.round(pct * 1000) / 1000 : null;
}

async function getMultipleAccounts(addresses: string[]): Promise<(Buffer | null)[]> {
  try {
    const res = await fetch(rpcUrl(), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getMultipleAccounts",
        params: [addresses, { encoding: "base64" }],
      }),
    });
    if (!res.ok) return addresses.map(() => null);
    const json = (await res.json()) as {
      result?: { value?: ({ data?: [string, string] } | null)[] };
    };
    const vals = json.result?.value ?? [];
    return addresses.map((_, i) => {
      const d = vals[i]?.data?.[0];
      return d ? Buffer.from(d, "base64") : null;
    });
  } catch {
    return addresses.map(() => null);
  }
}

export async function fetchPoolFees(pools: PoolRef[]): Promise<PoolFeesResult> {
  const targets = pools.filter(
    (p) => p.poolAddress && p.program && SUPPORTED.has(p.program),
  );
  const feeByMint = new Map<string, number>();
  if (targets.length === 0) return { ok: true, feeByMint, note: "no SPL pools" };

  for (const group of chunk(targets, 100)) {
    const bufs = await getMultipleAccounts(group.map((p) => p.poolAddress as string));
    group.forEach((p, i) => {
      const buf = bufs[i];
      if (!buf) return;
      const fee = parseFeePct(buf);
      if (fee !== null) feeByMint.set(p.mint, fee);
    });
  }

  return {
    ok: feeByMint.size > 0,
    feeByMint,
    note: `${feeByMint.size}/${targets.length} pool fees`,
  };
}
