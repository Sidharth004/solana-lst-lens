// Summary tiles: tracked LSTs, total SOL staked, and a headline yield/quality
// metric. Cards only surface populated data (no empty "—" headline tiles).

import type { Lst } from "@shared/schema";
import { fmtInt, fmtSol, fmtPct, fmtPctSigned, median } from "../lib/format";

export function MetricCards({ lsts }: { lsts: Lst[] }) {
  const count = lsts.length;
  const totalSol = lsts.reduce((sum, l) => sum + (l.tvlSol ?? 0), 0);

  const realized = lsts.map((l) => l.realizedApy).filter((v): v is number => v !== null);
  const medRealized = median(realized);

  const gaps = lsts.map((l) => l.apyGap).filter((g): g is number => g !== null);
  const medGap = median(gaps);

  const graded = lsts.filter((l) => l.decentralization.grade !== null).length;

  // Third tile prefers the curated advertised-vs-realized gap; falls back to the
  // decentralization coverage when no marketed numbers are curated yet.
  const third =
    gaps.length > 0
      ? { label: "Median APY gap", value: fmtPctSigned(medGap), hint: "Median (advertised − realized) where a marketed number is curated" }
      : { label: "Graded for decentralization", value: `${graded} / ${count}`, hint: "LSTs with a computed decentralization grade" };

  const cards: { label: string; value: string; hint?: string }[] = [
    { label: "Tracked LSTs", value: fmtInt(count) },
    { label: "Total SOL staked", value: fmtSol(totalSol) },
    { label: "Median realized APY", value: fmtPct(medRealized), hint: "Median measured delivered APY across tracked LSTs" },
    third,
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
