# DeepSeek V4 Pro + 分场景思考模式

**日期**：2026-07-09  
**状态**：已确认（方案 B）

## 目标

所有真实 LLM 调用统一使用 `deepseek-v4-pro`，沿用现有 `DEEPSEEK_API_KEY` / `DEEPSEEK_BASE_URL`。  
仅选校方案与完整报告开启思考；对话建档与画像抽取保持非思考。

## 行为矩阵

| 调用 | 文件 | thinking | reasoning_effort |
|------|------|----------|------------------|
| 顾问对话 | `backend/src/agent.js` | `disabled` | 不传 |
| 画像抽取 | `backend/src/extraction.js` | `disabled` | 不传 |
| 选校方案 | `backend/src/planning-service.js` | `enabled` | `high` |
| 完整报告 | `backend/src/report-service.js` | `enabled` | `high` |

## 配置

- 默认模型：`deepseek-v4-pro`（替换原 `deepseek-chat`）
- Key / Base URL 不变
- 无 Key 时仍走 Mock，不调用 API

## 实现要点

1. 新增 `backend/src/deepseek-client.js`：统一默认模型与 `thinking` / `reasoning_effort` 组装
2. 四条调用链显式传入思考开关
3. 仍只消费 `message.content`；不向用户展示 `reasoning_content`
4. 思考模式下 `temperature` 可保留（API 忽略、不报错）
5. Plan/Report 默认超时由 120s 调整为 **300s**（V4 Pro 思考模式实测约 60–90s+）

## 验收

- Mock 回归：`deepseek-regression-smoke.mjs` 全绿
- Live（有 Key）：Chat → Plan → Report 闭环可跑通；live 用例 ≥80%
- 探针：`backend/scripts/v4-pro-live-closed-loop.mjs`（非思考无 `reasoning_content`；思考有 `reasoning_content`）
