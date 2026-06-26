package services

import (
	"encoding/json"

	"github.com/synkord/core/models"
	"gorm.io/gorm"
)

func SaveChangeSet(db *gorm.DB, projectID string, changedBy *string, result *DiffResult) (*models.ChangeSet, error) {
	var project models.Project
	_ = db.First(&project, "id = ?", projectID).Error
	return SaveTeamChangeSet(db, project.TeamID, projectID, changedBy, result)
}

func SaveTeamChangeSet(db *gorm.DB, teamID, projectID string, changedBy *string, result *DiffResult) (*models.ChangeSet, error) {
	changesJSON, _ := json.Marshal(result.Changes)
	affectedJSON, _ := json.Marshal(result.AffectedProjects)
	severity := models.SeverityInfo
	for _, change := range result.Changes {
		switch change.Severity {
		case string(models.SeverityBreaking):
			severity = models.SeverityBreaking
		case string(models.SeverityWarning):
			if severity != models.SeverityBreaking {
				severity = models.SeverityWarning
			}
		}
	}

	changeSet := &models.ChangeSet{
		TeamID:       teamID,
		ProjectID:    projectID,
		ServiceName:  result.ServiceName,
		OldVersion:   result.OldVersion,
		NewVersion:   result.NewVersion,
		ChangedBy:    changedBy,
		Severity:     severity,
		ChangesJSON:  string(changesJSON),
		AffectedJSON: string(affectedJSON),
	}
	if err := db.Create(changeSet).Error; err != nil {
		return nil, err
	}
	if _, err := CreateChangeSetNotification(db, changeSet, len(result.Changes)); err != nil {
		return nil, err
	}
	return changeSet, nil
}

func ListChangeSets(db *gorm.DB, projectID string, offset, limit int) ([]models.ChangeSet, int64, error) {
	var items []models.ChangeSet
	var total int64
	query := db.Model(&models.ChangeSet{})
	if projectID != "" {
		query = query.Where("project_id = ?", projectID)
	}
	query.Count(&total)
	if err := query.Order("created_at desc").Offset(offset).Limit(limit).Find(&items).Error; err != nil {
		return nil, 0, err
	}
	return items, total, nil
}

func ListTeamChangeSets(db *gorm.DB, teamID, projectID string, offset, limit int) ([]models.ChangeSet, int64, error) {
	var items []models.ChangeSet
	var total int64
	query := db.Model(&models.ChangeSet{}).Where("team_id = ?", teamID)
	if projectID != "" {
		query = query.Where("project_id = ?", projectID)
	}
	query.Count(&total)
	if err := query.Order("created_at desc").Offset(offset).Limit(limit).Find(&items).Error; err != nil {
		return nil, 0, err
	}
	return items, total, nil
}
