//go:build cgo

package services

import (
	"testing"

	"github.com/synkord/core/models"
)

func TestSaveChangeSetPersistsSeverityAndChanges(t *testing.T) {
	db := testDB(t)
	project := models.Project{Name: "order-service", ProjectType: models.ProjectBackend}
	if err := db.Create(&project).Error; err != nil {
		t.Fatalf("create project: %v", err)
	}

	result := &DiffResult{
		ServiceName:      "order-service",
		OldVersion:       "1.0.0",
		NewVersion:       "2.0.0",
		AffectedProjects: []string{"web"},
		IsBreaking:       true,
		Changes: []BreakingChange{{
			EntityName: "OrderDTO",
			ChangeType: "field_removed",
			Path:       "$.properties.id",
			Severity:   "breaking",
		}},
	}

	changeSet, err := SaveChangeSet(db, project.ID, nil, result)
	if err != nil {
		t.Fatalf("save changeset: %v", err)
	}
	if changeSet.Severity != models.SeverityBreaking {
		t.Fatalf("severity = %s, want breaking", changeSet.Severity)
	}

	items, total, err := ListChangeSets(db, project.ID, 0, 10)
	if err != nil {
		t.Fatalf("list changesets: %v", err)
	}
	if total != 1 || len(items) != 1 {
		t.Fatalf("total=%d len=%d, want 1", total, len(items))
	}
	if items[0].ChangesJSON == "" || items[0].AffectedJSON == "" {
		t.Fatalf("changeset json fields were not persisted: %+v", items[0])
	}
}
