// Synkord mcp 单元测试（v1.2 重写：基于 ContractSet/ContractMember）
package services

import (
	"testing"
	"time"

	"github.com/glebarez/sqlite"
	"github.com/synkord/core/models"
	"gorm.io/gorm"
)

func testDBMCPRoot(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	if err := db.AutoMigrate(
		&models.User{},
		&models.ContractSet{},
		&models.ContractMember{},
		&models.SwaggerSpec{},
		&models.APIEndpoint{},
		&models.DataModel{},
		&models.DataModelVersion{},
		&models.Dependency{},
		&models.MCPAuditLog{},
		&models.ActiveContract{},
		&models.MCPStatus{},
	); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	return db
}

// createMCPFixture 创建一个最小可用的 (user, contract) 套件
func createMCPFixture(t *testing.T, db *gorm.DB) (*models.User, *models.ContractSet) {
	t.Helper()
	username := "owner_" + sanitizeName(t.Name())
	user := &models.User{Username: username, HashedPassword: "x", Role: models.RoleEditor, IsActive: true}
	if err := db.Create(user).Error; err != nil {
		t.Fatalf("create user: %v", err)
	}
	c, err := CreateContract(db, user.ID, "mcp-test", "")
	if err != nil {
		t.Fatalf("create contract: %v", err)
	}
	return user, c
}

// sanitizeName 把测试名中非 ASCII 字符替换为下划线，避免 SQLite UNIQUE 冲突
func sanitizeName(name string) string {
	out := make([]byte, 0, len(name))
	for i := 0; i < len(name); i++ {
		c := name[i]
		switch {
		case c >= 'a' && c <= 'z', c >= 'A' && c <= 'Z', c >= '0' && c <= '9':
			out = append(out, c)
		default:
			out = append(out, '_')
		}
	}
	return string(out)
}

func TestMCPRegistryHasBuiltinTools(t *testing.T) {
	tools := DefaultMCPToolRegistry.List()
	expected := map[string]bool{
		"get_contract_apis":              true,
		"get_contract_entities":          true,
		"get_api_detail":                 true,
		"get_entity_detail":              true,
		"get_api_dependencies":           true,
		"get_entity_dependencies":        true,
		"validate_code_against_contract": true,
		"list_contracts":                 true,
		"find_contract":                  true,
	}
	if len(tools) < len(expected) {
		t.Fatalf("registry has %d tools, want >=%d", len(tools), len(expected))
	}
	for name := range expected {
		found := false
		for _, tn := range tools {
			if tn == name {
				found = true
				break
			}
		}
		if !found {
			t.Errorf("missing builtin tool: %s", name)
		}
	}
}

func TestMCPAuditLogLifecycle(t *testing.T) {
	db := testDBMCPRoot(t)
	user, contract := createMCPFixture(t, db)

	log, err := CreateMCPAuditLog(db, MCPAuditInput{
		ContractID:    contract.ID,
		UserID:        user.ID,
		ToolName:      "get_contract_apis",
		Caller:        "local-mcp",
		ParamsSummary: "{}",
		ResultStatus:  "success",
		Status:        200,
		DurationMs:    12,
	})
	if err != nil {
		t.Fatalf("create audit: %v", err)
	}
	if log.ID == "" {
		t.Fatal("audit ID empty")
	}

	items, total, err := ListMCPAuditLogs(db, 0, 10, "", "", "", "")
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if total != 1 || len(items) != 1 {
		t.Fatalf("got total=%d items=%d, want 1/1", total, len(items))
	}
	if items[0].UserID != user.ID || items[0].ToolName != "get_contract_apis" {
		t.Fatalf("audit row mismatch: %+v", items[0])
	}
}

func TestMCPToolExecuteUnknown(t *testing.T) {
	db := testDBMCPRoot(t)
	_, contract := createMCPFixture(t, db)
	_, err := DefaultMCPToolRegistry.Execute(db, "this_tool_does_not_exist", contract.ID, "u", nil)
	if err == nil {
		t.Fatal("expected unknown tool error")
	}
}

func TestActiveContractSetAndClear(t *testing.T) {
	db := testDBMCPRoot(t)
	user, contract := createMCPFixture(t, db)

	// 初始为 nil
	ac, err := GetActiveContract(db)
	if err != nil {
		t.Fatalf("get initial: %v", err)
	}
	if ac != nil {
		t.Fatalf("expected nil initial, got %+v", ac)
	}

	// 设置
	if _, err := SetActiveContract(db, contract.ID, user.ID); err != nil {
		t.Fatalf("set: %v", err)
	}

	ac, err = GetActiveContract(db)
	if err != nil {
		t.Fatalf("get after set: %v", err)
	}
	if ac == nil || ac.ContractID != contract.ID {
		t.Fatalf("expected contract %s, got %+v", contract.ID, ac)
	}

	// 清空
	if err := ClearActiveContract(db); err != nil {
		t.Fatalf("clear: %v", err)
	}
	ac, _ = GetActiveContract(db)
	if ac != nil {
		t.Fatalf("expected nil after clear, got %+v", ac)
	}
}

// seedAuditLogs 写入若干条审计日志用于摘要/统计测试
func seedAuditLogs(t *testing.T, db *gorm.DB, userID, contractID string, entries []struct {
	Tool   string
	Status string
	HourAgo int
}) {
	t.Helper()
	now := time.Now()
	for _, e := range entries {
		ts := now.Add(-time.Duration(e.HourAgo) * time.Hour)
		log := &models.MCPAuditLog{
			ContractID:   contractID,
			UserID:       userID,
			ToolName:     e.Tool,
			Caller:       "test",
			ParamsSummary: "{}",
			ResultStatus: e.Status,
			Status:       200,
			DurationMs:   1,
		}
		// 直接 Create 走 BeforeCreate（生成 ID），但 GORM 的 CreatedAt 在 Save/Update 时才会写
		if err := db.Create(log).Error; err != nil {
			t.Fatalf("seed audit: %v", err)
		}
		// 强制覆盖 created_at（gorm 默认会填 time.Now()，但我们需要"过去某小时"）
		if err := db.Model(log).Update("created_at", ts).Error; err != nil {
			t.Fatalf("override created_at: %v", err)
		}
	}
}

func TestMCPHealthSummaryCountsErrorsAndConsecutives(t *testing.T) {
	db := testDBMCPRoot(t)
	user, contract := createMCPFixture(t, db)

	// 4 条：3 错误 + 1 成功（最新一条是成功）
	// 用不同 HourAgo 保证 created_at 倒序确定性：
	// 0h = success（最新），1h = error，2h = error，3h = error
	seedAuditLogs(t, db, user.ID, contract.ID, []struct {
		Tool    string
		Status  string
		HourAgo int
	}{
		{"get_contract_apis", "error", 3},
		{"get_contract_apis", "error", 2},
		{"get_contract_apis", "error", 1},
		{"get_contract_entities", "success", 0},
	})

	h := GetMCPHealthSummary(db)
	if h.RecentErrors != 3 {
		t.Errorf("RecentErrors = %d, want 3", h.RecentErrors)
	}
	if h.ConsecutiveFailures != 0 {
		t.Errorf("ConsecutiveFailures = %d, want 0 (latest is success)", h.ConsecutiveFailures)
	}
	if h.Calls24h != 4 {
		t.Errorf("Calls24h = %d, want 4", h.Calls24h)
	}
	expectedRate := 3.0 / 4.0
	if h.ErrorRate24h < expectedRate-1e-9 || h.ErrorRate24h > expectedRate+1e-9 {
		t.Errorf("ErrorRate24h = %v, want %v", h.ErrorRate24h, expectedRate)
	}
	if h.QPS24h <= 0 {
		t.Errorf("QPS24h = %v, want > 0", h.QPS24h)
	}
}

func TestMCPHealthSummaryConsecutiveFailuresFromLatest(t *testing.T) {
	db := testDBMCPRoot(t)
	user, contract := createMCPFixture(t, db)

	// 用不同 HourAgo 保证 created_at 倒序确定性：
	// 最新（0h）= error，1h = error，2h = success
	// → ConsecutiveFailures=2
	seedAuditLogs(t, db, user.ID, contract.ID, []struct {
		Tool    string
		Status  string
		HourAgo int
	}{
		{"get_api_detail", "error", 0},
		{"get_api_detail", "error", 1},
		{"get_api_detail", "success", 2},
	})
	h := GetMCPHealthSummary(db)
	if h.ConsecutiveFailures != 2 {
		t.Errorf("ConsecutiveFailures = %d, want 2", h.ConsecutiveFailures)
	}
	if h.RecentErrors != 2 {
		t.Errorf("RecentErrors = %d, want 2", h.RecentErrors)
	}
}

func TestGetMCPRuntimeSummaryEmptyDB(t *testing.T) {
	db := testDBMCPRoot(t)
	// 单例表为空：应返回零值 + 空 health，不 panic
	s := GetMCPRuntimeSummary(db)
	if s.PID != nil {
		t.Errorf("PID = %v, want nil", s.PID)
	}
	if s.StartedAt != nil {
		t.Errorf("StartedAt = %v, want nil", s.StartedAt)
	}
	if s.UptimeSeconds != nil {
		t.Errorf("UptimeSeconds = %v, want nil", s.UptimeSeconds)
	}
	if s.RestartCount != 0 {
		t.Errorf("RestartCount = %d, want 0", s.RestartCount)
	}
	// Health 是零值结构体（OK）
}

func TestGetAccessLogStatsSparklineAndTop(t *testing.T) {
	db := testDBMCPRoot(t)
	user, contract := createMCPFixture(t, db)

	// 3 个不同工具，不同时间桶
	// tool A: 1h 之前 2 次 + 0h 之前 1 次
	// tool B: 0h 之前 1 次
	// tool C: 0h 之前 1 次（错误）
	seedAuditLogs(t, db, user.ID, contract.ID, []struct {
		Tool    string
		Status  string
		HourAgo int
	}{
		{"tool_a", "success", 1},
		{"tool_a", "success", 1},
		{"tool_a", "success", 0},
		{"tool_b", "success", 0},
		{"tool_c", "error", 0},
	})

	stats := GetAccessLogStats(db)
	if len(stats.Sparkline) != 24 {
		t.Fatalf("Sparkline length = %d, want 24", len(stats.Sparkline))
	}
	if stats.Sparkline[0] != 3 {
		t.Errorf("Sparkline[0] (current hour) = %d, want 3", stats.Sparkline[0])
	}
	if stats.Sparkline[1] != 2 {
		t.Errorf("Sparkline[1] (1h ago) = %d, want 2", stats.Sparkline[1])
	}
	// 总计 5 次中 1 次错误 → 0.2
	if stats.ErrorRate < 0.2-1e-9 || stats.ErrorRate > 0.2+1e-9 {
		t.Errorf("ErrorRate = %v, want 0.2", stats.ErrorRate)
	}
	// Top: tool_a=3, tool_b=1, tool_c=1 → 第一名 tool_a
	if len(stats.TopTools) == 0 || stats.TopTools[0].ToolName != "tool_a" {
		t.Errorf("TopTools[0] = %+v, want tool_a", stats.TopTools)
	}
	if stats.TopTools[0].Count != 3 {
		t.Errorf("TopTools[0].Count = %d, want 3", stats.TopTools[0].Count)
	}
}
