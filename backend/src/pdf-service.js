/**
 * HTML 片段 → PDF（V1-P3）。依赖 Puppeteer / Chromium。
 */

export function isPdfDisabled() {
  const v = String(process.env.PDF_DISABLED || "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/**
 * @param {string} articleHtml 通常是 &lt;article class="study-report"&gt;...&lt;/article&gt;
 * @returns {Promise<Buffer>}
 */
export async function renderHtmlToPdf(articleHtml) {
  if (isPdfDisabled()) {
    const e = new Error("PDF_DISABLED");
    e.code = "PDF_DISABLED";
    throw e;
  }

  let puppeteer;
  try {
    puppeteer = (await import("puppeteer")).default;
  } catch {
    const e = new Error("PUPPETEER_UNAVAILABLE");
    e.code = "PUPPETEER_UNAVAILABLE";
    throw e;
  }

  const inner = String(articleHtml || "").trim() || "<p>（空报告）</p>";
  const fullHtml = `<!DOCTYPE html>
<html lang="zh-Hans">
<head>
<meta charset="utf-8"/>
<style>
  body { font-family: system-ui, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif; font-size: 11pt; line-height: 1.45; margin: 12mm; color: #111; }
  .report-chapter { margin-bottom: 1rem; page-break-inside: avoid; }
  .report-chapter h2 { font-size: 13pt; margin: 0 0 0.5rem; }
  .report-subh { font-size: 10pt; margin: 0.6rem 0 0.25rem; }
  .report-list { margin: 0.3rem 0 0.8rem 1.2rem; }
  .report-cite-list { margin: 0.3rem 0 0.8rem 1.2rem; }
  a { color: #1565c0; word-break: break-all; }
</style>
</head>
<body>${inner}</body>
</html>`;

  const launchOpts = {
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  };
  const exe = String(process.env.PUPPETEER_EXECUTABLE_PATH || "").trim();
  if (exe) launchOpts.executablePath = exe;

  let browser;
  try {
    browser = await puppeteer.launch(launchOpts);
  } catch (err) {
    const e = new Error("PUPPETEER_LAUNCH_FAILED");
    e.code = "PUPPETEER_LAUNCH_FAILED";
    e.cause = err;
    throw e;
  }

  try {
    const page = await browser.newPage();
    await page.setContent(fullHtml, { waitUntil: "domcontentloaded", timeout: 60000 });
    const buf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "12mm", bottom: "12mm", left: "12mm", right: "12mm" },
    });
    return Buffer.from(buf);
  } finally {
    await browser.close();
  }
}
