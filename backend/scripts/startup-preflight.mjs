#!/usr/bin/env node
/**
 * Startup preflight: deps check, feed sync, optional intel crawl, state file.
 * Usage:
 *   node scripts/startup-preflight.mjs [--quick] [--crawl-only] [--force-crawl] [--check-urls]
 *   --quick       feed sync + repair only (for bat before servers)
 *   --crawl-only  intelligence daily crawl only (background)
 *   --check-urls  probe all crawl feeds before crawl (writes .intel-preflight-last.json)
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import dotenv from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
const backendRoot = join(__dirname, "..");
const repoRoot = join(backendRoot, "..");

dotenv.config({ path: join(repoRoot, ".env") });

const forceCrawl = process.argv.includes("--force-crawl");
const quickOnly = process.argv.includes("--quick");
const crawlOnly = process.argv.includes("--crawl-only");
const checkUrlsOnly = process.argv.includes("--check-urls");

function log(msg) {
  console.error(`[preflight] ${msg}`);
}

function fileMtime(p) {
  try {
    return statSync(p).mtimeMs;
  } catch {
    return 0;
  }
}

function loadState() {
  const p = join(backendRoot, "data", ".startup-state.json");
  if (!existsSync(p)) return {};
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return {};
  }
}

function saveState(patch) {
  const dataDir = join(backendRoot, "data");
  mkdirSync(dataDir, { recursive: true });
  const p = join(dataDir, ".startup-state.json");
  const prev = loadState();
  writeFileSync(p, JSON.stringify({ ...prev, ...patch, updatedAt: new Date().toISOString() }, null, 2));
}

function portOpen(port) {
  try {
    execSync(
      `powershell -NoProfile -Command "exit ((Test-NetConnection -ComputerName 127.0.0.1 -Port ${port} -WarningAction SilentlyContinue).TcpTestSucceeded ? 0 : 1)"`,
      { stdio: "ignore" }
    );
    return true;
  } catch {
    return false;
  }
}

function needsFeedSync() {
  const feedPath = join(backendRoot, "data", "intelligence", "feed-urls.json");
  const registryPath = join(backendRoot, "src", "intelligence", "crawl-registry.js");
  if (!existsSync(feedPath)) return true;
  if (!existsSync(registryPath)) return false;
  return fileMtime(registryPath) > fileMtime(feedPath);
}

function shouldRunCrawl(state) {
  if (forceCrawl) return true;
  const off = process.env.STARTUP_INTEL_CRAWL === "0" || process.env.STARTUP_INTEL_CRAWL === "false";
  if (off) return false;
  if (process.env.STARTUP_INTEL_CRAWL_FORCE === "1" || process.env.STARTUP_INTEL_CRAWL_FORCE === "true") {
    return true;
  }
  const maxAgeH = Number(process.env.STARTUP_INTEL_CRAWL_MAX_AGE_HOURS || 12);
  const last = state.lastCrawlAt ? Date.parse(state.lastCrawlAt) : 0;
  if (!last) return true;
  return Date.now() - last > maxAgeH * 3600 * 1000;
}

async function runDailyCrawl(state) {
  const fetchOn =
    process.env.INTELLIGENCE_FETCH === "1" || process.env.INTELLIGENCE_FETCH === "true";
  if (!fetchOn) {
    log("INTELLIGENCE_FETCH is off — skip daily crawl (set INTELLIGENCE_FETCH=1 in .env).");
    return;
  }
  if (!shouldRunCrawl(state)) {
    const maxAgeH = Number(process.env.STARTUP_INTEL_CRAWL_MAX_AGE_HOURS || 12);
    log(`Skip crawl (last run within ${maxAgeH}h). Use --force-crawl or STARTUP_INTEL_CRAWL_FORCE=1 to force.`);
    return;
  }
  log("Running intelligence:daily (real crawl may take several minutes)...");
  try {
    execSync("node scripts/intelligence-daily.mjs", { cwd: backendRoot, stdio: "inherit", env: process.env });
    saveState({ lastCrawlAt: new Date().toISOString() });
    log("Daily crawl finished.");
  } catch (e) {
    log(`Daily crawl exited with error: ${e?.message || e}`);
    log("Retry later: cd backend && npm run intelligence:daily");
  }
}

async function main() {
  log("=== Startup preflight ===");

  mkdirSync(join(backendRoot, "data"), { recursive: true });
  const state = loadState();

  if (crawlOnly) {
    await runDailyCrawl(state);
    log("=== Preflight done (crawl-only) ===");
    return;
  }

  const dbPath = process.env.DATA_FILE || join(backendRoot, "data", "db.json");
  if (!existsSync(dbPath)) {
    log(`db.json not found at ${dbPath} — API will create on first run.`);
  } else {
    log(`Data OK: ${dbPath}`);
  }

  for (const [name, port] of [
    ["API", 8010],
    ["Web", 5180],
    ["Postgres", 5433],
  ]) {
    if (portOpen(port)) log(`WARN: port ${port} (${name}) already in use — stop with 关闭项.bat or close old windows.`);
    else log(`Port ${port} (${name}) free.`);
  }

  if (needsFeedSync()) {
    log("Syncing crawl feeds (feed-urls.json)...");
    execSync("node scripts/sync-crawl-feeds.mjs", { cwd: backendRoot, stdio: "inherit" });
    saveState({ lastFeedSyncAt: new Date().toISOString() });
  } else {
    log("Feed config up to date.");
  }

  log("Repairing legacy demo seed URLs if any...");
  execSync("npm run intelligence:repair-urls", { cwd: backendRoot, stdio: "inherit" });

  if (checkUrlsOnly) {
    log("Running feed URL preflight (probe all crawl feeds)...");
    try {
      execSync("node scripts/check-feed-urls.mjs", { cwd: backendRoot, stdio: "inherit" });
      const lastPath = join(backendRoot, "data", ".intel-preflight-last.json");
      if (existsSync(lastPath)) {
        const last = JSON.parse(readFileSync(lastPath, "utf8"));
        saveState({ lastPreflightAt: last.ranAt, preflightFailed: last.failedCount ?? 0 });
        log(`Preflight done: ${last.failedCount ?? 0} failed of ${last.total ?? "?"}`);
      }
    } catch (e) {
      log(`Preflight reported failures or errors: ${e?.message || e}`);
      saveState({ lastPreflightAt: new Date().toISOString(), preflightFailed: -1 });
    }
    log("=== Preflight done (check-urls only) ===");
    return;
  }

  if (quickOnly) {
    log("Quick mode — crawl deferred until after UI is up.");
  } else {
    await runDailyCrawl(state);
  }

  log("=== Preflight done ===");
}

main().catch((e) => {
  console.error("[preflight] FATAL", e);
  process.exit(1);
});
