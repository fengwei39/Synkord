package services

import (
	"testing"

	"github.com/synkord/core/models"
	"gorm.io/gorm"
)

func TestExecuteMCPQueryIsUserAndProjectScoped(t *testing.T) {
	db := testDB(t)
	user, team, project := createMCPFixture(t, db)

	// 创建数据模型
	projectID := project.ID
	if _, err := CreateProjectEntity(db, team.ID, projectID, "UserDTO", "", `{"type":"object"}`, &user.ID); err != nil {
		t.Fatalf("create entity: %v", err)
	}

	// 用户身份调用工具
	result, status, errorMsg := ExecuteMCPQueryWithUser(db, team.ID, project.ID, user.ID, "get_project_entities", nil)
	if status != "success" {
		t.Fatalf("status = %s, want success, error: %s", status, errorMsg)
	}
	entityResult, ok := result.(map[string]interface{})
	if !ok {
		t.Fatalf("expected MCP query result map, got %+v", result)
	}
	items, ok := entityResult["items"].([]models.DataModel)
	if !ok || len(items) != 1 {
		t.Fatalf("expected one project entity, got %+v", result)
	}

	// 测试越权工具
	if _, status, _ := ExecuteMCPQueryWithUser(db, team.ID, project.ID, user.ID, "get_project_apis", nil); status != "success" {
		t.Fatalf("allowed tool status = %s, want success", status)
	}

	// 测试未知工具
	if _, status, _ := ExecuteMCPQueryWithUser(db, team.ID, project.ID, user.ID, "unknown_tool", nil); status != "error" {
		t.Fatalf("unknown tool status = %s, want error", status)
	}
}

func TestMCPAuditLogRecordsUser(t *testing.T) {
	db := testDB(t)
	user, team, project := createMCPFixture(t, db)

	// 创建审计日志
	_, err := CreateMCPAuditLog(db, MCPAuditInput{
		TeamID:        team.ID,
		ProjectID:     project.ID,
		UserID:        user.ID,
		ToolName:      "get_project_entities",
		Caller:        "local-mcp",
		ParamsSummary: "{}",
		ResultStatus:  "success",
	})
	if err != nil {
		t.Fatalf("create audit: %v", err)
	}

	// 按用户查询
	items, total, err := ListMCPAuditLogs(db, team.ID, project.ID, user.ID, 0, 10)
	if err != nil {
		t.Fatalf("list audit: %v", err)
	}
	if total != 1 || len(items) != 1 {
		t.Fatalf("unexpected audit items: total=%d items=%+v", total, items)
	}
	if items[0].UserID != user.ID {
		t.Fatalf("audit user_id = %s, want %s", items[0].UserID, user.ID)
	}
	if items[0].ProjectID != project.ID {
		t.Fatalf("audit project_id = %s, want %s", items[0].ProjectID, project.ID)
	}

	// 不指定用户查询
	allItems, allTotal, err := ListMCPAuditLogs(db, team.ID, project.ID, "", 0, 10)
	if err != nil {
		t.Fatalf("list all audit: %v", err)
	}
	if allTotal != 1 || len(allItems) != 1 {
		t.Fatalf("unexpected all audit items: total=%d", allTotal)
	}
}

func TestGetProjectMCPOverview(t *testing.T) {
	db := testDB(t)
	_, team, project := createMCPFixture(t, db)

	overview, err := GetProjectMCPOverview(db, team.ID, project.ID)
	if err != nil {
		t.Fatalf("get overview: %v", err)
	}
	if overview.TeamID != team.ID || overview.ProjectID != project.ID {
		t.Fatalf("overview team/project mismatch")
	}
	if !overview.Status.Ready {
		t.Fatalf("status should be ready")
	}
	if len(overview.Tools) == 0 {
		t.Fatalf("tools should not be empty")
	}
	if overview.LocalHintURL == "" {
		t.Fatalf("local hint url should not be empty")
	}
}

func createMCPFixture(t *testing.T, db *gorm.DB) (*models.User, *TeamWithRole, *models.Project) {
	t.Helper()
	user := &models.User{Username: "mcp-owner-" + t.Name(), HashedPassword: "hash", Role: models.RoleViewer, IsActive: true}
	if err := db.Create(user).Error; err != nil {
		t.Fatalf("create user: %v", err)
	}
	team, err := CreateTeam(db, user.ID, "MCP Team "+t.Name(), "")
	if err != nil {
		t.Fatalf("create team: %v", err)
	}
	project := &models.Project{TeamID: team.ID, Name: "svc-" + t.Name(), ProjectType: models.ProjectBackend}
	if err := db.Create(project).Error; err != nil {
		t.Fatalf("create project: %v", err)
	}
	return user, team, project
}
