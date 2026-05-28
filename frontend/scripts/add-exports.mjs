import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const src = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const files = [
  "pages/chat.js",
  "pages/intelligence.js",
  "pages/profile.js",
  "pages/plan.js",
  "pages/report.js",
  "pages/history.js",
  "shell/router.js",
  "shell/navigation.js",
];

for (const rel of files) {
  const p = join(src, rel);
  let s = readFileSync(p, "utf8");
  s = s.replace(/^async function /gm, "export async function ");
  s = s.replace(/^function /gm, "export function ");
  writeFileSync(p, s, "utf8");
  console.log("exports:", rel);
}
