// Summary tiles: tracked LSTs, total SOL staked, median advertised-vs-realized gap.

import type { Lst } from "@shared/schema";
import { fmtInt, fmtSol, fmtPctSigned, median } from "../lib/format";

export function MetricCards({ lsts }: { lsts: Lst[] }) {
  const count = lsts.length;
  const totalSol = lsts.reduce((sum, l) => sum + (l.tvlSol ?? 0), 0);
  const gaps = lsts.map((l) => l.apyGap).filter((g): g is number => g !== null);
  const medGap = median(gaps);

  const cards = [
    { label: "Tracked LSTs", value: fmtInt(count) },
    { label: "Total SOL staked", value: fmtSol(totalSol) },
    {
      label: "Median APY gap",
      value: fmtPctSigned(medGap),
      hint: "Median of (advertised − realized) across tracked LSTs",
    },
  ];

  return (
    <div className="metric-cards">
      {cards.map((c) => (
        <div className="metric-card" key={c.label}>
          <div className="metric-label" title={c.hint}>
            {c.label}
          </div>
          <div className="metric-value num">{c.value}</div>
        </div>
      ))}
    </div>
  );
}
