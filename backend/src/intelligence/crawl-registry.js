/**
 * Official crawl targets: 8 schools × 7 info types (56 feeds).
 * URLs verified 2026-05 — use npm run intelligence:check-urls to re-validate.
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
      tuition: "https://admissions.hku.hk/tpg/fees",
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
      policy: "https://www.cuhk.edu.hk/english/",
      deadline: "https://www.gs.cuhk.edu.hk/admissions/application-deadline",
      tuition: "https://www.gs.cuhk.edu.hk/admissions/scholarships-fees/fees",
      admission: "https://www.gs.cuhk.edu.hk/admissions/how-to-apply",
      program: "https://www.gs.cuhk.edu.hk/programmes",
      visa: "https://www.gs.cuhk.edu.hk/registration/visa-application",
      scholarship: "https://www.gs.cuhk.edu.hk/admissions/scholarships-fees/scholarships",
    },
  },
  hkust: {
    sourceId: "hkust-official",
    baseHost: "https://hkust.edu.hk",
    pages: {
      policy: "https://hkust.edu.hk/about",
      deadline: "https://join.hkust.edu.hk/",
      tuition: "https://join.hkust.edu.hk/fees-and-scholarships",
      admission: "https://join.hkust.edu.hk/admissions",
      program: "https://pg.ust.hk/programs",
      visa: "https://fytgs.hkust.edu.hk/admissions/Admission-to-Hong-Kong-Campus/after-getting-an-offer/applying-student-visa",
      scholarship: "https://join.hkust.edu.hk/fees-and-scholarships",
    },
  },
  polyu: {
    sourceId: "polyu-official",
    baseHost: "https://www.polyu.edu.hk",
    pages: {
      policy: "https://www.polyu.edu.hk/about-polyu/",
      deadline: "https://www.polyu.edu.hk/admissions/",
      tuition: "https://www.polyu.edu.hk/admissions/tuition-fees-and-scholarships/",
      admission: "https://www.polyu.edu.hk/admissions/postgraduate/",
      program: "https://www.polyu.edu.hk/admissions/postgraduate/",
      visa: "https://www.polyu.edu.hk/admissions/",
      scholarship: "https://www.polyu.edu.hk/admissions/tuition-fees-and-scholarships/",
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
      policy: "https://www.hkbu.edu.hk/en/about.html",
      deadline:
        "https://gs.hkbu.edu.hk/admission/research-postgraduate-programmes/application/admission-timeline",
      tuition: "https://gs.hkbu.edu.hk/fees-scholarships-and-financial-aid",
      admission:
        "https://gs.hkbu.edu.hk/admission/research-postgraduate-programmes/application/admission-requirements",
      program: "https://gs.hkbu.edu.hk/programmes",
      visa: "https://gs.hkbu.edu.hk/admission/research-postgraduate-programmes/application/after-getting-an-offer/apply-for-student-visa",
      scholarship: "https://gs.hkbu.edu.hk/fees-scholarships-and-financial-aid/scholarship-for-admission",
    },
  },
  lingnan: {
    sourceId: "lingnan-official",
    baseHost: "https://www.ln.edu.hk",
    pages: {
      policy: "https://www.ln.edu.hk/en/",
      deadline:
        "https://www.ln.edu.hk/sgs/for-prospective-students/taught-postgraduate-programmes/admission-information",
      tuition:
        "https://www.ln.edu.hk/sgs/for-prospective-students/taught-postgraduate-programmes/admission-information",
      admission:
        "https://www.ln.edu.hk/sgs/for-prospective-students/taught-postgraduate-programmes/admission-information",
      program: "https://www.ln.edu.hk/sgs/programmes-on-offer",
      visa: "https://www.ln.edu.hk/rpg/admission",
      scholarship:
        "https://www.ln.edu.hk/sgs/for-prospective-students/taught-postgraduate-programmes/ftss",
    },
  },
  eduhk: {
    sourceId: "eduhk-official",
    baseHost: "https://www.eduhk.hk",
    pages: {
      policy: "https://gs.eduhk.hk/",
      deadline: "https://gs.eduhk.hk/pg-programmes-2026/application-admission.html",
      tuition: "https://gs.eduhk.hk/prospective/med/tuition-fee-scholarships/",
      admission: "https://gs.eduhk.hk/pg-programmes-2026/application-admission.html",
      program: "https://gs.eduhk.hk/pg-programmes-2026/",
      visa: "https://gs.eduhk.hk/pg-programmes-2026/application-admission.html",
      scholarship: "https://gs.eduhk.hk/prospective/med/tuition-fee-scholarships/",
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
