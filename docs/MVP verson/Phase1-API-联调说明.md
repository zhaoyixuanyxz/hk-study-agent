# Phase 1：API 联调说明

**版本**：v1.3  
**后端**：`backend/`（Node.js + Fastify + JSON 存储）

## 环境变量（项目根目录 `.env`）

| 变量 | 说明 |
|------|------|
| `ENABLE_ACCESS_LOG` | **Phase 5（P5-BE-01）** 设为 `1` 时在 stderr 输出 JSON 行访问日志（方法与路径、状态码、耗时 ms）；未设置或 `0` 则不输出 |
| `APP_RATE_LIMIT_MAX` | **Phase 5（P5-BE-02）** 每 IP 每分钟最大请求数；`0` 或未设置表示**不限流**；超出返回 `429` |
| `DEEPSEEK_API_KEY` | 若为空，则使用 **Mock LLM**（可跑通测试与本地演示，不消耗 token） |
| `DEEPSEEK_BASE_URL` | 默认 `https://api.deepseek.com` |
| `DEEPSEEK_MODEL` | 默认 `deepseek-chat` |
| `PORT` | API 端口，默认 `8010` |
| `CORS_ORIGINS` | 逗号分隔，默认包含 `http://localhost:5180` |
| `PLAN_GENERATION_TIMEOUT_MS` | **Phase 3（P3-BE-03）** 单请求方案模型生成超时，默认 `120000`（120s），合法范围 `5000`–`600000` |
| `REPORT_GENERATION_TIMEOUT_MS` | **Phase 4** 单请求报告模型生成超时，默认 `120000`（120s），合法范围 `5000`–`600000` |
| `PLAN_METRICS_HTTP_TOKEN` | 若设置，则可用 `GET /api/v1/internal/plan-generation/metrics` + 请求头 `X-Plan-Metrics-Token: <值>` 读取进程内方案生成聚合指标（未设置则该路径恒为 404） |

## 启动

```bash
cd backend
npm install
npm start
```

健康检查：`GET http://127.0.0.1:8010/health`

## 前端联调

```bash
cd frontend
npm install
npm run dev
```

Vite 将 `/api`、`/health` **代理**到 `http://127.0.0.1:8010`。浏览器访问 Vite 地址（默认 `http://localhost:5180`），避免 CORS 手动配置。

## 主要端点

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/v1/users/register` | 无密码匿名注册（Phase 1 兼容/测试）；**生产/Phase 5 推荐** `POST /api/v1/auth/register` |
| POST | `/api/v1/auth/register` | 邮箱 + 密码注册，返回 `user_id`、`token` |
| POST | `/api/v1/auth/login` | 邮箱 + 密码登录，返回 `token` |
| POST | `/api/v1/analytics/events` | 埋点批量上报（需 Bearer），见 [Phase5-埋点需求与事件字典.md](Phase5-埋点需求与事件字典.md) |
| POST | `/api/v1/threads` | 创建会话（需 `Authorization: Bearer <token>`） |
| GET | `/api/v1/threads/{id}` | 拉取会话与消息（**中断恢复**） |
| GET | `/api/v1/threads/{id}/messages` | 分页消息列表 |
| POST | `/api/v1/threads/{id}/messages` | 发送用户消息，返回助手回复与 `orchestration_state`、`gaps` 等 |

## 测试

```bash
cd backend
npm test
```

使用独立临时数据库文件与 **Mock LLM**，不依赖外网。

## 超时与重试

生产环境建议在网关或客户端对 `POST .../messages` 配置合理超时与重试；本 MVP 未实现队列。

**方案生成 `POST /api/v1/plans/generate`**：服务端使用 `PLAN_GENERATION_TIMEOUT_MS` 与 `AbortController` 控制单次模型调用超时，失败码见 [Phase3-方案生成链与错误码.md](Phase3-方案生成链与错误码.md)（`GENERATION_TIMEOUT`）。

**报告生成 `POST /api/v1/reports/generate`**：使用 `REPORT_GENERATION_TIMEOUT_MS`（语义同方案）；契约与错误码见 [Phase4-openapi.yaml](Phase4-openapi.yaml)。
