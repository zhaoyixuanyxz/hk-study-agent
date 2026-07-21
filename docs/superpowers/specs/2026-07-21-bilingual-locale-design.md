# 双语输出（一期 B：对话 + 方案/报告）设计

**日期**：2026-07-21  
**状态**：已确认（2026-07-21）  
**范围**：用户可见 LLM 输出语言（对话 / 方案 / 报告）；不换技术栈  
**路线**：一期 B → 二期 C（整站 UI 双语，另开迭代）

## 1. 目标

1. 新建会话时显式选择 **中文简体 (`zh`)** / **English (`en`)**。
2. 选定后写入 `thread.locale` 并**锁定不可改**；换语言 = 新建 thread。
3. 该会话内：对话回复、方案（plan）、报告（report / PDF 正文）均按 `locale` 输出。
4. 旧数据无 `locale` 时按 `zh` 兼容，不破坏现网中文行为。

## 2. 非目标（一期不做）

- 整站 UI 文案 i18n（导航、按钮、历史页等仍中文）
- 情报条目机器翻译；英文模式仅优先展示已有原文字段（有则用之）
- 中途改语言、按输入自动检测语言、同一份报告中英混出
- 复制整套 `prompts/v1-en/`（除非后续英文质量不足再局部补）

## 3. 产品决策（已确认）

| 项 | 选择 |
|----|------|
| 一期范围 | B：对话 + 方案/报告；二期再做 C：整站 UI |
| 语言选定 | A：显式开关（中文 / English） |
| 中途切换 | B：会话锁定；要换语言开新 thread |
| 实现路径 | 方案 1：`thread.locale` + Prompt 注入 `[OUTPUT_LOCALE]` |

## 4. 数据模型

在现有 `threads` 记录上增加：

| 字段 | 类型 | 说明 |
|------|------|------|
| `locale` | `"zh" \| "en"` | 创建时写入；缺省兼容旧数据视为 `"zh"` |
| `localeLocked` | `true` | 恒为 true；任何试图修改 locale 的请求返回 409 |

API：

- `POST /api/v1/threads`：body 可选 `locale`（默认 `"zh"`）
- `GET` thread / list：回传 `locale`
- 禁止更新 `locale`（无 PATCH 改语言；若有通用 update 接口须拒绝该字段）

前端：`localStorage.preferred_locale` 记住上次选择，供「自动重建 thread」时沿用，但仍写入新 thread 并锁定。

## 5. 数据流

```text
用户新建会话 → 选择 zh | en
        │
        ▼
POST /api/v1/threads { locale }
        │
        ▼
store.createThread(..., locale)  // localeLocked=true
        │
        ├─ 对话回合 ──► 读 thread.locale ──► 注入 [OUTPUT_LOCALE] ──► 回复
        ├─ 方案生成 ──► 同上 ──► plan 用户可见字符串值按 locale
        └─ 报告生成 ──► 同上 ──► report / PDF 正文按 locale
```

JSON **键名与 schema 不变**；仅本地化用户可见字符串值（summary、label、risk_note、plain_language_notes、报告散文等）。

## 6. Prompt 注入

在现有 system/style（及 plan/report 专用 prompt）之后追加统一约束块，由 `thread.locale` 生成：

**`en` 示例：**

```text
[OUTPUT_LOCALE]
locale=en
Respond entirely in English. User-facing fields in JSON (summaries, labels,
risk notes, plain_language_notes, report prose) must be English.
Keep school/program official English names; do not invent Chinese.
```

**`zh` 示例：**

```text
[OUTPUT_LOCALE]
locale=zh
请使用简体中文输出全部用户可见内容（含 JSON 中的摘要、标签、风险说明、白话释义与报告正文）。
院校/项目专有名词可保留官方英文名，必要时括号附中文惯用译名。
```

覆盖路径：

1. 对话（chat / agent）
2. 方案（`planning-service` + `plan.txt`）
3. 报告（`report-service` + `report.txt` → PDF 正文）

## 7. 前端（最小改动）

- 新建会话前展示语言选择：`中文` / `English`（默认中文）
- 选定后 `POST` 带 `locale`，再进入对话
- 会话顶栏只读展示当前语言；**不提供切换控件**
- 历史列表可带小标签 `中` / `EN`
- 一期其余 UI 文案保持中文

## 8. 失败与兼容

| 场景 | 行为 |
|------|------|
| 旧 thread 无 `locale` | 视为 `zh` |
| 试图修改已有 thread 的 locale | 409，提示开新会话 |
| 自动重建 thread（如 404） | 使用 `preferred_locale`，写入新 thread 并锁定 |
| 缺省 `POST` 不带 locale | 默认 `zh` |

## 9. 验收标准

1. 新建会话可选 `zh` / `en`；创建后 `GET` 可见 `locale`，无法修改
2. `en` 会话：助手回复、方案摘要/分档说明、报告正文与 PDF 以英文为主（专有名词用官方英文名）
3. `zh` 会话：行为与现网一致（回归不破坏）
4. 换语言需新开会话；旧中文历史不受影响
5. 单测/冒烟：`createThread` 带 locale；prompt 组装含 `[OUTPUT_LOCALE]`；缺省旧数据视为 `zh`

## 10. 二期 C 挂钩（本期只预留）

- `thread.locale` + `localStorage.preferred_locale` 作为整站 UI 词典初始语言
- 情报展示：`en` 优先 `titleOriginal` / 原文 snippet，缺省回退 `titleZh`
- UI 文案目录（`zh.json` / `en.json`）另开迭代，不阻塞一期

## 11. 风险与对策

| 风险 | 对策 |
|------|------|
| 英文输出偶发夹杂中文 | 约束块写死 + 回归样例抽检 |
| plan/report 用户可见字段漏翻 | 在 plan/report prompt 中点名字段 |
| 外国用户仍看到中文壳层 UI | 一期接受；二期 C 补齐 |
