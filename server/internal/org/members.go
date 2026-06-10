package org

import (
	"context"
	"errors"
	"fmt"
	"time"
)

var (
	ErrCannotRemoveSelf = errors.New("cannot remove yourself from the organization")
	ErrMemberNotFound   = errors.New("member not found")
	ErrInvalidRole      = errors.New("role must be 'admin' or 'member'")
)

type MemberDetail struct {
	UserID      string    `db:"user_id"     json:"userId"`
	Email       string    `db:"email"       json:"email"`
	DisplayName string    `db:"display_name" json:"displayName"`
	Role        string    `db:"role"        json:"role"`
	JoinedAt    time.Time `db:"joined_at"   json:"joinedAt"`
}

type UpdateRoleRequest struct {
	Role string `json:"role" binding:"required"`
}

type UpdateRoleResponse struct {
	UserID string `json:"userId"`
	Role   string `json:"role"`
}

func (s *Service) ListMembers(ctx context.Context, orgID string) ([]MemberDetail, error) {
	rows, err := s.db.QueryxContext(ctx,
		`SELECT m.user_id, u.email, u.display_name, m.role, m.joined_at
		 FROM org_members m
		 JOIN users u ON u.id = m.user_id
		 WHERE m.org_id = $1
		 ORDER BY m.joined_at ASC`, orgID)
	if err != nil {
		return nil, fmt.Errorf("query members: %w", err)
	}
	defer rows.Close()

	var result []MemberDetail
	for rows.Next() {
		var m MemberDetail
		if err := rows.StructScan(&m); err != nil {
			return nil, fmt.Errorf("scan member: %w", err)
		}
		result = append(result, m)
	}
	if result == nil {
		result = []MemberDetail{}
	}
	return result, nil
}

func (s *Service) RemoveMember(ctx context.Context, orgID, callerID, targetUserID string) error {
	if callerID == targetUserID {
		return ErrCannotRemoveSelf
	}
	if err := s.requireAdmin(ctx, orgID, callerID); err != nil {
		return err
	}

	res, err := s.db.ExecContext(ctx,
		`DELETE FROM org_members WHERE org_id = $1 AND user_id = $2`,
		orgID, targetUserID)
	if err != nil {
		return fmt.Errorf("delete member: %w", err)
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return ErrMemberNotFound
	}
	return nil
}

func (s *Service) UpdateMemberRole(ctx context.Context, orgID, callerID, targetUserID, role string) (*UpdateRoleResponse, error) {
	if role != "admin" && role != "member" {
		return nil, ErrInvalidRole
	}
	if err := s.requireAdmin(ctx, orgID, callerID); err != nil {
		return nil, err
	}

	res, err := s.db.ExecContext(ctx,
		`UPDATE org_members SET role = $1 WHERE org_id = $2 AND user_id = $3`,
		role, orgID, targetUserID)
	if err != nil {
		return nil, fmt.Errorf("update role: %w", err)
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return nil, ErrMemberNotFound
	}
	return &UpdateRoleResponse{UserID: targetUserID, Role: role}, nil
}
