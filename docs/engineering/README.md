# Synkord 工程说明

> 更新：2026-06-10

---

## 项目结构

```
synkord/
├── app/                    # Electron + React 前端
│   ├── electron/           # 主进程（main.ts / preload.ts / mcp.ts / tray.ts / watcher.ts）
│   └── src/
│       ├── lib/            # API 客户端、ide-sync、ws
│       └── pages/          # React 页面组件
├── server/                 # Go 后端
│   ├── cmd/api/            # 入口
│   ├── internal/           # auth / org / contracts / diff / notify / gitstore
│   └── migrations/         # SQL 迁移文件（001~008）
└── docs/
    ├── product/产品设计.md
    └── engineering/README.md（本文件）
```

---

## 启动方式

### 后端

```bash
cd server
# 确保 PostgreSQL 运行（Docker 示例）
docker run -d --name synkord-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=synkord -p 5432:5432 postgres:15

# 运行所有迁移
for f in migrations/*.sql; do
  Get-Content $f | docker exec -i synkord-pg psql -U postgres -d synkord
done

cp .env.example .env   # 按需修改
go run ./cmd/api
```

### 前端

```bash
cd app
pnpm install
pnpm dev
```

---

## 数据库迁移文件

| 文件 | 内容 |
|------|------|
| 001_init.sql | 初始化扩展 |
| 002_users.sql | users + user_git_emails |
| 003_organizations.sql | organizations + org_members + org_invites |
| 004_contract_packs.sql | contract_packs |
| 005_subscriptions.sql | subscriptions（含 pinned_version）+ notifications |
| 006_content_type.sql | contract_packs 加 content_type 列 |
| 007_subscriber_pinned_version.sql | 占位（已合并到 005） |
| 008_subscription_device_info.sql | subscriptions 加 device_info/git_info/project_names/updated_at |

---

## 关键设计决策

### 契约内容格式

契约包内容为**任意文本**。当由多个文件组合时，格式为：

```
# 项目名/相对路径

[文件内容]

---

# 项目名/另一个文件

[文件内容]
```

前端 `ContentViewer` 会解析此格式，渲染为目录树 + 文件内容双栏视图。

### IDE 同步策略

`app/src/lib/ide-sync.ts` 的同步逻辑：

1. 检测 IDE 目录是否存在，只写对应文件
2. 写前比对内容，内容无变化跳过
3. `.synkord/config.json` 始终写入

### 设备注册

应用启动（登录后）自动调用 `POST /api/orgs/:orgId/register-device`，将当前用户注册为该组织所有契约包的使用者，并上报设备信息（OS、hostname、username）和本地项目名。

---

## 待做

- [ ] B3 / F3：飞书 OAuth 登录
