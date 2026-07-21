# LLM Crawl Select + Discover Implementation Plan

> **For agentic workers:** Execute task-by-task. Steps use checkbox syntax.

**Goal:** LLM/heuristic select which approved feeds to crawl each round; same-domain discover into candidate pool with human URL approval before crawl; new crawl content defaults to pending_review.

**Architecture:** Extend intelligence ingestion with `crawl-select.js` and `crawl-discover.js`; store `intelligenceCrawlCandidates`; gate auto-publish via env; wire admin APIs + UI.

**Tech Stack:** Node.js, existing DeepSeek client (non-thinking), Fastify, JSON store

---

### Task 1: P1 select + auto-publish gate
- [x] `crawl-select.js` + tests
- [x] `real-crawler` honor `INTELLIGENCE_AUTO_PUBLISH`
- [x] Wire select into `runIngestion` / admin collect

### Task 2: P2 discover + candidates
- [x] Store candidates CRUD + decide
- [x] `crawl-discover.js` + host allowlist
- [x] Admin APIs + UI

### Task 3: Acceptance tests
- [x] `tests/v1-llm-crawl-select.test.js` covering acceptance 1–6
- [x] Run related intel regression until green
