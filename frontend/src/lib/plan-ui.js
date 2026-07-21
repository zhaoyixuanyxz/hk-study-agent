import { escapeHtml } from "./dom.js";
import { timelineUrgencyMeta } from "../copy.js";
import { t } from "../i18n/index.js";

/**
 * @param {string | undefined | null} fitNote
 */
export function renderTierFitNoteHtml(fitNote) {
  let text = String(fitNote || "").trim();
  if (!text) return "";
  text = text.replace(/^(程序匹配度|Program fit|Fit)\s*[:：]\s*/i, "");
  return `<p class="tier-fit-note"><span class="tier-fit-label">${t("plan.program_fit")}</span>${escapeHtml(text)}</p>`;
}

/**
 * @param {string | undefined | null} urgency
 */
export function renderTimelineUrgencyBarHtml(urgency) {
  const meta = timelineUrgencyMeta(urgency);
  if (!meta) return "";
  return `<div class="timeline-urgency-block" role="group" aria-label="${t("plan.urgency_aria")}">
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
    actions.push(t("plan.exec_tight"));
  } else if (plan.timeline_suggestion) {
    actions.push(t("plan.exec_timeline", { text: String(plan.timeline_suggestion).slice(0, 120) }));
  }
  const tiers = plan.tiers || {};
  const match = tiers.match || {};
  const reach = tiers.reach || {};
  if (match.summary) {
    actions.push(t("plan.exec_match", { text: String(match.summary).slice(0, 100) }));
  }
  if (reach.fit_note || match.fit_note) {
    const note = match.fit_note || reach.fit_note;
    actions.push(t("plan.exec_fit", { text: String(note).slice(0, 100) }));
  }
  if (plan.budget_suggestion) {
    actions.push(t("plan.exec_budget", { text: String(plan.budget_suggestion).slice(0, 90) }));
  }
  if (Array.isArray(plan.citations) && plan.citations.length) {
    actions.push(t("plan.exec_cites", { n: plan.citations.length }));
  }
  return actions.filter(Boolean).slice(0, 5);
}

/**
 * @param {string[]} actions
 */
export function renderPlanExecutionPathHtml(actions) {
  const items = (actions || []).filter(Boolean);
  if (!items.length) return "";
  const lis = items
    .map((txt, i) => `<li class="exec-action-item"><span class="exec-action-num">${i + 1}</span><span>${escapeHtml(txt)}</span></li>`)
    .join("");
  return `<section class="card plan-exec-path">
    <h3>${t("plan.exec_title")}</h3>
    <p class="plan-exec-lede">${t("plan.exec_lede")}</p>
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
      const title = escapeHtml(c.sourceTitle || url || t("plan.cite_source"));
      const itemId = String(c.itemId || "").trim();
      const extKbBadge = itemId.startsWith("ext_kb_")
        ? ` <span class="cite-source-badge cite-source-badge--ext-kb">${t("plan.cite_kb")}</span>`
        : "";
      const intelLink =
        itemId && !itemId.startsWith("ext_kb_")
          ? ` <a class="cite-intel-link" href="#/intelligence?q=${encodeURIComponent(itemId)}" data-intel-id="${escapeHtml(itemId)}">${t("plan.cite_view")}</a>`
          : "";
      const quote = c.quoteOrSummary
        ? `<p class="cite-quote">${escapeHtml(String(c.quoteOrSummary).slice(0, 240))}</p>`
        : "";
      const date = c.publishedAt ? ` <span class="cite-date">· ${escapeHtml(String(c.publishedAt))}</span>` : "";
      return `<li class="plan-cite-item">
        <a href="${escapeHtml(url || "#")}" target="_blank" rel="noopener noreferrer">${title}</a>${date}${extKbBadge}${intelLink}
        ${quote}
      </li>`;
    })
    .join("");
}
