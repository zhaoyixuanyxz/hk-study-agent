# Findings — Intelligence Real Crawl

## User requirement
- 真爬官网全文（可溯源 canonical_url + raw snapshot）
- 结构化：deadline / tuition 表 / policy 等
- 港八大 + 现有 7 类 infoType
- 每日自动采集更新并上线

## Design decisions
- `feedId` + `canonicalUrl` 稳定去重；`contentHash` 变更时 upsert 更新而非跳过
- 官方 `tier: official` + 解析质量达标 → `auto_published`（每日可见）
- 非官方仍 `pending_review`
- 默认 `INTELLIGENCE_FETCH=1`，`INTELLIGENCE_FETCH_MAX=56`
