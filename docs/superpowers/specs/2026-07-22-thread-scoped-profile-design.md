# 会话级档案隔离（新会话从零）设计

**日期**：2026-07-22  
**状态**：已确认  
**前置**：双语 Phase B；本项在 Phase C 之前落地  
**产品规则**：新会话 = 档案也从零；打开旧会话仍见该会话进度（选项 A）

## 1. 目标

1. 建档记忆 / 画像快照 / 进度面板 / 语义检索按 **thread** 隔离。
2. 「新开会话」立即清空进度/缺口/报告提示面板（修展示泄漏）。
3. 方案/报告生成使用**当前会话**最新快照，不串用其他会话档案。

## 2. 非目标

- 账号级「清空建档」语义不变（仍可一键清空全部）。
- Phase C 整站 UI i18n。
- 迁移改写历史 `threadId=null` 记忆归属（见兼容）。

## 3. 实现要点

| 点 | 行为 |
|----|------|
| `listMemoriesByThread(userId, threadId)` | 仅该会话记忆 |
| `getLatestProfileSnapshot(userId, threadId?)` | 有 threadId 时只取该会话快照 |
| `searchSemanticChunks` | 可选 `threadId` 过滤 |
| `runPhase2Pipeline` / chat 进度 | 只读当前 thread |
| `plans/reports/generate` | 用 `body.thread_id` 对应快照；无则用最新 thread 的快照 |
| 前端新开会话 | `clearChatAdvisoryPanels()` + 清 messages/meta |

## 4. 兼容

- `threadId` 为空的旧记忆/快照：不进入「新会话」视图；仅当调用方未传 threadId 的遗留路径可再考虑（本迭代生成路径均传 threadId）。
- 打开历史旧会话：用该 `thread_id` 读记忆与快照。

## 5. 验收

1. 新开会话：进度面板空 / 0%；发消息前不出现上一会话缺口文案。
2. 新会话对话累积后进度只反映本会话。
3. 切回旧会话：进度回到该会话水平。
4. 方案生成带 `thread_id` 时基于该会话快照。
