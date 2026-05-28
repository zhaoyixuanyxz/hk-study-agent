import dotenv from "dotenv";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { buildApp } from "./app.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..", "..");
const envName = process.env.APP_ENV === "production" ? ".env.production" : ".env";
dotenv.config({ path: resolve(repoRoot, envName) });
dotenv.config({ path: resolve(repoRoot, ".env") });

const dataFile = process.env.DATA_FILE || undefined;
const app = buildApp({ dataFile });
const port = Number(process.env.PORT || 8010);
await app.listen({ port, host: "0.0.0.0" });
console.log(`API listening on http://127.0.0.1:${port}`);
