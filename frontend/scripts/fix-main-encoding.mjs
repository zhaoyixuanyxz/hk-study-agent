import { readFileSync, writeFileSync } from "node:fs";

const p = new URL("../src/main.js", import.meta.url);
let s = readFileSync(p, "utf8");

/* Missing closing " — PowerShell mangled UTF-8; 銆 (U+9286) + ? stood in for 。" */
s = s.replace(/\u9286\?;/g, '。";');
s = s.replace(/\u9286\?\)/g, '。")');
s = s.replace(/\u9286\?, true\)/g, '。", true)');
s = s.replace(/\u3002\?;/g, '。";');
s = s.replace(/\u3002\?\)/g, '。")');
s = s.replace(/\u3002\?, true\)/g, '。", true)');
/* Broken HTML end tags in templates */
s = s.replace(/\?\/p>/g, "</p>");
s = s.replace(/\?`/g, "`");

/* DIM_LABEL_CHAT broken mid-string quotes (language, timeline) */
s = s.replace(
  /const DIM_LABEL_CHAT = \{[\s\S]*?\n\};/,
  `const DIM_LABEL_CHAT = {
  academic: "学术背景",
  language: "语言与标化",
  goals: "目标方向",
  budget: "预算",
  timeline: "时间线",
  riskPreference: "风险偏好",
};`
);

writeFileSync(p, s, "utf8");
console.error("fix-main-encoding: wrote", p.pathname || p);
