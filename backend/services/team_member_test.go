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

func TestGetTeamSummaryReturnsScopedCounts(t *testing.T) {
	db := testDB(t)
	user := &models.User{Username: "summary-owner", HashedPassword: "hash", Role: models.RoleViewer, IsActive: true}
	if err := db.Create(user).Error; err != nil {
		t.Fatalf("create user: %v", err)
	}
	team, err := CreateTeam(db, user.ID, "Summary Team", "")
	if err != nil {
		t.Fatalf("create team: %v", err)
	}
	project := &models.Project{TeamID: team.ID, Name: "summary-api", ProjectType: models.ProjectBackend}
	if err := db.Create(project).Error; err != nil {
		t.Fatalf("create project: %v", err)
	}
	if err := db.Create(&models.APIEndpoint{ProjectID: project.ID, Path: "/users", Method: "GET"}).Error; err != nil {
		t.Fatalf("create api: %v", err)
	}
	if _, err := CreateTeamEntity(db, team.ID, "UserDTO", "", "{}", true, nil, &user.ID); err != nil {
		t.Fatalf("create entity: %v", err)
	}
	if _, err := SaveTeamChangeSet(db, team.ID, project.ID, &user.ID, &DiffResult{
		ServiceName: "summary-api",
		Changes: []BreakingChange{
			{EntityName: "UserDTO", ChangeType: "field_removed", Severity: string(models.SeverityBreaking)},
		},
	}); err != nil {
		t.Fatalf("save changeset: %v", err)
	}

	summary, err := GetTeamSummary(db, team.ID)
	if err != nil {
		t.Fatalf("get summary: %v", err)
	}
	if summary.ProjectCount != 1 || summary.APICount != 1 || summary.ModelCount != 1 || summary.BreakingRiskCount != 1 {
		t.Fatalf("summary = %+v, want scoped counts of 1", summary)
	}
	if len(summary.RecentChangeSets) != 1 {
		t.Fatalf("recent changesets = %d, want 1", len(summary.RecentChangeSets))
	}
}
