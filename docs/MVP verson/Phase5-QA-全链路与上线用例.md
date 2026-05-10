# Phase 5 QA：全链路与上线用例

**版本**：v1.1  
**对应 Epic**：P5-QA-01、P5-QA-02、P5-QA-03

**路由约定（前端）**：Hash 路由，例如 `#/login`、`#/register`、`#/chat`、`#/profile`、`#/plan`、`#/report`、`#/history`，报告深链 `#/report/<report_id>`；刷新当前页应保持同一路径（Vite dev / 静态部署需将入口回退到 `index.html`）。

## 1. 主链路（P5-QA-01）

| 用例 ID | 步骤 | 期望 |
|---------|------|------|
| P5-TC-01 | 打开应用，进入注册页，注册新邮箱+密码 | 进入对话页（`#/chat`），localStorage 有 token |
| P5-TC-02 | 发送至少一轮对话，打开画像页 | 有快照或加载态符合 Phase 2 |
| P5-TC-03 | 满足就绪后生成方案 | 方案三档与免责展示 |
| P5-TC-04 | 生成报告 | 七章 HTML，字数达标 |
| P5-TC-05 | 打开历史页，点击报告/方案 | 正确跳转并加载 |
| P5-TC-06 | 登出后使用同邮箱登录 | 可看到本人历史数据（thread/plan/report 随用户绑定） |

## 2. 权限与安全（P5-QA-02）

| 用例 ID | 步骤 | 期望 |
|---------|------|------|
| P5-TC-10 | 用户 B 的 token 请求用户 A 的 `report_id` | 404 |
| P5-TC-11 | 无 token 访问 `GET /api/v1/profile` | 401 |

## 3. 性能抽样（P5-QA-03）

| 项 | 方法 | 目标量级（MVP） |
|----|------|-----------------|
| 首屏可交互 | DevTools Performance / 手工秒表 | 可感知 < 3s（局域网） |
| 报告生成 | 从点击到内容展示 | 与 PRD < 2 min 一致（受模型与超时配置影响） |

## 4. 自动化

| 范围 | 位置 |
|------|------|
| API | `backend/tests/api.test.js`（含 auth、analytics 冒烟） |
