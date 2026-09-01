// Welcome dialog shown on every visit.
//
// The dashboard's whole premise — "measured, not marketed" — is invisible from
// a table of numbers, because a measured APY and an advertised one look
// identical once printed. This states the difference up front, as a direct
// contrast rather than a mission statement, then gets out of the way.
//
// It reopens every visit by design (no localStorage flag): most traffic here is
// first-time, and a returning reader closes it with one click or the Esc key.

import { useEffect, useRef } from "react";

interface Props {
  onClose: () => void;
}

interface Diff {
  /** What a reader gets on a typical LST page. */
  typical: string;
  /** What this dashboard measures instead — the lead phrase is emphasised. */
  lead: string;
  rest: string;
}

// Each row is a claim this codebase can actually back up; nothing aspirational.
const DIFFS: Diff[] = [
  {
    typical: "The APY the issuer advertises",
    lead: "Realized APY",
    rest: "— derived from the pool's own exchange-rate history, so it reflects what holders actually earned",
  },
  {
    typical: "A single blended yield number",
    lead: "The yield split",
    rest: "— base, MEV and everything else measured separately, each flagged when it's an estimate",
  },
  {
    typical: "A flat assumed staking rate",
    lead: "Exact on-chain base",
    rest: "— network inflation measured per epoch, times each validator's real vote-account commission",
  },
  {
    typical: "MEV estimated, or left out entirely",
    lead: "Real MEV",
    rest: "— read per validator from Jito's on-chain TipDistribution accounts, stake-weighted per pool",
  },
  {
    typical: "No answer to “is this worth it?”",
    lead: "A native-staking baseline",
    rest: "— the measured return of just staking SOL yourself, so every LST is scored against the alternative",
  },
  {
    typical: "“Decentralized” as a marketing word",
    lead: "A decentralization grade",
    rest: "— A–F computed from the pool's actual validator set, concentration and delinquency",
  },
  {
    typical: "Yield quoted before costs",
    lead: "Net take-home",
    rest: "— realized yield minus the real cost of exiting, quoted live through Jupiter",
  },
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
        <p className="modal-sub">
          Every number here is measured from public on-chain and API data — never
          taken from an issuer's marketing page.
        </p>

        <ul className="diff-list">
          {DIFFS.map((d) => (
            <li key={d.lead} className="diff-row">
              <span className="diff-typical">{d.typical}</span>
              <span className="diff-arrow" aria-hidden="true">
                →
              </span>
              <span className="diff-ours">
                <strong>{d.lead}</strong> {d.rest}
              </span>
            </li>
          ))}
        </ul>

        <p className="modal-foot">
          Sources are public and keyless, the pipeline refreshes three times a
          day, and every past snapshot stays in the repo's git history — so any
          figure here can be re-derived, not just trusted.
        </p>
      </div>
    </div>
  );
}
