package services

import (
	"errors"
	"fmt"
	"strings"

	"github.com/synkord/core/models"
	"gorm.io/gorm"
)

// DefaultMCPTools Synkord 默认提供的 MCP 工具列表
var DefaultMCPTools = []string{
	"get_project_entities",
	"get_project_apis",
	"get_entity_dependencies",
	"get_api_dependencies",
	"validate_entity_usage",
}

type MCPServiceStatus struct {
	State           string `json:"state"`
	Ready           bool   `json:"ready"`
	Connected       bool   `json:"connected"`
	Reason          string `json:"reason"`
	LastConnectedAt *int64 `json:"last_connected_at,omitempty"`
}

type ProjectMCPOverview struct {
	TeamID       string           `json:"team_id"`
	ProjectID    string           `json:"project_id"`
	ProjectName  string           `json:"project_name"`
	Status       MCPServiceStatus `json:"status"`
	Tools        []string         `json:"tools"`
	LocalHintURL string           `json:"local_hint_url"`
}

type MCPAuditInput struct {
	TeamID        string `json:"team_id"`
	ProjectID     string `json:"project_id"`
	UserID        string `json:"user_id"`
	ToolName      string `json:"tool_name"`
	Caller        string `json:"caller"`
	ParamsSummary string `json:"params_summary"`
	ResultStatus  string `json:"result_status"`
	ErrorMessage  string `json:"error_message"`
}

// GetProjectMCPOverview 获取项目 MCP 概览
func GetProjectMCPOverview(db *gorm.DB, teamID, projectID string) (*ProjectMCPOverview, error) {
	var project models.Project
	_ = db.Select("id", "name").First(&project, "id = ? AND team_id = ?", projectID, teamID).Error
	return &ProjectMCPOverview{
		TeamID:       teamID,
		ProjectID:    projectID,
		ProjectName:  project.Name,
		Status:       MCPServiceStatus{State: "ready", Ready: true, Reason: "服务已就绪"},
		Tools:        DefaultMCPTools,
		LocalHintURL: "http://127.0.0.1:37991/mcp",
	}, nil
}

// ListMCPAuditLogs 获取调用记录（按用户过滤）
func ListMCPAuditLogs(db *gorm.DB, teamID, projectID, userID string, offset, limit int) ([]models.MCPAuditLog, int64, error) {
	if limit <= 0 || limit > 200 {
		limit = 100
	}
	var items []models.MCPAuditLog
	var total int64
	query := db.Model(&models.MCPAuditLog{}).Where("team_id = ? AND project_id = ?", teamID, projectID)
	if userID != "" {
		query = query.Where("user_id = ?", userID)
	}
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	if err := query.Order("created_at desc").Offset(offset).Limit(limit).Find(&items).Error; err != nil {
		return nil, 0, err
	}
	return items, total, nil
}

// CreateMCPAuditLog 创建审计日志
func CreateMCPAuditLog(db *gorm.DB, input MCPAuditInput) (*models.MCPAuditLog, error) {
	if input.UserID == "" {
		return nil, errors.New("user_id required")
	}
	item := &models.MCPAuditLog{
		TeamID:        input.TeamID,
		ProjectID:     input.ProjectID,
		UserID:        input.UserID,
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

// ExecuteMCPQueryWithUser 以指定用户身份执行 MCP 工具
func ExecuteMCPQueryWithUser(db *gorm.DB, teamID, projectID, userID, tool string, args map[string]interface{}) (interface{}, string, string) {
	if !toolAllowed(tool) {
		return nil, "error", fmt.Sprintf("MCP tool %s is not allowed", tool)
	}

	switch tool {
	case "get_project_entities":
		var items []models.DataModel
		err := db.Where("team_id = ? AND project_id = ?", teamID, projectID).Order("name").Limit(500).Find(&items).Error
		if err != nil {
			return nil, "error", err.Error()
		}
		return map[string]interface{}{"items": items, "total": len(items)}, "success", ""

	case "get_project_apis":
		var items []models.APIEndpoint
		err := db.Where("team_id = ? AND project_id = ?", teamID, projectID).Order("path, method").Limit(500).Find(&items).Error
		if err != nil {
			return nil, "error", err.Error()
		}
		return map[string]interface{}{"items": items, "total": len(items)}, "success", ""

	case "get_entity_dependencies":
		var items []models.Dependency
		name := stringArg(args, "model_name")
		if name == "" {
			name = stringArg(args, "entity_name")
		}
		query := db.Where("team_id = ? AND (source_project_id = ? OR target_project_id = ?)", teamID, projectID, projectID)
		if name != "" {
			query = query.Where("entity_name = ?", name)
		}
		err := query.Order("created_at desc").Limit(500).Find(&items).Error
		if err != nil {
			return nil, "error", err.Error()
		}
		return map[string]interface{}{"referenced_by": items}, "success", ""

	case "get_api_dependencies":
		var items []models.Dependency
		path := stringArg(args, "api_path")
		method := stringArg(args, "api_method")
		query := db.Where("team_id = ? AND (source_project_id = ? OR target_project_id = ?)", teamID, projectID, projectID)
		if path != "" {
			query = query.Where("api_path = ?", path)
		}
		if method != "" {
			query = query.Where("api_method = ?", strings.ToUpper(method))
		}
		err := query.Order("created_at desc").Limit(500).Find(&items).Error
		if err != nil {
			return nil, "error", err.Error()
		}
		return map[string]interface{}{"referenced_by": items}, "success", ""

	case "validate_entity_usage":
		name := stringArg(args, "model_name")
		if name == "" {
			name = stringArg(args, "entity_name")
		}
		if name == "" {
			return map[string]interface{}{"valid": false, "reason": "entity_name is required"}, "success", ""
		}
		var entity models.DataModel
		err := db.Where("team_id = ? AND project_id = ? AND name = ?", teamID, projectID, name).First(&entity).Error
		if err != nil {
			return map[string]interface{}{"valid": false, "reason": "entity not found in current project context"}, "success", ""
		}
		return map[string]interface{}{"valid": true, "entity": entity}, "success", ""

	default:
		return nil, "error", fmt.Sprintf("unknown MCP tool %s", tool)
	}
}

func toolAllowed(tool string) bool {
	for _, t := range DefaultMCPTools {
		if t == tool {
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
