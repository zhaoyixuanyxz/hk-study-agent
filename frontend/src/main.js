import { track } from "./track.js";
import { extractAssistantDisplayText } from "./assistant-text.js";
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
} from "./copy.js";

const LS_TOKEN = "study_agent_token";
const LS_THREAD = "study_agent_thread_id";
const LS_LAST_PLAN = "study_agent_last_plan_id";
const LS_LAST_REPORT = "study_agent_last_report_id";

/** 纠错上一用户轮：若非 null，提交时需带 replace_user_message_id */
let composerReplacementUserMessageId = null;
/** 进入纠错草稿前底部输入框中的内容（取消时还原） */
let composerCorrectionBackfill = "";
/** 纠错草稿针对的会话；切换会话时自动放弃未发送的纠错 */
let composerCorrectionThreadId = null;
function clearStoredSession() {
  localStorage.removeItem(LS_TOKEN);
  localStorage.removeItem(LS_THREAD);
  localStorage.removeItem(LS_LAST_PLAN);
  localStorage.removeItem(LS_LAST_REPORT);
}

/** @param {string} path */
function isPublicApiPath(path) {
  return (
    path.startsWith("/api/v1/auth/login") ||
    path.startsWith("/api/v1/auth/register") ||
    path.startsWith("/api/v1/users/register")
  );
}

/** @type {Record<string, unknown> | null} */
let currentReportDetail = null;

/** @type {{ ok?: boolean, reasons?: string[], next_steps?: string[] } | null} */
let lastPlanReportReadiness = null;

function el(id) {
  return document.getElementById(id);
}

/** @param {unknown} data */
function formatApiErrorMessage(data, text, status) {
  if (data && typeof data === "object" && "raw" in data) {
    if (typeof text === "string" && text.length > 0 && text.length < 800) return text;
    return `HTTP ${status}`;
  }
  if (data && typeof data === "object") {
    if (typeof data.message === "string" && data.message) return data.message;
    if (typeof data.code === "string" && data.code) return data.code;
    if ("detail" in data && data.detail !== undefined) {
      const d = data.detail;
      if (typeof d === "string") return d;
      if (Array.isArray(d)) {
        return d
          .map((x) => (x && typeof x === "object" && "msg" in x ? String(x.msg) : JSON.stringify(x)))
          .join("; ");
      }
    }
  }
  if (typeof text === "string" && text.length > 0 && text.length < 800) return text;
  return `HTTP ${status}`;
}

async function api(path, opts = {}) {
  const headers = { ...opts.headers };
  const token = localStorage.getItem(LS_TOKEN);
  if (token && !isPublicApiPath(path)) headers.Authorization = `Bearer ${token}`;
  if (opts.body && typeof opts.body === "object" && !(opts.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
    opts = { ...opts, body: JSON.stringify(opts.body) };
  }
  const r = await fetch(path, { ...opts, headers });
  const text = await r.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!r.ok) {
    let msg = formatApiErrorMessage(data, text, r.status);
    if (r.status === 401 && data && typeof data === "object" && data.code === "invalid_token") {
      clearStoredSession();
      msg = "登录已失效（与服务器不同步）。请重新登录。";
      if (typeof location !== "undefined" && !String(location.hash || "").includes("/login")) {
        location.hash = "#/login";
      }
    }
    const looksFastApi = Boolean(
      data && typeof data === "object" && "detail" in data && typeof data.message !== "string"
    );
    if (looksFastApi) {
      msg +=
        "（提示：该响应格式通常不是本项目的 Node（Fastify）后端。请确认本仓库 backend 已启动（默认端口 8010，与 frontend/vite.config.js 代理一致），浏览器访问 http://127.0.0.1:8010/health 应返回 {\"status\":\"ok\"}。）";
    }
    if (
      r.status === 404 &&
      typeof msg === "string" &&
      /^Route\s+\w+:\//.test(msg) &&
      msg.includes("not found")
    ) {
      msg =
        "该 API 路由在后端未注册，多为正在运行的 API 仍是旧版本。请先结束占用 8010 端口的旧进程，在本仓库 backend 目录执行 npm run dev（或 npm start）后再试。";
    }
    const err = new Error(msg);
    if (data && typeof data === "object") {
      if (data.code) err.code = data.code;
      if (data.suggestion) err.suggestion = data.suggestion;
      if (data.retryable !== undefined) err.retryable = data.retryable;
      if (data.meta) err.meta = data.meta;
    }
    err.status = r.status;
    throw err;
  }
  return data;
}

function fullUrlFromApiPath(path) {
  if (!path || typeof path !== "string") return "";
  try {
    return new URL(path, window.location.origin).href;
  } catch {
    return path;
  }
}

/** @param {unknown} st */
function shareStatusLabel(st) {
  if (st === "active") return "已分享";
  if (st === "revoked") return "已关闭分享";
  return "未分享";
}

async function downloadReportPdf(reportId) {
  const token = localStorage.getItem(LS_TOKEN);
  const r = await fetch(`/api/v1/reports/${encodeURIComponent(String(reportId))}/pdf`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) {
    const text = await r.text();
    let msg = `HTTP ${r.status}`;
    try {
      const j = JSON.parse(text);
      if (j && typeof j.message === "string") msg = j.message;
    } catch {
      /* */
    }
    throw new Error(msg);
  }
  const buf = await r.arrayBuffer();
  const bytes = new Uint8Array(buf);
  const sig = bytes.length >= 4 ? String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) : "";
  if (sig !== "%PDF") {
    throw new Error("服务器返回的不是有效 PDF。若在本机开发，请确认已安装 Puppeteer 所需的 Chromium。");
  }
  const blob = new Blob([buf], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const safe = String(reportId).replace(/[^\w-]/g, "").slice(0, 12) || "report";
  a.href = url;
  a.download = `report-${safe}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}

function setupReportDeliveryUi() {
  const pdfBtn = el("btn-report-pdf");
  const onBtn = el("btn-report-share-on");
  const copyBtn = el("btn-report-share-copy");
  const openBtn = el("btn-report-share-open");
  const offBtn = el("btn-report-share-off");
  if (!pdfBtn || !onBtn || !copyBtn || !openBtn || !offBtn) return;
  if (!currentReportDetail || !currentReportDetail.report_id) {
    pdfBtn.classList.add("hidden");
    onBtn.classList.add("hidden");
    copyBtn.classList.add("hidden");
    openBtn.classList.add("hidden");
    offBtn.classList.add("hidden");
    return;
  }
  pdfBtn.classList.remove("hidden");
  const active = currentReportDetail.share_status === "active";
  onBtn.classList.toggle("hidden", active);
  copyBtn.classList.toggle("hidden", !active);
  openBtn.classList.toggle("hidden", !active);
  offBtn.classList.toggle("hidden", !active);
}

function renderMessages(container, items) {
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

function latestAssistantMeta(messages) {
  if (!Array.isArray(messages)) return null;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === "assistant" && m.meta && typeof m.meta === "object") return m.meta;
  }
  return null;
}

function clearChatAdvisoryPanels() {
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

function defaultGapImpact(gapText) {
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
function renderChatAdvisoryPanels(meta) {
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

function setStatus(text, isErr) {
  const s = el("status");
  s.textContent = text;
  s.className = isErr ? "status err" : "status";
}

function syncComposerReplaceBanner() {
  const box = el("chat-replace-draft");
  const sendBtn = el("send");
  if (box)
    box.classList.toggle(
      "hidden",
      composerReplacementUserMessageId == null || composerReplacementUserMessageId === "",
    );
  if (sendBtn) {
    const active = composerReplacementUserMessageId != null && String(composerReplacementUserMessageId).trim() !== "";
    sendBtn.textContent = active ? "重新发给助手（覆盖上条回复）" : "提交给顾问助手";
  }
}

function resetComposerReplaceDraftQuiet() {
  composerReplacementUserMessageId = null;
  composerCorrectionBackfill = "";
  composerCorrectionThreadId = null;
  syncComposerReplaceBanner();
}

function enterComposerCorrectionDraft(messageId, userTextBody) {
  const mid = messageId != null ? String(messageId) : "";
  if (!mid) return;
  const inp = el("input");
  composerCorrectionBackfill = inp?.value ?? "";
  composerReplacementUserMessageId = mid;
  composerCorrectionThreadId = localStorage.getItem(LS_THREAD);
  if (inp) inp.value = String(userTextBody ?? "").trimEnd();
  syncComposerReplaceBanner();
  inp?.focus();
  setStatus("已载入你上一条提问，请在输入框改正后发送；将把修改后的正文交给助手并覆盖上一轮回复。", false);
}

function clearComposerCorrectionDraft() {
  if (composerReplacementUserMessageId) {
    const inp = el("input");
    if (inp) inp.value = composerCorrectionBackfill;
  }
  resetComposerReplaceDraftQuiet();
}

function prettyTime(value) {
  if (!value) return "时间待更新";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString("zh-CN", { hour12: false });
}

function shortId(value) {
  if (!value) return "—";
  return `${String(value).slice(0, 8)}…`;
}

/** @returns {{ kind: 'auth', auth: 'login' | 'register' } | { kind: 'app', panel: string, reportId: string | null }} */
function parseHash() {
  const raw = (location.hash || "").replace(/^#/, "");
  const path = raw.startsWith("/") ? raw : `/${raw || "login"}`;
  const parts = path.split("/").filter(Boolean);
  const p0 = parts[0] || "login";
  if (p0 === "login") return { kind: "auth", auth: "login" };
  if (p0 === "register") return { kind: "auth", auth: "register" };
  if (p0 === "report" && parts[1])
    return { kind: "app", panel: "report", reportId: parts[1] };
  if (p0 === "intelligence" || (p0 === "admin" && parts[1] === "intelligence")) {
    return { kind: "app", panel: "chat", reportId: null };
  }
  const panels = ["chat", "profile", "plan", "report", "history"];
  if (panels.includes(p0)) return { kind: "app", panel: p0, reportId: null };
  return { kind: "auth", auth: "login" };
}

function showAuth(which) {
  el("view-auth").classList.remove("hidden");
  el("view-app").classList.add("hidden");
  el("form-login").classList.toggle("hidden", which !== "login");
  el("form-register").classList.toggle("hidden", which !== "register");
  const title = el("auth-card-title");
  const sub = el("auth-card-sub");
  if (which === "register") {
    if (title) title.textContent = "创建顾问档案";
    if (sub) sub.textContent = "填写邮箱与密码，立即开启你的咨询工作台";
  } else {
    if (title) title.textContent = "欢迎回到顾问席位";
    if (sub) sub.textContent = "登录后继续推进你的申请档案与咨询建议";
  }
}

function showAppShell() {
  el("view-auth").classList.add("hidden");
  el("view-app").classList.remove("hidden");
}

/**
 * @param {string} panel
 * @param {string | null} [routeReportId]
 */
function navigateTo(panel, routeReportId = null) {
  if (panel === "report" && routeReportId) {
    location.hash = `#/report/${encodeURIComponent(routeReportId)}`;
  } else {
    location.hash = `#/${panel}`;
  }
}

function logout() {
  resetComposerReplaceDraftQuiet();
  clearStoredSession();
  location.hash = "#/login";
}

/**
 * @param {string} name
 * @param {string | null} [routeReportId]
 */
function showPanel(name, routeReportId = null) {
  const chat = el("panel-chat");
  const prof = el("panel-profile");
  const plan = el("panel-plan");
  const report = el("panel-report");
  const hist = el("panel-history");
  const links = document.querySelectorAll(".nav-link");
  const stepNavName = name;
  for (const a of links) {
    const p = a.dataset.panel || "";
    a.classList.toggle("active", p === stepNavName);
  }
  const stepOrder = ["chat", "profile", "plan", "report"];
  const currentStep = stepOrder.indexOf(stepNavName);
  const stepper = document.querySelector(".nav-stepper");
  const stepLinks = document.querySelectorAll(".nav-step");
  for (const step of stepLinks) {
    const stepIndex = stepOrder.indexOf(step.dataset.panel || "");
    const done = currentStep >= 0 && stepIndex >= 0 && stepIndex < currentStep;
    step.classList.toggle("done", done);
  }
  if (stepper) {
    const ratio = currentStep >= 0 ? currentStep / (stepOrder.length - 1) : 1;
    stepper.style.setProperty("--progress-width", `${Math.max(0, Math.min(1, ratio)) * 100}%`);
  }
  chat.classList.toggle("hidden", name !== "chat");
  prof.classList.toggle("hidden", name !== "profile");
  if (plan) plan.classList.toggle("hidden", name !== "plan");
  if (report) report.classList.toggle("hidden", name !== "report");
  if (hist) hist.classList.toggle("hidden", name !== "history");

  track("nav_click", { to: name });
  if (name === "chat") {
    const tid = localStorage.getItem(LS_THREAD);
    if (tid) {
      loadThread(tid).catch((e) => setStatus(String(e.message || e), true));
    }
    loadProfile();
  }
  if (name === "profile") loadProfile();
  if (name === "plan") loadPlanPage();
  if (name === "report") loadReportPage(routeReportId);
  if (name === "history") {
    track("history_view", {});
    loadHistoryPage();
  }
}

function statusLabel(s) {
  if (s === "confirmed") return "已确认";
  if (s === "pending") return "待你确认";
  if (s === "conflict") return "需复核";
  return s || "";
}

/**
 * 对话内待确认事实卡片（pending / conflict）
 * @param {object | null} snapshot
 */
function renderConfirmStrip(snapshot) {
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

function renderProfileGapDetails(ul, profileView) {
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
function renderProfileSections(container, profileView) {
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

function renderPlanReportGate(rr) {
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

async function loadProfile() {
  const summaryEl = el("profile-summary");
  const gapsEl = el("profile-gaps");
  const sectionsEl = el("profile-sections");
  const readinessEl = el("profile-readiness");
  const updatedEl = el("profile-updated");
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

function escapeHtml(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

/**
 * 助手气泡内极简 Markdown：**加粗**、换行；其余已 HTML 转义。
 * @param {string} plain
 */
function formatAssistantHtml(plain) {
  let h = escapeHtml(plain);
  h = h.replace(/\n/g, "<br>");
  h = h.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  return h;
}

async function ensureSession() {
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

async function loadThread(threadId) {
  const tidStr = threadId != null ? String(threadId) : "";
  if (
    composerReplacementUserMessageId &&
    composerCorrectionThreadId &&
    tidStr &&
    composerCorrectionThreadId !== tidStr
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

/** 路由：未登录仅允许 auth；已登录进入应用壳 */
async function handleRoute() {
  const token = localStorage.getItem(LS_TOKEN);
  const r = parseHash();

  if (!token) {
    showAuth(r.auth === "register" ? "register" : "login");
    if (r.kind !== "auth") {
      location.hash = "#/login";
    }
    return;
  }

  showAppShell();
  if (r.kind === "auth") {
    location.replace(`${location.pathname}${location.search}#/chat`);
    return;
  }

  try {
    await ensureSession();
  } catch (e) {
    logout();
    const err = el("login-err");
    if (err) {
      err.textContent = String(e.message || e);
      err.classList.remove("hidden");
    }
    return;
  }

  showPanel(r.panel, r.reportId);
}

document.querySelectorAll(".nav-link").forEach((a) => {
  a.addEventListener("click", (ev) => {
    if (!localStorage.getItem(LS_TOKEN)) {
      ev.preventDefault();
      location.hash = "#/login";
    }
  });
});

el("refresh-profile")?.addEventListener("click", () => loadProfile());

el("btn-profile-full-reset")?.addEventListener("click", async () => {
  if (!localStorage.getItem(LS_TOKEN)) {
    location.hash = "#/login";
    return;
  }
  if (
    !window.confirm(
      "确定要清空全部建档数据吗？\n\n" +
        "将永久删除：画像记忆与快照、检索块、会话摘要、已生成的方案与报告、以及所有咨询会话与消息。\n\n" +
        "登录账号与密码会保留。此操作不可撤销。",
    )
  ) {
    return;
  }
  const typed = window.prompt('若仍要执行，请在下方输入「清空」二字（不含引号），然后点确定。');
  if (typed !== "清空") {
    if (typed != null && typed !== "") window.alert("输入不正确，已取消。");
    return;
  }
  const btn = el("btn-profile-full-reset");
  if (btn) btn.disabled = true;
  try {
    const res = await api("/api/v1/profile/full-reset", {
      method: "POST",
      body: { confirm: true },
    });
    resetComposerReplaceDraftQuiet();
    localStorage.setItem(LS_THREAD, res.thread_id);
    localStorage.removeItem(LS_LAST_PLAN);
    localStorage.removeItem(LS_LAST_REPORT);
    track("profile_full_reset", { removed_threads: res.removed?.threads });
    navigateTo("chat");
    await loadThread(res.thread_id);
    await loadProfile();
    setStatus("已清空建档数据，已切换到新咨询会话。可在下方继续对话。", false);
  } catch (e) {
    window.alert(String(e.message || e));
  } finally {
    if (btn) btn.disabled = false;
  }
});

el("form").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const input = el("input");
  const content = input.value.trim();
  if (!content) return;
  if (!localStorage.getItem(LS_TOKEN)) {
    location.hash = "#/login";
    return;
  }
  let threadId = localStorage.getItem(LS_THREAD);
  const btn = el("send");
  btn.disabled = true;
  setStatus("顾问正在分析你刚提交的信息…");
  try {
    await ensureSession();
    threadId = localStorage.getItem(LS_THREAD);
    if (!threadId) {
      setStatus("咨询会话尚未就绪，请刷新页面后重试。", true);
      return;
    }
    const replaceMid = composerReplacementUserMessageId
      ? String(composerReplacementUserMessageId).trim()
      : "";
    /** @type {Record<string, string>} */
    const body = { content };
    if (replaceMid) body.replace_user_message_id = replaceMid;

    track(
      replaceMid ? "chat_message_replace_send" : "chat_message_send",
      { thread_id: threadId, ...(replaceMid ? { replace_message_id: replaceMid.slice(0, 12) } : {}) },
    );
    const res = await api(`/api/v1/threads/${threadId}/messages`, {
      method: "POST",
      body,
    });
    input.value = "";
    resetComposerReplaceDraftQuiet();
    await loadThread(threadId);
    await loadProfile();
    const gaps = res.gaps || [];
    if (gaps.length) {
      setStatus(`建议优先补充：${gaps.join("；")}`);
    } else {
      setStatus(`当前阶段：${formatFlowState(res.orchestration_state)}`);
    }
  } catch (e) {
    setStatus(String(e.message || e), true);
  } finally {
    btn.disabled = false;
  }
});

/** Enter 发送，Shift+Enter 换行；输入法组字期间 Enter 不提交 */
el("input")?.addEventListener("keydown", (ev) => {
  if (ev.key !== "Enter" || ev.shiftKey || ev.isComposing) return;
  ev.preventDefault();
  el("form")?.requestSubmit();
});

function hidePlanError() {
  const box = el("plan-error");
  if (box) {
    box.classList.add("hidden");
    box.innerHTML = "";
  }
}

function showPlanError(msg, suggestion) {
  const box = el("plan-error");
  if (!box) return;
  box.classList.remove("hidden");
  const sug = suggestion || "";
  box.innerHTML = `<p>${escapeHtml(msg)}</p>${sug ? `<p class="suggestion">${escapeHtml(sug)}</p>` : ""}`;
}

function setPlanStatus(text, isErr) {
  const s = el("plan-status");
  if (!s) return;
  s.textContent = text;
  s.className = isErr ? "meta meta-line err" : "meta meta-line";
}

function renderPlan(plan) {
  const container = el("plan-content");
  if (!container || !plan) return;
  const t = plan.tiers || {};
  const reach = t.reach || {};
  const match = t.match || {};
  const safety = t.safety || {};

  const tierHtml = (x, fallbackLabel) => {
    const label = x.label || fallbackLabel;
    const risk = (x.risk_note || "").trim()
      ? `<p class="tier-risk">${escapeHtml(x.risk_note)}</p>`
      : "";
    return `<section class="card tier-card">
      <h3>${escapeHtml(label)}</h3>
      <p>${escapeHtml(x.summary || "")}</p>
      <p class="rationale">${escapeHtml(x.rationale || "")}</p>
      ${risk}
    </section>`;
  };

  const tuLine = formatTimelineUrgencyLine(plan.timeline_urgency);

  container.innerHTML = `
    ${tierHtml(reach, "冲刺建议")}
    ${tierHtml(match, "匹配建议")}
    ${tierHtml(safety, "保底建议")}
    <section class="card plan-budget-card">
      <h3>整体风险与预算</h3>
      <p>${escapeHtml(plan.risk_summary || "")}</p>
      <p>${escapeHtml(plan.budget_suggestion || "")}</p>
    </section>
    <section class="card plan-timeline-card">
      <h3>时间线与节奏</h3>
      ${tuLine ? `<p class="timeline-urgency">${escapeHtml(tuLine)}</p>` : ""}
      <p>${escapeHtml(plan.timeline_suggestion || "")}</p>
    </section>
  `;

  appendPlanCitationSection(container, plan);

  const disc = document.createElement("p");
  disc.className = "disclaimer";
  disc.textContent = plan.disclaimer || "";
  container.appendChild(disc);
}

function appendPlanCitationSection(container, plan) {
  const cites = Array.isArray(plan.citations) ? plan.citations : [];
  const sec = document.createElement("section");
  sec.className = cites.length ? "card plan-citations" : "card plan-citations plan-citations--empty";
  const h = document.createElement("h3");
  h.textContent = "知识库与外链引用";
  sec.appendChild(h);
  if (!cites.length) {
    const p = document.createElement("p");
    p.className = "placeholder";
    p.textContent = formatPlanCitationsHint();
    sec.appendChild(p);
  } else {
    const ul = document.createElement("ul");
    ul.className = "plan-citation-list";
    for (const c of cites) {
      const li = document.createElement("li");
      const a = document.createElement("a");
      const url = String(c.url || "").trim();
      a.href = url || "#";
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = c.sourceTitle || url || "来源链接";
      li.appendChild(a);
      if (c.publishedAt) {
        li.appendChild(document.createTextNode(` · ${String(c.publishedAt)}`));
      }
      ul.appendChild(li);
    }
    sec.appendChild(ul);
  }
  container.appendChild(sec);
}

async function loadPlanPage() {
  hidePlanError();
  setPlanStatus("正在加载顾问方案，请稍候…");
  const container = el("plan-content");
  try {
    const lastId = localStorage.getItem(LS_LAST_PLAN);
    const list = await api("/api/v1/plans");
    let targetId = lastId;
    if (!targetId && list.plans && list.plans.length) {
      targetId = list.plans[0].plan_id;
    }
    if (!targetId) {
      lastPlanReportReadiness = null;
      renderPlanReportGate(null);
      setPlanStatus("");
      if (container) {
        container.innerHTML = `<p class="placeholder">暂无方案。请先在「画像」中确认就绪后，点击「生成方案」。</p>`;
      }
      return;
    }
    const detail = await api(`/api/v1/plans/${targetId}`);
    lastPlanReportReadiness = detail.report_readiness || null;
    renderPlanReportGate(lastPlanReportReadiness);
    if (detail.plan) {
      renderPlan(detail.plan);
      localStorage.setItem(LS_LAST_PLAN, detail.plan_id);
      setPlanStatus(`已加载 · ${String(detail.plan_id).slice(0, 8)}…`);
    }
  } catch (e) {
    lastPlanReportReadiness = null;
    renderPlanReportGate(null);
    setPlanStatus(String(e.message || e), true);
    if (container) {
      container.innerHTML = `<p class="placeholder">加载失败，请稍后重试。</p>`;
    }
  }
}

el("btn-generate-plan")?.addEventListener("click", async () => {
  const btn = el("btn-generate-plan");
  hidePlanError();
  setPlanStatus("顾问正在生成方案，请稍候…");
  track("plan_generate_click", {});
  if (btn) btn.disabled = true;
  try {
    const res = await api("/api/v1/plans/generate", { method: "POST", body: {} });
    track("plan_generate_result", { ok: true, code: res.code || null });
    if (res.plan_id) localStorage.setItem(LS_LAST_PLAN, res.plan_id);
    const detail = res.plan_id
      ? await api(`/api/v1/plans/${res.plan_id}`)
      : { plan: res.plan, report_readiness: null };
    lastPlanReportReadiness = detail.report_readiness || null;
    renderPlanReportGate(lastPlanReportReadiness);
    if (detail.plan) renderPlan(detail.plan);
    else if (res.plan) renderPlan(res.plan);
    setPlanStatus(`已生成 · ${String(res.plan_id || "").slice(0, 8)}…`);
  } catch (e) {
    track("plan_generate_result", { ok: false, code: e.code || null });
    const sug = e.suggestion || "";
    showPlanError(e.message || "顾问方案生成失败", sug);
    setPlanStatus("暂时无法生成方案，请按提示补充后再试。", true);
  } finally {
    if (btn) btn.disabled = false;
  }
});

el("refresh-plan")?.addEventListener("click", () => loadPlanPage());

function hideReportError() {
  const box = el("report-error");
  if (box) {
    box.classList.add("hidden");
    box.innerHTML = "";
  }
}

function showReportError(msg, suggestion) {
  const box = el("report-error");
  if (!box) return;
  box.classList.remove("hidden");
  const sug = suggestion || "";
  box.innerHTML = `<p>${escapeHtml(msg)}</p>${sug ? `<p class="suggestion">${escapeHtml(sug)}</p>` : ""}`;
}

function setReportStatus(text, isErr) {
  const s = el("report-status");
  if (!s) return;
  s.textContent = text;
  s.className = isErr ? "meta meta-line err" : "meta meta-line";
}

function renderReport(detail) {
  currentReportDetail = detail && typeof detail === "object" ? detail : null;
  const container = el("report-content");
  const meta = el("report-meta");
  if (!container) return;
  if (detail && detail.html) {
    container.innerHTML = detail.html;
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
async function loadReportPage(routeReportId) {
  hideReportError();
  setReportStatus("正在加载顾问报告，请稍候…");
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
      currentReportDetail = null;
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
    currentReportDetail = null;
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
  setPlanStatus("顾问正在生成报告，请稍候…");
  if (btn) btn.disabled = true;
  try {
    const planId = localStorage.getItem(LS_LAST_PLAN);
    const body = planId ? { plan_id: planId } : {};
    const res = await api("/api/v1/reports/generate", { method: "POST", body });
    track("report_generate_result", { ok: true });
    if (res.report_id) {
      localStorage.setItem(LS_LAST_REPORT, res.report_id);
      setPlanStatus("报告已生成，已自动跳转到报告页。");
      navigateTo("report", res.report_id);
    }
  } catch (e) {
    track("report_generate_result", { ok: false });
    const sug = e.suggestion || "";
    showPlanError(e.message || "顾问报告生成失败", sug);
    setPlanStatus("报告生成失败，请稍后重试或先检查方案完整度。", true);
  } finally {
    if (btn) btn.disabled = false;
  }
});

/** 历史：由 Phase 4 面板实现 */
async function loadHistoryPage() {
  const content = el("history-content");
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

el("refresh-history")?.addEventListener("click", () => loadHistoryPage());

el("btn-logout")?.addEventListener("click", () => logout());

el("form-login")?.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const errEl = el("login-err");
  errEl.classList.add("hidden");
  errEl.textContent = "";
  const email = el("login-email").value.trim();
  const password = el("login-password").value;
  try {
    const data = await api("/api/v1/auth/login", { method: "POST", body: { email, password } });
    localStorage.setItem(LS_TOKEN, data.token);
    track("auth_login_success", {});
    location.hash = "#/chat";
  } catch (e) {
    errEl.textContent = String(e.message || e);
    errEl.classList.remove("hidden");
  }
});

el("form-register")?.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const errEl = el("register-err");
  errEl.classList.add("hidden");
  errEl.textContent = "";
  const email = el("register-email").value.trim();
  const p1 = el("register-password").value;
  const p2 = el("register-password2").value;
  if (p1 !== p2) {
    errEl.textContent = "两次密码输入不一致，请重新确认。";
    errEl.classList.remove("hidden");
    return;
  }
  try {
    const data = await api("/api/v1/auth/register", { method: "POST", body: { email, password: p1 } });
    localStorage.setItem(LS_TOKEN, data.token);
    track("auth_register_success", {});
    location.hash = "#/chat";
  } catch (e) {
    errEl.textContent = String(e.message || e);
    errEl.classList.remove("hidden");
  }
});

function onWindowLoad() {
  const token = localStorage.getItem(LS_TOKEN);
  const h = location.hash;
  if (!token) {
    if (!h || h === "#" || h === "") location.hash = "#/login";
  } else if (!h || h === "#" || h === "" || h === "#/login" || h === "#/register") {
    location.hash = "#/chat";
  }
  handleRoute();
}

window.addEventListener("load", onWindowLoad);
window.addEventListener("hashchange", () => handleRoute());

el("cancel-replace-draft")?.addEventListener("click", () => {
  clearComposerCorrectionDraft();
  setStatus("已取消纠错，可直接输入新的提问。", false);
});
