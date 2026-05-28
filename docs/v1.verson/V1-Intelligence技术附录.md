# Intelligence 技术附录（DOC-03）

**更新**：2026-05-28（真爬官网 + 结构化字段）

## 采集模式

| 环境变量 | 默认 | 说明 |
|----------|------|------|
| `INTELLIGENCE_FETCH` | `1`（见 `.env.example`） | `1` 启用 HTTP 真爬 |
| `INTELLIGENCE_FETCH_MAX` | `56` | 每轮最多抓取 feed 数（港八大×7类） |
| `INTELLIGENCE_CRAWL_MODE` | `real` | `real` 走结构化爬虫；`legacy` 走旧 mock 片段 |
| `INTELLIGENCE_RESPECT_ROBOTS` | `1` | 尊重 robots.txt |

**每日任务**：`cd backend && npm run intelligence:daily`  
**同步 feed 配置**：`npm run intelligence:sync-feeds` → 写入 `backend/data/intelligence/{sources,schools,feed-urls}.json`

## 数据模型（db.json）

| 集合 | 说明 |
|------|------|
| `intelligenceItems` | 情报条目（含 `structured`、`contentHash`、`feedId`） |
| `intelligenceRawSnapshots` | 每次抓取元数据（URL、hash、html 长度） |
| `intelligenceSources` / `intelligenceFeedUrls` | 来源与 56 条 crawl feed |
| `intelligenceCollectionRuns` | 每日批次记录 |

### 条目扩展字段

| 字段 | 说明 |
|------|------|
| `feedId` | 稳定 ID，如 `hku-tuition` |
| `structured` | 按 `infoType` 解析的结构化对象（见下） |
| `contentHash` | 正文 hash，用于每日检测变更并 upsert 更新 |
| `locale.contentText` | 官网正文纯文本（最长约 12k 字符） |
| `lastSnapshotId` | 关联 `intelligenceRawSnapshots` |

### structured 按 infoType

| infoType | 结构化内容 |
|----------|------------|
| `policy` | `policy_points`, `effective_dates` |
| `deadline` | `deadlines[]`, `highlights` |
| `tuition` | `fees[]`, `fee_table_rows` |
| `admission` | `requirements[]`, `language_scores` |
| `program` | `programs[]` |
| `visa` | `visa_notes` |
| `scholarship` | `schemes[]`, `amounts` |

## 模块目录

```
backend/src/intelligence/
  crawl-registry.js      # 港八大 × 7 类官方 URL
  real-crawler.js        # 真爬 + 结构化 + 自动上线
  html-parse.js
  structured-extract.js
  content-hash.js
  robots.js
  ingestion-service.js   # 入口（FETCH=1 → real-crawler）
```

## 审核与上线规则

- **官方源**（`tier: official`）且解析质量达标 → `auto_published`（用户可见）
- 质量不达标 → `pending_review`（运营后台审核）
- 非官方源 → 一律 `pending_review`

## API（客户端字段）

`GET /api/v1/intelligence/search` 等返回新增：`structured`, `content_text`, `feed_id`, `content_hash`, `last_snapshot_id`

## AI 引用

`intelContextPack.js` + `citation-utils` 白名单校验（不变）
