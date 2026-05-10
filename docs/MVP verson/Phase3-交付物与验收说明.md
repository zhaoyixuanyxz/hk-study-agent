# Phase 3 交付物与验收说明

**版本**：v1.1  
**阶段**：方案生成能力（Phase 3）

## 交付物索引

| 类型 | 文档 / 位置 |
|------|----------------|
| 启动检查 | [Phase3-启动检查清单.md](Phase3-启动检查清单.md) |
| 产品规范 | [Phase3-方案输出规范与文案.md](Phase3-方案输出规范与文案.md) |
| AI / 错误码 | [Phase3-方案生成链与错误码.md](Phase3-方案生成链与错误码.md) |
| 接口契约 | [Phase3-openapi.yaml](Phase3-openapi.yaml) |
| JSON Schema | [schemas/plan-result.schema.json](schemas/plan-result.schema.json) |
| QA 用例 | [Phase3-QA-方案生成用例.md](Phase3-QA-方案生成用例.md) |
| P3-BE-03 可观测性 | `backend/src/plan-generation-metrics.js`（成功率/失败码/耗时聚合）；`POST /api/v1/plans/generate` 超时（`PLAN_GENERATION_TIMEOUT_MS`）、结构化错误日志；见 [Phase1-API-联调说明.md](Phase1-API-联调说明.md) 环境变量表 |
| 实现代码 | `backend/src/planning-service.js`、`backend/src/app.js`（方案相关路由）、`backend/src/store.js`（`planResults`）；`frontend/`（方案页 MVP） |

## 阶段验收

1. 在 `readiness` 满足前提下可生成**单套**结构化方案，含冲刺/匹配/保底三档与免责声明。  
2. 未就绪时返回 `READINESS_NOT_MET` 或 `INPUT_INCOMPLETE`，不调用模型生成（Mock 路径下逻辑一致）。  
3. 方案结果落库且与用户绑定；`GET /api/v1/plans/:planId` 越权返回 404。  
4. 前端方案页可展示成功/失败/重试引导（与文案规范一致）。  
5. **P3-BE-03**：方案生成请求有超时与失败结构化日志；进程内可查询聚合指标（成功率、按 `code` 计数、平均耗时 / 近次 P95），供 Phase 5 埋点对齐。

**关闭后**：可启动 Phase 4（报告生成与历史记录），报告模块消费本阶段 `plan` 字段即可。  
**Phase 4 完成后**：见 [Phase4-交付物与验收说明.md](Phase4-交付物与验收说明.md)（报告与历史、关闭 Phase 5 前置）。
