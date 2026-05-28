/**
 * V1-P2 gate: Profile view model, Plan citations/normalize, plan GET report readiness wiring.
 */
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const backendRoot = join(__dirname, "..");
const repoRoot = join(backendRoot, "..");

function die(msg) {
  console.error(msg);
  process.exit(1);
}

for (const rel of ["src/profile-view.js", "src/citation-utils.js"]) {
  const p = join(backendRoot, rel);
  if (!existsSync(p)) die(`verify-v1-p2: missing ${rel}`);
}

const planSrc = readFileSync(join(backendRoot, "src", "planning-service.js"), "utf8");
if (!planSrc.includes("risk_note")) die("verify-v1-p2: planning-service must include tier risk_note");
if (!planSrc.includes("normalizeCitations")) die("verify-v1-p2: planning-service must use normalizeCitations");
if (!planSrc.includes("citations")) die("verify-v1-p2: planning-service must handle citations");

const profileRoutes = join(backendRoot, "src", "modules", "profile-routes.js");
if (!existsSync(profileRoutes)) die("verify-v1-p2: missing modules/profile-routes.js");
const profileSrc = readFileSync(profileRoutes, "utf8");
if (!profileSrc.includes("profile_view")) die("verify-v1-p2: profile routes must include profile_view");
const ctxSrc = readFileSync(join(backendRoot, "src", "modules", "context.js"), "utf8");
if (!ctxSrc.includes("buildProfileViewModel")) die("verify-v1-p2: context must use buildProfileViewModel");
const planRoutesSrc = readFileSync(join(backendRoot, "src", "modules", "plan-routes.js"), "utf8");
if (!planRoutesSrc.includes("getProfileSnapshot")) die("verify-v1-p2: plan routes must resolve snapshot via getProfileSnapshot");

const storeSrc = readFileSync(join(backendRoot, "src", "store.js"), "utf8");
if (!storeSrc.includes("getProfileSnapshot")) die("verify-v1-p2: store.js must define getProfileSnapshot");

const feMain = join(repoRoot, "frontend", "src", "main.js");
if (!existsSync(feMain)) die("verify-v1-p2: missing frontend/src/main.js");
const feSrc = readFileSync(feMain, "utf8");
const fePlan = readFileSync(join(repoRoot, "frontend", "src", "pages", "plan.js"), "utf8");
const feProfile = readFileSync(join(repoRoot, "frontend", "src", "pages", "profile.js"), "utf8");
if (!fePlan.includes("renderPlanReportGate")) die("verify-v1-p2: plan page must render report readiness gate");
if (!feProfile.includes("profile-sections")) die("verify-v1-p2: profile page must render profile sections");

console.error("verify-v1-p2: OK (profile_view, citations utils, plan schema + gates)");
