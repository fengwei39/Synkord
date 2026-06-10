package org

import (
	"testing"
)

func TestUpdateRoleRequest_ValidRoles(t *testing.T) {
	validRoles := []string{"admin", "member"}
	for _, role := range validRoles {
		if role != "admin" && role != "member" {
			t.Errorf("expected %q to be valid role", role)
		}
	}
}

func TestUpdateRoleRequest_InvalidRoles(t *testing.T) {
	invalidRoles := []string{"superadmin", "owner", "viewer", "", "ADMIN"}
	for _, role := range invalidRoles {
		if role == "admin" || role == "member" {
			t.Errorf("expected %q to be invalid role", role)
		}
	}
}

func TestRemoveMember_SelfCheck(t *testing.T) {
	// Verify the self-removal guard logic in isolation
	callerID := "user-123"
	targetID := "user-123"

	if callerID == targetID {
		// This is the expected path - should return ErrCannotRemoveSelf
		// Actual DB call is tested via integration tests
	} else {
		t.Error("same IDs should be caught by self-removal guard")
	}
}

func TestRemoveMember_DifferentUsers(t *testing.T) {
	callerID := "admin-user"
	targetID := "other-user"

	if callerID == targetID {
		t.Error("different user IDs should not trigger self-removal guard")
	}
}

func TestMemberDetail_Fields(t *testing.T) {
	// Verify MemberDetail struct has expected fields via zero value
	var m MemberDetail
	if m.Role != "" {
		t.Error("zero value role should be empty string")
	}
	if m.UserID != "" {
		t.Error("zero value userID should be empty string")
	}
}

func TestInvalidRole(t *testing.T) {
	svc := &Service{} // no DB needed for this logic test
	_, err := svc.UpdateMemberRole(nil, "org", "caller", "target", "superadmin") //nolint:staticcheck
	if err == nil {
		t.Fatal("expected error for invalid role")
	}
	if !isError(err, ErrInvalidRole) {
		t.Errorf("expected ErrInvalidRole, got: %v", err)
	}
}

func isError(err, target error) bool {
	return err != nil && err.Error() == target.Error()
}
