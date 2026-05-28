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

export function statusLabel(s) {
  if (s === "confirmed") return "已确认";
  if (s === "pending") return "待你确认";
  if (s === "conflict") return "需复核";
  return s || "";
}

/**
 * 对话内待确认事实卡片（pending / conflict）
 * @param {object | null} snapshot
 */
export function renderConfirmStrip(snapshot) {
  const strip = el("confirm-strip");
  if (!strip) return;
  strip.innerHTML = "";
  const facts = (snapshot?.confirmationState?.facts || []).filter(
    (f) => f.status === "pending" || f.status === "conflict"
  );
  if (!facts.length) return;

  const title = document.createElement("div");
  title.className = "confirm-strip-title";
  title.textContent = "请确认以下关键信息（确认后将作为方案与报告依据，可直接修改）";
  strip.appendChild(title);

  for (const f of facts) {
    const card = document.createElement("div");
    card.className = "confirm-card";
    const lab = document.createElement("span");
    lab.className = "fact-label";
    lab.textContent = formatFactLabel(f.key);
    const input = document.createElement("input");
    input.type = "text";
    input.value = f.value;
    input.setAttribute("aria-label", `修正 ${formatFactLabel(f.key)}`);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn-confirm";
    btn.textContent = "确认并写入";
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      try {
        await api(`/api/v1/profile/confirmations/${encodeURIComponent(f.id)}`, {
          method: "POST",
          body: { value: input.value.trim() },
        });
        const tid = localStorage.getItem(LS_THREAD);
        if (tid) await loadThread(tid);
        await loadProfile();
      } catch (e) {
        setStatus(String(e.message || e), true);
      } finally {
        btn.disabled = false;
      }
    });
    card.appendChild(lab);
    if (f.status === "conflict") {
      const badge = document.createElement("span");
      badge.className = "tag tag-conflict";
      badge.textContent = statusLabel("conflict");
      card.appendChild(badge);
    }
    card.appendChild(input);
    card.appendChild(btn);
    strip.appendChild(card);
  }
}

export function renderProfileGapDetails(ul, profileView) {
  ul.innerHTML = "";
  const rows = profileView?.gap_details || [];
  if (!rows.length) {
    const li = document.createElement("li");
    li.textContent = "（当前暂无关键缺口）";
    ul.appendChild(li);
    return;
  }
  for (const row of rows) {
    const li = document.createElement("li");
    li.className = "gap-detail-item";
    const title = document.createElement("div");
    title.className = "gap-detail-title";
    title.textContent = row.gap || "";
    li.appendChild(title);
    const planLine = document.createElement("div");
    planLine.className = "gap-detail-plan";
    const lp = document.createElement("span");
    lp.className = "gap-label";
    lp.textContent = "方案";
    planLine.appendChild(lp);
    planLine.appendChild(document.createTextNode(row.impacts?.plan || ""));
    li.appendChild(planLine);
    const reportLine = document.createElement("div");
    reportLine.className = "gap-detail-report";
    const lr = document.createElement("span");
    lr.className = "gap-label";
    lr.textContent = "报告";
    reportLine.appendChild(lr);
    reportLine.appendChild(document.createTextNode(row.impacts?.report || ""));
    li.appendChild(reportLine);
    ul.appendChild(li);
  }
}

/** @param {HTMLElement|null} container */
export function renderProfileSections(container, profileView) {
  if (!container) return;
  container.innerHTML = "";
  const sections = profileView?.sections || [];
  if (!sections.length) {
    container.textContent = "（暂无分区视图）";
    return;
  }
  for (const sec of sections) {
    const facts = sec.facts || [];
    const wrap = document.createElement("div");
    wrap.className = "profile-section-block";
    const h = document.createElement("h4");
    h.className = "profile-section-title";
    h.textContent = sec.title || sec.id || "";
    wrap.appendChild(h);
    if (sec.subtitle) {
      const sub = document.createElement("p");
      sub.className = "profile-section-sub";
      sub.textContent = sec.subtitle;
      wrap.appendChild(sub);
    }
    if (!facts.length) {
      const p = document.createElement("p");
      p.className = "placeholder subtle";
      p.textContent = "（本区暂无条目）";
      wrap.appendChild(p);
    } else {
      for (const f of facts) {
        const row = document.createElement("div");
        row.className = "fact-row";
        const k = document.createElement("span");
        k.className = "fact-key";
        k.textContent = formatFactLabel(f.key);
        row.appendChild(document.createTextNode(""));
        row.appendChild(k);
        row.appendChild(document.createTextNode("："));
        const v = document.createElement("span");
        v.className = "fact-val";
        v.textContent = String(f.value || "");
        row.appendChild(v);
        row.appendChild(document.createTextNode(" "));
        const tag = document.createElement("span");
        tag.className = `tag ${truthStatusTagClass(f.truth_status)}`;
        tag.textContent = formatTruthStatusLabel(f.truth_status);
        row.appendChild(tag);
        const srcTxt = formatSourceHintLabel(f.source_hint);
        if (srcTxt) {
          row.appendChild(document.createTextNode(" "));
          const src = document.createElement("span");
          src.className = "fact-src";
          src.textContent = `来源：${srcTxt}`;
          row.appendChild(src);
        }
        wrap.appendChild(row);
      }
    }
    container.appendChild(wrap);
  }
}

export function renderPlanReportGate(rr) {
  const box = el("plan-report-gate");
  if (!box) return;
  if (!rr || typeof rr.ok !== "boolean") {
    box.classList.add("hidden");
    box.innerHTML = "";
    return;
  }
  box.classList.remove("hidden");
  const ok = rr.ok === true;
  box.className = ok ? "plan-report-gate plan-report-gate--ok card" : "plan-report-gate plan-report-gate--warn card";

  const h = document.createElement("h3");
  h.className = "plan-report-gate-title";
  h.textContent = ok ? "交付报告：就绪检查已通过" : "交付报告前：建议先处理下列事项";
  box.appendChild(h);

  const reasons = rr.reasons || [];
  if (reasons.length) {
    const ul = document.createElement("ul");
    ul.className = "plan-report-gate-list";
    for (const line of reasons) {
      const li = document.createElement("li");
      li.textContent = line;
      ul.appendChild(li);
    }
    box.appendChild(ul);
  }

  const steps = rr.next_steps || [];
  if (steps.length) {
    const p = document.createElement("p");
    p.className = "plan-report-gate-next-label";
    p.textContent = "建议下一步";
    box.appendChild(p);
    const ul2 = document.createElement("ul");
    ul2.className = "plan-report-gate-list";
    for (const line of steps) {
      const li = document.createElement("li");
      li.textContent = line;
      ul2.appendChild(li);
    }
    box.appendChild(ul2);
  }
}

export async function loadProfile() {
  const summaryEl = el("profile-summary");
  const gapsEl = el("profile-gaps");
  const sectionsEl = el("profile-sections");
  const readinessEl = el("profile-readiness");
  const updatedEl = el("profile-updated");
  setPanelLoading("profile-sections", "正在加载申请档案…");
  try {
    const data = await api("/api/v1/profile");
    const snap = data.snapshot;
    const pv = data.profile_view || null;
    if (!snap) {
      summaryEl.textContent = "暂未形成顾问档案。建议先在「对话建档」补充基础信息。";
      gapsEl.innerHTML = "";
      if (sectionsEl) sectionsEl.innerHTML = "";
      readinessEl.textContent = "";
      updatedEl.textContent = "";
      renderConfirmStrip(null);
      return;
    }
    summaryEl.textContent = snap.summary || "（顾问摘要暂未生成）";
    updatedEl.textContent = `最近更新时间：${prettyTime(snap.updatedAt)}`;

    if (pv?.gap_details?.length) {
      renderProfileGapDetails(gapsEl, pv);
    } else {
      gapsEl.innerHTML = "";
      const gaps = snap.gaps || [];
      if (!gaps.length) {
        const li = document.createElement("li");
        li.textContent = "（当前暂无关键缺口）";
        gapsEl.appendChild(li);
      } else {
        for (const g of gaps) {
          const li = document.createElement("li");
          li.textContent = g;
          gapsEl.appendChild(li);
        }
      }
    }

    renderProfileSections(sectionsEl, pv);

    const piv = data.plan_input_view;
    if (!piv) {
      readinessEl.textContent = "继续补充信息后，这里会明确显示方案生成条件。";
      renderConfirmStrip(snap);
      return;
    }
    const r = piv.readiness || {};
    const copy = formatReadinessCopy(r);
    readinessEl.innerHTML = "";
    const title = document.createElement("p");
    title.className = "readiness-title";
    title.textContent = copy.title;
    readinessEl.appendChild(title);
    const hint = document.createElement("p");
    hint.textContent = copy.hint;
    readinessEl.appendChild(hint);
    if (copy.missing.length) {
      const miss = document.createElement("p");
      miss.className = "missing";
      miss.textContent = `仍需补充：${copy.missing.join("。")}`;
      readinessEl.appendChild(miss);
    }
    const details = document.createElement("details");
    details.className = "json-details";
    const summary = document.createElement("summary");
    summary.textContent = "专业详情（需要时展开）";
    const pre = document.createElement("pre");
    pre.className = "json-preview";
    pre.textContent = JSON.stringify(piv, null, 2);
    details.appendChild(summary);
    details.appendChild(pre);
    readinessEl.appendChild(details);

    renderConfirmStrip(snap);
  } catch (e) {
    summaryEl.textContent = String(e.message || e);
    renderConfirmStrip(null);
  }
}
