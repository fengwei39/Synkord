package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"sync/atomic"
	"syscall"
	"time"

	"github.com/synkord/core/cmd/mcp-server/internal/mcpcommon"
)

// HTTP SSE MCP 服务
//
// 设计要点（适配客户端面板"Streamable HTTP 配置"）：
//  1. URL：监听 HTTP 端点
//  2. Bearer Token：Authorization: Bearer <token> 鉴权
//  3. 静态标头：服务端固定返回的 Header
//  4. 动态标头：来自环境变量，服务端返回前注入
//  5. SSE 重连：Last-Event-ID 支持
//  6. 访问日志：每个请求一行
func runHTTP(args []string) {
	fs := flag.NewFlagSet("http", flag.ExitOnError)
	fs.Usage = func() {
		fmt.Fprint(os.Stderr, `mcp-server http - SSE 流式 HTTP 模式 MCP 服务

用法:
  mcp-server http [flags]

flags:
  --name <text>             MCP server 名称
  --version <text>          MCP server 版本
  --addr <addr>             监听地址，例如 :8080 或 127.0.0.1:9000
  --path <path>             MCP 端点路径，默认 /mcp
  --bearer <token>          静态 Bearer Token（可多次）
  --bearer-env <name>       从环境变量读取 Bearer Token（可多次）
  --header <key=value>      静态响应标头（可多次）
  --header-env <key=name>   动态响应标头，从环境变量读取（可多次）
  --sse-keepalive <secs>    SSE keepalive 间隔，默认 15s
  --sse-max-events <n>       单连接最大事件数（0=无限），默认 0
  --access-log <path>       访问日志文件（默认 stderr）
  --log-format <text|json>  日志格式
  --tool <name>             限制暴露的工具（逗号分隔）
  --allow-origin <origin>   CORS 允许的 Origin（可多次）
  --debug                   启用调试日志
  --require-session         强制要求 Mcp-Session-Id
  --ready-file <path>       启动后写入 ready 文件

客户端配置示例：
  "url": "http://127.0.0.1:8080/mcp",
  "headers": {
    "Authorization": "Bearer my-token"
  }
`)
		fs.PrintDefaults()
	}

	var (
		name        = fs.String("name", "synkord-mcp", "MCP server 名称")
		version     = fs.String("version", "0.1.0", "MCP server 版本")
		addr        = fs.String("addr", ":8080", "监听地址")
		path        = fs.String("path", "/mcp", "MCP 端点路径")
		logFormat   = fs.String("log-format", envOr("MCP_LOG_FORMAT", "text"), "日志格式")
		accessLog   = fs.String("access-log", "", "访问日志文件（默认 stderr）")
		toolList    = fs.String("tool", "", "限制暴露的工具（逗号分隔）")
		debug       = fs.Bool("debug", false, "启用调试日志")
		keepAlive   = fs.Int("sse-keepalive", 15, "SSE keepalive 间隔（秒）")
		maxEvents   = fs.Int("sse-max-events", 0, "单连接最大事件数（0=无限）")
		requireSess = fs.Bool("require-session", false, "强制要求 Mcp-Session-Id")
		readyFile   = fs.String("ready-file", "", "启动后写入 ready 文件")
	)
	var bearerTokens, bearerEnvVars, headerPairs, headerEnvPairs, allowOrigins multiFlag
	fs.Var(&bearerTokens, "bearer", "静态 Bearer Token（可多次）")
	fs.Var(&bearerEnvVars, "bearer-env", "从环境变量读取 Bearer Token（可多次）")
	fs.Var(&headerPairs, "header", "静态响应标头 key=value（可多次）")
	fs.Var(&headerEnvPairs, "header-env", "动态响应标头 key=ENV_NAME（可多次）")
	fs.Var(&allowOrigins, "allow-origin", "CORS 允许的 Origin（可多次）")

	if err := fs.Parse(args); err != nil {
		os.Exit(2)
	}

	// 配置 logger
	var logOut io.Writer = os.Stderr
	var accessOut io.Writer = os.Stderr
	if *accessLog != "" {
		f, err := os.OpenFile(*accessLog, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644)
		if err != nil {
			fmt.Fprintf(os.Stderr, "[mcp-http] 打开访问日志失败: %v\n", err)
			os.Exit(1)
		}
		accessOut = f
		defer f.Close()
	}
	logger := &mcpcommon.Logger{Prefix: "mcp-http", Out: logOut, JSONFmt: *logFormat == "json"}
	mcpcommon.SetGlobalLogger(logger)
	accessLogger := &mcpcommon.Logger{Prefix: "mcp-access", Out: accessOut, JSONFmt: true}

	// 收集所有合法的 Bearer Token
	allowedTokens := collectAllowedTokens(bearerTokens, bearerEnvVars)
	if len(allowedTokens) == 0 {
		logger.Warn("未配置任何 Bearer Token，服务将以开放模式运行（仅限内网/调试）")
	}

	// 静态响应标头
	staticHeaders := parseKeyValuePairs(headerPairs)
	dynamicHeaders := parseHeaderEnvPairs(headerEnvPairs)

	// 收集允许的 Origin
	allowedOrigins := make(map[string]bool, len(allowOrigins))
	for _, o := range allowOrigins {
		allowedOrigins[o] = true
	}

	// 注册工具
	registry := mcpcommon.NewRegistry()
	mcpcommon.RegisterBuiltinTools(registry)
	if *toolList != "" {
		registry = filterRegistry(registry, strings.Split(*toolList, ","))
	}

	logger.Info("HTTP MCP server starting",
		mcpcommon.F("name", *name),
		mcpcommon.F("version", *version),
		mcpcommon.F("addr", *addr),
		mcpcommon.F("path", *path),
		mcpcommon.F("tools", len(registry.Definitions())),
		mcpcommon.F("bearer_tokens", len(allowedTokens)),
	)

	// 创建 HTTP server
	mux := http.NewServeMux()
	srv := &http.Server{
		Addr:              *addr,
		Handler:           mux,
		ReadHeaderTimeout: 10 * time.Second,
	}

	// 健康检查
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"status":"ok"}`)
	})

	// MCP 端点
	mcpHandler := &mcpHTTPHandler{
		registry:        registry,
		path:            *path,
		name:            *name,
		version:         *version,
		logger:          logger,
		accessLogger:    accessLogger,
		allowedTokens:   allowedTokens,
		staticHeaders:   staticHeaders,
		dynamicHeaders:  dynamicHeaders,
		allowedOrigins:  allowedOrigins,
		keepAlive:       time.Duration(*keepAlive) * time.Second,
		maxEvents:       *maxEvents,
		requireSession:  *requireSess,
		debug:           *debug,
	}
	mux.Handle(*path, mcpHandler)

	// 信号处理
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		<-sigCh
		logger.Info("received signal, shutting down")
		shutdownCtx, c := context.WithTimeout(context.Background(), 5*time.Second)
		defer c()
		_ = srv.Shutdown(shutdownCtx)
	}()

	// 启动
	listener, err := net.Listen("tcp", *addr)
	if err != nil {
		logger.Error("listen failed", mcpcommon.F("error", err))
		os.Exit(1)
	}
	actualAddr := listener.Addr().String()
	logger.Info("listening", mcpcommon.F("addr", actualAddr))

	// 写入 ready 文件
	if *readyFile != "" {
		_ = os.WriteFile(*readyFile, []byte(fmt.Sprintf(`{"name":%q,"version":%q,"addr":%q,"path":%q}`, *name, *version, actualAddr, *path)), 0o644)
	}

	if err := srv.Serve(listener); err != nil && err != http.ErrServerClosed {
		logger.Error("serve failed", mcpcommon.F("error", err))
		os.Exit(1)
	}
	<-ctx.Done()
	logger.Info("HTTP MCP server stopped")
}

// ============================================================================
// HTTP Handler
// ============================================================================

type mcpHTTPHandler struct {
	registry       *mcpcommon.ToolRegistry
	path           string
	name           string
	version        string
	logger         *mcpcommon.Logger
	accessLogger   *mcpcommon.Logger
	allowedTokens  map[string]bool
	staticHeaders  map[string]string
	dynamicHeaders map[string]string // header -> env var name
	allowedOrigins map[string]bool
	keepAlive      time.Duration
	maxEvents      int
	requireSession bool
	debug          bool

	connCounter uint64 // 原子递增
}

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

func writeJSONError(w http.ResponseWriter, status int, e *mcpcommon.ToolError) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"error": e.ToJSON(),
	})
}

func (h *mcpHTTPHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	start := time.Now()
	connID := atomic.AddUint64(&h.connCounter, 1)
	method := r.Method

	// CORS
	origin := r.Header.Get("Origin")
	if origin != "" && (len(h.allowedOrigins) == 0 || h.allowedOrigins[origin] || h.allowedOrigins["*"]) {
		w.Header().Set("Access-Control-Allow-Origin", origin)
		w.Header().Set("Vary", "Origin")
		w.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, Mcp-Session-Id, Last-Event-ID")
	}
	if method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		h.logAccess(r, start, connID, http.StatusNoContent, "")
		return
	}

	// 鉴权
	if !h.checkAuth(r) {
		h.logger.Warn("unauthorized", mcpcommon.F("conn", connID), mcpcommon.F("remote", r.RemoteAddr))
		writeJSONError(w, http.StatusUnauthorized, mcpcommon.NewError(mcpcommon.CodeUnauthorized, "missing or invalid bearer token"))
		h.logAccess(r, start, connID, http.StatusUnauthorized, "")
		return
	}

	// 路径校验
	if r.URL.Path != h.registryURL() {
		http.NotFound(w, r)
		h.logAccess(r, start, connID, http.StatusNotFound, "")
		return
	}

	// 注入静态/动态响应头
	for k, v := range h.staticHeaders {
		w.Header().Set(k, v)
	}
	for k, envName := range h.dynamicHeaders {
		if val := os.Getenv(envName); val != "" {
			w.Header().Set(k, val)
		}
	}

	// GET：SSE 流
	if method == http.MethodGet {
		h.handleSSE(w, r, connID, start)
		return
	}

	// POST：JSON-RPC 请求
	if method != http.MethodPost {
		w.Header().Set("Allow", "GET, POST, OPTIONS")
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		h.logAccess(r, start, connID, http.StatusMethodNotAllowed, "")
		return
	}

	// 强制要求 session
	if h.requireSession && r.Header.Get("Mcp-Session-Id") == "" {
		writeJSONError(w, http.StatusBadRequest, mcpcommon.NewError(mcpcommon.CodeInvalidArgs, "Mcp-Session-Id header is required"))
		h.logAccess(r, start, connID, http.StatusBadRequest, "")
		return
	}

	body, err := io.ReadAll(io.LimitReader(r.Body, 4*1024*1024))
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, mcpcommon.NewError(mcpcommon.CodeInvalidArgs, "read body: "+err.Error()))
		h.logAccess(r, start, connID, http.StatusBadRequest, "")
		return
	}
	h.handleJSONRPC(w, r, body, connID, start)
}

func (h *mcpHTTPHandler) registryURL() string {
	return h.path
}

func (h *mcpHTTPHandler) checkAuth(r *http.Request) bool {
	if len(h.allowedTokens) == 0 {
		return true // 开放模式（仅调试）
	}
	auth := r.Header.Get("Authorization")
	const prefix = "Bearer "
	if !strings.HasPrefix(auth, prefix) {
		// 兼容：Query string 中带 ?token=...
		if t := r.URL.Query().Get("token"); t != "" {
			return h.allowedTokens[t]
		}
		return false
	}
	return h.allowedTokens[auth[len(prefix):]]
}

func (h *mcpHTTPHandler) handleJSONRPC(w http.ResponseWriter, r *http.Request, body []byte, connID uint64, start time.Time) {
	var req rpcRequest
	if err := json.Unmarshal(body, &req); err != nil {
		writeJSONError(w, http.StatusBadRequest, mcpcommon.NewError(mcpcommon.CodeInvalidArgs, "parse error: "+err.Error()))
		h.logAccess(r, start, connID, http.StatusBadRequest, "parse error")
		return
	}
	if h.debug {
		h.logger.Debug("rpc", mcpcommon.F("method", req.Method), mcpcommon.F("id", fmt.Sprintf("%v", req.ID)))
	}

	// 通知无响应
	isNotification := req.ID == nil

	var result interface{}
	var errOut interface{}
	switch req.Method {
	case "initialize":
		result = map[string]interface{}{
			"protocolVersion": "2024-11-05",
			"serverInfo":      map[string]string{"name": h.name, "version": h.version},
			"capabilities":    map[string]interface{}{"tools": map[string]interface{}{}},
		}
	case "notifications/initialized":
		if isNotification {
			w.WriteHeader(http.StatusAccepted)
			h.logAccess(r, start, connID, http.StatusAccepted, "initialized")
			return
		}
	case "tools/list":
		tools := make([]map[string]interface{}, 0, len(h.registry.Definitions()))
		for _, def := range h.registry.Definitions() {
			tools = append(tools, map[string]interface{}{
				"name":        def.Name,
				"description": def.Description,
				"inputSchema": def.InputSchema,
			})
		}
		result = map[string]interface{}{"tools": tools}
	case "tools/call":
		name, _ := req.Params["name"].(string)
		args, _ := req.Params["arguments"].(map[string]interface{})
		if args == nil {
			args = map[string]interface{}{}
		}
		if h.debug {
			h.logger.Debug("tool call", mcpcommon.F("tool", name))
		}
		callCtx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
		defer cancel()
		r2, err := h.registry.Dispatch(callCtx, name, args)
		if err != nil {
			if e, ok := err.(*mcpcommon.ToolError); ok {
				result = map[string]interface{}{
					"content": []map[string]interface{}{{"type": "text", "text": e.ToJSON()}},
					"isError": true,
				}
			} else {
				result = map[string]interface{}{
					"content": []map[string]interface{}{{"type": "text", "text": mcpcommon.StringErr(err)}},
					"isError": true,
				}
			}
		} else {
			text, _ := mcpcommon.FormatResult(r2)
			result = map[string]interface{}{
				"content": []map[string]interface{}{{"type": "text", "text": text}},
			}
		}
	case "ping":
		result = map[string]string{"status": "pong"}
	default:
		errOut = map[string]interface{}{"code": -32601, "message": "method not found: " + req.Method}
	}

	if isNotification {
		w.WriteHeader(http.StatusAccepted)
		h.logAccess(r, start, connID, http.StatusAccepted, req.Method)
		return
	}

	resp := rpcResponse{JSONRPC: "2.0", ID: req.ID, Result: result, Error: errOut}
	w.Header().Set("Content-Type", "application/json")
	if req.Method == "initialize" {
		// 给 session 分配 ID
		w.Header().Set("Mcp-Session-Id", generateSessionID())
	}
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(resp)
	h.logAccess(r, start, connID, http.StatusOK, req.Method)
}

// ============================================================================
// SSE 流（GET /mcp）
// ============================================================================

func (h *mcpHTTPHandler) handleSSE(w http.ResponseWriter, r *http.Request, connID uint64, start time.Time) {
	// SSE 必需头
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache, no-transform")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")

	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming unsupported", http.StatusInternalServerError)
		return
	}

	// Last-Event-ID 重连支持
	lastEventID := r.Header.Get("Last-Event-ID")
	if lastEventID == "" {
		lastEventID = r.URL.Query().Get("last_event_id")
	}
	if lastEventID != "" {
		h.logger.Info("SSE reconnect", mcpcommon.F("conn", connID), mcpcommon.F("last_event_id", lastEventID))
	}

	ctx := r.Context()
	keepAlive := h.keepAlive
	if keepAlive == 0 {
		keepAlive = 15 * time.Second
	}

	// 发送初始事件
	writeSSE(w, flusher, "", "connected", fmt.Sprintf(`{"conn":%d}`, connID))

	counter := 0
	ticker := time.NewTicker(keepAlive)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			h.logAccess(r, start, connID, http.StatusOK, "sse-closed")
			return
		case <-ticker.C:
			if _, err := io.WriteString(w, ": keepalive\n\n"); err != nil {
				h.logger.Warn("sse write failed", mcpcommon.F("conn", connID), mcpcommon.F("error", err))
				h.logAccess(r, start, connID, http.StatusOK, "sse-broken")
				return
			}
			flusher.Flush()
			counter++
			if h.maxEvents > 0 && counter >= h.maxEvents {
				h.logAccess(r, start, connID, http.StatusOK, "sse-max")
				return
			}
		}
	}
}

func writeSSE(w io.Writer, flusher http.Flusher, id, event, data string) {
	if id != "" {
		fmt.Fprintf(w, "id: %s\n", id)
	}
	if event != "" {
		fmt.Fprintf(w, "event: %s\n", event)
	}
	for _, line := range strings.Split(data, "\n") {
		fmt.Fprintf(w, "data: %s\n", line)
	}
	fmt.Fprint(w, "\n")
	flusher.Flush()
}

// ============================================================================
// 访问日志
// ============================================================================

func (h *mcpHTTPHandler) logAccess(r *http.Request, start time.Time, connID uint64, status int, methodTag string) {
	dur := time.Since(start)
	ua := r.UserAgent()
	h.accessLogger.Info("http",
		mcpcommon.F("ts", start.UTC().Format(time.RFC3339Nano)),
		mcpcommon.F("conn", connID),
		mcpcommon.F("method", r.Method),
		mcpcommon.F("path", r.URL.Path),
		mcpcommon.F("status", status),
		mcpcommon.F("dur_ms", dur.Milliseconds()),
		mcpcommon.F("remote", clientIP(r)),
		mcpcommon.F("ua", ua),
		mcpcommon.F("rpc", methodTag),
	)
}

func clientIP(r *http.Request) string {
	if ip := r.Header.Get("X-Forwarded-For"); ip != "" {
		return strings.Split(ip, ",")[0]
	}
	if ip := r.Header.Get("X-Real-IP"); ip != "" {
		return ip
	}
	host, _, _ := net.SplitHostPort(r.RemoteAddr)
	return host
}

// ============================================================================
// 工具函数
// ============================================================================

func collectAllowedTokens(static []string, fromEnv []string) map[string]bool {
	out := make(map[string]bool)
	for _, t := range static {
		if t = strings.TrimSpace(t); t != "" {
			out[t] = true
		}
	}
	for _, name := range fromEnv {
		if v := os.Getenv(strings.TrimSpace(name)); v != "" {
			out[v] = true
		}
	}
	return out
}

func parseKeyValuePairs(pairs []string) map[string]string {
	out := make(map[string]string, len(pairs))
	for _, p := range pairs {
		idx := strings.IndexByte(p, '=')
		if idx <= 0 {
			continue
		}
		out[p[:idx]] = p[idx+1:]
	}
	return out
}

func parseHeaderEnvPairs(pairs []string) map[string]string {
	out := make(map[string]string, len(pairs))
	for _, p := range pairs {
		idx := strings.IndexByte(p, '=')
		if idx <= 0 {
			continue
		}
		out[p[:idx]] = p[idx+1:]
	}
	return out
}

var sessionCounter uint64

func generateSessionID() string {
	n := atomic.AddUint64(&sessionCounter, 1)
	return fmt.Sprintf("sess_%d_%d", time.Now().UnixNano(), n)
}
