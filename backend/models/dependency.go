package models

import (
	"time"

	"gorm.io/gorm"
)

type Dependency struct {
	ID              string    `json:"id" gorm:"primaryKey;size:36"`
	TeamID          string    `json:"team_id" gorm:"size:36;not null;index"`
	SourceProjectID string    `json:"source_project_id" gorm:"size:36;not null;index"`
	TargetProjectID string    `json:"target_project_id" gorm:"size:36;not null;index"`
	EntityName      string    `json:"entity_name" gorm:"size:256;not null"`
	APIPath         string    `json:"api_path" gorm:"size:512"`
	APIMethod       string    `json:"api_method" gorm:"size:16"`
	DependencyType  string    `json:"dependency_type" gorm:"size:32;default:entity"`
	Source          string    `json:"source" gorm:"size:32;default:manual"`
	LockedVersion   *string   `json:"locked_version" gorm:"size:32"`
	CreatedAt       time.Time `json:"created_at"`

	Team          *Team    `json:"team,omitempty" gorm:"foreignKey:TeamID"`
	SourceProject *Project `json:"source_project,omitempty" gorm:"foreignKey:SourceProjectID"`
	TargetProject *Project `json:"target_project,omitempty" gorm:"foreignKey:TargetProjectID"`
}

func (d *Dependency) BeforeCreate(tx *gorm.DB) error {
	if d.ID == "" {
		d.ID = newUUID()
	}
	return nil
}
