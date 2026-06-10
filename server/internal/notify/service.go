package notify

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/jmoiron/sqlx"
)

// ErrNotificationNotFound is returned when a notification ID does not exist for the user.
var ErrNotificationNotFound = errors.New("notification not found")

// Service handles subscriptions and notifications.
type Service struct {
	db  *sqlx.DB
	hub *Hub
}

func NewService(db *sqlx.DB, hub *Hub) *Service {
	return &Service{db: db, hub: hub}
}

// Subscribe adds a subscription for the user to a contract pack.
func (s *Service) Subscribe(userID, orgID, packName, projectName string) (string, error) {
	var pn *string
	if projectName != "" {
		pn = &projectName
	}

	var id string
	err := s.db.QueryRow(
		`INSERT INTO subscriptions (user_id, org_id, pack_name, project_name)
		 VALUES ($1, $2, $3, $4)
		 ON CONFLICT (user_id, org_id, pack_name, COALESCE(project_name, ''))
		 DO UPDATE SET created_at = NOW()
		 RETURNING id`,
		userID, orgID, packName, pn,
	).Scan(&id)
	if err != nil {
		return "", fmt.Errorf("subscribe: %w", err)
	}
	return id, nil
}

// Unsubscribe removes a subscription.
func (s *Service) Unsubscribe(userID, orgID, packName string) error {
	_, err := s.db.Exec(
		`DELETE FROM subscriptions WHERE user_id=$1 AND org_id=$2 AND pack_name=$3`,
		userID, orgID, packName,
	)
	return err
}

// OnPublish is called by contracts.Service when a pack version is published.
// It writes notifications for all subscribers and pushes WebSocket messages.
func (s *Service) OnPublish(ev PublishEvent) {
	// Find all subscribers for this pack
	var userIDs []string
	err := s.db.Select(&userIDs,
		`SELECT user_id FROM subscriptions WHERE org_id=$1 AND pack_name=$2`,
		ev.OrgID, ev.PackName,
	)
	if err != nil || len(userIDs) == 0 {
		return
	}

	diffJSON, _ := json.Marshal(ev.DiffSummary)
	now := time.Now().UTC()

	for _, userID := range userIDs {
		// Write notification row
		var notifID string
		_ = s.db.QueryRow(
			`INSERT INTO notifications
			   (user_id, org_id, pack_name, old_version, new_version, diff_summary, created_at)
			 VALUES ($1, $2, $3, $4, $5, $6, $7)
			 RETURNING id`,
			userID, ev.OrgID, ev.PackName,
			nullableString(ev.OldVersion), ev.NewVersion,
			diffJSON, now,
		).Scan(&notifID)

		// Push to WebSocket hub (fire and forget)
		s.hub.Send(userID, WsMessage{
			Type:        "contract_updated",
			OrgID:       ev.OrgID,
			PackName:    ev.PackName,
			OldVersion:  ev.OldVersion,
			NewVersion:  ev.NewVersion,
			DiffSummary: ev.DiffSummary,
		})
	}
}

// ListNotifications returns notifications for a user.
func (s *Service) ListNotifications(userID string, unreadOnly bool) ([]Notification, error) {
	q := `SELECT id, user_id, org_id, pack_name, old_version, new_version,
	             diff_summary, read_at, created_at
	      FROM notifications WHERE user_id=$1`
	if unreadOnly {
		q += " AND read_at IS NULL"
	}
	q += " ORDER BY created_at DESC"

	rows, err := s.db.Queryx(q, userID)
	if err != nil {
		return nil, fmt.Errorf("query notifications: %w", err)
	}
	defer rows.Close()

	var results []Notification
	for rows.Next() {
		var n Notification
		var diffRaw []byte
		var oldVer sql.NullString
		var readAt sql.NullTime

		if err := rows.Scan(
			&n.ID, &n.UserID, &n.OrgID, &n.PackName,
			&oldVer, &n.NewVersion, &diffRaw, &readAt, &n.CreatedAt,
		); err != nil {
			return nil, err
		}

		if oldVer.Valid {
			n.OldVersion = &oldVer.String
		}
		if readAt.Valid {
			n.ReadAt = &readAt.Time
		}
		if len(diffRaw) > 0 {
			var ds interface{}
			_ = json.Unmarshal(diffRaw, &ds)
			n.DiffSummary = ds
		}

		results = append(results, n)
	}
	return results, nil
}

// MarkRead marks a notification as read.
func (s *Service) MarkRead(userID, notifID string) error {
	res, err := s.db.Exec(
		`UPDATE notifications SET read_at=NOW() WHERE id=$1 AND user_id=$2`,
		notifID, userID,
	)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return ErrNotificationNotFound
	}
	return nil
}

func nullableString(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}
