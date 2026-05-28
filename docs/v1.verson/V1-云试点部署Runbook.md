# V1 云试点部署 Runbook

**更新**：2026-05-28（Sprint 7）

## 1. 前置条件

| 项 | 说明 |
|----|------|
| 主机 | Linux x86_64，已安装 Docker 24+ 与 Compose v2 |
| 域名 | 指向网关公网 IP（用户填写，见文末清单） |
| HTTPS | 云负载均衡终止 TLS，或在 `deploy/nginx/gateway.conf` 启用 443 块并挂载证书 |
| 密钥 | `DEEPSEEK_API_KEY`、审核员邮箱等勿提交 Git |

## 2. 首次部署

```bash
# 在仓库根目录
cp .env.production.example .env.production
# 编辑 .env.production（见 §6 用户填写清单）

docker compose -f docker-compose.prod.yml up -d --build
```

默认对外端口：`GATEWAY_HTTP_PORT`（8080）→ 网关 Nginx → `web`（静态）+ `api:8010`。

健康检查：`curl http://127.0.0.1:8080/health`

## 3. 数据与备份

- 持久卷：`app-data` 挂载到容器 `/app/backend/data`（含 `db.json` 与运行时情报数据）。
- 静态种子：`backend/data/intelligence/*.json` 已 bake 进镜像；运行时新条目写入卷内 `db.json`。
- 备份（宿主机 cron 示例，每 6 小时；输出为带时间戳的目录，可再 `tar czf` 归档）：

```bash
cd backend && npm run backup:data -- --out-dir /var/backups/study-abroad
```

## 4. 生产冒烟

```bash
# CI / 本地无公网
cd backend && node scripts/production-smoke.mjs

# 部署后（替换为真实 HTTPS 域名）
PRODUCTION_BASE_URL=https://YOUR_DOMAIN node scripts/production-smoke.mjs
```

全链路手测清单：[V1-主链路QA用例.md](V1-主链路QA用例.md)

## 5. PDF 策略

| 模式 | 配置 | 说明 |
|------|------|------|
| 容器 Chromium | `PDF_DISABLED=0`（默认） | `Dockerfile.backend` 已安装 `chromium` + `PUPPETEER_EXECUTABLE_PATH` |
| 关闭 PDF | `PDF_DISABLED=1` | `GET .../reports/:id/pdf` 返回 501，适合资源受限环境 |

## 6. 需您填写的配置（占位）

| 变量 | 示例 | 用途 |
|------|------|------|
| `CORS_ORIGINS` | `https://study.example.com` | 浏览器 API 跨域白名单 |
| `DEEPSEEK_API_KEY` | `sk-...` | 真实顾问/方案/报告生成 |
| `INTELLIGENCE_REVIEWER_EMAILS` | `ops@yourcorp.com` | 运营审核后台 403 白名单 |
| `GATEWAY_HTTP_PORT` | `8080` 或 `80` | 宿主机映射端口 |
| 域名 DNS A 记录 | — | 指向服务器 IP |
| TLS 证书 | Let's Encrypt 或云证书 | HTTPS（LB 或 Nginx 443） |
| `APP_RATE_LIMIT_MAX` | `120` | 公网试点建议开启 |
| `INTELLIGENCE_FETCH` | `0` / `1` | 是否真实 HTTP 采集 |
| （可选）`PLAN_METRICS_HTTP_TOKEN` | 随机串 | 内部指标端点 |

## 7. 回滚

1. `docker compose -f docker-compose.prod.yml down`
2. 从 `backups/study-abroad-data-*.tar` 恢复 `db.json` 到卷目录
3. 使用上一版镜像 tag 重新 `up -d`

## 8. 情报每日采集（cron）

```bash
0 6 * * * cd /path/to/repo/backend && INTELLIGENCE_FETCH=1 INTELLIGENCE_FETCH_MAX=56 npm run intelligence:daily >> /var/log/intel-daily.log 2>&1
```

首次部署前执行 `npm run intelligence:sync-feeds` 生成 `backend/data/intelligence/*.json`。

## 9. Postgres 预留

本期仍 JSON 单文件；多实例前需迁移 Postgres，见 [V1-存储与Postgres预留.md](V1-存储与Postgres预留.md)（若存在）或路线图 ENG-03。
