// Advertised vs realized gap cell. Amber when the gap exceeds 0.5%, red beyond
// 1.5% — the whole point of the dashboard, surfaced neutrally (no per-token
// styling, only metric-driven).

import { fmtPctSigned } from "../lib/format";

const AMBER = 0.5;
const RED = 1.5;

export function ApyGap({ gap }: { gap: number | null }) {
  if (gap === null || !Number.isFinite(gap)) {
    return <span className="num muted">—</span>;
  }
  const tone = gap > RED ? "gap-red" : gap > AMBER ? "gap-amber" : "gap-ok";
  const title =
    gap > AMBER
      ? `Marketed APY overstates realized by ${gap.toFixed(2)} points`
      : "Marketed APY is close to what it delivered";
  return (
    <span className={`num gap-chip ${tone}`} title={title}>
      {fmtPctSigned(gap)}
    </span>
  );
}
