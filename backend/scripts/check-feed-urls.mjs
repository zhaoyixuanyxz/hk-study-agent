#!/usr/bin/env node
/**
 * GET check all crawl feed URLs. Detects 404, soft-404 pages, timeouts.
 * Usage: node scripts/check-feed-urls.mjs [--json]
 */
import { buildCrawlFeeds } from "../src/intelligence/crawl-registry.js";
import { runFeedPreflight, savePreflightLast } from "../src/intelligence/url-preflight.js";

const jsonOnly = process.argv.includes("--json");

const summary = await runFeedPreflight({ feeds: buildCrawlFeeds(), concurrency: 4 });
savePreflightLast(summary);

if (!jsonOnly) {
  for (const r of summary.results) {
    const tag = r.ok ? "OK" : "FAIL";
    const extra = r.soft404 ? " soft-404" : r.error ? ` ${r.error}` : "";
    console.log(
      `${tag}\t${r.status || "-"}\t${r.ms}ms\t${r.feedId}${extra}\t${r.finalUrl !== r.url ? r.finalUrl : ""}`
    );
  }
  console.log("\n--- Summary ---");
  console.log(`Total: ${summary.total}, Failed: ${summary.failedCount}, Slow (>10s): ${summary.slowCount}`);
  if (summary.failures.length) {
    console.log("\nFailed feeds:");
    for (const b of summary.failures) {
      console.log(
        `  ${b.feedId}: ${b.url} (${b.status || b.error}${b.soft404 ? ", soft-404" : ""})`
      );
    }
  }
}

if (jsonOnly) {
  console.log(JSON.stringify(summary, null, 2));
}

process.exit(summary.failedCount ? 1 : 0);
