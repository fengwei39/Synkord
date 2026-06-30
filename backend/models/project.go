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
	TeamID         string      `json:"team_id" gorm:"size:36;index;uniqueIndex:idx_team_project_name"`
	Name           string      `json:"name" gorm:"size:128;not null;uniqueIndex:idx_team_project_name"`
	Description    string      `json:"description" gorm:"size:512"`
	ProjectType    ProjectType `json:"project_type" gorm:"size:16;not null"`
	Owner          string      `json:"owner" gorm:"size:128"`
	RepoURL        string      `json:"repo_url" gorm:"size:512"`
	SwaggerURL     string      `json:"swagger_url" gorm:"size:1024"`
	OpenAPIVersion string      `json:"openapi_version" gorm:"size:32"`
	OpenAPISpec    string      `json:"openapi_spec" gorm:"type:text"`
	CreatedAt      time.Time   `json:"created_at"`
	UpdatedAt      time.Time   `json:"updated_at"`

	Team                 *Team         `json:"team,omitempty" gorm:"foreignKey:TeamID"`
	Entities             []DataModel      `json:"-" gorm:"foreignKey:ProjectID"`
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
