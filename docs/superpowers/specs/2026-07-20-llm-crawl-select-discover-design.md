# LLM 轻量选题爬取（①+②）设计

**日期**：2026-07-20  
**状态**：已确认（2026-07-20）  
**范围**：情报采集；不换技术栈（Node + DeepSeek + 现有 JSON store + 运营审核）

## 1. 目标

在现有港八大官方 feed 体系上增加两层能力：

1. **① LLM 选题**：每轮从「已批准可爬名单」中选出本轮要爬的子集（默认上限可配置）。
2. **② 同域发现**：从种子页抽取八大官方域名内新链接 → 进入候选池 → **人工批准 URL 后**才可被选题/爬取。
3. **人工上线内容**：新爬正文默认 `pending_review`，运营通过后才对用户情报库可见（收紧官方 `auto_published`）。

**人工确认策略（已确认）**：新链接采用 **A. 先批 URL，再爬**。

## 2. 非目标

- 开放式全网搜索 / 跳出八大域名
- 换爬虫框架、换数据库、换前端技术栈
- 用思考模式跑选题（默认非思考，控制成本）
- 站内提醒、支付等无关能力

## 3. 数据流

```text
运营「安全采集」或 intelligence:daily
        │
        ├─ [可选] ② 发现：种子页抽链 → host 白名单 → LLM 标注 infoType/理由
        │         → intelligenceCrawlCandidates (status=pending)
        │         → 运营批准/拒绝 URL（批准后进入可爬名单）
        │
        ├─ ① 选题：可爬名单 = 原 56 feed ∪ 已批准候选
        │         → LLM（失败则启发式）选出 ≤N 条本轮 feedId
        │
        ├─ 爬取：探活失败跳过 → robots → GET → 抽取 → 质量门
        │         → 入库 reviewStatus = pending_review（默认）
        │
        └─ 运营审核队列：approve → 用户可见；reject → 不上线
```

## 4. 数据模型

### 4.1 `intelligenceCrawlCandidates`（store 新集合）

| 字段 | 说明 |
|------|------|
| `id` | 候选 id |
| `url` / `canonicalUrl` | 规范化 URL |
| `schoolId` | 港八大 id |
| `sourceId` | 对应 official source |
| `infoType` | policy/deadline/… 或 `unknown` |
| `reason` | LLM/规则给出的简短理由 |
| `status` | `pending` \| `approved` \| `rejected` |
| `discoveredAt` / `decidedAt` / `decidedBy` | 时间与审核员 |
| `seedUrl` | 来自哪条种子页 |

**批准后**：生成或映射为可爬 feed（写入 `feed-urls` 运行时合并层，或 store 内 `approvedFeeds`），带稳定 `feedId`（如 `discover:{hash}`），供选题与爬虫使用。

### 4.2 情报条目审核

- 真爬入库默认：`pending_review`（由 env `INTELLIGENCE_AUTO_PUBLISH=0` 控制；默认关闭自动上线）。
- 种子 / benchmark 既有数据行为不变（仍可为 approved），避免空库。

## 5. 模块边界

| 模块 | 职责 |
|------|------|
| `crawl-select.js` | 组装可爬名单上下文 → DeepSeek 非思考 → 解析 `feedIds[]`；失败回退「最久未更新优先」 |
| `crawl-discover.js` | 对每校 1～2 个种子 URL 抽 `<a href>` → 同 host 白名单过滤 → LLM 筛选/标注 → 写候选（去重） |
| `host-allowlist.js`（可内联） | 仅允许 `SCHOOL_CRAWL_PROFILES.*.baseHost` 同源 |
| `ingestion-service` / `admin/collect` | 编排：可选 discover → select → `runRealCrawl(selectedFeeds)` |
| `routes` | 候选列表、批准/拒绝 URL；collect 增加 query/body 开关 |
| 运营 UI | 候选池卡片（批准/拒绝）；采集前可勾选「本轮含发现」 |

## 6. API（草案）

- `GET /api/v1/intelligence/admin/crawl-candidates?status=pending`
- `POST /api/v1/intelligence/admin/crawl-candidates/decide`  
  `{ candidate_id, decision: "approve"|"reject" }`
- `POST /api/v1/intelligence/admin/collect` 扩展 body：  
  `{ respect_preflight, llm_select?: true, discover?: false, max_feeds?: number }`  
  - `discover: true` 只跑发现写候选，**不爬新候选**（除非已是 approved）  
  - 默认安全采集：`llm_select=true`，`discover=false`（发现单独按钮，避免一次任务过长）

## 7. 配置

| 变量 | 默认 | 含义 |
|------|------|------|
| `INTELLIGENCE_LLM_SELECT` | `1` | 开启①选题 |
| `INTELLIGENCE_LLM_DISCOVER` | `0` | 开启②需显式打开或 UI 勾选 |
| `INTELLIGENCE_AUTO_PUBLISH` | `0` | 官方源也不再自动上线 |
| `INTELLIGENCE_SELECT_MAX` | `12` | 每轮最多爬几条（可调） |
| `DEEPSEEK_*` | 现有 | 共用 Key；选题/发现用非思考 |

无 Key 时：选题回退启发式；发现跳过 LLM 仅规则抽链（或整段跳过发现）。

## 8. 安全与约束

- 发现链接必须通过 host 白名单；拒绝外链、`javascript:`、非 http(s)。
- 探活失败、robots 全站禁止：行为与现网一致。
- LLM 输出必须 JSON schema 校验；非法则回退，不中断采集。
- 成本：选题/发现用 `thinking: disabled`；每轮限 `max_feeds`。

## 9. 验收标准

1. 关闭自动上线后，新爬条目进待审，用户情报库不可见，直至 approve。  
2. 选题开启时，单轮请求数 ≤ `INTELLIGENCE_SELECT_MAX`，日志可见选中 feedId。  
3. 发现产生的 URL 仅出现在候选池；**未 approve 前不会被爬**。  
4. approve 候选后，下一轮选题可包含该 URL，爬后进待审。  
5. 无 API Key 时采集仍可用（启发式选题）。  
6. Mock/既有 intel 测试不因默认关 auto-publish 而整体红（种子路径保持）。

## 10. 实现分期建议

| 阶段 | 内容 |
|------|------|
| P1 | 关 auto-publish + ① LLM/启发式选题接入 collect/daily |
| P2 | ② 发现 + 候选 store + decide API + 运营 UI |
| P3 | 文案/埋点/回归脚本与文档 |

---

**请审阅本文件。** 确认后进入 `docs/superpowers/plans/` 实现计划，再改代码。
