#!/usr/bin/env node
/** 一次性写出 curated-seeds.json（56 条） */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDefaultCuratedSeeds } from "../src/intelligence/seed-loader.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const out = join(__dirname, "..", "data", "intelligence", "curated-seeds.json");
const items = buildDefaultCuratedSeeds();
writeFileSync(out, JSON.stringify({ version: 1, items }, null, 2), "utf8");
console.error(`wrote ${items.length} curated seeds to ${out}`);
