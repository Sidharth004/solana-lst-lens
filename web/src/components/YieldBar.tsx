// Stacked yield-source bar: base staking / MEV / other, scaled to realized APY.
// rkuSOL (blockspace-yield) also shows a hollow "coming" segment — never a fake
// number. An estimate marker signals the split is modeled.

import type { Lst } from "@shared/schema";
import { fmtPct } from "../lib/format";

const SEGMENTS = [
  { key: "baseStakingApy", label: "Base staking", cls: "seg-base" },
  { key: "mevApy", label: "MEV", cls: "seg-mev" },
  { key: "otherApy", label: "Other", cls: "seg-other" },
] as const;

export function YieldBar({ lst, showValue = true }: { lst: Lst; showValue?: boolean }) {
  const { yieldSplit, realizedApy, type } = lst;
  const parts = SEGMENTS.map((s) => ({
    ...s,
    value: yieldSplit[s.key] ?? 0,
  })).filter((p) => p.value > 0);

  const total = parts.reduce((a, p) => a + p.value, 0);
  const isBlockspace = type === "blockspace-yield";

  if (total <= 0 && !isBlockspace) {
    return <span className="num muted">—</span>;
  }

  const scale = total > 0 ? 100 / total : 0;

  return (
    <div className="yield-bar-cell">
      <div className="yield-bar" role="img" aria-label="Yield source split (estimate)">
        {parts.map((p) => (
          <div
            key={p.key}
            className={`yield-seg ${p.cls}`}
            style={{ width: `${p.value * scale}%` }}
            title={`${p.label}: ${fmtPct(p.value)} (estimate)`}
          />
        ))}
        {isBlockspace && (
          <div
            className="yield-seg seg-blockspace"
            style={{ width: "22%" }}
            title="Blockspace yield — coming once the marketplace is live"
          />
        )}
      </div>
      {showValue && (
        <span className="yield-total num">
          {fmtPct(realizedApy)}
          <span className="est-mark" title="Modeled estimate">
            ~
          </span>
        </span>
      )}
    </div>
  );
}

export function YieldLegend() {
  return (
    <div className="yield-legend">
      <span className="legend-item">
        <span className="legend-swatch seg-base" /> Base staking
      </span>
      <span className="legend-item">
        <span className="legend-swatch seg-mev" /> MEV
      </span>
      <span className="legend-item">
        <span className="legend-swatch seg-other" /> Other (MEV + fees, residual)
      </span>
      <span className="legend-item">
        <span className="legend-swatch seg-blockspace" /> Blockspace (coming)
      </span>
      <span className="legend-item muted">
        <span className="est-mark">~</span> = modeled estimate
      </span>
    </div>
  );
}
