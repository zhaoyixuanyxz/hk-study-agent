# Phase 5：发布与模型版本说明（P5-AI-01）

**版本**：v1.0  
**用途**：每次试运行/标签发布时填写，支持回溯 Prompt 与模型配置。

## 环境变量快照（示例）

| 变量 | 值（示例） | 说明 |
|------|------------|------|
| `DEEPSEEK_MODEL` | `deepseek-chat` | 对话/方案/报告 LLM |
| `PLAN_GENERATION_TIMEOUT_MS` | `120000` | 方案生成超时 |
| `REPORT_GENERATION_TIMEOUT_MS` | `120000` | 报告生成超时 |
| `LOG_LEVEL` | `info` / `warn` | 见 [Phase1-API-联调说明.md](Phase1-API-联调说明.md) |

## 代码版本

- Git 标签或 commit：`________________`  
- 发布日期：`________________`

## Prompt 与策略

- 建档 Agent、编排、Phase2 管道与方案/报告链路的源码位置：`backend/src/agent.js`、`orchestrator.js`、`phase2-pipeline.js`、`planning-service.js`、`report-service.js`。  
- 重大 Prompt 变更时更新本文件或附独立变更记录。

## 回滚

恢复上一标签；或仅回滚 `DEEPSEEK_*` / 超时环境变量后重启进程。
