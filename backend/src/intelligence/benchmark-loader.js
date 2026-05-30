import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createKnowledgeStore } from "./knowledge-store.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, "..", "..", "data", "intelligence");

/**
 * @returns {{ items: object[] }}
 */
export function loadAdmissionBenchmarksFile() {
  const path = join(dataDir, "admission-benchmarks.json");
  if (!existsSync(path)) return { items: [] };
  const raw = JSON.parse(readFileSync(path, "utf8"));
  return { items: Array.isArray(raw.items) ? raw.items : [] };
}

/**
 * @param {ReturnType<import("../store.js").createStore>} store
 * @param {{ force?: boolean }} [opts]
 */
export function loadAdmissionBenchmarksIntoStore(store, opts = {}) {
  const { items } = loadAdmissionBenchmarksFile();
  if (!items.length) return { skipped: true, inserted: 0, total: 0 };

  const ks = createKnowledgeStore(store);
  const existing = store.listIntelligenceItems({ publishedOnly: true, limit: 5000 });
  const benchmarkCount = existing.filter((x) => x.infoType === "benchmark").length;
  if (!opts.force && benchmarkCount >= 20) {
    return { skipped: true, inserted: 0, total: items.length, existing: benchmarkCount };
  }

  let inserted = 0;
  for (const raw of items) {
    ks.upsertItem(
      {
        ...raw,
        infoType: raw.infoType || "benchmark",
        reviewStatus: raw.reviewStatus || "approved",
        productCurated: raw.productCurated !== false,
      },
      { forceId: raw.id }
    );
    inserted += 1;
  }
  return { skipped: false, inserted, total: items.length };
}

/**
 * @param {object} item
 */
export function isBenchmarkIntelItem(item) {
  return String(item?.infoType || "").toLowerCase() === "benchmark";
}
