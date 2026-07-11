// Loads the dataset the pipeline produces. Typed via the single source-of-truth
// schema so the web app and pipeline can never drift.
//
// At build time, data/latest.json is copied into web/public/data/latest.json
// (see the `predev`/build step in README). We fetch it at runtime so a data
// refresh doesn't require rebuilding the app.

import type { Dataset } from "@shared/schema";

export async function loadDataset(): Promise<Dataset> {
  const res = await fetch(`${import.meta.env.BASE_URL}data/latest.json`, {
    cache: "no-cache",
  });
  if (!res.ok) {
    throw new Error(`Failed to load dataset: HTTP ${res.status}`);
  }
  return (await res.json()) as Dataset;
}
