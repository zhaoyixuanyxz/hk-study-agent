import { getSchoolByIdOrSlug, loadSchoolsRegistry } from "./source-registry.js";

/**
 * @param {ReturnType<import("../store.js").createStore>} store
 */
export function listSchoolCards(store) {
  const { schools } = loadSchoolsRegistry();
  const published = store.listIntelligenceItems({ publishedOnly: true, limit: 5000 });

  return schools.map((school) => {
    const related = published.filter((x) => Array.isArray(x.schoolIds) && x.schoolIds.includes(school.id));
    const dates = related.map((x) => new Date(x.publishedAt || 0).getTime()).filter((t) => t > 0);
    const latest = dates.length ? new Date(Math.max(...dates)).toISOString() : null;
    return {
      school_id: school.id,
      slug: school.slug || school.id,
      name_zh: school.nameZh,
      name_en: school.nameEn,
      coverage: school.coverage || "basic",
      item_count: related.length,
      latest_published_at: latest,
    };
  });
}

/**
 * @param {ReturnType<import("../store.js").createStore>} store
 * @param {string} schoolIdOrSlug
 */
export function getSchoolDetail(store, schoolIdOrSlug) {
  const school = getSchoolByIdOrSlug(schoolIdOrSlug);
  if (!school) return null;

  const latest_items = store
    .listIntelligenceItems({ publishedOnly: true, schoolId: school.id, limit: 40 })
    .sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0));

  const timeline = latest_items.slice(0, 30).map((item) => ({
    item_id: item.id,
    title_zh: item.locale?.titleZh || "",
    info_type: item.infoType,
    published_at: item.publishedAt,
    canonical_url: item.canonicalUrl,
  }));

  return {
    school: {
      school_id: school.id,
      slug: school.slug || school.id,
      name_zh: school.nameZh,
      name_en: school.nameEn,
      coverage: school.coverage || "basic",
    },
    overview: {
      item_count: latest_items.length,
      latest_published_at: latest_items[0]?.publishedAt || null,
    },
    latest_items,
    timeline,
  };
}
