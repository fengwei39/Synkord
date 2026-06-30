package services

import (
	"testing"
	"time"

	"github.com/synkord/core/models"
	"gorm.io/gorm"
)

func TestProjectMCPConfigStoresHashAndExposesTokenOnce(t *testing.T) {
	db := testDB(t)
	user, team, project := createMCPFixture(t, db)

	created, err := CreateProjectMCPConfig(db, team.ID, project.ID, &user.ID, MCPConfigInput{Name: "Cursor", Purpose: "IDE"})
	if err != nil {
		t.Fatalf("create token: %v", err)
	}
	if created.Token == "" {
		t.Fatalf("created token should be returned once")
	}
	if created.TokenHash == created.Token || created.TokenHash == "" {
		t.Fatalf("stored hash should be present and differ from token")
	}

	configs, err := ListProjectMCPConfigs(db, team.ID, project.ID)
	if err != nil {
		t.Fatalf("list configs: %v", err)
	}
	if len(configs) != 1 {
		t.Fatalf("configs len = %d, want 1", len(configs))
	}
	if configs[0].Token != "" {
		t.Fatalf("list should not expose full token")
	}
}

func TestValidateMCPAccessTokenIsProjectBound(t *testing.T) {
	db := testDB(t)
	user, team, project := createMCPFixture(t, db)
	other := &models.Project{TeamID: team.ID, Name: "other", ProjectType: models.ProjectBackend}
	if err := db.Create(other).Error; err != nil {
		t.Fatalf("create other project: %v", err)
	}

	created, err := CreateProjectMCPConfig(db, team.ID, project.ID, &user.ID, MCPConfigInput{Name: "Codex", Purpose: "IDE"})
	if err != nil {
		t.Fatalf("create token: %v", err)
	}
	if _, err := ValidateMCPAccessToken(db, created.Token, team.ID, project.ID); err != nil {
		t.Fatalf("active project token should validate: %v", err)
	}
	if _, err := ValidateMCPAccessToken(db, created.Token, team.ID, other.ID); err == nil {
		t.Fatalf("token should not validate against another project")
	}

	if _, err := UpdateProjectMCPConfig(db, team.ID, project.ID, created.ID, models.MCPConfigDisabled, nil); err != nil {
		t.Fatalf("disable token: %v", err)
	}
	if _, err := ValidateMCPAccessToken(db, created.Token, team.ID, project.ID); err == nil {
		t.Fatalf("disabled token should be rejected")
	}
}

func TestRotateProjectMCPConfigInvalidatesOldToken(t *testing.T) {
	db := testDB(t)
	user, team, project := createMCPFixture(t, db)
	created, err := CreateProjectMCPConfig(db, team.ID, project.ID, &user.ID, MCPConfigInput{Name: "Cursor", Purpose: "IDE"})
	if err != nil {
		t.Fatalf("create token: %v", err)
	}
	rotated, err := RotateProjectMCPConfigToken(db, team.ID, project.ID, created.ID)
	if err != nil {
		t.Fatalf("rotate token: %v", err)
	}
	if rotated.Token == "" || rotated.Token == created.Token {
		t.Fatalf("rotated token should be new")
	}
	if _, err := ValidateMCPAccessToken(db, created.Token, team.ID, project.ID); err == nil {
		t.Fatalf("old token should be rejected")
	}
	if _, err := ValidateMCPAccessToken(db, rotated.Token, team.ID, project.ID); err != nil {
		t.Fatalf("rotated token should validate: %v", err)
	}
}

func TestExecuteMCPQueryAndAuditAreProjectScoped(t *testing.T) {
	db := testDB(t)
	user, team, project := createMCPFixture(t, db)
	created, err := CreateProjectMCPConfig(db, team.ID, project.ID, &user.ID, MCPConfigInput{
		Name:      "Agent",
		Purpose:   "IDE",
		ToolScope: []string{"get_project_entities"},
	})
	if err != nil {
		t.Fatalf("create token: %v", err)
	}
	projectID := project.ID
	if _, err := CreateProjectEntity(db, team.ID, projectID, "UserDTO", "", `{"type":"object"}`, &user.ID); err != nil {
		t.Fatalf("create entity: %v", err)
	}

	result, ctx, err := ExecuteMCPQuery(db, MCPQueryRequest{
		Token:     created.Token,
		TeamID:    team.ID,
		ProjectID: project.ID,
		Tool:      "get_project_entities",
	})
	if err != nil {
		t.Fatalf("execute query: %v", err)
	}
	if ctx.Config.ProjectID != project.ID {
		t.Fatalf("context project = %s, want %s", ctx.Config.ProjectID, project.ID)
	}
	entityResult, ok := result.(map[string]interface{})
	if !ok {
		t.Fatalf("expected MCP query result map, got %+v", result)
	}
	items, ok := entityResult["items"].([]models.DataModel)
	if !ok || len(items) != 1 {
		t.Fatalf("expected one project entity, got %+v", result)
	}
	if _, _, err := ExecuteMCPQuery(db, MCPQueryRequest{
		Token:     created.Token,
		TeamID:    team.ID,
		ProjectID: project.ID,
		Tool:      "get_project_apis",
	}); err == nil {
		t.Fatalf("tool outside token scope should be rejected")
	}

	if _, err := CreateMCPAuditLog(db, MCPAuditInput{
		Token:        created.Token,
		TeamID:       team.ID,
		ProjectID:    project.ID,
		ToolName:     "get_project_entities",
		ResultStatus: "success",
	}); err != nil {
		t.Fatalf("create audit: %v", err)
	}
	auditItems, total, err := ListMCPAuditLogs(db, team.ID, project.ID, 0, 10)
	if err != nil {
		t.Fatalf("list audit: %v", err)
	}
	if total != 1 || len(auditItems) != 1 || auditItems[0].ProjectID != project.ID {
		t.Fatalf("unexpected audit items: total=%d items=%+v", total, auditItems)
	}
}

func TestBuildMCPServiceStatus(t *testing.T) {
	if status := BuildMCPServiceStatus(nil); status.State != "no_token" || status.Ready {
		t.Fatalf("no token status = %+v", status)
	}

	lastUsed := time.Now().Add(-time.Minute)
	status := BuildMCPServiceStatus([]MCPConfigView{{
		MCPConfig: models.MCPConfig{
			Status:     models.MCPConfigActive,
			LastUsedAt: &lastUsed,
		},
	}})
	if status.State != "connected" || !status.Ready || !status.Connected || status.ActiveTokens != 1 {
		t.Fatalf("connected status = %+v", status)
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
