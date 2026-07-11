// fetch with timeout + retries that NEVER throws to the caller.
// On any failure (network, timeout, non-2xx, bad JSON) it returns null and
// logs a warning. This is the backbone of the pipeline's graceful degradation:
// one failing source degrades its field to null; it must never abort the run.

export interface FetchJsonOptions {
  /** Per-attempt timeout in ms. Default 20000. */
  timeoutMs?: number;
  /** Number of retries after the first attempt. Default 2. */
  retries?: number;
  /** Base backoff in ms between retries (exponential). Default 500. */
  backoffMs?: number;
  /** Optional label for logs (defaults to the URL host+path). */
  label?: string;
  /** Extra fetch headers. */
  headers?: Record<string, string>;
}

function redact(url: string): string {
  // Never print API keys in logs.
  return url.replace(/([?&](?:apiKey|api_key|key)=)[^&]+/gi, "$1***");
}

export async function fetchJson<T>(
  url: string,
  opts: FetchJsonOptions = {},
): Promise<T | null> {
  const { timeoutMs = 20000, retries = 2, backoffMs = 500, headers } = opts;
  const label = opts.label ?? redact(url);

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { accept: "application/json", ...headers },
      });
      if (!res.ok) {
        // 429/5xx are worth retrying; 4xx (other than 429) are not.
        const retryable = res.status === 429 || res.status >= 500;
        console.warn(
          `[fetchJson] ${label} -> HTTP ${res.status}` +
            (retryable ? " (will retry)" : ""),
        );
        if (!retryable) return null;
      } else {
        return (await res.json()) as T;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[fetchJson] ${label} attempt ${attempt + 1} failed: ${msg}`);
    } finally {
      clearTimeout(timer);
    }

    if (attempt < retries) {
      await sleep(backoffMs * 2 ** attempt);
    }
  }

  console.warn(`[fetchJson] ${label} exhausted ${retries + 1} attempts -> null`);
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
