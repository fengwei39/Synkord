package services

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"time"

	"github.com/synkord/core/models"
	"gorm.io/gorm"
)

var DefaultMCPTools = []string{
	"get_team_entities",
	"get_project_entities",
	"get_project_apis",
	"get_api_dependencies",
	"detect_breaking_changes",
	"validate_entity_usage",
}

type MCPConfigInput struct {
	Name         string     `json:"name"`
	Purpose      string     `json:"purpose"`
	ProjectScope []string   `json:"project_scope"`
	ToolScope    []string   `json:"tool_scope"`
	ExpiresAt    *time.Time `json:"expires_at"`
}

type MCPConfigView struct {
	models.MCPConfig
	ProjectScope []string `json:"project_scope"`
	ToolScope    []string `json:"tool_scope"`
	Token        string   `json:"token,omitempty"`
}

type TeamMCPOverview struct {
	Enabled         bool            `json:"enabled"`
	GlobalEnabled   bool            `json:"global_enabled"`
	SSEEndpoint     string          `json:"sse_endpoint"`
	MessageEndpoint string          `json:"message_endpoint"`
	Tools           []string        `json:"tools"`
	Configs         []MCPConfigView `json:"configs"`
}

func GetTeamMCPSetting(db *gorm.DB, teamID string) (*models.TeamMCPSetting, error) {
	var setting models.TeamMCPSetting
	if err := db.First(&setting, "team_id = ?", teamID).Error; err != nil {
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, err
		}
		setting = models.TeamMCPSetting{TeamID: teamID, Enabled: true}
		if err := db.Create(&setting).Error; err != nil {
			return nil, err
		}
	}
	return &setting, nil
}

func UpdateTeamMCPEnabled(db *gorm.DB, teamID string, enabled bool) (*models.TeamMCPSetting, error) {
	setting, err := GetTeamMCPSetting(db, teamID)
	if err != nil {
		return nil, err
	}
	if err := db.Model(setting).Update("enabled", enabled).Error; err != nil {
		return nil, err
	}
	setting.Enabled = enabled
	return setting, nil
}

func GetGlobalMCPConfig(db *gorm.DB) (*models.GlobalMCPServerConfig, error) {
	var cfg models.GlobalMCPServerConfig
	if err := db.First(&cfg, "id = ?", "default").Error; err != nil {
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, err
		}
		toolsJSON, _ := json.Marshal(DefaultMCPTools)
		cfg = models.GlobalMCPServerConfig{
			ID:                 "default",
			Enabled:            true,
			ToolRegistryJSON:   string(toolsJSON),
			RateLimitPerMinute: 120,
		}
		if err := db.Create(&cfg).Error; err != nil {
			return nil, err
		}
	}
	return &cfg, nil
}

func UpdateGlobalMCPConfig(db *gorm.DB, enabled bool, tools []string, rateLimit int) (*models.GlobalMCPServerConfig, error) {
	cfg, err := GetGlobalMCPConfig(db)
	if err != nil {
		return nil, err
	}
	if len(tools) == 0 {
		tools = DefaultMCPTools
	}
	if rateLimit <= 0 {
		rateLimit = 120
	}
	toolsJSON, _ := json.Marshal(tools)
	if err := db.Model(cfg).Updates(map[string]interface{}{
		"enabled":               enabled,
		"tool_registry_json":    string(toolsJSON),
		"rate_limit_per_minute": rateLimit,
	}).Error; err != nil {
		return nil, err
	}
	cfg.Enabled = enabled
	cfg.ToolRegistryJSON = string(toolsJSON)
	cfg.RateLimitPerMinute = rateLimit
	return cfg, nil
}

func ListTeamMCPConfigs(db *gorm.DB, teamID string) ([]MCPConfigView, error) {
	var configs []models.MCPConfig
	if err := db.Where("team_id = ?", teamID).Order("created_at desc").Find(&configs).Error; err != nil {
		return nil, err
	}
	views := make([]MCPConfigView, 0, len(configs))
	for _, config := range configs {
		views = append(views, mcpConfigView(config, ""))
	}
	return views, nil
}

func CreateMCPConfig(db *gorm.DB, teamID string, createdBy *string, input MCPConfigInput) (*MCPConfigView, error) {
	token, err := generateMCPToken()
	if err != nil {
		return nil, err
	}
	if len(input.ToolScope) == 0 {
		input.ToolScope = DefaultMCPTools
	}
	projectsJSON, _ := json.Marshal(input.ProjectScope)
	toolsJSON, _ := json.Marshal(input.ToolScope)
	config := &models.MCPConfig{
		TeamID:           teamID,
		Name:             input.Name,
		Purpose:          input.Purpose,
		ProjectScopeJSON: string(projectsJSON),
		ToolScopeJSON:    string(toolsJSON),
		Token:            token,
		TokenPreview:     previewToken(token),
		Status:           models.MCPConfigActive,
		ExpiresAt:        input.ExpiresAt,
		CreatedBy:        createdBy,
	}
	if err := db.Create(config).Error; err != nil {
		return nil, err
	}
	view := mcpConfigView(*config, token)
	return &view, nil
}

func UpdateMCPConfigStatus(db *gorm.DB, teamID, configID string, status models.MCPConfigStatus) (*MCPConfigView, error) {
	var config models.MCPConfig
	if err := db.First(&config, "id = ? AND team_id = ?", configID, teamID).Error; err != nil {
		return nil, err
	}
	if status != models.MCPConfigActive && status != models.MCPConfigDisabled {
		return nil, errors.New("invalid MCP config status")
	}
	if err := db.Model(&config).Update("status", status).Error; err != nil {
		return nil, err
	}
	config.Status = status
	view := mcpConfigView(config, "")
	return &view, nil
}

func RotateMCPConfigToken(db *gorm.DB, teamID, configID string) (*MCPConfigView, error) {
	var config models.MCPConfig
	if err := db.First(&config, "id = ? AND team_id = ?", configID, teamID).Error; err != nil {
		return nil, err
	}
	token, err := generateMCPToken()
	if err != nil {
		return nil, err
	}
	if err := db.Model(&config).Updates(map[string]interface{}{
		"token":         token,
		"token_preview": previewToken(token),
		"status":        models.MCPConfigActive,
	}).Error; err != nil {
		return nil, err
	}
	config.Token = token
	config.TokenPreview = previewToken(token)
	config.Status = models.MCPConfigActive
	view := mcpConfigView(config, token)
	return &view, nil
}

func ListMCPAuditLogs(db *gorm.DB, teamID string, offset, limit int) ([]models.MCPAuditLog, int64, error) {
	var items []models.MCPAuditLog
	var total int64
	if limit <= 0 || limit > 200 {
		limit = 100
	}
	query := db.Model(&models.MCPAuditLog{}).Where("team_id = ?", teamID)
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	if err := query.Order("created_at desc").Offset(offset).Limit(limit).Find(&items).Error; err != nil {
		return nil, 0, err
	}
	return items, total, nil
}

func ValidateMCPAccessToken(db *gorm.DB, token string) (*models.MCPConfig, error) {
	if token == "" {
		return nil, errors.New("MCP token required")
	}
	global, err := GetGlobalMCPConfig(db)
	if err != nil {
		return nil, err
	}
	if !global.Enabled {
		return nil, errors.New("MCP server disabled")
	}
	var config models.MCPConfig
	if err := db.First(&config, "token = ? AND status = ?", token, models.MCPConfigActive).Error; err != nil {
		return nil, err
	}
	setting, err := GetTeamMCPSetting(db, config.TeamID)
	if err != nil {
		return nil, err
	}
	if !setting.Enabled {
		return nil, errors.New("team MCP disabled")
	}
	if config.ExpiresAt != nil && config.ExpiresAt.Before(time.Now()) {
		return nil, errors.New("MCP token expired")
	}
	now := time.Now()
	_ = db.Model(&config).Update("last_used_at", &now).Error
	config.LastUsedAt = &now
	return &config, nil
}

func GlobalMCPTools(config *models.GlobalMCPServerConfig) []string {
	var tools []string
	if config != nil {
		_ = json.Unmarshal([]byte(config.ToolRegistryJSON), &tools)
	}
	if len(tools) == 0 {
		return DefaultMCPTools
	}
	return tools
}

func mcpConfigView(config models.MCPConfig, token string) MCPConfigView {
	var projects []string
	var tools []string
	_ = json.Unmarshal([]byte(config.ProjectScopeJSON), &projects)
	_ = json.Unmarshal([]byte(config.ToolScopeJSON), &tools)
	return MCPConfigView{
		MCPConfig:    config,
		ProjectScope: projects,
		ToolScope:    tools,
		Token:        token,
	}
}

func generateMCPToken() (string, error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return "sk-mcp-" + base64.RawURLEncoding.EncodeToString(buf), nil
}

func previewToken(token string) string {
	if len(token) <= 12 {
		return token
	}
	return token[:8] + "..." + token[len(token)-4:]
}
