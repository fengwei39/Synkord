package services

import (
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/synkord/core/models"
	"gorm.io/gorm"
)

type WebhookConfigInput struct {
	Enabled       bool                   `json:"enabled"`
	Provider      models.WebhookProvider `json:"provider"`
	WebhookURL    string                 `json:"webhook_url"`
	NotifyWarning bool                   `json:"notify_warning"`
}

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
		TeamID:      changeSet.TeamID,
		ProjectID:   changeSet.ProjectID,
		ChangeSetID: &changeSet.ID,
		Severity:    changeSet.Severity,
		Title:       title,
		Summary:     strings.Join(summaryParts, "，"),
		ReadStatus:  models.NotificationUnread,
	}
	notification.DeliveryStatus, notification.DeliveryError = deliverWebhookForChangeSet(db, changeSet, notification.Title, notification.Summary)
	if err := db.Create(notification).Error; err != nil {
		return nil, err
	}
	return notification, nil
}

func GetWebhookConfig(db *gorm.DB, teamID string) (*models.WebhookConfig, error) {
	var config models.WebhookConfig
	if err := db.First(&config, "team_id = ?", teamID).Error; err != nil {
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, err
		}
		config = models.WebhookConfig{
			TeamID:        teamID,
			Enabled:       false,
			Provider:      models.WebhookProviderDingTalk,
			NotifyWarning: false,
		}
		if err := db.Create(&config).Error; err != nil {
			return nil, err
		}
	}
	return &config, nil
}

func UpdateWebhookConfig(db *gorm.DB, teamID string, input WebhookConfigInput) (*models.WebhookConfig, error) {
	if input.Provider == "" {
		input.Provider = models.WebhookProviderDingTalk
	}
	if input.Provider != models.WebhookProviderDingTalk && input.Provider != models.WebhookProviderFeishu {
		return nil, errors.New("invalid webhook provider")
	}
	config, err := GetWebhookConfig(db, teamID)
	if err != nil {
		return nil, err
	}
	if err := db.Model(config).Updates(map[string]interface{}{
		"enabled":        input.Enabled,
		"provider":       input.Provider,
		"webhook_url":    strings.TrimSpace(input.WebhookURL),
		"notify_warning": input.NotifyWarning,
	}).Error; err != nil {
		return nil, err
	}
	config.Enabled = input.Enabled
	config.Provider = input.Provider
	config.WebhookURL = strings.TrimSpace(input.WebhookURL)
	config.NotifyWarning = input.NotifyWarning
	return config, nil
}

func TestWebhookConfig(db *gorm.DB, teamID string) error {
	config, err := GetWebhookConfig(db, teamID)
	if err != nil {
		return err
	}
	if !config.Enabled {
		return errors.New("webhook is disabled")
	}
	if strings.TrimSpace(config.WebhookURL) == "" {
		return errors.New("webhook url is required")
	}
	return sendWebhook(config, "Synkord Webhook 测试", "这是一条来自 Synkord 的团队 Webhook 测试消息。")
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
	status, deliveryErr := deliverWebhook(db, teamID, notification.Severity, notification.Title, notification.Summary)
	if err := db.Model(&notification).Updates(map[string]interface{}{
		"delivery_status": status,
		"delivery_error":  deliveryErr,
	}).Error; err != nil {
		return nil, err
	}
	notification.DeliveryStatus = status
	notification.DeliveryError = deliveryErr
	return &notification, nil
}

func deliverWebhookForChangeSet(db *gorm.DB, changeSet *models.ChangeSet, title, summary string) (models.NotificationDeliveryStatus, string) {
	return deliverWebhook(db, changeSet.TeamID, changeSet.Severity, title, summary)
}

func deliverWebhook(db *gorm.DB, teamID string, severity models.ChangeSeverity, title, summary string) (models.NotificationDeliveryStatus, string) {
	config, err := GetWebhookConfig(db, teamID)
	if err != nil {
		return models.NotificationDeliveryFailed, err.Error()
	}
	if !config.Enabled {
		return models.NotificationDeliveryDisabled, ""
	}
	if strings.TrimSpace(config.WebhookURL) == "" {
		return models.NotificationDeliveryNotConfigured, ""
	}
	if severity == models.SeverityWarning && !config.NotifyWarning {
		return models.NotificationDeliveryDisabled, ""
	}
	if severity != models.SeverityWarning && severity != models.SeverityBreaking {
		return models.NotificationDeliveryDisabled, ""
	}
	if err := sendWebhook(config, title, summary); err != nil {
		return models.NotificationDeliveryFailed, err.Error()
	}
	return models.NotificationDeliverySent, ""
}

func sendWebhook(config *models.WebhookConfig, title, content string) error {
	switch config.Provider {
	case models.WebhookProviderDingTalk:
		return SendDingTalkNotification(config.WebhookURL, title, content)
	case models.WebhookProviderFeishu:
		return SendFeishuNotification(config.WebhookURL, title, content)
	default:
		return errors.New("invalid webhook provider")
	}
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
