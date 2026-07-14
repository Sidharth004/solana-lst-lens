import { useEffect, useMemo, useState } from "react";
import type { Dataset } from "@shared/schema";
import { loadDataset, loadHistory } from "./data";
import { EMPTY_HISTORY, type HistoryData } from "./lib/history";
import { sortLsts, type Intent, type SortKey, type SortState } from "./lib/sort";
import { fmtDate } from "./lib/format";
import { MetricCards } from "./components/MetricCards";
import { IntentRouter } from "./components/IntentRouter";
import { Table } from "./components/Table";

// Neutral default: largest pools first. Sort — not a hard-coded pin — decides order.
const DEFAULT_SORT: SortState = { key: "tvlSol", dir: "desc" };

export default function App() {
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [history, setHistory] = useState<HistoryData>(EMPTY_HISTORY);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<SortState>(DEFAULT_SORT);
  const [query, setQuery] = useState("");

  useEffect(() => {
    loadDataset()
      .then(setDataset)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
    loadHistory().then(setHistory).catch(() => setHistory(EMPTY_HISTORY));
  }, []);

  const sorted = useMemo(
    () => (dataset ? sortLsts(dataset.lsts, sort) : []),
    [dataset, sort],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter(
      (l) =>
        l.symbol.toLowerCase().includes(q) ||
        l.name.toLowerCase().includes(q) ||
        (l.issuer ?? "").toLowerCase().includes(q),
    );
  }, [sorted, query]);

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
            <div className="updated">
              <span className="updated-dot" />
              Updated {fmtDate(dataset.updatedAt)}
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
            <MetricCards lsts={dataset.lsts} />
            <div className="controls">
              <IntentRouter activeSort={sort} onPick={handleIntent} />
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
            </div>
            <Table lsts={visible} sort={sort} onSort={handleSort} history={history} />
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
