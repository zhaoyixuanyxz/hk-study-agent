/**
 * CQ-C: Score mock plan/report from running app and print QA metrics.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildApp } from "../src/app.js";
import { loadCuratedSeedsIntoStore } from "../src/intelligence/seed-loader.js";
import { scorePlanContent, scoreReportContent, passesCombinedQaThreshold } from "../src/content-quality.js";
import { seedReadyPlanInputView } from "./cq-regression-helpers.mjs";

async function main() {
  process.env.DEEPSEEK_API_KEY = "";
  const dir = mkdtempSync(join(tmpdir(), "cq-score-"));
  const dbPath = join(dir, "db.json");
  writeFileSync(dbPath, JSON.stringify({ users: [], threads: [], messages: [] }), "utf8");

  const app = buildApp({ dataFile: dbPath });
  await app.ready();
  loadCuratedSeedsIntoStore((await import("../src/store.js")).createStore(dbPath), { force: true });

  const reg = await app.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    payload: { email: `cq-score-${Date.now()}@test.local`, password: "secret12" },
  });
  if (reg.statusCode !== 200) {
    console.error("register failed", reg.body);
    process.exit(1);
  }
  const token = reg.json().token;
  const userId = reg.json().user_id;
  const headers = { Authorization: `Bearer ${token}` };

  seedReadyPlanInputView(dbPath, userId);

  const planRes = await app.inject({ method: "POST", url: "/api/v1/plans/generate", headers });
  if (planRes.statusCode !== 200) {
    console.error("plan generate failed", planRes.body);
    process.exit(1);
  }
  const planBody = planRes.json();
  const planScore = scorePlanContent(planBody.plan);

  const repRes = await app.inject({
    method: "POST",
    url: "/api/v1/reports/generate",
    headers: { ...headers, "content-type": "application/json" },
    payload: JSON.stringify({ plan_id: planBody.plan_id }),
  });
  if (repRes.statusCode !== 200 || !repRes.json().ok) {
    console.error("report generate failed", repRes.body);
    process.exit(1);
  }
  const repBody = repRes.json();
  const reportScore = scoreReportContent(repBody);

  await app.close();
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }

  const combined = passesCombinedQaThreshold(planScore, reportScore);
  const v3Ok =
    planScore.metrics.citationCount >= 6 &&
    reportScore.metrics.citationCount >= 6 &&
    planScore.metrics.visualsBonus &&
    reportScore.metrics.visualsBonus;
  console.error("content-quality-score plan:", JSON.stringify(planScore.metrics), planScore.pass ? "PASS" : "FAIL", planScore.issues);
  console.error("content-quality-score report:", JSON.stringify(reportScore.metrics), reportScore.pass ? "PASS" : "FAIL", reportScore.issues);
  console.error(`content-quality-score combined: ${combined ? "PASS" : "FAIL"}`);
  console.error(`content-quality-score V3 thresholds (citations≥6, visuals): ${v3Ok ? "PASS" : "FAIL"}`);

  if (!combined || !v3Ok) process.exit(1);
  console.error("content-quality-score: OK (CQ + V3-KB/VIS thresholds)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
