// Append-only helpers for the git-backed time series in data/history/.
//
// HARD RULE: these never truncate or remove history. `upsertByDate` replaces
// the entry for today's date if it already exists (idempotent re-runs) and
// otherwise appends. Existing dated entries are preserved verbatim, and the
// array is kept sorted by date ascending.

import { readFile, writeFile } from "node:fs/promises";

interface DatedEntry {
  date: string; // YYYY-MM-DD
}

/** Read a JSON array file. Missing/empty/corrupt -> []. Never throws. */
export async function readHistory<T>(path: string): Promise<T[]> {
  try {
    const raw = await readFile(path, "utf8");
    const trimmed = raw.trim();
    if (!trimmed) return [];
    const parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) {
      console.warn(`[history] ${path} is not an array; treating as empty`);
      return [];
    }
    return parsed as T[];
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === "ENOENT") return [];
    console.warn(`[history] failed to read ${path}: ${e.message}; treating as empty`);
    return [];
  }
}

/**
 * Upsert a dated entry: replace an existing same-date entry, else append.
 * Returns the new array sorted ascending by date. Pure — does not write.
 */
export function upsertByDate<T extends DatedEntry>(entries: T[], entry: T): T[] {
  const next = entries.filter((e) => e.date !== entry.date);
  next.push(entry);
  next.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return next;
}

/** Read history, upsert today's entry by date, write back. Preserves all history. */
export async function appendSnapshot<T extends DatedEntry>(
  path: string,
  entry: T,
): Promise<{ total: number; replaced: boolean }> {
  const existing = await readHistory<T>(path);
  const replaced = existing.some((e) => e.date === entry.date);
  const next = upsertByDate(existing, entry);
  await writeFile(path, JSON.stringify(next, null, 2) + "\n", "utf8");
  return { total: next.length, replaced };
}
