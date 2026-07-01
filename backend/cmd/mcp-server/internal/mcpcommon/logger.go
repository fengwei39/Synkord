package mcpcommon

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
	"sync"
	"time"
)

// Logger 输出 STDIO 调试日志（必须输出到 stderr，不能污染 stdout JSON-RPC 流）
type Logger struct {
	Prefix  string
	Out     io.Writer
	mu      sync.Mutex
	JSONFmt bool
}

var (
	stdLogger = &Logger{Prefix: "mcp", Out: os.Stderr, JSONFmt: false}
)

// SetGlobalLogger 替换全局 logger（用于测试或自定义输出）
func SetGlobalLogger(l *Logger) { stdLogger = l }

// DefaultLogger 返回默认 logger
func DefaultLogger() *Logger { return stdLogger }

// NewLogger 构造 logger
//   - prefix: 日志前缀，例如 "mcp-stdio" / "mcp-http"
//   - jsonFmt: 是否输出 JSON 格式（便于日志聚合）
func NewLogger(prefix string, jsonFmt bool) *Logger {
	return &Logger{Prefix: prefix, Out: os.Stderr, JSONFmt: jsonFmt}
}

func (l *Logger) write(level, msg string, fields map[string]interface{}) {
	l.mu.Lock()
	defer l.mu.Unlock()

	ts := time.Now().Format(time.RFC3339Nano)

	if l.JSONFmt {
		entry := map[string]interface{}{
			"ts":    ts,
			"level": level,
			"msg":   msg,
		}
		for k, v := range fields {
			entry[k] = v
		}
		b, _ := json.Marshal(entry)
		fmt.Fprintln(l.Out, string(b))
		return
	}

	// 文本格式：ts LEVEL [prefix] msg key=value ...
	out := fmt.Sprintf("%s %s [%s] %s", ts, level, l.Prefix, msg)
	for k, v := range fields {
		out += fmt.Sprintf(" %s=%v", k, v)
	}
	fmt.Fprintln(l.Out, out)
}

func (l *Logger) Info(msg string, fields ...Field)  { l.write("INFO", msg, toMap(fields)) }
func (l *Logger) Warn(msg string, fields ...Field)  { l.write("WARN", msg, toMap(fields)) }
func (l *Logger) Error(msg string, fields ...Field) { l.write("ERROR", msg, toMap(fields)) }
func (l *Logger) Debug(msg string, fields ...Field) { l.write("DEBUG", msg, toMap(fields)) }

// Field 键值对日志字段
type Field struct {
	Key   string
	Value interface{}
}

func F(k string, v interface{}) Field { return Field{Key: k, Value: v} }

func toMap(fs []Field) map[string]interface{} {
	if len(fs) == 0 {
		return nil
	}
	m := make(map[string]interface{}, len(fs))
	for _, f := range fs {
		m[f.Key] = f.Value
	}
	return m
}
