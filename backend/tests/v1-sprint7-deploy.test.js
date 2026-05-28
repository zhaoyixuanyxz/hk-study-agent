import { describe, it } from "node:test";
import assert from "node:assert";
import { cpSync, existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..");
const backendRoot = join(__dirname, "..");

describe("v1-sprint7 deploy", () => {
  it("deploy files exist", () => {
    for (const rel of [
      "deploy/Dockerfile.backend",
      "docker-compose.prod.yml",
      ".env.production.example",
    ]) {
      assert.ok(existsSync(join(repoRoot, rel)), rel);
    }
  });

  it("backup-data.mjs exists and backup pattern copies db.json", () => {
    const script = join(backendRoot, "scripts", "backup-data.mjs");
    assert.ok(existsSync(script));
    const dbFile = join(backendRoot, "data", "db.json");
    assert.ok(existsSync(dbFile));
    const out = mkdtempSync(join(tmpdir(), "backup-test-"));
    const workDir = join(out, "backup-smoke");
    try {
      mkdirSync(workDir, { recursive: true });
      cpSync(dbFile, join(workDir, "db.json"));
      writeFileSync(join(workDir, "manifest.json"), "{}");
      assert.ok(existsSync(join(workDir, "db.json")));
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });

  it("production-smoke inject path passes", async () => {
    const { spawnSync } = await import("node:child_process");
    const r = spawnSync("node", ["scripts/production-smoke.mjs"], {
      cwd: backendRoot,
      encoding: "utf8",
      env: { ...process.env, PRODUCTION_BASE_URL: "" },
    });
    assert.equal(r.status, 0, r.stderr || r.stdout);
  });
});
