import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  isFetchedWithinDays,
  buildFactCheckTable,
  filterFactCheckRowsForAsOf,
  renderFactCheckTableHtml,
  injectFactCheckIntoReportHtml,
  presentReportHtmlForAsOf,
  factContentFingerprint,
} from "../src/intelligence/fact-check-table.js";
import { createStore } from "../src/store.js";

test("isFetchedWithinDays: inclusive 31 Hong Kong calendar days", () => {
  assert.equal(isFetchedWithinDays("2026-09-22T04:00:00.000Z", "2026-10-23"), true); // 31 days span
  assert.equal(isFetchedWithinDays("2026-09-21T04:00:00.000Z", "2026-10-23"), false);
  assert.equal(isFetchedWithinDays("not-a-date", "2026-10-23"), false);
});

test("buildFactCheckTable: gate fail yields empty tableHtml and rows", () => {
  const items = [
    {
      id: "t1",
      infoType: "tuition",
      fetchedAt: "2026-10-20T04:00:00.000Z",
      locale: { summaryZh: "学费约 20 万港币" },
    },
  ];
  const runs = []; // no scheduler completed days
  const out = buildFactCheckTable({
    items,
    runs,
    asOfDate: "2026-10-23",
  });
  assert.equal(out.gatePassed, false);
  assert.deepEqual(out.rows, []);
  assert.equal(out.tableHtml, "");
});

test("buildFactCheckTable: gate pass includes tuition/deadline with fetchedAt within 31d", () => {
  const days = [
    "2026-10-17",
    "2026-10-18",
    "2026-10-19",
    "2026-10-20",
    "2026-10-21",
    "2026-10-22",
    "2026-10-23",
  ];
  const runs = days.map((d) => ({
    status: "completed",
    trigger: "scheduler",
    finishedAt: `${d}T04:00:00.000Z`,
  }));
  const items = [
    {
      id: "t1",
      infoType: "tuition",
      fetchedAt: "2026-10-20T04:00:00.000Z",
      locale: { summaryZh: "港大授课型硕士学费摘要" },
    },
    {
      id: "d1",
      infoType: "deadline",
      fetchedAt: "2026-10-19T04:00:00.000Z",
      locale: { titleZh: "申请截止" },
    },
    {
      id: "p1",
      infoType: "policy",
      fetchedAt: "2026-10-20T04:00:00.000Z",
      locale: { summaryZh: "政策" },
    },
    {
      id: "t2",
      infoType: "tuition",
      locale: { summaryZh: "无抓取日" },
    },
    {
      id: "t3",
      infoType: "tuition",
      fetchedAt: "2026-08-01T04:00:00.000Z",
      locale: { summaryZh: "过旧" },
    },
  ];
  const out = buildFactCheckTable({ items, runs, asOfDate: "2026-10-23" });
  assert.equal(out.gatePassed, true);
  assert.equal(out.rows.length, 2);
  assert.ok(out.rows.every((r) => r.fetchedDate && r.itemId && r.infoType && r.contentFingerprint));
  const t1Row = out.rows.find((r) => r.itemId === "t1");
  assert.equal(t1Row.contentFingerprint, factContentFingerprint("港大授课型硕士学费摘要"));
  assert.ok(out.tableHtml.includes('id="report-fact-check"'));
  assert.ok(out.tableHtml.includes("2026-10-20"));
  assert.ok(out.tableHtml.includes("2026-10-19"));
  assert.ok(!out.tableHtml.includes("数据可能变化")); // footer disclaimer must not be the only signal
});

test("filterFactCheckRowsForAsOf drops stale rows on open day", () => {
  const rows = [
    {
      itemId: "t1",
      infoType: "tuition",
      summary: "x",
      fetchedAt: "2026-09-01T04:00:00.000Z",
      fetchedDate: "2026-09-01",
    },
    {
      itemId: "t2",
      infoType: "tuition",
      summary: "y",
      fetchedAt: "2026-10-20T04:00:00.000Z",
      fetchedDate: "2026-10-20",
    },
  ];
  const filtered = filterFactCheckRowsForAsOf(rows, "2026-10-23");
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].itemId, "t2");
  const html = renderFactCheckTableHtml(filtered);
  assert.ok(html.includes("t2") || html.includes("y") || html.includes("2026-10-20"));
  assert.equal(renderFactCheckTableHtml([]), "");
});

test("presentReportHtmlForAsOf rebuilds fact-check section from stored rows", () => {
  const storedHtml = `<article class="study-report"><p>body</p><section class="report-chapter" id="report-fact-check">OLD</section></article>`;
  const rows = [
    {
      itemId: "t1",
      infoType: "tuition",
      summary: "fee",
      fetchedAt: "2026-09-01T04:00:00.000Z",
      fetchedDate: "2026-09-01",
    },
    {
      itemId: "t2",
      infoType: "tuition",
      summary: "fee2",
      fetchedAt: "2026-10-20T04:00:00.000Z",
      fetchedDate: "2026-10-20",
    },
  ];
  const { html, rows: visible } = presentReportHtmlForAsOf({
    html: storedHtml,
    factCheckRows: rows,
    asOfDate: "2026-10-23",
  });
  assert.equal(visible.length, 1);
  assert.ok(html.includes("2026-10-20"));
  assert.ok(!html.includes("OLD"));
});

test("injectFactCheckIntoReportHtml inserts section before closing article", () => {
  const base = `<article class="study-report"><section id="parent-summary">x</section><script type="application/json" id="report-visuals-data">{}</script></article>`;
  const table = `<section class="report-chapter" id="report-fact-check"><h2>学费与截止日期核对</h2></section>`;
  const out = injectFactCheckIntoReportHtml(base, table);
  assert.ok(out.includes('id="report-fact-check"'));
  assert.ok(out.includes('id="report-visuals-data"'));
  assert.equal(injectFactCheckIntoReportHtml(base, ""), base);
});

test("appendReportResult persists factCheckRows", () => {
  const dir = mkdtempSync(join(tmpdir(), "us1-rep-"));
  const store = createStore(join(dir, "db.json"));
  const rows = [
    {
      itemId: "t1",
      infoType: "tuition",
      summary: "fee",
      fetchedAt: "2026-10-20T04:00:00.000Z",
      fetchedDate: "2026-10-20",
    },
  ];
  const saved = store.appendReportResult({
    userId: "u1",
    planId: "p1",
    html: "<article></article>",
    factCheckRows: rows,
    wordCount: 1,
  });
  assert.equal(saved.factCheckRows.length, 1);
  assert.equal(saved.factCheckRows[0].itemId, "t1");
  rmSync(dir, { recursive: true, force: true });
});
