/**
 * Guards modular split: symbols used in a file must be imported or defined locally.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = dirname(fileURLToPath(import.meta.url));

function read(rel) {
  return readFileSync(join(SRC, rel), "utf8");
}

/** @param {string} src */
function importedNames(src) {
  const names = new Set();
  for (const m of src.matchAll(/import\s*\{([^}]+)\}\s*from/g)) {
    for (const part of m[1].split(",")) {
      const bit = part.trim();
      if (!bit) continue;
      const alias = bit.split(/\s+as\s+/);
      names.add((alias[1] || alias[0]).trim());
    }
  }
  for (const m of src.matchAll(/import\s+(\w+)\s+from/g)) names.add(m[1]);
  return names;
}

/** @param {string} src */
function localDefinitions(src) {
  const names = new Set();
  for (const m of src.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g)) names.add(m[1]);
  for (const m of src.matchAll(/(?:^|\n)\s*(?:async\s+)?function\s+(\w+)\s*\(/g)) names.add(m[1]);
  return names;
}

/**
 * @param {string} file
 * @param {string[]} symbols
 */
function assertSymbolsWired(file, symbols) {
  const src = read(file);
  const imports = importedNames(src);
  const locals = localDefinitions(src);
  for (const sym of symbols) {
    const used = new RegExp(`\\b${sym}\\b`).test(src);
    if (!used) continue;
    assert.ok(
      imports.has(sym) || locals.has(sym),
      `${file}: uses ${sym} but missing import or local definition`,
    );
  }
}

test("chat.js wires composer + formatAssistantHtml", () => {
  assertSymbolsWired("pages/chat.js", [
    "formatAssistantHtml",
    "loadThread",
    "setComposerReplacementUserMessageId",
    "resetComposerCorrectionDraftState",
  ]);
});

test("plan.js wires renderPlanReportGate", () => {
  assertSymbolsWired("pages/plan.js", [
    "renderPlanReportGate",
    "appendPlanCitationSection",
    "renderTierFitNoteHtml",
    "buildPlanExecutionActions",
  ]);
});

test("report.js wires enhanceReportPage", () => {
  assertSymbolsWired("pages/report.js", ["enhanceReportPage", "navigateTo", "parseHash", "setCurrentReportDetail"]);
});

test("profile.js wires loadThread", () => {
  assertSymbolsWired("pages/profile.js", ["loadThread", "loadProfile"]);
});

test("history.js wires navigation + thread loaders", () => {
  assertSymbolsWired("pages/history.js", ["loadThread", "loadProfile", "navigateTo", "downloadReportPdf"]);
});

test("app-state.js does not assign via namespace import pattern", () => {
  const src = read("pages/chat.js");
  assert.ok(!/import\s*\*\s*as\s+appState/.test(src), "chat.js must not use import * as appState");
});
