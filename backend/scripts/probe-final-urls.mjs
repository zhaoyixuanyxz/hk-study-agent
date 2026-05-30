#!/usr/bin/env node
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120";
const urls = {
  "hku-tuition": "https://admissions.hku.hk/tpg/fees",
  "cuhk-policy": "https://www.cuhk.edu.hk/english/",
  "cuhk-deadline": "https://www.gs.cuhk.edu.hk/admissions/application-deadline",
  "cuhk-tuition": "https://www.gs.cuhk.edu.hk/admissions/scholarships-fees/fees",
  "cuhk-admission": "https://www.gs.cuhk.edu.hk/admissions/how-to-apply",
  "cuhk-program": "https://www.gs.cuhk.edu.hk/programmes",
  "cuhk-visa": "https://www.gs.cuhk.edu.hk/registration/visa-application",
  "cuhk-scholarship": "https://www.gs.cuhk.edu.hk/admissions/scholarships-fees/scholarships",
  "hkust-policy": "https://hkust.edu.hk/about",
  "hkust-deadline": "https://join.hkust.edu.hk/",
  "hkust-tuition": "https://join.hkust.edu.hk/fees-and-scholarships",
  "hkust-admission": "https://fytgs.hkust.edu.hk/admissions",
  "hkust-program": "https://pg.ust.hk/programs",
  "hkust-visa": "https://fytgs.hkust.edu.hk/admissions/Admission-to-Hong-Kong-Campus/after-getting-an-offer/applying-student-visa",
  "hkust-scholarship": "https://join.hkust.edu.hk/fees-and-scholarships",
  "polyu-policy": "https://www.polyu.edu.hk/about-polyu/",
  "polyu-tuition": "https://www.polyu.edu.hk/admissions/tuition-fees-and-scholarships/",
  "polyu-admission": "https://www.polyu.edu.hk/admissions/postgraduate/",
  "polyu-program": "https://www.polyu.edu.hk/admissions/postgraduate/",
  "polyu-visa": "https://www.polyu.edu.hk/admissions/",
  "hkbu-policy": "https://www.hkbu.edu.hk/en/about.html",
  "hkbu-deadline": "https://gs.hkbu.edu.hk/admission/research-postgraduate-programmes/application/admission-timeline",
  "hkbu-tuition": "https://gs.hkbu.edu.hk/fees-scholarships-and-financial-aid",
  "hkbu-admission": "https://gs.hkbu.edu.hk/admission/research-postgraduate-programmes/application/admission-requirements",
  "hkbu-program": "https://gs.hkbu.edu.hk/programmes",
  "hkbu-visa": "https://gs.hkbu.edu.hk/admission/research-postgraduate-programmes/application/after-getting-an-offer/apply-for-student-visa",
  "hkbu-scholarship": "https://gs.hkbu.edu.hk/fees-scholarships-and-financial-aid/scholarship-for-admission",
  "lingnan-policy": "https://www.ln.edu.hk/en/about/the-university/mission",
  "lingnan-deadline": "https://www.ln.edu.hk/sgs/for-prospective-students/taught-postgraduate-programmes/admission-information",
  "lingnan-tuition": "https://www.ln.edu.hk/sgs/for-prospective-students/taught-postgraduate-programmes/admission-information",
  "lingnan-admission": "https://www.ln.edu.hk/sgs/for-prospective-students/taught-postgraduate-programmes/admission-information",
  "lingnan-program": "https://www.ln.edu.hk/sgs/for-prospective-students/taught-postgraduate-programmes",
  "lingnan-visa": "https://www.ln.edu.hk/rpg/admission",
  "lingnan-scholarship": "https://www.ln.edu.hk/sgs/for-prospective-students/taught-postgraduate-programmes/admission-information",
  "eduhk-policy": "https://www.eduhk.hk/acadprog/postgrad/index.html",
  "eduhk-deadline": "https://gs.eduhk.hk/pg-programmes-2026/application-admission.html",
  "eduhk-tuition": "https://gs.eduhk.hk/prospective/med/tuition-fee-scholarships/",
  "eduhk-admission": "https://gs.eduhk.hk/pg-programmes-2026/application-admission.html",
  "eduhk-program": "https://www.eduhk.hk/acadprog/postgrad/index.html",
  "eduhk-visa": "https://gs.eduhk.hk/pg-programmes-2026/application-admission.html",
  "eduhk-scholarship": "https://gs.eduhk.hk/prospective/med/tuition-fee-scholarships/",
};
async function probe(url) {
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(20000),
      headers: { "User-Agent": UA },
    });
    const final = res.url || url;
    const soft404 = /notfound|404\.html|page-not-found/i.test(final);
    return { ok: res.ok && res.status < 400 && !soft404, status: res.status, final };
  } catch (e) {
    return { ok: false, status: 0, final: url, error: e.message };
  }
}
let fail = 0;
for (const [id, url] of Object.entries(urls)) {
  const r = await probe(url);
  if (!r.ok) fail++;
  console.log(`${r.ok ? "OK" : "NO"}\t${r.status}\t${id}\t${r.final}${r.error ? "\t" + r.error : ""}`);
}
console.log("fail", fail);
process.exit(fail ? 1 : 0);
