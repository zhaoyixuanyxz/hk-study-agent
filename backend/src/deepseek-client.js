/**
 * DeepSeek V4 调用约定：统一模型默认值，并按场景组装 thinking 参数。
 * 官方：V4 默认开启思考；对话场景必须显式 disabled。
 * @see https://api-docs.deepseek.com/guides/thinking_mode
 */

export const DEFAULT_DEEPSEEK_MODEL = "deepseek-v4-pro";
export const DEFAULT_DEEPSEEK_BASE_URL = "https://api.deepseek.com";

/**
 * @param {string | undefined | null} model
 * @returns {string}
 */
export function resolveDeepseekModel(model) {
  const m = String(model || process.env.DEEPSEEK_MODEL || "").trim();
  return m || DEFAULT_DEEPSEEK_MODEL;
}

/**
 * @param {string | undefined | null} baseUrl
 * @returns {string}
 */
export function resolveDeepseekBaseUrl(baseUrl) {
  const u = String(baseUrl || process.env.DEEPSEEK_BASE_URL || "").trim();
  return u || DEFAULT_DEEPSEEK_BASE_URL;
}

/**
 * 组装 chat.completions.create 的 body 字段（含 thinking）。
 * Node OpenAI SDK 会把未知顶层字段原样放入请求 body。
 *
 * @param {{
 *   model?: string,
 *   messages: object[],
 *   thinking?: boolean,
 *   reasoningEffort?: "high" | "max",
 *   temperature?: number,
 *   max_tokens?: number,
 * }} opts
 * @returns {Record<string, unknown>}
 */
export function buildDeepseekChatBody(opts) {
  const thinkingOn = opts.thinking === true;
  /** @type {Record<string, unknown>} */
  const body = {
    model: resolveDeepseekModel(opts.model),
    messages: opts.messages,
    thinking: { type: thinkingOn ? "enabled" : "disabled" },
  };
  if (thinkingOn) {
    body.reasoning_effort = opts.reasoningEffort || "high";
  }
  if (opts.temperature != null) body.temperature = opts.temperature;
  if (opts.max_tokens != null) body.max_tokens = opts.max_tokens;
  return body;
}
