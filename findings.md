# Findings — Intelligence Real Crawl

## User requirement
- 真爬官网全文（可溯源 canonical_url + raw snapshot）
- 结构化：deadline / tuition 表 / policy 等
- 港八大 + 现有 7 类 infoType
- 每日自动采集更新并上线

## Design decisions
- `feedId` + `canonicalUrl` 稳定去重；`contentHash` 变更时 upsert 更新而非跳过
- 官方 `tier: official` + 解析质量达标 → `auto_published`（每日可见）
- 非官方仍 `pending_review`
- 默认 `INTELLIGENCE_FETCH=1`，`INTELLIGENCE_FETCH_MAX=56`

---

## CQ-C Prompt 调优（2026-05-28）

**依据**：Mock 回归 + `content-quality-score` 指标（fit_note、action_plan≥6、citation/免责、禁词）。

**变更**：
- `plan.txt`：增加 fit_note / rationale / timeline_urgency 输出示例，强调 subject weighting 与 rolling 策略。
- `report.txt`：增加 action_plan 阶段标签与风险标注示例、parent_summary 与 plain_language_notes 示例。

**温度**：Plan/Report 生成保持 `temperature: 0.35`（`planning-service.js` / `report-service.js`），未上调以避免禁词与结构漂移。

**禁词检测**：`containsForbiddenPromise` 会过滤「不等于一定录取」「不构成…录取承诺」等免责否定句，避免 mock 报告误报。

**后续**：配置 `DEEPSEEK_API_KEY` 后跑 `npm run test:v1-cq-regression` 观察 live ≥80% 通过率，再决定是否加 few-shot JSON 片段。
