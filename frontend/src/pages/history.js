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
import { navigateTo } from "../shell/navigation.js";
import { loadThread } from "./chat.js";
import { loadProfile } from "./profile.js";

export async function loadHistoryPage() {
  const content = el("history-content");
  setPanelLoading("history-content", "正在加载历史记录…");
  const status = el("history-status");
  if (status) {
    status.textContent = "正在整理历史记录，请稍候…";
    status.className = "meta meta-line";
  }
  try {
    const data = await api("/api/v1/history");
    if (status) {
      status.textContent = "";
      status.className = "meta meta-line";
    }

      const planIds = new Set((data.plans || []).map((p) => p.plan_id));
    const lastPlan = localStorage.getItem(LS_LAST_PLAN);
    if (lastPlan && !planIds.has(lastPlan)) localStorage.removeItem(LS_LAST_PLAN);
    const reportIds = new Set((data.reports || []).map((r) => r.report_id));
    const lastReport = localStorage.getItem(LS_LAST_REPORT);
    if (lastReport && !reportIds.has(lastReport)) localStorage.removeItem(LS_LAST_REPORT);

    const section = (title, items, renderRow) => {
      const wrap = document.createElement("section");
      wrap.className = "history-section card";
      const h = document.createElement("h3");
      h.textContent = title;
      wrap.appendChild(h);
      if (!items || !items.length) {
        const p = document.createElement("p");
        p.className = "placeholder";
        p.textContent = "（当前暂无记录，可先返回主流程继续推进）";
        wrap.appendChild(p);
        return wrap;
      }
      const ul = document.createElement("ul");
      ul.className = "history-list";
      for (const it of items) {
        const li = document.createElement("li");
        li.appendChild(renderRow(it));
        ul.appendChild(li);
      }
      wrap.appendChild(ul);
      return wrap;
    };

    if (!content) return;
    content.innerHTML = "";

    content.appendChild(
      section("咨询会话", data.threads || [], (t) => {
        const row = document.createElement("div");
        row.className = "history-thread-row";

        const main = document.createElement("button");
        main.type = "button";
        main.className = "history-link history-thread-main";
        const pinLabel = t.pinned ? "置顶 · " : "";
        main.textContent = `${pinLabel}${prettyTime(t.updated_at || t.created_at)} · 阶段：${formatFlowState(t.orchestration_state)}`;
        main.addEventListener("click", async () => {
          localStorage.setItem(LS_THREAD, t.thread_id);
          navigateTo("chat");
          await loadThread(t.thread_id);
        });

        const pinBtn = document.createElement("button");
        pinBtn.type = "button";
        pinBtn.className = "btn btn-ghost btn-tiny";
        pinBtn.textContent = t.pinned ? "取消置顶" : "置顶";
        pinBtn.title = t.pinned ? "取消后将按更新时间排序" : "置顶后在列表顶部显示";
        pinBtn.addEventListener("click", async (ev) => {
          ev.stopPropagation();
          try {
            await api(`/api/v1/threads/${encodeURIComponent(t.thread_id)}`, {
              method: "PATCH",
              body: { pinned: !t.pinned },
            });
            track("thread_pin", { thread_id: t.thread_id, pinned: !t.pinned });
            await loadHistoryPage();
          } catch (e) {
            alert(String(e.message || e));
          }
        });

        const delBtn = document.createElement("button");
        delBtn.type = "button";
        delBtn.className = "btn btn-ghost btn-tiny history-thread-delete";
        delBtn.textContent = "删除";
        delBtn.title =
          "删除该会话的对话与摘要，并永久清除本会话下产生的建档数据（画像快照、记忆、方案、报告等），不可恢复";
        delBtn.addEventListener("click", async (ev) => {
          ev.stopPropagation();
          if (
            !confirm(
              "确定删除此咨询会话？将永久删除本会话产生的对话、摘要、建档进度（画像快照、记忆、方案、报告等）。其他会话不受影响，且不可恢复。是否继续？"
            )
          ) {
            return;
          }
          try {
            await api(`/api/v1/threads/${encodeURIComponent(t.thread_id)}`, { method: "DELETE" });
            track("thread_delete", { thread_id: t.thread_id });
            if (localStorage.getItem(LS_THREAD) === t.thread_id) {
              const hist = await api("/api/v1/history");
              const rest = hist.threads || [];
              if (rest.length) {
                localStorage.setItem(LS_THREAD, rest[0].thread_id);
              } else {
                const nt = await api("/api/v1/threads", { method: "POST" });
                localStorage.setItem(LS_THREAD, nt.thread_id);
              }
            }
            await loadHistoryPage();
            await loadProfile();
          } catch (e) {
            alert(String(e.message || e));
          }
        });

        row.appendChild(main);
        row.appendChild(pinBtn);
        row.appendChild(delBtn);
        return row;
      })
    );

    content.appendChild(
      section("档案版本", data.profile_snapshots || [], (s) => {
        const row = document.createElement("div");
        row.className = "history-snapshot-row";

        const span = document.createElement("span");
        span.className = "history-static history-snapshot-meta";
        span.textContent = `${prettyTime(s.created_at)} · 第 ${s.version ?? "—"} 次整理`;
        row.appendChild(span);

        const delBtn = document.createElement("button");
        delBtn.type = "button";
        delBtn.className = "btn btn-ghost btn-tiny history-thread-delete";
        delBtn.textContent = "删除";
        delBtn.title =
          "删除该档案版本；基于该版本生成的方案与报告会一并删除，不可恢复（记忆与咨询会话不受影响）";
        delBtn.addEventListener("click", async () => {
          if (
            !confirm(
              "确定删除此档案版本？将同时删除仅基于该版本的方案与交付报告，且不可恢复。咨询会话与建档记忆不会删除。是否继续？"
            )
          ) {
            return;
          }
          const sid = s.snapshot_id;
          if (!sid) return;
          try {
            await api(`/api/v1/profile/snapshots/${encodeURIComponent(sid)}`, { method: "DELETE" });
            track("profile_snapshot_delete", { snapshot_id: sid });
            await loadHistoryPage();
          } catch (e) {
            alert(String(e.message || e));
          }
        });
        row.appendChild(delBtn);
        return row;
      })
    );

    content.appendChild(
      section("方案建议", data.plans || [], (p) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "history-link";
        btn.textContent = `${prettyTime(p.created_at)} · 方案 ${shortId(p.plan_id)}`;
        btn.addEventListener("click", () => {
          localStorage.setItem(LS_LAST_PLAN, p.plan_id);
          navigateTo("plan");
        });
        return btn;
      })
    );

    content.appendChild(
      section("交付报告", data.reports || [], (r) => {
        const wrap = document.createElement("div");
        wrap.className = "history-report-row";

        const pills = document.createElement("div");
        pills.className = "history-report-pills";
        if (r.is_latest) {
          const p = document.createElement("span");
          p.className = "history-report-pill history-report-pill--latest";
          p.textContent = "最新";
          pills.appendChild(p);
        }
        const ps = document.createElement("span");
        ps.className =
          r.share_status === "active"
            ? "history-report-pill history-report-pill--share"
            : "history-report-pill";
        ps.textContent =
          r.share_status === "active" ? "已分享" : r.share_status === "revoked" ? "已关闭分享" : "未分享";
        pills.appendChild(ps);
        const meta = document.createElement("span");
        meta.className = "history-report-meta";
        meta.textContent = ` · 引用 ${r.citation_count ?? 0}${r.share_view_count ? ` · 分享访问 ${r.share_view_count}` : ""}`;
        pills.appendChild(meta);
        wrap.appendChild(pills);

        const actions = document.createElement("div");
        actions.className = "history-report-actions";

        const pdfBtn = document.createElement("button");
        pdfBtn.type = "button";
        pdfBtn.className = "btn btn-ghost btn-tiny";
        pdfBtn.textContent = "PDF";
        pdfBtn.addEventListener("click", async (ev) => {
          ev.stopPropagation();
          try {
            await downloadReportPdf(r.report_id);
          } catch (e) {
            alert(String(e.message || e));
          }
        });
        actions.appendChild(pdfBtn);

        if (r.share_status === "active" && r.share_url_path) {
          const openSh = document.createElement("button");
          openSh.type = "button";
          openSh.className = "btn btn-ghost btn-tiny";
          openSh.textContent = "分享页";
          openSh.addEventListener("click", (ev) => {
            ev.stopPropagation();
            window.open(fullUrlFromApiPath(String(r.share_url_path)), "_blank", "noopener,noreferrer");
          });
          actions.appendChild(openSh);
        }

        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "history-link";
        btn.textContent = `${prettyTime(r.created_at)} · 报告 ${shortId(r.report_id)} · 字数 ${r.word_count ?? "—"}`;
        btn.addEventListener("click", () => {
          localStorage.setItem(LS_LAST_REPORT, r.report_id);
          navigateTo("report", r.report_id);
        });
        actions.appendChild(btn);

        wrap.appendChild(actions);
        return wrap;
      })
    );
  } catch (e) {
    if (status) {
      status.textContent = String(e.message || e);
      status.className = "meta meta-line err";
    }
    if (content) {
      content.innerHTML = `<p class="placeholder">加载失败。${escapeHtml(String(e.message || e))}</p>`;
    }
  }
}