# Git 回退指南（香港留学配置方案 agent）

> **给后续对话 / AI 助手**：若用户要求回退到「已保存的稳定基线」，请先阅读本节并执行下方的「一键回退」命令；本项目稳定基线为标签 **`baseline-2026-05-11`**。

---

## 1. 稳定基线是什么

| 项目 | 值 |
|------|-----|
| **标签（推荐用于回退）** | `baseline-2026-05-11` |
| **提交 SHA（完整）** | `76d87b11c2a762237bc71f818265bc8bd540f7c0` |
| **分支** | `master` |
| **说明** | 含本回退文档的稳定基线：`docs: add Git rollback guide for baseline restore`（此前的纯代码首快照为 `9f007c1`，无本文件；回退请以本表 SHA 或标签为准）。 |

回退的目标是：**工作区与 Git 跟踪的文件内容**与该提交一致。

---

## 2. 回退前须知

- **会丢失未提交的修改**：下文「硬回退」会丢弃当前分支上相对基线的本地改动。
- **以下路径通常未被 Git 跟踪**（参见仓库根目录 `.gitignore`），回退**不会删除**磁盘上的本地文件，但可能造成与旧代码不一致：
  - `.env`、`.env.local`
  - `node_modules/`（前后端各自的依赖目录）
  - `frontend/dist/`、`venv/`、`.venv/`
  - `backend/data/`、`data/*.db`
- 若需要保留当前尝试性修改，可先：`git stash push -u -m "backup before rollback"` 或复制整个项目文件夹再回退。

---

## 3. 一键硬回退到基线（最常用）

在**项目根目录**（与 `README.md`、`backend/`、`frontend/` 同级）打开 PowerShell：

```powershell
Set-Location -LiteralPath "c:\Users\zhaoy\Desktop\香港留学配置方案agent"
git fetch --tags 2>$null; git checkout master
git reset --hard baseline-2026-05-11
```

若标签不存在（例如仅克隆了未带 tag 的仓库），可用提交 SHA：

```powershell
git reset --hard 76d87b11c2a762237bc71f818265bc8bd540f7c0
```

---

## 4. 仅查看基线内容（不立刻改当前分支）

```powershell
Set-Location -LiteralPath "c:\Users\zhaoy\Desktop\香港留学配置方案agent"
git switch --detach baseline-2026-05-11
```

看完后再切回开发分支，例如：

```powershell
git switch master
```

---

## 5. 回退后自检

```powershell
git status
git log -1 --oneline
git describe --tags --always
```

期望大致为：工作区干净；最新提交为基线说明；能解析到 `baseline-2026-05-11` 或对应提交。

依赖与构建（若需要重新跑）：

```powershell
cd backend; npm ci
cd ..\frontend; npm ci
```

（若未使用 lockfile 的严格安装，可改用 `npm install`。）

---

## 6. 更新「当前应回退到的版本」

当用户确认某一新版本为新的稳定点时，在根目录执行（示例）：

```powershell
git add -A
git commit -m "chore: describe your milestone"
git tag -a baseline-YYYY-MM-DD -m "新的稳定回退点"
```

并**同步修改本文件**中的标签名、提交 SHA 与日期说明，以便下次对话仍有一份准确索引。

---

## 7. 文件位置

本指南路径（相对仓库根目录）：`Git回退指南.md`
