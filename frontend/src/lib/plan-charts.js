/**
 * Plan 页 Chart.js 可视化（V3-VIS）。无 visuals 时不渲染。
 */

/** @type {import('chart.js').Chart | null} */
let tierChart = null;
/** @type {import('chart.js').Chart | null} */
let timelineChart = null;
/** @type {import('chart.js').Chart | null} */
let benchmarkChart = null;

/**
 * @param {unknown} visuals
 */
export function hasPlanVisuals(visuals) {
  if (!visuals || typeof visuals !== "object") return false;
  const v = /** @type {Record<string, unknown>} */ (visuals);
  return Boolean(v.tierComparison || v.timelineMilestones?.length || v.benchmarkBars?.length);
}

/**
 * @param {object} visuals
 */
export function buildTierChartConfig(visuals) {
  const tc = visuals.tierComparison;
  if (!tc) return null;
  const labels = Array.isArray(tc.labels) ? tc.labels : [];
  const scores = Array.isArray(tc.scores) ? tc.scores : [];
  if (!labels.length) return null;
  return {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "相对可行性",
          data: scores,
          backgroundColor: ["rgba(239, 68, 68, 0.65)", "rgba(59, 130, 246, 0.65)", "rgba(34, 197, 94, 0.65)"],
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        title: { display: true, text: "梯度相对可行性", font: { size: 13 } },
      },
      scales: {
        y: { min: 0, max: 100, title: { display: true, text: "指数" } },
      },
    },
  };
}

/**
 * @param {object} visuals
 */
export function buildTimelineChartConfig(visuals) {
  const ms = visuals.timelineMilestones;
  if (!Array.isArray(ms) || !ms.length) return null;
  const labels = ms.map((m) => m.label);
  const data = ms.map((m) => Number(m.monthsFromNow) || 0);
  return {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "距今（月）",
          data,
          backgroundColor: "rgba(99, 102, 241, 0.6)",
        },
      ],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        title: { display: true, text: "时间线里程碑", font: { size: 13 } },
      },
      scales: {
        x: { min: 0, title: { display: true, text: "月" } },
      },
    },
  };
}

/**
 * @param {HTMLElement} host
 * @param {object | null | undefined} visuals
 * @returns {Promise<() => void>}
 */
export async function mountPlanCharts(host, visuals) {
  destroyPlanCharts();
  if (!host || !hasPlanVisuals(visuals)) {
    host?.classList.add("hidden");
    return () => {};
  }
  host.classList.remove("hidden");

  const Chart = (await import("chart.js/auto")).default;
  const tierCanvas = host.querySelector("#plan-tier-chart");
  const timelineCanvas = host.querySelector("#plan-timeline-chart");
  const benchCanvas = host.querySelector("#plan-benchmark-chart");

  const tierCfg = buildTierChartConfig(visuals);
  if (tierCanvas && tierCfg) {
    tierChart = new Chart(tierCanvas, tierCfg);
  }

  const timelineCfg = buildTimelineChartConfig(visuals);
  if (timelineCanvas && timelineCfg) {
    timelineChart = new Chart(timelineCanvas, timelineCfg);
  }

  const bars = visuals.benchmarkBars;
  if (benchCanvas && Array.isArray(bars) && bars.length) {
    benchmarkChart = new Chart(benchCanvas, {
      type: "bar",
      data: {
        labels: bars.map((b) => b.label),
        datasets: [
          {
            label: "指数",
            data: bars.map((b) => b.value),
            backgroundColor: "rgba(14, 165, 233, 0.55)",
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          title: { display: true, text: "背景对标条", font: { size: 13 } },
        },
        scales: { y: { min: 0, max: 100 } },
      },
    });
  }

  return destroyPlanCharts;
}

export function destroyPlanCharts() {
  for (const c of [tierChart, timelineChart, benchmarkChart]) {
    try {
      c?.destroy();
    } catch {
      /* ignore */
    }
  }
  tierChart = null;
  timelineChart = null;
  benchmarkChart = null;
}

/**
 * @returns {string}
 */
export function renderPlanChartsHostHtml() {
  return `<section class="card plan-visuals-card" id="plan-visuals">
    <h3>方案可视化</h3>
    <p class="plan-charts-lede">相对可行性/时间线示意，非录取概率。</p>
    <div class="plan-charts-grid">
      <div class="plan-chart-wrap"><canvas id="plan-tier-chart" role="img" aria-label="梯度条形图"></canvas></div>
      <div class="plan-chart-wrap"><canvas id="plan-timeline-chart" role="img" aria-label="时间线里程碑"></canvas></div>
      <div class="plan-chart-wrap plan-chart-wrap--bench"><canvas id="plan-benchmark-chart" role="img" aria-label="背景对标"></canvas></div>
    </div>
  </section>`;
}
