#!/usr/bin/env node
/** Import every frontend page module to catch top-level ReferenceErrors. */
import { pathToFileURL } from "node:url";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const modules = [
  "pages/chat.js",
  "pages/profile.js",
  "pages/plan.js",
  "pages/report.js",
  "pages/history.js",
  "pages/intelligence.js",
  "shell/router.js",
  "shell/navigation.js",
  "main.js",
];

for (const rel of modules) {
  const url = pathToFileURL(join(root, rel)).href;
  try {
    await import(url);
    console.log("OK", rel);
  } catch (e) {
    console.error("FAIL", rel, e.message);
    process.exitCode = 1;
  }
}
