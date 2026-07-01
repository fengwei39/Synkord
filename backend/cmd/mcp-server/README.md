# Synkord MCP Server

`mcp-server` 是 Synkord 项目的 MCP（Model Context Protocol）服务实现，**单二进制 + 双子命令**：

| 子命令 | 模式 | 适配面板字段 |
|--------|------|--------------|
| `stdio` | STDIO 本地模式 | 启动命令、参数、环境变量、工作目录 |
| `http`  | SSE 流式 HTTP 远程模式 | URL、Bearer Token、静态/动态标头 |

## 客户端面板填写模板

### A. STDIO 配置（适配"启动命令/参数/环境变量/工作目录"）

```json
{
  "mcpServers": {
    "synkord": {
      "command": "mcp-server",
      "args": [
        "stdio",
        "--name", "synkord-stdio",
        "--cwd", "${workspaceFolder}",
        "--tool", "echo,env,time_now,reverse",
        "--debug"
      ],
      "env": {
        "SYNKORD_API_BASE": "http://127.0.0.1:8000/api",
        "FOO_BAR": "demo"
      }
    }
  }
}
```

> **字段映射**
> - `command` → 二进制路径
> - `args` → 启动参数（首项 `stdio` 表示子命令）
> - `env` → 透传给子进程的环境变量（默认全部继承父进程）
> - `cwd` → 工作目录

### B. Streamable HTTP 配置（适配"URL/Bearer/标头"）

```json
{
  "mcpServers": {
    "synkord": {
      "url": "http://127.0.0.1:8080/mcp",
      "headers": {
        "Authorization": "Bearer your-secret-token"
      }
    }
  }
}
```

> **字段映射**
> - `url` → `--addr` 监听地址 + `--path` 路径
> - `headers` → `--bearer` 静态 Token / `--header` 静态响应头
> - 动态响应头（来自环境变量）使用 `--header-env X-Trace-Id=TRACE_ID`

## 编译

由于本环境无法访问 `proxy.golang.org`，需要手动下载 Go MCP SDK。

```bash
# 进入项目根目录
cd backend/cmd/mcp-server

# 方式 1：直接 go build
go build -o mcp-server .

# 方式 2：先下载依赖
go get github.com/mark3labs/mcp-go/mcp@latest
go get github.com/mark3labs/mcp-go/server@latest
go get github.com/mark3labs/mcp-go/transport/stdio@latest
go get github.com/mark3labs/mcp-go/transport/http@latest
go build -o mcp-server .

# Windows 编译
go build -o mcp-server.exe .
```

> **说明**：当前实现采用手写 JSON-RPC 2.0 协议（不依赖外部 MCP SDK），可直接 `go build` 编译运行。如果项目统一要求使用 `mark3labs/mcp-go`（更完整的 MCP 协议支持），将 `stdio.go` 和 `http.go` 中手写的 JSON-RPC 解析逻辑替换为对应的 SDK 调用即可（参见代码中的占位注释）。

## 启动

### STDIO 模式

```bash
# 最小启动
mcp-server stdio

# 完整参数
mcp-server stdio \
  --name synkord-stdio \
  --version 0.1.0 \
  --cwd /tmp \
  --tool echo,env,time_now \
  --debug \
  --log-format json
```

### HTTP 模式

```bash
# 最小启动（带静态 Bearer Token）
mcp-server http \
  --addr :8080 \
  --bearer my-secret-token

# 完整参数
mcp-server http \
  --addr :8080 \
  --path /mcp \
  --bearer my-secret-token \
  --bearer-env BEARER_TOKEN_2 \
  --header "X-Powered-By=Synkord" \
  --header-env "X-Trace-Id=TRACE_ID_VAR" \
  --sse-keepalive 15 \
  --access-log /var/log/mcp-access.log \
  --allow-origin "*" \
  --debug
```

## 调试与排错

### STDIO 模式

1. **查看日志**：所有日志输出到 stderr，不会污染 stdout JSON-RPC
   ```bash
   mcp-server stdio --debug 2>debug.log
   ```

2. **手动测试 JSON-RPC**：
   ```bash
   (echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}'; \
    sleep 0.5; \
    echo '{"jsonrpc":"2.0","method":"notifications/initialized"}'; \
    sleep 0.5; \
    echo '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'; \
    sleep 0.5; \
    echo '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"echo","arguments":{"text":"hello"}}}') | mcp-server stdio
   ```

3. **常见错误**：
   - `parse error`：JSON 不合法（注意换行分隔）
   - `method not found`：检查 method 名称（区分大小写）
   - `tool not allowed`：`--tool` 白名单过滤掉了

### HTTP 模式

1. **健康检查**：
   ```bash
   curl http://127.0.0.1:8080/health
   ```

2. **测试 initialize**：
   ```bash
   curl -X POST http://127.0.0.1:8080/mcp \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer my-secret-token" \
     -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}'
   ```

3. **查看访问日志**：`--access-log` 指定的文件，JSON 格式便于聚合

4. **常见错误**：
   - `401 unauthorized`：`--bearer` 未配置或 Token 不匹配
   - `method not allowed`：HTTP 方法非 GET/POST
   - SSE 断流：检查代理是否缓冲（设置 `X-Accel-Buffering: no`）

## 两套服务对比清单

| 维度 | STDIO 模式 | HTTP 模式 |
|------|------------|-----------|
| **传输方式** | stdin/stdout JSON-RPC | HTTP POST + GET (SSE) |
| **认证** | 无（依赖进程隔离） | Bearer Token（静态 + 环境变量） |
| **远程访问** | 不支持 | 支持（任何 HTTP 客户端） |
| **面板字段** | command / args / env / cwd | url / headers |
| **鉴权字段** | N/A | Authorization: Bearer ... |
| **CORS** | N/A | 支持（--allow-origin） |
| **访问日志** | 默认 stderr | 独立文件（JSON 格式） |
| **会话管理** | 无 | Mcp-Session-Id（可选强制） |
| **SSE 推送** | 不支持 | 支持（--sse-keepalive） |
| **SSE 重连** | N/A | Last-Event-ID |
| **环境变量透传** | 默认透传 | 仅 --bearer-env / --header-env |
| **跨平台** | ✓ | ✓ |
| **嵌入式使用** | ✓ | ✗ |
| **多客户端** | ✗ | ✓ |

### 适配面板的能力差异

| 客户端面板字段 | STDIO | HTTP |
|----------------|-------|------|
| 启动命令 | ✅ | — |
| 参数 | ✅（--arg） | — |
| 环境变量 | ✅（--env） | ✅（--header-env） |
| 工作目录 | ✅（--cwd） | — |
| URL | — | ✅ |
| Bearer Token | — | ✅（--bearer / --bearer-env） |
| 标头 | — | ✅（--header / --header-env） |

## 工具列表（内置）

| 工具 | 说明 |
|------|------|
| `echo` | 回显文本（链路测试） |
| `env` | 读取环境变量 |
| `fs_read` | 读取文件（受工作目录限制） |
| `time_now` | 返回当前时间 |
| `reverse` | 反转字符串 |

## 错误返回格式（统一）

```json
{
  "code": "NOT_FOUND",
  "message": "file not found",
  "details": { "path": "/etc/passwd" }
}
```

错误码：
- `INVALID_ARGS`
- `NOT_FOUND`
- `INTERNAL`
- `UNAUTHORIZED`
- `TOOL_NOT_ALLOWED`
- `UPSTREAM_FAILURE`
- `TIMEOUT`

## 文件结构

```
cmd/mcp-server/
├── main.go              # 入口
├── stdio.go             # STDIO 模式
├── http.go              # HTTP SSE 模式
├── internal/
│   └── mcpcommon/
│       ├── errors.go    # 统一错误格式
│       ├── logger.go    # STDIO 调试日志
│       ├── tools.go     # 工具注册表 + 内置工具
│       └── errors_test.go
└── README.md            # 本文档
```
