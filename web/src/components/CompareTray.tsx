// Side-by-side comparison of pinned LSTs.
//
// The table sorts by one metric at a time, but choosing an LST means trading
// metrics off against each other — and the two candidates are usually forty
// rows apart. Starring rows collects them here; the panel puts every metric we
// measure next to each other, with the best value in each row marked.
//
// "Best" is only marked where better/worse is unambiguous (higher yield, lower
// exit cost). It is never marked when values tie, and rows where the answer is
// a matter of preference (type, issuer) carry no marker at all.

import { useState, type ReactNode } from "react";
import type { Lst, NativeStaking } from "@shared/schema";
import { LST_TYPE_LABELS } from "@shared/schema";
import { fmtDate, fmtInt, fmtPct, fmtSol } from "../lib/format";
import { fmtPoints, vsNative } from "../lib/native";
import { deriveRiskFlags, seriesFor, type HistoryData } from "../lib/history";
import { ScoreBadge } from "./ScoreBadge";

interface Props {
  lsts: Lst[]; // the pinned LSTs, in pin order
  native?: NativeStaking | null;
  history: HistoryData;
  onRemove: (symbol: string) => void;
  onClear: () => void;
  /** Open the panel straight away — a shared link should land on the comparison. */
  defaultOpen?: boolean;
}

type Direction = "higher" | "lower" | "none";

interface Row {
  label: string;
  /** Numeric value used to pick the best cell; null when not comparable. */
  value: (l: Lst) => number | null;
  /** What the reader sees. */
  render: (l: Lst) => ReactNode;
  better: Direction;
  hint?: string;
}

const GRADE_RANK: Record<string, number> = { A: 5, B: 4, C: 3, D: 2, F: 1 };

function buildRows(native: NativeStaking | null | undefined, history: HistoryData): Row[] {
  return [
    {
      label: "Realized APY",
      value: (l) => l.realizedApy,
      render: (l) => fmtPct(l.realizedApy),
      better: "higher",
      hint: "Measured from the on-chain exchange rate, not the marketed number",
    },
    {
      label: "vs native staking",
      value: (l) => vsNative(l, native),
      render: (l) => fmtPoints(vsNative(l, native)),
      better: "higher",
      hint: "Realized APY minus what you'd earn delegating SOL directly",
    },
    {
      label: "Net after exit",
      value: (l) => l.exitCost?.netApyAfterExit ?? null,
      render: (l) => fmtPct(l.exitCost?.netApyAfterExit),
      better: "higher",
      hint: "Realized APY minus the price impact of swapping back to SOL",
    },
    {
      label: "Base staking",
      value: (l) => l.yieldSplit.baseStakingApy,
      render: (l) => fmtPct(l.yieldSplit.baseStakingApy),
      better: "none",
    },
    {
      label: "MEV",
      value: (l) => l.yieldSplit.mevApy,
      render: (l) => fmtPct(l.yieldSplit.mevApy),
      better: "higher",
    },
    {
      label: "Protocol fee",
      value: (l) => l.feePct,
      render: (l) => fmtPct(l.feePct),
      better: "lower",
      hint: "Manager fee as a % of staking rewards",
    },
    {
      label: "Exit price impact",
      value: (l) => l.exitCost?.priceImpactPct ?? null,
      render: (l) =>
        l.exitCost?.priceImpactPct != null ? fmtPct(l.exitCost.priceImpactPct, 3) : "—",
      better: "lower",
      hint: "Swapping a 1000-SOL position back to SOL",
    },
    {
      label: "Decentralization",
      value: (l) => (l.decentralization.grade ? GRADE_RANK[l.decentralization.grade]! : null),
      render: (l) => <ScoreBadge grade={l.decentralization.grade} />,
      better: "higher",
    },
    {
      label: "Validators",
      value: (l) => l.decentralization.validatorCount,
      render: (l) => fmtInt(l.decentralization.validatorCount),
      better: "higher",
    },
    {
      label: "Stake concentration",
      value: (l) => l.decentralization.stakeConcentration,
      render: (l) =>
        l.decentralization.stakeConcentration === null
          ? "—"
          : l.decentralization.stakeConcentration.toFixed(3),
      better: "lower",
      hint: "Herfindahl index across the pool's validator set (0 spread → 1 concentrated)",
    },
    {
      label: "TVL",
      value: (l) => l.tvlSol,
      render: (l) => fmtSol(l.tvlSol),
      better: "none",
    },
    {
      label: "Deployed in DeFi",
      value: (l) => l.deployment?.totalDeployed ?? null,
      render: (l) => (l.deployment ? fmtSol(l.deployment.totalDeployed) : "—"),
      better: "none",
    },
    {
      label: "Risk flags",
      value: (l) => deriveRiskFlags(l, seriesFor(history.exchangeRates, l.symbol)).length,
      render: (l) => {
        const flags = deriveRiskFlags(l, seriesFor(history.exchangeRates, l.symbol));
        return flags.length === 0 ? "None" : flags.map((f) => f.label).join(", ");
      },
      better: "lower",
    },
    {
      label: "Type",
      value: () => null,
      render: (l) => LST_TYPE_LABELS[l.type],
      better: "none",
    },
    {
      label: "Issuer",
      value: () => null,
      render: (l) => l.issuer ?? "—",
      better: "none",
    },
    {
      label: "First seen",
      value: () => null,
      render: (l) => fmtDate(l.launchDate),
      better: "none",
    },
  ];
}

/** Index of the single best cell in a row, or null when it's a tie or not comparable. */
function bestIndex(values: (number | null)[], better: Direction): number | null {
  if (better === "none") return null;
  const present = values.filter((v): v is number => v !== null);
  if (present.length < 2) return null;
  const target = better === "higher" ? Math.max(...present) : Math.min(...present);
  const winners = values.filter((v) => v === target).length;
  if (winners !== 1) return null; // a tie has no winner
  return values.findIndex((v) => v === target);
}

export function CompareTray({
  lsts,
  native,
  history,
  onRemove,
  onClear,
  defaultOpen = false,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);
  if (lsts.length === 0) return null;

  const rows = buildRows(native, history);

  return (
    <div className="compare-tray">
      {open && (
        <div className="compare-panel">
          <div className="compare-scroll">
            <table className="compare-table">
              <thead>
                <tr>
                  <th className="col-left">Metric</th>
                  {lsts.map((l) => (
                    <th key={l.mint} className="col-right">
                      <div className="compare-head">
                        <span className="lst-symbol">{l.symbol}</span>
                        <span className="lst-name">{l.name}</span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const values = lsts.map(row.value);
                  const best = bestIndex(values, row.better);
                  return (
                    <tr key={row.label}>
                      <th className="col-left compare-metric" title={row.hint}>
                        {row.label}
                      </th>
                      {lsts.map((l, i) => (
                        <td
                          key={l.mint}
                          className={`col-right num${i === best ? " compare-best" : ""}`}
                        >
                          {row.render(l)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="compare-note">
            Highlighted cells are the better value in that row, and only where
            better is unambiguous — ties and matters of preference (type, issuer)
            are left unmarked.
          </p>
        </div>
      )}

      <div className="compare-bar">
        <span className="compare-label">Comparing</span>
        <div className="compare-chips">
          {lsts.map((l) => (
            <span className="compare-chip" key={l.mint}>
              {l.symbol}
              <button
                type="button"
                className="chip-x"
                onClick={() => onRemove(l.symbol)}
                aria-label={`Remove ${l.symbol} from comparison`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
        <div className="compare-actions">
          <button type="button" className="compare-btn primary" onClick={() => setOpen((o) => !o)}>
            {open ? "Hide" : `Compare ${lsts.length}`}
          </button>
          <button type="button" className="compare-btn" onClick={onClear}>
            Clear
          </button>
        </div>
      </div>
    </div>
  );
}
