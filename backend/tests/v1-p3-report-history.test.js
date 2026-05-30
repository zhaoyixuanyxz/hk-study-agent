import assert from "node:assert";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { buildApp } from "../src/app.js";
import { buildMockStructuredPlan } from "../src/planning-service.js";
import { reportShareStatus, createStore } from "../src/store.js";
import { loadCuratedSeedsIntoStore } from "../src/intelligence/seed-loader.js";
import { buildCombinedIntelContext } from "../src/intelligence/intelContextPack.js";

function headers(token) {
  return { authorization: `Bearer ${token}` };
}

test("V1-P3 legacy report row gets citation_count 0 and share_status none", async () => {
  const dir = mkdtempSync(join(tmpdir(), "sa-v1p3-leg-"));
  const db = join(dir, "db.json");
  writeFileSync(db, JSON.stringify({ users: [], threads: [], messages: [] }), "utf8");
  process.env.DEEPSEEK_API_KEY = "";
  const app = buildApp({ dataFile: db });

  const reg = JSON.parse((await app.inject({ method: "POST", url: "/api/v1/users/register" })).body);
  const { user_id: userId, token } = reg;

  const raw = JSON.parse(readFileSync(db, "utf8"));
  raw.reportResults = [
    {
      id: "rep_legacy_only",
      userId,
      planId: null,
      snapshotId: null,
      snapshotVersion: null,
      reportSchemaVersion: "1.0",
      html: '<article class="study-report"><p>legacy</p></article>',
      chapterCount: 7,
      wordCount: 20,
      createdAt: new Date().toISOString(),
    },
  ];
  writeFileSync(db, JSON.stringify(raw, null, 2), "utf8");

  const list = JSON.parse(
    (await app.inject({ method: "GET", url: "/api/v1/reports", headers: headers(token) })).body
  );
  assert.equal(list.reports.length, 1);
  assert.equal(list.reports[0].citation_count, 0);
  assert.equal(list.reports[0].share_status, "none");
  assert.equal(list.reports[0].title, "");
  const legacyRow = { ...list.reports[0], share: { enabled: false, token: null, createdAt: null, revokedAt: null } };
  assert.equal(reportShareStatus(legacyRow), "none");
});

test("V1-P3 share public view increments count; revoke blocks public", async () => {
  const dir = mkdtempSync(join(tmpdir(), "sa-v1p3-shr-"));
  const db = join(dir, "db.json");
  writeFileSync(db, JSON.stringify({ users: [], threads: [], messages: [] }), "utf8");
  process.env.DEEPSEEK_API_KEY = "";
  const app = buildApp({ dataFile: db });

  const reg = JSON.parse((await app.inject({ method: "POST", url: "/api/v1/users/register" })).body);
  const { user_id: userId, token } = reg;
  loadCuratedSeedsIntoStore(createStore(db), { force: true });

  const raw = JSON.parse(readFileSync(db, "utf8"));
  raw.profileSnapshots = [
    {
      id: "snap_p3",
      userId,
      version: 1,
      snapshot: {
        summary: "测试摘要",
        structuredFacts: {},
        gaps: [],
        confirmationState: { facts: [] },
        updatedAt: new Date().toISOString(),
      },
      planInputView: {
        schemaVersion: "1.0",
        academic: { value: { gpa: "3.5", school_background: "211" }, source: "confirmed" },
        goals: { value: { target_region: "香港", field: "计算机" }, source: "confirmed" },
        budget: { value: { budget_range: "30万港币" }, source: "confirmed" },
        timeline: { value: { intake_or_season: "2026秋" }, source: "confirmed" },
        riskPreference: { value: { risk_style: "balanced" }, source: "confirmed" },
        readiness: { ready: true, missingRequired: [] },
      },
      createdAt: new Date().toISOString(),
    },
  ];
  raw.planResults = [
    {
      id: "plan_p3_1",
      userId,
      snapshotId: "snap_p3",
      snapshotVersion: 1,
      planInputSchemaVersion: "1.0",
      plan: (() => {
        const piv = raw.profileSnapshots[0].planInputView;
        const store = createStore(db);
        const pack = buildCombinedIntelContext(store, { planInputView: piv, forPlanOrReport: true });
        return buildMockStructuredPlan(piv, pack.items, pack.extKbEntries);
      })(),
      createdAt: new Date().toISOString(),
    },
  ];
  writeFileSync(db, JSON.stringify(raw, null, 2), "utf8");

  const gen = JSON.parse(
    (
      await app.inject({
        method: "POST",
        url: "/api/v1/reports/generate",
        headers: { ...headers(token), "content-type": "application/json" },
        payload: JSON.stringify({ plan_id: "plan_p3_1" }),
      })
    ).body
  );
  assert.equal(gen.ok, true, gen.message || JSON.stringify(gen));
  const reportId = gen.report_id;
  assert.ok(reportId);
  assert.ok(gen.citation_count >= 6);

  const detail1 = JSON.parse(
    (await app.inject({ method: "GET", url: `/api/v1/reports/${reportId}`, headers: headers(token) })).body
  );
  assert.equal(detail1.share_status, "none");

  const sh = JSON.parse(
    (
      await app.inject({
        method: "POST",
        url: `/api/v1/reports/${reportId}/share`,
        headers: { ...headers(token), "content-type": "application/json" },
        payload: "{}",
      })
    ).body
  );
  assert.ok(sh.share_token);
  const path = sh.url_path;
  assert.ok(path.includes("/api/v1/public/reports/"));

  const pub1 = await app.inject({ method: "GET", url: path });
  assert.equal(pub1.statusCode, 200);
  assert.ok(pub1.body.includes("隐私提示"));
  assert.ok(pub1.body.includes("家长决策摘要") || pub1.body.includes("study-report"));
  assert.ok(!pub1.body.includes(userId), "public share HTML must not leak owner user id");
  assert.ok(!pub1.body.includes("user_id"), "public share HTML must not leak user_id field name");

  const detail2 = JSON.parse(
    (await app.inject({ method: "GET", url: `/api/v1/reports/${reportId}`, headers: headers(token) })).body
  );
  assert.equal(detail2.share_status, "active");
  assert.ok((detail2.share_view_count || 0) >= 1);

  const pub2 = await app.inject({ method: "GET", url: path });
  assert.equal(pub2.statusCode, 200);
  const detail3 = JSON.parse(
    (await app.inject({ method: "GET", url: `/api/v1/reports/${reportId}`, headers: headers(token) })).body
  );
  assert.ok(detail3.share_view_count >= 2);

  const del = JSON.parse(
    (
      await app.inject({
        method: "DELETE",
        url: `/api/v1/reports/${reportId}/share`,
        headers: headers(token),
      })
    ).body
  );
  assert.equal(del.ok, true);

  const pub404 = await app.inject({ method: "GET", url: path });
  assert.equal(pub404.statusCode, 404);
});

test("V1-P3 GET report PDF returns 501 when PDF disabled", async () => {
  const dir = mkdtempSync(join(tmpdir(), "sa-v1p3-pdf-"));
  const db = join(dir, "db.json");
  writeFileSync(db, JSON.stringify({ users: [], threads: [], messages: [] }), "utf8");
  process.env.DEEPSEEK_API_KEY = "";
  process.env.PDF_DISABLED = "1";
  const app = buildApp({ dataFile: db });

  const reg = JSON.parse((await app.inject({ method: "POST", url: "/api/v1/users/register" })).body);
  const { token } = reg;

  const raw = JSON.parse(readFileSync(db, "utf8"));
  raw.reportResults = [
    {
      id: "rep_pdf",
      userId: reg.user_id,
      planId: null,
      snapshotId: null,
      snapshotVersion: null,
      reportSchemaVersion: "2.0",
      title: "t",
      html: "<article class=\"study-report\"><p>x</p></article>",
      citations: [],
      chapterCount: 7,
      wordCount: 5,
      createdAt: new Date().toISOString(),
      share: {
        token: null,
        enabled: false,
        createdAt: null,
        revokedAt: null,
        viewCount: 0,
        lastViewedAt: null,
      },
    },
  ];
  writeFileSync(db, JSON.stringify(raw, null, 2), "utf8");

  const r = await app.inject({ method: "GET", url: "/api/v1/reports/rep_pdf/pdf", headers: headers(token) });
  assert.equal(r.statusCode, 501);
  const body = JSON.parse(r.body);
  assert.equal(body.ok, false);

  delete process.env.PDF_DISABLED;
});

test(
  "V1-P3 optional PDF binary when RUN_PDF_E2E=1 (requires Chromium)",
  { skip: process.env.RUN_PDF_E2E !== "1" },
  async () => {
    const prev = process.env.PDF_DISABLED;
    try {
      delete process.env.PDF_DISABLED;
      const dir = mkdtempSync(join(tmpdir(), "sa-v1p3-pdf-e2e-"));
      const db = join(dir, "db.json");
      writeFileSync(db, JSON.stringify({ users: [], threads: [], messages: [] }), "utf8");
      process.env.DEEPSEEK_API_KEY = "";
      const app = buildApp({ dataFile: db });

      const reg = JSON.parse((await app.inject({ method: "POST", url: "/api/v1/users/register" })).body);
      const { token } = reg;

      const raw = JSON.parse(readFileSync(db, "utf8"));
      raw.reportResults = [
        {
          id: "rep_pdf_e2e",
          userId: reg.user_id,
          planId: null,
          snapshotId: null,
          snapshotVersion: null,
          reportSchemaVersion: "2.0",
          title: "PDF E2E",
          html: "<article class=\"study-report\"><p>PDF probe</p></article>",
          citations: [],
          chapterCount: 7,
          wordCount: 20,
          createdAt: new Date().toISOString(),
          share: {
            token: null,
            enabled: false,
            createdAt: null,
            revokedAt: null,
            viewCount: 0,
            lastViewedAt: null,
          },
        },
      ];
      writeFileSync(db, JSON.stringify(raw, null, 2), "utf8");

      const r = await app.inject({ method: "GET", url: "/api/v1/reports/rep_pdf_e2e/pdf", headers: headers(token) });
      assert.equal(r.statusCode, 200, r.body);
      const rawPayload = r.rawPayload;
      assert.ok(rawPayload && rawPayload.length > 100);
      const sig = String.fromCharCode(rawPayload[0], rawPayload[1], rawPayload[2], rawPayload[3]);
      assert.equal(sig, "%PDF");
      assert.ok(String(r.headers["content-type"] || "").includes("application/pdf"));
    } finally {
      if (prev !== undefined) process.env.PDF_DISABLED = prev;
      else delete process.env.PDF_DISABLED;
    }
  }
);
