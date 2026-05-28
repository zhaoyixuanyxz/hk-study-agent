# 情报真爬 + 结构化字段

## Goal
港八大 × 7 类信息：真实 HTTP 采集、结构化字段、可溯源、每日自动更新并上线（官方源 auto_published）。

## Phases
| Phase | Status | Deliverable |
|-------|--------|-------------|
| 1 数据与注册表 | complete | sources/schools/feed-urls、crawl-registry 56 URL |
| 2 解析与结构化 | complete | html-parse、structured-extract、contentHash |
| 3 入库与更新 | complete | upsertIntelligenceItemCrawl、rawSnapshot |
| 4 每日任务 | complete | intelligence:daily、FETCH=1 默认 |
| 5 API/前端 | complete | structured 字段、卡片 UI |
| 6 测试 | complete | v1-real-crawl + test:v1-p6 |
| 7 文档 + Git | in_progress | docs 更新、commit |

## Errors
| Error | Resolution |
|-------|------------|
| — | — |
