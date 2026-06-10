# Synkord

以业务域为单位的契约管理工具。让每个人、每个项目、每个 AI 工具，在任何时候都基于同一份业务数据契约工作。

## 核心功能

- **定义契约** — 用 JSON 格式声明业务实体、字段类型、关联关系，存入 Git
- **分发契约** — MCP Server 让 Cursor / Codex 等 AI 工具自动感知契约
- **感知变化** — 契约版本升级时，所有依赖项目收到通知

## 当前状态

> P1 契约格式基础 — 进行中

## 文档

- [产品设计](docs/product/产品设计.md)
- [开发计划](docs/engineering/开发计划.md)

## 仓库结构

```
synkord/
├── schemas/           # 契约 JSON Schema 定义
├── examples/          # 样例契约包
├── packages/          # 源码（待建）
│   ├── contract-core/ # 契约校验库（TypeScript）
│   ├── mcp-server/    # MCP Server
│   ├── app/           # Electron 桌面 App
│   └── cli/           # CLI 工具
└── docs/
    ├── product/       # 产品文档
    └── engineering/   # 工程文档
```

## 快速体验（即将支持）

```bash
# 启动 MCP Server，指向本地契约目录
npx synkord-mcp --dir ./contracts
```

在 Cursor 的 `.cursor/mcp.json` 中添加：

```json
{
  "mcpServers": {
    "synkord": {
      "command": "npx",
      "args": ["synkord-mcp", "--dir", "./contracts"]
    }
  }
}
```
