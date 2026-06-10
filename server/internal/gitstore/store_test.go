package gitstore

import (
	"os"
	"path/filepath"
	"testing"
)

func newTestStore(t *testing.T) (*Store, string) {
	t.Helper()
	dir := t.TempDir()
	return New(dir), dir
}

func TestInit_CreatesRepoDir(t *testing.T) {
	s, baseDir := newTestStore(t)
	orgID := "test-org-123"

	if err := s.Init(orgID); err != nil {
		t.Fatalf("Init: %v", err)
	}

	repoPath := filepath.Join(baseDir, orgID, "contracts")
	info, err := os.Stat(repoPath)
	if err != nil {
		t.Fatalf("repo dir not created: %v", err)
	}
	if !info.IsDir() {
		t.Fatal("expected a directory")
	}

	// .git directory must exist
	gitDir := filepath.Join(repoPath, ".git")
	if _, err := os.Stat(gitDir); err != nil {
		t.Fatalf(".git dir not found: %v", err)
	}
}

func TestInit_Idempotent(t *testing.T) {
	s, _ := newTestStore(t)
	orgID := "test-org-idempotent"

	if err := s.Init(orgID); err != nil {
		t.Fatalf("first Init: %v", err)
	}
	if err := s.Init(orgID); err != nil {
		t.Fatalf("second Init should be idempotent: %v", err)
	}
}

func TestWriteAndReadFile(t *testing.T) {
	s, _ := newTestStore(t)
	orgID := "test-org-rw"

	if err := s.Init(orgID); err != nil {
		t.Fatal(err)
	}

	content := `{"pack":"auth-pack","version":"1.0.0","entities":{}}`
	if err := s.WriteFile(orgID, "auth-pack/contract.json", content, "dev@example.com", "add auth-pack"); err != nil {
		t.Fatalf("WriteFile: %v", err)
	}

	got, err := s.ReadFile(orgID, "auth-pack/contract.json")
	if err != nil {
		t.Fatalf("ReadFile: %v", err)
	}
	if got != content {
		t.Errorf("content mismatch:\ngot:  %q\nwant: %q", got, content)
	}
}

func TestWriteFile_MultipleCommits(t *testing.T) {
	s, _ := newTestStore(t)
	orgID := "test-org-multi"

	if err := s.Init(orgID); err != nil {
		t.Fatal(err)
	}

	if err := s.WriteFile(orgID, "auth-pack/contract.json", `{"version":"1.0.0"}`, "a@example.com", "v1"); err != nil {
		t.Fatalf("first write: %v", err)
	}
	if err := s.WriteFile(orgID, "auth-pack/contract.json", `{"version":"1.1.0"}`, "a@example.com", "v1.1"); err != nil {
		t.Fatalf("second write: %v", err)
	}

	got, err := s.ReadFile(orgID, "auth-pack/contract.json")
	if err != nil {
		t.Fatal(err)
	}
	if got != `{"version":"1.1.0"}` {
		t.Errorf("expected updated content, got: %q", got)
	}
}

func TestReadFile_NotFound(t *testing.T) {
	s, _ := newTestStore(t)
	orgID := "test-org-notfound"

	if err := s.Init(orgID); err != nil {
		t.Fatal(err)
	}
	if err := s.WriteFile(orgID, "foo/bar.json", `{}`, "x@x.com", "init"); err != nil {
		t.Fatal(err)
	}

	_, err := s.ReadFile(orgID, "nonexistent/file.json")
	if err == nil {
		t.Fatal("expected error for missing file")
	}
}

func TestCreateAndListTags(t *testing.T) {
	s, _ := newTestStore(t)
	orgID := "test-org-tags"

	if err := s.Init(orgID); err != nil {
		t.Fatal(err)
	}
	if err := s.WriteFile(orgID, "auth-pack/contract.json", `{"version":"1.0.0"}`, "a@b.com", "init"); err != nil {
		t.Fatal(err)
	}

	if err := s.CreateTag(orgID, "auth-pack/v1.0.0"); err != nil {
		t.Fatalf("CreateTag: %v", err)
	}

	tags, err := s.ListTags(orgID, "auth-pack/")
	if err != nil {
		t.Fatalf("ListTags: %v", err)
	}
	if len(tags) != 1 {
		t.Fatalf("expected 1 tag, got %d", len(tags))
	}
	if tags[0] != "auth-pack/v1.0.0" {
		t.Errorf("expected tag %q, got %q", "auth-pack/v1.0.0", tags[0])
	}
}

func TestListTags_PrefixFilter(t *testing.T) {
	s, _ := newTestStore(t)
	orgID := "test-org-tagfilter"

	if err := s.Init(orgID); err != nil {
		t.Fatal(err)
	}
	if err := s.WriteFile(orgID, "a.json", `{}`, "a@b.com", "init"); err != nil {
		t.Fatal(err)
	}
	_ = s.CreateTag(orgID, "auth-pack/v1.0.0")
	_ = s.CreateTag(orgID, "order-pack/v1.0.0")

	authTags, _ := s.ListTags(orgID, "auth-pack/")
	if len(authTags) != 1 || authTags[0] != "auth-pack/v1.0.0" {
		t.Errorf("unexpected auth tags: %v", authTags)
	}

	orderTags, _ := s.ListTags(orgID, "order-pack/")
	if len(orderTags) != 1 || orderTags[0] != "order-pack/v1.0.0" {
		t.Errorf("unexpected order tags: %v", orderTags)
	}
}

func TestReadFileAtTag(t *testing.T) {
	s, _ := newTestStore(t)
	orgID := "test-org-attag"

	if err := s.Init(orgID); err != nil {
		t.Fatal(err)
	}

	v1 := `{"version":"1.0.0"}`
	if err := s.WriteFile(orgID, "auth-pack/contract.json", v1, "a@b.com", "v1"); err != nil {
		t.Fatal(err)
	}
	if err := s.CreateTag(orgID, "auth-pack/v1.0.0"); err != nil {
		t.Fatal(err)
	}

	v2 := `{"version":"1.1.0"}`
	if err := s.WriteFile(orgID, "auth-pack/contract.json", v2, "a@b.com", "v1.1"); err != nil {
		t.Fatal(err)
	}

	// HEAD should be v2
	got, err := s.ReadFile(orgID, "auth-pack/contract.json")
	if err != nil || got != v2 {
		t.Errorf("HEAD: got %q, want %q", got, v2)
	}

	// Tag v1.0.0 should still read v1
	gotV1, err := s.ReadFileAtTag(orgID, "auth-pack/v1.0.0", "auth-pack/contract.json")
	if err != nil {
		t.Fatalf("ReadFileAtTag: %v", err)
	}
	if gotV1 != v1 {
		t.Errorf("at tag: got %q, want %q", gotV1, v1)
	}
}
