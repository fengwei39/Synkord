package models

import (
	"time"

	"gorm.io/gorm"
)

type ProjectType string

const (
	ProjectBackend ProjectType = "backend"
	ProjectWeb     ProjectType = "web"
	ProjectApp     ProjectType = "app"
)

type Project struct {
	ID             string      `json:"id" gorm:"primaryKey;size:36"`
	Name           string      `json:"name" gorm:"uniqueIndex;size:128;not null"`
	Description    string      `json:"description" gorm:"size:512"`
	ProjectType    ProjectType `json:"project_type" gorm:"size:16;not null"`
	Owner          string      `json:"owner" gorm:"size:128"`
	RepoURL        string      `json:"repo_url" gorm:"size:512"`
	OpenAPIVersion string      `json:"openapi_version" gorm:"size:32"`
	OpenAPISpec    string      `json:"openapi_spec" gorm:"type:text"`
	CreatedAt      time.Time   `json:"created_at"`
	UpdatedAt      time.Time   `json:"updated_at"`

	Entities             []Entity      `json:"-" gorm:"foreignKey:ProjectID"`
	APIEndpoints         []APIEndpoint `json:"-" gorm:"foreignKey:ProjectID"`
	DependenciesAsSource []Dependency  `json:"-" gorm:"foreignKey:SourceProjectID"`
	DependenciesAsTarget []Dependency  `json:"-" gorm:"foreignKey:TargetProjectID"`
}

func (p *Project) BeforeCreate(tx *gorm.DB) error {
	if p.ID == "" {
		p.ID = newUUID()
	}
	return nil
}
