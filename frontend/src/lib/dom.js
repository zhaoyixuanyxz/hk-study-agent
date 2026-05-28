export function el(id) {
  return document.getElementById(id);
}

export function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function prettyTime(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString("zh-CN", { hour12: false });
}

export function shortId(value) {
  const s = String(value || "");
  return s.length > 8 ? s.slice(0, 8) + "…" : s || "—";
}

export function setStatus(text, isErr) {
  const s = el("status");
  if (!s) return;
  s.textContent = text;
  s.className = isErr ? "status err" : "status";
}
