package models

import (
	"time"

	"gorm.io/gorm"
)

type MCPConfigStatus string

const (
	MCPConfigActive   MCPConfigStatus = "active"
	MCPConfigDisabled MCPConfigStatus = "disabled"
)

type MCPConfig struct {
	ID            string          `json:"id" gorm:"primaryKey;size:36"`
	TeamID        string          `json:"team_id" gorm:"size:36;not null;index"`
	ProjectID     string          `json:"project_id" gorm:"size:36;not null;index"`
	Name          string          `json:"name" gorm:"size:128;not null"`
	Purpose       string          `json:"purpose" gorm:"size:64;not null"`
	ToolScopeJSON string          `json:"tool_scope_json" gorm:"type:text"`
	TokenHash     string          `json:"-" gorm:"size:96;not null;uniqueIndex"`
	TokenPreview  string          `json:"token_preview" gorm:"size:32;not null"`
	Status        MCPConfigStatus `json:"status" gorm:"size:16;not null;default:active;index"`
	ExpiresAt     *time.Time      `json:"expires_at"`
	LastUsedAt    *time.Time      `json:"last_used_at"`
	CreatedBy     *string         `json:"created_by" gorm:"size:36"`
	CreatedAt     time.Time       `json:"created_at"`
	UpdatedAt     time.Time       `json:"updated_at"`

	Team    *Team    `json:"team,omitempty" gorm:"foreignKey:TeamID"`
	Project *Project `json:"project,omitempty" gorm:"foreignKey:ProjectID"`
}

func (m *MCPConfig) BeforeCreate(tx *gorm.DB) error {
	if m.ID == "" {
		m.ID = newUUID()
	}
	if m.Status == "" {
		m.Status = MCPConfigActive
	}
	return nil
}

type MCPAuditLog struct {
	ID            string    `json:"id" gorm:"primaryKey;size:36"`
	TeamID        string    `json:"team_id" gorm:"size:36;not null;index"`
	ProjectID     string    `json:"project_id" gorm:"size:36;not null;index"`
	MCPConfigID   string    `json:"mcp_config_id" gorm:"size:36;index"`
	ToolName      string    `json:"tool_name" gorm:"size:128;not null;index"`
	Caller        string    `json:"caller" gorm:"size:128"`
	ParamsSummary string    `json:"params_summary" gorm:"size:512"`
	ResultStatus  string    `json:"result_status" gorm:"size:32;not null"`
	ErrorMessage  string    `json:"error_message" gorm:"size:512"`
	CreatedAt     time.Time `json:"created_at"`
}

func (m *MCPAuditLog) BeforeCreate(tx *gorm.DB) error {
	if m.ID == "" {
		m.ID = newUUID()
	}
	return nil
}
