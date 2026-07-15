// Summary tiles: tracked LSTs, total SOL staked, and a headline yield/quality
// metric. Cards only surface populated data (no empty "—" headline tiles).

import type { Lst } from "@shared/schema";
import { fmtInt, fmtSol, fmtPct, fmtPctSigned, median } from "../lib/format";
import { InfoTip } from "./InfoTip";

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
      ? { label: "Median APY gap", value: fmtPctSigned(medGap), tip: "Median of (advertised − realized) across LSTs where a marketed number is curated — how much the typical LST overstates its yield." }
      : { label: "Graded for decentralization", value: `${graded} / ${count}`, tip: "How many LSTs we've graded by reading their on-chain validator sets — the decentralization contribution score is unique to this dashboard." };

  const cards: { label: string; value: string; tip?: string }[] = [
    { label: "Tracked LSTs", value: fmtInt(count) },
    { label: "Total SOL staked", value: fmtSol(totalSol) },
    { label: "Median realized APY", value: fmtPct(medRealized), tip: "Median APY actually delivered (measured from on-chain exchange rates), not the marketed number." },
    third,
  ];

  return (
    <div className="metric-cards">
      {cards.map((c) => (
        <div className="metric-card" key={c.label}>
          <div className="metric-label">
            {c.label}
            {c.tip && <InfoTip text={c.tip} />}
          </div>
          <div className="metric-value num">{c.value}</div>
        </div>
      ))}
    </div>
  );
}
