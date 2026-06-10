package notify

import "time"

// Subscription is one row in the subscriptions table.
type Subscription struct {
	ID          string    `db:"id"`
	UserID      string    `db:"user_id"`
	OrgID       string    `db:"org_id"`
	PackName    string    `db:"pack_name"`
	ProjectName *string   `db:"project_name"`
	CreatedAt   time.Time `db:"created_at"`
}

// Notification is one row in the notifications table.
type Notification struct {
	ID          string      `db:"id"           json:"id"`
	UserID      string      `db:"user_id"       json:"-"`
	OrgID       string      `db:"org_id"        json:"orgId"`
	PackName    string      `db:"pack_name"     json:"packName"`
	OldVersion  *string     `db:"old_version"   json:"oldVersion,omitempty"`
	NewVersion  string      `db:"new_version"   json:"newVersion"`
	DiffSummary interface{} `db:"diff_summary"  json:"diffSummary,omitempty"`
	ReadAt      *time.Time  `db:"read_at"       json:"readAt,omitempty"`
	CreatedAt   time.Time   `db:"created_at"    json:"createdAt"`
}

// WsMessage is pushed over WebSocket to connected clients.
type WsMessage struct {
	Type        string      `json:"type"`
	OrgID       string      `json:"orgId"`
	PackName    string      `json:"packName"`
	OldVersion  string      `json:"oldVersion,omitempty"`
	NewVersion  string      `json:"newVersion"`
	DiffSummary interface{} `json:"diffSummary,omitempty"`
}

// SubscribeRequest is the body for POST subscribe.
type SubscribeRequest struct {
	ProjectName string `json:"projectName"`
}

// PublishEvent is passed to the notifier when a pack version is published.
type PublishEvent struct {
	OrgID       string
	PackName    string
	OldVersion  string
	NewVersion  string
	DiffSummary interface{}
}
