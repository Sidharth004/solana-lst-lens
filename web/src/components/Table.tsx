// Sortable LST table. Column headers toggle the sort; row order is purely a
// function of the active sort. No token is ever pinned or highlighted.
// Clicking a row expands a detail panel (RowDetail).

import { Fragment, useState } from "react";
import type { Lst } from "@shared/schema";
import { LST_TYPE_LABELS } from "@shared/schema";
import type { SortKey, SortState } from "../lib/sort";
import { fmtPct, fmtInt, fmtSol } from "../lib/format";
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
  { key: "realizedApy", label: "Realized", align: "right", hint: "APY actually delivered, from the on-chain exchange rate" },
  { key: "apyGap", label: "Gap", align: "right", hint: "Advertised − realized. Amber above 0.5 points." },
  { key: "realizedApy", label: "Yield split", align: "left", hint: "Estimated base / MEV / other split (modeled)" },
  { key: "tvlSol", label: "TVL", align: "right" },
  { key: "holders", label: "Holders", align: "right" },
  { key: "feePct", label: "Fee", align: "right" },
  { key: "type", label: "Score", align: "right", hint: "Our editorial decentralization index (A–F)" },
];

interface Props {
  lsts: Lst[];
  sort: SortState;
  onSort: (key: SortKey) => void;
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

export function Table({ lsts, sort, onSort }: Props) {
  // The Yield-split and Score columns aren't independently sortable; they share
  // a sort key with a numeric column but render custom cells.
  // Expansion is keyed by symbol so a row is deep-linkable via #lst=SYMBOL.
  const [expanded, setExpanded] = useState<string | null>(initialExpanded);

  function toggle(symbol: string) {
    setExpanded((cur) => {
      const next = cur === symbol ? null : symbol;
      if (typeof window !== "undefined") {
        history.replaceState(null, "", next ? `#lst=${encodeURIComponent(next)}` : " ");
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
              {COLUMNS.map((col, i) => {
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
                        </span>
                        <span className="lst-name">{lst.name}</span>
                      </div>
                    </td>
                    <td className="col-left">
                      <span className={`type-badge type-${lst.type}`}>{LST_TYPE_LABELS[lst.type]}</span>
                    </td>
                    <td className="col-right num">{fmtPct(lst.advertisedApy)}</td>
                    <td className="col-right num strong">{fmtPct(lst.realizedApy)}</td>
                    <td className="col-right">
                      <ApyGap gap={lst.apyGap} />
                    </td>
                    <td className="col-left yield-col">
                      <YieldBar lst={lst} />
                    </td>
                    <td className="col-right num">{fmtSol(lst.tvlSol)}</td>
                    <td className="col-right num">{fmtInt(lst.holders)}</td>
                    <td className="col-right num">{fmtPct(lst.feePct)}</td>
                    <td className="col-right">
                      <ScoreBadge grade={lst.decentralization.grade} />
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="detail-row">
                      <td colSpan={COLUMNS.length}>
                        <RowDetail lst={lst} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {lsts.length === 0 && (
              <tr>
                <td className="empty" colSpan={COLUMNS.length}>
                  No LSTs to show.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <YieldLegend />
    </>
  );
}

export { COLUMNS };
export type { Column };
