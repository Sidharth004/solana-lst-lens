// Jupiter token metadata (keyless) — a "first seen" date and website per LST.
//
// Jupiter's createdAt / firstPool.createdAt is when the token first appeared on
// Jupiter. For LSTs listed since ~2024 that's effectively the launch date
// (rkuSOL -> 2026-05-12, correct); for older tokens it lags the true launch, so
// the UI labels it "First seen", not "Launched". Also yields the project website.
//
// Batched ~40 mints/call via tokens/v2/search?query=mint1,mint2. Never throws.

import { fetchJson } from "../lib/fetchJson.js";

const SEARCH = "https://lite-api.jup.ag/tokens/v2/search";

interface JupToken {
  id?: string; // mint
  website?: string;
  createdAt?: string;
  firstPool?: { createdAt?: string };
}

export interface JupiterMetaInfo {
  firstSeen: string | null; // YYYY-MM-DD
  website: string | null;
}

export interface JupiterMetaResult {
  ok: boolean;
  byMint: Map<string, JupiterMetaInfo>;
  note: string;
}

function chunk<T>(a: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n));
  return out;
}

function toDate(s: string | undefined): string | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function earliest(a: string | null, b: string | null): string | null {
  if (a && b) return a < b ? a : b;
  return a ?? b;
}

export async function fetchJupiterMeta(mints: string[]): Promise<JupiterMetaResult> {
  const byMint = new Map<string, JupiterMetaInfo>();
  for (const group of chunk(mints, 40)) {
    const arr = await fetchJson<JupToken[]>(`${SEARCH}?query=${group.join(",")}`, {
      label: "jupiter tokens/v2/search",
      timeoutMs: 25000,
    });
    if (!Array.isArray(arr)) continue;
    for (const t of arr) {
      if (!t.id) continue;
      byMint.set(t.id, {
        firstSeen: earliest(toDate(t.createdAt), toDate(t.firstPool?.createdAt)),
        website: t.website ?? null,
      });
    }
  }
  return { ok: byMint.size > 0, byMint, note: `${byMint.size}/${mints.length} resolved` };
}
