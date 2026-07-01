package mcpcommon

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// ToolResult 工具调用结果
type ToolResult struct {
	Content string
	IsError bool
}

// ToolHandler 工具函数签名
//  - ctx 上下文（带超时）
//  - args 客户端传入的 JSON 参数（已反序列化）
type ToolHandler func(ctx context.Context, args map[string]interface{}) (*ToolResult, error)

// 工具注册表
type ToolRegistry struct {
	definitions []ToolDefinition
	handlers    map[string]ToolHandler
}

type ToolDefinition struct {
	Name        string                 `json:"name"`
	Description string                 `json:"description"`
	InputSchema map[string]interface{} `json:"inputSchema"`
}

func NewRegistry() *ToolRegistry {
	return &ToolRegistry{handlers: make(map[string]ToolHandler)}
}

func (r *ToolRegistry) Register(def ToolDefinition, h ToolHandler) {
	r.definitions = append(r.definitions, def)
	r.handlers[def.Name] = h
}

func (r *ToolRegistry) Definitions() []ToolDefinition { return r.definitions }

// Lookup 返回指定工具的 handler（用于过滤等场景）
func (r *ToolRegistry) Lookup(name string) (ToolHandler, bool) {
	h, ok := r.handlers[name]
	return h, ok
}

func (r *ToolRegistry) Dispatch(ctx context.Context, name string, args map[string]interface{}) (*ToolResult, error) {
	h, ok := r.handlers[name]
	if !ok {
		return nil, NewErrorf(CodeToolNotAllowed, "tool %q not registered", name)
	}
	return h(ctx, args)
}

// ============================================================================
// 内置工具：echo / env / fs_read / time_now / reverse
// ============================================================================

// EchoTool 回显参数
func EchoTool() (ToolDefinition, ToolHandler) {
	def := ToolDefinition{
		Name:        "echo",
		Description: "回显传入的参数（用于调试 MCP 链路）",
		InputSchema: map[string]interface{}{
			"type": "object",
			"properties": map[string]interface{}{
				"text": map[string]interface{}{"type": "string", "description": "要回显的文本"},
			},
			"required": []string{"text"},
		},
	}
	h := func(ctx context.Context, args map[string]interface{}) (*ToolResult, error) {
		text, _ := args["text"].(string)
		return &ToolResult{Content: text}, nil
	}
	return def, h
}

// EnvTool 读取环境变量
func EnvTool() (ToolDefinition, ToolHandler) {
	def := ToolDefinition{
		Name:        "env",
		Description: "读取环境变量（支持多键）",
		InputSchema: map[string]interface{}{
			"type": "object",
			"properties": map[string]interface{}{
				"keys": map[string]interface{}{
					"type":        "array",
					"items":       map[string]interface{}{"type": "string"},
					"description": "环境变量名列表",
				},
				"all": map[string]interface{}{"type": "boolean", "description": "是否返回所有环境变量"},
			},
		},
	}
	h := func(ctx context.Context, args map[string]interface{}) (*ToolResult, error) {
		out := map[string]string{}
		if all, _ := args["all"].(bool); all {
			for _, e := range os.Environ() {
				if idx := strings.IndexByte(e, '='); idx > 0 {
					out[e[:idx]] = e[idx+1:]
				}
			}
		} else if keysRaw, ok := args["keys"].([]interface{}); ok {
			for _, k := range keysRaw {
				if k, ok := k.(string); ok {
					out[k] = os.Getenv(k)
				}
			}
		} else {
			return nil, NewError(CodeInvalidArgs, "必须传入 keys 数组或 all=true")
		}
		b, _ := json.MarshalIndent(out, "", "  ")
		return &ToolResult{Content: string(b)}, nil
	}
	return def, h
}

// ReadFileTool 读取文件
func ReadFileTool() (ToolDefinition, ToolHandler) {
	def := ToolDefinition{
		Name:        "fs_read",
		Description: "读取文件内容（受工作目录限制）",
		InputSchema: map[string]interface{}{
			"type": "object",
			"properties": map[string]interface{}{
				"path":     map[string]interface{}{"type": "string", "description": "相对工作目录的路径"},
				"maxBytes": map[string]interface{}{"type": "integer", "description": "最大字节数", "default": 65536},
			},
			"required": []string{"path"},
		},
	}
	h := func(ctx context.Context, args map[string]interface{}) (*ToolResult, error) {
		path, _ := args["path"].(string)
		if path == "" {
			return nil, NewError(CodeInvalidArgs, "path 必填")
		}
		// 限制在工作目录内
		abs, err := filepath.Abs(path)
		if err != nil {
			return nil, NewErrorf(CodeInvalidArgs, "非法路径: %v", err)
		}
		maxBytes := 65536
		if mb, ok := args["maxBytes"].(float64); ok {
			maxBytes = int(mb)
		}
		data, err := os.ReadFile(abs)
		if err != nil {
			return nil, NewErrorf(CodeNotFound, "读取失败: %v", err)
		}
		if len(data) > maxBytes {
			data = data[:maxBytes]
		}
		return &ToolResult{Content: string(data)}, nil
	}
	return def, h
}

// NowTool 返回当前时间
func NowTool() (ToolDefinition, ToolHandler) {
	def := ToolDefinition{
		Name:        "time_now",
		Description: "返回当前时间（RFC3339 + Unix 时间戳）",
		InputSchema: map[string]interface{}{"type": "object", "properties": map[string]interface{}{}},
	}
	h := func(ctx context.Context, args map[string]interface{}) (*ToolResult, error) {
		now := time.Now()
		out := map[string]interface{}{
			"rfc3339":    now.Format(time.RFC3339Nano),
			"unix_nano":  now.UnixNano(),
			"unix_milli": now.UnixMilli(),
			"tz":         now.Location().String(),
		}
		b, _ := json.MarshalIndent(out, "", "  ")
		return &ToolResult{Content: string(b)}, nil
	}
	return def, h
}

// ReverseTool 反转字符串
func ReverseTool() (ToolDefinition, ToolHandler) {
	def := ToolDefinition{
		Name:        "reverse",
		Description: "反转字符串",
		InputSchema: map[string]interface{}{
			"type": "object",
			"properties": map[string]interface{}{
				"text": map[string]interface{}{"type": "string"},
			},
			"required": []string{"text"},
		},
	}
	h := func(ctx context.Context, args map[string]interface{}) (*ToolResult, error) {
		text, _ := args["text"].(string)
		runes := []rune(text)
		for i, j := 0, len(runes)-1; i < j; i, j = i+1, j-1 {
			runes[i], runes[j] = runes[j], runes[i]
		}
		return &ToolResult{Content: string(runes)}, nil
	}
	return def, h
}

// RegisterBuiltinTools 注册所有内置工具
func RegisterBuiltinTools(r *ToolRegistry) {
	for _, p := range []func() (ToolDefinition, ToolHandler){
		EchoTool, EnvTool, ReadFileTool, NowTool, ReverseTool,
	} {
		def, h := p()
		r.Register(def, h)
	}
}

// FormatResult 统一格式化工具返回为 MCP 文本内容
func FormatResult(r *ToolResult) (text string, isError bool) {
	if r == nil {
		return "null", true
	}
	if r.IsError {
		return r.Content, true
	}
	return r.Content, false
}

// StringErr 辅助：将 error 包装为 ToolResult 文本
func StringErr(err error) string {
	if e, ok := err.(*ToolError); ok {
		return e.ToJSON()
	}
	return fmt.Sprintf(`{"code":"%s","message":%q}`, CodeInternal, err.Error())
}
