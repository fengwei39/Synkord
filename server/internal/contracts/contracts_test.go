package contracts

import (
	"encoding/json"
	"fmt"
	"os"
	"testing"

	"github.com/jmoiron/sqlx"
	_ "github.com/lib/pq"

	"synkord/server/internal/gitstore"
)

// ─── validator tests ─────────────────────────────────────────────────────────

var validContent = `{
  "pack": "auth-pack",
  "version": "1.0.0",
  "entities": {
    "User": {
      "table": "users",
      "fields": {
        "id": { "type": "uuid", "primary": true }
      }
    }
  }
}`

func TestValidateContent_Valid(t *testing.T) {
	if err := ValidateContent(validContent); err != nil {
		t.Fatalf("expected valid content to pass, got: %v", err)
	}
}

func TestValidateContent_MissingPack(t *testing.T) {
	content := `{
		"version": "1.0.0",
		"entities": { "User": { "table": "users", "fields": { "id": { "type": "uuid" } } } }
	}`
	if err := ValidateContent(content); err == nil {
		t.Fatal("expected error for missing 'pack' field")
	}
}

func TestValidateContent_EmptyEntities(t *testing.T) {
	content := `{
		"pack": "auth-pack",
		"version": "1.0.0",
		"entities": {}
	}`
	if err := ValidateContent(content); err == nil {
		t.Fatal("expected error for empty 'entities'")
	}
}

func TestValidateContent_BadFieldType(t *testing.T) {
	content := `{
		"pack": "auth-pack",
		"version": "1.0.0",
		"entities": {
			"User": {
				"table": "users",
				"fields": { "id": { "type": "blob" } }
			}
		}
	}`
	if err := ValidateContent(content); err == nil {
		t.Fatal("expected error for invalid field type 'blob'")
	}
}

// ─── semver helper tests ──────────────────────────────────────────────────────

func TestIsVersionGreater(t *testing.T) {
	cases := []struct {
		old, new string
		want     bool
	}{
		{"1.0.0", "1.0.1", true},
		{"1.0.0", "1.1.0", true},
		{"1.0.0", "2.0.0", true},
		{"1.0.0", "1.0.0", false},
		{"1.1.0", "1.0.9", false},
		{"2.0.0", "1.9.9", false},
	}
	for _, tc := range cases {
		got := isVersionGreater(tc.old, tc.new)
		if got != tc.want {
			t.Errorf("isVersionGreater(%q, %q) = %v, want %v", tc.old, tc.new, got, tc.want)
		}
	}
}

// ─── service integration tests (file-system, no DB) ─────────────────────────

func setupService(t *testing.T) (*Service, string) {
	t.Helper()
	dir := t.TempDir()
	gs := gitstore.New(dir)
	// Create a fake DB connection — tests that need DB are skipped if DSN missing
	var db *sqlx.DB
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn != "" {
		var err error
		db, err = sqlx.Connect("postgres", dsn)
		if err != nil {
			t.Skipf("DB connect failed: %v", err)
		}
	}
	return NewService(db, gs), dir
}

func TestCreateAndGetPack_GitOnly(t *testing.T) {
	dir := t.TempDir()
	gs := gitstore.New(dir)
	orgID := "test-org"

	if err := gs.Init(orgID); err != nil {
		t.Fatalf("init: %v", err)
	}

	// Write the file manually to simulate CreatePack without DB
	if err := gs.WriteFile(orgID, "auth-pack/contract.json", validContent, "dev@example.com", "create"); err != nil {
		t.Fatalf("write: %v", err)
	}
	if err := gs.CreateTag(orgID, "auth-pack/v1.0.0"); err != nil {
		t.Fatalf("tag: %v", err)
	}

	// Verify tag exists
	tags, err := gs.ListTags(orgID, "auth-pack/")
	if err != nil {
		t.Fatalf("list tags: %v", err)
	}
	if len(tags) == 0 {
		t.Fatal("expected at least one tag")
	}
	found := false
	for _, tag := range tags {
		if tag == "auth-pack/v1.0.0" {
			found = true
		}
	}
	if !found {
		t.Fatalf("tag auth-pack/v1.0.0 not found in %v", tags)
	}
}

func TestVersionsWithInfo(t *testing.T) {
	dir := t.TempDir()
	gs := gitstore.New(dir)
	orgID := "test-org"

	if err := gs.Init(orgID); err != nil {
		t.Fatalf("init: %v", err)
	}

	v1 := makeContent("auth-pack", "1.0.0")
	v2 := makeContent("auth-pack", "1.1.0")

	for _, tc := range []struct {
		version, content string
	}{
		{"1.0.0", v1},
		{"1.1.0", v2},
	} {
		filePath := "auth-pack/contract.json"
		commitMsg := fmt.Sprintf("feat(auth-pack): v%s", tc.version)
		if err := gs.WriteFile(orgID, filePath, tc.content, "dev@test.com", commitMsg); err != nil {
			t.Fatalf("write %s: %v", tc.version, err)
		}
		if err := gs.CreateTag(orgID, "auth-pack/v"+tc.version); err != nil {
			t.Fatalf("tag %s: %v", tc.version, err)
		}
	}

	infos, err := gs.ListTagsWithInfo(orgID, "auth-pack/v")
	if err != nil {
		t.Fatalf("list tags with info: %v", err)
	}
	if len(infos) != 2 {
		t.Fatalf("expected 2 version tags, got %d", len(infos))
	}
	for _, info := range infos {
		if info.AuthorEmail != "dev@test.com" {
			t.Errorf("expected author dev@test.com, got %s", info.AuthorEmail)
		}
		if info.CommittedAt.IsZero() {
			t.Errorf("CommittedAt should not be zero for tag %s", info.TagName)
		}
	}
}

func TestDeleteFile(t *testing.T) {
	dir := t.TempDir()
	gs := gitstore.New(dir)
	orgID := "test-org"

	if err := gs.Init(orgID); err != nil {
		t.Fatalf("init: %v", err)
	}

	if err := gs.WriteFile(orgID, "auth-pack/contract.json", validContent, "dev@test.com", "create"); err != nil {
		t.Fatalf("write: %v", err)
	}

	if err := gs.DeleteFile(orgID, "auth-pack/contract.json", "dev@test.com", "delete"); err != nil {
		t.Fatalf("delete: %v", err)
	}

	_, err := gs.ReadFile(orgID, "auth-pack/contract.json")
	if err == nil {
		t.Fatal("expected error reading deleted file")
	}
}

// ─── helpers ─────────────────────────────────────────────────────────────────

func makeContent(pack, version string) string {
	obj := map[string]interface{}{
		"pack":    pack,
		"version": version,
		"entities": map[string]interface{}{
			"User": map[string]interface{}{
				"table": "users",
				"fields": map[string]interface{}{
					"id": map[string]interface{}{"type": "uuid", "primary": true},
				},
			},
		},
	}
	b, _ := json.Marshal(obj)
	return string(b)
}
