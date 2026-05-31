# GitHub Pages 静态托管

> 对照 [vibe coding.txt](../vibe%20coding.txt) §7（Git 备份）与 §9（托管形态）：**GitHub 托管源码 ≠ 完整应用上线**。本方案只把 **Vite 前端** 发布到 Pages；**Fastify API、数据库、PDF、情报爬取** 仍需本机 `启动项.bat`、Tailscale 试点或 Docker 云主机（见 [V1-云试点部署Runbook.md](v1.verson/V1-云试点部署Runbook.md)）。

## 你能得到什么

| 项目 | 说明 |
|------|------|
| 访问地址 | `https://<用户>.github.io/<仓库名>/`（用户站点仓库 `<用户>.github.io` 则为根路径 `/`） |
| 自动部署 | push 到 `master`/`main` 触发 [.github/workflows/deploy-github-pages.yml](../.github/workflows/deploy-github-pages.yml) |
| 路由 | Hash 路由（`#/chat`），无需服务端 rewrite |
| 限制 | 无后端时仅静态壳 + 顶部提示条；登录/对话需配置 `VITE_API_BASE` |

## 一次性配置（GitHub 网页）

1. **创建远程仓库**（Private 推荐），本地已 commit 后：
   ```powershell
   git remote add origin https://github.com/<用户>/<仓库名>.git
   git push -u origin master
   ```
2. **Settings → Pages → Build and deployment**
   - Source：**GitHub Actions**（不要选 “Deploy from a branch” 与 Actions 冲突）
3. **Settings → Secrets and variables → Actions → Variables**（推荐）
   - `VITE_API_BASE` = 你的 API 公网根地址，例如 `https://100.x.x.x:8010`（Tailscale）或 `https://study.example.com`（**不要**尾部 `/`）
4. **后端 `.env` / 生产环境** 的 `CORS_ORIGINS` 增加 Pages 地址，例如：
   ```env
   CORS_ORIGINS=http://127.0.0.1:5180,https://<用户>.github.io
   ```
   若 API 与 Pages 同域反代，可只配一个公网 origin。

首次 push 后打开 **Actions** 页查看 `Deploy GitHub Pages`；成功后 Pages 设置页会显示站点 URL。

## 本地验证 Pages 构建

```powershell
cd frontend
npm install
# 将 study-agent 换成你的 GitHub 仓库名
node scripts/build-github-pages.mjs study-agent
npm run preview
```

预览时 API 仍走本机代理（`VITE_API_BASE` 未设）；仅验证资源路径与打包。

## 环境变量

| 变量 | 何时设置 | 含义 |
|------|----------|------|
| `VITE_BASE_PATH` | CI 自动按仓库名计算 | Vite `base`，子路径部署必需 |
| `VITE_API_BASE` | CI Variables 或本地 `.env.production` | 浏览器请求 API 的前缀 |

模板见 [frontend/.env.pages.example](../frontend/.env.pages.example)。

## 与 vibe 部署方案对照

| vibe 方案 | 本 Pages 方案 |
|-----------|----------------|
| 方案 A Tailscale + 本机 API | Pages 前端 + `VITE_API_BASE` 指向 Tailscale IP:8010 |
| 方案 B 云 Docker | Pages 前端 + `VITE_API_BASE` 指向云 Nginx 网关 |
| 仅 Git 备份 | 已完成；Pages 为可选演示入口 |

## 故障排查

| 现象 | 处理 |
|------|------|
| 白屏 / 资源 404 | 确认 Pages 使用 **GitHub Actions**；仓库名与 `VITE_BASE_PATH` 一致（重新跑 workflow） |
| 登录失败 / CORS | 后端 `CORS_ORIGINS` 加入完整 Pages URL（含 `https://`） |
| 顶部黄条「未连接 API」 | 设置仓库 Variable `VITE_API_BASE` 后重新部署 |
| Actions 失败 | 查看 `frontend` 下 `npm ci && npm run build` 日志 |

## 相关命令

```bash
cd frontend && npm test && npm run build:pages
```
