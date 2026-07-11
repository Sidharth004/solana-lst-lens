// Goal pills. Clicking a pill applies its sort now; the dedicated metrics behind
// some pills land in later phases (marked "soon"). Full routing logic: Phase 6.

import { INTENTS, type Intent, type SortState } from "../lib/sort";

interface Props {
  activeSort: SortState;
  onPick: (intent: Intent) => void;
}

function isActive(sort: SortState, intent: Intent): boolean {
  return sort.key === intent.sort.key && sort.dir === intent.sort.dir;
}

export function IntentRouter({ activeSort, onPick }: Props) {
  return (
    <div className="intent-router" role="group" aria-label="Choose a goal">
      <span className="intent-lead">I want the…</span>
      {INTENTS.map((intent) => (
        <button
          key={intent.id}
          type="button"
          className={`intent-pill${isActive(activeSort, intent) ? " active" : ""}`}
          title={intent.hint}
          onClick={() => onPick(intent)}
        >
          {intent.label}
          {!intent.live && <span className="intent-soon">soon</span>}
        </button>
      ))}
    </div>
  );
}
