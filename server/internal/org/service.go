package org

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"regexp"
	"strings"
	"time"

	"github.com/jmoiron/sqlx"
)

var (
	ErrOrgNotFound    = errors.New("organization not found")
	ErrSlugTaken      = errors.New("slug already taken")
	ErrNotMember      = errors.New("not a member of this organization")
	ErrNotAdmin       = errors.New("admin permission required")
	ErrInviteNotFound = errors.New("invite not found")
	ErrInviteExpired  = errors.New("invite has expired")
	ErrInviteUsed     = errors.New("invite has already been used")

	slugPattern = regexp.MustCompile(`^[a-z0-9][a-z0-9-]*[a-z0-9]$`)
)

// GitStore is the interface gitstore.Store satisfies; used here to avoid circular imports.
type GitStore interface {
	Init(orgID string) error
}

type Service struct {
	db       *sqlx.DB
	baseURL  string
	gitStore GitStore
}

func NewService(db *sqlx.DB, baseURL string, gs GitStore) *Service {
	return &Service{db: db, baseURL: baseURL, gitStore: gs}
}

func (s *Service) CreateOrg(ctx context.Context, userID string, req CreateOrgRequest) (*OrgResponse, error) {
	if !slugPattern.MatchString(req.Slug) {
		return nil, fmt.Errorf("slug must be lowercase alphanumeric with hyphens")
	}

	tx, err := s.db.BeginTxx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback() //nolint:errcheck

	var o Organization
	err = tx.QueryRowxContext(ctx,
		`INSERT INTO organizations (name, slug, created_by)
		 VALUES ($1, $2, $3)
		 RETURNING id, name, slug, created_by, created_at`,
		req.Name, req.Slug, userID,
	).StructScan(&o)
	if err != nil {
		if isUniqueViolation(err) {
			return nil, ErrSlugTaken
		}
		return nil, fmt.Errorf("insert org: %w", err)
	}

	_, err = tx.ExecContext(ctx,
		`INSERT INTO org_members (org_id, user_id, role) VALUES ($1, $2, 'admin')`,
		o.ID, userID,
	)
	if err != nil {
		return nil, fmt.Errorf("insert admin member: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit: %w", err)
	}

	// Initialize git repository for the org (best-effort; log but don't fail)
	if s.gitStore != nil {
		if err := s.gitStore.Init(o.ID); err != nil {
			// Non-fatal: repo can be initialised manually later
			_ = err
		}
	}

	return &OrgResponse{
		ID:          o.ID,
		Name:        o.Name,
		Slug:        o.Slug,
		MemberCount: 1,
		CreatedAt:   o.CreatedAt,
	}, nil
}

func (s *Service) GetOrgByID(ctx context.Context, orgID string) (*OrgResponse, error) {
	row := s.db.QueryRowxContext(ctx,
		`SELECT o.id, o.name, o.slug, o.created_at,
		        COUNT(m.user_id) AS member_count
		 FROM organizations o
		 LEFT JOIN org_members m ON m.org_id = o.id
		 WHERE o.id = $1
		 GROUP BY o.id`, orgID)

	var result struct {
		ID          string    `db:"id"`
		Name        string    `db:"name"`
		Slug        string    `db:"slug"`
		CreatedAt   time.Time `db:"created_at"`
		MemberCount int       `db:"member_count"`
	}
	if err := row.StructScan(&result); err != nil {
		return nil, ErrOrgNotFound
	}
	return &OrgResponse{
		ID:          result.ID,
		Name:        result.Name,
		Slug:        result.Slug,
		MemberCount: result.MemberCount,
		CreatedAt:   result.CreatedAt,
	}, nil
}

func (s *Service) GetMyOrgs(ctx context.Context, userID string) ([]MyOrgResponse, error) {
	rows, err := s.db.QueryxContext(ctx,
		`SELECT o.id, o.name, o.slug, m.role
		 FROM organizations o
		 JOIN org_members m ON m.org_id = o.id
		 WHERE m.user_id = $1
		 ORDER BY m.joined_at ASC`, userID)
	if err != nil {
		return nil, fmt.Errorf("query orgs: %w", err)
	}
	defer rows.Close()

	var result []MyOrgResponse
	for rows.Next() {
		var r MyOrgResponse
		if err := rows.StructScan(&r); err != nil {
			return nil, fmt.Errorf("scan org: %w", err)
		}
		result = append(result, r)
	}
	if result == nil {
		result = []MyOrgResponse{}
	}
	return result, nil
}

func (s *Service) CreateInvite(ctx context.Context, orgID, userID string, req CreateInviteRequest) (*InviteResponse, error) {
	if err := s.requireAdmin(ctx, orgID, userID); err != nil {
		return nil, err
	}

	token, err := generateToken()
	if err != nil {
		return nil, fmt.Errorf("generate token: %w", err)
	}

	expiresAt := time.Now().Add(time.Duration(req.ExpiresInHours) * time.Hour)

	_, err = s.db.ExecContext(ctx,
		`INSERT INTO org_invites (org_id, token, created_by, expires_at)
		 VALUES ($1, $2, $3, $4)`,
		orgID, token, userID, expiresAt,
	)
	if err != nil {
		return nil, fmt.Errorf("insert invite: %w", err)
	}

	return &InviteResponse{
		Token:     token,
		InviteURL: fmt.Sprintf("%s/invite/%s", s.baseURL, token),
		ExpiresAt: expiresAt,
	}, nil
}

func (s *Service) GetInvite(ctx context.Context, token string) (*InviteInfoResponse, error) {
	row := s.db.QueryRowxContext(ctx,
		`SELECT o.name AS org_name, u.display_name AS inviter_name, i.expires_at
		 FROM org_invites i
		 JOIN organizations o ON o.id = i.org_id
		 JOIN users u ON u.id = i.created_by
		 WHERE i.token = $1`, token)

	var result struct {
		OrgName     string    `db:"org_name"`
		InviterName string    `db:"inviter_name"`
		ExpiresAt   time.Time `db:"expires_at"`
	}
	if err := row.StructScan(&result); err != nil {
		return nil, ErrInviteNotFound
	}
	return &InviteInfoResponse{
		OrgName:     result.OrgName,
		InviterName: result.InviterName,
		ExpiresAt:   result.ExpiresAt,
	}, nil
}

func (s *Service) AcceptInvite(ctx context.Context, token, userID string) (*AcceptInviteResponse, error) {
	tx, err := s.db.BeginTxx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback() //nolint:errcheck

	var invite struct {
		ID        string     `db:"id"`
		OrgID     string     `db:"org_id"`
		OrgName   string     `db:"org_name"`
		ExpiresAt time.Time  `db:"expires_at"`
		UsedBy    *string    `db:"used_by"`
		UsedAt    *time.Time `db:"used_at"`
	}
	err = tx.QueryRowxContext(ctx,
		`SELECT i.id, i.org_id, o.name AS org_name, i.expires_at, i.used_by, i.used_at
		 FROM org_invites i
		 JOIN organizations o ON o.id = i.org_id
		 WHERE i.token = $1
		 FOR UPDATE`, token).StructScan(&invite)
	if err != nil {
		return nil, ErrInviteNotFound
	}
	if time.Now().After(invite.ExpiresAt) {
		return nil, ErrInviteExpired
	}
	if invite.UsedBy != nil {
		return nil, ErrInviteUsed
	}

	// Idempotent: if already a member, return success
	var existing int
	_ = tx.QueryRowxContext(ctx,
		`SELECT COUNT(*) FROM org_members WHERE org_id = $1 AND user_id = $2`,
		invite.OrgID, userID).Scan(&existing)

	if existing == 0 {
		_, err = tx.ExecContext(ctx,
			`INSERT INTO org_members (org_id, user_id, role) VALUES ($1, $2, 'member')`,
			invite.OrgID, userID)
		if err != nil {
			return nil, fmt.Errorf("insert member: %w", err)
		}
	}

	now := time.Now()
	_, err = tx.ExecContext(ctx,
		`UPDATE org_invites SET used_by = $1, used_at = $2 WHERE id = $3`,
		userID, now, invite.ID)
	if err != nil {
		return nil, fmt.Errorf("mark invite used: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit: %w", err)
	}

	return &AcceptInviteResponse{OrgID: invite.OrgID, OrgName: invite.OrgName}, nil
}

func (s *Service) requireAdmin(ctx context.Context, orgID, userID string) error {
	var role string
	err := s.db.QueryRowxContext(ctx,
		`SELECT role FROM org_members WHERE org_id = $1 AND user_id = $2`,
		orgID, userID).Scan(&role)
	if err != nil {
		return ErrNotMember
	}
	if role != "admin" {
		return ErrNotAdmin
	}
	return nil
}

func generateToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

func isUniqueViolation(err error) bool {
	if err == nil {
		return false
	}
	msg := err.Error()
	return strings.Contains(msg, "duplicate key") || strings.Contains(msg, "unique constraint")
}
