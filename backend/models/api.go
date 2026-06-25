package models

import (
	"time"

	"gorm.io/gorm"
)

type APIEndpoint struct {
	ID              string    `json:"id" gorm:"primaryKey;size:36"`
	ProjectID       string    `json:"project_id" gorm:"size:36;not null;index"`
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

	Project *Project `json:"project,omitempty" gorm:"foreignKey:ProjectID"`
}

func (a *APIEndpoint) BeforeCreate(tx *gorm.DB) error {
	if a.ID == "" {
		a.ID = newUUID()
	}
	return nil
}

type ChangeSeverity string

const (
	SeverityInfo     ChangeSeverity = "info"
	SeverityWarning  ChangeSeverity = "warning"
	SeverityBreaking ChangeSeverity = "breaking"
)

type ChangeSet struct {
	ID               string         `json:"id" gorm:"primaryKey;size:36"`
	ProjectID        string         `json:"project_id" gorm:"size:36;not null;index"`
	ServiceName      string         `json:"service_name" gorm:"size:128;not null"`
	OldVersion       string         `json:"old_version" gorm:"size:32"`
	NewVersion       string         `json:"new_version" gorm:"size:32"`
	ChangedBy        *string        `json:"changed_by" gorm:"size:36"`
	Severity         ChangeSeverity `json:"severity" gorm:"size:16;index"`
	ChangesJSON      string         `json:"changes_json" gorm:"type:text"`
	AffectedJSON     string         `json:"affected_json" gorm:"type:text"`
	NotificationJSON string         `json:"notification_json" gorm:"type:text"`
	CreatedAt        time.Time      `json:"created_at"`

	Project *Project `json:"project,omitempty" gorm:"foreignKey:ProjectID"`
}

func (c *ChangeSet) BeforeCreate(tx *gorm.DB) error {
	if c.ID == "" {
		c.ID = newUUID()
	}
	return nil
}
