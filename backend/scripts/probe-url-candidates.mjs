#!/usr/bin/env node
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";
const candidates = {
  "hku-tuition": [
    "https://admissions.hku.hk/fees-and-funding",
    "https://admissions.hku.hk/tpg/fees",
    "https://admissions.hku.hk/apply/fees",
    "https://www.hku.hk/admission/fees.html",
  ],
  "cuhk-policy": [
    "https://www.cuhk.edu.hk/english/policies/procedures.html",
    "https://www.policy.cuhk.edu.hk/en/home",
    "https://www.cuhk.edu.hk/english/",
  ],
  "cuhk-tuition": [
    "https://www.gs.cuhk.edu.hk/admissions/fees-and-scholarships",
    "https://www.gradsch.cuhk.edu.hk/admissions/fees",
    "https://www.gs.cuhk.edu.hk/admissions/scholarships-and-financial-aid",
  ],
  "cuhk-program": [
    "https://www.gs.cuhk.edu.hk/admissions/programme",
    "https://www.gradsch.cuhk.edu.hk/admissions/programme",
    "https://www.gs.cuhk.edu.hk/admissions/programme-list",
  ],
  "cuhk-visa": [
    "https://www.gs.cuhk.edu.hk/admissions/visa-immigration",
    "https://www.gradsch.cuhk.edu.hk/admissions/visa",
  ],
  "cuhk-scholarship": [
    "https://www.gs.cuhk.edu.hk/admissions/scholarships-and-financial-aid",
    "https://www.gradsch.cuhk.edu.hk/admissions/scholarships",
  ],
  "hkust-policy": ["https://www.ust.hk/about", "https://hkust.edu.hk/about-the-university"],
  "hkust-admission": [
    "https://join.hkust.edu.hk/applynow",
    "https://fytgs.hkust.edu.hk/admissions",
    "https://pg.ust.hk/programs",
  ],
  "hkust-program": [
    "https://pg.ust.hk/programs",
    "https://fytgs.hkust.edu.hk/admissions/program-list",
    "https://join.hkust.edu.hk/explore-programs",
  ],
  "hkust-visa": [
    "https://fytgs.hkust.edu.hk/admissions/visa-immigration",
    "https://join.hkust.edu.hk/incoming-students",
  ],
  "hkust-scholarship": [
    "https://join.hkust.edu.hk/fees-and-scholarships",
    "https://fytgs.hkust.edu.hk/admissions/scholarships",
  ],
  "polyu-policy": ["https://www.polyu.edu.hk/about-polyu/", "https://www.polyu.edu.hk/about-polyu/mission"],
  "polyu-tuition": [
    "https://www.polyu.edu.hk/admissions/tuition-fees-and-scholarships/",
    "https://www.polyu.edu.hk/admissions/Postgraduate/",
  ],
  "polyu-admission": [
    "https://www.polyu.edu.hk/admissions/Postgraduate/",
    "https://www.polyu.edu.hk/admissions/",
  ],
  "polyu-program": [
    "https://www.polyu.edu.hk/admissions/Postgraduate/",
    "https://www40.polyu.edu.hk/pgstudies/",
  ],
  "polyu-visa": [
    "https://www.polyu.edu.hk/admissions/Postgraduate/international-students/",
    "https://www.polyu.edu.hk/admissions/",
  ],
  "hkbu-deadline": [
    "https://gs.hkbu.edu.hk/",
    "https://ar.hkbu.edu.hk/en/",
    "https://ar.hkbu.edu.hk/en/tpg/",
  ],
  "hkbu-tuition": [
    "https://gs.hkbu.edu.hk/admission/tuition-fees",
    "https://ar.hkbu.edu.hk/en/tpg/tuition-fees/",
  ],
  "hkbu-admission": [
    "https://gs.hkbu.edu.hk/admission/admission-requirements",
    "https://ar.hkbu.edu.hk/en/tpg/admission-requirements/",
  ],
  "hkbu-program": [
    "https://gs.hkbu.edu.hk/programmes",
    "https://ar.hkbu.edu.hk/en/tpg/programmes/",
  ],
  "hkbu-visa": [
    "https://gs.hkbu.edu.hk/admission/visa",
    "https://ar.hkbu.edu.hk/en/tpg/visa/",
  ],
  "hkbu-scholarship": [
    "https://gs.hkbu.edu.hk/admission/scholarships",
    "https://ar.hkbu.edu.hk/en/tpg/scholarships/",
  ],
  "hkbu-policy": [
    "https://www.hkbu.edu.hk/en/about/policies.html",
    "https://www.hkbu.edu.hk/en/about/",
  ],
  "lingnan-policy": ["https://www.ln.edu.hk/about/", "https://www.ln.edu.hk/about/mission"],
  "lingnan-tuition": [
    "https://www.ln.edu.hk/admissions/postgraduate/tuition-fees",
    "https://www.ln.edu.hk/admissions/tuition-fees/",
  ],
  "lingnan-admission": [
    "https://www.ln.edu.hk/admissions/postgraduate/",
    "https://www.ln.edu.hk/admissions/entry-requirements/",
  ],
  "lingnan-program": [
    "https://www.ln.edu.hk/admissions/postgraduate/programmes",
    "https://www.ln.edu.hk/admissions/programmes/",
  ],
  "lingnan-visa": [
    "https://www.ln.edu.hk/admissions/postgraduate/non-local-students",
    "https://www.ln.edu.hk/admissions/non-local-students/",
  ],
  "lingnan-scholarship": [
    "https://www.ln.edu.hk/admissions/postgraduate/scholarships",
    "https://www.ln.edu.hk/admissions/scholarships/",
  ],
  "eduhk-policy": [
    "https://www.eduhk.hk/en/about",
    "https://www.eduhk.hk/about/",
  ],
  "eduhk-deadline": [
    "https://www.eduhk.hk/en/postgraduate/",
    "https://www.eduhk.hk/postgrad/",
    "https://www.eduhk.hk/acadprog/postgraduate/",
  ],
  "eduhk-tuition": [
    "https://www.eduhk.hk/en/postgraduate/fees",
    "https://www.eduhk.hk/postgrad/fees",
  ],
  "eduhk-admission": [
    "https://www.eduhk.hk/en/postgraduate/admission",
    "https://www.eduhk.hk/postgrad/admission",
  ],
  "eduhk-program": [
    "https://www.eduhk.hk/en/postgraduate/programme",
    "https://www.eduhk.hk/postgrad/programme",
  ],
  "eduhk-visa": [
    "https://www.eduhk.hk/en/postgraduate/non-local",
    "https://www.eduhk.hk/postgrad/non-local",
  ],
  "eduhk-scholarship": [
    "https://www.eduhk.hk/en/postgraduate/scholarship",
    "https://www.eduhk.hk/postgrad/scholarship",
  ],
};

async function probe(url) {
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
      headers: { "User-Agent": UA, Accept: "text/html" },
    });
    const final = res.url || url;
    const soft404 =
      /notfound|404|page-not-found|error/i.test(final) && !/notfound/i.test(url);
    return { url, status: res.status, final, ok: res.ok && res.status < 400 && !soft404 };
  } catch (e) {
    return { url, status: 0, final: url, ok: false, error: e.message };
  }
}

for (const [id, urls] of Object.entries(candidates)) {
  console.log(`\n## ${id}`);
  for (const u of urls) {
    const r = await probe(u);
    console.log(r.ok ? "OK" : "NO", r.status, r.final, u, r.error || "");
  }
}
