# Phase 3 启动检查清单

**版本**：v1.0  
**依据**：[MVP-开发路线确认稿](MVP-开发路线确认稿.md)、[Phase2-交付物与验收说明](Phase2-交付物与验收说明.md)

## 前置条件（必须全部满足）

| # | 检查项 | 说明 |
|---|--------|------|
| 1 | Phase 2 已关闭 | 画像快照、`planInputView`、`readiness` 可稳定读取；见 [Phase2-交付物与验收说明](Phase2-交付物与验收说明.md) |
| 2 | 下游输入边界 | 方案模块**仅**消费 `画像快照` + `planInputView` + `readiness`，**不**解析原始对话全文 |
| 3 | 契约文件可用 | [schemas/plan-input-view.schema.json](schemas/plan-input-view.schema.json)、[Phase2-openapi.yaml](Phase2-openapi.yaml) |
| 4 | 账号隔离 | 方案结果与用户账号绑定，越权为 P0 缺陷（与 [Phase0-服务边界与账号鉴权](Phase0-服务边界与账号鉴权.md) 一致） |

## 启动后可并行事项

- 产品与研发对齐 [Phase3-方案输出规范与文案](Phase3-方案输出规范与文案.md) 中的免责与失败话术。
- AI 与后端对齐 [Phase3-方案生成链与错误码](Phase3-方案生成链与错误码.md) 中的结构化输出与错误码。
