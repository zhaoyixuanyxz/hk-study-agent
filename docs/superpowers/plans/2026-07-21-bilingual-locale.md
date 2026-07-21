# Bilingual Locale (Phase B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lock `thread.locale` (`zh`|`en`) at create time and inject `[OUTPUT_LOCALE]` into chat / plan / report LLM paths so English customers get English Q&A and deliverables without full UI i18n.

**Architecture:** Add a small `output-locale.js` helper. Persist `locale` + `localeLocked` on threads. Chat, plan, and report generation read the active thread’s locale and append a shared prompt block. Frontend adds a create-time language picker and `preferred_locale` in localStorage; Phase C UI dictionaries are out of scope.

**Tech Stack:** Node.js (ESM), Fastify, existing DeepSeek/OpenAI client, vanilla frontend modules, `node:test`

**Spec:** `docs/superpowers/specs/2026-07-21-bilingual-locale-design.md`

---

## File map

| File | Responsibility |
|------|----------------|
| `backend/src/output-locale.js` | `normalizeLocale`, `buildOutputLocaleBlock`, `resolveThreadLocale` |
| `backend/src/store.js` | `createThread(userId, { locale })` writes `locale` + `localeLocked` |
| `backend/src/promptLayer.js` | Optional `locale` arg on `composeSystemPrompt` |
| `backend/src/agent.js` | Pass locale into system prompt; English mock replies |
| `backend/src/planning-service.js` | Append locale block; English mock plan |
| `backend/src/report-service.js` | Append locale block; English mock report |
| `backend/src/modules/chat-routes.js` | Create/get return locale; PATCH rejects locale change |
| `backend/src/modules/history-routes.js` | List threads include `locale` |
| `backend/src/modules/plan-routes.js` | Resolve locale from `thread_id` (or latest thread) |
| `backend/src/modules/report-routes.js` | Same as plan |
| `backend/src/modules/profile-routes.js` | `full-reset` accepts optional `locale` |
| `backend/tests/v1-bilingual-locale.test.js` | API + helper + mock-path coverage |
| `frontend/src/api/client.js` | `LS_PREFERRED_LOCALE` |
| `frontend/src/pages/chat.js` | Picker + create with locale |
| `frontend/src/copy.js` | Meta line shows language |
| `frontend/src/pages/history.js` | `中` / `EN` badge; new thread with locale |
| `frontend/src/pages/plan.js` / `report.js` | Send `thread_id` on generate |
| `frontend/index.html` | Locale picker markup +「新开会话」按钮 |

---

### Task 1: `output-locale` helper + unit tests

**Files:**
- Create: `backend/src/output-locale.js`
- Create: `backend/tests/v1-bilingual-locale.test.js` (start with helper tests; grow in later tasks)

- [ ] **Step 1: Write failing helper tests**

```js
// backend/tests/v1-bilingual-locale.test.js
import assert from "node:assert";
import { test } from "node:test";
import {
  normalizeLocale,
  buildOutputLocaleBlock,
  resolveThreadLocale,
} from "../src/output-locale.js";

test("normalizeLocale accepts zh/en and defaults unknown to zh", () => {
  assert.equal(normalizeLocale("en"), "en");
  assert.equal(normalizeLocale("zh"), "zh");
  assert.equal(normalizeLocale("EN"), "en");
  assert.equal(normalizeLocale(undefined), "zh");
  assert.equal(normalizeLocale("fr"), "zh");
});

test("buildOutputLocaleBlock en mentions English and JSON user-facing fields", () => {
  const block = buildOutputLocaleBlock("en");
  assert.match(block, /\[OUTPUT_LOCALE\]/);
  assert.match(block, /locale=en/);
  assert.match(block, /English/i);
  assert.match(block, /plain_language_notes/);
});

test("buildOutputLocaleBlock zh asks for Simplified Chinese", () => {
  const block = buildOutputLocaleBlock("zh");
  assert.match(block, /locale=zh/);
  assert.match(block, /简体中文/);
});

test("resolveThreadLocale falls back to zh when missing", () => {
  assert.equal(resolveThreadLocale(null), "zh");
  assert.equal(resolveThreadLocale({}), "zh");
  assert.equal(resolveThreadLocale({ locale: "en" }), "en");
});
```

- [ ] **Step 2: Run tests — expect FAIL (module missing)**

```bash
cd backend
node --test tests/v1-bilingual-locale.test.js
```

Expected: fail to resolve `../src/output-locale.js`

- [ ] **Step 3: Implement helper**

```js
// backend/src/output-locale.js
/**
 * @param {unknown} value
 * @returns {"zh"|"en"}
 */
export function normalizeLocale(value) {
  const v = String(value || "")
    .trim()
    .toLowerCase();
  if (v === "en" || v === "en-us" || v === "en_gb") return "en";
  return "zh";
}

/**
 * @param {"zh"|"en"|string} locale
 * @returns {string}
 */
export function buildOutputLocaleBlock(locale) {
  const loc = normalizeLocale(locale);
  if (loc === "en") {
    return [
      "[OUTPUT_LOCALE]",
      "locale=en",
      "Respond entirely in English. User-facing fields in JSON (summaries, labels,",
      "risk notes, plain_language_notes, report prose, reply) must be English.",
      "Keep school/program official English names; do not invent Chinese.",
    ].join("\n");
  }
  return [
    "[OUTPUT_LOCALE]",
    "locale=zh",
    "请使用简体中文输出全部用户可见内容（含 JSON 中的摘要、标签、风险说明、白话释义、报告正文与 reply）。",
    "院校/项目专有名词可保留官方英文名，必要时括号附中文惯用译名。",
  ].join("\n");
}

/**
 * @param {{ locale?: string } | null | undefined} thread
 * @returns {"zh"|"en"}
 */
export function resolveThreadLocale(thread) {
  return normalizeLocale(thread?.locale);
}
```

- [ ] **Step 4: Re-run tests — expect PASS**

```bash
cd backend
node --test tests/v1-bilingual-locale.test.js
```

- [ ] **Step 5: Commit**

```bash
git add backend/src/output-locale.js backend/tests/v1-bilingual-locale.test.js
git commit -m "feat: add output-locale helper for zh/en prompt blocks"
```

---

### Task 2: Persist `locale` on threads (store + chat API)

**Files:**
- Modify: `backend/src/store.js` (`createThread`)
- Modify: `backend/src/modules/chat-routes.js`
- Modify: `backend/src/modules/history-routes.js`
- Modify: `backend/src/modules/profile-routes.js` (`full-reset`)
- Modify: `backend/tests/v1-bilingual-locale.test.js`

- [ ] **Step 1: Add failing API tests**

Append to `backend/tests/v1-bilingual-locale.test.js`:

```js
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildApp } from "../src/app.js";

function headers(token) {
  return { authorization: `Bearer ${token}` };
}

async function boot() {
  const dir = mkdtempSync(join(tmpdir(), "sa-locale-"));
  const db = join(dir, "db.json");
  writeFileSync(db, JSON.stringify({ users: [], threads: [], messages: [] }), "utf8");
  process.env.DEEPSEEK_API_KEY = "";
  return buildApp({ dataFile: db });
}

test("POST /threads accepts locale=en and GET returns it", async () => {
  const app = await boot();
  const { token } = JSON.parse((await app.inject({ method: "POST", url: "/api/v1/users/register" })).body);
  let r = await app.inject({
    method: "POST",
    url: "/api/v1/threads",
    headers: { ...headers(token), "content-type": "application/json" },
    payload: JSON.stringify({ locale: "en" }),
  });
  assert.equal(r.statusCode, 200, r.body);
  const created = JSON.parse(r.body);
  assert.equal(created.locale, "en");
  r = await app.inject({
    method: "GET",
    url: `/api/v1/threads/${created.thread_id}`,
    headers: headers(token),
  });
  assert.equal(r.statusCode, 200);
  assert.equal(JSON.parse(r.body).locale, "en");
});

test("POST /threads defaults locale to zh", async () => {
  const app = await boot();
  const { token } = JSON.parse((await app.inject({ method: "POST", url: "/api/v1/users/register" })).body);
  const r = await app.inject({ method: "POST", url: "/api/v1/threads", headers: headers(token) });
  assert.equal(JSON.parse(r.body).locale, "zh");
});

test("PATCH cannot change locale (409)", async () => {
  const app = await boot();
  const { token } = JSON.parse((await app.inject({ method: "POST", url: "/api/v1/users/register" })).body);
  const { thread_id } = JSON.parse(
    (
      await app.inject({
        method: "POST",
        url: "/api/v1/threads",
        headers: { ...headers(token), "content-type": "application/json" },
        payload: JSON.stringify({ locale: "zh" }),
      })
    ).body
  );
  const r = await app.inject({
    method: "PATCH",
    url: `/api/v1/threads/${thread_id}`,
    headers: { ...headers(token), "content-type": "application/json" },
    payload: JSON.stringify({ locale: "en" }),
  });
  assert.equal(r.statusCode, 409);
  assert.equal(JSON.parse(r.body).code, "locale_locked");
});

test("history lists locale", async () => {
  const app = await boot();
  const { token } = JSON.parse((await app.inject({ method: "POST", url: "/api/v1/users/register" })).body);
  await app.inject({
    method: "POST",
    url: "/api/v1/threads",
    headers: { ...headers(token), "content-type": "application/json" },
    payload: JSON.stringify({ locale: "en" }),
  });
  const r = await app.inject({ method: "GET", url: "/api/v1/history", headers: headers(token) });
  assert.equal(r.statusCode, 200);
  const body = JSON.parse(r.body);
  assert.equal(body.threads[0].locale, "en");
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
cd backend
node --test tests/v1-bilingual-locale.test.js
```

Expected: create may ignore locale; PATCH may 400 on pinned-only body.

- [ ] **Step 3: Update `createThread` in store**

In `backend/src/store.js`, change signature and body:

```js
createThread(userId, opts = {}) {
  const db = load();
  const id = cryptoRandomId();
  const now = new Date().toISOString();
  const locale =
    String(opts.locale || "")
      .trim()
      .toLowerCase() === "en"
      ? "en"
      : "zh";
  db.threads.push({
    id,
    userId,
    orchestrationState: "init",
    pinned: false,
    locale,
    localeLocked: true,
    createdAt: now,
    updatedAt: now,
  });
  save(db);
  return db.threads.find((t) => t.id === id);
},
```

(Prefer importing `normalizeLocale` from `./output-locale.js` instead of inlining.)

- [ ] **Step 4: Wire chat-routes**

```js
// POST /api/v1/threads
app.post("/api/v1/threads", async (request) => {
  const user = await auth(request);
  const body = request.body && typeof request.body === "object" ? request.body : {};
  const { normalizeLocale } = await import("../output-locale.js");
  // prefer static import at top of file:
  // import { normalizeLocale, resolveThreadLocale } from "../output-locale.js";
  const locale = normalizeLocale(body.locale);
  const t = store.createThread(user.id, { locale });
  return {
    thread_id: t.id,
    orchestration_state: t.orchestrationState,
    locale: resolveThreadLocale(t),
  };
});
```

On `GET /api/v1/threads/:threadId`, add `locale: resolveThreadLocale(t)`.

On `PATCH`, **before** pinned check:

```js
if (Object.prototype.hasOwnProperty.call(body, "locale")) {
  return reply.status(409).send({
    code: "locale_locked",
    message: "会话语言已锁定，请新建会话以切换语言",
  });
}
```

Keep existing pinned behavior when `locale` is absent.

- [ ] **Step 5: History + full-reset**

`history-routes.js` map:

```js
locale: t.locale === "en" ? "en" : "zh",
```

`profile-routes.js` full-reset:

```js
const body = request.body && typeof request.body === "object" ? request.body : {};
const locale = normalizeLocale(body.locale);
const t = store.createThread(user.id, { locale });
// include locale in response alongside thread_id
```

- [ ] **Step 6: Re-run tests — expect PASS**

```bash
cd backend
node --test tests/v1-bilingual-locale.test.js
```

- [ ] **Step 7: Commit**

```bash
git add backend/src/store.js backend/src/modules/chat-routes.js backend/src/modules/history-routes.js backend/src/modules/profile-routes.js backend/tests/v1-bilingual-locale.test.js
git commit -m "feat: persist and lock thread.locale on create"
```

---

### Task 3: Inject `[OUTPUT_LOCALE]` into chat / plan / report

**Files:**
- Modify: `backend/src/promptLayer.js`
- Modify: `backend/src/agent.js`
- Modify: `backend/src/modules/chat-routes.js`
- Modify: `backend/src/planning-service.js`
- Modify: `backend/src/report-service.js`
- Modify: `backend/src/modules/plan-routes.js`
- Modify: `backend/src/modules/report-routes.js`
- Modify: `backend/tests/v1-bilingual-locale.test.js`

- [ ] **Step 1: Failing tests for prompt assembly + mock English chat**

```js
import { composeSystemPrompt } from "../src/promptLayer.js";
import { runProfileAgent } from "../src/agent.js";

test("composeSystemPrompt appends OUTPUT_LOCALE for en", () => {
  const s = composeSystemPrompt("v1", { locale: "en" });
  assert.match(s, /\[OUTPUT_LOCALE\]/);
  assert.match(s, /locale=en/);
});

test("mock agent reply is English when locale=en", async () => {
  const out = await runProfileAgent({
    userMessage: "I want HK taught masters in CS",
    historyOpenai: [],
    useMock: true,
    locale: "en",
  });
  assert.match(out.reply, /[A-Za-z]{3,}/);
  assert.doesNotMatch(out.reply, /判断：|下一步：/);
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
cd backend
node --test tests/v1-bilingual-locale.test.js
```

- [ ] **Step 3: `composeSystemPrompt(version, opts)`**

```js
import { buildOutputLocaleBlock, normalizeLocale } from "./output-locale.js";

export function composeSystemPrompt(version = "v1", opts = {}) {
  // ... existing layer loading unchanged ...
  parts.push("[OUTPUT_FORMAT]\n" + /* existing string */);
  parts.push(buildOutputLocaleBlock(normalizeLocale(opts.locale)));
  return parts.join("\n\n");
}
```

- [ ] **Step 4: Agent**

Add `locale` to `runProfileAgent` params (default `"zh"`).

```js
const system = composeSystemPrompt("v1", { locale });
```

In `useMock` branch, if `normalizeLocale(locale) === "en"`, use English reply/gaps/followups strings, e.g.:

```js
if (turns === 1) {
  reply =
    "Assessment: just starting. Reason: need your target HK schools and taught-master field. Next: which Hong Kong universities/program areas are you considering?";
}
// similarly for turns 2/3; English gaps like "Target HK schools and taught MSc field"
```

- [ ] **Step 5: Chat route passes locale**

```js
const agentOut = await runProfileAgent({
  // ...existing...
  locale: resolveThreadLocale(t),
});
```

- [ ] **Step 6: Plan + report services**

In `generateStructuredPlan(planInputView, opts)`:

```js
import { buildOutputLocaleBlock, normalizeLocale } from "./output-locale.js";

const locale = normalizeLocale(opts.locale);
const system =
  (loadPromptText("plan.txt") ||
    "你是留学规划助手。只输出一个 JSON 对象，不要输出 markdown。") +
  "\n\n" +
  buildOutputLocaleBlock(locale);

if (opts.useMock) {
  const plan = buildMockStructuredPlan(planInputView, opts.intelItems, opts.extKbEntries, { locale });
  return { ok: true, plan };
}
```

Update `buildMockStructuredPlan(..., options = {})` so when `locale === "en"`, labels/summaries/risk notes are English (`Reach` / `Match` / `Safety`, English disclaimer prose). Keep schema keys identical.

Same pattern for `generateHtmlReport` / `buildMockHtmlReport` with `opts.locale`.

- [ ] **Step 7: Plan/report routes resolve locale from thread**

Both generate handlers:

```js
import { normalizeLocale, resolveThreadLocale } from "../output-locale.js";

const body = request.body && typeof request.body === "object" ? request.body : {};
let thread = null;
const threadIdHint = body.thread_id ? String(body.thread_id).trim() : "";
if (threadIdHint) {
  thread = store.getThread(threadIdHint, user.id);
}
if (!thread) {
  const threads = store.listThreadsByUser(user.id);
  thread = threads[0] || null; // list already newest-first if so; else sort by updatedAt desc
}
const locale = resolveThreadLocale(thread);

const gen = await generateStructuredPlan(piv, { /* ... */, locale });
// report: generateHtmlReport(..., { ..., locale })
```

If `listThreadsByUser` is not newest-first, pick `threads` sorted by `updatedAt` descending.

- [ ] **Step 8: Add mock plan English assertion**

```js
import { buildMockStructuredPlan } from "../src/planning-service.js";

test("mock plan uses English labels when locale=en", () => {
  const plan = buildMockStructuredPlan({}, [], [], { locale: "en" });
  assert.equal(plan.tiers.reach.label, "Reach");
  assert.match(plan.risk_summary, /[A-Za-z]{4,}/);
  assert.doesNotMatch(plan.tiers.reach.label, /冲刺/);
});
```

- [ ] **Step 9: Re-run — expect PASS**

```bash
cd backend
node --test tests/v1-bilingual-locale.test.js
```

- [ ] **Step 10: Commit**

```bash
git add backend/src/promptLayer.js backend/src/agent.js backend/src/modules/chat-routes.js backend/src/planning-service.js backend/src/report-service.js backend/src/modules/plan-routes.js backend/src/modules/report-routes.js backend/tests/v1-bilingual-locale.test.js
git commit -m "feat: inject OUTPUT_LOCALE into chat, plan, and report generation"
```

---

### Task 4: Frontend — picker, meta, history badge, generate `thread_id`

**Files:**
- Modify: `frontend/src/api/client.js`
- Modify: `frontend/index.html`
- Modify: `frontend/src/pages/chat.js`
- Modify: `frontend/src/copy.js`
- Modify: `frontend/src/copy.test.js`
- Modify: `frontend/src/pages/history.js`
- Modify: `frontend/src/pages/plan.js`
- Modify: `frontend/src/pages/report.js`
- Modify: `frontend/src/main.js` (full-reset body if needed)

- [ ] **Step 1: Client constant**

```js
// frontend/src/api/client.js
export const LS_PREFERRED_LOCALE = "study_agent_preferred_locale";
```

Also clear it in `clearStoredSession` **or leave it** so language preference survives logout — **leave it** (preferred across sessions).

- [ ] **Step 2: HTML — picker + new-thread button**

Inside `#panel-chat` `.panel-surface--chat`, above `#meta`:

```html
<div id="locale-picker" class="locale-picker hidden" role="dialog" aria-label="Choose session language">
  <p class="locale-picker-lede">选择本会话语言 / Choose language for this session（选定后不可更改）</p>
  <div class="locale-picker-actions">
    <button type="button" id="locale-pick-zh" class="btn btn-primary" data-locale="zh">中文</button>
    <button type="button" id="locale-pick-en" class="btn btn-ghost" data-locale="en">English</button>
  </div>
</div>
```

In chat page-intro actions row (or next to meta), add:

```html
<button type="button" id="btn-new-thread" class="btn btn-ghost btn-tiny">新开会话</button>
```

Add minimal CSS in existing stylesheet (same file the app already uses for `.btn`):

```css
.locale-picker { margin: 0.75rem 0; padding: 0.75rem 0; border-bottom: 1px solid var(--border, #ddd); }
.locale-picker-actions { display: flex; gap: 0.5rem; flex-wrap: wrap; }
.locale-badge { font-size: 0.75rem; opacity: 0.8; margin-left: 0.35rem; }
```

- [ ] **Step 3: `chat.js` — create with locale**

```js
import { api, LS_THREAD, LS_TOKEN, LS_PREFERRED_LOCALE } from "../api/client.js";

function readPreferredLocale() {
  const v = localStorage.getItem(LS_PREFERRED_LOCALE);
  return v === "en" ? "en" : "zh";
}

export async function createThreadWithLocale(locale) {
  const loc = locale === "en" ? "en" : "zh";
  localStorage.setItem(LS_PREFERRED_LOCALE, loc);
  const t = await api("/api/v1/threads", {
    method: "POST",
    body: { locale: loc },
  });
  localStorage.setItem(LS_THREAD, t.thread_id);
  return t;
}

export function showLocalePicker() {
  const box = document.getElementById("locale-picker");
  if (box) box.classList.remove("hidden");
}

export function hideLocalePicker() {
  const box = document.getElementById("locale-picker");
  if (box) box.classList.add("hidden");
}

export async function ensureSession() {
  const token = localStorage.getItem(LS_TOKEN);
  if (!token) throw new Error("请先登录工作台，再继续当前操作。");
  let threadId = localStorage.getItem(LS_THREAD);
  if (!threadId) {
    showLocalePicker();
    // Do not auto-create until user picks; callers that need a thread must wait.
    // For router boot: if preferred exists and picker is optional skip —
    // Spec requires explicit pick on new session. Block send until created.
    return { token, threadId: null, needsLocale: true };
  }
  return { token, threadId, needsLocale: false };
}
```

Wire picker buttons (once on module load or from `main.js`):

```js
async function onLocalePicked(locale) {
  hideLocalePicker();
  const t = await createThreadWithLocale(locale);
  await loadThread(t.thread_id);
}

document.getElementById("locale-pick-zh")?.addEventListener("click", () => onLocalePicked("zh"));
document.getElementById("locale-pick-en")?.addEventListener("click", () => onLocalePicked("en"));

document.getElementById("btn-new-thread")?.addEventListener("click", () => {
  if (!window.confirm("新开会话将锁定新的语言选择；当前会话仍可在历史中打开。继续？")) return;
  localStorage.removeItem(LS_THREAD);
  showLocalePicker();
  const messages = document.getElementById("messages");
  if (messages) messages.innerHTML = "";
  const meta = document.getElementById("meta");
  if (meta) meta.textContent = "请选择新会话语言";
});
```

Update `loadThread` 404 rebuild path:

```js
const t = await createThreadWithLocale(readPreferredLocale());
```

Update send handler in `main.js`: if no `LS_THREAD`, call `showLocalePicker()` and return with status「请先选择会话语言」.

- [ ] **Step 4: `formatThreadMeta`**

```js
export function formatThreadMeta(thread) {
  const id = String(thread?.id || "");
  const shortId = id ? `${id.slice(0, 8)}…` : "待创建";
  const loc = thread?.locale === "en" ? "English" : "中文";
  return `咨询会话 ${shortId} · 语言：${loc} · 当前阶段：${formatFlowState(thread?.orchestration_state)}`;
}
```

Update `frontend/src/copy.test.js` accordingly (expect `语言：中文` when locale absent).

- [ ] **Step 5: History badge + new thread after delete**

When rendering thread row label, append ` · EN` or ` · 中` from `t.locale`.

When creating replacement thread after delete, use:

```js
const { createThreadWithLocale } = await import("./chat.js");
const nt = await createThreadWithLocale(localStorage.getItem(LS_PREFERRED_LOCALE) === "en" ? "en" : "zh");
```

Or show picker if you prefer explicit every time after delete — **use preferred** for delete-rebuild; **show picker** only for `btn-new-thread` and first visit.

- [ ] **Step 6: Plan + report generate send `thread_id`**

Where `api("/api/v1/plans/generate", …)` / reports generate are called, body includes:

```js
body: {
  thread_id: localStorage.getItem(LS_THREAD) || undefined,
  // ...existing fields
}
```

- [ ] **Step 7: Full reset**

```js
body: {
  confirm: true,
  locale: localStorage.getItem(LS_PREFERRED_LOCALE) === "en" ? "en" : "zh",
},
```

- [ ] **Step 8: Manual smoke checklist (no LLM key needed)**

1. Login → chat shows locale picker  
2. Pick English → meta shows `语言：English`  
3. Send message → mock English assistant reply  
4. History shows `EN`  
5. Click 新开会话 → picker again → pick 中文 → Chinese mock  
6. PATCH locale via curl → 409  

- [ ] **Step 9: Commit**

```bash
git add frontend/src/api/client.js frontend/index.html frontend/src/pages/chat.js frontend/src/copy.js frontend/src/copy.test.js frontend/src/pages/history.js frontend/src/pages/plan.js frontend/src/pages/report.js frontend/src/main.js
git commit -m "feat: add session language picker and wire locale to generate APIs"
```

---

### Task 5: Regression + acceptance wrap-up

**Files:**
- Modify: `backend/tests/v1-bilingual-locale.test.js` (any remaining acceptance cases)
- Touch only if broken: `backend/tests/api.test.js` (default locale `zh` assertions optional)

- [x] **Step 1: Run bilingual + core chat/plan suites**

```bash
cd backend
node --test tests/v1-bilingual-locale.test.js tests/api.test.js tests/v1-p1-chat.test.js
```

Expected: all PASS. Fix any createThread arity breaks (call sites that still use `createThread(userId)` remain valid).

- [x] **Step 2: Spec acceptance mapping**

| Spec §9 | Covered by |
|---------|------------|
| Create zh/en, GET locale, cannot modify | Task 2 tests |
| en chat/plan/report English (mock) | Task 3 tests + Task 4 smoke |
| zh unchanged | default path + api.test |
| Switch language = new thread | Task 4 new-thread button |
| Prompt contains `[OUTPUT_LOCALE]` | Task 3 `composeSystemPrompt` test |

- [x] **Step 3: Final commit if any fixups** (N/A — no fixups needed)

```bash
git add -A
git commit -m "test: lock bilingual locale acceptance coverage"
```

---

## Out of scope (Phase C — do not implement here)

- Full UI string catalogs (`zh.json` / `en.json`)
- Intelligence card machine translation
- Mid-thread locale changes
- Duplicate `prompts/v1-en/` pack

---

## Self-review (plan vs spec)

| Spec requirement | Task |
|------------------|------|
| Explicit zh/en at create | Task 2 + 4 |
| Locked locale / 409 | Task 2 |
| Chat + plan + report output language | Task 3 |
| Prompt injection block | Task 1 + 3 |
| Old threads default zh | Task 1 `resolveThreadLocale` + store |
| preferred_locale for rebuild | Task 4 |
| History EN/中 badge | Task 4 |
| Phase C hooks only reserved | noted Out of scope |
