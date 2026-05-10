# Phase 2：画像与记忆一致性测试用例（P2-QA-01）

**版本**：v1.0  
**对应 Epic**：`P2-QA-01`  
**自动化**：`backend/tests/api.test.js`（Phase 2 相关用例）

---

## 1. 对话后生成画像

| ID | 步骤 | 预期 |
|----|------|------|
| P2-QA-01 | 注册 → 建线程 → 发送含「香港、计算机」等建档信息 | `GET /api/v1/profile/snapshot` 返回非空 `snapshot`，且 `structuredFacts` 或 `summary` 含抽取要点 |

## 2. 跨会话记忆（用户级）

| ID | 步骤 | 预期 |
|----|------|------|
| P2-QA-02 | 同用户新建第二线程，不发消息，仅 `GET /api/v1/profile` | 仍可见第一线程沉淀的画像或记忆（`memories` / `snapshot` 非空） |

## 3. 事实确认

| ID | 步骤 | 预期 |
|----|------|------|
| P2-QA-03 | 对话产生 `target_region` 等事实后，`POST /api/v1/profile/confirmations/fact_target_region`，body `{"value":"香港"}` | 返回 200，`snapshot.confirmationState.facts` 中对应项为 `confirmed` |

## 4. 手工/探索（可选）

| ID | 步骤 | 预期 |
|----|------|------|
| P2-QA-04 | 多轮对话后刷新画像页 | 摘要、缺口、更新时间随对话更新 |
| P2-QA-05 | 对话内待确认卡片点击「确认」 | 与 P2-QA-03 一致，前端状态刷新 |

## 5. 负面与边界

- 用户 A 的 Token 不可访问用户 B 的线程或画像（已有 API 测试覆盖）。
- `DEEPSEEK_API_KEY` 为空时使用 Mock，画像管道仍应落库（自动化依赖 Mock 路径）。
