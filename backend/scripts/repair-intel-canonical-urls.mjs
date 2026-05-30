#!/usr/bin/env node
/**
 * Update intelligence items in db.json to match current feed-urls registry.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildCrawlFeeds } from "../src/intelligence/crawl-registry.js";
import { computeFeedDedupeHash } from "../src/intelligence/content-hash.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const backendRoot = join(__dirname, "..");
const dbPath = join(backendRoot, "data", "db.json");

const feedById = Object.fromEntries(buildCrawlFeeds().map((f) => [f.id, f.url]));
const db = JSON.parse(readFileSync(dbPath, "utf8"));
const items = db.intelligenceItems || [];
let updated = 0;

for (const item of items) {
  const feedId = item.feedId;
  if (!feedId || !feedById[feedId]) continue;
  const nextUrl = feedById[feedId];
  if (item.canonicalUrl === nextUrl) continue;
  item.canonicalUrl = nextUrl;
  item.dedupeHash = computeFeedDedupeHash(nextUrl);
  item.updatedAt = new Date().toISOString();
  updated++;
}

writeFileSync(dbPath, JSON.stringify(db, null, 2));
console.log(`Updated ${updated} intelligence item canonical URLs in db.json`);
