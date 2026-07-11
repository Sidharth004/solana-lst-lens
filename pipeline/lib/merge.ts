// Deep-merge helpers for layering the human-authored manual data over fetched
// data. The manual layer is sacred: it always wins on conflict, and null/
// undefined values in the manual layer are ignored (they never blank out
// fetched data unless explicitly intended).

import { readFile } from "node:fs/promises";

type Plain = Record<string, unknown>;

function isPlainObject(v: unknown): v is Plain {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Deep-merge `override` onto `base`. Objects merge recursively; arrays and
 * scalars from `override` replace those in `base`. `undefined` values in
 * `override` are skipped so a partial override never erases a base field.
 */
export function deepMerge<T>(base: T, override: Partial<T> | undefined): T {
  if (override === undefined) return base;
  if (!isPlainObject(base) || !isPlainObject(override)) {
    return (override as unknown as T) ?? base;
  }
  const out: Plain = { ...(base as Plain) };
  for (const [key, val] of Object.entries(override as Plain)) {
    if (val === undefined) continue;
    const cur = out[key];
    if (isPlainObject(cur) && isPlainObject(val)) {
      out[key] = deepMerge(cur, val as Plain);
    } else {
      out[key] = val;
    }
  }
  return out as T;
}

/** Read + parse a JSON file. Returns `fallback` on any failure (never throws). */
export async function readJson<T>(path: string, fallback: T): Promise<T> {
  try {
    const raw = await readFile(path, "utf8");
    const trimmed = raw.trim();
    if (!trimmed) return fallback;
    return JSON.parse(trimmed) as T;
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code !== "ENOENT") {
      console.warn(`[merge] failed to read ${path}: ${e.message}; using fallback`);
    }
    return fallback;
  }
}
