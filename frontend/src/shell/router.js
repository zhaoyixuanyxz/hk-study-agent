import { track } from "../track.js";
import { LS_THREAD, LS_TOKEN } from "../api/client.js";
import { el, setStatus } from "../lib/dom.js";
import { loadIntelligencePage, loadAdminIntelligencePage } from "../pages/intelligence.js";
import { loadProfile } from "../pages/profile.js";
import { loadPlanPage } from "../pages/plan.js";
import { loadReportPage } from "../pages/report.js";
import { loadHistoryPage } from "../pages/history.js";
import { loadThread } from "../pages/chat.js";
import { showAuth, showAppShell, parseHash, logout } from "./navigation.js";
import { ensureSession, refreshReviewerNav } from "../pages/chat.js";

export function showPanel(name, routeReportId = null, schoolSlug = null) {
  const chat = el("panel-chat");
  const prof = el("panel-profile");
  const plan = el("panel-plan");
  const report = el("panel-report");
  const hist = el("panel-history");
  const intel = el("panel-intelligence");
  const adminIntel = el("panel-admin-intelligence");
  const links = document.querySelectorAll(".nav-link");
  const stepNavName = ["intelligence", "admin-intelligence"].includes(name) ? name : name;
  for (const a of links) {
    const p = a.dataset.panel || "";
    a.classList.toggle("active", p === stepNavName);
  }
  const stepOrder = ["chat", "profile", "plan", "report", "history", "intelligence"];
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
  if (intel) intel.classList.toggle("hidden", name !== "intelligence");
  if (adminIntel) adminIntel.classList.toggle("hidden", name !== "admin-intelligence");

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
  if (name === "intelligence") {
    loadIntelligencePage(schoolSlug);
  }
  if (name === "admin-intelligence") {
    loadAdminIntelligencePage();
  }
}


export async function handleRoute() {
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
    await refreshReviewerNav();
  } catch (e) {
    logout();
    const err = el("login-err");
    if (err) {
      err.textContent = String(e.message || e);
      err.classList.remove("hidden");
    }
    return;
  }

  showPanel(r.panel, r.reportId, r.schoolSlug || null);
}