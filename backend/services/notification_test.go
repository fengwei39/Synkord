package services

import (
	"testing"

	"github.com/synkord/core/models"
)

func TestSaveTeamChangeSetCreatesNotificationForBreakingChange(t *testing.T) {
	db := testDB(t)
	user := &models.User{Username: "notify-owner", HashedPassword: "hash", Role: models.RoleViewer, IsActive: true}
	if err := db.Create(user).Error; err != nil {
		t.Fatalf("create user: %v", err)
	}
	team, err := CreateTeam(db, user.ID, "Notify Team", "")
	if err != nil {
		t.Fatalf("create team: %v", err)
	}
	project := &models.Project{TeamID: team.ID, Name: "notify-api", ProjectType: models.ProjectBackend}
	if err := db.Create(project).Error; err != nil {
		t.Fatalf("create project: %v", err)
	}

	result := &DiffResult{
		ServiceName: "notify-api",
		OldVersion:  "1.0.0",
		NewVersion:  "2.0.0",
		Changes: []BreakingChange{
			{EntityName: "UserDTO", ChangeType: "field_removed", Severity: string(models.SeverityBreaking)},
		},
	}
	changeSet, err := SaveTeamChangeSet(db, team.ID, project.ID, &user.ID, result)
	if err != nil {
		t.Fatalf("save changeset: %v", err)
	}

	items, total, err := ListTeamNotifications(db, team.ID, false, 0, 10)
	if err != nil {
		t.Fatalf("list notifications: %v", err)
	}
	if total != 1 || len(items) != 1 {
		t.Fatalf("notifications = total %d items %+v, want 1", total, items)
	}
	if items[0].ChangeSetID == nil || *items[0].ChangeSetID != changeSet.ID {
		t.Fatalf("notification changeset = %+v, want %s", items[0].ChangeSetID, changeSet.ID)
	}
	if items[0].ReadStatus != models.NotificationUnread || items[0].DeliveryStatus != models.NotificationDeliveryNotConfigured {
		t.Fatalf("unexpected notification status: %+v", items[0])
	}
}

func TestSaveTeamChangeSetSkipsInfoNotification(t *testing.T) {
	db := testDB(t)
	user := &models.User{Username: "notify-info-owner", HashedPassword: "hash", Role: models.RoleViewer, IsActive: true}
	if err := db.Create(user).Error; err != nil {
		t.Fatalf("create user: %v", err)
	}
	team, err := CreateTeam(db, user.ID, "Notify Info Team", "")
	if err != nil {
		t.Fatalf("create team: %v", err)
	}
	project := &models.Project{TeamID: team.ID, Name: "notify-info-api", ProjectType: models.ProjectBackend}
	if err := db.Create(project).Error; err != nil {
		t.Fatalf("create project: %v", err)
	}

	result := &DiffResult{
		ServiceName: "notify-info-api",
		Changes: []BreakingChange{
			{EntityName: "UserDTO", ChangeType: "field_added", Severity: string(models.SeverityInfo)},
		},
	}
	if _, err := SaveTeamChangeSet(db, team.ID, project.ID, &user.ID, result); err != nil {
		t.Fatalf("save changeset: %v", err)
	}

	items, total, err := ListTeamNotifications(db, team.ID, false, 0, 10)
	if err != nil {
		t.Fatalf("list notifications: %v", err)
	}
	if total != 0 || len(items) != 0 {
		t.Fatalf("notifications = total %d items %+v, want none", total, items)
	}
}
