import { track } from "../track.js";
import { extractAssistantDisplayText } from "../assistant-text.js";
import {
  formatFactLabel,
  formatFlowState,
  formatPlanCitationsHint,
  formatReadinessCopy,
  formatSourceHintLabel,
  formatThreadMeta,
  formatTimelineUrgencyLine,
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
import { enhanceReportPage, parseReportVisualsFromHtml } from "../lib/action-plan-ui.js";
import { destroyReportCharts, injectReportVisuals } from "../lib/report-charts.js";
import { navigateTo, parseHash } from "../shell/navigation.js";
import {
  currentReportDetail,
  lastPlanReportReadiness,
  setCurrentReportDetail,
} from "../app-state.js";

export function hideReportError() {
  const box = el("report-error");
  if (box) {
    box.classList.add("hidden");
    box.innerHTML = "";
  }
}

export function showReportError(msg, suggestion) {
  const box = el("report-error");
  if (!box) return;
  box.classList.remove("hidden");
  const sug = suggestion || "";
  box.innerHTML = `<p>${escapeHtml(msg)}</p>${sug ? `<p class="suggestion">${escapeHtml(sug)}</p>` : ""}`;
}

export function setReportStatus(text, isErr) {
  const s = el("report-status");
  if (!s) return;
  s.textContent = text;
  s.className = isErr ? "meta meta-line err" : "meta meta-line";
}

export function renderReport(detail) {
  setCurrentReportDetail(detail && typeof detail === "object" ? detail : null);
  const container = el("report-content");
  const meta = el("report-meta");
  if (!container) return;
  if (detail && detail.html) {
    destroyReportCharts();
    container.innerHTML = detail.html;
    enhanceReportPage(container, detail);
    const visuals = detail.visuals || parseReportVisualsFromHtml(container);
    void injectReportVisuals(container, visuals);
  } else {
    container.innerHTML = `<p class="placeholder">报告内容为空。</p>`;
  }
  if (meta) {
    if (!detail || !detail.report_id) {
      meta.classList.add("hidden");
      meta.innerHTML = "";
    } else {
      meta.classList.remove("hidden");
      const cite = detail.citation_count ?? "—";
      const share = shareStatusLabel(detail.share_status);
      const views = detail.share_view_count ?? 0;
      meta.innerHTML = `<span>报告编号：<code>${escapeHtml(shortId(detail.report_id))}</code></span> · <span>生成时间：${escapeHtml(
        prettyTime(detail.created_at)
      )}</span> · <span>字数（估算）：${escapeHtml(String(detail.word_count ?? "—"))}</span> · <span>引用条目：${escapeHtml(
        String(cite)
      )}</span> · <span>分享：${escapeHtml(share)}</span> · <span>分享页访问：${escapeHtml(String(views))}</span>`;
    }
  }
  setupReportDeliveryUi();
}

/**
 * @param {string | null} [routeReportId] 来自 #/report/:id
 */
export async function loadReportPage(routeReportId) {
  hideReportError();
  setReportStatus("正在加载顾问报告，请稍候…");
  setPanelLoading("report-content", "正在加载报告…");
  const container = el("report-content");
  const meta = el("report-meta");
  try {
    let targetId = routeReportId || localStorage.getItem(LS_LAST_REPORT);
    const list = await api("/api/v1/reports");
    if (!targetId && list.reports && list.reports.length) {
      targetId = list.reports[0].report_id;
    }
    if (!targetId) {
      setReportStatus("");
      setCurrentReportDetail(null);
      setupReportDeliveryUi();
      if (meta) {
        meta.classList.add("hidden");
        meta.innerHTML = "";
      }
      if (container) {
        container.innerHTML = `<p class="placeholder">暂无报告。请先在「方案」页生成方案后，点击「生成报告」。</p>`;
      }
      return;
    }
    const detail = await api(`/api/v1/reports/${targetId}`);
    renderReport(detail);
    if (detail.report_id) localStorage.setItem(LS_LAST_REPORT, detail.report_id);
    setReportStatus(`已加载 · ${String(detail.report_id).slice(0, 8)}…`);
    track("report_view", { report_id: detail.report_id || targetId });
  } catch (e) {
    setReportStatus(String(e.message || e), true);
    setCurrentReportDetail(null);
    setupReportDeliveryUi();
    if (meta) meta.classList.add("hidden");
    if (container) {
      container.innerHTML = `<p class="placeholder">加载失败，请稍后重试。</p>`;
    }
  }
}

el("refresh-report")?.addEventListener("click", () => {
  const r = parseHash();
  const rid = r.kind === "app" && r.panel === "report" ? r.reportId : null;
  loadReportPage(rid);
});

el("btn-report-pdf")?.addEventListener("click", async () => {
  if (!currentReportDetail?.report_id) return;
  hideReportError();
  try {
    await downloadReportPdf(currentReportDetail.report_id);
    track("report_pdf_download", { report_id: currentReportDetail.report_id });
  } catch (e) {
    showReportError(String(e.message || e), "");
  }
});

el("btn-report-share-on")?.addEventListener("click", async () => {
  if (!currentReportDetail?.report_id) return;
  hideReportError();
  try {
    await api(`/api/v1/reports/${currentReportDetail.report_id}/share`, { method: "POST", body: {} });
    const detail = await api(`/api/v1/reports/${currentReportDetail.report_id}`);
    renderReport(detail);
    track("report_share_enable", { report_id: detail.report_id });
  } catch (e) {
    showReportError(String(e.message || e), e.suggestion || "");
  }
});

el("btn-report-share-copy")?.addEventListener("click", async () => {
  const path = currentReportDetail && typeof currentReportDetail.share_url_path === "string" ? currentReportDetail.share_url_path : "";
  if (!path) return;
  const url = fullUrlFromApiPath(path);
  try {
    await navigator.clipboard.writeText(url);
    setReportStatus("分享链接已复制到剪贴板。");
  } catch {
    window.prompt("请手动复制分享链接：", url);
  }
});

el("btn-report-share-open")?.addEventListener("click", () => {
  const path = currentReportDetail && typeof currentReportDetail.share_url_path === "string" ? currentReportDetail.share_url_path : "";
  if (!path) return;
  window.open(fullUrlFromApiPath(path), "_blank", "noopener,noreferrer");
});

el("btn-report-share-off")?.addEventListener("click", async () => {
  if (!currentReportDetail?.report_id) return;
  hideReportError();
  try {
    await api(`/api/v1/reports/${currentReportDetail.report_id}/share`, { method: "DELETE", body: {} });
    const detail = await api(`/api/v1/reports/${currentReportDetail.report_id}`);
    renderReport(detail);
    track("report_share_disable", { report_id: detail.report_id });
  } catch (e) {
    showReportError(String(e.message || e), e.suggestion || "");
  }
});

el("btn-generate-report")?.addEventListener("click", async () => {
  const btn = el("btn-generate-report");
  hideReportError();
  track("report_generate_click", {});
  if (lastPlanReportReadiness && lastPlanReportReadiness.ok === false) {
    const go = window.confirm(
      "交付报告就绪检查未全部通过，报告论据可能不完整。是否仍要继续生成？"
    );
    if (!go) return;
  }
  setReportStatus("顾问正在生成报告，请稍候…");
  if (btn) btn.disabled = true;
  try {
    const planId = localStorage.getItem(LS_LAST_PLAN);
    const body = {
      thread_id: localStorage.getItem(LS_THREAD) || undefined,
      ...(planId ? { plan_id: planId } : {}),
    };
    const res = await api("/api/v1/reports/generate", { method: "POST", body });
    track("report_generate_result", { ok: true });
    if (res.report_id) {
      localStorage.setItem(LS_LAST_REPORT, res.report_id);
      setReportStatus("报告已生成，已自动跳转到报告页。");
      navigateTo("report", res.report_id);
    }
  } catch (e) {
    track("report_generate_result", { ok: false });
    const sug = e.suggestion || "";
    showReportError(e.message || "顾问报告生成失败", sug);
    setReportStatus("报告生成失败，请稍后重试或先检查方案完整度。", true);
  } finally {
    if (btn) btn.disabled = false;
  }
});

/** 历史：由 Phase 4 面板实现 */