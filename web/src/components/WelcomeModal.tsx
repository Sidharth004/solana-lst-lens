// Welcome dialog shown on every visit.
//
// A measured APY and an advertised one look identical once printed, so the
// premise of this project is invisible from the table alone. This states it as
// a side-by-side: what we measure, against what an LST page normally gives you.
//
// Deliberately terse. It is an orientation, not a manifesto — the reader came
// for the data.

import { useEffect, useRef } from "react";

interface Props {
  onClose: () => void;
}

interface Diff {
  /** Emphasised lead phrase — the thing we measure. */
  lead: string;
  /** How it's measured, in a handful of words. */
  how: string;
  /** The usual alternative. */
  them: string;
}

// Each row is a claim this codebase can back up; nothing aspirational.
const DIFFS: Diff[] = [
  { lead: "Realized APY", how: "from exchange-rate history", them: "Advertised APY" },
  { lead: "Yield split", how: "base, MEV, other", them: "One blended number" },
  { lead: "Exact base", how: "per epoch, real commission", them: "A flat assumed rate" },
  { lead: "Real MEV", how: "from Jito's on-chain accounts", them: "Estimated, or omitted" },
  { lead: "Native baseline", how: "beats staking it yourself?", them: "No comparison point" },
  { lead: "Decentralization grade", how: "A–F from the validator set", them: "“Decentralized” as a claim" },
  { lead: "Net take-home", how: "after real exit cost", them: "Yield before costs" },
];

export function WelcomeModal({ onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);

  // Esc closes, and the page behind must not scroll while the dialog is up.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  return (
    <div
      className="modal-backdrop"
      // Only a click that lands on the backdrop itself closes — a click that
      // started inside the panel (e.g. dragging to select text) must not.
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="welcome-title"
      >
        <button
          ref={closeRef}
          type="button"
          className="modal-close"
          aria-label="Close"
          onClick={onClose}
        >
          ×
        </button>

        <h2 id="welcome-title" className="modal-title">
          What makes this dashboard different?
        </h2>
        <p className="modal-sub">Measured from public on-chain data. Never from a marketing page.</p>

        <table className="diff-table">
          <thead>
            <tr>
              <th scope="col" className="diff-h-ours">This dashboard</th>
              <th scope="col" className="diff-h-them">Typical LST page</th>
            </tr>
          </thead>
          <tbody>
            {DIFFS.map((d) => (
              <tr key={d.lead}>
                <td className="diff-ours">
                  <strong>{d.lead}</strong>
                  <span className="diff-how">{d.how}</span>
                </td>
                <td className="diff-them">{d.them}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <p className="modal-foot">
          Keyless public sources, refreshed 3× a day. Every snapshot stays in git —
          so any figure here can be re-derived.
        </p>
      </div>
    </div>
  );
}
