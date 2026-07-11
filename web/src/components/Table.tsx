// Sortable LST table. Column headers toggle the sort; row order is purely a
// function of the active sort. No token is ever pinned or highlighted.

import type { Lst } from "@shared/schema";
import { LST_TYPE_LABELS } from "@shared/schema";
import type { SortKey, SortState } from "../lib/sort";
import { fmtPct, fmtInt, fmtSol } from "../lib/format";
import { ApyGap } from "./ApyGap";

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
  { key: "tvlSol", label: "TVL", align: "right" },
  { key: "holders", label: "Holders", align: "right" },
  { key: "feePct", label: "Fee", align: "right" },
];

interface Props {
  lsts: Lst[];
  sort: SortState;
  onSort: (key: SortKey) => void;
}

function SortIndicator({ active, dir }: { active: boolean; dir: "asc" | "desc" }) {
  if (!active) return <span className="sort-ind" aria-hidden />;
  return (
    <span className="sort-ind active" aria-hidden>
      {dir === "asc" ? "▲" : "▼"}
    </span>
  );
}

export function Table({ lsts, sort, onSort }: Props) {
  return (
    <div className="table-wrap">
      <table className="lst-table">
        <thead>
          <tr>
            {COLUMNS.map((col) => {
              const active = sort.key === col.key;
              return (
                <th
                  key={col.key}
                  className={`col-${col.align}${active ? " sorted" : ""}`}
                  aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
                >
                  <button
                    type="button"
                    className="th-btn"
                    onClick={() => onSort(col.key)}
                    title={col.hint}
                  >
                    <span>{col.label}</span>
                    <SortIndicator active={active} dir={sort.dir} />
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {lsts.map((lst) => (
            <tr key={lst.mint}>
              <td className="col-left">
                <div className="lst-cell">
                  <span className="lst-symbol">{lst.symbol}</span>
                  <span className="lst-name">{lst.name}</span>
                </div>
              </td>
              <td className="col-left">
                <span className={`type-badge type-${lst.type}`}>
                  {LST_TYPE_LABELS[lst.type]}
                </span>
              </td>
              <td className="col-right num">{fmtPct(lst.advertisedApy)}</td>
              <td className="col-right num strong">{fmtPct(lst.realizedApy)}</td>
              <td className="col-right">
                <ApyGap gap={lst.apyGap} />
              </td>
              <td className="col-right num">{fmtSol(lst.tvlSol)}</td>
              <td className="col-right num">{fmtInt(lst.holders)}</td>
              <td className="col-right num">{fmtPct(lst.feePct)}</td>
            </tr>
          ))}
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
  );
}

export { COLUMNS };
export type { Column };
