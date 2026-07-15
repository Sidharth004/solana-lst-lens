// Small "ⓘ" affordance with a hover/focus tooltip bubble. Used to explain the
// interpretive metrics that set this dashboard apart. Bubble opens downward so it
// isn't clipped by the table's horizontal scroll container; pass align="right"
// for right-edge columns.

interface Props {
  text: string;
  align?: "left" | "right";
  /** Stop clicks from bubbling (e.g. so it doesn't trigger a column sort). */
  stop?: boolean;
}

export function InfoTip({ text, align = "left", stop = false }: Props) {
  return (
    <span
      className={`infotip infotip-${align}`}
      tabIndex={0}
      role="note"
      aria-label={text}
      onClick={stop ? (e) => e.stopPropagation() : undefined}
      onMouseDown={stop ? (e) => e.stopPropagation() : undefined}
    >
      <span className="infotip-icon" aria-hidden>
        i
      </span>
      <span className="infotip-bubble" role="tooltip">
        {text}
      </span>
    </span>
  );
}
