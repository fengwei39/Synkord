package models

import (
	"time"

	"gorm.io/gorm"
)

type Entity struct {
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

	Team     *Team           `json:"team,omitempty" gorm:"foreignKey:TeamID"`
	Project  *Project        `json:"project,omitempty" gorm:"foreignKey:ProjectID"`
	Versions []EntityVersion `json:"versions,omitempty" gorm:"foreignKey:EntityID"`
}

func (e *Entity) BeforeCreate(tx *gorm.DB) error {
	if e.ID == "" {
		e.ID = newUUID()
	}
	return nil
}

type EntityVersion struct {
	ID            string    `json:"id" gorm:"primaryKey;size:36"`
	EntityID      string    `json:"entity_id" gorm:"size:36;not null;index"`
	VersionNumber string    `json:"version_number" gorm:"size:32;not null"`
	SchemaContent string    `json:"schema_content" gorm:"type:text;not null"`
	ChangeSummary string    `json:"change_summary" gorm:"size:512"`
	CreatedBy     *string   `json:"created_by" gorm:"size:36"`
	CreatedAt     time.Time `json:"created_at"`

	Entity *Entity `json:"-" gorm:"foreignKey:EntityID"`
}

func (ev *EntityVersion) BeforeCreate(tx *gorm.DB) error {
	if ev.ID == "" {
		ev.ID = newUUID()
	}
	return nil
}
