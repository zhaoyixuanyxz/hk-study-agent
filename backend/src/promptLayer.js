import { existsSync, readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * @param {string} file 相对 prompts/{version}/ 的文件名，如 plan.txt
 * @param {string} [version]
 * @returns {string}
 */
export function loadPromptText(file, version = "v1") {
  const p = join(__dirname, "..", "prompts", version, file);
  if (!existsSync(p)) return "";
  return readFileSync(p, "utf8").trim();
}

export function composeSystemPrompt(version = "v1") {
  const base = join(__dirname, "..", "prompts", version);
  const layers = [
    ["[SYSTEM]", "system.txt"],
    ["[STYLE]", "style.txt"],
    ["[ADVISOR]", "advisor.txt"],
    ["[COLLECTION]", "collection.txt"],
    ["[CONFIRMATION]", "confirmation.txt"],
    ["[READINESS]", "readiness.txt"],
  ];
  const parts = [];
  for (const [tag, file] of layers) {
    const p = join(base, file);
    if (!existsSync(p)) continue;
    const text = readFileSync(p, "utf8").trim();
    if (text) parts.push(`${tag}\n${text}`);
  }
  parts.push(
    "[OUTPUT_FORMAT]\n" +
      "你必须只输出一个 JSON 对象，不要 markdown 代码围栏，不要其它文字。" +
      "禁止在 reply 字符串内再输出 JSON、\"reply\" 键名或 ``` 代码围栏；reply 仅含给用户看的自然语言。" +
      "字段：reply（对用户的主回复，自然语言，简练）," +
      "gaps（字符串数组，尚缺的关键信息，可为空数组）," +
      "gap_items（数组，可选；每项 { gap: 字符串, impact: 字符串 }，gap 与 gaps 对应或更具体）," +
      "suggested_followups（建议追问要点，最多 2 条，可为空数组）," +
      "readiness_for_profile（布尔：是否已具备生成后续留学画像/方案的最小信息）," +
      "citations（数组：引用外部/政策事实时必填；每项含 itemId、url 必填；可选 sourceTitle、publishedAt、quoteOrSummary；无来源则宁可不写事实也不要编造链接）。"
  );
  return parts.join("\n\n");
}
