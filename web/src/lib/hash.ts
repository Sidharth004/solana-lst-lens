// URL-hash params, so a view can be linked and shared.
//
// Two things live here: `lst` (the expanded row, written by Table) and
// `compare` (the pinned set, written by App). They are read and written through
// this module rather than by assigning location.hash directly, because whoever
// writes last would otherwise wipe the other's param.

export function getHashParam(name: string): string | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const v = params.get(name);
  return v ? decodeURIComponent(v) : null;
}

/** Set (or clear, with null) one param, leaving the others intact. */
export function setHashParam(name: string, value: string | null): void {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  if (value) params.set(name, value);
  else params.delete(name);
  const next = params.toString();
  // replaceState, not location.hash: this is a view detail, not a navigation
  // step the back button should have to walk through.
  window.history.replaceState(null, "", next ? `#${next}` : window.location.pathname);
}
