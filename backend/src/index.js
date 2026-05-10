import dotenv from "dotenv";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { buildApp } from "./app.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "..", "..", ".env") });

const app = buildApp();
const port = Number(process.env.PORT || 8010);
await app.listen({ port, host: "0.0.0.0" });
console.log(`API listening on http://127.0.0.1:${port}`);
