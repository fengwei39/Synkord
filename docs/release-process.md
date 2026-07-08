# Synkord 发布流程

> 本文讲清三件事：**怎么控制版本**、**怎么打 tag**、**怎么生成 release 平台安装包**。
> 面向 maintainer（合并 dev→main + 打 tag + 监控 release workflow）。

## 1. 分支模型

```
feature/* ──┐
           ├─→ dev ──(PR)──→ main ──(tag)──→ v*.*.* ──→ GitHub Release
hotfix/* ──┘
```

| 分支 | 作用 | 触发 |
|---|---|---|
| `feature/*` | 个人功能开发 | PR → dev |
| `dev` | 集成分支 | PR → main（日常）|
| `main` | 稳定分支 | tag 触发 release（按需）|
| `hotfix/*` | 紧急修复 | 直接 PR → main（绕过 dev）|

**节奏**：
- `dev` 上随时合并 feature，CI 跑
- 维护者每周 / 按需 把 dev 合到 main + 打 tag
- 紧急修复：直接从 main 拉 `hotfix/xxx` → PR → 合 main → 打 patch tag

## 2. 版本号规范（SemVer）

`MAJOR.MINOR.PATCH`：

| 级别 | 何时 bump | 示例 |
|---|---|---|
| **MAJOR** | 不兼容的 API 变更 / 破坏性重设计 | 0.x.x → 1.0.0 |
| **MINOR** | 向下兼容的新功能 | 0.1.0 → 0.2.0 |
| **PATCH** | 向下兼容的 bug 修复 | 0.1.0 → 0.1.1 |

预发布：`v0.2.0-rc.1` / `v0.2.0-beta.2`（带 `-` 触发 GitHub 自动标为 pre-release）

## 3. 版本号在仓库的分布

| 文件 | 内容 | 何时改 |
|---|---|---|
| [`VERSION`](../VERSION) | 单一事实源 `0.1.0` | **每次发布必改** |
| [`frontend/package.json`](../frontend/package.json) `version` | 桌面端打包名 | 同步改 |
| `backend/main.go` `var version = "dev"` | 默认值，构建时被 ldflags 覆盖 | **不要改** |
| `synkord-cli/main.go` `var version = "dev"` | 同上 | **不要改** |

为什么后两者不改？
- 在构建时（`.github/workflows/release.yml`）用 `-ldflags "-X main.version=v0.2.0"` 注入
- 避免源码里写死的版本和发布的版本不一致

## 4. 标准发布流程（维护者操作）

### 4.1 准备：合 dev → main

```bash
# 1. 确保本地 main 是最新
git checkout main
git pull origin main

# 2. 合 dev（如有冲突先 rebase）
git merge --no-ff origin/dev
# 或：开 PR：https://github.com/synkord/synkord/compare/main...dev
#     走 PR review → merge → 触发 CI

# 3. CI 跑过 → main 已是合并后的稳定版
```

### 4.2 决定 bump 类型

看 Conventional Commits 累积情况（[release-drafter.yml](../.github/release-drafter.yml) 自动归类）：

| 这次合的 PR 大多是 | bump |
|---|---|
| `feat:` / `enhancement` | `minor` |
| `fix:` / `bug:` / `docs:` | `patch` |
| `feat:` 改了 API 签名 / 删字段 | `major` |

### 4.3 Bump 版本号

```bash
# 三选一
./scripts/bump-version.sh patch     # 0.1.0 → 0.1.1
./scripts/bump-version.sh minor     # 0.1.0 → 0.2.0
./scripts/bump-version.sh major     # 0.1.0 → 1.0.0

# 或直接指定
./scripts/bump-version.sh 0.2.5

# 脚本会同步：
#   - VERSION (单一事实源)
#   - frontend/package.json (electron-builder 读取)
# 后端 / CLI 不改源码，ldflags 注入
```

### 4.4 提交 + 推 tag

```bash
cd /path/to/synkord

# 1. 检查改动
git diff VERSION frontend/package.json
# 应该看到 VERSION 0.1.0 → 0.2.0
#       frontend/package.json version "0.1.0" → "0.2.0"

# 2. 提交
git add VERSION frontend/package.json
git commit -m "chore(release): bump version to 0.2.0"

# 3. 推 main + tag（**关键：必须先 push main，再 push tag**）
git push origin main
git tag v0.2.0
git push origin v0.2.0
```

> ⚠️ **不要先 push tag 再 push main**。`release.yml` 在 tag push 时 checkout 整个仓库，如果 main 不在那个 commit 上，build 出来的产物是错的。

### 4.5 监控 release workflow

```bash
# GitHub 网页上
https://github.com/synkord/synkord/actions/workflows/release.yml

# 大约 5-10 分钟（4 个 job 并行 + 1 个汇总）
# 4 类产物：客户端 macOS / 客户端 Windows / Go 后端 / SQLite 部署包
```

### 4.6 检查 release

```bash
# 1. GitHub Release 页面
https://github.com/synkord/synkord/releases/tag/v0.2.0

# 2. 检查 asset 是否齐全
# - Synkord-*.dmg
# - Synkord-Setup-*-x64.exe
# - synkord-core-linux-amd64
# - synkord-cli-*
# - Synkord-Setup-x64.exe (Windows)
# 注：Docker 镜像不作为 release asset，直接推到 ghcr.io：
#   ghcr.io/synkord/synkord-core:vX.Y.Z / :X.Y.Z / :latest
# - Synkord-x.x.x-arm64.dmg (macOS)
# - Synkord-x.x.x-x64.AppImage + .deb (Linux)
# - checksums.txt

# 3. 验证 SHA256
sha256sum -c checksums.txt

# 4. 验证二进制版本号
./synkord-cli-linux-amd64 version
# → synkord v0.2.0
curl -s http://localhost:8000/health
# → { "version": "v0.2.0", ... }
```

### 4.7 通知社区

```markdown
# 发到 GitHub Discussions Announcements
# 或 Discord / 飞书 / 邮件订阅

🚀 Synkord v0.2.0 已发布！

下载：https://github.com/synkord/synkord/releases/tag/v0.2.0

## 重点
- 新增 XXX 功能 (#123)
- 修复 YYY bug (#456)
- 文档更新：ZZZ

服务端管理员：
  按 deploy/docker/README.md 升级（改 .env 里的 SYNKORD_IMAGE_TAG，docker compose pull && up -d）

完整 changelog：见 release notes
```

## 5. 紧急修复（hotfix）

```bash
# 1. 从 main 拉 hotfix 分支
git checkout main
git pull origin main
git checkout -b hotfix/fix-critical-bug

# 2. 修复 + 提交
git commit -m "fix(backend): critical auth bypass"

# 3. PR 直接合 main（不需要走 dev）
#    GitHub PR: base = main, compare = hotfix/fix-critical-bug

# 4. 合 main 后：
./scripts/bump-version.sh patch   # 0.2.0 → 0.2.1
git add VERSION frontend/package.json
git commit -m "chore(release): hotfix v0.2.1"
git push origin main
git tag v0.2.1
git push origin v0.2.1

# 5. 同步回 dev（避免 dev 缺失 hotfix）
git checkout dev
git merge --no-ff main
git push origin dev
```

## 6. 预发布（RC / Beta）

```bash
./scripts/bump-version.sh 0.3.0-rc.1
git add VERSION frontend/package.json
git commit -m "chore(release): v0.3.0-rc.1"
git push origin main
git tag v0.3.0-rc.1
git push origin v0.3.0-rc.1

# release.yml 自动标为 pre-release（tag 含 '-'）
# GitHub Release UI 上有黄色 "Pre-release" 徽章
# 用户手动 download 时能看到提醒
```

## 7. Release 失败 / 撤销

```bash
# 1. 找到坏 tag
git tag -l "v*"

# 2. 本地 + 远程删除 tag
git tag -d v0.2.0
git push origin :refs/tags/v0.2.0

# 3. 删除 GitHub Release
gh release delete v0.2.0 --yes

# 4. 修复问题，重新走 4.3 - 4.5
```

如已公开错误服务端包，保留问题版本并发布修复版本（例如 `v0.2.1`），在 Release notes 标注 `v0.2.0` 不建议使用。

## 8. 发布 checklist

发布前：
- [ ] `dev → main` PR 已合并
- [ ] CI 在 main 上全绿
- [ ] 决定 bump 类型（patch / minor / major）
- [ ] `dev` 分支的 hotfix 同步回 main

发布时：
- [ ] 跑 `./scripts/bump-version.sh <type>`
- [ ] 检查 `git diff`：VERSION + frontend/package.json
- [ ] `git commit` + `git push origin main`
- [ ] `git tag vX.Y.Z` + `git push origin vX.Y.Z`
- [ ] 监控 GitHub Actions 5-10 分钟
- [ ] 检查 GitHub Release 资产齐全
- [ ] 验证 SHA256 + 二进制版本号

发布后：
- [ ] 通知社区（Discussions / Discord / 邮件）
- [ ] 关闭相关 milestone
- [ ] 合并 dev → main（如果 hotfix 走 main 漏的）

## 9. 自动化增强（未来）

| 工具 | 作用 | 状态 |
|---|---|---|
| [release-please](https://github.com/googleapis/release-please) | Google 出品，自动化 bump + PR | 可选（替换 bump-version.sh）|
| [release-drafter](https://github.com/release-drafter/release-drafter) | 已配：自动起草 release notes | ✅ 已启用 |
| [semantic-release](https://github.com/semantic-release/semantic-release) | 全自动 release | 可选 |
| [renovate](https://github.com/renovatebot/renovate) | 比 Dependabot 更细粒度 | 已用 Dependabot，够用 |

## 10. 相关文档

- [CONTRIBUTING.md](../CONTRIBUTING.md) — 贡献者指南（含提交规范）
- [docs/deployment.md](deployment.md) — 部署方案（CI/CD、桌面端、Go + SQLite）
- [.github/release-drafter.yml](../.github/release-drafter.yml) — release notes 分类规则
- [.github/workflows/release.yml](../.github/workflows/release.yml) — 完整 workflow 源码
- [scripts/bump-version.sh](../scripts/bump-version.sh) — bump 脚本
