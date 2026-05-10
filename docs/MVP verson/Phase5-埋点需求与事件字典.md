# Phase 5：埋点需求与事件字典（P5-PM-01）

**版本**：v1.0  
**对应 Epic**：P5-PM-01、P5-FE-03  
**实现**：前端 `track(event, props)` → `POST /api/v1/analytics/events`（可批量，当前实现为单次数组）

## 1. 公共字段（服务端自动补充）

| 字段 | 说明 |
|------|------|
| `user_id` | 从鉴权解析，不落客户端 |
| `received_at` | ISO 时间 |
| `client_ts` | 客户端可选 `props.ts` |

## 2. 事件列表

| 事件名 | 触发时机 | 主要属性 | PRD 指标映射 |
|--------|-----------|----------|--------------|
| `auth_register_success` | 邮箱注册成功 | — | 注册转化 |
| `auth_login_success` | 登录成功 | — | 留存/登录 |
| `chat_message_send` | 用户发送一条对话 | `thread_id`（可选） | 对话深度 |
| `plan_generate_click` | 点击「生成方案」 | — | 方案触达 |
| `plan_generate_result` | 方案接口返回 | `ok` boolean, `code?` | 方案成功率 |
| `report_generate_click` | 点击「生成报告」 | — | 报告触达 |
| `report_generate_result` | 报告接口返回 | `ok` boolean | 报告成功率 |
| `report_view` | 进入报告页并加载详情 | `report_id?` | 报告查看/留存 |
| `history_view` | 进入历史页 | — | 历史使用 |
| `nav_click` | 主导航切换 | `to`（页面 key） | 路径分析 |

## 3. 聚合建议

开发阶段：直接统计 `backend/data/db.json` 中 `analyticsEvents` 数组长度与按 `name` 分组。  
生产：可导出 JSON / 接入 ELK；看板属运营配置，非 MVP 必交付。
