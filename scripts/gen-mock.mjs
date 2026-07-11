// Dev-only: generate a realistic MOCK dataset for building/verifying the web UI
// without a live SANCTUM_API_KEY. Output -> web/public/data/latest.json
// (gitignored). Shapes match shared/schema.ts. Numbers are plausible, not real.
//
// Usage: node scripts/gen-mock.mjs
// Replace with real data by running `pnpm pipeline` then `pnpm prepare-web-data`.

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const OUT_DIR = path.join(ROOT, "web/public/data");
const NETWORK_BASE = 6.5;

// symbol, name, type, issuer, tvlSol, holders, feePct, rate, realized, advertised, audits, launch, dec
// dec: [validatorCount, stakeConcentration, avgValidatorRank, grade] or null
const rows = [
  ["jitoSOL", "Jito Staked SOL", "multi-validator", "Jito", 14832190.44, 128400, 0.0, 1.1834, 8.31, 8.55, 3, "2022-10-11", [214, 0.031, 118, "A"]],
  ["INF", "Sanctum Infinity", "lst-of-lsts", "Sanctum", 2214870.12, 21500, 0.0, 1.2051, 8.02, 8.9, 2, "2023-08-01", null],
  ["mSOL", "Marinade Staked SOL", "multi-validator", "Marinade", 6120340.9, 89200, 0.06, 1.2599, 7.64, 7.8, 4, "2021-08-02", [102, 0.048, 96, "A"]],
  ["bSOL", "BlazeStake Staked SOL", "multi-validator", "BlazeStake", 980120.33, 15400, 0.0, 1.1402, 7.41, 8.6, 1, "2022-11-15", [78, 0.072, 140, "B"]],
  ["JupSOL", "Jupiter Staked SOL", "single-validator", "Jupiter", 5230990.71, 44100, 0.0, 1.0899, 8.72, 8.9, 2, "2024-04-01", [2, 0.51, 22, "D"]],
  ["hSOL", "Helius Staked SOL", "single-validator", "Helius", 610220.5, 9200, 0.0, 1.045, 8.05, 8.2, 1, "2024-02-20", [1, 1.0, 40, "F"]],
  ["bonkSOL", "bonkSOL", "single-validator", "Bonk", 210110.18, 6100, 0.0, 1.0388, 7.55, 9.4, 0, "2023-12-10", [1, 1.0, 55, "F"]],
  ["dSOL", "Drift Staked SOL", "multi-validator", "Drift", 720450.6, 11800, 0.0, 1.0611, 7.88, 8.0, 1, "2024-01-18", [44, 0.09, 130, "B"]],
  ["vSOL", "The Vault SOL", "single-validator", "The Vault", 305980.24, 5400, 0.05, 1.0723, 7.22, 8.8, 0, "2023-06-05", [6, 0.28, 88, "C"]],
  ["picoSOL", "picoSOL", "single-validator", "Pico", 142300.09, 3300, 0.0, 1.051, 7.1, 7.9, 0, "2023-09-22", [3, 0.4, 70, "C"]],
  ["hubSOL", "SolBlaze hubSOL", "multi-validator", "SolBlaze", 188220.4, 4200, 0.0, 1.0344, 8.44, 8.5, 1, "2024-03-11", [51, 0.11, 150, "B"]],
  ["compassSOL", "Compass SOL", "single-validator", "Solana Compass", 133410.77, 2900, 0.03, 1.0299, 8.9, 10.1, 0, "2024-05-02", [4, 0.33, 65, "C"]],
  ["rkuSOL", "Rakurai SOL", "blockspace-yield", "Rakurai", 42110.5, 900, 0.0, 1.0088, 6.9, 7.2, 0, "2025-06-01", [1, 1.0, 30, "F"]],
];

function round3(v) {
  return Math.round(v * 1000) / 1000;
}

function yieldSplit(realized, feePct) {
  const base = Math.min(Math.max(NETWORK_BASE - feePct, 0), Math.max(realized, 0));
  return {
    baseStakingApy: round3(base),
    mevApy: null,
    otherApy: round3(Math.max(realized - base, 0)),
    blockspaceApy: null,
    isEstimate: true,
  };
}

function decentralization(dec) {
  if (!dec) {
    return { validatorCount: null, stakeConcentration: null, avgValidatorRank: null, grade: null, isEstimate: true };
  }
  const [validatorCount, stakeConcentration, avgValidatorRank, grade] = dec;
  return { validatorCount, stakeConcentration, avgValidatorRank, grade, isEstimate: true };
}

function lst(r) {
  const [symbol, name, type, issuer, tvlSol, holders, feePct, rate, realized, advertised, audits, launch, dec] = r;
  return {
    symbol, mint: `MOCKmint${symbol}`, name, logoUri: null, type, issuer,
    tvlSol, holders, feePct, exchangeRate: rate,
    advertisedApy: advertised, realizedApy: realized, apyGap: round3(advertised - realized),
    yieldSplit: yieldSplit(realized, feePct),
    decentralization: decentralization(dec),
    deployment: null, exitCost: null,
    auditCount: audits, launchDate: launch,
  };
}

const dataset = { updatedAt: new Date().toISOString(), epoch: 812, lsts: rows.map(lst) };

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(path.join(OUT_DIR, "latest.json"), JSON.stringify(dataset, null, 2) + "\n");
console.log(`wrote ${dataset.lsts.length} mock LSTs -> web/public/data/latest.json`);
