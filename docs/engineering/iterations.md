# 功能迭代路线图

> 按功能迭代完善开发，不按天排期。每个迭代有明确范围、验收标准、依赖关系。  
> 参考：[产品设计.md](../product/产品设计.md)

---

## 迭代总览

| 迭代 | 主题 | 验收一句话 | 依赖 |
|---|---|---|---|
| **I1** | 契约规范落地 | Schema + 样例包，JSON 合法性可校验 | — |
| **I2** | 有效契约合并 | 项目 imports 契约包，merge 出有效契约 | I1 |
| **I3** | L1 校验（TS） | `synkord check` 拦截缺字段 Interface | I2 |
| **I4** | L1 校验（SQL） | 建表 SQL 与契约一致性校验 | I2 |
| **I5** | CLI 工程化 | 标准报告、exit code、CI 模板 | I3 |
| **I6** | 契约导出 | 导出 MySQL SQL + TS Interface | I2 |
| **I7** | 桌面壳 · 契约库 | App 管理契约包、多项目引用 | I1, I2 |
| **I8** | 桌面壳 · 双栏工作台 | JSON 编辑 + ER 预览 + 内嵌校验 | I7, I3 |
| **I9** | 模型接入 | OpenAI + Ollama，契约注入 | I2, I7 |
| **I10** | Agent 辅助 | AI 起草契约、Level 1 自动修复 | I8, I9 |

**关键路径：** I1 → I2 → I3 → I5（无 UI 即可演示核心价值）

---

## I1 — 契约规范落地

**范围：** JSON Schema、auth-pack 样例、契约 JSON 合法性校验

**验收：**
- [ ] `examples/auth-pack.json` 通过 Schema
- [ ] 故意错误的契约 JSON 被拒绝并给出原因
- [ ] `cargo test` 全部通过

**不做：** merge、代码校验、UI、CLI 完整命令

**任务单：** [I1-契约规范落地.md](./I1-契约规范落地.md)

---

## I2 — 有效契约合并

**范围：** 项目配置（imports/extensions/local_entities）、resolve merge、版本引用

**验收：**
- [ ] 项目引用 auth-pack + 扩展 User 字段 → 有效契约正确
- [ ] 试图修改共享实体已有字段 → 报错
- [ ] 循环依赖检测

**不做：** TS/SQL 校验、UI

**任务单：** [I2-有效契约合并.md](./I2-有效契约合并.md)

---

## I3 — L1 校验（TypeScript）

**范围：** 扫描 `.ts` interface/type，对照有效契约检查字段

**验收：**
- [ ] `fixtures/missing-email.ts` 报错
- [ ] `fixtures/valid-user.ts` 通过
- [ ] 报告含 file、line、rule、message

**CLI：** `synkord check --contract <resolved> --target <dir>`

---

## I4 — L1 校验（SQL）

**范围：** 解析 CREATE TABLE，检查表名/列名/类型

**验收：**
- [ ] 缺列、命名违规 → 报错
- [ ] 合规建表 SQL → 通过

---

## I5 — CLI 工程化

**范围：** JSON 报告格式、exit code 约定、GitHub Actions 模板

**验收：**
- [ ] exit 0/1/2 语义正确
- [ ] CI 中不合规代码导致 check 失败

---

## I6 — 契约导出

**范围：** 有效契约 → MySQL CREATE TABLE + TS interface

**验收：**
- [ ] 导出物可通过 I3/I4 自洽校验

---

## I7 — 桌面壳 · 契约库

**范围：** Electron + React + SQLite，契约包 CRUD、项目引用

**验收：**
- [ ] 两项目共用 auth-pack，重启后数据仍在

---

## I8 — 桌面壳 · 双栏工作台

**范围：** Monaco 编辑 + ER 预览 + 内嵌校验报告

**验收：**
- [ ] 左侧改实体 → 右侧 ER 更新 → 校验结果可见

---

## I9 — 模型接入

**范围：** Model Provider（OpenAI、Ollama），Key 本地加密，契约注入

**验收：**
- [ ] 换模型不影响契约上下文

---

## I10 — Agent 辅助

**范围：** AI 起草契约、Level 1 自动重试修复

**验收：**
- [ ] 需求描述 → 生成合法契约 JSON
- [ ] 违规代码 → 自动重试或明确失败

---

## Phase 2+ 迭代（后续规划）

| 迭代 | 主题 |
|---|---|
| I11 | 云端团队工作区 + 团队契约库 |
| I12 | WebSocket 编辑锁 + 四阶段表决 |
| I13 | 个人 → 团队迁移 |
| I14 | Java/Go/Vue/React 校验与导出 |
| I15 | 团队 Skills + VS Code 插件 |

---

## 迭代原则

1. **每迭代独立可演示**，不依赖「下个迭代才好用」
2. **验收靠 fixtures 测试**，不靠人工读代码
3. **Claude Code 一次只做当前迭代**
4. **合入 dev 再开下一轮**，保持主干可演示
5. **任务单写明 out of scope**，防止范围膨胀
