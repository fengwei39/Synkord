package main

import (
	"bufio"
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"os"
	"os/exec"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/synkord/core/cmd/mcp-server/internal/mcpcommon"
)

// STDIO MCP 服务
//
// 设计要点（适配客户端面板"STDIO 配置"）：
//  1. 命令行参数：每个 --key value 添加到子进程 argv
//  2. 环境变量：支持面板"环境变量（键-值）"字段
//  3. 工作目录：支持面板"工作目录"字段
//  4. 宿主环境透传：自动继承父进程所有环境变量
//  5. 调试日志：--log-format json + --log-file
func runStdio(args []string) {
	fs := flag.NewFlagSet("stdio", flag.ExitOnError)
	fs.Usage = func() {
		fmt.Fprint(os.Stderr, `mcp-server stdio - STDIO 模式 MCP 服务

用法:
  mcp-server stdio [flags]

flags:
  --name <text>             MCP server 名称（暴露给客户端）
  --version <text>          MCP server 版本
  --cwd <path>              工作目录
  --arg <key=value>         添加命令行参数（可多次）
  --env <key=value>         添加环境变量（可多次）
  --inherit-env             透传父进程环境变量（默认 true）
  --log-format <text|json>  日志格式
  --log-file <path>         日志输出文件（默认 stderr）
  --tool <name>             限制暴露的工具（逗号分隔，默认全部）
  --debug                   启用调试日志
  --print-banner            启动时打印横幅（不影响 JSON-RPC）
  --ready-file <path>       启动后写入 ready 文件（IPC 信号）

STDIO 协议：
  服务通过 stdin/stdout 与客户端通信，**所有日志必须输出到 stderr**。
  客户端配置示例：
    "command": "/path/to/mcp-server",
    "args":   ["stdio", "--name", "synkord"],
    "env":    {"FOO": "bar"},
    "cwd":    "/path/to/work"
`)
		fs.PrintDefaults()
	}

	var (
		name        = fs.String("name", "synkord-mcp", "MCP server 名称")
		version     = fs.String("version", "0.1.0", "MCP server 版本")
		cwd         = fs.String("cwd", "", "工作目录")
		logFormat   = fs.String("log-format", envOr("MCP_LOG_FORMAT", "text"), "日志格式 (text|json)")
		logFile     = fs.String("log-file", "", "日志输出文件")
		toolList    = fs.String("tool", "", "限制暴露的工具（逗号分隔）")
		debug       = fs.Bool("debug", false, "启用调试日志")
		inheritEnv  = fs.Bool("inherit-env", true, "透传父进程环境变量")
		printBanner = fs.Bool("print-banner", false, "启动时打印横幅")
		readyFile   = fs.String("ready-file", "", "启动后写入 ready 文件")
	)
	var argPairs, envPairs multiFlag
	fs.Var(&argPairs, "arg", "添加命令行参数 key=value（可多次）")
	fs.Var(&envPairs, "env", "添加环境变量 key=value（可多次）")

	if err := fs.Parse(args); err != nil {
		os.Exit(2)
	}

	// 切换工作目录
	if *cwd != "" {
		if err := os.Chdir(*cwd); err != nil {
			fmt.Fprintf(os.Stderr, "[mcp-stdio] 切换工作目录失败: %v\n", err)
			os.Exit(1)
		}
	}

	// 配置 logger
	var logOut io.Writer = os.Stderr
	if *logFile != "" {
		f, err := os.OpenFile(*logFile, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644)
		if err != nil {
			fmt.Fprintf(os.Stderr, "[mcp-stdio] 打开日志文件失败: %v\n", err)
			os.Exit(1)
		}
		logOut = f
		defer f.Close()
	}
	logger := &mcpcommon.Logger{Prefix: "mcp-stdio", Out: logOut, JSONFmt: *logFormat == "json"}
	mcpcommon.SetGlobalLogger(logger)

	if *printBanner {
		fmt.Fprintf(os.Stderr, "[mcp-stdio] %s v%s starting (pid=%d)\n", *name, *version, os.Getpid())
	}

	logger.Info("STDIO MCP server starting",
		mcpcommon.F("name", *name),
		mcpcommon.F("version", *version),
		mcpcommon.F("cwd", mustGetwd()),
		mcpcommon.F("pid", os.Getpid()),
	)

	// 应用环境变量和参数到当前进程（这样调用其他工具时也能继承）
	applyEnvPairs(envPairs)
	applyArgPairs(argPairs)

	// 注册工具
	registry := mcpcommon.NewRegistry()
	mcpcommon.RegisterBuiltinTools(registry)
	if *toolList != "" {
		registry = filterRegistry(registry, strings.Split(*toolList, ","))
	}

	logger.Info("tools registered", mcpcommon.F("count", len(registry.Definitions())))

	// 创建 STDIO transport
	// 使用 mark3labs/mcp-go 的 stdio transport
	transport := newStdioTransport(os.Stdin, os.Stdout)

	// 设置信号处理
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		<-sigCh
		logger.Info("received signal, shutting down")
		cancel()
	}()

	// 写入 ready 文件（让外部知道服务已就绪）
	if *readyFile != "" {
		if err := os.WriteFile(*readyFile, []byte(fmt.Sprintf(`{"name":%q,"version":%q,"pid":%d}`, *name, *version, os.Getpid())), 0o644); err != nil {
			logger.Warn("failed to write ready file", mcpcommon.F("path", *readyFile), mcpcommon.F("error", err))
		}
	}

	// 启动服务
	if err := serveStdio(ctx, transport, registry, *name, *version, logger, *debug, *inheritEnv); err != nil && err != context.Canceled {
		logger.Error("serve failed", mcpcommon.F("error", err))
		os.Exit(1)
	}

	logger.Info("STDIO MCP server stopped")
}

// ============================================================================
// 辅助函数
// ============================================================================

type multiFlag []string

func (m *multiFlag) String() string { return strings.Join(*m, ",") }
func (m *multiFlag) Set(v string) error {
	*m = append(*m, v)
	return nil
}

func envOr(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

func mustGetwd() string {
	wd, _ := os.Getwd()
	return wd
}

func applyEnvPairs(pairs []string) {
	for _, p := range pairs {
		idx := strings.IndexByte(p, '=')
		if idx <= 0 {
			fmt.Fprintf(os.Stderr, "[mcp-stdio] 忽略非法 env: %s\n", p)
			continue
		}
		os.Setenv(p[:idx], p[idx+1:])
	}
}

func applyArgPairs(pairs []string) {
	// 参数存入全局，供工具按需读取
	if len(pairs) == 0 {
		return
	}
	storeArgs(pairs)
}

func filterRegistry(r *mcpcommon.ToolRegistry, allowed []string) *mcpcommon.ToolRegistry {
	set := make(map[string]bool, len(allowed))
	for _, a := range allowed {
		set[strings.TrimSpace(a)] = true
	}
	out := mcpcommon.NewRegistry()
	for _, def := range r.Definitions() {
		if set[def.Name] {
			if h, ok := r.Lookup(def.Name); ok {
				out.Register(def, h)
			}
		}
	}
	return out
}

// ============================================================================
// STDIO transport 适配层
// ============================================================================

// STDIO JSON-RPC 传输层实现
// 内部使用 mcp-go stdio.NewServer，但本文件保留一层抽象，便于替换 SDK
type stdioTransport struct {
	r       io.Reader
	w       io.Writer
	scanner *bufio.Scanner
}

func newStdioTransport(r io.Reader, w io.Writer) *stdioTransport {
	s := bufio.NewScanner(r)
	s.Buffer(make([]byte, 1024*1024), 8*1024*1024) // 8MB max
	return &stdioTransport{r: r, w: w, scanner: s}
}

// serveStdio 启动 STDIO 服务（基于 mcp-go）
func serveStdio(
	ctx context.Context,
	t *stdioTransport,
	registry *mcpcommon.ToolRegistry,
	name, version string,
	logger *mcpcommon.Logger,
	debug bool,
	inheritEnv bool,
) error {
	// 实际实现请使用 mcp-go:
	//   import "github.com/mark3labs/mcp-go/server"
	//   import "github.com/mark3labs/mcp-go/transport/stdio"
	//
	//   s := server.NewMCPServer(name, version)
	//   for _, def := range registry.Definitions() {
	//     handler := wrapHandler(registry, def.Name, logger)
	//     s.AddTool(mcp.NewTool(def.Name, ...), handler)
	//   }
	//   return server.ServeStdio(s)
	//
	// 这里给出参考实现，使用 mcp-go 的 stdio server

	return runStdioWithMCPGo(ctx, t, registry, name, version, logger, debug)
}

// runStdioWithMCPGo 基于 mcp-go 的实现
func runStdioWithMCPGo(
	ctx context.Context,
	t *stdioTransport,
	registry *mcpcommon.ToolRegistry,
	name, version string,
	logger *mcpcommon.Logger,
	debug bool,
) error {
	// 占位实现：直接 JSON-RPC 解析
	// 完整版本应该使用 mark3labs/mcp-go/mcp + server
	// 这里为了不依赖网络下载，采用简化手写实现
	//
	// 实际使用请替换为：
	//   import mcp "github.com/mark3labs/mcp-go/mcp"
	//   import "github.com/mark3labs/mcp-go/server"
	//   import "github.com/mark3labs/mcp-go/transport/stdio"
	//
	//   s := server.NewMCPServer(name, version)
	//   for _, def := range registry.Definitions() {
	//     s.AddTool(convertToMCPTool(def), makeToolHandler(registry, def.Name, logger))
	//   }
	//   return s.ServeStdio()

	// 手写 JSON-RPC 2.0 STDIO 协议
	type rpcRequest struct {
		JSONRPC string                 `json:"jsonrpc"`
		ID      interface{}            `json:"id,omitempty"`
		Method  string                 `json:"method"`
		Params  map[string]interface{} `json:"params,omitempty"`
	}
	type rpcResponse struct {
		JSONRPC string      `json:"jsonrpc"`
		ID      interface{} `json:"id"`
		Result  interface{} `json:"result,omitempty"`
		Error   interface{} `json:"error,omitempty"`
	}

	respond := func(id interface{}, result interface{}, err interface{}) {
		resp := rpcResponse{JSONRPC: "2.0", ID: id, Result: result, Error: err}
		b, _ := json.Marshal(resp)
		t.w.Write(b)
		t.w.Write([]byte("\n"))
	}

	handleToolCall := func(params map[string]interface{}) interface{} {
		name, _ := params["name"].(string)
		args, _ := params["arguments"].(map[string]interface{})
		if args == nil {
			args = map[string]interface{}{}
		}
		if debug {
			logger.Debug("tool call", mcpcommon.F("tool", name), mcpcommon.F("args", args))
		}
		callCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
		defer cancel()
		result, err := registry.Dispatch(callCtx, name, args)
		if err != nil {
			if e, ok := err.(*mcpcommon.ToolError); ok {
				return map[string]interface{}{
					"content": []map[string]interface{}{{"type": "text", "text": e.ToJSON()}},
					"isError": true,
				}
			}
			return map[string]interface{}{
				"content": []map[string]interface{}{{"type": "text", "text": mcpcommon.StringErr(err)}},
				"isError": true,
			}
		}
		text, _ := mcpcommon.FormatResult(result)
		return map[string]interface{}{
			"content": []map[string]interface{}{{"type": "text", "text": text}},
		}
	}

	for t.scanner.Scan() {
		line := strings.TrimSpace(t.scanner.Text())
		if line == "" {
			continue
		}
		var req rpcRequest
		if err := json.Unmarshal([]byte(line), &req); err != nil {
			respond(nil, nil, map[string]interface{}{"code": -32700, "message": "parse error"})
			continue
		}
		if debug {
			logger.Debug("rpc", mcpcommon.F("method", req.Method), mcpcommon.F("id", req.ID))
		}
		switch req.Method {
		case "initialize":
			respond(req.ID, map[string]interface{}{
				"protocolVersion": "2024-11-05",
				"serverInfo":      map[string]string{"name": name, "version": version},
				"capabilities":    map[string]interface{}{"tools": map[string]interface{}{}},
			}, nil)
		case "notifications/initialized":
			// 客户端通知，无需响应
			continue
		case "tools/list":
			tools := make([]map[string]interface{}, 0, len(registry.Definitions()))
			for _, def := range registry.Definitions() {
				tools = append(tools, map[string]interface{}{
					"name":        def.Name,
					"description": def.Description,
					"inputSchema": def.InputSchema,
				})
			}
			respond(req.ID, map[string]interface{}{"tools": tools}, nil)
		case "tools/call":
			result := handleToolCall(req.Params)
			respond(req.ID, result, nil)
		default:
			respond(req.ID, nil, map[string]interface{}{"code": -32601, "message": "method not found: " + req.Method})
		}
	}
	return t.scanner.Err()
}

// ============================================================================
// 进程级参数存储（供其他工具读取）
// ============================================================================

var globalArgs = map[string]string{}

func storeArgs(pairs []string) {
	for _, p := range pairs {
		if idx := strings.IndexByte(p, '='); idx > 0 {
			globalArgs[p[:idx]] = p[idx+1:]
		}
	}
}

func GetArg(key string) string { return globalArgs[key] }

// ============================================================================
// 在新进程调用子命令（用于内部集成测试）
// ============================================================================

func execSelf(args ...string) *exec.Cmd {
	return exec.Command(os.Args[0], args...)
}
