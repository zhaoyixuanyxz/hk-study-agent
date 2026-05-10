/**
 * P3-BE-03：方案生成接口可观测性（进程内聚合指标，供运维与 Phase 5 埋点对齐）
 */

let attemptsTotal = 0;
let successTotal = 0;
/** @type {Record<string, number>} */
const failureByCode = {};

let sumDurationMs = 0;
let sumDurationSuccessMs = 0;
/** @type {number[]} 仅保留最近一批原始耗时用于粗算分位（环形缓冲） */
const recentDurations = [];
const RECENT_MAX = 200;

/**
 * 每次 `POST /api/v1/plans/generate` 结束时调用一次
 * @param {{ outcome: 'success' | 'failure', code?: string, duration_ms: number }} p
 */
export function recordPlanGenerateRequest(p) {
  attemptsTotal += 1;
  const ms = Math.max(0, Number(p.duration_ms) || 0);
  sumDurationMs += ms;
  if (recentDurations.length >= RECENT_MAX) recentDurations.shift();
  recentDurations.push(ms);

  if (p.outcome === "success") {
    successTotal += 1;
    sumDurationSuccessMs += ms;
    return;
  }
  const c = String(p.code || "UNKNOWN");
  failureByCode[c] = (failureByCode[c] || 0) + 1;
}

/**
 * @returns {object}
 */
export function getPlanGenerateMetricsSnapshot() {
  const fail = attemptsTotal - successTotal;
  const sorted = [...recentDurations].sort((a, b) => a - b);
  const p95 = sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] : null;
  return {
    attempts_total: attemptsTotal,
    success_total: successTotal,
    failure_total: fail,
    success_rate: attemptsTotal ? successTotal / attemptsTotal : null,
    failure_by_code: { ...failureByCode },
    avg_duration_ms_all: attemptsTotal ? sumDurationMs / attemptsTotal : null,
    avg_duration_ms_success: successTotal ? sumDurationSuccessMs / successTotal : null,
    recent_duration_p95_ms: p95,
  };
}

/** 单测或诊断用 */
export function resetPlanGenerateMetrics() {
  attemptsTotal = 0;
  successTotal = 0;
  Object.keys(failureByCode).forEach((k) => delete failureByCode[k]);
  sumDurationMs = 0;
  sumDurationSuccessMs = 0;
  recentDurations.length = 0;
}
