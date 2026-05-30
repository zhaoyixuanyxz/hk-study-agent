#!/usr/bin/env node
/**
 * Static audit: detect likely undefined identifiers in frontend/src pages.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

const BUILTINS = new Set([
  "console", "document", "window", "localStorage", "location", "fetch", "alert", "confirm", "prompt",
  "setTimeout", "setInterval", "clearTimeout", "clearInterval", "JSON", "Math", "Date", "Array",
  "Object", "String", "Number", "Boolean", "RegExp", "Error", "Promise", "Map", "Set", "Intl",
  "encodeURIComponent", "decodeURIComponent", "encodeURI", "decodeURI", "parseInt", "parseFloat",
  "isNaN", "undefined", "null", "true", "false", "NaN", "Infinity", "Event", "FormData", "URL",
  "AbortController", "AbortSignal", "HTMLElement", "Node", "MutationObserver", "requestAnimationFrame",
  "navigator", "history", "crypto", "structuredClone", "performance",
]);

const FILES = [];
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (p.endsWith(".js") && !p.endsWith(".test.js") && !p.endsWith(".legacy.js")) FILES.push(p);
  }
}
walk(root);

function parseFile(path) {
  const code = readFileSync(path, "utf8");
  const imported = new Set();
  const exported = new Set();
  const localFns = new Set();
  const issues = [];

  for (const m of code.matchAll(/import\s*\{([^}]+)\}\s*from\s*["']([^"']+)["']/g)) {
    for (const part of m[1].split(",")) {
      const alias = part.trim().split(/\s+as\s+/);
      imported.add((alias[1] || alias[0]).trim());
    }
  }
  for (const m of code.matchAll(/import\s+(\w+)\s+from\s*["']/g)) imported.add(m[1]);
  for (const m of code.matchAll(/import\s*\*\s*as\s+(\w+)\s+from/g)) imported.add(m[1]);

  for (const m of code.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g)) exported.add(m[1]);
  for (const m of code.matchAll(/(?:^|\n)\s*(?:async\s+)?function\s+(\w+)\s*\(/g)) localFns.add(m[1]);
  for (const m of code.matchAll(/(?:const|let)\s+(\w+)\s*=\s*(?:async\s*)?\(/g)) localFns.add(m[1]);

  // import * as X then X.prop = 
  if (/import\s*\*\s*as\s+(\w+)/.test(code)) {
    const ns = code.match(/import\s*\*\s*as\s+(\w+)/)[1];
    if (new RegExp(`\\b${ns}\\.\\w+\\s*=`).test(code)) {
      issues.push({ kind: "namespace-assign", msg: `${ns}.prop = ... may throw on ES module namespace` });
    }
  }

  // assignment to known app-state imports
  const appStateImports = [...code.matchAll(/import\s*\{([^}]+)\}\s*from\s*["']\.\.\/app-state\.js["']/g)];
  for (const block of appStateImports) {
    for (const part of block[1].split(",")) {
      const name = part.trim().split(/\s+as\s+/)[0].trim();
      if (name.startsWith("set")) continue;
      if (new RegExp(`\\b${name}\\s*=`).test(code)) {
        issues.push({ kind: "import-assign", msg: `Assignment to imported binding '${name}' (use setter in app-state.js)` });
      }
    }
  }

  const callLike = code.matchAll(/\b([A-Za-z_$][\w$]*)\s*\(/g);
  for (const m of callLike) {
    const id = m[1];
    if (BUILTINS.has(id)) continue;
    if (imported.has(id) || localFns.has(id) || exported.has(id)) continue;
    if (/^[a-z]/.test(id)) continue; // skip methods like .addEventListener patterns mostly lowercase at call site... actually many fns lowercase

    // only flag PascalCase or known legacy helpers
    const suspicious =
      /^[A-Z]/.test(id) ||
      ["formatAssistantHtml", "escapeHtml", "loadThread", "loadProfile", "loadPlanPage", "loadReportPage",
        "loadHistoryPage", "loadIntelligencePage", "renderMessages", "setStatus", "el", "enterComposerCorrectionDraft",
        "resetComposerReplaceDraftQuiet", "navigateTo", "showPanel", "handleRoute", "api", "track",
      ].includes(id);
    if (!suspicious) continue;

    issues.push({ kind: "maybe-undefined", msg: `Call '${id}()' — not imported or defined locally` });
  }

  return { path, issues };
}

let total = 0;
for (const f of FILES) {
  const rel = relative(join(root, ".."), f);
  const { issues } = parseFile(f);
  if (issues.length) {
    console.log(`\n## ${rel}`);
    for (const i of issues) console.log(`  [${i.kind}] ${i.msg}`);
    total += issues.length;
  }
}
console.log(`\n--- Audit: ${total} potential issue(s) in ${FILES.length} files ---`);
process.exit(total ? 1 : 0);
