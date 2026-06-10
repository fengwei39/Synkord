package gitstore

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/go-git/go-git/v5"
	"github.com/go-git/go-git/v5/plumbing"
	"github.com/go-git/go-git/v5/plumbing/object"
)

var ErrFileNotFound = errors.New("file not found in repository")

// Store manages one git repository per organization.
// Layout:  baseDir/{orgID}/contracts/  (regular repo with worktree)
type Store struct {
	baseDir string
}

func New(baseDir string) *Store {
	return &Store{baseDir: baseDir}
}

func (s *Store) repoPath(orgID string) string {
	return filepath.Join(s.baseDir, orgID, "contracts")
}

// Init creates a new git repository for the organization.
// Safe to call multiple times (idempotent).
func (s *Store) Init(orgID string) error {
	path := s.repoPath(orgID)
	if err := os.MkdirAll(path, 0o755); err != nil {
		return fmt.Errorf("create repo dir: %w", err)
	}

	_, err := git.PlainInit(path, false)
	if errors.Is(err, git.ErrRepositoryAlreadyExists) {
		return nil // already initialised
	}
	if err != nil {
		return fmt.Errorf("git init: %w", err)
	}
	return nil
}

// WriteFile writes content to filePath inside the org's repo and creates a commit.
// authorEmail is used as both the git author name and email.
func (s *Store) WriteFile(orgID, filePath, content, authorEmail, message string) error {
	repo, err := git.PlainOpen(s.repoPath(orgID))
	if err != nil {
		return fmt.Errorf("open repo: %w", err)
	}

	w, err := repo.Worktree()
	if err != nil {
		return fmt.Errorf("get worktree: %w", err)
	}

	absPath := filepath.Join(s.repoPath(orgID), filepath.FromSlash(filePath))
	if err := os.MkdirAll(filepath.Dir(absPath), 0o755); err != nil {
		return fmt.Errorf("create parent dirs: %w", err)
	}
	if err := os.WriteFile(absPath, []byte(content), 0o644); err != nil {
		return fmt.Errorf("write file: %w", err)
	}

	if _, err := w.Add(filePath); err != nil {
		return fmt.Errorf("git add: %w", err)
	}

	_, err = w.Commit(message, &git.CommitOptions{
		Author: &object.Signature{
			Name:  authorEmail,
			Email: authorEmail,
			When:  time.Now(),
		},
	})
	if err != nil {
		return fmt.Errorf("git commit: %w", err)
	}

	return nil
}

// ReadFile returns the content of filePath at HEAD.
func (s *Store) ReadFile(orgID, filePath string) (string, error) {
	repo, err := git.PlainOpen(s.repoPath(orgID))
	if err != nil {
		return "", fmt.Errorf("open repo: %w", err)
	}

	ref, err := repo.Head()
	if err != nil {
		return "", ErrFileNotFound
	}

	commit, err := repo.CommitObject(ref.Hash())
	if err != nil {
		return "", fmt.Errorf("get commit: %w", err)
	}

	tree, err := commit.Tree()
	if err != nil {
		return "", fmt.Errorf("get tree: %w", err)
	}

	entry, err := tree.File(filePath)
	if err != nil {
		return "", ErrFileNotFound
	}

	contents, err := entry.Contents()
	if err != nil {
		return "", fmt.Errorf("read contents: %w", err)
	}

	return contents, nil
}

// ReadFileAtTag returns the content of filePath at a specific tag.
func (s *Store) ReadFileAtTag(orgID, tagName, filePath string) (string, error) {
	repo, err := git.PlainOpen(s.repoPath(orgID))
	if err != nil {
		return "", fmt.Errorf("open repo: %w", err)
	}

	ref, err := repo.Tag(tagName)
	if err != nil {
		return "", fmt.Errorf("tag %q not found: %w", tagName, err)
	}

	commit, err := repo.CommitObject(ref.Hash())
	if err != nil {
		// Tag might point directly to a commit or a tag object
		tagObj, tagErr := repo.TagObject(ref.Hash())
		if tagErr != nil {
			return "", fmt.Errorf("resolve tag: %w", err)
		}
		commit, err = tagObj.Commit()
		if err != nil {
			return "", fmt.Errorf("resolve tag commit: %w", err)
		}
	}

	tree, err := commit.Tree()
	if err != nil {
		return "", fmt.Errorf("get tree: %w", err)
	}

	entry, err := tree.File(filePath)
	if err != nil {
		return "", ErrFileNotFound
	}

	return entry.Contents()
}

// CreateTag creates a lightweight tag at HEAD.
func (s *Store) CreateTag(orgID, tagName string) error {
	repo, err := git.PlainOpen(s.repoPath(orgID))
	if err != nil {
		return fmt.Errorf("open repo: %w", err)
	}

	ref, err := repo.Head()
	if err != nil {
		return fmt.Errorf("get HEAD: %w", err)
	}

	tagRef := plumbing.NewTagReferenceName(tagName)
	if err := repo.Storer.SetReference(plumbing.NewHashReference(tagRef, ref.Hash())); err != nil {
		return fmt.Errorf("create tag: %w", err)
	}

	return nil
}

// ListTags returns all tag names that start with prefix, sorted newest-first.
func (s *Store) ListTags(orgID, prefix string) ([]string, error) {
	repo, err := git.PlainOpen(s.repoPath(orgID))
	if err != nil {
		return nil, fmt.Errorf("open repo: %w", err)
	}

	iter, err := repo.Tags()
	if err != nil {
		return nil, fmt.Errorf("list tags: %w", err)
	}

	var names []string
	err = iter.ForEach(func(ref *plumbing.Reference) error {
		name := ref.Name().Short()
		if strings.HasPrefix(name, prefix) {
			names = append(names, name)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}

	return names, nil
}
