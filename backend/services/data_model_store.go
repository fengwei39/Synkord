package services

import (
	"fmt"
	"strconv"
	"strings"

	"github.com/synkord/core/models"
	"gorm.io/gorm"
)

func CreateProjectEntity(db *gorm.DB, teamID, projectID, name, description, schemaContent string, userID *string) (*models.DataModel, error) {
	e := &models.DataModel{
		TeamID:         teamID,
		ProjectID:      &projectID,
		Name:           name,
		Description:    description,
		SchemaContent:  schemaContent,
		CurrentVersion: "1.0.0",
		VersionCount:   1,
		CreatedBy:      userID,
	}
	if err := db.Create(e).Error; err != nil {
		return nil, err
	}

	v := &models.DataModelVersion{
		DataModelID:      e.ID,
		VersionNumber: "1.0.0",
		SchemaContent: schemaContent,
		ChangeSummary: "Initial version",
		CreatedBy:     userID,
	}
	db.Create(v)

	return e, nil
}

func UpdateProjectEntity(db *gorm.DB, teamID, projectID, entityID string, name, description, schemaContent, changeSummary *string, userID *string) (*models.DataModel, error) {
	var e models.DataModel
	if err := db.First(&e, "id = ? AND team_id = ? AND project_id = ?", entityID, teamID, projectID).Error; err != nil {
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
		CreatedBy:     userID,
	}
	db.Create(v)

	if err := db.Save(&e).Error; err != nil {
		return nil, err
	}
	return &e, nil
}

func GetProjectEntity(db *gorm.DB, teamID, projectID, entityID string) (*models.DataModel, error) {
	var e models.DataModel
	if err := db.Preload("Project").First(&e, "id = ? AND team_id = ? AND project_id = ?", entityID, teamID, projectID).Error; err != nil {
		return nil, err
	}
	return &e, nil
}

func ListProjectEntities(db *gorm.DB, teamID, projectID string, offset, limit int) ([]models.DataModel, int64, error) {
	var entities []models.DataModel
	var total int64

	query := db.Model(&models.DataModel{}).Where("team_id = ? AND project_id = ?", teamID, projectID)
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	if err := query.Order("name").Offset(offset).Limit(limit).Find(&entities).Error; err != nil {
		return nil, 0, err
	}
	return entities, total, nil
}

func GetDataModelVersions(db *gorm.DB, entityID string) ([]models.DataModelVersion, error) {
	var versions []models.DataModelVersion
	if err := db.Where("entity_id = ?", entityID).Order("created_at desc").Find(&versions).Error; err != nil {
		return nil, err
	}
	return versions, nil
}

func DeleteProjectEntity(db *gorm.DB, teamID, projectID, entityID string) error {
	return db.Delete(&models.DataModel{}, "id = ? AND team_id = ? AND project_id = ?", entityID, teamID, projectID).Error
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
