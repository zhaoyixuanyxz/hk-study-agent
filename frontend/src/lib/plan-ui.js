import { escapeHtml } from "./dom.js";
import { timelineUrgencyMeta } from "../copy.js";

/**
 * @param {string | undefined | null} fitNote
 */
export function renderTierFitNoteHtml(fitNote) {
  const text = String(fitNote || "").trim();
  if (!text) return "";
  return `<p class="tier-fit-note"><span class="tier-fit-label">程序匹配度</span>${escapeHtml(text)}</p>`;
}

/**
 * @param {string | undefined | null} urgency
 */
export function renderTimelineUrgencyBarHtml(urgency) {
  const meta = timelineUrgencyMeta(urgency);
  if (!meta) return "";
  return `<div class="timeline-urgency-block" role="group" aria-label="申请时间压力">
    <div class="timeline-urgency-bar-track">
      <div class="timeline-urgency-bar-fill ${meta.barClass}" style="width:${meta.barWidth}"></div>
    </div>
    <p class="timeline-urgency-label"><span class="urgency-pill ${meta.barClass}">${escapeHtml(meta.label)}</span></p>
    <p class="timeline-urgency">${escapeHtml(meta.line)}</p>
  </div>`;
}

/**
 * @param {object} plan
 * @returns {string[]}
 */
export function buildPlanExecutionActions(plan) {
  if (!plan || typeof plan !== "object") return [];
  const actions = [];
  const tu = String(plan.timeline_urgency || "").trim();
  if (tu === "tight") {
    actions.push("优先锁定最近 2 个截止日期，倒排材料与语言节点。");
  } else if (plan.timeline_suggestion) {
    actions.push(`按时间线倒排：${String(plan.timeline_suggestion).slice(0, 120)}`);
  }
  const tiers = plan.tiers || {};
  const match = tiers.match || {};
  const reach = tiers.reach || {};
  if (match.summary) {
    actions.push(`主申重心（匹配档）：${String(match.summary).slice(0, 100)}`);
  }
  if (reach.fit_note || match.fit_note) {
    const note = match.fit_note || reach.fit_note;
    actions.push(`核对程序权重匹配：${String(note).slice(0, 100)}`);
  }
  if (plan.budget_suggestion) {
    actions.push(`预算对齐：${String(plan.budget_suggestion).slice(0, 90)}`);
  }
  if (Array.isArray(plan.citations) && plan.citations.length) {
    actions.push(`查阅 ${plan.citations.length} 条情报引用，核对政策/截止是否与官网一致。`);
  }
  return actions.filter(Boolean).slice(0, 5);
}

/**
 * @param {string[]} actions
 */
export function renderPlanExecutionPathHtml(actions) {
  const items = (actions || []).filter(Boolean);
  if (!items.length) return "";
  const lis = items.map((t, i) => `<li class="exec-action-item"><span class="exec-action-num">${i + 1}</span><span>${escapeHtml(t)}</span></li>`).join("");
  return `<section class="card plan-exec-path">
    <h3>下一步执行路径</h3>
    <p class="plan-exec-lede">基于当前方案梯度与时间线提炼的可执行动作（非录取承诺）。</p>
    <ol class="plan-exec-list">${lis}</ol>
  </section>`;
}

/**
 * @param {{ itemId?: string, url?: string, sourceTitle?: string, publishedAt?: string, quoteOrSummary?: string }[]} cites
 */
export function renderPlanCitationListHtml(cites) {
  if (!Array.isArray(cites) || !cites.length) return "";
  return cites
    .map((c) => {
      const url = String(c.url || "").trim();
      const title = escapeHtml(c.sourceTitle || url || "来源链接");
      const itemId = String(c.itemId || "").trim();
      const extKbBadge = itemId.startsWith("ext_kb_")
        ? ` <span class="cite-source-badge cite-source-badge--ext-kb">官方知识库</span>`
        : "";
      const intelLink =
        itemId && !itemId.startsWith("ext_kb_")
          ? ` <a class="cite-intel-link" href="#/intelligence?q=${encodeURIComponent(itemId)}" data-intel-id="${escapeHtml(itemId)}">查看情报</a>`
          : "";
      const quote = c.quoteOrSummary ? `<p class="cite-quote">${escapeHtml(String(c.quoteOrSummary).slice(0, 240))}</p>` : "";
      const date = c.publishedAt ? ` <span class="cite-date">· ${escapeHtml(String(c.publishedAt))}</span>` : "";
      return `<li class="plan-cite-item">
        <a href="${escapeHtml(url || "#")}" target="_blank" rel="noopener noreferrer">${title}</a>${date}${extKbBadge}${intelLink}
        ${quote}
      </li>`;
    })
    .join("");
}
