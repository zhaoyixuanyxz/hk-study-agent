import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, "..", "..", "data", "intelligence");

/**
 * @returns {{ version: number, sources: object[] }}
 */
export function loadSourcesRegistry() {
  const path = join(dataDir, "sources.json");
  if (!existsSync(path)) return { version: 1, sources: [] };
  const raw = JSON.parse(readFileSync(path, "utf8"));
  return {
    version: raw.version ?? 1,
    sources: Array.isArray(raw.sources) ? raw.sources : [],
  };
}

/**
 * @returns {{ version: number, schools: object[] }}
 */
export function loadSchoolsRegistry() {
  const path = join(dataDir, "schools.json");
  if (!existsSync(path)) return { version: 1, schools: [] };
  const raw = JSON.parse(readFileSync(path, "utf8"));
  return {
    version: raw.version ?? 1,
    schools: Array.isArray(raw.schools) ? raw.schools : [],
  };
}

/**
 * @param {string} sourceId
 */
export function getSourceById(sourceId) {
  const id = String(sourceId || "").trim();
  return loadSourcesRegistry().sources.find((s) => s.id === id) || null;
}

/**
 * @param {string} schoolIdOrSlug
 */
export function getSchoolByIdOrSlug(schoolIdOrSlug) {
  const key = String(schoolIdOrSlug || "").trim().toLowerCase();
  return (
    loadSchoolsRegistry().schools.find((s) => s.id === key || String(s.slug || "").toLowerCase() === key) ||
    null
  );
}
