package models

import (
	"time"

	"gorm.io/gorm"
)

// MCPAuditLog MCP 工具调用审计日志（按契约集 + 用户记录）
type MCPAuditLog struct {
	ID            string    `json:"id" gorm:"primaryKey;size:36"`
	ContractID    string    `json:"contract_id" gorm:"size:36;not null;index"`
	UserID        string    `json:"user_id" gorm:"size:36;not null;index"`
	ToolName      string    `json:"tool_name" gorm:"size:128;not null;index"`
	Caller        string    `json:"caller" gorm:"size:128"` // IDE 名称（如 "Cursor"）
	ParamsSummary string    `json:"params_summary" gorm:"size:512"`
	ArgsJSON      string    `json:"args_json" gorm:"type:text"`
	ResultStatus  string    `json:"result_status" gorm:"size:32;not null"` // success / error
	Status        int       `json:"status" gorm:"default:0"`                 // HTTP 状态码
	DurationMs    int       `json:"duration_ms" gorm:"default:0"`
	ErrorMessage  string    `json:"error_message" gorm:"size:512"`
	CreatedAt     time.Time `json:"created_at"`

	ContractSet *ContractSet `json:"-" gorm:"foreignKey:ContractID"`
}

func (m *MCPAuditLog) BeforeCreate(tx *gorm.DB) error {
	if m.ID == "" {
		m.ID = newUUID()
	}
	return nil
}

// MCPStatus MCP 服务运行状态
type MCPStatus struct {
	State          string     `json:"state" gorm:"size:16;default:idle"` // stopped/starting/running/failed/restarting
	PID            *int       `json:"pid,omitempty"`
	Port           *int       `json:"port,omitempty"`
	URL            string     `json:"url,omitempty" gorm:"size:256"`
	StartedAt      *time.Time `json:"started_at,omitempty"`
	LastConnection *time.Time `json:"last_connection,omitempty"`
	LastError      string     `json:"last_error,omitempty" gorm:"size:512"`
	RestartCount   int        `json:"restart_count" gorm:"default:0"`
}

// TableName MCPStatus 是全局单例（不需要按 ID）
func (MCPStatus) TableName() string { return "mcp_status" }

// ActiveContract 当前活跃契约集（Electron MCP 子进程消费）
type ActiveContract struct {
	ID           string    `json:"id" gorm:"primaryKey;size:1;default:s"` // 单行，固定主键 "s"
	ContractID   string    `json:"contract_id" gorm:"size:36;not null"`
	ContractName string    `json:"contract_name" gorm:"size:128;not null"`
	SetBy        string    `json:"set_by" gorm:"size:36"`         // 设置者 user_id
	SetAt        time.Time `json:"set_at"`
}

func (ActiveContract) TableName() string { return "active_contract" }