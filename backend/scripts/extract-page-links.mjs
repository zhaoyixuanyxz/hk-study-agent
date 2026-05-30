#!/usr/bin/env node
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120";
const pages = [
  "https://www.gs.cuhk.edu.hk/admissions",
  "https://gs.hkbu.edu.hk/",
  "https://www.ln.edu.hk/sgs/for-prospective-students/taught-postgraduate-programmes/admission-information",
];
for (const url of pages) {
  const r = await fetch(url, { headers: { "User-Agent": UA }, redirect: "follow" });
  const html = await r.text();
  const base = new URL(r.url);
  const set = new Set();
  for (const m of html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)) {
    try {
      const abs = new URL(m[1], base).href;
      if (abs.startsWith(base.origin)) set.add(abs);
    } catch {}
  }
  console.log("\n===", r.url, r.status, "===");
  [...set]
    .filter((u) => /admission|fee|program|visa|scholar|deadline|tuition|postgrad|rpg|tpg/i.test(u))
    .sort()
    .forEach((u) => console.log(u));
}
