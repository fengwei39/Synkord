package mcpcommon

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestToolErrorJSON(t *testing.T) {
	e := NewError(CodeNotFound, "file not found").WithDetail("path", "/etc/passwd")
	b, err := json.Marshal(e)
	if err != nil {
		t.Fatal(err)
	}
	s := string(b)
	if !strings.Contains(s, `"code":"NOT_FOUND"`) {
		t.Errorf("missing code: %s", s)
	}
	if !strings.Contains(s, `"path":"/etc/passwd"`) {
		t.Errorf("missing detail: %s", s)
	}
}

func TestToolErrorChained(t *testing.T) {
	e := NewErrorf(CodeInvalidArgs, "bad arg %d", 42)
	if !strings.Contains(e.Error(), "42") {
		t.Errorf("format not applied: %s", e.Error())
	}
}

func TestRegistryDispatch(t *testing.T) {
	r := NewRegistry()
	def, h := EchoTool()
	r.Register(def, h)
	result, err := r.Dispatch(nil, "echo", map[string]interface{}{"text": "hi"})
	if err != nil {
		t.Fatal(err)
	}
	if result.Content != "hi" {
		t.Errorf("got %q", result.Content)
	}
}

func TestRegistryLookup(t *testing.T) {
	r := NewRegistry()
	def, h := EchoTool()
	r.Register(def, h)
	got, ok := r.Lookup("echo")
	if !ok {
		t.Fatal("should find echo")
	}
	if got == nil {
		t.Fatal("handler nil")
	}
}

func TestRegistryNotFound(t *testing.T) {
	r := NewRegistry()
	_, err := r.Dispatch(nil, "missing", nil)
	if err == nil {
		t.Fatal("expected error")
	}
	e, ok := err.(*ToolError)
	if !ok {
		t.Fatalf("expected ToolError, got %T", err)
	}
	if e.Code != CodeToolNotAllowed {
		t.Errorf("code = %s, want %s", e.Code, CodeToolNotAllowed)
	}
}

func TestBuiltinTools(t *testing.T) {
	r := NewRegistry()
	RegisterBuiltinTools(r)
	for _, name := range []string{"echo", "env", "fs_read", "time_now", "reverse"} {
		if _, ok := r.Lookup(name); !ok {
			t.Errorf("missing builtin tool: %s", name)
		}
	}
}
