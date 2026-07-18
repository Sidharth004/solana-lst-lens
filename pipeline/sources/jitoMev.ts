// Jito MEV — a per-LST MEV yield estimate.
//
// Jito's per-validator mev_rewards aren't exposed (all 0 in the API), but two
// things are, keyless:
//   - the NETWORK MEV rate: mev_reward_per_lamport (per epoch) from /mev_rewards
//   - which validators run Jito: running_jito from /validators
//
// So we estimate an LST's MEV as: networkMevApy × (the LST's stake fraction that
// sits with Jito-running validators). A Jito-heavy set earns more MEV than one on
// non-Jito validators. It's a labeled estimate; the validator-set join happens in
// run.ts where each pool's set is known.

import { fetchJson } from "../lib/fetchJson.js";

const KOBE = "https://kobe.mainnet.jito.network/api/v1";
const EPOCHS_PER_YEAR = 365 / 2.5;
// Kobe blocks requests without a browser-like User-Agent.
const UA = { "user-agent": "Mozilla/5.0 (compatible; lst-lens/1.0)" };

interface MevRewardsResp {
  epoch?: number;
  mev_reward_per_lamport?: number; // MEV lamports earned per staked lamport, per epoch
}
interface KobeValidator {
  vote_account?: string;
  running_jito?: boolean;
}

export interface JitoMevResult {
  ok: boolean;
  /** Annualized network MEV yield (percent) for fully-Jito stake. */
  networkMevApy: number | null;
  /** Vote accounts currently running Jito. */
  jitoVoteAccounts: Set<string>;
  note: string;
}

export async function fetchJitoMev(): Promise<JitoMevResult> {
  const [rewards, validatorsResp] = await Promise.all([
    fetchJson<MevRewardsResp>(`${KOBE}/mev_rewards`, { label: "jito /mev_rewards", timeoutMs: 25000, headers: UA }),
    fetchJson<{ validators?: KobeValidator[] } | KobeValidator[]>(`${KOBE}/validators`, {
      label: "jito /validators",
      timeoutMs: 30000,
      headers: UA,
    }),
  ]);

  const perLamport = rewards?.mev_reward_per_lamport;
  const networkMevApy =
    typeof perLamport === "number" && Number.isFinite(perLamport) && perLamport > 0
      ? perLamport * EPOCHS_PER_YEAR * 100
      : null;

  // Kobe wraps the list as { validators: [...] }; tolerate a bare array too.
  const validators = Array.isArray(validatorsResp)
    ? validatorsResp
    : (validatorsResp?.validators ?? []);
  const jitoVoteAccounts = new Set<string>();
  for (const v of validators) {
    if (v.running_jito && v.vote_account) jitoVoteAccounts.add(v.vote_account);
  }

  return {
    ok: networkMevApy !== null && jitoVoteAccounts.size > 0,
    networkMevApy: networkMevApy !== null ? Math.round(networkMevApy * 1000) / 1000 : null,
    jitoVoteAccounts,
    note:
      networkMevApy !== null
        ? `netMevApy≈${networkMevApy.toFixed(3)}%, ${jitoVoteAccounts.size} jito validators`
        : "unavailable",
  };
}
