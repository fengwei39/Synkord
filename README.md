# Synkord

**架构防腐与数据契约协同平台**

面向 3–10 人核心开发团队的桌面端工具：通过契约库跨项目复用实体标准，强制团队内所有成员及其 AI 工具服从统一数据与接口契约。

> Copilot 让 AI 写得更快，Synkord 让团队里的每个人和 AI **不敢写错**。

## 项目状态

当前处于 **工程开发阶段**，按功能迭代推进。当前迭代：**I1 契约规范落地**。

## 仓库结构

```
synkord/
├── README.md
├── .gitignore
└── docs/
    ├── product/           # 产品设计
    │   └── 产品设计.md
    ├── engineering/       # 工程开发（迭代任务单）
    │   ├── I1-契约规范落地.md   ← 当前迭代
    │   └── iterations.md
    └── archive/           # 历史归档
```

## 文档

| 文档 | 说明 |
|---|---|
| [**产品设计**](./docs/product/产品设计.md) | 产品权威版本（v1.2） |
| [**I1 任务单**](./docs/engineering/I1-契约规范落地.md) | 当前迭代，复制给 Claude Code |
| [迭代路线图](./docs/engineering/iterations.md) | 功能迭代 I1–I15 |
| [文档中心](./docs/README.md) | 全部文档索引 |

## 技术栈（规划）

| 层 | 选型 |
|---|---|
| 桌面壳 | Electron + Node.js |
| 前端 | TypeScript + React + Monaco |
| 内核 | Rust |
| 本地存储 | SQLite |
| 云端协同 | MySQL + WebSocket |

## 仓库地址

```
https://bitbucket.it.starmotor.tech/scm/~fengwei3/synkord.git
```

默认开发分支：`dev`
