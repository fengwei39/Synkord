# Synkord MCP 用户使用指南

> 面向使用 Synkord + AI IDE 的开发者。5 分钟内从零接通。

---

## 什么是 Synkord MCP

Synkord 让 Cursor / Claude Desktop / Codex 等 AI IDE **真正理解你的团队 API**：

- 你在 Synkord 里管理 API 定义和数据模型（**契约集**）
- IDE 里的 AI 通过 MCP 协议查询这些契约
- AI 写代码时 **不会瞎编**，参数、字段、返回类型全部基于真实契约

---

## 5 分钟接通

### Step 1: 打开 Synkord 并创建契约集

1. 启动 Synkord 桌面客户端
2. 默认进入 **MCP** 页面
3. 点击 **切换契约集** 下拉 → **创建契约集**
4. 输入契约集名称（如"订单平台"）+ 类型（后端/Web/App）+ 描述

### Step 2: 录入 API 定义

两种方式，二选一：

**方式 A：导入 OpenAPI 文件**（推荐）

1. 进入契约集详情 → 点击 **导入 API**
2. 选择 **上传 OpenAPI / Swagger 文件** 或 **从 URL 拉取**
3. 上传你的 `swagger.json` 或填写 `https://api.xxx.com/swagger.json`
4. 解析后**勾选**需要导入的接口
5. 智能默认排除路径含 `internal` / `debug` / `test` 的接口

**方式 B：手动添加**

1. 在契约集详情 → **接口管理** → **新增接口**
2. 填写路径、方法、参数、返回结构

### Step 3: 启动 MCP

回到 **MCP 页面**：

1. 选择刚创建的契约集作为**活跃契约集**
2. 点击 **启动 MCP**（状态变绿）
3. 在「接入 AI IDE」区域**复制配置**

### Step 4: 配置 IDE

打开你的 IDE：

**Cursor**

- 配置文件：`~/.cursor/mcp.json`
- 粘贴 STDIO 配置

**Claude Desktop**

- 配置文件（macOS）：`~/Library/Application Support/Claude/claude_desktop_config.json`
- 粘贴 STDIO 配置
- 重启 Claude Desktop

**Codex CLI**

- 配置文件：`~/.codex/config.toml`
- 粘贴 TOML 配置

### Step 5: 验证连接

在 IDE 里问 AI：

> "列出我当前契约集的所有 API"

AI 应该返回从你的契约集读取的真实接口列表。如果返回错误，检查：

1. **MCP 状态**：在 Synkord → MCP 页面，应是绿色「运行中」
2. **活跃契约集**：是否选择了正确的契约集
3. **IDE 重启**：配置后必须重启 IDE

---

## 日常使用

### 在 IDE 里让 AI 查询契约

```
"基于订单平台，写一个查询订单列表的 React hook"
"调用 /api/orders 需要哪些参数？"
"Order 这个实体有哪些字段？"
"如果我改了 User 实体，会影响哪些接口？"
```

AI 会自动通过 MCP 查询你的契约集，按真实接口约束生成代码。

### 校验 AI 写的代码

让 AI 写完代码后，自己调用校验：

```
"校验一下你刚才写的代码是否符合契约"
```

AI 会调用 `validate_code_against_contract`，返回可能的问题列表（参数错误、字段名不存在、枚举值非法等）。

### 切换活跃契约集

当你需要在不同项目间切换：

1. 在 Synkord 顶栏点击 **切换契约集▾**
2. 选择目标契约集
3. 切换 < 50ms 生效，AI 下一次查询就用新契约集

无需重启 IDE，无需重启 MCP。

---

## 常见问题

### Q1：AI 在 IDE 里说 "No active contract selected"

**原因**：Synkord 还没设置活跃契约集。
**解决**：在 Synkord → MCP 页面 → 选择契约集 → 点 **设为活跃**。

### Q2：复制配置到 IDE 后没生效

**排查步骤**：
1. 确认配置文件路径正确（不同操作系统不同）
2. 确认 JSON 格式合法（无多余逗号）
3. **重启 IDE**（必须）
4. 在 Synkord → MCP 页面 → 查看访问日志，确认 IDE 是否真的连上了

### Q3：MCP 启动失败

**排查**：
1. 检查端口是否被占用（默认随机）
2. 查看 Synkord 安装目录的日志文件
3. 重启 Synkord 后重试

### Q4：AI 返回的接口在契约集里找不到

**排查**：
1. 在 Synkord → MCP 页面 → **访问日志**，查看 AI 实际查询了哪个契约集
2. 确认活跃契约集就是你想要的那个
3. 让 AI 调用 `list_contracts` 看清楚有哪些可访问的

### Q5：导入 OpenAPI 失败

**排查**：
1. 确认文件是 OpenAPI 3.0 / Swagger 2.0 格式
2. 检查文件是否合法 JSON / YAML
3. 解析错误信息会指出具体行号

---

## 高级

### 跨契约集查询

AI 可以调用 `search_apis_across_contracts` 跨多个契约集搜索。适合需要参考其他项目的接口设计。

### HTTP 模式（远程 IDE）

默认推荐 STDIO 模式。如果 IDE 在另一台机器（如远程开发机），需要用 HTTP 模式：

1. 在 MCP 页面切换到 HTTP Tab
2. 复制 URL 和 Token
3. IDE 配置使用 URL 模式（不是 command）

注意：HTTP 模式只绑 `127.0.0.1`，无法跨机器访问。

### 创建 PAT（高级）

如果需要给外部工具访问 Synkord 数据（不是 MCP），在 **设置 → PAT 管理** 创建 Personal Access Token。

---

## 下一步

- 加入团队成员的契约集：见 [成员管理指南](./mcp-member-guide.md)
- AI prompt 模板：见 [AI Prompt 模板](./mcp-prompt-template.md)