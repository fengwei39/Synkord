package models

import (
	"time"

	"gorm.io/gorm"
)

// DataModel 表示项目内的数据模型（原 Entity，重命名以对齐 docs/ai-development-guide.md §6）。
// 保留旧表名 "entities" 与 "entity_versions" 以兼容历史数据。
type DataModel struct {
	ID             string    `json:"id" gorm:"primaryKey;size:36"`
	TeamID         string    `json:"team_id" gorm:"size:36;index;uniqueIndex:idx_team_entity_name"`
	Name           string    `json:"name" gorm:"size:256;not null"`
	Description    string    `json:"description" gorm:"size:512"`
	SchemaContent  string    `json:"schema_content" gorm:"type:text;not null"`
	CurrentVersion string    `json:"current_version" gorm:"size:32;default:1.0.0"`
	VersionCount   int       `json:"version_count" gorm:"default:1"`
	ProjectID      *string   `json:"project_id" gorm:"size:36"`
	CreatedBy      *string   `json:"created_by" gorm:"size:36"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`

	Team     *Team              `json:"team,omitempty" gorm:"foreignKey:TeamID"`
	Project  *Project           `json:"project,omitempty" gorm:"foreignKey:ProjectID"`
	Versions []DataModelVersion `json:"versions,omitempty" gorm:"foreignKey:DataModelID"`
}

// TableName 显式声明使用旧表名 "entities"，避免破坏历史数据。
func (DataModel) TableName() string { return "entities" }

func (d *DataModel) BeforeCreate(tx *gorm.DB) error {
	if d.ID == "" {
		d.ID = newUUID()
	}
	return nil
}

// DataModelVersion 表示数据模型的不可变版本快照（原 EntityVersion）。
// 显式声明使用旧列名 "entity_id" 以兼容历史数据。
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

// TableName 显式声明使用旧表名 "entity_versions"。
func (DataModelVersion) TableName() string { return "entity_versions" }

func (dv *DataModelVersion) BeforeCreate(tx *gorm.DB) error {
	if dv.ID == "" {
		dv.ID = newUUID()
	}
	return nil
}
