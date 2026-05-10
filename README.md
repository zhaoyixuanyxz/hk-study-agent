# 留学规划智能体（MVP）

文档位于 `docs/`。当前可运行代码：**对话建档 API + Phase 2 动态画像与记忆（快照 / planInputView）+ 对话与画像前端**。

## 快速开始

### 1. 环境变量

复制并填写项目根目录 `.env`（勿提交密钥）。`DEEPSEEK_API_KEY` **留空**时，后端使用内置 **Mock LLM**，便于本地跑通与 `npm test`，不消耗 API。

**报告 PDF（V1-P3）**：导出使用 Puppeteer（`cd backend && npm install` 会拉取可用的 Chromium）。可选环境变量：`PUPPETEER_EXECUTABLE_PATH`（指向本机 Chromium/Chrome 可执行文件）、`PDF_DISABLED=1`（关闭 PDF 生成，`GET .../reports/:id/pdf` 返回 501，**推荐 CI 默认开启**以跳过无头浏览器）。

- **可选 PDF 真链路透测**：在**未**设置 `PDF_DISABLED`、且本机可启动 Chromium 时执行 `cd backend && npm run test:v1-p3-pdf-e2e`（脚本会设 `RUN_PDF_E2E=1`，校验响应为 `%PDF` 与 `application/pdf`）。

**分享页跨域**：全局已注册 `@fastify/cors`，匿名 `GET /api/v1/public/reports/:token` 与私有 API 共用 `CORS_ORIGINS`；用户直接在新标签打开同域/代理后的链接时不触发跨域预检。

### 2. 启动后端

```bash
cd backend
npm install
npm start
```

默认 `http://127.0.0.1:8010`（避免与常见 FastAPI 默认 8000 冲突），健康检查：`GET /health`。

### 3. 启动前端（对话 + 画像）

```bash
cd frontend
npm install
npm run dev
```

浏览器打开 Vite 提示的地址（本项目默认 `http://localhost:5180`）。前端通过代理访问 API，无需单独配 CORS。

### 4. 测试

```bash
cd backend
npm test
# V1 回归（P0–P3 串联 + 文档/模板守门）：
npm run test:v1-p3
# V1 回归（P0–P4）
npm run test:v1-p4
# V1 回归（P0–P5）
npm run test:v1-p5
# V1 回归（含 P6 全链路安全与文档守门）
npm run test:v1-p6
```

使用临时数据文件与 Mock LLM，**无需**外网。CI 可对 job 设置 `PDF_DISABLED=1`；若流水线需验证 PDF 二进制，在可运行 Puppeteer 的 runner 上**勿**设 `PDF_DISABLED` 并执行 `cd backend && npm run test:v1-p3-pdf-e2e`。

## Phase 2（已验收）

- 交付物与验收说明：[docs/Phase2-交付物与验收说明.md](docs/Phase2-交付物与验收说明.md)
- OpenAPI：[docs/Phase2-openapi.yaml](docs/Phase2-openapi.yaml)

## Phase 2 API 摘要（需 `Authorization: Bearer <token>`）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/v1/profile` | 最新快照 + planInputView + 记忆列表 |
| GET | `/api/v1/profile/snapshot` | 版本化画像快照 |
| GET | `/api/v1/profile/plan-input` | `planInputView` |
| GET | `/api/v1/profile/memories` | 用户级记忆项 |
| POST | `/api/v1/profile/confirmations/:factId` | 确认事实（如 `fact_target_region`），body 可选 `{ "value": "..." }` |

发消息 `POST /api/v1/threads/:threadId/messages` 的响应中会包含 `profile_snapshot`、`plan_input_view`、`readiness_for_plan`。

## 文档

- V1 决策与发布文档（**推荐入口**）：[docs/v1.verson/README.md](docs/v1.verson/README.md)
- 总进度与阶段：[docs/MVP-完整任务拆分清单.md](docs/MVP-完整任务拆分清单.md)
- Phase 1 联调：[docs/Phase1-API-联调说明.md](docs/Phase1-API-联调说明.md)
- 画像快照契约：[docs/Phase0-画像快照与planInputView契约.md](docs/Phase0-画像快照与planInputView契约.md)

## 技术说明

- **后端**：Node.js + Fastify；数据持久化为 JSON 文件（`backend/data/db.json`，可换目录）。
- **为何未用 Python**：部分 Windows 环境在 Python 3.14 下 `pydantic-core` 需本地编译；当前栈零原生依赖，便于一键跑通。
- **真实模型**：配置 `DEEPSEEK_API_KEY` 后，对话走 DeepSeek 兼容 OpenAI 的 Chat API。
