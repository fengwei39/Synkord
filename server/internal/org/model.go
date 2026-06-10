package org

import "time"

type Organization struct {
	ID          string    `db:"id"         json:"id"`
	Name        string    `db:"name"       json:"name"`
	Slug        string    `db:"slug"       json:"slug"`
	CreatedBy   string    `db:"created_by" json:"createdBy"`
	CreatedAt   time.Time `db:"created_at" json:"createdAt"`
}

type OrgMember struct {
	OrgID    string    `db:"org_id"   json:"orgId"`
	UserID   string    `db:"user_id"  json:"userId"`
	Role     string    `db:"role"     json:"role"`
	JoinedAt time.Time `db:"joined_at" json:"joinedAt"`
}

type OrgInvite struct {
	ID        string     `db:"id"         json:"id"`
	OrgID     string     `db:"org_id"     json:"orgId"`
	Token     string     `db:"token"      json:"token"`
	CreatedBy string     `db:"created_by" json:"createdBy"`
	ExpiresAt time.Time  `db:"expires_at" json:"expiresAt"`
	UsedBy    *string    `db:"used_by"    json:"usedBy,omitempty"`
	UsedAt    *time.Time `db:"used_at"    json:"usedAt,omitempty"`
}

// Request / Response types

type CreateOrgRequest struct {
	Name string `json:"name" binding:"required,min=2,max=100"`
	Slug string `json:"slug" binding:"required,min=2,max=50"`
}

type CreateInviteRequest struct {
	ExpiresInHours int `json:"expiresInHours" binding:"required,min=1,max=720"`
}

type OrgResponse struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	Slug        string    `json:"slug"`
	MemberCount int       `json:"memberCount"`
	CreatedAt   time.Time `json:"createdAt"`
}

type MyOrgResponse struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Slug string `json:"slug"`
	Role string `json:"role"`
}

type InviteResponse struct {
	Token     string    `json:"token"`
	InviteURL string    `json:"inviteUrl"`
	ExpiresAt time.Time `json:"expiresAt"`
}

type InviteInfoResponse struct {
	OrgName     string    `json:"orgName"`
	InviterName string    `json:"inviterName"`
	ExpiresAt   time.Time `json:"expiresAt"`
}

type AcceptInviteResponse struct {
	OrgID   string `json:"orgId"`
	OrgName string `json:"orgName"`
}
