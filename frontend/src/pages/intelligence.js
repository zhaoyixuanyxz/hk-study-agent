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
import { renderIntelSourceLink } from "../lib/intel-links.js";
import { intelCardSummary, intelCardTitle } from "../lib/intel-display.js";
import { applyUiLocale, getUiLocale } from "../i18n/index.js";

function renderStructuredBlock(item) {
  const s = item.structured;
  if (!s || typeof s !== "object") return "";
  const parts = [];
  if (Array.isArray(s.deadlines) && s.deadlines.length) {
    parts.push(
      `<ul class="intel-struct-list">${s.deadlines
        .slice(0, 5)
        .map((d) => `<li><strong>截止</strong> ${escapeHtml(d.date || "")}</li>`)
        .join("")}</ul>`
    );
  }
  if (Array.isArray(s.fees) && s.fees.length) {
    parts.push(
      `<ul class="intel-struct-list">${s.fees
        .slice(0, 5)
        .map((f) => `<li><strong>费用</strong> ${escapeHtml(f.amount_text || String(f.amount_hkd || ""))}</li>`)
        .join("")}</ul>`
    );
  }
  if (Array.isArray(s.requirements) && s.requirements.length) {
    parts.push(
      `<ul class="intel-struct-list">${s.requirements
        .slice(0, 4)
        .map((r) => `<li>${escapeHtml(r)}</li>`)
        .join("")}</ul>`
    );
  }
  if (Array.isArray(s.programs) && s.programs.length) {
    parts.push(
      `<ul class="intel-struct-list">${s.programs
        .slice(0, 4)
        .map((p) => `<li>${escapeHtml(p)}</li>`)
        .join("")}</ul>`
    );
  }
  if (s.benchmarkGpa && typeof s.benchmarkGpa === "object") {
    const g = s.benchmarkGpa;
    const lang =
      s.language && typeof s.language === "object"
        ? ` · IELTS ${escapeHtml(String(s.language.ielts ?? "—"))}`
        : "";
    parts.push(
      `<div class="intel-benchmark-block"><strong>参考基准</strong> · 典型 GPA ${escapeHtml(String(g.typical ?? "—"))}/${escapeHtml(String(g.scale || "4.0"))}${lang}${s.competitionTag ? ` · 竞争度 ${escapeHtml(String(s.competitionTag))}` : ""}</div>`
    );
  }
  if (Array.isArray(s.subjectWeights) && s.subjectWeights.length) {
    parts.push(
      `<ul class="intel-struct-list intel-subject-weights">${s.subjectWeights
        .slice(0, 5)
        .map(
          (sw) =>
            `<li><strong>${escapeHtml(sw.subject || "科目")}</strong> · ${escapeHtml(sw.weight || "")}${sw.note ? ` — ${escapeHtml(sw.note)}` : ""}</li>`
        )
        .join("")}</ul>`
    );
  }
  if (!parts.length) return "";
  return `<div class="intel-structured">${parts.join("")}</div>`;
}

export function renderIntelItemCard(item) {
  const title = escapeHtml(intelCardTitle(item));
  const summary = escapeHtml(intelCardSummary(item).slice(0, 200));
  const date = item.published_at ? String(item.published_at).slice(0, 10) : "";
  const link = renderIntelSourceLink(item.canonical_url);
  const structured = renderStructuredBlock(item);
  const full =
    item.content_text && item.content_text.length > 220
      ? `<details class="intel-fulltext"><summary>展开官网正文摘要</summary><p>${escapeHtml(item.content_text.slice(0, 1500))}</p></details>`
      : "";
  return `<article class="intel-card">
    <h4 class="intel-card-title">${title}</h4>
    <p class="intel-card-summary">${summary}</p>
    ${structured}
    <p class="intel-card-meta"><span>${escapeHtml(item.info_type || "")}</span> · ${date}${item.feed_id ? ` · 采集 ${escapeHtml(item.feed_id)}` : ""}</p>
    ${link}
    ${full}
  </article>`;
}

export async function loadIntelligencePage(schoolSlug = null) {
  applyUiLocale(getUiLocale());
  const dash = el("intel-dashboard-view");
  const schoolView = el("intel-school-view");
  const status = el("intel-status");
  if (!dash || !schoolView) return;
  setPanelLoading(schoolSlug ? "intel-school-body" : "intel-school-grid", "正在加载情报…");

  if (schoolSlug) {
    dash.classList.add("hidden");
    schoolView.classList.remove("hidden");
    track("intelligence_view", { view: "school", school_id: schoolSlug });
    if (status) status.textContent = "正在加载院校详情…";
    try {
      const data = await api(`/api/v1/intelligence/schools/${encodeURIComponent(schoolSlug)}`);
      const titleEl = el("intel-school-title");
      const ledeEl = el("intel-school-lede");
      if (titleEl) titleEl.textContent = data.school?.name_zh || schoolSlug;
      if (ledeEl) {
        ledeEl.textContent = `${data.school?.name_en || ""} · 已上线 ${data.overview?.item_count ?? 0} 条情报`;
      }
      const itemsBox = el("intel-school-items");
      if (itemsBox) {
        const items = data.latest_items || [];
        itemsBox.innerHTML = items.length
          ? items.map(renderIntelItemCard).join("")
          : '<p class="placeholder">暂无已上线情报。</p>';
      }
      const tl = el("intel-school-timeline");
      if (tl) {
        const lines = (data.timeline || []).map(
          (t) =>
            `<li><time>${escapeHtml(String(t.published_at || "").slice(0, 10))}</time> <strong>${escapeHtml(intelCardTitle(t))}</strong> <span class="tag">${escapeHtml(t.info_type || "")}</span></li>`
        );
        tl.innerHTML = lines.length ? lines.join("") : "<li>暂无时间线记录</li>";
      }
      if (status) status.textContent = "";
    } catch (e) {
      if (status) status.textContent = String(e.message || e);
    }
    return;
  }

  dash.classList.remove("hidden");
  schoolView.classList.add("hidden");
  track("intelligence_view", { view: "dashboard" });
  if (status) status.textContent = "正在加载情报库…";
  try {
    const schoolsRes = await api("/api/v1/intelligence/schools");
    const grid = el("intel-school-grid");
    if (grid) {
      grid.innerHTML = (schoolsRes.schools || [])
        .map(
          (s) => `<a class="intel-school-card" href="#/intelligence/school/${encodeURIComponent(s.slug || s.school_id)}">
            <strong>${escapeHtml(s.name_zh)}</strong>
            <span class="intel-school-meta">${s.item_count} 条更新 · ${s.coverage === "deep" ? "深度覆盖" : "基础覆盖"}</span>
          </a>`
        )
        .join("");
    }
    const searchRes = await api("/api/v1/intelligence/search?limit=12");
    const results = el("intel-search-results");
    if (results) {
      results.innerHTML = (searchRes.items || []).length
        ? searchRes.items.map(renderIntelItemCard).join("")
        : '<p class="placeholder">输入关键词开始检索。</p>';
    }
    if (status) status.textContent = `共 ${schoolsRes.schools?.length ?? 0} 所院校 · 展示最新已上线条目`;
  } catch (e) {
    if (status) status.textContent = String(e.message || e);
  }
}

export async function runIntelligenceSearch() {
  const q = String(el("intel-search-q")?.value || "").trim();
  const infoType = String(el("intel-search-info-type")?.value || "").trim();
  const status = el("intel-status");
  const results = el("intel-search-results");
  if (!results) return;
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (infoType) params.set("info_type", infoType);
  params.set("limit", "30");
  if (status) status.textContent = "检索中…";
  try {
    const data = await api(`/api/v1/intelligence/search?${params.toString()}`);
    track("intelligence_search", { q, info_type: infoType, total: data.total });
    results.innerHTML = (data.items || []).length
      ? data.items.map(renderIntelItemCard).join("")
      : '<p class="placeholder">未找到匹配的已上线情报。</p>';
    if (status) status.textContent = `找到 ${data.total ?? 0} 条结果`;
  } catch (e) {
    if (status) status.textContent = String(e.message || e);
  }
}

function renderPreflightSummary(data) {
  const box = el("admin-intel-preflight-summary");
  if (!box) return;
  if (!data || data.empty) {
    box.innerHTML = '<p class="placeholder">尚未执行检测。请先点击「检测链接」，再执行「安全采集」。</p>';
    return;
  }
  const failures = data.failures || [];
  const failLines = failures.length
    ? `<ul class="admin-preflight-failures">${failures
        .slice(0, 12)
        .map(
          (f) =>
            `<li><code>${escapeHtml(f.feedId || "")}</code> — ${escapeHtml(f.url || "")} <span class="meta">(${escapeHtml(String(f.status || f.error || ""))}${f.soft404 ? ", soft-404" : ""})</span></li>`
        )
        .join("")}${failures.length > 12 ? `<li class="meta">…另有 ${failures.length - 12} 条</li>` : ""}</ul>`
    : "<p>全部链接探活通过。</p>";
  box.innerHTML = `<p><strong>上次检测</strong>：${escapeHtml(data.ran_at || "")}</p>
    <p>共 ${data.total ?? 0} 条 · 可用 ${data.ok_count ?? 0} · 失败 ${data.failed_count ?? 0} · 慢响应 ${data.slow_count ?? 0}</p>
    ${failLines}`;
}

export async function loadAdminPreflightSummary() {
  try {
    const data = await api("/api/v1/intelligence/admin/preflight-last");
    renderPreflightSummary(data);
    return data;
  } catch {
    renderPreflightSummary({ empty: true });
    return null;
  }
}

export async function runAdminPreflightUrls() {
  const status = el("admin-intel-status");
  const btn = el("admin-intel-preflight");
  if (status) status.textContent = "正在检测全部采集链接…";
  if (btn) btn.disabled = true;
  try {
    const data = await api("/api/v1/intelligence/admin/preflight-urls", { method: "POST", body: {} });
    renderPreflightSummary({
      empty: false,
      ran_at: data.ran_at,
      total: data.total,
      ok_count: data.ok_count,
      failed_count: data.failed_count,
      slow_count: data.slow_count,
      failures: data.failures,
    });
    if (status) {
      status.textContent = `链接检测完成：${data.ok_count ?? 0}/${data.total ?? 0} 可用，${data.failed_count ?? 0} 失败`;
    }
    track("admin_intel_preflight", { failed: data.failed_count, total: data.total });
    return data;
  } catch (e) {
    if (status) status.textContent = String(e.message || e);
    throw e;
  } finally {
    if (btn) btn.disabled = false;
  }
}

export async function runAdminSafeCollect() {
  const status = el("admin-intel-status");
  const btn = el("admin-intel-collect");
  if (status) status.textContent = "安全采集中（跳过探活失败链接，不覆盖劣质正文）…";
  if (btn) btn.disabled = true;
  try {
    const data = await api("/api/v1/intelligence/admin/collect", {
      method: "POST",
      body: { respect_preflight: true },
    });
    const { formatAdminCollectResult } = await import("../copy.js");
    if (status) status.textContent = formatAdminCollectResult(data);
    track("admin_intel_collect", {
      ingested: data.items_ingested,
      skipped_preflight: data.skipped_preflight,
    });
    await loadAdminIntelligencePage();
    return data;
  } catch (e) {
    if (status) status.textContent = String(e.message || e);
    throw e;
  } finally {
    if (btn) btn.disabled = false;
  }
}

export async function loadAdminIntelligencePage() {
  const status = el("admin-intel-status");
  const queueBox = el("admin-intel-queue");
  const statsBox = el("admin-intel-stats");
  const sourcesBox = el("admin-intel-sources");
  if (status) status.textContent = "加载运营后台…";
  try {
    await loadAdminPreflightSummary();
    const ws = await api("/api/v1/intelligence/admin/workspace");
    if (statsBox) {
      statsBox.innerHTML = `<p>待审核：<strong>${ws.stats?.pending_review ?? 0}</strong></p>
        <p>已上线：<strong>${ws.stats?.published ?? 0}</strong></p>
        <p>审核员：${(ws.reviewers || []).map(escapeHtml).join(", ") || "（环境变量配置）"}</p>`;
    }
    if (sourcesBox) {
      const srcLines = (ws.sources || [])
        .map((s) => `<li>${escapeHtml(s.name)} <span class="tag">${escapeHtml(s.tier)}</span></li>`)
        .join("");
      const feedLines = (ws.feeds || [])
        .map((f) => `<li>${escapeHtml(f.url || f.id)}</li>`)
        .join("");
      sourcesBox.innerHTML = `<p><strong>来源白名单</strong></p><ul>${srcLines}</ul>
        <p><strong>采集 URL</strong></p><ul>${feedLines || "<li>暂无</li>"}</ul>`;
    }
    const queueRes = await api("/api/v1/intelligence/review/queue?status=pending_review");
    const items = queueRes.items || [];
    if (queueBox) {
      queueBox.innerHTML = items.length
        ? items
            .map(
              (item) => `<div class="admin-queue-row" data-item-id="${escapeHtml(item.item_id)}">
              <div><strong>${escapeHtml(item.title_zh)}</strong><p>${escapeHtml((item.summary_zh || "").slice(0, 120))}</p></div>
              <div class="admin-queue-actions">
                <button type="button" class="btn btn-primary btn-tiny btn-admin-approve" data-id="${escapeHtml(item.item_id)}">通过</button>
                <button type="button" class="btn btn-ghost btn-tiny btn-admin-reject" data-id="${escapeHtml(item.item_id)}">拒绝</button>
              </div>
            </div>`
            )
            .join("")
        : '<p class="placeholder">暂无待审核条目。</p>';
      queueBox.querySelectorAll(".btn-admin-approve").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const id = btn.getAttribute("data-id");
          if (!id) return;
          await api("/api/v1/intelligence/review/decide", { method: "POST", body: { item_id: id, decision: "approve" } });
          loadAdminIntelligencePage();
        });
      });
      queueBox.querySelectorAll(".btn-admin-reject").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const id = btn.getAttribute("data-id");
          if (!id) return;
          await api("/api/v1/intelligence/review/decide", {
            method: "POST",
            body: { item_id: id, decision: "reject", rejection_reason: "运营拒绝" },
          });
          loadAdminIntelligencePage();
        });
      });
    }
    if (status) status.textContent = `待审核 ${items.length} 条`;
  } catch (e) {
    if (status) status.textContent = String(e.message || e);
  }
}
