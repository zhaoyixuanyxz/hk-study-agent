import { track } from "../track.js";
import { extractAssistantDisplayText } from "../assistant-text.js";
import {
  formatFactLabel,
  formatFlowState,
  formatPlanCitationsHint,
  formatReadinessCopy,
  formatSourceHintLabel,
  formatThreadMeta,
  formatTruthStatusLabel,
  truthStatusTagClass,
} from "../copy.js";
import {
  api,
  LS_LAST_PLAN,
  LS_LAST_REPORT,
  LS_THREAD,
  LS_TOKEN,
  clearStoredSession,
  fullUrlFromApiPath,
  downloadReportPdf,
  shareStatusLabel,
  setupReportDeliveryUi,
} from "../api/client.js";
import { el, escapeHtml, prettyTime, setStatus, shortId } from "../lib/dom.js";
import { setPanelLoading } from "../lib/loading.js";
import {
  buildPlanExecutionActions,
  renderPlanCitationListHtml,
  renderPlanExecutionPathHtml,
  renderTierFitNoteHtml,
  renderTimelineUrgencyBarHtml,
} from "../lib/plan-ui.js";
import {
  destroyPlanCharts,
  hasPlanVisuals,
  mountPlanCharts,
  renderPlanChartsHostHtml,
} from "../lib/plan-charts.js";
import { lastPlanReportReadiness, setLastPlanReportReadiness } from "../app-state.js";
import { renderPlanReportGate } from "./profile.js";
import { t } from "../i18n/index.js";

export function hidePlanError() {
  const box = el("plan-error");
  if (box) {
    box.classList.add("hidden");
    box.innerHTML = "";
  }
}

export function showPlanError(msg, suggestion) {
  const box = el("plan-error");
  if (!box) return;
  box.classList.remove("hidden");
  const sug = suggestion || "";
  box.innerHTML = `<p>${escapeHtml(msg)}</p>${sug ? `<p class="suggestion">${escapeHtml(sug)}</p>` : ""}`;
}

export function setPlanStatus(text, isErr) {
  const s = el("plan-status");
  if (!s) return;
  s.textContent = text;
  s.className = isErr ? "meta meta-line err" : "meta meta-line";
}

export function renderPlan(plan) {
  const container = el("plan-content");
  if (!container || !plan) return;
  const tiers = plan.tiers || {};
  const reach = tiers.reach || {};
  const match = tiers.match || {};
  const safety = tiers.safety || {};

  const tierHtml = (x, fallbackLabel) => {
    const label = x.label || fallbackLabel;
    const risk = (x.risk_note || "").trim()
      ? `<p class="tier-risk">${escapeHtml(x.risk_note)}</p>`
      : "";
    const fit = renderTierFitNoteHtml(x.fit_note);
    return `<section class="card tier-card">
      <h3>${escapeHtml(label)}</h3>
      <p>${escapeHtml(x.summary || "")}</p>
      <p class="rationale">${escapeHtml(x.rationale || "")}</p>
      ${fit}
      ${risk}
    </section>`;
  };

  const urgencyBlock = renderTimelineUrgencyBarHtml(plan.timeline_urgency);
  const execPath = renderPlanExecutionPathHtml(buildPlanExecutionActions(plan));
  const chartsBlock = hasPlanVisuals(plan.visuals) ? renderPlanChartsHostHtml() : "";

  destroyPlanCharts();
  container.innerHTML = `
    ${chartsBlock}
    ${tierHtml(reach, t("plan.tier_reach"))}
    ${tierHtml(match, t("plan.tier_match"))}
    ${tierHtml(safety, t("plan.tier_safety"))}
    ${execPath}
    <section class="card plan-budget-card">
      <h3>${t("plan.risk_budget")}</h3>
      <p>${escapeHtml(plan.risk_summary || "")}</p>
      <p>${escapeHtml(plan.budget_suggestion || "")}</p>
    </section>
    <section class="card plan-timeline-card">
      <h3>${t("plan.timeline_section")}</h3>
      ${urgencyBlock}
      <p>${escapeHtml(plan.timeline_suggestion || "")}</p>
    </section>
  `;

  appendPlanCitationSection(container, plan);

  if (hasPlanVisuals(plan.visuals)) {
    const host = container.querySelector("#plan-visuals");
    void mountPlanCharts(host, plan.visuals);
  }

  const disc = document.createElement("p");
  disc.className = "disclaimer";
  disc.textContent = plan.disclaimer || "";
  container.appendChild(disc);
}

export function appendPlanCitationSection(container, plan) {
  const cites = Array.isArray(plan.citations) ? plan.citations : [];
  const sec = document.createElement("section");
  sec.className = cites.length ? "card plan-citations" : "card plan-citations plan-citations--empty";
  const h = document.createElement("h3");
  h.textContent = t("plan.citations_title");
  sec.appendChild(h);
  if (!cites.length) {
    const p = document.createElement("p");
    p.className = "placeholder";
    p.textContent = formatPlanCitationsHint();
    sec.appendChild(p);
  } else {
    const ul = document.createElement("ul");
    ul.className = "plan-citation-list";
    ul.innerHTML = renderPlanCitationListHtml(cites);
    sec.appendChild(ul);
  }
  container.appendChild(sec);
}

export async function loadPlanPage() {
  hidePlanError();
  setPlanStatus(t("plan.status_loading"));
  setPanelLoading("plan-content", t("plan.loading_panel"));
  const container = el("plan-content");
  try {
    const lastId = localStorage.getItem(LS_LAST_PLAN);
    const list = await api("/api/v1/plans");
    let targetId = lastId;
    if (!targetId && list.plans && list.plans.length) {
      targetId = list.plans[0].plan_id;
    }
    if (!targetId) {
      setLastPlanReportReadiness(null);
      renderPlanReportGate(null);
      setPlanStatus("");
      if (container) {
        container.innerHTML = `<p class="placeholder">${t("plan.empty")}</p>`;
      }
      return;
    }
    const detail = await api(`/api/v1/plans/${targetId}`);
    setLastPlanReportReadiness(detail.report_readiness || null);
    renderPlanReportGate(lastPlanReportReadiness);
    if (detail.plan) {
      renderPlan(detail.plan);
      localStorage.setItem(LS_LAST_PLAN, detail.plan_id);
      setPlanStatus(t("plan.status_loaded", { id: String(detail.plan_id).slice(0, 8) }));
    }
  } catch (e) {
    setLastPlanReportReadiness(null);
    renderPlanReportGate(null);
    setPlanStatus(String(e.message || e), true);
    if (container) {
      container.innerHTML = `<p class="placeholder">${t("plan.load_fail")}</p>`;
    }
  }
}

el("btn-generate-plan")?.addEventListener("click", async () => {
  const btn = el("btn-generate-plan");
  hidePlanError();
  setPlanStatus(t("plan.status_generating"));
  track("plan_generate_click", {});
  if (btn) btn.disabled = true;
  try {
    const res = await api("/api/v1/plans/generate", {
      method: "POST",
      body: {
        thread_id: localStorage.getItem(LS_THREAD) || undefined,
      },
    });
    track("plan_generate_result", { ok: true, code: res.code || null });
    if (res.plan_id) localStorage.setItem(LS_LAST_PLAN, res.plan_id);
    const detail = res.plan_id
      ? await api(`/api/v1/plans/${res.plan_id}`)
      : { plan: res.plan, report_readiness: null };
    setLastPlanReportReadiness(detail.report_readiness || null);
    renderPlanReportGate(lastPlanReportReadiness);
    if (detail.plan) renderPlan(detail.plan);
    else if (res.plan) renderPlan(res.plan);
    setPlanStatus(t("plan.status_generated", { id: String(res.plan_id || "").slice(0, 8) }));
  } catch (e) {
    track("plan_generate_result", { ok: false, code: e.code || null });
    const sug = e.suggestion || "";
    showPlanError(e.message || t("plan.gen_fail"), sug);
    setPlanStatus(t("plan.status_gen_fail"), true);
  } finally {
    if (btn) btn.disabled = false;
  }
});

el("refresh-plan")?.addEventListener("click", () => loadPlanPage());
