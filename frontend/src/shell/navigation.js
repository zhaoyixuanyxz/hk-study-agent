import { api, LS_TOKEN, clearStoredSession, LS_PREFERRED_LOCALE } from "../api/client.js";
import { el } from "../lib/dom.js";
import { resetComposerReplaceDraftQuiet } from "../pages/chat.js";
import { applyUiLocale, normalizeUiLocale, t } from "../i18n/index.js";

export function parseHash() {
  const raw = (location.hash || "").replace(/^#/, "");
  const path = raw.startsWith("/") ? raw : `/${raw || "login"}`;
  const parts = path.split("/").filter(Boolean);
  const p0 = parts[0] || "login";
  if (p0 === "login") return { kind: "auth", auth: "login" };
  if (p0 === "register") return { kind: "auth", auth: "register" };
  if (p0 === "report" && parts[1])
    return { kind: "app", panel: "report", reportId: parts[1] };
  if (p0 === "admin" && parts[1] === "intelligence") {
    return { kind: "app", panel: "admin-intelligence", reportId: null, schoolSlug: null };
  }
  if (p0 === "intelligence") {
    const schoolSlug = parts[1] === "school" && parts[2] ? decodeURIComponent(parts[2]) : null;
    return { kind: "app", panel: "intelligence", reportId: null, schoolSlug };
  }
  const panels = ["chat", "profile", "plan", "report", "history", "intelligence", "admin-intelligence"];
  if (panels.includes(p0)) return { kind: "app", panel: p0, reportId: null, schoolSlug: null };
  return { kind: "auth", auth: "login" };
}

export function showAuth(which) {
  el("view-auth").classList.remove("hidden");
  el("view-app").classList.add("hidden");
  el("form-login").classList.toggle("hidden", which !== "login");
  el("form-register").classList.toggle("hidden", which !== "register");
  applyUiLocale(normalizeUiLocale(localStorage.getItem(LS_PREFERRED_LOCALE)));
  const title = el("auth-card-title");
  const sub = el("auth-card-sub");
  if (which === "register") {
    if (title) {
      title.setAttribute("data-i18n", "auth.register_title");
      title.textContent = t("auth.register_title");
    }
    if (sub) {
      sub.setAttribute("data-i18n", "auth.register_sub");
      sub.textContent = t("auth.register_sub");
    }
  } else {
    if (title) {
      title.setAttribute("data-i18n", "auth.login_title");
      title.textContent = t("auth.login_title");
    }
    if (sub) {
      sub.setAttribute("data-i18n", "auth.login_sub");
      sub.textContent = t("auth.login_sub");
    }
  }
}

export function showAppShell() {
  el("view-auth").classList.add("hidden");
  el("view-app").classList.remove("hidden");
  applyUiLocale(normalizeUiLocale(localStorage.getItem(LS_PREFERRED_LOCALE)));
}

/**
 * @param {string} panel
 * @param {string | null} [routeReportId]
 */
export function navigateTo(panel, routeReportId = null, schoolSlug = null) {
  if (panel === "report" && routeReportId) {
    location.hash = `#/report/${encodeURIComponent(routeReportId)}`;
  } else if (panel === "intelligence" && schoolSlug) {
    location.hash = `#/intelligence/school/${encodeURIComponent(schoolSlug)}`;
  } else {
    location.hash = `#/${panel}`;
  }
}

export function logout() {
  resetComposerReplaceDraftQuiet();
  clearStoredSession();
  location.hash = "#/login";
}