# 全站 UI 双语（Phase C）设计

**日期**：2026-07-22  
**状态**：已确认（2026-07-22）  
**前置**：Phase B 会话 `locale` 锁定 + LLM 输出语言；会话级档案隔离  
**范围**：用户端壳层 i18n（跟随当前会话语言）；不换前端框架

## 1. 目标

1. **英文会话**时，用户端整站壳层为英文：登录/注册、主导航、对话/画像/方案/报告/历史页标题与主按钮、占位符、以及 `copy.js` 动态文案。
2. **中文会话**保持现网中文体验。
3. 切换会话或新建会话选定语言后，**无需整页刷新**即可切换壳层语言。

## 2. 非目标

- 运营审核后台（admin intelligence）英文化（本期可留中文）
- 情报正文机器翻译（仅优先展示原文标题 / snippet）
- 引入 i18next 等重型库，或维护两套 HTML
- 改变 Phase B 的会话语言锁定规则（换语言仍须新开会话）

## 3. 产品决策（已确认）

| 项 | 选择 |
|----|------|
| 语言跟随 | **A. 跟随当前会话** `thread.locale` |
| 无会话时 | `localStorage.preferred_locale`，默认 `zh` |
| 实现路径 | 轻量 `t()` + `zh`/`en` 文案表 + `data-i18n*` |

## 4. 模块结构

| 路径 | 职责 |
|------|------|
| `frontend/src/i18n/catalogs.js` | `zh` / `en` 键值表 |
| `frontend/src/i18n/index.js` | `getUiLocale` / `setUiLocale` / `t(key)` / `applyUiLocale()` |
| `frontend/src/copy.js` | 动态句改为按当前 UI locale 输出 |
| `frontend/index.html` | 静态节点标注 `data-i18n` / `data-i18n-placeholder` / `data-i18n-aria` |
| `frontend/src/pages/*.js` | 加载会话后调用 `applyUiLocale`；情报英文优先原文 |

## 5. 语言解析

```text
resolveUiLocale():
  if current thread loaded and has locale → thread.locale
  else if preferred_locale in localStorage → that
  else → "zh"
```

`applyUiLocale(locale)`：

1. `normalize` 为 `zh` | `en`
2. 写入内存当前 locale（及必要时同步 `preferred_locale` 仅作无会话默认，**不**改已锁定 thread）
3. `document.documentElement.lang = locale`
4. 扫描并填充所有 `data-i18n*`
5. 触发当前可见面板的动态文案重绘（进度、就绪、阶段名等）

## 6. 刷新时机

1. 登录成功进入工作台  
2. `loadThread` 取得 `thread.locale` 后  
3. 语言选择器创建会话成功后  
4. 历史记录切换会话后  

## 7. 情报展示

- UI locale = `en`：卡片标题优先 `titleOriginal`（或等价原文字段），摘要优先原文 snippet；缺省回退 `titleZh` / 中文摘要  
- UI locale = `zh`：保持现有中文优先逻辑  

## 8. 验收标准

1. 英文会话：导航与五主流程页壳层为英文；`document.documentElement.lang === "en"`  
2. 切回中文会话：壳层恢复中文  
3. 新开会话选 English 后，壳层立即变英文（无需 F5）  
4. `copy.js` 动态文案（建档进度、方案就绪、阶段名等）随 locale 变化  
5. 情报英文模式下有原文则显示原文  
6. 单测：`t()` 键存在；`applyUiLocale('en'|'zh')` 更新 `lang` 与样例节点  

## 9. 分期

- **C1**：i18n 核心 + 登录/导航 + 对话/画像/方案/报告/历史 + `copy.js`  
- **C2**（同迭代交付）：情报原文优先 + 漏网静态句补齐  

## 10. 风险与对策

| 风险 | 对策 |
|------|------|
| 静态句漏翻 | `data-i18n` 清单 + 英文会话目视扫一遍 |
| 动态拼串漏翻 | 统一 `t()` / `copy.js` |
| 后台混用中英 | 本期明确不翻译 admin |
