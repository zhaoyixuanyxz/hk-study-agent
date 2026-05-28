/**
 * Heuristic structured fields from page text + table rows.
 * @param {string} infoType
 * @param {string} text
 * @param {string[]} tableRows
 * @param {{ schoolId?: string, url?: string }} meta
 */
export function extractStructuredFields(infoType, text, tableRows = [], meta = {}) {
  const t = String(text || "");
  const dates = extractDates(t);
  const amounts = extractHkdAmounts(t);
  const base = {
    school_id: meta.schoolId || null,
    source_url: meta.url || null,
    extracted_at: new Date().toISOString(),
    table_row_count: tableRows.length,
  };

  switch (infoType) {
    case "deadline":
      return {
        ...base,
        deadlines: dates.slice(0, 20).map((d, i) => ({
          label: `deadline_${i + 1}`,
          date: d,
        })),
        highlights: extractBulletLines(t, /deadline|截止|application period|closing/i).slice(0, 10),
      };
    case "tuition":
      return {
        ...base,
        fees: amounts.slice(0, 15).map((a, i) => ({
          label: tableRows[i] || `fee_${i + 1}`,
          amount_hkd: a.value,
          amount_text: a.raw,
        })),
        fee_table_rows: tableRows.slice(0, 20),
      };
    case "admission":
      return {
        ...base,
        requirements: extractBulletLines(t, /requirement|入学|GPA|IELTS|TOEFL|学位|学历/i).slice(0, 15),
        language_scores: extractLanguageHints(t),
      };
    case "program":
      return {
        ...base,
        programs: extractBulletLines(t, /programme|program|硕士|master|MSc|MA|MBA/i).slice(0, 20),
      };
    case "scholarship":
      return {
        ...base,
        schemes: extractBulletLines(t, /scholarship|奖学金|fellowship|bursary/i).slice(0, 15),
        amounts,
      };
    case "visa":
      return {
        ...base,
        visa_notes: extractBulletLines(t, /visa|immigration|student visa|逗留|签证/i).slice(0, 12),
      };
    case "policy":
    default:
      return {
        ...base,
        policy_points: extractBulletLines(t, /policy|policies|规定|政策|guideline/i).slice(0, 15),
        effective_dates: dates.slice(0, 5),
      };
  }
}

function extractDates(text) {
  const found = new Set();
  const patterns = [
    /\b(20\d{2})[-/](0?[1-9]|1[0-2])[-/](0?[1-9]|[12]\d|3[01])\b/g,
    /\b(0?[1-9]|[12]\d|3[01])\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(20\d{2})\b/gi,
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(0?[1-9]|[12]\d|3[01]),?\s+(20\d{2})\b/gi,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(text))) {
      found.add(m[0].replace(/\s+/g, " ").trim());
      if (found.size >= 25) break;
    }
  }
  return [...found];
}

function extractHkdAmounts(text) {
  const out = [];
  const re =
    /(?:HK\$|HKD|港币|港元)\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]+)?|[0-9]+(?:\.[0-9]+)?)\s*(?:万)?/gi;
  let m;
  while ((m = re.exec(text))) {
    const raw = m[0];
    let num = Number(String(m[1]).replace(/,/g, ""));
    if (/万/.test(raw) && num < 1000) num *= 10000;
    if (Number.isFinite(num)) out.push({ raw, value: num });
    if (out.length >= 20) break;
  }
  return out;
}

function extractLanguageHints(text) {
  const hints = [];
  const ielts = text.match(/IELTS[^.\n]{0,80}/gi);
  const toefl = text.match(/TOEFL[^.\n]{0,80}/gi);
  if (ielts) hints.push(...ielts.slice(0, 3));
  if (toefl) hints.push(...toefl.slice(0, 3));
  return hints;
}

function extractBulletLines(text, topicRe) {
  const lines = text
    .split(/\n|\.|；|。/)
    .map((l) => l.trim())
    .filter((l) => l.length >= 12 && l.length <= 280);
  const matched = lines.filter((l) => topicRe.test(l));
  return (matched.length ? matched : lines).slice(0, 25);
}

/**
 * @param {string} text
 * @param {object} structured
 */
export function buildChineseSummary(infoType, text, structured) {
  const school = structured?.school_id ? `【${structured.school_id}】` : "";
  const snippet = text.slice(0, 320);
  if (infoType === "tuition" && structured?.fees?.length) {
    const top = structured.fees
      .slice(0, 3)
      .map((f) => f.amount_text || f.amount_hkd)
      .join("；");
    return `${school}学费要点（官网采集）：${top}。${snippet.slice(0, 120)}`;
  }
  if (infoType === "deadline" && structured?.deadlines?.length) {
    const ds = structured.deadlines
      .slice(0, 3)
      .map((d) => d.date)
      .join("、");
    return `${school}申请截止（官网采集）：${ds}。${snippet.slice(0, 120)}`;
  }
  return `${school}${infoType} 信息（官网采集，可溯源）：${snippet}`;
}

/**
 * Minimum quality for auto-publish.
 */
export function passesExtractionQuality(text, structured) {
  if (String(text || "").length < 80) return false;
  if (!structured || typeof structured !== "object") return false;
  const keys = Object.keys(structured).filter((k) => !["school_id", "source_url", "extracted_at", "table_row_count"].includes(k));
  if (!keys.length) return false;
  const payload = keys.some((k) => {
    const v = structured[k];
    return Array.isArray(v) ? v.length > 0 : Boolean(v);
  });
  return payload;
}
