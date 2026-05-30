# V1 CQ 内容质量 QA 矩阵

**版本**：v1.0  
**更新日期**：2026-05-28  
**适用模块**：Plan（顾问方案）、Report（个性化专属报告）  
**自动化脚本**：`content-quality-score.mjs`、`deepseek-regression-smoke.mjs`、`tests/v1-cq-content-quality.test.js`

---

## 评分维度（1–5 分 Rubric）

每项 1 分 = 不达标，3 分 = 可用，5 分 = 产品化优秀。自动化守门以 **pass/fail** 为主；人工抽检使用下表 1–5 分。

### 1. 真实性（Verifiability）

| 分数 | 标准 |
|------|------|
| 1 | 编造截止日期/学费/录取率，无 citation 且无免责 |
| 3 | 关键事实有 citation 或明确「需以官网为准」 |
| 5 | citation 白名单校验通过 + quoteOrSummary 可核对 + 无禁词承诺 |

**自动化指标**：`citationCount >= 1` 或 `hasSafeDisclaimer`；`forbiddenPromise === false`

### 2. 可执行性（Actionability）

| 分数 | 标准 |
|------|------|
| 1 | 仅泛泛建议，无时间线/无 checklist |
| 3 | 30/60/90 天各 ≥2 条，动词开头、可独立执行 |
| 5 | ≥6 条 action_plan + 风险标签 + 前端可勾选持久化 |

**自动化指标**：`actionPlanItems >= 6`；Report HTML 含 `#action-plan`

### 3. 香港深度（HK Expertise）

| 分数 | 标准 |
|------|------|
| 1 | 通用留学模板，无 JUPAS/港八大语境 |
| 3 | 提及 rolling/早轮/科目权重之一，且与画像一致 |
| 5 | reach/match/safety 含 `fit_note` + JUPAS 权重 + 奖学金/高需求专业现实 |

**自动化指标**：`fitNoteCount >= 1`（mock ≥3）；Prompt 含香港专家规则

### 4. 故事成长（Personal Voice）

| 分数 | 标准 |
|------|------|
| 1 | 简历式罗列，与用户对话无关 |
| 3 | 引用 1–2 处用户经历或转折 |
| 5 | 成长反思 + 独特声音 + 非 AI 模板套话 |

**自动化指标**：暂无（人工 QA）；Chat `advisor.txt` 已引导

### 5. 范围合规（Scope — V3-CHAT）

| 分数 | 标准 |
|------|------|
| 1 | 对非香港/非授课型硕士/PhD/副学士等问题展开长篇规划 |
| 3 | 能说明服务边界并引导回港校授课型硕士 1–2 个追问 |
| 5 | 超范围请求固定拒答（`scope_redirect`），且不污染 profile 的 `target_region` |

**自动化指标**：`assessChatScope` 单测 ≥10 越界 + ≥5 合规；API `scope_redirect === true`；`npm run test:v1-chat-scope`

### 6. 引用深度（Citations — V3-KB）

| 分数 | 标准 |
|------|------|
| 1 | 方案/报告引用 <3 条或大量失效链接 |
| 3 | ≥6 条可验证引用（情报 itemId 或 `ext_kb_*`） |
| 5 | 引用与画像 field/入学季挂钩；换专业后 Top 检索明显变化 |

**自动化指标**：`citationCount >= 6`（plan/report）；`filterCitationsAgainstCombinedSources`；`npm run test:v1-v3-kb`

### 7. 可视化（Visuals — V3-VIS）

| 分数 | 标准 |
|------|------|
| 1 | 无图表、风险仅靠正文堆砌 |
| 3 | Plan 有梯度/时间线图；Report 有风险矩阵或预算 band |
| 5 | `#report-risk-items` 服务端渲染 + Chart 响应式 + 无录取% 数字 |

**自动化指标**：`visualsBonus`；HTML 含 `report-risk-items` / `report-visuals-data`；`npm run test:v1-v3-vis`

---

## 自动化 Pass 阈值（Mock 路径）

| 对象 | 条件 |
|------|------|
| **Plan** | 三档完整 + `fit_note >= 1` + **citation≥6** + 无禁词 + 可选 `visualsBonus` |
| **Report** | 七章 + action_plan≥6 + **citation≥6** + 无禁词 + 可选 `visualsBonus` / `hasRiskItemsHtml` |
| **V3 聚合** | `npm run test:v1-v3` 全绿 |
| **Live（可选）** | `DEEPSEEK_API_KEY` 下 live 用例 ≥80% 通过 QA 子检查 |

---

## 禁词列表（录取承诺）

- 一定录取 / 保证录取 / 确保录取 / 100%录取 / 必中 / 稳录
- 录取概率 + 具体百分比（如「录取概率 85%」）

实现见 [`backend/src/content-quality.js`](../../backend/src/content-quality.js) 中 `FORBIDDEN_ADMISSION_PROMISE`。

---

## 人工抽检入口

- 模板：[V1-CQ-Sprint-QA-归档-2026-05-28.md](V1-CQ-Sprint-QA-归档-2026-05-28.md)
- V3 归档：[V1-V3-Sprint-QA-归档-2026-05-30.md](V1-V3-Sprint-QA-归档-2026-05-30.md)
- 手测主链路：[V1-主链路QA用例.md](V1-主链路QA用例.md)

---

## 变更记录

| 日期 | 说明 |
|------|------|
| 2026-05-28 | CQ-C 初版：四维度 rubric + 自动化阈值 |
| 2026-05-30 | V3：范围合规 + 引用深度 + 可视化；citations≥6；`test:v1-v3` |
