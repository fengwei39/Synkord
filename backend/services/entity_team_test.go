package services

import (
	"testing"

	"github.com/synkord/core/models"
)

func TestListTeamEntitiesOnlyReturnsTeamModels(t *testing.T) {
	db := testDB(t)
	userA := &models.User{Username: "model-a", HashedPassword: "hash", Role: models.RoleViewer, IsActive: true}
	userB := &models.User{Username: "model-b", HashedPassword: "hash", Role: models.RoleViewer, IsActive: true}
	if err := db.Create(userA).Error; err != nil {
		t.Fatalf("create user a: %v", err)
	}
	if err := db.Create(userB).Error; err != nil {
		t.Fatalf("create user b: %v", err)
	}

	teamA, err := CreateTeam(db, userA.ID, "Model Team A", "")
	if err != nil {
		t.Fatalf("create team a: %v", err)
	}
	teamB, err := CreateTeam(db, userB.ID, "Model Team B", "")
	if err != nil {
		t.Fatalf("create team b: %v", err)
	}

	schema := `{"type":"object","properties":{"id":{"type":"string"}}}`
	if _, err := CreateTeamEntity(db, teamA.ID, "UserDTO", "", schema, true, nil, &userA.ID); err != nil {
		t.Fatalf("create team entity: %v", err)
	}

	itemsA, totalA, err := ListTeamEntities(db, teamA.ID, nil, nil, 0, 10)
	if err != nil {
		t.Fatalf("list team a entities: %v", err)
	}
	if totalA != 1 || len(itemsA) != 1 || itemsA[0].Name != "UserDTO" {
		t.Fatalf("team a entities = total %d items %+v, want UserDTO", totalA, itemsA)
	}

	itemsB, totalB, err := ListTeamEntities(db, teamB.ID, nil, nil, 0, 10)
	if err != nil {
		t.Fatalf("list team b entities: %v", err)
	}
	if totalB != 0 || len(itemsB) != 0 {
		t.Fatalf("team b entities = total %d items %+v, want empty", totalB, itemsB)
	}
}
