/**
 * 从 planInputView / snapshot 提取检索加权信号。
 */

const SCHOOL_NAME_TO_ID = [
  [/香港大学|港大|\bhku\b/i, "hku"],
  [/香港中文大学|港中文|\bcuhk\b/i, "cuhk"],
  [/香港科技大学|港科大|\bhkust\b/i, "hkust"],
  [/香港理工大学|理大|\bpolyu\b/i, "polyu"],
  [/香港城市大学|城大|\bcityu\b/i, "cityu"],
  [/香港浸会大学|浸大|\bhkbu\b/i, "hkbu"],
  [/岭南大学|岭南|\blingnan\b/i, "lingnan"],
  [/香港教育大学|教大|\beduhk\b/i, "eduhk"],
];

/**
 * @param {string} text
 * @returns {string[]}
 */
export function inferSchoolIdsFromText(text) {
  const t = String(text || "");
  const ids = new Set();
  for (const [re, id] of SCHOOL_NAME_TO_ID) {
    if (re.test(t)) ids.add(id);
  }
  return [...ids];
}

/**
 * @param {{ planInputView?: object, snapshot?: object, userMessage?: string }} opts
 */
export function extractProfileSearchHints(opts = {}) {
  const hints = {
    targetSchools: [],
    field: "",
    intakeTerm: "",
    languageScores: [],
    programTags: [],
  };

  const piv = opts.planInputView && typeof opts.planInputView === "object" ? opts.planInputView : null;
  if (piv) {
    const g = piv.goals?.value && typeof piv.goals.value === "object" ? piv.goals.value : {};
    const a = piv.academic?.value && typeof piv.academic.value === "object" ? piv.academic.value : {};
    const t = piv.timeline?.value && typeof piv.timeline.value === "object" ? piv.timeline.value : {};
    hints.field = String(g.field || g.target_field || "").trim();
    hints.intakeTerm = String(t.intake_or_season || t.intake || "").trim();
    const lang = String(a.language || a.language_score || "").trim();
    if (lang) hints.languageScores.push(lang);
    if (Array.isArray(g.target_schools)) {
      for (const s of g.target_schools) hints.targetSchools.push(String(s).trim());
    }
    if (g.target_school) hints.targetSchools.push(String(g.target_school).trim());
    for (const sid of inferSchoolIdsFromText(JSON.stringify(g))) {
      if (!hints.targetSchools.includes(sid)) hints.targetSchools.push(sid);
    }
    if (hints.field) hints.programTags.push(hints.field);
  }

  if (opts.snapshot && typeof opts.snapshot === "object") {
    for (const sid of inferSchoolIdsFromText(JSON.stringify(opts.snapshot).slice(0, 4000))) {
      if (!hints.targetSchools.includes(sid)) hints.targetSchools.push(sid);
    }
  }
  if (opts.userMessage) {
    for (const sid of inferSchoolIdsFromText(opts.userMessage)) {
      if (!hints.targetSchools.includes(sid)) hints.targetSchools.push(sid);
    }
  }

  hints.targetSchools = hints.targetSchools
    .map((x) => x.toLowerCase())
    .filter((x, i, arr) => x && arr.indexOf(x) === i)
    .slice(0, 8);

  return hints;
}
