/**
 * 极简 robots：仅当根路径 Disallow: / 时拒绝。
 * @param {string} pageUrl
 */
export async function respectRobotsForUrl(pageUrl) {
  if (process.env.INTELLIGENCE_RESPECT_ROBOTS === "0") return true;
  try {
    const origin = new URL(pageUrl).origin;
    const res = await fetch(`${origin}/robots.txt`, {
      signal: AbortSignal.timeout(4000),
      headers: { "User-Agent": "StudyAgentIntel/1.0" },
    });
    if (!res.ok) return true;
    const text = await res.text();
    if (/User-agent:\s*\*/i.test(text) && /Disallow:\s*\/\s*$/im.test(text)) return false;
  } catch {
    return true;
  }
  return true;
}
