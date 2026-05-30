import { track } from "./track.js";
import { api, LS_LAST_PLAN, LS_LAST_REPORT, LS_THREAD, LS_TOKEN } from "./api/client.js";
import { el } from "./lib/dom.js";
import {
  loadAdminIntelligencePage,
  loadIntelligencePage,
  runAdminPreflightUrls,
  runAdminSafeCollect,
} from "./pages/intelligence.js";
import { loadProfile } from "./pages/profile.js";
import { loadPlanPage } from "./pages/plan.js";
import { loadReportPage } from "./pages/report.js";
import { loadHistoryPage } from "./pages/history.js";
import {
  loadThread,
  resetComposerReplaceDraftQuiet,
  clearComposerCorrectionDraft,
} from "./pages/chat.js";
import { navigateTo, logout, parseHash } from "./shell/navigation.js";
import { handleRoute, showPanel } from "./shell/router.js";
import { getComposerReplacementUserMessageId } from "./app-state.js";

el("refresh-intelligence")?.addEventListener("click", () => {
  const r = parseHash();
  loadIntelligencePage(r.schoolSlug || null);
});

el("intel-search-form")?.addEventListener("submit", (ev) => {
  ev.preventDefault();
  import("./pages/intelligence.js").then((m) => m.runIntelligenceSearch());
});

el("refresh-admin-intel")?.addEventListener("click", () => loadAdminIntelligencePage());
el("admin-intel-preflight")?.addEventListener("click", () => runAdminPreflightUrls());
el("admin-intel-collect")?.addEventListener("click", () => runAdminSafeCollect());

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
        "登录账号与密码会保留。此操作不可撤销。"
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
    const status = el("status");
    if (status) {
      status.textContent = "已清空建档数据，已切换到新咨询会话。可在下方继续对话。";
      status.className = "status";
    }
  } catch (e) {
    window.alert(String(e.message || e));
  } finally {
    if (btn) btn.disabled = false;
  }
});

el("form")?.addEventListener("submit", async (ev) => {
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
  const status = el("status");
  if (status) {
    status.textContent = "顾问正在分析你刚提交的信息…";
    status.className = "status";
  }
  try {
    const { ensureSession } = await import("./pages/chat.js");
    await ensureSession();
    threadId = localStorage.getItem(LS_THREAD);
    if (!threadId) {
      if (status) {
        status.textContent = "咨询会话尚未就绪，请刷新页面后重试。";
        status.className = "status err";
      }
      return;
    }
    const replaceMid = getComposerReplacementUserMessageId()
      ? String(getComposerReplacementUserMessageId()).trim()
      : "";
    const body = { content };
    if (replaceMid) body.replace_user_message_id = replaceMid;

    track(
      replaceMid ? "chat_message_replace_send" : "chat_message_send",
      { thread_id: threadId, ...(replaceMid ? { replace_message_id: replaceMid.slice(0, 12) } : {}) }
    );
    const res = await api(`/api/v1/threads/${threadId}/messages`, {
      method: "POST",
      body,
    });
    input.value = "";
    resetComposerReplaceDraftQuiet();
    await loadThread(threadId);
    await loadProfile();
    const { formatFlowState } = await import("./copy.js");
    const gaps = res.gaps || [];
    if (status) {
      if (gaps.length) {
        status.textContent = `建议优先补充：${gaps.join("；")}`;
        status.className = "status";
      } else {
        status.textContent = `当前阶段：${formatFlowState(res.orchestration_state)}`;
        status.className = "status";
      }
    }
  } catch (e) {
    if (status) {
      status.textContent = String(e.message || e);
      status.className = "status err";
    }
  } finally {
    btn.disabled = false;
  }
});

el("input")?.addEventListener("keydown", (ev) => {
  if (ev.key !== "Enter" || ev.shiftKey || ev.isComposing) return;
  ev.preventDefault();
  el("form")?.requestSubmit();
});

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
  const status = el("status");
  if (status) {
    status.textContent = "已取消纠错，可直接输入新的提问。";
    status.className = "status";
  }
});
