const LS_PREFIX = "cq_action_plan_";

/**
 * @param {string | null | undefined} reportId
 */
export function actionPlanStorageKey(reportId) {
  const id = String(reportId || "default").trim() || "default";
  return `${LS_PREFIX}${id.replace(/[^\w-]/g, "").slice(0, 48)}`;
}

/**
 * @param {string} key
 * @returns {Set<string>}
 */
export function loadActionPlanChecked(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr.map(String) : []);
  } catch {
    return new Set();
  }
}

/**
 * @param {string} key
 * @param {Set<string>} checked
 */
export function saveActionPlanChecked(key, checked) {
  try {
    localStorage.setItem(key, JSON.stringify([...checked]));
  } catch {
    /* quota / private mode */
  }
}

/**
 * @param {string} text
 * @returns {{ level: string, label: string, detail?: string } | null}
 */
export function parseRiskFromActionText(text) {
  const s = String(text || "").trim();
  if (!s) return null;
  if (/高风险|高优先.*风险|（高优先，风险：/i.test(s)) {
    const m = s.match(/风险[：:]\s*([^）)]+)/);
    return { level: "high", label: m ? m[1].trim().slice(0, 80) : s.slice(0, 60) };
  }
  if (/中风险|中优先/i.test(s)) {
    return { level: "medium", label: s.replace(/^【[^】]+】\s*/, "").slice(0, 80) };
  }
  if (/低风险/i.test(s)) {
    return { level: "low", label: s.replace(/^【[^】]+】\s*/, "").slice(0, 80) };
  }
  if (/contingency|最坏情况|全拒/i.test(s)) {
    return { level: "high", label: "需准备备选方案（全拒 / gap year）" };
  }
  return null;
}

/**
 * @param {HTMLElement} root
 * @returns {{ level: string, label: string, detail?: string }[]}
 */
export function extractRiskItemsFromReport(root) {
  if (!root) return [];
  const serverGrid = root.querySelector("#report-risk-items .risk-dashboard-grid");
  if (serverGrid) {
    const items = [];
    for (const card of serverGrid.querySelectorAll(".risk-card[data-risk-level]")) {
      const level = String(card.getAttribute("data-risk-level") || "medium");
      const label = (card.querySelector(".risk-label")?.textContent || "").trim();
      if (!label) continue;
      const detail = (card.querySelector(".risk-item-detail")?.textContent || "").trim();
      items.push(detail ? { level, label, detail } : { level, label });
    }
    if (items.length) return items.slice(0, 8);
  }

  const items = [];
  const seen = new Set();

  const actionPlan = root.querySelector("#action-plan");
  if (actionPlan) {
    for (const li of actionPlan.querySelectorAll("li")) {
      const risk = parseRiskFromActionText(li.textContent || "");
      if (!risk) continue;
      const key = `${risk.level}:${risk.label}`;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push(risk);
    }
  }

  const ch5 = root.querySelector("#ch5");
  if (ch5 && items.length < 4) {
    const body = ch5.textContent || "";
    if (/风险|预算|时间线/.test(body) && !seen.has("medium:ch5")) {
      seen.add("medium:ch5");
      items.push({ level: "medium", label: "关注预算波动、认证周期与轮次截止（见第 5 章）" });
    }
  }

  return items.slice(0, 8);
}

const RISK_LABELS = { high: "高", medium: "中", low: "低" };

/**
 * @param {{ level: string, label: string }[]} riskItems
 */
export function renderRiskDashboardHtml(riskItems) {
  const items = Array.isArray(riskItems) ? riskItems : [];
  if (!items.length) {
    return `<section class="report-risk-dashboard report-risk-dashboard--empty" id="report-risk-dashboard">
      <h2 class="report-risk-title">风险仪表盘</h2>
      <p class="placeholder">暂无结构化风险标签；请查看行动计划与第 5 章时间线。</p>
    </section>`;
  }
  const cards = items
    .map((r) => {
      const lvl = RISK_LABELS[r.level] || "中";
      return `<div class="risk-card risk-card--${r.level}"><span class="risk-level">${lvl}</span><span class="risk-label">${escapeHtmlText(r.label)}</span></div>`;
    })
    .join("");
  return `<section class="report-risk-dashboard" id="report-risk-dashboard">
    <h2 class="report-risk-title">风险仪表盘</h2>
    <p class="report-risk-lede">从 30/60/90 天行动计划与策略章节提取的关注点（非录取承诺）。</p>
    <div class="risk-dashboard-grid">${cards}</div>
  </section>`;
}

function escapeHtmlText(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * @param {HTMLElement} container
 * @param {string | null | undefined} reportId
 */
export function enhanceActionPlanSection(container, reportId) {
  const section = container?.querySelector("#action-plan");
  if (!section) return;

  const key = actionPlanStorageKey(reportId);
  const checked = loadActionPlanChecked(key);

  for (const ol of section.querySelectorAll("ol.report-list")) {
    ol.classList.add("action-plan-checklist");
    let idx = 0;
    for (const li of ol.querySelectorAll(":scope > li")) {
      const id = `${key}_${idx++}`;
      const text = (li.textContent || "").trim();
      if (!text) continue;
      const isChecked = checked.has(id);
      li.classList.add("action-plan-item");
      li.innerHTML = `<label class="action-plan-label">
        <input type="checkbox" class="action-plan-cb" data-action-id="${escapeHtmlText(id)}" ${isChecked ? "checked" : ""} />
        <span class="action-plan-text">${escapeHtmlText(text)}</span>
      </label>`;
    }
  }

  section.addEventListener("change", (ev) => {
    const t = ev.target;
    if (!(t instanceof HTMLInputElement) || !t.classList.contains("action-plan-cb")) return;
    const id = t.getAttribute("data-action-id");
    if (!id) return;
    const set = loadActionPlanChecked(key);
    if (t.checked) set.add(id);
    else set.delete(id);
    saveActionPlanChecked(key, set);
    const label = t.closest(".action-plan-item");
    if (label) label.classList.toggle("action-plan-item--done", t.checked);
  });

  for (const cb of section.querySelectorAll(".action-plan-cb")) {
    const label = cb.closest(".action-plan-item");
    if (label && cb.checked) label.classList.add("action-plan-item--done");
  }
}

/**
 * @param {HTMLElement} container
 * @param {{ itemId?: string, url?: string, sourceTitle?: string, quoteOrSummary?: string }[]} citations
 */
export function enhanceReportCitations(container, citations) {
  const citeSec = container?.querySelector("#report-citations");
  if (!citeSec) return;

  const citeMap = new Map();
  for (const c of citations || []) {
    const id = String(c.itemId || "").trim();
    if (id) citeMap.set(id, c);
    const url = String(c.url || "").trim();
    if (url) citeMap.set(url, c);
  }

  for (const a of citeSec.querySelectorAll("a[href]")) {
    const href = a.getAttribute("href") || "";
    const meta = citeMap.get(href);
    if (!meta?.itemId) continue;
    if (a.parentElement?.querySelector(".cite-intel-link")) continue;
    const link = document.createElement("a");
    link.className = "cite-intel-link";
    link.href = `#/intelligence?q=${encodeURIComponent(meta.itemId)}`;
    link.textContent = " · 查看情报";
    link.dataset.intelId = meta.itemId;
    a.parentElement?.appendChild(link);
  }

  for (const c of citations || []) {
    if (!c.quoteOrSummary) continue;
    const url = String(c.url || "").trim();
    if (!url) continue;
    const a = citeSec.querySelector(`a[href="${CSS.escape(url)}"]`);
    if (!a || a.parentElement?.querySelector(".cite-quote")) continue;
    const p = document.createElement("p");
    p.className = "cite-quote";
    p.textContent = String(c.quoteOrSummary).slice(0, 240);
    a.parentElement?.appendChild(p);
  }
}

/**
 * @param {HTMLElement} container
 * @param {{ report_id?: string, citations?: object[] }} detail
 */
export function enhanceReportPage(container, detail) {
  if (!container) return;
  enhanceActionPlanSection(container, detail?.report_id);

  if (!container.querySelector("#report-risk-items")) {
    const risks = extractRiskItemsFromReport(container);
    const dashHtml = renderRiskDashboardHtml(risks);
    const actionPlan = container.querySelector("#action-plan");
    if (actionPlan) {
      actionPlan.insertAdjacentHTML("beforebegin", dashHtml);
    } else {
      container.insertAdjacentHTML("afterbegin", dashHtml);
    }
  }

  enhanceReportCitations(container, detail?.citations || []);
}

/**
 * @param {HTMLElement} container
 * @returns {object | null}
 */
export function parseReportVisualsFromHtml(container) {
  if (!container) return null;
  const el = container.querySelector("#report-visuals-data");
  if (!el?.textContent?.trim()) return null;
  try {
    return JSON.parse(el.textContent);
  } catch {
    return null;
  }
}
