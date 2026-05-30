# Intelligence 技术附录（DOC-03）

**更新**：2026-05-30（V3-INTEL：链接探活 + 安全采集）

## V3 运维工作流（管理员）

推荐顺序：**检测链接 → 安全采集 → 审核队列**。

| 步骤 | Admin UI / API | 说明 |
|------|----------------|------|
| 1. 探活 | 按钮「检测链接」或 `POST /api/v1/intelligence/admin/preflight-urls` | 并发 GET 全部 crawl feed；结果写入 `backend/data/.intel-preflight-last.json` |
| 2. 采集 | 按钮「安全采集」或 `POST /api/v1/intelligence/admin/collect` | 默认 `respect_preflight: true`，跳过探活失败 feed；`upsertIntelligenceItemCrawl` 在正文质量不达标时不覆盖旧条目 |
| 3. 查看 | `GET /api/v1/intelligence/admin/preflight-last` | 上次探活摘要与失败列表 |

**CLI 等价**：

```bash
cd backend
npm run intelligence:check-urls    # 探活并写入 .intel-preflight-last.json（有失败则 exit 1）
npm run intelligence:daily         # 采集（尊重上次 preflight 失败 feed）
node scripts/startup-preflight.mjs --check-urls   # 仅探活后退出
```

**用户 Intelligence Tab**：「刷新列表」仅重新加载已上线条目，**不触发**爬取。

### 安全合并规则（`store.upsertIntelligenceItemCrawl`）

- `contentHash` 不变 → 不写入  
- 新正文未通过 `passesExtractionQuality` → 保留旧行，`skippedReason: quality_degraded`  
- 已 `approved` / `auto_published` → 更新正文时保留 `reviewStatus`、`reviewedBy`、`productCurated`  

---

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
**校验全部 56 条官网链接**：`npm run intelligence:check-urls`（检测 HTTP 404 与 PolyU 类 soft-404）  
**修复 db 中旧 canonicalUrl**：`npm run intelligence:repair-canonical`（与 registry 对齐）

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
| `benchmark` | `benchmarkGpa`, `subjectWeights[]`, `language`, `competitionTag` |

## 录取 benchmark 种子（CQ-D）

| 文件 | 说明 |
|------|------|
| `backend/data/intelligence/admission-benchmarks.json` | 港八大热门项目 ≥20 条参考基准（GPA/语言/科目权重/竞争度） |
| `benchmark-loader.js` | 启动/测试时 upsert 至 `intelligenceItems`，`infoType: benchmark` |

**维护**：编辑 JSON 后执行 `loadCuratedSeedsIntoStore(store, { force: true })` 或重启后端 preflight；条目 `reviewStatus: approved`，`productCurated: true`。

**检索**：`searchItems.js` 对「GPA / 基准 / benchmark」查询加权；`intelContextPack.js` 在 plan/report 生成时将 benchmark 条目置顶并注入 field 匹配项。

**引用**：`buildMockStructuredPlan` mock 路径优先 citation 绑定 benchmark 条目。

## 官方外链知识库（V3-KB）

| 文件 | 说明 |
|------|------|
| `backend/data/intelligence/external-kb.json` | 港八大官方研究生院/项目/截止/学费 URL（`trustTier: official`，≥20 条） |
| `external-kb-loader.js` | `loadExternalKb()`、`selectExternalKbForProfile()`、`externalKbCitationId` → `ext_kb_*` |
| `profile-search-hints.js` | 从 `planInputView` 提取 `targetSchools`、`field`、`intakeTerm` 等检索信号 |

**维护**：从 `feed-urls.json` 的 admission/program/deadline/tuition 增补；`EXTERNAL_KB_FILE` 可覆盖路径。

**上下文**：`buildCombinedIntelContext()` 拼接情报 pack（含 `relevance:`）与 `EXTERNAL_KB`，总长 ≤8000 字符。

**引用**：`filterCitationsAgainstCombinedSources` 合并情报与 `ext_kb_*`；CQ 门槛 plan/report mock ≥6 条引用。

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
