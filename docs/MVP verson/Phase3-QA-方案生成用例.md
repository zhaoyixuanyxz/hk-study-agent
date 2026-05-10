# Phase 3 QA：方案生成用例

**版本**：v1.0  
**对应 Epic**：P3-QA-01

## 1. 主链路

| 用例 ID | 步骤 | 期望 |
|---------|------|------|
| P3-TC-01 | 用户画像就绪（`readiness.ready === true`），调用 `POST /api/v1/plans/generate` | 200，`plan.tiers` 含 reach/match/safety，`disclaimer` 非空 |
| P3-TC-02 | 同上后 `GET /api/v1/plans/{plan_id}` | 200，内容与生成时一致 |
| P3-TC-03 | `GET /api/v1/plans` | 列表包含刚生成的 `plan_id` |

## 2. 阻断与失败

| 用例 ID | 前置 | 期望 |
|---------|------|------|
| P3-TC-10 | 无画像快照或 `planInputView` 为空 | 400，`code=INPUT_INCOMPLETE` |
| P3-TC-11 | `readiness.ready === false` | 400，`code=READINESS_NOT_MET`，含 `meta.missingRequired`（若有） |
| P3-TC-12 | 用户 B 请求用户 A 的 `plan_id` | 404 |

## 3. P3-BE-03 指标与超时

| 用例 ID | 步骤 | 期望 |
|---------|------|------|
| P3-TC-20 | 配置 `PLAN_METRICS_HTTP_TOKEN`，`GET /api/v1/internal/plan-generation/metrics` + `X-Plan-Metrics-Token` | 200，返回 `attempts_total`、`success_rate`、`failure_by_code`、`avg_duration_ms_*` |
| P3-TC-21 | 未配置 `PLAN_METRICS_HTTP_TOKEN` 时访问 metrics 路径 | 404 |
| P3-TC-22 | 模型超时（`PLAN_GENERATION_TIMEOUT_MS` 过短）且启用真实 Key | `code=GENERATION_TIMEOUT`，502（需在联调环境验证） |

## 4. 自动化

后端 `backend/tests/api.test.js` 含 Phase 3 生成、门禁与 **P3-BE-03 指标**用例；CI 无真实模型 Key 时走 Mock 生成。
