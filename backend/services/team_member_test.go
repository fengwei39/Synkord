package services

import (
	"testing"

	"github.com/synkord/core/models"
)

func TestTeamMemberCRUDUsesRealUsersAndProtectsLastAdmin(t *testing.T) {
	db := testDB(t)
	owner := &models.User{Username: "member-owner", HashedPassword: "hash", Role: models.RoleViewer, IsActive: true}
	if err := db.Create(owner).Error; err != nil {
		t.Fatalf("create owner: %v", err)
	}
	team, err := CreateTeam(db, owner.ID, "Member Team", "")
	if err != nil {
		t.Fatalf("create team: %v", err)
	}

	member, err := CreateTeamMember(db, team.ID, TeamMemberInput{
		Username: "member-editor",
		Email:    "editor@synkord.dev",
		Password: "password123",
		Role:     models.TeamRoleEditor,
		Status:   models.TeamMemberActive,
	})
	if err != nil {
		t.Fatalf("create member: %v", err)
	}
	if member.Email != "editor@synkord.dev" || member.Role != models.TeamRoleEditor {
		t.Fatalf("member = %+v, want editor with email", member)
	}

	updated, err := UpdateTeamMember(db, team.ID, member.ID, TeamMemberInput{
		Username: "member-viewer",
		Email:    "viewer@synkord.dev",
		Role:     models.TeamRoleViewer,
		Status:   models.TeamMemberDisabled,
	})
	if err != nil {
		t.Fatalf("update member: %v", err)
	}
	if updated.Username != "member-viewer" || updated.Status != models.TeamMemberDisabled {
		t.Fatalf("updated = %+v, want disabled viewer", updated)
	}

	members, err := ListTeamMembers(db, team.ID)
	if err != nil {
		t.Fatalf("list members: %v", err)
	}
	var ownerMemberID string
	for _, item := range members {
		if item.UserID == owner.ID {
			ownerMemberID = item.ID
		}
	}
	if ownerMemberID == "" {
		t.Fatalf("owner membership not found")
	}
	if err := DeleteTeamMembers(db, team.ID, []string{ownerMemberID}); err == nil {
		t.Fatalf("deleting last active admin should fail")
	}
	if err := DeleteTeamMembers(db, team.ID, []string{member.ID}); err != nil {
		t.Fatalf("delete non-admin member: %v", err)
	}
}
