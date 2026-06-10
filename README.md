# Synkord

以业务域为单位的契约管理工具。让每个人、每个项目、每个 AI 工具，在任何时候都基于同一份业务数据契约工作。

## 解决什么问题

在多人、多项目的团队中，业务数据定义会悄悄漂移：

- AI 工具生成代码时不知道数据契约，字段名和类型随意
- 某人修改了共享数据结构，依赖方不知道，联调才发现
- 多个项目对同一实体各自理解不同（`userId` vs `user_id` vs `uid`）

## 产品形态

安装后自动启动，独立悬浮窗常驻桌面：

- **首次**：登录 → 加入项目组织
- **日常**：查看当前项目的契约内容、订阅的契约版本状态、变更通知

同时在本地运行 MCP Server，Cursor / Claude Code / Windsurf 等 AI 工具接入后，AI 写代码时自动感知契约。

## 工作原理

```
Synkord App（后台常驻）
├── 悬浮看板（alwaysOnTop 窗口）
├── MCP Server（localhost:3742/mcp）  ← AI 工具接入
└── 文件监听（项目根目录 synkord.json）← 自动感知项目切换
```

## 接入 AI 工具（一次性配置）

**Cursor** — 在 `.cursor/mcp.json` 中添加：

```json
{
  "mcpServers": {
    "synkord": {
      "url": "http://localhost:3742/mcp"
    }
  }
}
```

**Claude Code**：

```bash
claude mcp add synkord http://localhost:3742/mcp
```

## 接入项目（每个项目）

在项目根目录创建 `synkord.json`：

```json
{
  "project": "user-service",
  "consumes": ["auth-pack@^1.x", "order-pack@^2.x"]
}
```

之后打开项目，悬浮窗自动切换显示对应契约。

## IDE 支持

| 功能 | 支持范围 |
|---|---|
| 悬浮看板 | 所有 IDE（IDE 无关） |
| MCP 契约注入 | Cursor、Claude Code、Windsurf、VS Code Copilot、Zed |

## 文档

- [产品设计](docs/product/产品设计.md)
- [开发计划](docs/engineering/开发计划.md)

## 契约格式

契约包为 JSON 文件，样例见 [examples/auth-pack.json](examples/auth-pack.json)，格式规范见 [schemas/contract-v1.json](schemas/contract-v1.json)。
