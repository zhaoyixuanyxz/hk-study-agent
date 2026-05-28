/**
 * 审核员身份：环境变量 INTELLIGENCE_REVIEWER_EMAILS + db.intelligenceReviewerEmails
 */

/**
 * @param {ReturnType<import("../store.js").createStore>} store
 */
export function listReviewerEmails(store) {
  const fromEnv = String(process.env.INTELLIGENCE_REVIEWER_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const fromDb = store.listIntelligenceReviewerEmails().map((e) => e.toLowerCase());
  return [...new Set([...fromEnv, ...fromDb])];
}

/**
 * @param {ReturnType<import("../store.js").createStore>} store
 * @param {{ email?: string }} user
 */
export function userCanReview(store, user) {
  const email = String(user?.email || "").trim().toLowerCase();
  if (!email) return false;
  return listReviewerEmails(store).includes(email);
}

/**
 * @param {ReturnType<import("../store.js").createStore>} store
 * @param {{ email?: string }} user
 */
export function assertReviewer(store, user) {
  if (!userCanReview(store, user)) {
    const err = new Error("forbidden");
    err.statusCode = 403;
    err.payload = { code: "forbidden", message: "需要情报审核员权限" };
    throw err;
  }
}
