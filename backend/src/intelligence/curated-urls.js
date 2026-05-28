/**
 * Map curated seed items to reachable official university home / admissions URLs.
 */
const SCHOOL_OFFICIAL_HOME = {
  hku: "https://www.hku.hk",
  cuhk: "https://www.cuhk.edu.hk",
  hkust: "https://www.ust.hk",
  polyu: "https://www.polyu.edu.hk",
  cityu: "https://www.cityu.edu.hk",
  hkbu: "https://www.hkbu.edu.hk",
  lingnan: "https://www.ln.edu.hk",
  eduhk: "https://www.eduhk.hk",
};

/** @type {Record<string, string>} */
const INFO_TYPE_PATH = {
  policy: "",
  deadline: "admissions",
  tuition: "fees",
  admission: "admissions",
  program: "programmes",
  visa: "admissions",
  scholarship: "scholarships",
};

export const DEMO_SEED_HOST = "seed.study-agent.local";

export function isDemoSeedUrl(url) {
  try {
    return new URL(String(url || "")).hostname === DEMO_SEED_HOST;
  } catch {
    return String(url || "").includes(DEMO_SEED_HOST);
  }
}

/**
 * @param {{ schoolIds?: string[], infoType?: string, sourceId?: string }} item
 */
export function resolveCuratedCanonicalUrl(item) {
  const schoolId = Array.isArray(item.schoolIds) ? item.schoolIds[0] : "hku";
  const base = (SCHOOL_OFFICIAL_HOME[schoolId] || SCHOOL_OFFICIAL_HOME.hku).replace(/\/$/, "");
  const segment = INFO_TYPE_PATH[String(item.infoType || "").trim()] ?? String(item.infoType || "").trim();
  return segment ? `${base}/${segment}` : base;
}

/**
 * @param {object} raw seed row from curated-seeds.json
 */
export function normalizeCuratedSeedRow(raw) {
  const url = String(raw.canonicalUrl || raw.url || "").trim();
  if (!isDemoSeedUrl(url)) return raw;
  return { ...raw, canonicalUrl: resolveCuratedCanonicalUrl(raw) };
}
