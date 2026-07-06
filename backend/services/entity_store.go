// Synkord Entity (DataModel) service
// 数据模型 CRUD
// 详见 docs/requirements.md §四.5

package services

import (
	"errors"
	"fmt"
	"strconv"
	"strings"

	"github.com/synkord/core/models"
	"gorm.io/gorm"
)

// ListContractEntities 列出契约集下的数据模型
func ListContractEntities(db *gorm.DB, contractID, keyword string, offset, limit int) ([]models.DataModel, int64, error) {
	if limit <= 0 || limit > 500 {
		limit = 200
	}
	q := db.Model(&models.DataModel{}).Where("contract_id = ?", contractID)
	if keyword != "" {
		like := "%" + keyword + "%"
		q = q.Where("name LIKE ? OR description LIKE ?", like, like)
	}
	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var entities []models.DataModel
	if err := q.Order("name").Offset(offset).Limit(limit).Find(&entities).Error; err != nil {
		return nil, 0, err
	}
	return entities, total, nil
}

// GetContractEntity 获取单个数据模型
func GetContractEntity(db *gorm.DB, contractID, entityID string) (*models.DataModel, error) {
	var e models.DataModel
	if err := db.Where("id = ? AND contract_id = ?", entityID, contractID).First(&e).Error; err != nil {
		return nil, err
	}
	return &e, nil
}

// CreateContractEntity 创建数据模型
func CreateContractEntity(db *gorm.DB, contractID string, name, description, schemaContent string, userID string) (*models.DataModel, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return nil, errors.New("name is required")
	}
	if schemaContent == "" {
		return nil, errors.New("schema_content is required")
	}
	e := &models.DataModel{
		ContractID:     contractID,
		Name:           name,
		Description:    description,
		SchemaContent:  schemaContent,
		CurrentVersion: "1.0.0",
		VersionCount:   1,
		CreatedBy:      &userID,
	}
	if err := db.Create(e).Error; err != nil {
		return nil, err
	}

	v := &models.DataModelVersion{
		DataModelID:      e.ID,
		VersionNumber: "1.0.0",
		SchemaContent: schemaContent,
		ChangeSummary: "Initial version",
		CreatedBy:     &userID,
	}
	db.Create(v)

	return e, nil
}

// UpdateContractEntity 更新数据模型
func UpdateContractEntity(db *gorm.DB, contractID, entityID, userID string, name, description, schemaContent, changeSummary *string) (*models.DataModel, error) {
	var e models.DataModel
	if err := db.Where("id = ? AND contract_id = ?", entityID, contractID).First(&e).Error; err != nil {
		return nil, err
	}

	newSchema := e.SchemaContent
	if schemaContent != nil {
		newSchema = *schemaContent
		e.SchemaContent = *schemaContent
	}
	if name != nil {
		e.Name = *name
	}
	if description != nil {
		e.Description = *description
	}

	e.CurrentVersion = bumpVersion(e.CurrentVersion)
	e.VersionCount++

	summary := "Update"
	if changeSummary != nil && *changeSummary != "" {
		summary = *changeSummary
	}

	v := &models.DataModelVersion{
		DataModelID:      e.ID,
		VersionNumber: e.CurrentVersion,
		SchemaContent: newSchema,
		ChangeSummary: summary,
		CreatedBy:     &userID,
	}
	db.Create(v)

	if err := db.Save(&e).Error; err != nil {
		return nil, err
	}
	return &e, nil
}

// DeleteContractEntity 删除数据模型
func DeleteContractEntity(db *gorm.DB, contractID, entityID string) error {
	return db.Where("id = ? AND contract_id = ?", entityID, contractID).Delete(&models.DataModel{}).Error
}

// GetEntityDependencies 获取数据模型的依赖关系
func GetEntityDependencies(db *gorm.DB, contractID, entityName string) (map[string]interface{}, error) {
	entity, err := GetContractEntityByName(db, contractID, entityName)
	if err != nil {
		return nil, err
	}
	// 引用了哪些实体（字段类型引用）
	var refs []models.Dependency
	if err := db.Where("contract_id = ? AND entity_name = ? AND dependency_type = ?", contractID, entityName, "entity_entity").Find(&refs).Error; err != nil {
		return nil, err
	}
	referencesEntities := make([]map[string]string, 0, len(refs))
	for _, r := range refs {
		referencesEntities = append(referencesEntities, map[string]string{
			"entity_id":   "",
			"entity_name": r.EntityName,
			"field_name":  r.APIPath,
		})
	}
	// 被哪些 API 使用
	var deps []models.Dependency
	if err := db.Where("contract_id = ? AND entity_name = ?", contractID, entityName).Find(&deps).Error; err != nil {
		return nil, err
	}
	usedInApis := make([]map[string]string, 0, len(deps))
	for _, d := range deps {
		usedInApis = append(usedInApis, map[string]string{
			"api_id": d.ID,
			"path":   d.APIPath,
			"method": d.APIMethod,
			"usage":  d.DependencyType,
		})
	}
	return map[string]interface{}{
		"entity": map[string]interface{}{
			"entity_id": entity.ID,
			"name":      entity.Name,
		},
		"references_entities": referencesEntities,
		"used_in_apis":        usedInApis,
	}, nil
}

// GetContractEntityByName 按 name 查找实体
func GetContractEntityByName(db *gorm.DB, contractID, name string) (*models.DataModel, error) {
	var e models.DataModel
	if err := db.Where("contract_id = ? AND name = ?", contractID, name).First(&e).Error; err != nil {
		return nil, err
	}
	return &e, nil
}

// GetEntityVersions 获取实体的版本历史
func GetEntityVersions(db *gorm.DB, entityID string) ([]models.DataModelVersion, error) {
	var versions []models.DataModelVersion
	if err := db.Where("entity_id = ?", entityID).Order("created_at desc").Find(&versions).Error; err != nil {
		return nil, err
	}
	return versions, nil
}

func bumpVersion(current string) string {
	parts := strings.Split(current, ".")
	major, _ := strconv.Atoi(parts[0])
	minor := 0
	if len(parts) > 1 {
		minor, _ = strconv.Atoi(parts[1])
	}
	return fmt.Sprintf("%d.%d.0", major, minor+1)
}