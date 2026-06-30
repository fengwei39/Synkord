package services

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/synkord/core/models"
	"gorm.io/gorm"
)

var DefaultMCPTools = []string{
	"get_project_entities",
	"get_project_apis",
	"get_entity_dependencies",
	"get_api_dependencies",
	"validate_entity_usage",
}

type MCPConfigInput struct {
	Name      string     `json:"name"`
	Purpose   string     `json:"purpose"`
	ToolScope []string   `json:"tool_scope"`
	ExpiresAt *time.Time `json:"expires_at"`
}

type MCPConfigView struct {
	models.MCPConfig
	ToolScope []string `json:"tool_scope"`
	Token     string   `json:"token,omitempty"`
}

type ProjectMCPOverview struct {
	TeamID       string           `json:"team_id"`
	ProjectID    string           `json:"project_id"`
	ProjectName  string           `json:"project_name"`
	Status       MCPServiceStatus `json:"status"`
	Tools        []string         `json:"tools"`
	Configs      []MCPConfigView  `json:"configs"`
	LocalHintURL string           `json:"local_hint_url"`
}

type MCPServiceStatus struct {
	State           string     `json:"state"`
	Ready           bool       `json:"ready"`
	Connected       bool       `json:"connected"`
	Reason          string     `json:"reason"`
	ActiveTokens    int        `json:"active_tokens"`
	LastConnectedAt *time.Time `json:"last_connected_at,omitempty"`
}

type MCPAccessContext struct {
	Config    models.MCPConfig `json:"config"`
	ToolScope []string         `json:"tool_scope"`
}

type MCPQueryRequest struct {
	Token     string                 `json:"token"`
	TeamID    string                 `json:"team_id"`
	ProjectID string                 `json:"project_id"`
	Tool      string                 `json:"tool"`
	Args      map[string]interface{} `json:"args"`
	Arguments map[string]interface{} `json:"arguments"` // 兼容旧本地 MCP 服务请求体
}

type MCPAuditInput struct {
	Token         string `json:"token"`
	TeamID        string `json:"team_id"`
	ProjectID     string `json:"project_id"`
	MCPConfigID   string `json:"mcp_config_id"`
	ToolName      string `json:"tool_name"`
	Caller        string `json:"caller"`
	ParamsSummary string `json:"params_summary"`
	ResultStatus  string `json:"result_status"`
	ErrorMessage  string `json:"error_message"`
}

func GetProjectMCPOverview(db *gorm.DB, teamID, projectID string) (*ProjectMCPOverview, error) {
	configs, err := ListProjectMCPConfigs(db, teamID, projectID)
	if err != nil {
		return nil, err
	}
	var project models.Project
	_ = db.Select("id", "name").First(&project, "id = ? AND team_id = ?", projectID, teamID).Error
	return &ProjectMCPOverview{
		TeamID:       teamID,
		ProjectID:    projectID,
		ProjectName:  project.Name,
		Status:       BuildMCPServiceStatus(configs),
		Tools:        DefaultMCPTools,
		Configs:      configs,
		LocalHintURL: "http://127.0.0.1:37991/mcp",
	}, nil
}

func ListProjectMCPConfigs(db *gorm.DB, teamID, projectID string) ([]MCPConfigView, error) {
	var configs []models.MCPConfig
	if err := db.Where("team_id = ? AND project_id = ?", teamID, projectID).Order("created_at desc").Find(&configs).Error; err != nil {
		return nil, err
	}
	views := make([]MCPConfigView, 0, len(configs))
	for _, config := range configs {
		views = append(views, mcpConfigView(config, ""))
	}
	return views, nil
}

func CreateProjectMCPConfig(db *gorm.DB, teamID, projectID string, createdBy *string, input MCPConfigInput) (*MCPConfigView, error) {
	token, err := generateMCPToken()
	if err != nil {
		return nil, err
	}
	if len(input.ToolScope) == 0 {
		input.ToolScope = DefaultMCPTools
	}
	toolsJSON, _ := json.Marshal(filterMCPTools(input.ToolScope))
	config := &models.MCPConfig{
		TeamID:        teamID,
		ProjectID:     projectID,
		Name:          strings.TrimSpace(input.Name),
		Purpose:       strings.TrimSpace(input.Purpose),
		ToolScopeJSON: string(toolsJSON),
		TokenHash:     hashMCPToken(token),
		TokenPreview:  previewToken(token),
		Status:        models.MCPConfigActive,
		ExpiresAt:     input.ExpiresAt,
		CreatedBy:     createdBy,
	}
	if config.Name == "" || config.Purpose == "" {
		return nil, errors.New("name and purpose are required")
	}
	if err := db.Create(config).Error; err != nil {
		return nil, err
	}
	view := mcpConfigView(*config, token)
	return &view, nil
}

func UpdateProjectMCPConfig(db *gorm.DB, teamID, projectID, configID string, status models.MCPConfigStatus, toolScope []string) (*MCPConfigView, error) {
	var config models.MCPConfig
	if err := db.First(&config, "id = ? AND team_id = ? AND project_id = ?", configID, teamID, projectID).Error; err != nil {
		return nil, err
	}
	if status != "" {
		if status != models.MCPConfigActive && status != models.MCPConfigDisabled {
			return nil, errors.New("invalid MCP config status")
		}
		config.Status = status
	}
	updates := map[string]interface{}{"status": config.Status}
	if toolScope != nil {
		toolsJSON, _ := json.Marshal(filterMCPTools(toolScope))
		updates["tool_scope_json"] = string(toolsJSON)
		config.ToolScopeJSON = string(toolsJSON)
	}
	if err := db.Model(&config).Updates(updates).Error; err != nil {
		return nil, err
	}
	view := mcpConfigView(config, "")
	return &view, nil
}

func RotateProjectMCPConfigToken(db *gorm.DB, teamID, projectID, configID string) (*MCPConfigView, error) {
	var config models.MCPConfig
	if err := db.First(&config, "id = ? AND team_id = ? AND project_id = ?", configID, teamID, projectID).Error; err != nil {
		return nil, err
	}
	token, err := generateMCPToken()
	if err != nil {
		return nil, err
	}
	if err := db.Model(&config).Updates(map[string]interface{}{
		"token_hash":    hashMCPToken(token),
		"token_preview": previewToken(token),
		"status":        models.MCPConfigActive,
	}).Error; err != nil {
		return nil, err
	}
	config.TokenHash = hashMCPToken(token)
	config.TokenPreview = previewToken(token)
	config.Status = models.MCPConfigActive
	view := mcpConfigView(config, token)
	return &view, nil
}

func ListMCPAuditLogs(db *gorm.DB, teamID, projectID string, offset, limit int) ([]models.MCPAuditLog, int64, error) {
	var items []models.MCPAuditLog
	var total int64
	if limit <= 0 || limit > 200 {
		limit = 100
	}
	query := db.Model(&models.MCPAuditLog{}).Where("team_id = ? AND project_id = ?", teamID, projectID)
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	if err := query.Order("created_at desc").Offset(offset).Limit(limit).Find(&items).Error; err != nil {
		return nil, 0, err
	}
	return items, total, nil
}

func ValidateMCPAccessToken(db *gorm.DB, token, teamID, projectID string) (*MCPAccessContext, error) {
	if token == "" {
		return nil, errors.New("MCP token required")
	}
	var config models.MCPConfig
	err := db.First(&config, "token_hash = ? AND team_id = ? AND project_id = ? AND status = ?", hashMCPToken(token), teamID, projectID, models.MCPConfigActive).Error
	if err != nil {
		return nil, err
	}
	if config.ExpiresAt != nil && config.ExpiresAt.Before(time.Now()) {
		return nil, errors.New("MCP token expired")
	}
	now := time.Now()
	_ = db.Model(&config).Update("last_used_at", &now).Error
	config.LastUsedAt = &now
	return &MCPAccessContext{Config: config, ToolScope: parseToolScope(config.ToolScopeJSON)}, nil
}

func ExecuteMCPQuery(db *gorm.DB, req MCPQueryRequest) (interface{}, *MCPAccessContext, error) {
	ctx, err := ValidateMCPAccessToken(db, req.Token, req.TeamID, req.ProjectID)
	if err != nil {
		return nil, nil, err
	}
	if !toolAllowed(ctx.ToolScope, req.Tool) {
		return nil, ctx, fmt.Errorf("MCP tool %s is not allowed", req.Tool)
	}
	args := req.Args
	if args == nil {
		args = req.Arguments
	}

	switch req.Tool {
	case "get_project_entities":
		var items []models.DataModel
		err = db.Where("team_id = ? AND project_id = ?", req.TeamID, req.ProjectID).Order("name").Limit(500).Find(&items).Error
		return map[string]interface{}{"items": items, "total": len(items)}, ctx, err
	case "get_project_apis":
		var items []models.APIEndpoint
		err = db.Where("team_id = ? AND project_id = ?", req.TeamID, req.ProjectID).Order("path, method").Limit(500).Find(&items).Error
		return map[string]interface{}{"items": items, "total": len(items)}, ctx, err
	case "get_entity_dependencies":
		var items []models.Dependency
		name := stringArg(args, "model_name")
		if name == "" {
			name = stringArg(args, "entity_name")
		}
		query := db.Where("team_id = ? AND (source_project_id = ? OR target_project_id = ?)", req.TeamID, req.ProjectID, req.ProjectID)
		if name != "" {
			query = query.Where("entity_name = ?", name)
		}
		err = query.Order("created_at desc").Limit(500).Find(&items).Error
		return map[string]interface{}{"referenced_by": items}, ctx, err
	case "get_api_dependencies":
		var items []models.Dependency
		path := stringArg(args, "api_path")
		method := stringArg(args, "api_method")
		query := db.Where("team_id = ? AND (source_project_id = ? OR target_project_id = ?)", req.TeamID, req.ProjectID, req.ProjectID)
		if path != "" {
			query = query.Where("api_path = ?", path)
		}
		if method != "" {
			query = query.Where("api_method = ?", strings.ToUpper(method))
		}
		err = query.Order("created_at desc").Limit(500).Find(&items).Error
		return map[string]interface{}{"referenced_by": items}, ctx, err
	case "validate_entity_usage":
		name := stringArg(args, "model_name")
		if name == "" {
			name = stringArg(args, "entity_name")
		}
		return validateEntityUsage(db, req.TeamID, req.ProjectID, name), ctx, nil
	default:
		return nil, ctx, fmt.Errorf("unknown MCP tool %s", req.Tool)
	}
}

func CreateMCPAuditLog(db *gorm.DB, input MCPAuditInput) (*models.MCPAuditLog, error) {
	configID := input.MCPConfigID
	if input.Token != "" {
		ctx, err := ValidateMCPAccessToken(db, input.Token, input.TeamID, input.ProjectID)
		if err != nil {
			return nil, err
		}
		configID = ctx.Config.ID
	}
	if configID == "" {
		return nil, errors.New("MCP audit requires a valid token or config id")
	}
	item := &models.MCPAuditLog{
		TeamID:        input.TeamID,
		ProjectID:     input.ProjectID,
		MCPConfigID:   configID,
		ToolName:      input.ToolName,
		Caller:        input.Caller,
		ParamsSummary: input.ParamsSummary,
		ResultStatus:  input.ResultStatus,
		ErrorMessage:  input.ErrorMessage,
	}
	if item.ResultStatus == "" {
		item.ResultStatus = "success"
	}
	if err := db.Create(item).Error; err != nil {
		return nil, err
	}
	return item, nil
}

func BuildMCPServiceStatus(configs []MCPConfigView) MCPServiceStatus {
	status := MCPServiceStatus{State: "no_token", Reason: "尚未生成当前项目 MCP Token"}
	activeCount := 0
	var lastUsed *time.Time
	for i := range configs {
		if configs[i].Status == models.MCPConfigActive {
			activeCount++
			if configs[i].LastUsedAt != nil && (lastUsed == nil || configs[i].LastUsedAt.After(*lastUsed)) {
				lastUsed = configs[i].LastUsedAt
			}
		}
	}
	status.ActiveTokens = activeCount
	if activeCount == 0 {
		return status
	}
	status.State = "ready"
	status.Ready = true
	status.Reason = "当前项目 MCP Token 已就绪"
	if lastUsed != nil && time.Since(*lastUsed) < 5*time.Minute {
		status.State = "connected"
		status.Connected = true
		status.Reason = "本地 MCP 服务最近访问过当前项目"
		status.LastConnectedAt = lastUsed
	}
	return status
}

func mcpConfigView(config models.MCPConfig, token string) MCPConfigView {
	return MCPConfigView{
		MCPConfig: config,
		ToolScope: parseToolScope(config.ToolScopeJSON),
		Token:     token,
	}
}

func generateMCPToken() (string, error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return "sk-mcp-" + base64.RawURLEncoding.EncodeToString(buf), nil
}

func hashMCPToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

func previewToken(token string) string {
	if len(token) <= 12 {
		return token
	}
	return token[:8] + "..." + token[len(token)-4:]
}

func parseToolScope(raw string) []string {
	var tools []string
	_ = json.Unmarshal([]byte(raw), &tools)
	if len(tools) == 0 {
		return DefaultMCPTools
	}
	return filterMCPTools(tools)
}

func filterMCPTools(input []string) []string {
	allowed := map[string]bool{}
	for _, tool := range DefaultMCPTools {
		allowed[tool] = true
	}
	out := make([]string, 0, len(input))
	seen := map[string]bool{}
	for _, tool := range input {
		if allowed[tool] && !seen[tool] {
			out = append(out, tool)
			seen[tool] = true
		}
	}
	if len(out) == 0 {
		return DefaultMCPTools
	}
	return out
}

func toolAllowed(scope []string, tool string) bool {
	for _, item := range scope {
		if item == tool {
			return true
		}
	}
	return false
}

func stringArg(args map[string]interface{}, key string) string {
	if args == nil {
		return ""
	}
	value, ok := args[key]
	if !ok || value == nil {
		return ""
	}
	return strings.TrimSpace(fmt.Sprint(value))
}

func validateEntityUsage(db *gorm.DB, teamID, projectID, entityName string) map[string]interface{} {
	if entityName == "" {
		return map[string]interface{}{"valid": false, "reason": "entity_name is required"}
	}
	var entity models.DataModel
	err := db.Where("team_id = ? AND project_id = ? AND name = ?", teamID, projectID, entityName).First(&entity).Error
	if err != nil {
		return map[string]interface{}{"valid": false, "reason": "entity not found in current project context"}
	}
	return map[string]interface{}{"valid": true, "entity": entity}
}
