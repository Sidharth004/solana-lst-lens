// Sortable LST table. Column headers toggle the sort; row order is purely a
// function of the active sort. No token is ever pinned or highlighted.
// Clicking a row expands a detail panel (RowDetail).

import { Fragment, useState } from "react";
import type { Lst } from "@shared/schema";
import { LST_TYPE_LABELS } from "@shared/schema";
import type { SortKey, SortState } from "../lib/sort";
import { fmtPct, fmtSol, fmtTrend } from "../lib/format";
import { deriveRiskFlags, highestSeverity, seriesFor, type HistoryData } from "../lib/history";
import { ApyGap } from "./ApyGap";
import { YieldBar, YieldLegend } from "./YieldBar";
import { ScoreBadge } from "./ScoreBadge";
import { RowDetail } from "./RowDetail";

interface Column {
  key: SortKey;
  label: string;
  align: "left" | "right";
  hint?: string;
}

const COLUMNS: Column[] = [
  { key: "symbol", label: "LST", align: "left" },
  { key: "type", label: "Type", align: "left" },
  { key: "advertisedApy", label: "Advertised", align: "right", hint: "The APY the protocol markets" },
  { key: "realizedApy", label: "Realized", align: "right", hint: "APY actually delivered, measured from the on-chain exchange rate. Arrow = 30d trend." },
  { key: "apyGap", label: "Gap", align: "right", hint: "Advertised − realized. Amber above 0.5 points." },
  { key: "netApyAfterExit", label: "Net", align: "right", hint: "Take-home: realized APY minus the exit-cost drag (1000-SOL sample)" },
  { key: "realizedApy", label: "Yield split", align: "left", hint: "Estimated base / MEV / other split (modeled)" },
  { key: "tvlSol", label: "TVL", align: "right" },
  { key: "deployment", label: "Deployed †", align: "right", hint: "LST value sitting in tracked DeFi protocols (in SOL). Double-counting caveat below." },
  { key: "exitCost", label: "Exit", align: "right", hint: "Price impact to swap 1000 SOL-worth out to SOL" },
  { key: "decentralization", label: "Score", align: "right", hint: "Our editorial decentralization index (A–F)" },
];

interface Props {
  lsts: Lst[];
  sort: SortState;
  onSort: (key: SortKey) => void;
  history: HistoryData;
}

function basisTitle(basis: Lst["realizedApyBasis"]): string {
  switch (basis) {
    case "measured":
      return "Measured from the exchange rate over our accumulated history";
    case "recent":
      return "Recent delivered APY (DeFiLlama, ~30d)";
    case "lifetime":
      return "Annualized since launch (used when no recent 30d data is available)";
    default:
      return "No realized-APY data yet — fills in as daily history accrues";
  }
}

function SortIndicator({ active, dir }: { active: boolean; dir: "asc" | "desc" }) {
  return (
    <span className={`sort-ind${active ? " active" : ""}`} aria-hidden>
      {dir === "asc" ? "▲" : "▼"}
    </span>
  );
}

function initialExpanded(): string | null {
  if (typeof window === "undefined") return null;
  const m = /(?:^|#|&)lst=([^&]+)/.exec(window.location.hash);
  return m?.[1] ? decodeURIComponent(m[1]) : null;
}

export function Table({ lsts, sort, onSort, history }: Props) {
  // The Yield-split and Score columns aren't independently sortable; they share
  // a sort key with a numeric column but render custom cells.
  // Expansion is keyed by symbol so a row is deep-linkable via #lst=SYMBOL.
  const [expanded, setExpanded] = useState<string | null>(initialExpanded);

  // Only surface Advertised + Gap when a marketed number is actually curated —
  // no empty headline columns (see data/manual/advertised-apy.json).
  const showAdvertised = lsts.some((l) => l.advertisedApy !== null);
  const columns = showAdvertised
    ? COLUMNS
    : COLUMNS.filter((c) => c.key !== "advertisedApy" && c.key !== "apyGap");

  function toggle(symbol: string) {
    setExpanded((cur) => {
      const next = cur === symbol ? null : symbol;
      if (typeof window !== "undefined") {
        window.history.replaceState(null, "", next ? `#lst=${encodeURIComponent(next)}` : " ");
      }
      return next;
    });
  }

  return (
    <>
      <div className="table-wrap">
        <table className="lst-table">
          <thead>
            <tr>
              {columns.map((col, i) => {
                const active = sort.key === col.key;
                return (
                  <th
                    key={`${col.key}-${i}`}
                    className={`col-${col.align}${active ? " sorted" : ""}`}
                    aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
                  >
                    <button type="button" className="th-btn" onClick={() => onSort(col.key)} title={col.hint}>
                      <span>{col.label}</span>
                      <SortIndicator active={active} dir={sort.dir} />
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {lsts.map((lst) => {
              const isOpen = expanded === lst.symbol;
              const risk = highestSeverity(
                deriveRiskFlags(lst, seriesFor(history.exchangeRates, lst.symbol)),
              );
              return (
                <Fragment key={lst.mint}>
                  <tr
                    className={`data-row${isOpen ? " open" : ""}`}
                    onClick={() => toggle(lst.symbol)}
                    aria-expanded={isOpen}
                  >
                    <td className="col-left">
                      <div className="lst-cell">
                        <span className="lst-symbol">
                          <span className={`caret${isOpen ? " open" : ""}`}>›</span>
                          {lst.symbol}
                          {risk && (
                            <span
                              className={`risk-dot risk-${risk}`}
                              title={risk === "high" ? "Has a high-severity risk flag" : "Has a risk flag"}
                            >
                              ⚠
                            </span>
                          )}
                        </span>
                        <span className="lst-name">{lst.name}</span>
                      </div>
                    </td>
                    <td className="col-left">
                      <span className={`type-badge type-${lst.type}`}>{LST_TYPE_LABELS[lst.type]}</span>
                    </td>
                    {showAdvertised && (
                      <td className="col-right num">{fmtPct(lst.advertisedApy)}</td>
                    )}
                    <td className="col-right num strong">
                      <span className="realized-cell">
                        <span title={basisTitle(lst.realizedApyBasis)}>
                          {fmtPct(lst.realizedApy)}
                          {lst.realizedApyBasis === "lifetime" && (
                            <sup className="basis-mark" title="Annualized since launch (no recent 30d data yet)">
                              L
                            </sup>
                          )}
                        </span>
                        {(() => {
                          const t = fmtTrend(lst.yieldTrend30d);
                          return t.dir === "flat" && lst.yieldTrend30d === null ? null : (
                            <span className={`trend trend-${t.dir}`} title="30-day change in APY">
                              {t.text}
                            </span>
                          );
                        })()}
                      </span>
                    </td>
                    {showAdvertised && (
                      <td className="col-right">
                        <ApyGap gap={lst.apyGap} />
                      </td>
                    )}
                    <td className="col-right num">
                      {lst.exitCost && lst.exitCost.netApyAfterExit !== null ? (
                        fmtPct(lst.exitCost.netApyAfterExit)
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td className="col-left yield-col">
                      <YieldBar lst={lst} />
                    </td>
                    <td className="col-right num">{fmtSol(lst.tvlSol)}</td>
                    <td className="col-right num">
                      {lst.deployment ? fmtSol(lst.deployment.totalDeployed) : <span className="muted">—</span>}
                    </td>
                    <td className="col-right num">
                      {lst.exitCost && lst.exitCost.priceImpactPct !== null ? (
                        fmtPct(lst.exitCost.priceImpactPct, 3)
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td className="col-right">
                      <ScoreBadge grade={lst.decentralization.grade} />
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="detail-row">
                      <td colSpan={columns.length}>
                        <RowDetail lst={lst} history={history} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {lsts.length === 0 && (
              <tr>
                <td className="empty" colSpan={columns.length}>
                  No LSTs to show.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <YieldLegend />
      <p className="table-footnote">
        † Deployment via DeFiLlama. LSTs can be double-counted (once as SOL, once
        as the LST in a lending market), so treat “Deployed” as an upper bound.
        Exit = price impact swapping a 1000-SOL sample out to SOL.
      </p>
    </>
  );
}

export { COLUMNS };
export type { Column };
