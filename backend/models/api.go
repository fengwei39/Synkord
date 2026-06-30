package models

import (
	"time"

	"gorm.io/gorm"
)

type APIEndpoint struct {
	ID              string    `json:"id" gorm:"primaryKey;size:36"`
	TeamID          string    `json:"team_id" gorm:"size:36;not null;index"`
	ProjectID       string    `json:"project_id" gorm:"size:36;not null;index"`
	SpecID          string    `json:"spec_id" gorm:"size:36;index"`
	Path            string    `json:"path" gorm:"size:512;not null;index"`
	Method          string    `json:"method" gorm:"size:16;not null;index"`
	Tag             string    `json:"tag" gorm:"size:128;index"`
	Summary         string    `json:"summary" gorm:"size:512"`
	Description     string    `json:"description" gorm:"type:text"`
	ParametersJSON  string    `json:"parameters_json" gorm:"type:text"`
	RequestBodyJSON string    `json:"request_body_json" gorm:"type:text"`
	ResponsesJSON   string    `json:"responses_json" gorm:"type:text"`
	SecurityJSON    string    `json:"security_json" gorm:"type:text"`
	Deprecated      bool      `json:"deprecated" gorm:"default:false"`
	Version         string    `json:"version" gorm:"size:32"`
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`

	Team    *Team        `json:"team,omitempty" gorm:"foreignKey:TeamID"`
	Project *Project     `json:"project,omitempty" gorm:"foreignKey:ProjectID"`
	Spec    *SwaggerSpec `json:"spec,omitempty" gorm:"foreignKey:SpecID"`
}

func (a *APIEndpoint) BeforeCreate(tx *gorm.DB) error {
	if a.ID == "" {
		a.ID = newUUID()
	}
	return nil
}
