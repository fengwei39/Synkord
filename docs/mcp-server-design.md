# MCP Server 设计文档（修订版 v0.2）

> 修订记录：基于 v0.1 审阅，新增 25 处问题修复，详见附录 A。

## 1. 目标

Synkord 提供本地 MCP (Model Context Protocol) 服务，让 IDE/Codex/Claude Code 等 MCP 客户端能够查询 Synkord 项目数据。

**服务目标**：
- 标准化：实现 MCP 协议 `2024-11-05`
- 易用性：用户在 Synkord UI 一键启停
- 安全：本地监听 + 用户身份代理
- 可观测：完整审计日志 + 访问日志

## 2. 架构定位

**MCP Server 是独立于后端的进程**，由 Synkord 桌面应用（Electron）管理生命周期：

```
┌─────────────────────────────────────────────────────────┐
│  Synkord 桌面应用 (Electron, Node.js)                    │
│  ├── UI (React)                                         │
│  └── MCP Server 子进程 (Node.js, 由 Electron fork)       │
│       ├── HTTP 模式   → Cursor/VS Code/JetBrains        │
│       └── STDIO 模式  → 由 IDE 直接 spawn（不走 Electron）│
└─────────────────────────────────────────────────────────┘
```

**关键边界**：
- **不属于后端服务**（Go API 只管用户/团队/项目/接口/数据模型）
- **不替换后端 API**（MCP Server 内部调用后端 API）
- **不存储业务数据**（只代理转发 + 协议转换）
- **不替代 IDE**（只是数据源）

### 2.1 进程模型

| 模式 | 启动方 | 进程所有权 | 生命周期管理 |
|------|--------|-----------|-------------|
| HTTP | Electron fork | Electron 父进程 | Electron 负责 |
| STDIO | IDE spawn | IDE 父进程 | IDE 负责 |

**单实例约束**：一个 Synkord 进程最多启动一个 HTTP 模式 MCP Server。多账户场景需要多个 Synkord 实例。

## 3. 启动方式

用户在 Synkord UI 的 MCP 管理页面手动控制：

| 操作 | UI 入口 | 行为 |
|------|---------|------|
| 启动 | "启动 MCP Server" 按钮 | Electron fork 子进程 |
| 停止 | "停止 MCP Server" 按钮 | 发送 shutdown 信号（5s 超时后 SIGKILL）|
| 重启 | "重启 MCP Server" 按钮 | 停止 + 启动 |
| 状态查看 | 实时显示 | running/port/url |

**异常处理**：
- 进程崩溃：Electron 监听 `exit` 事件，自动重启最多 3 次
- 连续崩溃：UI 显示告警，停止自动重启
- 端口占用：自动尝试 37992、37993...

## 4. 传输模式

### 4.1 协议版本

**支持**：`MCP Protocol 2024-11-05`

通过 `initialize` 方法的 `protocolVersion` 字段协商。后续版本升级需通过 `notifications/protocol_version_changed` 通知。

### 4.2 STDIO 模式

**适用客户端**：Codex、Claude Code、任何支持 stdio 的 MCP 客户端

**启动方**：IDE 直接 `spawn` MCP Server 进程（**不走 Electron**）

**配置文件**（`~/.codex/mcp.json`）：
```json
{
  "mcpServers": {
    "synkord": {
      "command": "node",
      "args": ["<synkord 安装路径>/electron/local-mcp-service.cjs", "stdio"],
      "env": {
        "SYNKORD_API_BASE": "http://127.0.0.1:8000/api"
      },
      "cwd": "/path/to/work"
    }
  }
}
```

**字段约束**：

| 字段 | 必填 | 协议来源 | 说明 |
|------|------|---------|------|
| `command` | ✅ | MCP 标准 | 可执行命令或脚本路径 |
| `args` | ✅ | MCP 标准 | 命令行参数 |
| `env` | ❌ | MCP 标准 | 透传给子进程的环境变量 |
| `cwd` | ❌ | Node.js spawn 扩展 | 工作目录，**不是 MCP 协议字段** |

**内部行为**：
- 启动时读取 `~/.synkord/active-context.json`（轮询间隔 1s）
- 启动时读取 `~/.synkord/user-auth.json`
- 调用后端 API 时携带用户 JWT
- 所有调试日志输出到 **stderr**（**严禁污染 stdout JSON-RPC**）

**注意**：`cwd` 字段是 Node.js `child_process.spawn` 的扩展能力，不是 MCP 协议本身定义的字段。文档需要明确这一点。

### 4.3 Streamable HTTP 模式

**适用客户端**：Cursor、VS Code、JetBrains

**启动方**：Electron fork（用户点击 UI 启动）

**配置文件**（`~/.cursor/mcp.json`）：
```json
{
  "mcpServers": {
    "synkord": {
      "url": "http://127.0.0.1:37991/mcp",
      "headers": {
        "X-Client-Name": "cursor"
      }
    }
  }
}
```

**字段约束**：

| 字段 | 必填 | 协议来源 | 说明 |
|------|------|---------|------|
| `url` | ✅ | MCP 标准 | HTTP 端点 URL |
| `headers` | ❌ | MCP 标准 | 自定义请求头（**仅用于客户端标识，非鉴权**） |

**内部行为**：
- 监听 `127.0.0.1:37991`（**仅本机，不暴露公网**）
- 接收 IDE 的 POST 请求，代理到后端
- SSE 流支持 `Last-Event-ID` 重连
- 访问日志输出到 `~/.synkord/mcp-access.log`（JSON 格式）
- **不需要** Bearer Token 鉴权（仅本机访问 + 用户会话代理）

**SSE 缓冲策略**：
- 内存中保留最近 100 个事件
- 重连时通过 `Last-Event-ID` 补发
- 超过容量或 5 分钟窗口的事件不再补发

## 5. 鉴权设计

### 5.1 IDE ↔ MCP Server

**不需要鉴权**。MCP Server 仅监听 127.0.0.1，外部网络无法访问。

**理由**：
- 127.0.0.1 是本机回环
- 普通应用无 root 权限无法劫持
- 若担心本地恶意应用，可启用 OS 防火墙

### 5.2 MCP Server ↔ Synkord Backend

**使用当前用户 JWT**。从 `~/.synkord/user-auth.json` 读取，HTTP 请求时携带 `Authorization: Bearer <jwt>`。

**降级策略**：
```
内存 userAuth > user-auth.json > 未登录（拒绝所有工具调用）
```

**未登录状态**：
- 启动 MCP Server 成功
- 所有工具调用返回 `UNAUTHORIZED`
- UI 提示"请先在 Synkord 主窗口登录"

### 5.3 审计日志

每次 MCP 工具调用记录到后端 `mcp_audit_logs` 表：

| 字段 | 类型 | 索引 | 说明 |
|------|------|------|------|
| `id` | string(36) | PK | UUID |
| `user_id` | string(36) | ✓ | 当前用户 |
| `team_id` | string(36) | ✓ | 团队 |
| `project_id` | string(36) | ✓ | 项目 |
| `tool_name` | string(128) | ✓ | 工具名 |
| `caller` | string(128) | | `local-mcp` / `cli` / `ide-http` / `ide-stdio` |
| `params_summary` | string(512) | | 参数摘要（脱敏） |
| `result_status` | string(32) | | `success` / `error` |
| `error_message` | string(512) | | 错误信息 |
| `created_at` | timestamp | ✓ | 时间 |

**索引**：
```sql
INDEX idx_audit_user_time (user_id, created_at DESC)
INDEX idx_audit_project_time (project_id, created_at DESC)
```

**保留策略**：默认保留 90 天，可配置。

## 6. 工具集（内置）

| 工具 | 说明 | 权限 |
|------|------|------|
| `get_project_entities` | 查询项目数据模型 | project_member |
| `get_project_apis` | 查询项目 API 列表 | project_member |
| `get_entity_dependencies` | 实体被哪些项目引用 | project_member |
| `get_api_dependencies` | API 被哪些项目引用 | project_member |
| `validate_entity_usage` | 校验代码片段中的实体使用 | project_member |

**权限检查**：后端 `/mcp/query` 路由必须验证用户是项目成员（`team_member` 表）。

**工具注册**：通过 `ToolRegistry` 注册表驱动，支持运行时添加/移除。

## 7. 错误返回格式（统一）

### 7.1 协议层错误（JSON-RPC 标准）

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32601,
    "message": "Method not found"
  }
}
```

**JSON-RPC 标准错误码**：
- `-32700` Parse error
- `-32600` Invalid Request
- `-32601` Method not found
- `-32602` Invalid params
- `-32603` Internal error
- `-32000 ~ -32099` Server error（自定义）

### 7.2 业务层错误（工具返回）

```json
{
  "code": "NOT_FOUND",
  "message": "用户可读消息",
  "details": { "可选上下文" },
  "action": "可选：建议用户下一步操作"
}
```

**业务错误码**：
- `INVALID_ARGS` 参数错误 → action: "检查参数格式"
- `NOT_FOUND` 资源不存在 → action: "确认项目 ID 正确"
- `INTERNAL` 内部错误 → action: "查看日志"
- `UNAUTHORIZED` 未授权 → action: "在 Synkord 主窗口登录"
- `TOOL_NOT_ALLOWED` 工具不允许 → action: "联系管理员"
- `UPSTREAM_FAILURE` 上游失败 → action: "稍后重试"
- `TIMEOUT` 超时 → action: "稍后重试"

## 8. 目录结构

```
frontend/
├── electron/
│   ├── main.cjs              # Electron 入口，管理 MCP Server 生命周期
│   ├── preload.cjs           # 暴露 IPC 给 UI
│   └── local-mcp-service.cjs # MCP Server 实现（STDIO + HTTP 双模式）
└── src/
    └── pages/
        └── MCP.tsx           # UI 控制面板
```

**关键文件职责**：
- `main.cjs`：fork 子进程、转发 IPC、监听退出
- `preload.cjs`：通过 `contextBridge` 暴露受限 API 给 UI
- `local-mcp-service.cjs`：实现 STDIO 和 HTTP 双模式

## 9. 约束与边界

### 9.1 不做的事

- ❌ 不存储任何 Token、用户凭证
- ❌ 不暴露公网监听（仅 127.0.0.1）
- ❌ 不实现用户管理、权限管理（由后端负责）
- ❌ 不做 Token 轮换、撤销（由后端 API 负责）
- ❌ 不在 UI 暴露 Token 明文
- ❌ 不支持多实例并发写 active-context.json

### 9.2 依赖关系

| 依赖 | 强度 | 说明 |
|------|------|------|
| Electron | 强 | 生命周期管理（HTTP 模式） |
| Go 后端 API | 强 | 所有业务数据查询 |
| `active-context.json` | 强 | 项目上下文 |
| `user-auth.json` | 强 | 用户身份凭证 |
| `~/.synkord/` 目录 | 强 | 上述文件所在 |

**缺失依赖时的行为**：
- `active-context.json` 缺失：拒绝服务，提示"请在 Synkord 打开项目"
- `user-auth.json` 缺失：返回 `UNAUTHORIZED`
- 后端 API 不可达：返回 `UPSTREAM_FAILURE`

### 9.3 生命周期

| 阶段 | HTTP 模式 | STDIO 模式 |
|------|----------|----------|
| 启动 | UI 点击 → Electron fork → ready 信号 | IDE spawn → 立即开始 |
| 运行 | 常驻监听 | 常驻 stdin/stdout |
| 停止 | UI 点击 → shutdown(5s) → SIGKILL | 父进程退出 → 自然终止 |
| 项目切换 | IPC 推送新 activeProject，无需重启 | 轮询 active-context.json（1s） |
| 用户切换 | 停止 MCP Server（强制）| 父进程停止（IDE 退出） |
| 异常退出 | 自动重启最多 3 次 | 不处理（IDE 责任） |

**优雅关停超时**：5 秒。超时后发送 SIGKILL。

## 10. 安全考虑

| 风险 | 缓解 | 备注 |
|------|------|------|
| 本地进程被恶意调用 | 仅监听 127.0.0.1 | 操作系统级防护 |
| 凭证泄露 | 不持久化 Token | user-auth.json 权限 0600 |
| 工具滥用 | 后端验证用户必须是项目成员 | team_member 表校验 |
| 日志泄露敏感信息 | 工具参数脱敏 | code_snippet 截断到 32 字符 |
| 跨项目越权 | 每次调用都校验 team_id/project_id | 后端强校验 |
| 配置文件注入 | 字段白名单 + 类型校验 | |
| 文件并发写 | 原子写入（tmp + rename） | |

**文件权限**：
```bash
chmod 600 ~/.synkord/user-auth.json
chmod 600 ~/.synkord/active-context.json
```

## 11. 配置优先级

### 11.1 项目上下文

| 优先级 | 来源 | 用途 |
|--------|------|------|
| 1 | 内存 `activeProject`（IPC 设置） | 实时切换 |
| 2 | `~/.synkord/active-context.json` | 持久化、跨重启 |
| 3 | 环境变量 `SYNKORD_TEAM_ID/PROJECT_ID` | 降级方案 |

### 11.2 用户认证

| 优先级 | 来源 | 用途 |
|--------|------|------|
| 1 | 内存 `userAuth`（IPC 设置） | 实时切换 |
| 2 | `~/.synkord/user-auth.json` | 持久化 |

**JWT 不支持环境变量覆盖**（避免环境注入攻击）。

### 11.3 API Base

| 优先级 | 来源 |
|--------|------|
| 1 | `active-context.json` 中的 `synkord_core_url` |
| 2 | 环境变量 `SYNKORD_API_BASE` |
| 3 | 默认 `http://127.0.0.1:8000/api` |

## 12. 性能与资源限制

| 项目 | 限制 |
|------|------|
| HTTP 单请求超时 | 30 秒 |
| HTTP 最大并发连接 | 100 |
| 工具调用超时 | 30 秒 |
| SSE keepalive 间隔 | 15 秒 |
| 事件缓冲大小 | 100 个事件 |
| 事件保留时间 | 5 分钟 |
| HTTP body 限制 | 4 MB |
| 访问日志轮转 | 100 MB/文件，保留 5 个 |

## 13. 可观测性

### 13.1 访问日志

**路径**：`~/.synkord/mcp-access.log`

**格式**（JSON Lines）：
```json
{"ts":"2024-01-15T10:30:00.123Z","conn":1,"method":"POST","path":"/mcp","status":200,"dur_ms":45,"remote":"127.0.0.1","ua":"Cursor/0.40","rpc":"tools/call"}
```

**字段**：
- `ts`：时间戳（RFC3339 纳秒）
- `conn`：连接 ID（原子递增）
- `method`：HTTP 方法
- `path`：请求路径
- `status`：HTTP 状态码
- `dur_ms`：耗时（毫秒）
- `remote`：客户端 IP
- `ua`：User-Agent
- `rpc`：RPC 方法名（如果有）

### 13.2 调试日志

**输出**：stderr（STDIO 模式）/ stderr 或 `--log-file`（HTTP 模式）

**格式**：
- 文本：`ts LEVEL [prefix] msg key=value key=value`
- JSON：`{"ts":"...","level":"...","msg":"...","key":"value"}`

**注意**：调试日志**严禁**输出到 stdout（避免污染 JSON-RPC）。

### 13.3 Metrics

**端点**：`/metrics`（仅 HTTP 模式）

**指标**：
- `mcp_active_sessions`：活跃会话数
- `mcp_tool_calls_total{tool,status}`：工具调用总数
- `mcp_tool_call_duration_seconds{tool}`：工具调用耗时

**格式**：Prometheus 文本格式

## 14. 进程间通信（IPC）

### 14.1 文件格式

**active-context.json**：
```json
{
  "team_id": "uuid",
  "project_id": "uuid",
  "project_name": "string",
  "synkord_core_url": "http://...",
  "updated_at": "2024-01-15T10:30:00Z"
}
```

**user-auth.json**：
```json
{
  "token": "jwt",
  "user_id": "uuid",
  "user_name": "string",
  "updated_at": "2024-01-15T10:30:00Z"
}
```

### 14.2 原子写入

```javascript
// 1. 写入临时文件
fs.writeFileSync(path + '.tmp', JSON.stringify(data))
// 2. 原子重命名
fs.renameSync(path + '.tmp', path)
```

**读**：直接读，不需要锁（JSON 解析瞬时）。

**写并发**：不支持多进程同时写（单 Synkord 实例假设）。

### 14.3 MCP Server 轮询

**active-context.json**：1 秒间隔
**user-auth.json**：1 秒间隔

**理由**：避免 IPC 复杂度，保持实现简单。

## 15. 兼容性

### 15.1 MCP 协议版本

- **支持**：`2024-11-05`
- **升级策略**：通过 `notifications/protocol_version_changed` 通知

### 15.2 配置文件 schema

```json
{
  "schemaVersion": 1,
  ...
}
```

字段废弃需走 3 步流程：标记 deprecated → 警告 → 移除。

### 15.3 跨平台

- **Windows**：提供 `mcp-server.cmd` 包装器
- **macOS/Linux**：`mcp-server` shell 脚本
- **底层**：Node.js 脚本 `local-mcp-service.cjs`

**推荐配置**（跨平台）：
```json
{
  "command": "node",
  "args": ["<install-path>/electron/local-mcp-service.cjs", "stdio"]
}
```

## 16. 未来扩展

- [ ] 多项目并行（不同终端打开不同项目）
- [ ] 工具调用限流
- [ ] MCP 协议自动升级
- [ ] 工具市场（用户自定义工具）
- [ ] 远程 MCP 模式（带 TLS）
- [ ] WebSocket 传输

---

## 附录 A：v0.1 → v0.2 修订记录

| # | 问题 | 修复 |
|---|------|------|
| 1 | STDIO `cwd` 字段说成"与 MCP 标准对齐" | 明确为 Node.js spawn 扩展字段 |
| 2 | HTTP 示例含 `Authorization` 与 5.1 矛盾 | 删除示例中的鉴权头 |
| 3 | 端口硬编码冲突风险 | 增加端口配置和冲突检测 |
| 4 | 配置优先级不完整 | 扩展为完整决策树 |
| 5 | 异常恢复机制不清晰 | 明确进程模型和恢复策略 |
| 6 | 审计日志字段缺失 | 补充完整字段定义和索引 |
| 7 | SSE 重连细节不足 | 定义缓冲策略 |
| 8 | 访问日志格式未定义 | 给出 JSON Lines 格式 |
| 9 | 工具权限粒度不够 | 明确后端 role 校验 |
| 10 | 错误码缺操作建议 | 增加 `action` 字段 |
| 11 | 进程崩溃重连未定义 | 监听 exit + 自动重启 |
| 12 | 未登录状态未处理 | 明确降级行为 |
| 13 | 进程间通信未明确 | 原子写入 + 轮询策略 |
| 14 | STDIO 与 Electron 关系混淆 | 区分启动方 |
| 15 | 协议版本未声明 | 明确支持 2024-11-05 |
| 16 | 多账户并发未考虑 | 单实例约束 |
| 17 | 版本升级策略缺失 | schemaVersion 字段 |
| 18 | 优雅关停超时未定义 | 5 秒 + SIGKILL |
| 19 | 配置变更处理缺失 | HTTP IPC / STDIO 轮询 |
| 20 | 性能限制缺失 | 给出具体数字 |
| 21 | 可观测性不足 | 访问日志 + metrics |
| 22 | `command` 跨平台差异 | 提供 Node.js 入口 |
| 23 | STDIO 接收上下文变更方式 | 1s 轮询 |
| 24 | 协议错误码与业务错误码混淆 | 明确两层 |
| 25 | 工具列表动态化未说明 | ToolRegistry 驱动 |

## 附录 B：核心约束清单

### B.1 硬性约束（不可违反）

1. **进程归属**：HTTP 模式由 Electron fork，STDIO 模式由 IDE spawn
2. **网络绑定**：仅 `127.0.0.1`，禁止公网
3. **鉴权边界**：MCP Server 端无 Token，调用后端用用户 JWT
4. **不存储凭证**：user-auth.json 由 Electron 维护，MCP Server 只读
5. **错误统一**：所有工具错误使用 7.2 节格式
6. **日志分离**：调试日志到 stderr，**严禁污染 stdout**

### B.2 软性约束（可调整）

1. 端口默认 37991
2. 工具调用超时 30 秒
3. SSE keepalive 15 秒
4. 事件缓冲 100 个
5. 异常退出自动重启 3 次

### B.3 依赖清单

| 依赖 | 必需 | 失败行为 |
|------|------|----------|
| Electron 父进程 | ✅（HTTP 模式） | 无法启动 |
| Go 后端 API | ✅ | 工具调用返回 UPSTREAM_FAILURE |
| `active-context.json` | ✅ | 拒绝服务 |
| `user-auth.json` | ✅ | 工具调用返回 UNAUTHORIZED |
| `~/.synkord/` 目录 | ✅ | 无法启动 |
