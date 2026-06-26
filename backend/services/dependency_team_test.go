package services

import (
	"testing"

	"github.com/synkord/core/models"
)

func TestGetTeamDependencyGraphOnlyReturnsTeamProjects(t *testing.T) {
	db := testDB(t)
	userA := &models.User{Username: "dep-a", HashedPassword: "hash", Role: models.RoleViewer, IsActive: true}
	userB := &models.User{Username: "dep-b", HashedPassword: "hash", Role: models.RoleViewer, IsActive: true}
	if err := db.Create(userA).Error; err != nil {
		t.Fatalf("create user a: %v", err)
	}
	if err := db.Create(userB).Error; err != nil {
		t.Fatalf("create user b: %v", err)
	}

	teamA, err := CreateTeam(db, userA.ID, "Dependency Team A", "")
	if err != nil {
		t.Fatalf("create team a: %v", err)
	}
	teamB, err := CreateTeam(db, userB.ID, "Dependency Team B", "")
	if err != nil {
		t.Fatalf("create team b: %v", err)
	}

	aSource := &models.Project{TeamID: teamA.ID, Name: "team-a-web", ProjectType: models.ProjectWeb}
	aTarget := &models.Project{TeamID: teamA.ID, Name: "team-a-api", ProjectType: models.ProjectBackend}
	bProject := &models.Project{TeamID: teamB.ID, Name: "team-b-api", ProjectType: models.ProjectBackend}
	if err := db.Create(aSource).Error; err != nil {
		t.Fatalf("create a source: %v", err)
	}
	if err := db.Create(aTarget).Error; err != nil {
		t.Fatalf("create a target: %v", err)
	}
	if err := db.Create(bProject).Error; err != nil {
		t.Fatalf("create b project: %v", err)
	}
	if _, err := CreateDependency(db, aSource.ID, aTarget.ID, "OrderDTO", "", "", "entity", "manual", nil); err != nil {
		t.Fatalf("create dependency: %v", err)
	}

	graph, err := GetTeamDependencyGraph(db, teamA.ID)
	if err != nil {
		t.Fatalf("get team graph: %v", err)
	}
	if len(graph.Nodes) != 2 || len(graph.Edges) != 1 {
		t.Fatalf("graph = %+v, want 2 nodes and 1 edge", graph)
	}
	for _, node := range graph.Nodes {
		if node.ID == bProject.ID {
			t.Fatalf("team b project leaked into team a graph: %+v", graph.Nodes)
		}
	}
}
