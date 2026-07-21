# DeepSeek V4 Pro Thinking Implementation Plan

> **For agentic workers:** Execute task-by-task. Steps use checkbox syntax.

**Goal:** Switch all live LLM calls to `deepseek-v4-pro`; disable thinking for chat/extraction; enable thinking (`high`) for plan/report.

**Architecture:** Centralize model default + thinking body fields in `deepseek-client.js`; wire four call sites; update env examples.

**Tech Stack:** Node.js, OpenAI SDK (DeepSeek-compatible Chat Completions)

---

### Task 1: Helper module

- [ ] Create `backend/src/deepseek-client.js` with `DEFAULT_DEEPSEEK_MODEL`, `resolveDeepseekModel()`, `buildDeepseekChatBody()`

### Task 2: Wire call sites + env

- [ ] Update `agent.js`, `extraction.js`, `planning-service.js`, `report-service.js`
- [ ] Update route fallbacks in `chat-routes.js`, `plan-routes.js`, `report-routes.js`
- [ ] Update `.env`, `.env.example`, `.env.production.example`

### Task 3: Verify

- [ ] Unit-ish: helper builds correct body
- [ ] Mock smoke: `node scripts/deepseek-regression-smoke.mjs`
- [ ] Live closed-loop with Key preserved across mock→live
