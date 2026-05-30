import { escapeHtml } from "./lib/dom.js";

/** 去掉 ``` / ```json 围栏包裹整段的情形。 */
export function stripMarkdownCodeFence(s) {
  const t = s.trim();
  if (!t.startsWith("```")) return t;
  const lines = t.split("\n");
  if (lines.length < 2) return t;
  if (!/^```\w*$/.test(lines[0].trim())) return t;
  if (lines[lines.length - 1].trim() !== "```") return t;
  return lines.slice(1, -1).join("\n").trim();
}

/** 去掉末尾 ``` / ```json 块（兼容历史会话里混入的结构化重复）。 */
export function stripTrailingMarkdownJsonBlocks(s) {
  let t = String(s ?? "");
  const re = /\r?\n*```(?:json)?\s*\r?\n[\s\S]*?```\s*$/i;
  for (let i = 0; i < 24; i++) {
    const next = t.replace(re, "").trimEnd();
    if (next === t) break;
    t = next;
  }
  return t;
}

/** 将未解析 JSON 时常见的字面量转义还原为换行等。 */
export function decodeLiteralEscapes(s) {
  return String(s).replace(/\\n/g, "\n").replace(/\\r/g, "\r").replace(/\\t/g, "\t");
}

function decodeReplyField(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return "";
  const reply = obj.reply ?? obj.message ?? obj.content ?? obj.text;
  if (typeof reply !== "string") return "";
  let decoded = decodeLiteralEscapes(reply).trim();
  decoded = stripTrailingMarkdownJsonBlocks(decoded).trim();
  return decoded;
}

/**
 * 助手气泡展示用纯文本：去围栏、去掉尾部重复 JSON 块、解析顶层 JSON 的 reply 字段等。
 * @param {string} raw
 */
export function extractAssistantDisplayText(raw) {
  let s = String(raw ?? "").trim();
  if (!s) return "";

  // 整段仅此一个围栏：` ```json ... ``` `
  let unwrapped = stripMarkdownCodeFence(s);
  if (unwrapped !== s && unwrapped.startsWith("{")) {
    try {
      const o = JSON.parse(unwrapped);
      const r = decodeReplyField(o);
      if (r) return r;
    } catch {
      /* fall through */
    }
  }

  // 正文后再贴 ```json（优先读围栏内 reply，避免只去掉围栏后只剩重复前言）
  const fenceAtEnd = /\r?\n```(?:json)?\s*\r?\n([\s\S]*?)```\s*$/i;
  const fm = fenceAtEnd.exec(s);
  if (fm) {
    const blob = fm[1].trim();
    if (blob.startsWith("{")) {
      try {
        const o = JSON.parse(blob);
        const r = decodeReplyField(o);
        if (r) return r;
      } catch {
        /* fall through */
      }
    }
  }

  s = stripTrailingMarkdownJsonBlocks(s).trim();
  const cut = s.search(/\r?\n```(?:json)?\s*$/i);
  if (cut > 0) s = s.slice(0, cut).trimEnd();
  s = stripTrailingMarkdownJsonBlocks(s).trim();
  if (!s) return "";

  unwrapped = stripMarkdownCodeFence(s);
  s = unwrapped;

  if (s.startsWith("{")) {
    try {
      const o = JSON.parse(s);
      const r = decodeReplyField(o);
      if (r) return r;
    } catch {
      /* 按纯文本 */
    }
  }

  return decodeLiteralEscapes(stripTrailingMarkdownJsonBlocks(s).trim());
}

/**
 * 助手气泡内极简 Markdown：**加粗**、换行；其余已 HTML 转义。
 * @param {string} plain
 */
export function formatAssistantHtml(plain) {
  let h = escapeHtml(plain);
  h = h.replace(/\n/g, "<br>");
  h = h.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  return h;
}
