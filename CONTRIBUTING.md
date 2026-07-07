# Contributing to Synkord

感谢你考虑为 Synkord 做贡献！🎉
Synkord 是开源项目，欢迎任何形式的贡献：代码、文档、bug 反馈、功能建议、翻译。

## 目录

- [行为准则](#行为准则)
- [我能为项目做什么](#我能为项目做什么)
- [开发流程](#开发流程)
- [本地开发环境](#本地开发环境)
- [代码规范](#代码规范)
- [提交规范](#提交规范)
- [Pull Request 流程](#pull-request-流程)
- [发布流程](#发布流程)

## 行为准则

参与社区时，请保持友好和包容。
请阅读 [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)（如有）以了解行为准则。

## 我能为项目做什么

| 类型 | 入口 |
|---|---|
| 🐛 报告 bug | [Issues](../../issues/new?template=bug_report.yml) |
| 💡 提功能建议 | [Issues](../../issues/new?template=feature_request.yml) |
| 📖 改进文档 | 直接提 PR，无需 issue |
| 🌐 翻译 | 暂无 Crowdin，联系维护者认领 |
| 🔧 贡献代码 | 提 PR |
| ⭐ 给项目加 star | 右上角 Star 按钮 |

## 开发流程

1. Fork 仓库
2. 创建分支：`git checkout -b feat/my-feature`
3. 提交代码 + 测试
4. 通过本地 CI 检查（见下）
5. 提 Pull Request
6. 等 review（通常 1-3 个工作日）
7. 合并后自动触发 release workflow

## 本地开发环境

### 准备

- Go 1.25+
- Node.js 20+
- pnpm 9+
- SQLite 3（macOS / Linux 自带，Windows 用 [sqlite3.exe](https://www.sqlite.org/download.html)）

### 启动

```bash
# 1. 后端
cd backend
go mod download
go run .
# → synkord-core starting on :8000

# 2. 前端（另一个终端）
cd frontend
pnpm install
pnpm dev
# → http://localhost:5173

# 3. CLI（可选）
cd synkord-cli
go run . login --server http://localhost:8000
```

首次启动会自动创建 SQLite 数据库 + 默认 admin 账号（`admin / admin123`）。

### 本地 CI 检查

提交前跑一遍（必须全部通过）：

```bash
# 后端
cd backend && go build ./... && go vet ./... && go test -race ./...

# 前端
cd frontend && pnpm exec tsc --noEmit && pnpm build

# CLI
cd synkord-cli && go build ./... && go vet ./... && go test -race ./...
```

CI 在 PR 触发时会自动跑同一套检查，参考 [.github/workflows/ci.yml](.github/workflows/ci.yml)。

## 代码规范

### 后端（Go）

- 遵循 [Effective Go](https://go.dev/doc/effective_go) + [Go Code Review Comments](https://github.com/golang/go/wiki/CodeReviewComments)
- 用 `gofmt` 格式化
- 公共 API 必须有 GoDoc 注释
- 错误处理：返回 `error` 而非 `panic`，用 `fmt.Errorf("...: %w", err)` 包装
- 命名：导出用 PascalCase，私有用 camelCase，常量用 SCREAMING_SNAKE

### 前端（TypeScript + React）

- 遵循 [Airbnb React/JSX Style Guide](https://airbnb.io/javascript/react/)（中文版：[React 风格指南](https://zh-hans.reactjs.org/docs/static-type-checking.html)）
- 组件用函数式 + Hooks，不用 class
- 优先用 antd 组件，不重复造轮子
- Props 接口命名：`XxxProps`，放文件顶部
- 避免 inline function 重复创建（用 useCallback）
- 状态管理：本地 state → useState；跨组件 → Context；全局 → Zustand（暂未引入）

### 文件组织

```
src/
├── api/                # 后端调用封装
├── components/         # 通用组件
├── pages/              # 页面级组件
├── contexts/           # React Context
├── hooks/              # 自定义 Hooks
├── utils/              # 工具函数
├── types/              # TypeScript 类型
└── electron/           # Electron 主进程
```

### Git 提交规范

格式：`<type>(<scope>): <subject>`

| type | 含义 |
|---|---|
| `feat` | 新功能 |
| `fix` | bug 修复 |
| `docs` | 文档变更 |
| `style` | 格式（不影响代码运行）|
| `refactor` | 重构（既不是 feat 也不是 fix）|
| `test` | 添加/修改测试 |
| `chore` | 构建/工具/依赖变更 |
| `ci` | CI 配置变更 |

scope 建议：`backend` / `frontend` / `cli` / `mcp` / `docs` / `electron`

示例：
```
feat(frontend): add data model CRUD in sidebar
fix(backend): handle nil pointer in delete contract
docs: update deployment guide for v0.1.0
```

## Pull Request 流程

1. **先开 issue**（重大改动）：bug fix / 小改动可以直接提 PR
2. **一个 PR 一个事**：避免混合多个不相关的改动
3. **写清楚描述**：
   - 解决了什么问题（关联 issue：`Fixes #123`）
   - 怎么解决的
   - 截图 / 录屏（前端改动）
   - 是否有破坏性变更
4. **保持小**：< 500 行 diff 优先；> 1000 行拆 PR
5. **通过 CI**：所有检查必须绿
6. **响应 review**：48 小时内回应；不活跃 7 天后会被 close

PR 模板会自动加载（[.github/PULL_REQUEST_TEMPLATE.md](.github/PULL_REQUEST_TEMPLATE.md)）。

## 发布流程

详见 [docs/release-process.md](docs/release-process.md)。

我们用 [SemVer](https://semver.org/)：
- **MAJOR**：不兼容的 API 变更
- **MINOR**：向下兼容的新功能
- **PATCH**：向下兼容的 bug 修复

发布步骤（仅维护者）：
1. 合并所有待发布 PR
2. `./scripts/bump-version.sh <patch|minor|major>`
3. `git commit -m "chore(release): bump version to v0.2.0"`
4. `git tag v0.2.0 && git push origin main --tags`
5. [.github/workflows/release.yml](.github/workflows/release.yml) 自动触发：
   - 3 平台后端 / CLI / 桌面端构建
   - Docker 镜像推送 ghcr.io
   - 创建 GitHub Release
6. [release-drafter](.github/release-drafter.yml) 自动起草 release notes（按 PR 标签分类）

## 报告安全问题

**请勿** 在公开 issue 里报告安全漏洞。
请阅读 [SECURITY.md](SECURITY.md) 了解私下报告流程。

## 社区

- GitHub Discussions：功能讨论
- GitHub Issues：bug 跟踪
- 项目主页：https://synkord.dev（待上线）

## 许可

贡献的代码采用 [MIT License](LICENSE)。
