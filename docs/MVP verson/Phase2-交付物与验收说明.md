# Phase 2 交付物与验收说明

**版本**：v1.0  
**阶段**：动态画像与记忆系统（Phase 2）

---

## 交付物索引

| 类型 | 文档 / 位置 |
|------|-------------|
| 画像页 IA（P2-PM-01） | [Phase2-画像页信息架构.md](Phase2-画像页信息架构.md) |
| QA 用例集（P2-QA-01） | [Phase2-QA-画像与记忆用例.md](Phase2-QA-画像与记忆用例.md) |
| 接口契约（OpenAPI 3） | [Phase2-openapi.yaml](Phase2-openapi.yaml) |
| JSON Schema | [schemas/profile-snapshot.schema.json](schemas/profile-snapshot.schema.json)、[schemas/plan-input-view.schema.json](schemas/plan-input-view.schema.json) |
| 实现代码 | `backend/src/`（`phase2-pipeline.js`、`plan-input-service.js`、`profile-service.js`、`extraction.js`、`store.js`、`app.js`）；`frontend/src/`（对话 + 画像 + 待确认卡片） |
| 自动化测试 | `backend/tests/api.test.js` |

---

## 阶段验收（与清单一致）

1. 对话后可生成画像（快照可查询）。  
2. 有缺口与更新时间。  
3. 续聊可注入历史记忆片段（MVP 裁剪：词重叠召回，非独立向量库）。

**Phase 2 关闭后**：可启动 **Phase 3（方案生成）**；下游仅依赖 **画像快照** 与 **`planInputView`**，不解析原始对话全文。

**Phase 3 完成后**：见 [Phase3-交付物与验收说明.md](Phase3-交付物与验收说明.md)（方案生成 API、落库与方案页 MVP）。
