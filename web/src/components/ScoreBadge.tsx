// Decentralization grade badge (A–F). Editorial composite — labeled "our index"
// in the tooltip. null renders as an em dash.

import type { Grade } from "@shared/schema";

export function ScoreBadge({ grade }: { grade: Grade | null }) {
  if (grade === null) {
    return (
      <span className="score-badge score-null" title="Not yet computed for this LST">
        —
      </span>
    );
  }
  return (
    <span
      className={`score-badge score-${grade}`}
      title="Our editorial decentralization index (A best – F worst). See row detail for the raw inputs."
    >
      {grade}
    </span>
  );
}
