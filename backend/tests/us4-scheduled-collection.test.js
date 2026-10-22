import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveCollectionTrigger,
  hongKongCalendarDate,
} from "../src/intelligence/collection-trigger.js";

test("resolveCollectionTrigger: scheduler only when env is exactly scheduler", () => {
  assert.equal(resolveCollectionTrigger({ COLLECTION_TRIGGER: "scheduler" }), "scheduler");
  assert.equal(resolveCollectionTrigger({}), "manual");
  assert.equal(resolveCollectionTrigger({ COLLECTION_TRIGGER: "manual" }), "manual");
  assert.equal(resolveCollectionTrigger({ COLLECTION_TRIGGER: "SCHEDULER" }), "manual");
  assert.equal(resolveCollectionTrigger({ COLLECTION_TRIGGER: " cron " }), "manual");
});

test("hongKongCalendarDate maps UTC instant to Asia/Hong_Kong YYYY-MM-DD", () => {
  // 2026-10-21 18:00 UTC = 2026-10-22 02:00 HKT
  assert.equal(hongKongCalendarDate("2026-10-21T18:00:00.000Z"), "2026-10-22");
  // 2026-10-21 15:59 UTC = 2026-10-21 23:59 HKT
  assert.equal(hongKongCalendarDate("2026-10-21T15:59:00.000Z"), "2026-10-21");
});

import { checkSevenDaySchedulerGate } from "../src/intelligence/collection-gate.js";

function run(partial) {
  return {
    status: "completed",
    trigger: "scheduler",
    finishedAt: "2026-10-20T06:00:00.000Z",
    ...partial,
  };
}

test("checkSevenDaySchedulerGate passes when each of 7 HK days has scheduler completed", () => {
  const asOfDate = "2026-10-22";
  const days = [
    "2026-10-16",
    "2026-10-17",
    "2026-10-18",
    "2026-10-19",
    "2026-10-20",
    "2026-10-21",
    "2026-10-22",
  ];
  const runs = days.map((day) =>
    run({ finishedAt: `${day}T04:00:00.000Z` }) // 04:00Z = 12:00 HKT same calendar day
  );
  const result = checkSevenDaySchedulerGate({ asOfDate, runs });
  assert.equal(result.passed, true);
  assert.deepEqual(
    result.days.map((d) => d.date),
    days
  );
  assert.ok(result.days.every((d) => d.ok === true));
});

test("checkSevenDaySchedulerGate fails when one day missing", () => {
  const asOfDate = "2026-10-22";
  const runs = [
    run({ finishedAt: "2026-10-16T04:00:00.000Z" }),
    run({ finishedAt: "2026-10-17T04:00:00.000Z" }),
    run({ finishedAt: "2026-10-18T04:00:00.000Z" }),
    run({ finishedAt: "2026-10-19T04:00:00.000Z" }),
    run({ finishedAt: "2026-10-20T04:00:00.000Z" }),
    run({ finishedAt: "2026-10-21T04:00:00.000Z" }),
    // missing 2026-10-22
  ];
  const result = checkSevenDaySchedulerGate({ asOfDate, runs });
  assert.equal(result.passed, false);
  const d22 = result.days.find((d) => d.date === "2026-10-22");
  assert.equal(d22.ok, false);
});

test("checkSevenDaySchedulerGate ignores manual, failed, and missing trigger", () => {
  const asOfDate = "2026-10-22";
  const baseDays = [
    "2026-10-16",
    "2026-10-17",
    "2026-10-18",
    "2026-10-19",
    "2026-10-20",
    "2026-10-21",
    "2026-10-22",
  ];
  const runs = [
    ...baseDays.slice(0, 6).map((day) => run({ finishedAt: `${day}T04:00:00.000Z` })),
    run({ finishedAt: "2026-10-22T04:00:00.000Z", trigger: "manual" }),
    run({ finishedAt: "2026-10-22T05:00:00.000Z", status: "failed", trigger: "scheduler" }),
    { status: "completed", finishedAt: "2026-10-22T06:00:00.000Z" }, // no trigger
  ];
  const result = checkSevenDaySchedulerGate({ asOfDate, runs });
  assert.equal(result.passed, false);
  assert.equal(result.days.find((d) => d.date === "2026-10-22").ok, false);
});

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createStore } from "../src/store.js";

test("appendIntelligenceCollectionRun persists trigger scheduler or manual", () => {
  const dir = mkdtempSync(join(tmpdir(), "us4-store-"));
  const store = createStore(join(dir, "db.json"));
  const a = store.appendIntelligenceCollectionRun({
    status: "completed",
    itemsIngested: 1,
    trigger: "scheduler",
    startedAt: "2026-10-22T06:00:00.000Z",
    finishedAt: "2026-10-22T06:05:00.000Z",
  });
  assert.equal(a.trigger, "scheduler");
  const b = store.appendIntelligenceCollectionRun({
    status: "failed",
    itemsIngested: 0,
    trigger: "manual",
    errorMessage: "boom",
    startedAt: "2026-10-22T07:00:00.000Z",
    finishedAt: "2026-10-22T07:01:00.000Z",
  });
  assert.equal(b.trigger, "manual");
  assert.equal(b.status, "failed");
  const listed = store.listIntelligenceCollectionRuns({ limit: 10 });
  assert.ok(listed.some((r) => r.id === a.id && r.trigger === "scheduler"));
  assert.ok(listed.some((r) => r.id === b.id && r.trigger === "manual"));
  rmSync(dir, { recursive: true, force: true });
});

test("appendIntelligenceCollectionRun defaults missing trigger to manual", () => {
  const dir = mkdtempSync(join(tmpdir(), "us4-store2-"));
  const store = createStore(join(dir, "db.json"));
  const row = store.appendIntelligenceCollectionRun({
    status: "completed",
    itemsIngested: 0,
  });
  assert.equal(row.trigger, "manual");
  rmSync(dir, { recursive: true, force: true });
});

test("runIngestion records trigger from COLLECTION_TRIGGER", async () => {
  const dir = mkdtempSync(join(tmpdir(), "us4-ing-"));
  const store = createStore(join(dir, "db.json"));
  const prev = process.env.COLLECTION_TRIGGER;
  const prevFetch = process.env.INTELLIGENCE_FETCH;
  process.env.COLLECTION_TRIGGER = "scheduler";
  process.env.INTELLIGENCE_FETCH = "0";
  try {
    const { runIngestion } = await import("../src/intelligence/ingestion-service.js");
    const result = await runIngestion(store, {});
    assert.equal(result.run.trigger, "scheduler");
  } finally {
    if (prev === undefined) delete process.env.COLLECTION_TRIGGER;
    else process.env.COLLECTION_TRIGGER = prev;
    if (prevFetch === undefined) delete process.env.INTELLIGENCE_FETCH;
    else process.env.INTELLIGENCE_FETCH = prevFetch;
    rmSync(dir, { recursive: true, force: true });
  }
});

test("runIngestion records manual when COLLECTION_TRIGGER unset", async () => {
  const dir = mkdtempSync(join(tmpdir(), "us4-ing2-"));
  const store = createStore(join(dir, "db.json"));
  const prev = process.env.COLLECTION_TRIGGER;
  const prevFetch = process.env.INTELLIGENCE_FETCH;
  delete process.env.COLLECTION_TRIGGER;
  process.env.INTELLIGENCE_FETCH = "0";
  try {
    const { runIngestion } = await import("../src/intelligence/ingestion-service.js");
    const result = await runIngestion(store, {});
    assert.equal(result.run.trigger, "manual");
  } finally {
    if (prev !== undefined) process.env.COLLECTION_TRIGGER = prev;
    if (prevFetch === undefined) delete process.env.INTELLIGENCE_FETCH;
    else process.env.INTELLIGENCE_FETCH = prevFetch;
    rmSync(dir, { recursive: true, force: true });
  }
});

test("runRealCrawl records trigger from COLLECTION_TRIGGER without network", async () => {
  const dir = mkdtempSync(join(tmpdir(), "us4-crawl-"));
  const store = createStore(join(dir, "db.json"));
  const prev = process.env.COLLECTION_TRIGGER;
  const prevFetch = process.env.INTELLIGENCE_FETCH;
  process.env.COLLECTION_TRIGGER = "scheduler";
  process.env.INTELLIGENCE_FETCH = "1";
  try {
    const { runRealCrawl } = await import("../src/intelligence/real-crawler.js");
    const result = await runRealCrawl(store, { fetchEnabled: false, feeds: [] });
    assert.equal(result.run.trigger, "scheduler");
  } finally {
    if (prev === undefined) delete process.env.COLLECTION_TRIGGER;
    else process.env.COLLECTION_TRIGGER = prev;
    if (prevFetch === undefined) delete process.env.INTELLIGENCE_FETCH;
    else process.env.INTELLIGENCE_FETCH = prevFetch;
    rmSync(dir, { recursive: true, force: true });
  }
});

test("runRealCrawl records manual when COLLECTION_TRIGGER unset without network", async () => {
  const dir = mkdtempSync(join(tmpdir(), "us4-crawl2-"));
  const store = createStore(join(dir, "db.json"));
  const prev = process.env.COLLECTION_TRIGGER;
  const prevFetch = process.env.INTELLIGENCE_FETCH;
  delete process.env.COLLECTION_TRIGGER;
  process.env.INTELLIGENCE_FETCH = "1";
  try {
    const { runRealCrawl } = await import("../src/intelligence/real-crawler.js");
    const result = await runRealCrawl(store, { fetchEnabled: false, feeds: [] });
    assert.equal(result.run.trigger, "manual");
  } finally {
    if (prev !== undefined) process.env.COLLECTION_TRIGGER = prev;
    if (prevFetch === undefined) delete process.env.INTELLIGENCE_FETCH;
    else process.env.INTELLIGENCE_FETCH = prevFetch;
    rmSync(dir, { recursive: true, force: true });
  }
});
