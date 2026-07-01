// Package mcpcommon 提供两套 MCP 服务共享的错误格式、工具注册、调试日志
package mcpcommon

import (
	"encoding/json"
	"fmt"
)

// 统一错误返回格式（与 MCP JSON-RPC 兼容）
// 两套服务都使用此结构，避免客户端分别处理
type ToolError struct {
	Code    string                 `json:"code"`           // 错误码（machine-readable）
	Message string                 `json:"message"`        // 人类可读消息
	Details map[string]interface{} `json:"details,omitempty"` // 上下文（可选）
}

func (e *ToolError) Error() string {
	return fmt.Sprintf("[%s] %s", e.Code, e.Message)
}

// 预定义错误码
const (
	CodeInvalidArgs     = "INVALID_ARGS"
	CodeNotFound        = "NOT_FOUND"
	CodeInternal        = "INTERNAL"
	CodeUnauthorized    = "UNAUTHORIZED"
	CodeToolNotAllowed  = "TOOL_NOT_ALLOWED"
	CodeUpstreamFailure = "UPSTREAM_FAILURE"
	CodeTimeout         = "TIMEOUT"
)

func NewError(code, msg string) *ToolError {
	return &ToolError{Code: code, Message: msg}
}

func NewErrorf(code, format string, args ...interface{}) *ToolError {
	return &ToolError{Code: code, Message: fmt.Sprintf(format, args...)}
}

func (e *ToolError) WithDetail(k string, v interface{}) *ToolError {
	if e.Details == nil {
		e.Details = make(map[string]interface{})
	}
	e.Details[k] = v
	return e
}

// 序列化为 JSON 字符串，供 MCP 文本内容返回
func (e *ToolError) ToJSON() string {
	b, _ := json.MarshalIndent(e, "", "  ")
	return string(b)
}
