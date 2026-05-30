/**
 * Report 页可视化：风险 2×2 矩阵 + 预算 band（V3-VIS）
 */

/** @type {import('chart.js').Chart | null} */
let budgetChart = null;

const QUADRANT_META = [
  { key: "high_high", title: "高影响 · 高可能", className: "risk-q--hh" },
  { key: "high_low", title: "高影响 · 低可能", className: "risk-q--hl" },
  { key: "low_high", title: "低影响 · 高可能", className: "risk-q--lh" },
  { key: "low_low", title: "低影响 · 低可能", className: "risk-q--ll" },
];

/**
 * @param {unknown} visuals
 */
export function hasReportVisuals(visuals) {
  if (!visuals || typeof visuals !== "object") return false;
  const v = /** @type {Record<string, unknown>} */ (visuals);
  return Boolean(v.riskMatrix || v.budgetBands?.length);
}

/**
 * @param {object} visuals
 * @returns {string}
 */
export function renderRiskMatrixHtml(visuals) {
  const q = visuals?.riskMatrix?.quadrants;
  if (!q || typeof q !== "object") return "";
  const cells = QUADRANT_META.map((meta) => {
    const items = Array.isArray(q[meta.key]) ? q[meta.key] : [];
    const lis = items.length
      ? items.map((t) => `<li>${escapeHtml(String(t))}</li>`).join("")
      : `<li class="muted">—</li>`;
    return `<div class="risk-matrix-cell ${meta.className}">
      <h4>${escapeHtml(meta.title)}</h4>
      <ul>${lis}</ul>
    </div>`;
  }).join("");
  return `<section class="report-visuals-block report-risk-matrix-block" id="report-risk-matrix">
    <h3>风险矩阵（2×2）</h3>
    <p class="report-visuals-lede">影响与可能性的组合视图，非录取概率。</p>
    <div class="risk-matrix-grid">${cells}</div>
  </section>`;
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * @param {object} visuals
 */
export function buildBudgetChartConfig(visuals) {
  const bands = visuals.budgetBands;
  if (!Array.isArray(bands) || !bands.length) return null;
  const labels = bands.map((b) => b.label);
  const mins = bands.map((b) => Number(b.minHkd) || 0);
  const maxs = bands.map((b) => Number(b.maxHkd) || 0);
  const spans = maxs.map((m, i) => Math.max(0, m - mins[i]));
  return {
    type: "bar",
    data: {
      labels,
      datasets: [
        { label: "下限 (HKD)", data: mins, backgroundColor: "rgba(148, 163, 184, 0.5)", stack: "stack0" },
        { label: "区间跨度", data: spans, backgroundColor: "rgba(59, 130, 246, 0.65)", stack: "stack0" },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        title: { display: true, text: "预算区间（港币）", font: { size: 13 } },
      },
      scales: {
        x: { stacked: true },
        y: { stacked: true, ticks: { callback: (v) => `${Math.round(Number(v) / 1000)}k` } },
      },
    },
  };
}

/**
 * @param {HTMLElement} host
 * @param {object | null | undefined} visuals
 */
export async function mountReportCharts(host, visuals) {
  destroyReportCharts();
  if (!host || !hasReportVisuals(visuals)) {
    host?.classList.add("hidden");
    return;
  }
  host.classList.remove("hidden");

  const matrixHtml = renderRiskMatrixHtml(visuals);
  const matrixMount = host.querySelector("#report-risk-matrix-mount");
  if (matrixMount) matrixMount.innerHTML = matrixHtml;

  const budgetCfg = buildBudgetChartConfig(visuals);
  const canvas = host.querySelector("#report-budget-chart");
  if (canvas && budgetCfg) {
    const Chart = (await import("chart.js/auto")).default;
    budgetChart = new Chart(canvas, budgetCfg);
  }
}

export function destroyReportCharts() {
  try {
    budgetChart?.destroy();
  } catch {
    /* ignore */
  }
  budgetChart = null;
}

/**
 * @returns {string}
 */
export function renderReportChartsHostHtml() {
  return `<section class="report-visuals-host" id="report-visuals-host">
    <div id="report-risk-matrix-mount"></div>
    <div class="report-chart-wrap">
      <canvas id="report-budget-chart" role="img" aria-label="预算区间图"></canvas>
    </div>
  </section>`;
}

/**
 * @param {HTMLElement} container
 * @param {object | null | undefined} visuals
 */
export async function injectReportVisuals(container, visuals) {
  if (!container || !hasReportVisuals(visuals)) return;
  let host = container.querySelector("#report-visuals-host");
  if (!host) {
    container.insertAdjacentHTML("afterbegin", renderReportChartsHostHtml());
    host = container.querySelector("#report-visuals-host");
  }
  await mountReportCharts(host, visuals);
}
