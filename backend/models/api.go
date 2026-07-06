package models

import (
	"time"

	"gorm.io/gorm"
)

// APIEndpoint 接口定义（属于 ContractSet）
type APIEndpoint struct {
	ID              string    `json:"id" gorm:"primaryKey;size:36"`
	ContractID      string    `json:"contract_id" gorm:"size:36;not null;index"`
	SpecID          string    `json:"spec_id" gorm:"size:36;index"`
	Path            string    `json:"path" gorm:"size:512;not null;index"`
	Method          string    `json:"method" gorm:"size:16;not null;index"`
	Tags            string    `json:"tags" gorm:"size:512"` // JSON-encoded array
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

	ContractSet *ContractSet `json:"-" gorm:"foreignKey:ContractID"`
	Spec        *SwaggerSpec `json:"-" gorm:"foreignKey:SpecID"`
}

func (a *APIEndpoint) BeforeCreate(tx *gorm.DB) error {
	if a.ID == "" {
		a.ID = newUUID()
	}
	return nil
}