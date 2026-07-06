package models

import (
	"time"

	"gorm.io/gorm"
)

// ContractSetRole 契约集成员角色
type ContractSetRole string

const (
	ContractRoleOwner  ContractSetRole = "owner"
	ContractRoleEditor ContractSetRole = "editor"
	ContractRoleViewer ContractSetRole = "viewer"
)

// ContractSetType 契约集类型
type ContractSetType string

const (
	ContractBackend ContractSetType = "backend"
	ContractWeb     ContractSetType = "web"
	ContractApp     ContractSetType = "app"
)

// ContractSet 是 Synkord 的核心实体。
//
// 命名变更：
// - 旧 "Project" 重命名为 "ContractSet"（避免与子项目/仓库混用）
// - 移除 Team 层级，每个 ContractSet 是独立工作空间
// - 每个 ContractSet 由创建者（CreatorID）拥有 + 管理成员
type ContractSet struct {
	ID          string          `json:"id" gorm:"primaryKey;size:36"`
	Name        string          `json:"name" gorm:"size:128;not null;uniqueIndex:idx_contract_name"`
	ProjectType ContractSetType `json:"project_type" gorm:"size:16;not null"`
	Description string          `json:"description" gorm:"size:512"`
	CreatorID   string          `json:"creator_id" gorm:"size:36;not null;index"`
	Archived    bool            `json:"archived" gorm:"default:false"`
	CreatedAt   time.Time       `json:"created_at"`
	UpdatedAt   time.Time       `json:"updated_at"`
	DeletedAt   gorm.DeletedAt  `json:"-" gorm:"index"`
	// MyRole 仅在 ListUserContracts (JOIN contract_members) 时填充
	MyRole      ContractSetRole `json:"my_role,omitempty" gorm:"-"`

	Creator      *User            `json:"creator,omitempty" gorm:"foreignKey:CreatorID"`
	Members      []ContractMember `json:"-" gorm:"foreignKey:ContractID"`
	APIEndpoints []APIEndpoint    `json:"-" gorm:"foreignKey:ContractID"`
	DataModels   []DataModel      `json:"-" gorm:"foreignKey:ContractID"`
	SwaggerSpecs []SwaggerSpec    `json:"-" gorm:"foreignKey:ContractID"`
	MCPAuditLogs []MCPAuditLog    `json:"-" gorm:"foreignKey:ContractID"`
}

func (c *ContractSet) BeforeCreate(tx *gorm.DB) error {
	if c.ID == "" {
		c.ID = newUUID()
	}
	return nil
}

// ContractMember 契约集成员关系
type ContractMember struct {
	ID         string           `json:"id" gorm:"primaryKey;size:36"`
	ContractID string           `json:"contract_id" gorm:"size:36;not null;uniqueIndex:idx_contract_user"`
	UserID     string           `json:"user_id" gorm:"size:36;not null;uniqueIndex:idx_contract_user"`
	Role       ContractSetRole  `json:"role" gorm:"size:24;not null;default:viewer"`
	InvitedAt  time.Time        `json:"invited_at"`
	AcceptedAt *time.Time       `json:"accepted_at,omitempty"`
	CreatedAt  time.Time        `json:"created_at"`
	UpdatedAt  time.Time        `json:"updated_at"`
	// Username 仅在通过 services.ListContractMembers (JOIN users) 查询时填充
	Username   string           `json:"username,omitempty" gorm:"-"`

	Contract *ContractSet `json:"-" gorm:"foreignKey:ContractID"`
	User     *User        `json:"-" gorm:"foreignKey:UserID"`
}

func (cm *ContractMember) BeforeCreate(tx *gorm.DB) error {
	if cm.ID == "" {
		cm.ID = newUUID()
	}
	if cm.InvitedAt.IsZero() {
		cm.InvitedAt = time.Now()
	}
	return nil
}