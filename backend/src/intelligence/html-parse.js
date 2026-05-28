/**
 * Lightweight HTML → text / tables (no cheerio dependency).
 */

export function stripHtmlToText(html) {
  let s = String(html || "");
  s = s.replace(/<script[\s\S]*?<\/script>/gi, " ");
  s = s.replace(/<style[\s\S]*?<\/style>/gi, " ");
  s = s.replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");
  s = s.replace(/<br\s*\/?>/gi, "\n");
  s = s.replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n");
  s = s.replace(/<[^>]+>/g, " ");
  s = s.replace(/&nbsp;/gi, " ");
  s = s.replace(/&amp;/gi, "&");
  s = s.replace(/&lt;/gi, "<");
  s = s.replace(/&gt;/gi, ">");
  s = s.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
  return s.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").replace(/\s+/g, " ").trim();
}

export function extractHtmlTitle(html) {
  const m = String(html || "").match(/<title[^>]*>([^<]+)<\/title>/i);
  return m ? m[1].replace(/\s+/g, " ").trim().slice(0, 300) : "";
}

/**
 * @param {string} html
 * @returns {string[]}
 */
export function extractTableRows(html) {
  const rows = [];
  const tableRe = /<table[\s\S]*?<\/table>/gi;
  let tm;
  while ((tm = tableRe.exec(html))) {
    const trRe = /<tr[\s\S]*?<\/tr>/gi;
    let trm;
    while ((trm = trRe.exec(tm[0]))) {
      const cells = [];
      const cellRe = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
      let cm;
      while ((cm = cellRe.exec(trm[0]))) {
        cells.push(stripHtmlToText(cm[1]).slice(0, 200));
      }
      if (cells.length) rows.push(cells.join(" | "));
    }
  }
  return rows.slice(0, 40);
}

/**
 * Prefer main content block; fallback full body text.
 * @param {string} html
 */
export function extractMainText(html) {
  const blocks = [
    /<main[\s\S]*?<\/main>/i,
    /<article[\s\S]*?<\/article>/i,
    /<div[^>]+id=["']content["'][\s\S]*?<\/div>/i,
    /<div[^>]+class=["'][^"']*content[^"']*["'][\s\S]*?<\/div>/i,
  ];
  for (const re of blocks) {
    const m = String(html || "").match(re);
    if (m && m[0].length > 200) return stripHtmlToText(m[0]).slice(0, 12000);
  }
  return stripHtmlToText(html).slice(0, 12000);
}
