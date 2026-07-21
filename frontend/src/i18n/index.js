import { catalogs } from "./catalogs.js";
import { LS_PREFERRED_LOCALE } from "../api/client.js";

/** @type {"zh"|"en"} */
let current = "zh";

/** @param {unknown} value @returns {"zh"|"en"} */
export function normalizeUiLocale(value) {
  const v = String(value || "").trim().toLowerCase();
  if (v === "en" || v === "en-us" || v === "en_gb" || v === "en-gb") return "en";
  return "zh";
}

export function getUiLocale() {
  return current;
}

/** @param {"zh"|"en"|string} locale */
export function setUiLocale(locale) {
  current = normalizeUiLocale(locale);
  return current;
}

/**
 * @param {string} key
 * @param {Record<string, string|number>} [vars]
 */
export function t(key, vars) {
  const table = catalogs[current] || catalogs.zh;
  let s = table[key] ?? catalogs.zh[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      s = s.replaceAll(`{${k}}`, String(v));
    }
  }
  return s;
}

/**
 * Resolve UI locale from thread or preferred storage.
 * @param {{ locale?: string } | null | undefined} thread
 */
export function resolveUiLocaleFromThread(thread) {
  if (thread && (thread.locale === "en" || thread.locale === "zh")) {
    return normalizeUiLocale(thread.locale);
  }
  if (typeof localStorage !== "undefined") {
    try {
      return normalizeUiLocale(localStorage.getItem(LS_PREFERRED_LOCALE));
    } catch {
      return "zh";
    }
  }
  return "zh";
}

/** @param {"zh"|"en"|string} [locale] */
export function applyUiLocale(locale) {
  const loc = setUiLocale(locale ?? current);
  if (typeof document === "undefined") return loc;

  document.documentElement.lang = loc === "en" ? "en" : "zh-CN";
  const title = t("doc.title");
  if (title) document.title = title;

  document.querySelectorAll("[data-i18n]").forEach((node) => {
    const key = node.getAttribute("data-i18n");
    if (!key) return;
    if (node.closest("#panel-admin-intelligence")) return;
    const textHost = node.querySelector("[data-i18n-text]");
    if (textHost) {
      textHost.textContent = t(key);
    } else {
      node.textContent = t(key);
    }
  });

  document.querySelectorAll("[data-i18n-placeholder]").forEach((node) => {
    const key = node.getAttribute("data-i18n-placeholder");
    if (key && "placeholder" in node) node.placeholder = t(key);
  });

  document.querySelectorAll("[data-i18n-aria]").forEach((node) => {
    const key = node.getAttribute("data-i18n-aria");
    if (key) node.setAttribute("aria-label", t(key));
  });

  document.querySelectorAll("[data-i18n-strong]").forEach((node) => {
    if (node.closest("#panel-admin-intelligence")) return;
    const key = node.getAttribute("data-i18n-strong");
    if (key) node.textContent = t(key);
  });

  document.querySelectorAll("[data-i18n-small]").forEach((node) => {
    if (node.closest("#panel-admin-intelligence")) return;
    const key = node.getAttribute("data-i18n-small");
    if (key) node.textContent = t(key);
  });

  return loc;
}
