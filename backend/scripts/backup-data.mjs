/**
 * Backup db.json + intelligence static JSON for production pilot.
 * Usage: node scripts/backup-data.mjs [--out-dir ../backups]
 */
import { cpSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const backendRoot = join(__dirname, "..");
const repoRoot = join(backendRoot, "..");

export function runBackup(outDir, options = {}) {
  const dataDir = options.dataDir || process.env.DATA_DIR || join(backendRoot, "data");
  const dbFile = options.dataFile || process.env.DATA_FILE || join(dataDir, "db.json");
  const intelDir = join(dataDir, "intelligence");

  if (!existsSync(dbFile)) {
    throw new Error(`backup-data: missing ${dbFile}`);
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const workDir = join(outDir, `backup-${stamp}`);
  mkdirSync(workDir, { recursive: true });

  cpSync(dbFile, join(workDir, "db.json"));
  if (existsSync(intelDir)) {
    cpSync(intelDir, join(workDir, "intelligence"), { recursive: true });
  }

  writeFileSync(
    join(workDir, "manifest.json"),
    JSON.stringify(
      { createdAt: new Date().toISOString(), dbFile, intelIncluded: existsSync(intelDir) },
      null,
      2
    )
  );

  return workDir;
}

function parseOutDir(argv) {
  let outDir = join(repoRoot, "backups");
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--out-dir" && argv[i + 1]) {
      outDir = argv[++i];
      break;
    }
  }
  return outDir;
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("backup-data.mjs")) {
  try {
    const workDir = runBackup(parseOutDir(process.argv.slice(2)));
    console.error(`backup-data: OK ${workDir}`);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
