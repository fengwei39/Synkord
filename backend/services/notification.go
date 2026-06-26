package services

import (
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/synkord/core/models"
	"gorm.io/gorm"
)

func CreateChangeSetNotification(db *gorm.DB, changeSet *models.ChangeSet, changeCount int) (*models.Notification, error) {
	if changeSet.TeamID == "" || changeSet.Severity == models.SeverityInfo {
		return nil, nil
	}

	title := fmt.Sprintf("%s 存在%s变更", changeSet.ServiceName, severityLabel(changeSet.Severity))
	summaryParts := []string{
		fmt.Sprintf("版本 %s -> %s", fallbackText(changeSet.OldVersion, "-"), fallbackText(changeSet.NewVersion, "-")),
		fmt.Sprintf("%d 项变更", changeCount),
	}
	if changeSet.Severity == models.SeverityBreaking {
		summaryParts = append(summaryParts, "需要评估依赖项目影响")
	}

	notification := &models.Notification{
		TeamID:         changeSet.TeamID,
		ProjectID:      changeSet.ProjectID,
		ChangeSetID:    &changeSet.ID,
		Severity:       changeSet.Severity,
		Title:          title,
		Summary:        strings.Join(summaryParts, "，"),
		ReadStatus:     models.NotificationUnread,
		DeliveryStatus: models.NotificationDeliveryNotConfigured,
	}
	if err := db.Create(notification).Error; err != nil {
		return nil, err
	}
	return notification, nil
}

func ListTeamNotifications(db *gorm.DB, teamID string, unreadOnly bool, offset, limit int) ([]models.Notification, int64, error) {
	var items []models.Notification
	var total int64
	query := db.Model(&models.Notification{}).Where("team_id = ?", teamID)
	if unreadOnly {
		query = query.Where("read_status = ?", models.NotificationUnread)
	}
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	if err := query.Order("created_at desc").Offset(offset).Limit(limit).Find(&items).Error; err != nil {
		return nil, 0, err
	}
	return items, total, nil
}

func MarkNotificationRead(db *gorm.DB, teamID, notificationID string) (*models.Notification, error) {
	var notification models.Notification
	if err := db.First(&notification, "id = ? AND team_id = ?", notificationID, teamID).Error; err != nil {
		return nil, err
	}
	now := time.Now()
	if err := db.Model(&notification).Updates(map[string]interface{}{
		"read_status": models.NotificationRead,
		"read_at":     &now,
	}).Error; err != nil {
		return nil, err
	}
	notification.ReadStatus = models.NotificationRead
	notification.ReadAt = &now
	return &notification, nil
}

func RetryNotificationDelivery(db *gorm.DB, teamID, notificationID string) (*models.Notification, error) {
	var notification models.Notification
	if err := db.First(&notification, "id = ? AND team_id = ?", notificationID, teamID).Error; err != nil {
		return nil, err
	}
	if notification.DeliveryStatus == models.NotificationDeliveryNotConfigured {
		return &notification, nil
	}
	if notification.DeliveryStatus != models.NotificationDeliveryFailed {
		return nil, errors.New("notification is not retryable")
	}
	if err := db.Model(&notification).Update("delivery_status", models.NotificationDeliveryPending).Error; err != nil {
		return nil, err
	}
	notification.DeliveryStatus = models.NotificationDeliveryPending
	return &notification, nil
}

func severityLabel(severity models.ChangeSeverity) string {
	switch severity {
	case models.SeverityBreaking:
		return "破坏性"
	case models.SeverityWarning:
		return "警告"
	default:
		return "普通"
	}
}

func fallbackText(value, fallback string) string {
	if value == "" {
		return fallback
	}
	return value
}
