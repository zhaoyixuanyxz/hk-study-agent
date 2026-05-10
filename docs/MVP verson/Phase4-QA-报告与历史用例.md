# Phase 4 QA：报告与历史用例

**版本**：v1.0  
**对应 Epic**：P4-QA-01

## 1. 主链路（同步生成）

| 用例 ID | 步骤 | 期望 |
|---------|------|------|
| P4-TC-01 | 已存在方案（可先 `POST /api/v1/plans/generate`），`POST /api/v1/reports/generate`，body `{}` 或 `{ "plan_id": "<id>" }` | 200，`html` 非空，`word_count >= 1000`，正文含 7 段 `report-chapter` |
| P4-TC-02 | 同上后 `GET /api/v1/reports/{report_id}` | 200，`html` 与生成一致 |
| P4-TC-03 | `GET /api/v1/reports` | 列表含刚生成的 `report_id` |
| P4-TC-04 | `GET /api/v1/history` | 返回 `threads`、`profile_snapshots`、`plans`、`reports` 四类数组 |

## 2. 阻断与失败

| 用例 ID | 前置 | 期望 |
|---------|------|------|
| P4-TC-10 | 用户无任何方案记录 | 400，`code=NO_PLAN` |
| P4-TC-11 | 指定 `plan_id` 与当前最新画像快照不一致（跨快照陈旧方案） | 400，`code=SNAPSHOT_MISMATCH`（若仍持有一份不匹配方案） |
| P4-TC-12 | 用户 B 请求用户 A 的 `report_id` | 404 |

## 3. 前端与数据留存（手工 / 联调）

| 用例 ID | 步骤 | 期望 |
|---------|------|------|
| P4-TC-20 | 方案页点击「生成报告」 | 进入报告面板并显示 HTML |
| P4-TC-21 | 历史页点击某报告 | 切换到报告面板并加载该报告（依赖 `localStorage` 中 token 未清除） |
| P4-TC-22 | 清除站点数据后重新进入 | 新 token、无历史（与当前 MVP 匿名注册模式一致；正式「重登」见 Phase 5） |

## 4. 超时与真实模型（联调环境可选）

| 用例 ID | 步骤 | 期望 |
|---------|------|------|
| P4-TC-30 | 配置 `DEEPSEEK_API_KEY` 且超时过短 `REPORT_GENERATION_TIMEOUT_MS` | 502，`code=GENERATION_TIMEOUT`（与方案生成错误语义风格一致） |

## 5. 自动化

后端 `backend/tests/api.test.js` 含 Phase 4：报告生成（Mock、字数、七章结构）、列表/详情、历史聚合、越权、`NO_PLAN`；CI 无真实模型 Key 时报告走 Mock 生成。
