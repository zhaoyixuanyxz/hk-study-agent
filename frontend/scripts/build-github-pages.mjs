/**
 * 本地模拟 GitHub Pages 构建（与 Actions 中 base 规则一致）。
 * 用法：node scripts/build-github-pages.mjs [repo-name]
 * 环境：VITE_API_BASE（可选）
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const feRoot = join(__dirname, "..");
const repoArg = process.argv[2];
const repo = repoArg || process.env.GITHUB_REPOSITORY?.split("/")[1] || "study-agent";
const owner = process.env.GITHUB_REPOSITORY?.split("/")[0] || "user";
const base =
  repo === `${owner}.github.io` ? "/" : `/${repo.replace(/^\/|\/$/g, "")}/`;

const env = {
  ...process.env,
  VITE_BASE_PATH: base,
};

console.error(`build-github-pages: VITE_BASE_PATH=${base}`);
if (env.VITE_API_BASE) console.error(`build-github-pages: VITE_API_BASE=${env.VITE_API_BASE}`);

const r = spawnSync("npm", ["run", "build"], { cwd: feRoot, env, stdio: "inherit", shell: true });
process.exit(r.status ?? 1);
