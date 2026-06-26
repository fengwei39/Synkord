package models

import (
	"time"

	"gorm.io/gorm"
)

type TeamRole string

const (
	TeamRoleAdmin  TeamRole = "team_admin"
	TeamRoleEditor TeamRole = "editor"
	TeamRoleViewer TeamRole = "viewer"
)

type TeamMemberStatus string

const (
	TeamMemberActive   TeamMemberStatus = "active"
	TeamMemberDisabled TeamMemberStatus = "disabled"
)

type InviteStatus string

const (
	InviteAccepted  InviteStatus = "accepted"
	InvitePending   InviteStatus = "pending"
	InviteExpired   InviteStatus = "expired"
	InviteCancelled InviteStatus = "cancelled"
)

type Team struct {
	ID          string         `json:"id" gorm:"primaryKey;size:36"`
	Name        string         `json:"name" gorm:"size:64;not null"`
	Description string         `json:"description" gorm:"size:512"`
	OwnerID     string         `json:"owner_id" gorm:"size:36;not null;index"`
	Owner       *User          `json:"owner,omitempty" gorm:"foreignKey:OwnerID"`
	CreatedAt   time.Time      `json:"created_at"`
	UpdatedAt   time.Time      `json:"updated_at"`
	DeletedAt   gorm.DeletedAt `json:"-" gorm:"index"`
}

func (t *Team) BeforeCreate(tx *gorm.DB) error {
	if t.ID == "" {
		t.ID = newUUID()
	}
	return nil
}

type TeamMember struct {
	ID           string           `json:"id" gorm:"primaryKey;size:36"`
	TeamID       string           `json:"team_id" gorm:"size:36;not null;index;uniqueIndex:idx_team_user"`
	UserID       string           `json:"user_id" gorm:"size:36;not null;index;uniqueIndex:idx_team_user"`
	Role         TeamRole         `json:"role" gorm:"size:24;not null;default:viewer"`
	Status       TeamMemberStatus `json:"status" gorm:"size:16;not null;default:active"`
	InviteStatus InviteStatus     `json:"invite_status" gorm:"size:16;not null;default:accepted"`
	Remark       string           `json:"remark" gorm:"size:512"`
	JoinedAt     time.Time        `json:"joined_at"`
	LastActiveAt *time.Time       `json:"last_active_at"`
	CreatedAt    time.Time        `json:"created_at"`
	UpdatedAt    time.Time        `json:"updated_at"`
	Team         *Team            `json:"team,omitempty" gorm:"foreignKey:TeamID"`
	User         *User            `json:"user,omitempty" gorm:"foreignKey:UserID"`
}

func (tm *TeamMember) BeforeCreate(tx *gorm.DB) error {
	if tm.ID == "" {
		tm.ID = newUUID()
	}
	if tm.JoinedAt.IsZero() {
		tm.JoinedAt = time.Now()
	}
	return nil
}
