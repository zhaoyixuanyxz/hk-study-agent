/**
 * Official crawl targets: 8 schools × 7 info types (56 feeds).
 * URLs are admissions / fees / policy pages on each university domain.
 */
export const INFO_TYPES = [
  "policy",
  "deadline",
  "tuition",
  "admission",
  "program",
  "visa",
  "scholarship",
];

/** @type {Record<string, { sourceId: string, baseHost: string, pages: Record<string, string> }>} */
export const SCHOOL_CRAWL_PROFILES = {
  hku: {
    sourceId: "hku-official",
    baseHost: "https://www.hku.hk",
    pages: {
      policy: "https://www.hku.hk/",
      deadline: "https://admissions.hku.hk/",
      tuition: "https://admissions.hku.hk/fees",
      admission: "https://admissions.hku.hk/",
      program: "https://admissions.hku.hk/",
      visa: "https://admissions.hku.hk/",
      scholarship: "https://admissions.hku.hk/",
    },
  },
  cuhk: {
    sourceId: "cuhk-official",
    baseHost: "https://www.cuhk.edu.hk",
    pages: {
      policy: "https://www.cuhk.edu.hk/english/policies.html",
      deadline: "https://www.gs.cuhk.edu.hk/admissions",
      tuition: "https://www.gs.cuhk.edu.hk/admissions/fees",
      admission: "https://www.gs.cuhk.edu.hk/admissions/requirements",
      program: "https://www.gs.cuhk.edu.hk/admissions/programmes",
      visa: "https://www.gs.cuhk.edu.hk/admissions/international-students",
      scholarship: "https://www.gs.cuhk.edu.hk/admissions/scholarships",
    },
  },
  hkust: {
    sourceId: "hkust-official",
    baseHost: "https://hkust.edu.hk",
    pages: {
      policy: "https://hkust.edu.hk/about/policies",
      deadline: "https://join.hkust.edu.hk/",
      tuition: "https://join.hkust.edu.hk/fees",
      admission: "https://join.hkust.edu.hk/admission-requirements",
      program: "https://join.hkust.edu.hk/program-list",
      visa: "https://join.hkust.edu.hk/international-students",
      scholarship: "https://join.hkust.edu.hk/scholarships",
    },
  },
  polyu: {
    sourceId: "polyu-official",
    baseHost: "https://www.polyu.edu.hk",
    pages: {
      policy: "https://www.polyu.edu.hk/about-polyu/mission-and-vision/",
      deadline: "https://www.polyu.edu.hk/admissions/",
      tuition: "https://www.polyu.edu.hk/admissions/tuition-fees/",
      admission: "https://www.polyu.edu.hk/admissions/entry-requirements/",
      program: "https://www.polyu.edu.hk/admissions/programmes/",
      visa: "https://www.polyu.edu.hk/admissions/international-students/",
      scholarship: "https://www.polyu.edu.hk/admissions/scholarships/",
    },
  },
  cityu: {
    sourceId: "cityu-official",
    baseHost: "https://www.cityu.edu.hk",
    pages: {
      policy: "https://www.cityu.edu.hk/about/policies",
      deadline: "https://www.cityu.edu.hk/admo/admissions",
      tuition: "https://www.cityu.edu.hk/admo/fees",
      admission: "https://www.cityu.edu.hk/admo/entry-requirements",
      program: "https://www.cityu.edu.hk/admo/programmes",
      visa: "https://www.cityu.edu.hk/admo/non-local",
      scholarship: "https://www.cityu.edu.hk/admo/scholarships",
    },
  },
  hkbu: {
    sourceId: "hkbu-official",
    baseHost: "https://www.hkbu.edu.hk",
    pages: {
      policy: "https://www.hkbu.edu.hk/about/policies",
      deadline: "https://ar.hkbu.edu.hk/tpg/",
      tuition: "https://ar.hkbu.edu.hk/tpg/tuition-fees/",
      admission: "https://ar.hkbu.edu.hk/tpg/admissions-requirements/",
      program: "https://ar.hkbu.edu.hk/tpg/programmes/",
      visa: "https://ar.hkbu.edu.hk/tpg/international-students/",
      scholarship: "https://ar.hkbu.edu.hk/tpg/scholarships/",
    },
  },
  lingnan: {
    sourceId: "lingnan-official",
    baseHost: "https://www.ln.edu.hk",
    pages: {
      policy: "https://www.ln.edu.hk/about/policies",
      deadline: "https://www.ln.edu.hk/admissions/",
      tuition: "https://www.ln.edu.hk/admissions/tuition-fees/",
      admission: "https://www.ln.edu.hk/admissions/entry-requirements/",
      program: "https://www.ln.edu.hk/admissions/programmes/",
      visa: "https://www.ln.edu.hk/admissions/non-local-students/",
      scholarship: "https://www.ln.edu.hk/admissions/scholarships/",
    },
  },
  eduhk: {
    sourceId: "eduhk-official",
    baseHost: "https://www.eduhk.hk",
    pages: {
      policy: "https://www.eduhk.hk/about/policies",
      deadline: "https://www.eduhk.hk/acadprog/postgrad/",
      tuition: "https://www.eduhk.hk/acadprog/postgrad/fees",
      admission: "https://www.eduhk.hk/acadprog/postgrad/admission",
      program: "https://www.eduhk.hk/acadprog/postgrad/programme",
      visa: "https://www.eduhk.hk/acadprog/postgrad/non-local",
      scholarship: "https://www.eduhk.hk/acadprog/postgrad/scholarship",
    },
  },
};

/**
 * @returns {Array<{ id: string, url: string, sourceId: string, schoolIds: string[], infoType: string }>}
 */
function resolveFeedUrl(profile, infoType) {
  const custom = profile.pages[infoType];
  if (custom) return custom;
  const base = profile.baseHost.replace(/\/$/, "");
  return `${base}/?study_agent_feed=${infoType}`;
}

export function buildCrawlFeeds() {
  const feeds = [];
  for (const [schoolId, profile] of Object.entries(SCHOOL_CRAWL_PROFILES)) {
    for (const infoType of INFO_TYPES) {
      const url = resolveFeedUrl(profile, infoType);
      feeds.push({
        id: `${schoolId}-${infoType}`,
        url,
        sourceId: profile.sourceId,
        schoolIds: [schoolId],
        infoType,
      });
    }
  }
  return feeds;
}
