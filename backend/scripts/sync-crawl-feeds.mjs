#!/usr/bin/env node
/** Write sources.json, schools.json, feed-urls.json from crawl registry */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildCrawlFeeds, SCHOOL_CRAWL_PROFILES } from "../src/intelligence/crawl-registry.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, "..", "data", "intelligence");
mkdirSync(dataDir, { recursive: true });

const schools = Object.keys(SCHOOL_CRAWL_PROFILES).map((id) => {
  const names = {
    hku: ["香港大学", "The University of Hong Kong"],
    cuhk: ["香港中文大学", "The Chinese University of Hong Kong"],
    hkust: ["香港科技大学", "The Hong Kong University of Science and Technology"],
    polyu: ["香港理工大学", "The Hong Kong Polytechnic University"],
    cityu: ["香港城市大学", "City University of Hong Kong"],
    hkbu: ["香港浸会大学", "Hong Kong Baptist University"],
    lingnan: ["岭南大学", "Lingnan University"],
    eduhk: ["香港教育大学", "The Education University of Hong Kong"],
  };
  const [nameZh, nameEn] = names[id] || [id, id];
  return { id, slug: id, nameZh, nameEn, coverage: "deep" };
});

const sources = Object.values(SCHOOL_CRAWL_PROFILES).map((p) => ({
  id: p.sourceId,
  name: `${p.sourceId.replace("-official", "")} 官网`,
  baseUrl: p.baseHost,
  tier: "official",
  trustRules: { autoPublish: true },
}));

const feeds = buildCrawlFeeds();

writeFileSync(join(dataDir, "schools.json"), JSON.stringify({ version: 1, schools }, null, 2));
writeFileSync(join(dataDir, "sources.json"), JSON.stringify({ version: 1, sources }, null, 2));
writeFileSync(join(dataDir, "feed-urls.json"), JSON.stringify({ version: 1, feeds }, null, 2));
console.error(`sync-crawl-feeds: ${schools.length} schools, ${sources.length} sources, ${feeds.length} feeds`);
