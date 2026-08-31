// Number/percent formatting. Everything shown to the user is rounded here —
// no float artifacts reach the screen (DEVELOPMENT_PLAN hard rule 6).

const DASH = "—";

export function fmtPct(v: number | null | undefined, dp = 2): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return DASH;
  return `${v.toFixed(dp)}%`;
}

/** Signed percent, e.g. "+0.42%" / "-0.10%". */
export function fmtPctSigned(v: number | null | undefined, dp = 2): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return DASH;
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(dp)}%`;
}

export function fmtInt(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return DASH;
  return Math.round(v).toLocaleString("en-US");
}

/** Compact SOL amount: 14832190 -> "14.83M", 980120 -> "980.1K". */
export function fmtCompact(v: number | null | undefined, dp = 2): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return DASH;
  const abs = Math.abs(v);
  if (abs >= 1e9) return `${(v / 1e9).toFixed(dp)}B`;
  if (abs >= 1e6) return `${(v / 1e6).toFixed(dp)}M`;
  if (abs >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return v.toFixed(0);
}

export function fmtSol(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return DASH;
  return `${fmtCompact(v)} SOL`;
}

/** Exchange rate, e.g. 1.1834 -> "1.1834". */
export function fmtRate(v: number | null | undefined, dp = 4): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return DASH;
  return v.toFixed(dp);
}

export function median(values: number[]): number | null {
  const nums = values.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (nums.length === 0) return null;
  const mid = Math.floor(nums.length / 2);
  return nums.length % 2 === 0 ? (nums[mid - 1]! + nums[mid]!) / 2 : nums[mid]!;
}

/** Trend arrow + magnitude for a signed 30d APY change, e.g. "↓ 3.1%". */
export function fmtTrend(v: number | null | undefined): { text: string; dir: "up" | "down" | "flat" } {
  if (v === null || v === undefined || !Number.isFinite(v)) return { text: DASH, dir: "flat" };
  const dir = v > 1 ? "up" : v < -1 ? "down" : "flat";
  const arrow = dir === "up" ? "↑" : dir === "down" ? "↓" : "→";
  return { text: `${arrow} ${Math.abs(v).toFixed(1)}%`, dir };
}

/**
 * Age of a timestamp in plain words ("3 hours ago", "5 days ago"). Staleness is
 * a fact about the data, so it's shown up front rather than buried in a date
 * the reader has to subtract from today.
 */
export function fmtRelative(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return DASH;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return DASH;
  const mins = Math.round((now - t) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min${mins === 1 ? "" : "s"} ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  const months = Math.round(days / 30);
  return `${months} month${months === 1 ? "" : "s"} ago`;
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return DASH;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}
