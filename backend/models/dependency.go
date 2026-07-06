package models

import (
	"time"

	"gorm.io/gorm"
)

// Dependency 实体 / 接口间的依赖关系（属于 ContractSet）
type Dependency struct {
	ID             string    `json:"id" gorm:"primaryKey;size:36"`
	ContractID     string    `json:"contract_id" gorm:"size:36;not null;index"`
	EntityName     string    `json:"entity_name" gorm:"size:256;not null"`
	APIPath        string    `json:"api_path" gorm:"size:512"`
	APIMethod      string    `json:"api_method" gorm:"size:16"`
	DependencyType string    `json:"dependency_type" gorm:"size:32;default:entity"`
	Source         string    `json:"source" gorm:"size:32;default:manual"`
	LockedVersion  *string   `json:"locked_version" gorm:"size:32"`
	CreatedAt      time.Time `json:"created_at"`

	ContractSet *ContractSet `json:"-" gorm:"foreignKey:ContractID"`
}

func (d *Dependency) BeforeCreate(tx *gorm.DB) error {
	if d.ID == "" {
		d.ID = newUUID()
	}
	return nil
}