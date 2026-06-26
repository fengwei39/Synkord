package services

import (
	"encoding/json"
	"fmt"
	"strconv"
	"strings"

	"github.com/synkord/core/models"
	"gorm.io/gorm"
)

func CreateEntity(db *gorm.DB, name, description, schemaContent string, isGlobal bool, projectID, userID *string) (*models.Entity, error) {
	e := &models.Entity{
		Name:           name,
		Description:    description,
		IsGlobal:       isGlobal,
		SchemaContent:  schemaContent,
		CurrentVersion: "1.0.0",
		VersionCount:   1,
		ProjectID:      projectID,
		CreatedBy:      userID,
	}
	if err := db.Create(e).Error; err != nil {
		return nil, err
	}

	v := &models.EntityVersion{
		EntityID:      e.ID,
		VersionNumber: "1.0.0",
		SchemaContent: schemaContent,
		ChangeSummary: "Initial version",
		CreatedBy:     userID,
	}
	db.Create(v)

	return e, nil
}

func CreateTeamEntity(db *gorm.DB, teamID, name, description, schemaContent string, isTeamModel bool, projectID, userID *string) (*models.Entity, error) {
	e := &models.Entity{
		TeamID:         teamID,
		Name:           name,
		Description:    description,
		IsGlobal:       isTeamModel,
		SchemaContent:  schemaContent,
		CurrentVersion: "1.0.0",
		VersionCount:   1,
		ProjectID:      projectID,
		CreatedBy:      userID,
	}
	if err := db.Create(e).Error; err != nil {
		return nil, err
	}

	v := &models.EntityVersion{
		EntityID:      e.ID,
		VersionNumber: "1.0.0",
		SchemaContent: schemaContent,
		ChangeSummary: "Initial version",
		CreatedBy:     userID,
	}
	db.Create(v)

	return e, nil
}

func UpdateEntity(db *gorm.DB, entityID string, name, description, schemaContent, changeSummary *string, userID *string) (*models.Entity, error) {
	var e models.Entity
	if err := db.First(&e, "id = ?", entityID).Error; err != nil {
		return nil, err
	}

	oldSchema := e.SchemaContent
	newSchema := oldSchema
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

	isBreaking := detectBreaking(oldSchema, newSchema)
	newVersion := bumpVersion(e.CurrentVersion, isBreaking)

	e.CurrentVersion = newVersion
	e.VersionCount++

	summary := "Update"
	if changeSummary != nil && *changeSummary != "" {
		summary = *changeSummary
	} else if isBreaking {
		summary = "Breaking change"
	}

	v := &models.EntityVersion{
		EntityID:      e.ID,
		VersionNumber: newVersion,
		SchemaContent: newSchema,
		ChangeSummary: summary,
		CreatedBy:     userID,
	}
	db.Create(v)

	if err := db.Save(&e).Error; err != nil {
		return nil, err
	}
	return &e, nil
}

func UpdateTeamEntity(db *gorm.DB, teamID, entityID string, name, description, schemaContent, changeSummary *string, userID *string) (*models.Entity, error) {
	var e models.Entity
	if err := db.First(&e, "id = ? AND team_id = ?", entityID, teamID).Error; err != nil {
		return nil, err
	}

	oldSchema := e.SchemaContent
	newSchema := oldSchema
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

	isBreaking := detectBreaking(oldSchema, newSchema)
	newVersion := bumpVersion(e.CurrentVersion, isBreaking)

	e.CurrentVersion = newVersion
	e.VersionCount++

	summary := "Update"
	if changeSummary != nil && *changeSummary != "" {
		summary = *changeSummary
	} else if isBreaking {
		summary = "Breaking change"
	}

	v := &models.EntityVersion{
		EntityID:      e.ID,
		VersionNumber: newVersion,
		SchemaContent: newSchema,
		ChangeSummary: summary,
		CreatedBy:     userID,
	}
	db.Create(v)

	if err := db.Save(&e).Error; err != nil {
		return nil, err
	}
	return &e, nil
}

func GetEntity(db *gorm.DB, entityID string) (*models.Entity, error) {
	var e models.Entity
	if err := db.Preload("Project").First(&e, "id = ?", entityID).Error; err != nil {
		return nil, err
	}
	return &e, nil
}

func GetTeamEntity(db *gorm.DB, teamID, entityID string) (*models.Entity, error) {
	var e models.Entity
	if err := db.Preload("Project").First(&e, "id = ? AND team_id = ?", entityID, teamID).Error; err != nil {
		return nil, err
	}
	return &e, nil
}

func GetGlobalEntities(db *gorm.DB) ([]models.Entity, error) {
	var entities []models.Entity
	if err := db.Where("is_global = ?", true).Order("name").Find(&entities).Error; err != nil {
		return nil, err
	}
	return entities, nil
}

func GetServiceEntities(db *gorm.DB, projectID string) ([]models.Entity, error) {
	var entities []models.Entity
	if err := db.Where("project_id = ? OR is_global = ?", projectID, true).Order("name").Find(&entities).Error; err != nil {
		return nil, err
	}
	return entities, nil
}

func ListEntities(db *gorm.DB, projectID *string, isGlobal *bool, offset, limit int) ([]models.Entity, int64, error) {
	var entities []models.Entity
	var total int64

	query := db.Model(&models.Entity{})
	if projectID != nil {
		query = query.Where("project_id = ?", *projectID)
	}
	if isGlobal != nil {
		query = query.Where("is_global = ?", *isGlobal)
	}

	query.Count(&total)
	if err := query.Order("name").Offset(offset).Limit(limit).Find(&entities).Error; err != nil {
		return nil, 0, err
	}
	return entities, total, nil
}

func ListTeamEntities(db *gorm.DB, teamID string, projectID *string, isTeamModel *bool, offset, limit int) ([]models.Entity, int64, error) {
	var entities []models.Entity
	var total int64

	query := db.Model(&models.Entity{}).Where("team_id = ?", teamID)
	if projectID != nil {
		query = query.Where("project_id = ?", *projectID)
	}
	if isTeamModel != nil {
		query = query.Where("is_global = ?", *isTeamModel)
	}

	query.Count(&total)
	if err := query.Order("name").Offset(offset).Limit(limit).Find(&entities).Error; err != nil {
		return nil, 0, err
	}
	return entities, total, nil
}

func GetEntityVersions(db *gorm.DB, entityID string) ([]models.EntityVersion, error) {
	var versions []models.EntityVersion
	if err := db.Where("entity_id = ?", entityID).Order("created_at desc").Find(&versions).Error; err != nil {
		return nil, err
	}
	return versions, nil
}

func DeleteEntity(db *gorm.DB, entityID string) error {
	return db.Delete(&models.Entity{}, "id = ?", entityID).Error
}

func DeleteTeamEntity(db *gorm.DB, teamID, entityID string) error {
	return db.Delete(&models.Entity{}, "id = ? AND team_id = ?", entityID, teamID).Error
}

func bumpVersion(current string, isBreaking bool) string {
	parts := strings.Split(current, ".")
	major, _ := strconv.Atoi(parts[0])
	minor := 0
	if len(parts) > 1 {
		minor, _ = strconv.Atoi(parts[1])
	}
	if isBreaking {
		return fmt.Sprintf("%d.0.0", major+1)
	}
	return fmt.Sprintf("%d.%d.0", major, minor+1)
}

func detectBreaking(oldSchema, newSchema string) bool {
	var oldMap, newMap map[string]interface{}
	if err := json.Unmarshal([]byte(oldSchema), &oldMap); err != nil {
		return true
	}
	if err := json.Unmarshal([]byte(newSchema), &newMap); err != nil {
		return true
	}

	oldProps, _ := oldMap["properties"].(map[string]interface{})
	newProps, _ := newMap["properties"].(map[string]interface{})

	for key := range oldProps {
		if _, ok := newProps[key]; !ok {
			return true
		}
	}

	oldReq := toStringSet(oldMap["required"])
	newReq := toStringSet(newMap["required"])
	for k := range newReq {
		if !oldReq[k] {
			return true
		}
	}

	for key, oldVal := range oldProps {
		if newVal, ok := newProps[key]; ok {
			oldObj, _ := oldVal.(map[string]interface{})
			newObj, _ := newVal.(map[string]interface{})
			if oldObj["type"] != newObj["type"] {
				return true
			}
		}
	}

	return false
}

func toStringSet(v interface{}) map[string]bool {
	result := make(map[string]bool)
	arr, ok := v.([]interface{})
	if !ok {
		return result
	}
	for _, item := range arr {
		s, ok := item.(string)
		if ok {
			result[s] = true
		}
	}
	return result
}
