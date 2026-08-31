// Time-series chart with a hover readout, for the row-detail history section.
//
// A step up from Sparkline: gridlines with real value labels, a date axis, and
// a crosshair that reports the value on the day you point at. Still hand-rolled
// SVG — a charting dependency would be more code shipped than the whole app.
//
// The range control lives in RowDetail so both charts move together; this
// component just draws the points it is handed. Windows shorter than the data
// we actually have are the norm right now (history accrues one snapshot a day),
// so a too-short window degrades to a plain "not enough history" note.

import { useState } from "react";
import type { Point } from "../lib/history";

interface Props {
  points: Point[];
  label: string;
  format: (v: number) => string;
  color?: string;
  height?: number;
}

const PAD_L = 52; // room for the y-axis labels
const PAD_R = 8;
const PAD_T = 10;
const PAD_B = 20; // room for the date axis

export function Chart({ points, label, format, color = "#6366f1", height = 132 }: Props) {
  const [hover, setHover] = useState<number | null>(null);

  if (points.length < 2) {
    return (
      <div className="chart">
        <div className="chart-head">
          <span className="chart-label">{label}</span>
        </div>
        <div className="chart-empty">Not enough history in this range yet.</div>
      </div>
    );
  }

  // viewBox coordinates; the SVG scales to its container so the chart is fluid.
  const vbW = 560;
  const w = vbW - PAD_L - PAD_R;
  const h = height - PAD_T - PAD_B;

  const values = points.map((p) => p.value);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  // A flat series would otherwise divide by zero and draw on the baseline.
  const pad = (rawMax - rawMin) * 0.08 || Math.abs(rawMax) * 0.001 || 1;
  const min = rawMin - pad;
  const max = rawMax + pad;
  const span = max - min;

  const x = (i: number) => PAD_L + (i / (points.length - 1)) * w;
  const y = (v: number) => PAD_T + h - ((v - min) / span) * h;

  const line = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`)
    .join(" ");
  const area = `${line} L${x(points.length - 1).toFixed(1)},${(PAD_T + h).toFixed(1)} L${PAD_L},${(
    PAD_T + h
  ).toFixed(1)} Z`;

  const gridValues = [max, (max + min) / 2, min];
  const last = points[points.length - 1]!;
  const active = hover === null ? null : points[hover]!;
  const gradId = `cg-${label.replace(/\W/g, "")}`;

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    // Map client px -> viewBox units before inverting the x scale.
    const vbX = ((e.clientX - rect.left) / rect.width) * vbW;
    const t = (vbX - PAD_L) / w;
    const i = Math.round(t * (points.length - 1));
    setHover(Math.min(Math.max(i, 0), points.length - 1));
  }

  return (
    <div className="chart">
      <div className="chart-head">
        <span className="chart-label">{label}</span>
        <span className="chart-readout num" style={{ color }}>
          {format((active ?? last).value)}
          <span className="chart-readout-date">{(active ?? last).date}</span>
        </span>
      </div>
      <svg
        viewBox={`0 0 ${vbW} ${height}`}
        className="chart-svg"
        role="img"
        aria-label={`${label} over time`}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.16" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>

        {gridValues.map((v, i) => (
          <g key={i}>
            <line
              x1={PAD_L}
              x2={vbW - PAD_R}
              y1={y(v)}
              y2={y(v)}
              className="chart-grid"
            />
            <text x={PAD_L - 6} y={y(v) + 3} className="chart-axis-label" textAnchor="end">
              {format(v)}
            </text>
          </g>
        ))}

        <path d={area} fill={`url(#${gradId})`} />
        <path
          d={line}
          fill="none"
          stroke={color}
          strokeWidth={1.6}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {active && (
          <g>
            <line
              x1={x(hover!)}
              x2={x(hover!)}
              y1={PAD_T}
              y2={PAD_T + h}
              className="chart-crosshair"
            />
            <circle cx={x(hover!)} cy={y(active.value)} r={3.2} fill={color} />
          </g>
        )}
        <circle cx={x(points.length - 1)} cy={y(last.value)} r={2.8} fill={color} />

        <text x={PAD_L} y={height - 6} className="chart-axis-label">
          {points[0]!.date}
        </text>
        <text x={vbW - PAD_R} y={height - 6} className="chart-axis-label" textAnchor="end">
          {last.date}
        </text>
      </svg>
    </div>
  );
}

// --- range control ----------------------------------------------------------

export const RANGES = [
  { id: "30d", label: "30D", days: 30 },
  { id: "90d", label: "90D", days: 90 },
  { id: "1y", label: "1Y", days: 365 },
  { id: "all", label: "All", days: null },
] as const;

export type RangeId = (typeof RANGES)[number]["id"];

/** Keep only the points inside the window. `all` passes everything through. */
export function windowPoints(points: Point[], range: RangeId): Point[] {
  const days = RANGES.find((r) => r.id === range)?.days ?? null;
  if (days === null || points.length === 0) return points;
  const cutoff = Date.now() - days * 86400000;
  const inRange = points.filter((p) => new Date(p.date).getTime() >= cutoff);
  // Never hand back a single point just because the window is tight — the
  // chart would read "not enough history" when the data is simply older.
  return inRange.length >= 2 ? inRange : points.slice(-2);
}

export function RangeToggle({
  value,
  onChange,
}: {
  value: RangeId;
  onChange: (r: RangeId) => void;
}) {
  return (
    <div className="range-toggle" role="group" aria-label="Chart range">
      {RANGES.map((r) => (
        <button
          key={r.id}
          type="button"
          className={`range-btn${value === r.id ? " active" : ""}`}
          aria-pressed={value === r.id}
          onClick={() => onChange(r.id)}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}
