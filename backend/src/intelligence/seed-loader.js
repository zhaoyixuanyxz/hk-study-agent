import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createKnowledgeStore } from "./knowledge-store.js";
import { loadSchoolsRegistry } from "./source-registry.js";
import { normalizeCuratedSeedRow, resolveCuratedCanonicalUrl } from "./curated-urls.js";
import { loadAdmissionBenchmarksIntoStore } from "./benchmark-loader.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, "..", "..", "data", "intelligence");

const INFO_TYPES = ["policy", "deadline", "tuition", "admission", "program", "visa", "scholarship"];

const SOURCE_BY_SCHOOL = {
  hku: "hku-official",
  cuhk: "cuhk-official",
  hkust: "hkust-official",
  polyu: "hku-official",
  cityu: "cuhk-official",
  hkbu: "cuhk-official",
  lingnan: "cuhk-official",
  eduhk: "eduhk-official",
};

/**
 * 若 curated-seeds.json 不存在则生成 56 条（八大 × 7 类）。
 */
export function buildDefaultCuratedSeeds() {
  const { schools } = loadSchoolsRegistry();
  return schools.flatMap((school) =>
    INFO_TYPES.map((infoType) => ({
      sourceId: SOURCE_BY_SCHOOL[school.id] || "hku-official",
      schoolIds: [school.id],
      infoType,
      reviewStatus: "approved",
      canonicalUrl: resolveCuratedCanonicalUrl({ schoolIds: [school.id], infoType }),
      locale: {
        titleZh: `${school.nameZh} — ${infoType} 要点（精选）`,
        summaryZh: `适用于关注 ${school.nameZh} 的申请人；信息类型：${infoType}。此为 Sprint2 预置种子，供检索与审核链路验收。`,
      },
      publishedAt: "2026-04-15T08:00:00.000Z",
      productCurated: true,
    }))
  );
}

/**
 * @returns {{ items: object[] }}
 */
export function loadCuratedSeedsFile() {
  const path = join(dataDir, "curated-seeds.json");
  if (existsSync(path)) {
    const raw = JSON.parse(readFileSync(path, "utf8"));
    return { items: Array.isArray(raw.items) ? raw.items : [] };
  }
  return { items: buildDefaultCuratedSeeds() };
}

/**
 * @param {ReturnType<import("../store.js").createStore>} store
 * @returns {number}
 */
export function repairDemoSeedCanonicalUrls(store) {
  return store.repairIntelligenceDemoCanonicalUrls((item) =>
    resolveCuratedCanonicalUrl({
      schoolIds: item.schoolIds,
      infoType: item.infoType,
      sourceId: item.sourceId,
    })
  );
}

/**
 * @param {ReturnType<import("../store.js").createStore>} store
 * @param {{ force?: boolean }} [opts]
 */
export function loadCuratedSeedsIntoStore(store, opts = {}) {
  repairDemoSeedCanonicalUrls(store);
  const ks = createKnowledgeStore(store);
  ks.syncSourcesFromRegistry();
  const published = store.listIntelligenceItems({ publishedOnly: true, limit: 5000 });
  const benchmarks = loadAdmissionBenchmarksIntoStore(store, { force: opts.force });
  if (!opts.force && published.length >= 50) {
    return { skipped: true, count: published.length, benchmarks };
  }
  const { items } = loadCuratedSeedsFile();
  let inserted = 0;
  for (const raw of items) {
    const row = normalizeCuratedSeedRow(raw);
    ks.upsertItem({
      ...row,
      reviewStatus: row.reviewStatus || "approved",
    });
    inserted += 1;
  }
  return { skipped: false, inserted, total: items.length, benchmarks };
}
