package models

import (
	"time"

	"gorm.io/gorm"
)

// SpecSource 标识 SwaggerSpec 内容的来源类型
type SpecSource string

const (
	SpecSourceOpenAPI SpecSource = "openapi"
	SpecSourceSwagger SpecSource = "swagger"
	SpecSourcePostman SpecSource = "postman"
)

// SwaggerSpec 是契约集级接口契约的版本化快照。
//
// 同一 (contract_id, name) 可以存在多个版本，按 version 排序取最新。
// 每次 import 都会创建新行（不覆盖 APIEndpoint）。
type SwaggerSpec struct {
	ID             string     `json:"id" gorm:"primaryKey;size:36"`
	ContractID     string     `json:"contract_id" gorm:"size:36;not null;index;index:idx_contract_spec_name"`
	Name           string     `json:"name" gorm:"size:256;not null;index:idx_contract_spec_name"`
	Version        string     `json:"version" gorm:"size:32;not null"`
	Source         SpecSource `json:"source" gorm:"size:16;not null"`
	SpecContent    string     `json:"spec_content" gorm:"type:text;not null"`
	OpenAPIVersion string     `json:"openapi_version" gorm:"size:32"`
	ChangeSummary  string     `json:"change_summary" gorm:"size:512"`
	APICount       int        `json:"api_count" gorm:"default:0"`
	ImportedBy     *string    `json:"imported_by" gorm:"size:36"`
	CreatedAt      time.Time  `json:"created_at"`

	ContractSet *ContractSet `json:"-" gorm:"foreignKey:ContractID"`
}

func (s *SwaggerSpec) BeforeCreate(tx *gorm.DB) error {
	if s.ID == "" {
		s.ID = newUUID()
	}
	return nil
}