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
import { api, LS_THREAD, LS_TOKEN } from "../api/client.js";
import { el, setStatus, prettyTime, shortId } from "../lib/dom.js";
import * as appState from "../app-state.js";

export function renderMessages(container, items) {
  container.innerHTML = "";
  /** @type {string | null} */
  let latestUserMsgId = null;
  for (let j = items.length - 1; j >= 0; j--) {
    const x = items[j];
    if (x && x.role === "user" && x.id) {
      latestUserMsgId = String(x.id);
      break;
    }
  }
  items.forEach((m, i) => {
    const div = document.createElement("div");
    div.className = `bubble ${m.role === "user" ? "user" : "assistant"}`;
    div.style.animationDelay = `${Math.min(i, 12) * 0.045}s`;
    const role = document.createElement("div");
    role.className = "role";
    role.textContent = m.role === "user" ? "你" : "顾问助手";
    div.appendChild(role);
    const t = document.createElement("div");
    t.className = m.role === "assistant" ? "bubble-body bubble-body--rich" : "bubble-body";
    const raw = m.content != null ? String(m.content) : "";
    const trimmed = raw.trim();
    if (!trimmed && m.role === "assistant") {
      t.textContent =
        "（本条助手消息暂无正文，多为模型返回的 JSON 里没有 reply 或字段名不一致；请刷新后再试，或继续发送一条消息。）";
    } else if (m.role === "assistant") {
      const plain = extractAssistantDisplayText(raw);
      if (plain.trim()) {
        t.innerHTML = formatAssistantHtml(plain);
      } else {
        t.textContent = trimmed;
      }
    } else {
      t.textContent = trimmed;
    }
    div.appendChild(t);

    const canCorrect =
      m.role === "user" && latestUserMsgId && m.id != null && String(m.id) === latestUserMsgId;
    if (canCorrect) {
      const tools = document.createElement("div");
      tools.className = "bubble-user-tools";
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "bubble-fix-btn";
      btn.setAttribute(
        "aria-label",
        "将本条提问载入底部输入框，改正错字后以新正文重新发给助手（覆盖上一轮助手回复）。",
      );
      btn.textContent = "纠错并重发…";
      btn.addEventListener("click", () => {
        enterComposerCorrectionDraft(String(m.id), String(m.content ?? ""));
      });
      tools.appendChild(btn);
      div.appendChild(tools);
    }

    container.appendChild(div);
  });
  container.scrollTop = container.scrollHeight;
}

const DIM_LABEL_CHAT = {
  academic: "学术背景",
  language: "语言与标化",
  goals: "目标方向",
  budget: "预算",
  timeline: "时间线",
  riskPreference: "风险偏好",
};

export function latestAssistantMeta(messages) {
  if (!Array.isArray(messages)) return null;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === "assistant" && m.meta && typeof m.meta === "object") return m.meta;
  }
  return null;
}

export function clearChatAdvisoryPanels() {
  for (const id of ["chat-progress", "chat-gap-cards", "chat-report-hint"]) {
    const n = el(id);
    if (n) n.innerHTML = "";
  }
  const cit = el("chat-citations");
  if (cit) {
    cit.innerHTML = "";
    cit.hidden = true;
  }
}

export function defaultGapImpact(gapText) {
  const s = String(gapText);
  if (/预算|费用|学费/i.test(s)) return "预算不明时，方案梯度与费用测算可能偏差。";
  if (/时间|入学|申请季|截止/i.test(s)) return "时间线不清时，选校梯度与执行节奏难以准确落地。";
  if (/语言|雅思|托福|GRE|GMAT/i.test(s)) return "语言与标化未定时，匹配院校与风险分层可能偏乐观或偏保守。";
  if (/GPA|均分|成绩|本科/i.test(s)) return "学术画像不完整时，冲刺/匹配/保底的定位可信度下降。";
  if (/目标|专业|方向|国家|地区|香港/i.test(s)) return "目标方向未定时，方案主线与叙事难以收敛。";
  if (/风险/i.test(s)) return "风险偏好不明时，梯队组合可能不符合你的承受能力。";
  return "该项会影响后续方案与报告中的依据充分度。";
}

/** @param {Record<string, unknown> | null} meta */
export function renderChatAdvisoryPanels(meta) {
  const progEl = el("chat-progress");
  const gapEl = el("chat-gap-cards");
  const repEl = el("chat-report-hint");
  const citEl = el("chat-citations");
  if (!progEl || !gapEl || !repEl || !citEl) return;

  if (!meta) {
    clearChatAdvisoryPanels();
    return;
  }

  const pp = meta.profile_progress;
  progEl.innerHTML = "";
  if (pp && pp.dimensions && typeof pp.dimensions === "object") {
    const h = document.createElement("div");
    h.className = "chat-progress-head";
    h.textContent = `建档进度 · 总览约 ${pp.summary_pct ?? 0}%`;
    progEl.appendChild(h);
    for (const [k, v] of Object.entries(pp.dimensions)) {
      const lab = DIM_LABEL_CHAT[k] || k;
      const complete = typeof v.complete === "number" ? v.complete : 0;
      const pct = Math.round(complete * 100);
      const wrap = document.createElement("div");
      wrap.className = "chat-progress-row";
      const bar = document.createElement("div");
      bar.className = "chat-progress-bar";
      bar.setAttribute("role", "progressbar");
      bar.setAttribute("aria-valuenow", String(pct));
      bar.setAttribute("aria-valuemin", "0");
      bar.setAttribute("aria-valuemax", "100");
      const fill = document.createElement("span");
      fill.style.width = `${pct}%`;
      bar.appendChild(fill);
      const label = document.createElement("span");
      label.className = "chat-progress-label";
      label.textContent = lab;
      wrap.appendChild(label);
      wrap.appendChild(bar);
      progEl.appendChild(wrap);
    }
  }

  gapEl.innerHTML = "";
  /** @type {{ gap: string, impact: string }[]} */
  let items = [];
  if (Array.isArray(meta.gap_items) && meta.gap_items.length) {
    items = meta.gap_items.map((x) => ({
      gap: String(x.gap || "").trim(),
      impact: String(x.impact || "").trim(),
    }));
  } else if (Array.isArray(meta.gaps) && meta.gaps.length) {
    items = meta.gaps.map((g) => ({ gap: String(g).trim(), impact: "" }));
  }
  items = items.filter((x) => x.gap);
  if (items.length) {
    const gh = document.createElement("div");
    gh.className = "chat-gap-head";
    gh.textContent = "当前关键缺口";
    gapEl.appendChild(gh);
    for (const it of items) {
      const card = document.createElement("div");
      card.className = "chat-gap-card";
      const imp = it.impact || defaultGapImpact(it.gap);
      const p1 = document.createElement("p");
      p1.className = "chat-gap-title";
      p1.textContent = it.gap;
      const p2 = document.createElement("p");
      p2.className = "chat-gap-impact";
      p2.textContent = imp;
      card.appendChild(p1);
      card.appendChild(p2);
      gapEl.appendChild(card);
    }
  }

  repEl.innerHTML = "";
  const rr = meta.report_readiness;
  if (rr && typeof rr === "object") {
    const planReady = meta.readiness_for_plan === true;
    const ok = rr.ok === true;
    const box = document.createElement("div");
    box.className = ok && planReady ? "chat-hint chat-hint--ok" : "chat-hint chat-hint--warn";
    const t = document.createElement("p");
    t.className = "chat-hint-title";
    if (planReady && ok) {
      t.textContent = "档案与方案输入已就绪，可前往「选校方案」生成方案。";
    } else if (planReady) {
      t.textContent = "方案维度已齐，但报告质量仍需核对事实与缺口。";
    } else {
      t.textContent = "建议继续对话建档，并在「核对档案」确认关键事实。";
    }
    box.appendChild(t);
    if (Array.isArray(rr.reasons) && rr.reasons.length) {
      const ul = document.createElement("ul");
      for (const r of rr.reasons) {
        const li = document.createElement("li");
        li.textContent = String(r);
        ul.appendChild(li);
      }
      box.appendChild(ul);
    }
    if (Array.isArray(rr.next_steps) && rr.next_steps.length) {
      const p = document.createElement("p");
      p.className = "chat-hint-next";
      p.textContent = `下一步：${rr.next_steps.join(" ")}`;
      box.appendChild(p);
    }
    repEl.appendChild(box);
  }

  const citations = meta.citations;
  if (Array.isArray(citations) && citations.length) {
    citEl.hidden = false;
    citEl.innerHTML = "";
    const head = document.createElement("div");
    head.className = "chat-cit-head";
    head.textContent = "本轮引用来源";
    citEl.appendChild(head);
    const ul = document.createElement("ul");
    ul.className = "chat-cit-list";
    for (const c of citations) {
      if (!c || typeof c !== "object") continue;
      const url = String(c.url || "").trim();
      if (!url) continue;
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = String(c.sourceTitle || c.itemId || url);
      li.appendChild(a);
      ul.appendChild(li);
    }
    citEl.appendChild(ul);
  } else {
    citEl.innerHTML = "";
    citEl.hidden = true;
  }
}

export function syncComposerReplaceBanner() {
  const box = el("chat-replace-draft");
  const sendBtn = el("send");
  if (box)
    box.classList.toggle(
      "hidden",
      appState.composerReplacementUserMessageId == null || appState.composerReplacementUserMessageId === "",
    );
  if (sendBtn) {
    const active = appState.composerReplacementUserMessageId != null && String(appState.composerReplacementUserMessageId).trim() !== "";
    sendBtn.textContent = active ? "重新发给助手（覆盖上条回复）" : "提交给顾问助手";
  }
}

export function resetComposerReplaceDraftQuiet() {
  appState.composerReplacementUserMessageId = null;
  appState.composerCorrectionBackfill = "";
  appState.composerCorrectionThreadId = null;
  syncComposerReplaceBanner();
}

export function enterComposerCorrectionDraft(messageId, userTextBody) {
  const mid = messageId != null ? String(messageId) : "";
  if (!mid) return;
  const inp = el("input");
  appState.composerCorrectionBackfill = inp?.value ?? "";
  appState.composerReplacementUserMessageId = mid;
  appState.composerCorrectionThreadId = localStorage.getItem(LS_THREAD);
  if (inp) inp.value = String(userTextBody ?? "").trimEnd();
  syncComposerReplaceBanner();
  inp?.focus();
  setStatus("已载入你上一条提问，请在输入框改正后发送；将把修改后的正文交给助手并覆盖上一轮回复。", false);
}

export function clearComposerCorrectionDraft() {
  if (appState.composerReplacementUserMessageId) {
    const inp = el("input");
    if (inp) inp.value = appState.composerCorrectionBackfill;
  }
  resetComposerReplaceDraftQuiet();
}

export async function ensureSession() {
  const token = localStorage.getItem(LS_TOKEN);
  if (!token) throw new Error("请先登录工作台，再继续当前操作。");
  let threadId = localStorage.getItem(LS_THREAD);
  if (!threadId) {
    const t = await api("/api/v1/threads", { method: "POST" });
    threadId = t.thread_id;
    localStorage.setItem(LS_THREAD, threadId);
  }
  return { token, threadId };
}

export async function refreshReviewerNav() {
  const nav = el("nav-admin-intel");
  if (!nav) return;
  try {
    const st = await api("/api/v1/intelligence/review/status");
    nav.classList.toggle("hidden", !st.can_review);
  } catch {
    nav.classList.add("hidden");
  }
}

export async function loadThread(threadId) {
  const tidStr = threadId != null ? String(threadId) : "";
  if (
    appState.composerReplacementUserMessageId &&
    appState.composerCorrectionThreadId &&
    tidStr &&
    appState.composerCorrectionThreadId !== tidStr
  ) {
    resetComposerReplaceDraftQuiet();
    setStatus("已切换会话，未发送的纠错草稿已收起。", false);
  }
  const metaEl = el("meta");
  const container = el("messages");
  const apply = (thread) => {
    metaEl.textContent = formatThreadMeta(thread);
    const msgs = thread.messages || [];
    renderMessages(container, msgs);
    renderChatAdvisoryPanels(latestAssistantMeta(msgs));
  };
  try {
    const thread = await api(`/api/v1/threads/${threadId}`);
    apply(thread);
  } catch (e) {
    const msg = String(e.message || "");
    const ourThreadMissing =
      e.status === 404 &&
      (e.code === "thread_not_found" ||
        e.code === "not_found" ||
        msg.includes("会话不存在") ||
        msg.includes("无权访问"));
    if (ourThreadMissing && localStorage.getItem(LS_THREAD) === threadId) {
      localStorage.removeItem(LS_THREAD);
      const t = await api("/api/v1/threads", { method: "POST" });
      localStorage.setItem(LS_THREAD, t.thread_id);
      const thread = await api(`/api/v1/threads/${t.thread_id}`);
      apply(thread);
      return;
    }
    throw e;
  }
}
