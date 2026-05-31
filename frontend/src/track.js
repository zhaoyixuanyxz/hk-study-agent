import { resolveApiUrl } from "./api/base.js";

const LS_TOKEN = "study_agent_token";

/**
 * 埋点上报（需已登录；失败静默）
 * @param {string} name
 * @param {Record<string, unknown>} [props]
 */
export async function track(name, props = {}) {
  try {
    const token = localStorage.getItem(LS_TOKEN);
    if (!token) return;
    await fetch(resolveApiUrl("/api/v1/analytics/events"), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        events: [{ name, props: { ...props, client_ts: new Date().toISOString() } }],
      }),
    });
  } catch {
    /* 静默 */
  }
}
