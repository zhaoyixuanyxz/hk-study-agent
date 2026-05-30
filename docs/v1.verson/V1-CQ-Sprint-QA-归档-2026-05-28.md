# V1 CQ Sprint QA 归档（2026-05-28）

**Sprint**：CQ-C — 真实模型回归与内容 QA  
**环境**：Mock（默认）+ 可选 `DEEPSEEK_API_KEY` live  
**关联**：[V1-CQ-内容质量QA矩阵.md](V1-CQ-内容质量QA矩阵.md)

## 自动化（已通过 — Mock 路径 2026-05-28）

| 类型 | 命令 | 结果 |
|------|------|------|
| 内容质量单测 | `cd backend && node --test tests/v1-cq-content-quality.test.js` | ☑ 7 pass |
| Mock 评分 | `cd backend && node scripts/content-quality-score.mjs` | ☑ combined PASS |
| Mock 回归 16 用例 | `cd backend && node scripts/deepseek-regression-smoke.mjs` | ☑ 16/16 |
| CQ-C 守门 | `cd backend && npm run test:v1-cq-regression` | ☑ 全绿 |
| 全量回归 | `cd backend && npm run test:v1-p6` | ☑ 73 pass / 1 skip |

## Plan 人工抽检（5 条）

| # | 检查项 | 结果 | 签字 |
|---|--------|------|------|
| 1 | 三档 tier 均展示「程序匹配度」fit_note | □ 通过 / □ 待补 | |
| 2 | 时间压力色条与文案（relaxed/normal/tight）正确 | □ 通过 / □ 待补 | |
| 3 | 「下一步执行路径」3–5 条可执行、非空泛 | □ 通过 / □ 待补 | |
| 4 | 引用含「查看情报」且 quote 摘要可读 | □ 通过 / □ 待补 | |
| 5 | 无「保证录取」类禁词 | □ 通过 / □ 待补 | |

## Report 人工抽检（5 条）

| # | 检查项 | 结果 | 签字 |
|---|--------|------|------|
| 1 | 风险仪表盘展示高/中/低标签 | □ 通过 / □ 待补 | |
| 2 | 30/60/90 天 checklist 可勾选且刷新后保留 | □ 通过 / □ 待补 | |
| 3 | action_plan 合计 ≥6 条且含【阶段】或风险提示 | □ 通过 / □ 待补 | |
| 4 | 七章结构完整 + 家长摘要短句 | □ 通过 / □ 待补 | |
| 5 | citation≥1 或明确免责声明 | □ 通过 / □ 待补 | |

## DeepSeek Live（可选）

配置 `DEEPSEEK_API_KEY` 后：

```bash
cd backend && npm run test:v1-cq-regression
```

期望：live 10 用例 ≥80% 通过（citation 或免责、action_plan≥6）。

## Prompt 调优记录（CQ-C-06）

见项目根目录 [findings.md](../../findings.md) § CQ-C Prompt 调优。

## 结论

- [x] **自动化 CQ-C 门禁通过**（Mock 路径；live 需配置 `DEEPSEEK_API_KEY`）
- [ ] **Plan/Report 人工抽检签字**（试点前由产品补勾）
