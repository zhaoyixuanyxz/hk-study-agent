/**
 * 打开 JSON 库并保存一次：触发 migrate（孤立 thread 数据清理 + 聚合快照重算）。
 * 用法：在 backend 目录 `node scripts/repair-db.mjs` 或 `node scripts/repair-db.mjs /path/to/db.json`
 */
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createStore } from "../src/store.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const arg = process.argv[2];
const dataFile = arg ? String(arg).trim() : join(__dirname, "..", "data", "db.json");

const store = createStore(dataFile);
store.getUserByToken("__repair_db_trigger__");
console.log("repair-db: migrate applied if needed ->", dataFile);
