import { readFileSync, writeFileSync } from "node:fs";

const p = new URL("../src/main.js", import.meta.url);
const lines = readFileSync(p, "utf8").split(/\r?\n/);
lines[919] = '      setStatus("咨询会话尚未就绪，请刷新页面后重试。", true);';
writeFileSync(p, lines.join("\n"), "utf8");
