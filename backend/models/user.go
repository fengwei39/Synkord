package models

import (
	"time"

	"gorm.io/gorm"
)

type UserRole string

const (
	RoleAdmin  UserRole = "admin"
	RoleEditor UserRole = "editor"
	RoleViewer UserRole = "viewer"
)

type User struct {
	ID             string    `json:"id" gorm:"primaryKey;size:36"`
	Username       string    `json:"username" gorm:"uniqueIndex;size:64;not null"`
	Email          string    `json:"email" gorm:"size:128;index"`
	HashedPassword string    `json:"-" gorm:"size:256;not null"`
	Role           UserRole  `json:"role" gorm:"size:16;default:viewer"`
	IsActive       bool      `json:"is_active" gorm:"default:true"`
	CreatedAt      time.Time `json:"created_at"`
}

func (u *User) BeforeCreate(tx *gorm.DB) error {
	if u.ID == "" {
		u.ID = newUUID()
	}
	return nil
}
