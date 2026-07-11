// Copies the committed dataset into the web app's public dir so `vite build`
// bundles it into web/dist/data/. Run before the web build (locally and in CI /
// on the static host). Never deletes anything; only writes latest.json + meta.json.

import { copyFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const SRC_DIR = path.join(ROOT, "data");
const OUT_DIR = path.join(ROOT, "web", "public", "data");

mkdirSync(OUT_DIR, { recursive: true });

for (const file of ["latest.json", "meta.json"]) {
  const src = path.join(SRC_DIR, file);
  if (!existsSync(src)) {
    console.warn(`[prepare-web-data] ${file} not found at ${src} — skipping`);
    continue;
  }
  copyFileSync(src, path.join(OUT_DIR, file));
  console.log(`[prepare-web-data] copied ${file} -> web/public/data/${file}`);
}
