// Loads the dataset the pipeline produces. Typed via the single source-of-truth
// schema so the web app and pipeline can never drift.
//
// At build time, data/latest.json is copied into web/public/data/latest.json
// (see the `predev`/build step in README). We fetch it at runtime so a data
// refresh doesn't require rebuilding the app.

import type { ApySnapshot, Dataset, ExchangeRateSnapshot } from "@shared/schema";
import { EMPTY_HISTORY, type HistoryData } from "./lib/history";

export async function loadDataset(): Promise<Dataset> {
  const res = await fetch(`${import.meta.env.BASE_URL}data/latest.json`, {
    cache: "no-cache",
  });
  if (!res.ok) {
    throw new Error(`Failed to load dataset: HTTP ${res.status}`);
  }
  return (await res.json()) as Dataset;
}

async function loadJsonArray<T>(path: string): Promise<T[]> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}${path}`, { cache: "no-cache" });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? (data as T[]) : [];
  } catch {
    return [];
  }
}

/** Load the append-only history series. Missing files degrade to empty (charts hide). */
export async function loadHistory(): Promise<HistoryData> {
  const [exchangeRates, apy] = await Promise.all([
    loadJsonArray<ExchangeRateSnapshot>("data/history/exchange-rates.json"),
    loadJsonArray<ApySnapshot>("data/history/apy.json"),
  ]);
  if (exchangeRates.length === 0 && apy.length === 0) return EMPTY_HISTORY;
  return { exchangeRates, apy };
}
