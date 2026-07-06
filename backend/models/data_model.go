package models

import (
	"time"

	"gorm.io/gorm"
)

// DataModel 数据模型（属于 ContractSet）
//
// 命名说明：
// - 业务概念为"数据模型"（Entity）
// - 数据库表名保留为 entities 以兼容历史数据
type DataModel struct {
	ID             string    `json:"id" gorm:"primaryKey;size:36"`
	ContractID     string    `json:"contract_id" gorm:"size:36;not null;uniqueIndex:idx_contract_entity_name"`
	Name           string    `json:"name" gorm:"size:256;not null;uniqueIndex:idx_contract_entity_name"`
	Description    string    `json:"description" gorm:"size:512"`
	SchemaContent  string    `json:"schema_content" gorm:"type:text;not null"`
	CurrentVersion string    `json:"current_version" gorm:"size:32;default:1.0.0"`
	VersionCount   int       `json:"version_count" gorm:"default:1"`
	CreatedBy      *string   `json:"created_by" gorm:"size:36"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`

	ContractSet *ContractSet        `json:"-" gorm:"foreignKey:ContractID"`
	Versions    []DataModelVersion  `json:"-" gorm:"foreignKey:DataModelID"`
}

func (DataModel) TableName() string { return "entities" }

func (d *DataModel) BeforeCreate(tx *gorm.DB) error {
	if d.ID == "" {
		d.ID = newUUID()
	}
	return nil
}

// DataModelVersion 数据模型的不可变版本快照
type DataModelVersion struct {
	ID            string    `json:"id" gorm:"primaryKey;size:36"`
	DataModelID   string    `json:"data_model_id" gorm:"column:entity_id;size:36;not null;index"`
	VersionNumber string    `json:"version_number" gorm:"size:32;not null"`
	SchemaContent string    `json:"schema_content" gorm:"type:text;not null"`
	ChangeSummary string    `json:"change_summary" gorm:"size:512"`
	CreatedBy     *string   `json:"created_by" gorm:"size:36"`
	CreatedAt     time.Time `json:"created_at"`

	DataModel *DataModel `json:"-" gorm:"foreignKey:DataModelID"`
}

func (DataModelVersion) TableName() string { return "entity_versions" }

func (dv *DataModelVersion) BeforeCreate(tx *gorm.DB) error {
	if dv.ID == "" {
		dv.ID = newUUID()
	}
	return nil
}