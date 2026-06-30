package services

import (
	"testing"
	"time"

	"github.com/synkord/core/models"
)

func TestMCPConfigSupportsMultipleTeamTokens(t *testing.T) {
	db := testDB(t)
	user := &models.User{Username: "mcp-owner", HashedPassword: "hash", Role: models.RoleViewer, IsActive: true}
	if err := db.Create(user).Error; err != nil {
		t.Fatalf("create user: %v", err)
	}
	team, err := CreateTeam(db, user.ID, "MCP Team", "")
	if err != nil {
		t.Fatalf("create team: %v", err)
	}

	first, err := CreateMCPConfig(db, team.ID, &user.ID, MCPConfigInput{Name: "Cursor", Purpose: "IDE"})
	if err != nil {
		t.Fatalf("create first token: %v", err)
	}
	second, err := CreateMCPConfig(db, team.ID, &user.ID, MCPConfigInput{Name: "CI", Purpose: "CI"})
	if err != nil {
		t.Fatalf("create second token: %v", err)
	}
	if first.Token == "" || second.Token == "" || first.Token == second.Token {
		t.Fatalf("tokens should be generated once and unique: %q %q", first.Token, second.Token)
	}

	configs, err := ListTeamMCPConfigs(db, team.ID)
	if err != nil {
		t.Fatalf("list configs: %v", err)
	}
	if len(configs) != 2 {
		t.Fatalf("configs len = %d, want 2", len(configs))
	}
	if configs[0].Token != "" || configs[1].Token != "" {
		t.Fatalf("list should not expose full tokens: %+v", configs)
	}
}

func TestEnsureCodexMCPConfigCreatesOnce(t *testing.T) {
	db := testDB(t)
	user := &models.User{Username: "mcp-codex-owner", HashedPassword: "hash", Role: models.RoleViewer, IsActive: true}
	if err := db.Create(user).Error; err != nil {
		t.Fatalf("create user: %v", err)
	}
	team, err := CreateTeam(db, user.ID, "MCP Codex Team", "")
	if err != nil {
		t.Fatalf("create team: %v", err)
	}

	first, err := EnsureCodexMCPConfig(db, team.ID, &user.ID)
	if err != nil {
		t.Fatalf("ensure first: %v", err)
	}
	if first.Token == "" || first.Name != CodexAutoConfigName || first.Purpose != CodexAutoConfigPurpose {
		t.Fatalf("unexpected first config: %+v", first)
	}

	second, err := EnsureCodexMCPConfig(db, team.ID, &user.ID)
	if err != nil {
		t.Fatalf("ensure second: %v", err)
	}
	if second.ID != first.ID {
		t.Fatalf("ensure should reuse config: first=%s second=%s", first.ID, second.ID)
	}
	if second.Token == "" {
		t.Fatalf("active token should be exposed on second ensure")
	}

	configs, err := ListTeamMCPConfigs(db, team.ID)
	if err != nil {
		t.Fatalf("list configs: %v", err)
	}
	if len(configs) != 1 {
		t.Fatalf("configs len = %d, want 1", len(configs))
	}
}

func TestBuildMCPServiceStatus(t *testing.T) {
	if status := BuildMCPServiceStatus(false, true, nil); status.State != "disabled" || status.Ready {
		t.Fatalf("global disabled status = %+v", status)
	}
	if status := BuildMCPServiceStatus(true, true, nil); status.State != "no_token" || status.Ready {
		t.Fatalf("no token status = %+v", status)
	}

	lastUsed := time.Now().Add(-time.Minute)
	status := BuildMCPServiceStatus(true, true, []MCPConfigView{{
		MCPConfig: models.MCPConfig{
			Status:     models.MCPConfigActive,
			LastUsedAt: &lastUsed,
		},
	}})
	if status.State != "connected" || !status.Ready || !status.Connected || status.ActiveTokens != 1 {
		t.Fatalf("connected status = %+v", status)
	}
}

func TestValidateMCPAccessTokenRespectsSwitches(t *testing.T) {
	db := testDB(t)
	user := &models.User{Username: "mcp-access-owner", HashedPassword: "hash", Role: models.RoleViewer, IsActive: true}
	if err := db.Create(user).Error; err != nil {
		t.Fatalf("create user: %v", err)
	}
	team, err := CreateTeam(db, user.ID, "MCP Access Team", "")
	if err != nil {
		t.Fatalf("create team: %v", err)
	}
	created, err := CreateMCPConfig(db, team.ID, &user.ID, MCPConfigInput{Name: "Cursor", Purpose: "IDE"})
	if err != nil {
		t.Fatalf("create token: %v", err)
	}

	if _, err := ValidateMCPAccessToken(db, created.Token); err != nil {
		t.Fatalf("active token should validate: %v", err)
	}
	if _, err := UpdateMCPConfigStatus(db, team.ID, created.ID, models.MCPConfigDisabled); err != nil {
		t.Fatalf("disable config: %v", err)
	}
	if _, err := ValidateMCPAccessToken(db, created.Token); err == nil {
		t.Fatalf("disabled token should be rejected")
	}

	rotated, err := RotateMCPConfigToken(db, team.ID, created.ID)
	if err != nil {
		t.Fatalf("rotate token: %v", err)
	}
	if _, err := UpdateTeamMCPEnabled(db, team.ID, false); err != nil {
		t.Fatalf("disable team mcp: %v", err)
	}
	if _, err := ValidateMCPAccessToken(db, rotated.Token); err == nil {
		t.Fatalf("team disabled token should be rejected")
	}
	if _, err := UpdateTeamMCPEnabled(db, team.ID, true); err != nil {
		t.Fatalf("enable team mcp: %v", err)
	}
	if _, err := UpdateGlobalMCPConfig(db, false, DefaultMCPTools, 120); err != nil {
		t.Fatalf("disable global mcp: %v", err)
	}
	if _, err := ValidateMCPAccessToken(db, rotated.Token); err == nil {
		t.Fatalf("global disabled token should be rejected")
	}
}
