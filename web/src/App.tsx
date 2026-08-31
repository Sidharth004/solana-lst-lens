import { useEffect, useMemo, useState } from "react";
import type { Dataset } from "@shared/schema";
import { loadDataset, loadHistory } from "./data";
import { EMPTY_HISTORY, type HistoryData } from "./lib/history";
import {
  sortLsts,
  SORT_PRESETS,
  presetIdFor,
  type Intent,
  type SortKey,
  type SortState,
} from "./lib/sort";
import { fmtDate, fmtRelative } from "./lib/format";
import { getHashParam, setHashParam } from "./lib/hash";
import { MetricCards } from "./components/MetricCards";
import { IntentRouter } from "./components/IntentRouter";
import { Table } from "./components/Table";
import { CompareTray } from "./components/CompareTray";

// Neutral default: largest pools first. Sort — not a hard-coded pin — decides order.
const DEFAULT_SORT: SortState = { key: "tvlSol", dir: "desc" };

// Beyond four columns the comparison stops being readable on a laptop.
const MAX_COMPARE = 4;
const COMPARE_KEY = "lst-lens:compare";

/**
 * Pinned symbols come from the URL first so a shared comparison link opens the
 * comparison the sender saw, and fall back to whatever this browser had pinned.
 */
function loadCompare(): string[] {
  if (typeof window === "undefined") return [];
  const fromUrl = getHashParam("compare");
  if (fromUrl) return fromUrl.split(",").filter(Boolean).slice(0, MAX_COMPARE);
  try {
    const raw = window.localStorage.getItem(COMPARE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === "string") : [];
  } catch {
    return []; // a corrupt or blocked store just means no pins
  }
}

export default function App() {
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [history, setHistory] = useState<HistoryData>(EMPTY_HISTORY);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<SortState>(DEFAULT_SORT);
  const [query, setQuery] = useState("");
  // Rows with no realized APY are still real LSTs, so they stay visible by
  // default — the toggle is for readers who only want measured rows.
  const [hideNoData, setHideNoData] = useState(false);
  const [compare, setCompare] = useState<string[]>(loadCompare);
  // Captured once, before the effect below rewrites the hash from state.
  const [sharedCompare] = useState(() => getHashParam("compare") !== null);

  useEffect(() => {
    loadDataset()
      .then(setDataset)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
    loadHistory().then(setHistory).catch(() => setHistory(EMPTY_HISTORY));
  }, []);

  useEffect(() => {
    setHashParam("compare", compare.length > 0 ? compare.join(",") : null);
    try {
      window.localStorage.setItem(COMPARE_KEY, JSON.stringify(compare));
    } catch {
      /* storage blocked (private mode) — pins just won't survive a reload */
    }
  }, [compare]);

  const sorted = useMemo(
    () => (dataset ? sortLsts(dataset.lsts, sort) : []),
    [dataset, sort],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = hideNoData ? sorted.filter((l) => l.realizedApy !== null) : sorted;
    if (!q) return base;
    return base.filter(
      (l) =>
        l.symbol.toLowerCase().includes(q) ||
        l.name.toLowerCase().includes(q) ||
        (l.issuer ?? "").toLowerCase().includes(q),
    );
  }, [sorted, query, hideNoData]);

  const noDataCount = useMemo(
    () => sorted.filter((l) => l.realizedApy === null).length,
    [sorted],
  );

  // Pinned LSTs in pin order, dropping any symbol no longer in the dataset.
  const compared = useMemo(() => {
    if (!dataset) return [];
    const bySymbol = new Map(dataset.lsts.map((l) => [l.symbol, l]));
    return compare.map((s) => bySymbol.get(s)).filter((l): l is NonNullable<typeof l> => !!l);
  }, [dataset, compare]);

  const compareSet = useMemo(() => new Set(compare), [compare]);

  function toggleCompare(symbol: string) {
    setCompare((cur) =>
      cur.includes(symbol)
        ? cur.filter((s) => s !== symbol)
        : cur.length >= MAX_COMPARE
          ? cur // at the limit: unpin something first rather than silently evicting
          : [...cur, symbol],
    );
  }

  function handleSort(key: SortKey) {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: defaultDirFor(key) },
    );
  }

  function handleIntent(intent: Intent) {
    setSort(intent.sort);
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="wrap">
          <div className="brand">
            <h1>Solana LST Comparison</h1>
            <p className="tagline">
              Advertised vs realized yield, decentralization, and DeFi deployment —
              measured, not marketed.
            </p>
          </div>
          {dataset && (
            <div className="updated" title={`Last pipeline run: ${fmtDate(dataset.updatedAt)}`}>
              <span className="updated-dot" />
              Updated {fmtRelative(dataset.updatedAt)}
              {dataset.epoch !== null && <> · epoch {dataset.epoch}</>}
            </div>
          )}
        </div>
      </header>

      <main className="wrap app-main">
        {error && (
          <div className="notice error">
            Couldn’t load data: {error}. Make sure{" "}
            <code>web/public/data/latest.json</code> exists (run the pipeline and
            copy it, or the mock generator).
          </div>
        )}

        {!error && !dataset && <div className="notice">Loading…</div>}

        {dataset && (
          <>
            <MetricCards lsts={dataset.lsts} native={dataset.nativeStaking} />
            <div className="controls">
              <IntentRouter activeSort={sort} onPick={handleIntent} />
              <div className="sort-by">
                <label className="sort-by-label" htmlFor="sort-select">
                  Sort by
                </label>
                <select
                  id="sort-select"
                  className="sort-select"
                  value={presetIdFor(sort)}
                  onChange={(e) => {
                    const preset = SORT_PRESETS.find((p) => p.id === e.target.value);
                    if (preset) setSort(preset.sort);
                  }}
                >
                  {presetIdFor(sort) === "" && (
                    <option value="">Custom (column)…</option>
                  )}
                  {SORT_PRESETS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="search">
                <input
                  type="search"
                  className="search-input"
                  placeholder="Search LST…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  aria-label="Search LSTs by symbol, name, or issuer"
                />
                {query && (
                  <span className="search-count">
                    {visible.length} of {dataset.lsts.length}
                  </span>
                )}
              </div>
              {noDataCount > 0 && (
                <label className="toggle" title="Hide LSTs we have no measured realized APY for yet">
                  <input
                    type="checkbox"
                    checked={hideNoData}
                    onChange={(e) => setHideNoData(e.target.checked)}
                  />
                  Hide {noDataCount} without yield data
                </label>
              )}
            </div>
            <Table
              lsts={visible}
              sort={sort}
              onSort={handleSort}
              history={history}
              native={dataset.nativeStaking}
              compare={compareSet}
              onToggleCompare={toggleCompare}
            />
            <footer className="app-footer">
              <p>
                Realized APY is measured from each LST’s on-chain exchange rate.
                Advertised APY is the protocol’s marketed number (or its most
                flattering recent epoch). Order is set by the active sort — no
                token is pinned or promoted.
              </p>
            </footer>
          </>
        )}
      </main>

      {dataset && (
        <CompareTray
          lsts={compared}
          native={dataset.nativeStaking}
          history={history}
          onRemove={toggleCompare}
          onClear={() => setCompare([])}
          defaultOpen={sharedCompare}
        />
      )}
    </div>
  );
}

// Sensible first-click direction per column (higher-is-first for magnitudes).
function defaultDirFor(key: SortKey): "asc" | "desc" {
  switch (key) {
    case "symbol":
    case "type":
    case "feePct":
    case "apyGap":
      return "asc";
    default:
      return "desc";
  }
}
