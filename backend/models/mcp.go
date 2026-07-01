package models

import (
	"time"

	"gorm.io/gorm"
)

// MCPAuditLog MCP 调用审计日志（按用户记录）
type MCPAuditLog struct {
	ID            string    `json:"id" gorm:"primaryKey;size:36"`
	TeamID        string    `json:"team_id" gorm:"size:36;not null;index"`
	ProjectID     string    `json:"project_id" gorm:"size:36;not null;index"`
	UserID        string    `json:"user_id" gorm:"size:36;not null;index"`
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
