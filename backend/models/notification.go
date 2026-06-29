package models

import (
	"time"

	"gorm.io/gorm"
)

type NotificationReadStatus string

const (
	NotificationUnread NotificationReadStatus = "unread"
	NotificationRead   NotificationReadStatus = "read"
)

type NotificationDeliveryStatus string

const (
	NotificationDeliveryDisabled      NotificationDeliveryStatus = "disabled"
	NotificationDeliveryNotConfigured NotificationDeliveryStatus = "not_configured"
	NotificationDeliveryPending       NotificationDeliveryStatus = "pending"
	NotificationDeliverySent          NotificationDeliveryStatus = "sent"
	NotificationDeliveryFailed        NotificationDeliveryStatus = "failed"
)

type WebhookProvider string

const (
	WebhookProviderDingTalk WebhookProvider = "dingtalk"
	WebhookProviderFeishu   WebhookProvider = "feishu"
)

type Notification struct {
	ID             string                     `json:"id" gorm:"primaryKey;size:36"`
	TeamID         string                     `json:"team_id" gorm:"size:36;not null;index"`
	ProjectID      string                     `json:"project_id" gorm:"size:36;not null;index"`
	ChangeSetID    *string                    `json:"changeset_id" gorm:"size:36;index"`
	Severity       ChangeSeverity             `json:"severity" gorm:"size:16;not null;index"`
	Title          string                     `json:"title" gorm:"size:256;not null"`
	Summary        string                     `json:"summary" gorm:"type:text"`
	ReadStatus     NotificationReadStatus     `json:"read_status" gorm:"size:16;not null;default:unread;index"`
	DeliveryStatus NotificationDeliveryStatus `json:"delivery_status" gorm:"size:32;not null;default:not_configured;index"`
	DeliveryError  string                     `json:"delivery_error" gorm:"size:512"`
	ReadAt         *time.Time                 `json:"read_at"`
	CreatedAt      time.Time                  `json:"created_at"`
	UpdatedAt      time.Time                  `json:"updated_at"`

	Team      *Team      `json:"team,omitempty" gorm:"foreignKey:TeamID"`
	Project   *Project   `json:"project,omitempty" gorm:"foreignKey:ProjectID"`
	ChangeSet *ChangeSet `json:"changeset,omitempty" gorm:"foreignKey:ChangeSetID"`
}

type WebhookConfig struct {
	TeamID        string          `json:"team_id" gorm:"primaryKey;size:36"`
	Enabled       bool            `json:"enabled" gorm:"not null;default:false"`
	Provider      WebhookProvider `json:"provider" gorm:"size:24;not null;default:dingtalk"`
	WebhookURL    string          `json:"webhook_url" gorm:"type:text"`
	NotifyWarning bool            `json:"notify_warning" gorm:"not null;default:false"`
	CreatedAt     time.Time       `json:"created_at"`
	UpdatedAt     time.Time       `json:"updated_at"`

	Team *Team `json:"team,omitempty" gorm:"foreignKey:TeamID"`
}

func (n *Notification) BeforeCreate(tx *gorm.DB) error {
	if n.ID == "" {
		n.ID = newUUID()
	}
	if n.ReadStatus == "" {
		n.ReadStatus = NotificationUnread
	}
	if n.DeliveryStatus == "" {
		n.DeliveryStatus = NotificationDeliveryNotConfigured
	}
	return nil
}
