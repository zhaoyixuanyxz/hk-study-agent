#!/usr/bin/env node
/**
 * 每日情报采集：INTELLIGENCE_FETCH=1 时真爬官网 + 结构化字段 + 自动上线（官方源）。
 * 用法：cd backend && npm run intelligence:daily
 */
import { createStore } from "../src/store.js";
import { runIngestion, syncFeedUrlsToStore } from "../src/intelligence/ingestion-service.js";

const store = createStore(process.env.DATA_FILE || undefined);

syncFeedUrlsToStore(store);
const result = await runIngestion(store, {});

console.error(
  JSON.stringify({
    ts: new Date().toISOString(),
    scope: "intelligence_daily",
    items_ingested: result.itemsIngested,
    items_updated: result.itemsUpdated,
    fetch_enabled: result.fetchEnabled,
    fetch_count: result.fetchCount,
    mode: result.mode,
    run_id: result.run?.id,
    errors: result.errors?.slice(0, 5),
  })
);

if (!result.itemsIngested && !result.itemsUpdated && result.fetchEnabled) {
  console.error("intelligence-daily: warning — crawl produced no ingest/update");
}

process.exit(result.run?.status === "failed" ? 1 : 0);
