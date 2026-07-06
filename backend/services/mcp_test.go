// Synkord mcp 单元测试（v1.2 重写：基于 ContractSet/ContractMember）
package services

import (
	"testing"

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
	c, err := CreateContract(db, user.ID, "mcp-test", "backend", "")
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

	items, total, err := ListMCPAuditLogs(db, 0, 10)
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
