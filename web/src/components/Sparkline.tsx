// Hand-rolled SVG line chart (no charting dependency). Renders a small labeled
// time series with min/max/last markers. Used for exchange-rate and realized-APY
// history in RowDetail.

import type { Point } from "../lib/history";

interface Props {
  points: Point[];
  label: string;
  format: (v: number) => string;
  width?: number;
  height?: number;
  color?: string;
}

export function Sparkline({
  points,
  label,
  format,
  width = 260,
  height = 56,
  color = "#6366f1",
}: Props) {
  if (points.length < 2) {
    return (
      <div className="spark">
        <div className="spark-label">{label}</div>
        <div className="spark-empty">Not enough history yet.</div>
      </div>
    );
  }

  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const padX = 2;
  const padY = 6;
  const w = width - padX * 2;
  const h = height - padY * 2;

  const x = (i: number) => padX + (i / (points.length - 1)) * w;
  const y = (v: number) => padY + h - ((v - min) / span) * h;

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const area = `${line} L${x(points.length - 1).toFixed(1)},${(padY + h).toFixed(1)} L${x(0).toFixed(1)},${(padY + h).toFixed(1)} Z`;
  const last = points[points.length - 1]!;
  const gradId = `g-${label.replace(/\W/g, "")}`;

  return (
    <div className="spark">
      <div className="spark-head">
        <span className="spark-label">{label}</span>
        <span className="spark-last num" style={{ color }}>
          {format(last.value)}
        </span>
      </div>
      <svg width={width} height={height} className="spark-svg" role="img" aria-label={`${label} history`}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.18" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#${gradId})`} />
        <path d={line} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={x(points.length - 1)} cy={y(last.value)} r={2.6} fill={color} />
      </svg>
      <div className="spark-foot num">
        <span>{points[0]!.date}</span>
        <span className="muted">
          {format(min)} – {format(max)}
        </span>
        <span>{last.date}</span>
      </div>
    </div>
  );
}
