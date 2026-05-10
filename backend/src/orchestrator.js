export function looksLikeConfirmation(userText) {
  const t = String(userText || "").trim().toLowerCase();
  if (/^(确认|好的|好|可以|没问题|同意|yes|ok)\b/.test(t)) return true;
  if (t.length <= 20 && ["确认", "好的", "好", "可以", "yes", "ok", "y"].includes(t)) return true;
  return false;
}

export function nextOrchestrationState(prev, gaps, userTurns, userText, readinessFromModel) {
  if (prev === "profile_ready") return "profile_ready";
  if (gaps && gaps.length) return "gap_probing";
  if (prev === "init") return "explore";
  if (prev === "explore" || prev === "gap_probing") {
    if (userTurns >= 3) return "fact_confirmation";
    return "explore";
  }
  if (prev === "fact_confirmation") {
    if (readinessFromModel && looksLikeConfirmation(userText)) return "profile_ready";
    if (readinessFromModel && userTurns >= 5) return "profile_ready";
    return "fact_confirmation";
  }
  return "explore";
}
