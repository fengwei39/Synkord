package services

import (
	"testing"

	"github.com/synkord/core/models"
)

func TestListTeamChangeSetsOnlyReturnsCurrentTeam(t *testing.T) {
	db := testDB(t)
	userA := &models.User{Username: "change-a", HashedPassword: "hash", Role: models.RoleViewer, IsActive: true}
	userB := &models.User{Username: "change-b", HashedPassword: "hash", Role: models.RoleViewer, IsActive: true}
	if err := db.Create(userA).Error; err != nil {
		t.Fatalf("create user a: %v", err)
	}
	if err := db.Create(userB).Error; err != nil {
		t.Fatalf("create user b: %v", err)
	}

	teamA, err := CreateTeam(db, userA.ID, "Change Team A", "")
	if err != nil {
		t.Fatalf("create team a: %v", err)
	}
	teamB, err := CreateTeam(db, userB.ID, "Change Team B", "")
	if err != nil {
		t.Fatalf("create team b: %v", err)
	}

	projectA := &models.Project{TeamID: teamA.ID, Name: "change-a-api", ProjectType: models.ProjectBackend}
	projectB := &models.Project{TeamID: teamB.ID, Name: "change-b-api", ProjectType: models.ProjectBackend}
	if err := db.Create(projectA).Error; err != nil {
		t.Fatalf("create project a: %v", err)
	}
	if err := db.Create(projectB).Error; err != nil {
		t.Fatalf("create project b: %v", err)
	}

	resultA := &DiffResult{ServiceName: "a", Changes: []BreakingChange{{EntityName: "UserDTO", ChangeType: "field_removed", Severity: "breaking"}}}
	resultB := &DiffResult{ServiceName: "b", Changes: []BreakingChange{{EntityName: "OrderDTO", ChangeType: "field_removed", Severity: "breaking"}}}
	if _, err := SaveTeamChangeSet(db, teamA.ID, projectA.ID, &userA.ID, resultA); err != nil {
		t.Fatalf("save changeset a: %v", err)
	}
	if _, err := SaveTeamChangeSet(db, teamB.ID, projectB.ID, &userB.ID, resultB); err != nil {
		t.Fatalf("save changeset b: %v", err)
	}

	items, total, err := ListTeamChangeSets(db, teamA.ID, "", 0, 10)
	if err != nil {
		t.Fatalf("list team changesets: %v", err)
	}
	if total != 1 || len(items) != 1 || items[0].ServiceName != "a" {
		t.Fatalf("team a changesets = total %d items %+v, want only service a", total, items)
	}
}

func TestGetTeamChangeSetOnlyReturnsCurrentTeam(t *testing.T) {
	db := testDB(t)
	userA := &models.User{Username: "detail-change-a", HashedPassword: "hash", Role: models.RoleViewer, IsActive: true}
	userB := &models.User{Username: "detail-change-b", HashedPassword: "hash", Role: models.RoleViewer, IsActive: true}
	if err := db.Create(userA).Error; err != nil {
		t.Fatalf("create user a: %v", err)
	}
	if err := db.Create(userB).Error; err != nil {
		t.Fatalf("create user b: %v", err)
	}

	teamA, err := CreateTeam(db, userA.ID, "Detail Change Team A", "")
	if err != nil {
		t.Fatalf("create team a: %v", err)
	}
	teamB, err := CreateTeam(db, userB.ID, "Detail Change Team B", "")
	if err != nil {
		t.Fatalf("create team b: %v", err)
	}

	projectA := &models.Project{TeamID: teamA.ID, Name: "detail-change-a-api", ProjectType: models.ProjectBackend}
	projectB := &models.Project{TeamID: teamB.ID, Name: "detail-change-b-api", ProjectType: models.ProjectBackend}
	if err := db.Create(projectA).Error; err != nil {
		t.Fatalf("create project a: %v", err)
	}
	if err := db.Create(projectB).Error; err != nil {
		t.Fatalf("create project b: %v", err)
	}

	resultA := &DiffResult{ServiceName: "detail-a", Changes: []BreakingChange{{EntityName: "UserDTO", ChangeType: "field_removed", Severity: "breaking"}}}
	resultB := &DiffResult{ServiceName: "detail-b", Changes: []BreakingChange{{EntityName: "OrderDTO", ChangeType: "field_removed", Severity: "breaking"}}}
	changeA, err := SaveTeamChangeSet(db, teamA.ID, projectA.ID, &userA.ID, resultA)
	if err != nil {
		t.Fatalf("save changeset a: %v", err)
	}
	changeB, err := SaveTeamChangeSet(db, teamB.ID, projectB.ID, &userB.ID, resultB)
	if err != nil {
		t.Fatalf("save changeset b: %v", err)
	}

	got, err := GetTeamChangeSet(db, teamA.ID, changeA.ID)
	if err != nil {
		t.Fatalf("get team a changeset: %v", err)
	}
	if got.ServiceName != "detail-a" || got.Project == nil || got.Project.ID != projectA.ID {
		t.Fatalf("team a detail = %+v, want project preloaded for detail-a", got)
	}
	if _, err := GetTeamChangeSet(db, teamA.ID, changeB.ID); err == nil {
		t.Fatalf("expected team a to be unable to read team b changeset")
	}
}
