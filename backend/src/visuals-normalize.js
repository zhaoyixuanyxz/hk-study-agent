/**
 * Plan / Report visuals 规范化（V3-VIS）。禁止录取概率字段。
 */

/**
 * @param {unknown} n
 * @param {number} min
 * @param {number} max
 */
function clampNum(n, min, max) {
  const x = Number(n);
  if (!Number.isFinite(x)) return min;
  return Math.min(max, Math.max(min, Math.round(x)));
}

/**
 * @param {unknown} raw
 */
export function normalizePlanVisuals(raw) {
  if (!raw || typeof raw !== "object") return null;
  const o = /** @type {Record<string, unknown>} */ (raw);
  const out = {};

  const tc = o.tierComparison;
  if (tc && typeof tc === "object") {
    const t = /** @type {Record<string, unknown>} */ (tc);
    const labels = Array.isArray(t.labels)
      ? t.labels.map((x) => String(x || "").trim()).filter(Boolean).slice(0, 6)
      : ["冲刺", "匹配", "保底"];
    const scores = Array.isArray(t.scores)
      ? t.scores.map((x) => clampNum(x, 0, 100)).slice(0, labels.length)
      : [];
    while (scores.length < labels.length) scores.push(50);
    out.tierComparison = {
      labels,
      scores,
      note: String(t.note || "相对可行性指数（0–100），非录取概率").slice(0, 200),
    };
  }

  const milestones = [];
  if (Array.isArray(o.timelineMilestones)) {
    for (const m of o.timelineMilestones) {
      if (!m || typeof m !== "object") continue;
      const label = String(m.label || "").trim();
      if (!label) continue;
      const months = Number(m.monthsFromNow);
      milestones.push({
        label,
        monthsFromNow: Number.isFinite(months)
          ? Math.min(36, Math.max(0, Math.round(months * 10) / 10))
          : 0,
      });
      if (milestones.length >= 8) break;
    }
  }
  if (milestones.length) out.timelineMilestones = milestones;

  const bars = [];
  if (Array.isArray(o.benchmarkBars)) {
    for (const b of o.benchmarkBars) {
      if (!b || typeof b !== "object") continue;
      const label = String(b.label || "").trim();
      if (!label) continue;
      const max = clampNum(b.max, 1, 100);
      bars.push({
        label,
        value: clampNum(b.value, 0, max),
        max,
      });
      if (bars.length >= 6) break;
    }
  }
  if (bars.length) out.benchmarkBars = bars;

  return Object.keys(out).length ? out : null;
}

/**
 * @param {unknown} raw
 */
export function normalizeReportVisuals(raw) {
  if (!raw || typeof raw !== "object") return null;
  const o = /** @type {Record<string, unknown>} */ (raw);
  const out = {};

  const rm = o.riskMatrix;
  if (rm && typeof rm === "object") {
    const r = /** @type {Record<string, unknown>} */ (rm);
    const quadrants = r.quadrants && typeof r.quadrants === "object" ? r.quadrants : r;
    const q = /** @type {Record<string, unknown>} */ (quadrants);
    const keys = ["high_high", "high_low", "low_high", "low_low"];
    const norm = {};
    for (const key of keys) {
      const arr = Array.isArray(q[key]) ? q[key] : [];
      norm[key] = arr
        .map((x) => String(x || "").trim())
        .filter(Boolean)
        .slice(0, 6);
    }
    out.riskMatrix = { quadrants: norm };
  }

  const bands = [];
  if (Array.isArray(o.budgetBands)) {
    for (const b of o.budgetBands) {
      if (!b || typeof b !== "object") continue;
      const label = String(b.label || "").trim();
      if (!label) continue;
      const minHkd = clampNum(b.minHkd, 0, 5000000);
      const maxHkd = clampNum(b.maxHkd, minHkd, 5000000);
      bands.push({ label, minHkd, maxHkd });
      if (bands.length >= 8) break;
    }
  }
  if (bands.length) out.budgetBands = bands;

  return Object.keys(out).length ? out : null;
}

/**
 * @param {object} planInputView
 * @param {object} [plan]
 */
export function buildMockPlanVisuals(planInputView, plan = {}) {
  const gpaRaw = planInputView?.academic?.value?.gpa;
  const gpa = Number.parseFloat(String(gpaRaw || "3.2")) || 3.2;
  const urgency = String(plan.timeline_urgency || "normal");
  const matchScore = clampNum((gpa / 4) * 88, 35, 90);
  const reachScore = clampNum(matchScore - 28, 15, 75);
  const safetyScore = clampNum(matchScore + 14, 40, 95);
  const tight = urgency === "tight";
  const scale = tight ? 0.7 : urgency === "relaxed" ? 1.2 : 1;

  return {
    tierComparison: {
      labels: ["冲刺", "匹配", "保底"],
      scores: [reachScore, matchScore, safetyScore],
      note: "相对可行性指数（0–100），非录取概率",
    },
    timelineMilestones: [
      { label: "语言/标化", monthsFromNow: Number((1 * scale).toFixed(1)) },
      { label: "文书定稿", monthsFromNow: Number((3 * scale).toFixed(1)) },
      { label: "网申提交", monthsFromNow: Number((5 * scale).toFixed(1)) },
      { label: "面试/补件", monthsFromNow: Number((6 * scale).toFixed(1)) },
    ],
    benchmarkBars: [
      { label: "GPA 相对位置", value: clampNum((gpa / 4) * 100, 0, 100), max: 100 },
      { label: "材料完整度（自评）", value: 52, max: 100 },
    ],
  };
}

/**
 * @param {object} plan
 */
export function buildMockReportVisuals(plan = {}) {
  return {
    riskMatrix: {
      quadrants: {
        high_high: ["轮次截止前材料未齐", "语言成绩未达项目底线"],
        high_low: ["成绩单认证周期偏长"],
        low_high: ["热门专业名额滚动收紧"],
        low_low: ["推荐人回复档期"],
      },
    },
    budgetBands: [
      { label: "学费（年）", minHkd: 180000, maxHkd: 320000 },
      { label: "生活费（年）", minHkd: 90000, maxHkd: 140000 },
      { label: "考试与申请费", minHkd: 8000, maxHkd: 18000 },
    ],
  };
}
