package services

import (
	"testing"

	"github.com/synkord/core/models"
)

func TestCreateTeamAddsOwnerAsTeamAdmin(t *testing.T) {
	db := testDB(t)
	user := &models.User{Username: "owner", HashedPassword: "hash", Role: models.RoleViewer, IsActive: true}
	if err := db.Create(user).Error; err != nil {
		t.Fatalf("create user: %v", err)
	}

	team, err := CreateTeam(db, user.ID, "Core Team", "Backend and MCP")
	if err != nil {
		t.Fatalf("create team: %v", err)
	}
	if team.Role != models.TeamRoleAdmin {
		t.Fatalf("role = %s, want %s", team.Role, models.TeamRoleAdmin)
	}

	var member models.TeamMember
	if err := db.First(&member, "team_id = ? AND user_id = ?", team.ID, user.ID).Error; err != nil {
		t.Fatalf("find membership: %v", err)
	}
	if member.Role != models.TeamRoleAdmin || member.Status != models.TeamMemberActive {
		t.Fatalf("membership = %+v, want active team admin", member)
	}
}

func TestListUserTeamsOnlyReturnsMemberships(t *testing.T) {
	db := testDB(t)
	userA := &models.User{Username: "a", HashedPassword: "hash", Role: models.RoleViewer, IsActive: true}
	userB := &models.User{Username: "b", HashedPassword: "hash", Role: models.RoleViewer, IsActive: true}
	if err := db.Create(userA).Error; err != nil {
		t.Fatalf("create user a: %v", err)
	}
	if err := db.Create(userB).Error; err != nil {
		t.Fatalf("create user b: %v", err)
	}

	if _, err := CreateTeam(db, userA.ID, "Team A", ""); err != nil {
		t.Fatalf("create team a: %v", err)
	}
	if _, err := CreateTeam(db, userB.ID, "Team B", ""); err != nil {
		t.Fatalf("create team b: %v", err)
	}

	teams, err := ListUserTeams(db, userA.ID)
	if err != nil {
		t.Fatalf("list teams: %v", err)
	}
	if len(teams) != 1 || teams[0].Name != "Team A" {
		t.Fatalf("teams = %+v, want only Team A", teams)
	}
}
