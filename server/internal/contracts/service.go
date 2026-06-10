package contracts

import (
	"errors"
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/jmoiron/sqlx"
	"synkord/server/internal/gitstore"
)

var semverRe = regexp.MustCompile(`^\d+\.\d+\.\d+$`)

// ErrPackNotFound is returned when the requested pack does not exist.
var ErrPackNotFound = errors.New("contract pack not found")

// ErrVersionNotGreater is returned when the new version is not greater than the current one.
var ErrVersionNotGreater = errors.New("new version must be greater than current version")

// PublishEvent contains the context of a newly published pack version.
type PublishEvent struct {
	OrgID       string
	PackName    string
	OldVersion  string
	NewVersion  string
	DiffSummary interface{}
}

// Notifier is implemented by the notify.Service to receive publish events.
type Notifier interface {
	OnPublish(ev PublishEvent)
}

// Service handles contract pack business logic.
type Service struct {
	db       *sqlx.DB
	store    *gitstore.Store
	notifier Notifier
}

func NewService(db *sqlx.DB, store *gitstore.Store) *Service {
	return &Service{db: db, store: store}
}

// SetNotifier registers a publish event listener.
func (s *Service) SetNotifier(n Notifier) {
	s.notifier = n
}

// ListPacks returns all packs for an organisation.
func (s *Service) ListPacks(orgID string) ([]PackListItem, error) {
	var rows []packRecord
	err := s.db.Select(&rows,
		`SELECT id, org_id, name, version, COALESCE(content_type,'text') as content_type, owner_email, updated_at
		 FROM contract_packs WHERE org_id = $1 ORDER BY updated_at DESC`, orgID)
	if err != nil {
		return nil, fmt.Errorf("query packs: %w", err)
	}

	items := make([]PackListItem, 0, len(rows))
	for _, r := range rows {
		items = append(items, PackListItem{
			Name:        r.Name,
			Version:     r.Version,
			ContentType: r.ContentType,
			UpdatedAt:   r.UpdatedAt,
			OwnerEmail:  r.OwnerEmail,
		})
	}
	return items, nil
}

// CreatePack creates a new contract pack with arbitrary text content.
func (s *Service) CreatePack(orgID, name, version, content, contentType, authorEmail string) (*PackListItem, error) {
	if !semverRe.MatchString(version) {
		return nil, fmt.Errorf("version %q is not valid semver (e.g. 1.0.0)", version)
	}
	if contentType == "" {
		contentType = "text"
	}

	filePath := name + "/contract"
	commitMsg := fmt.Sprintf("feat(%s): create pack v%s", name, version)
	if err := s.store.WriteFile(orgID, filePath, content, authorEmail, commitMsg); err != nil {
		return nil, fmt.Errorf("git write: %w", err)
	}

	tagName := fmt.Sprintf("%s/v%s", name, version)
	if err := s.store.CreateTag(orgID, tagName); err != nil {
		return nil, fmt.Errorf("git tag: %w", err)
	}

	now := time.Now().UTC()
	_, err := s.db.Exec(
		`INSERT INTO contract_packs (org_id, name, version, content_type, owner_email, updated_at)
		 VALUES ($1, $2, $3, $4, $5, $6)`,
		orgID, name, version, contentType, authorEmail, now)
	if err != nil {
		return nil, fmt.Errorf("insert pack: %w", err)
	}

	return &PackListItem{
		Name:        name,
		Version:     version,
		ContentType: contentType,
		UpdatedAt:   now,
		OwnerEmail:  authorEmail,
	}, nil
}

// GetPack returns the latest content of a pack.
func (s *Service) GetPack(orgID, name string) (*PackDetail, error) {
	var rec packRecord
	err := s.db.Get(&rec,
		`SELECT id, org_id, name, version, COALESCE(content_type,'text') as content_type, owner_email, updated_at
		 FROM contract_packs WHERE org_id = $1 AND name = $2`, orgID, name)
	if err != nil {
		return nil, ErrPackNotFound
	}

	content, err := s.store.ReadFile(orgID, name+"/contract")
	if err != nil {
		return nil, fmt.Errorf("git read: %w", err)
	}

	return &PackDetail{Name: rec.Name, Version: rec.Version, ContentType: rec.ContentType, Content: content}, nil
}

// UpdatePack updates a pack with new content. The new version must be greater.
func (s *Service) UpdatePack(orgID, name, version, content, contentType, authorEmail string) (*PackListItem, error) {
	if !semverRe.MatchString(version) {
		return nil, fmt.Errorf("version %q is not valid semver (e.g. 1.0.0)", version)
	}

	var rec packRecord
	err := s.db.Get(&rec,
		`SELECT id, org_id, name, version, COALESCE(content_type,'text') as content_type, owner_email, updated_at
		 FROM contract_packs WHERE org_id = $1 AND name = $2`, orgID, name)
	if err != nil {
		return nil, ErrPackNotFound
	}

	if !isVersionGreater(rec.Version, version) {
		return nil, ErrVersionNotGreater
	}

	if contentType == "" {
		contentType = rec.ContentType
	}

	filePath := name + "/contract"
	commitMsg := fmt.Sprintf("feat(%s): update pack v%s", name, version)
	if err := s.store.WriteFile(orgID, filePath, content, authorEmail, commitMsg); err != nil {
		return nil, fmt.Errorf("git write: %w", err)
	}

	tagName := fmt.Sprintf("%s/v%s", name, version)
	if err := s.store.CreateTag(orgID, tagName); err != nil {
		return nil, fmt.Errorf("git tag: %w", err)
	}

	now := time.Now().UTC()
	_, err = s.db.Exec(
		`UPDATE contract_packs SET version=$1, content_type=$2, owner_email=$3, updated_at=$4
		 WHERE org_id=$5 AND name=$6`,
		version, contentType, authorEmail, now, orgID, name)
	if err != nil {
		return nil, fmt.Errorf("update pack: %w", err)
	}

	if s.notifier != nil {
		s.notifier.OnPublish(PublishEvent{
			OrgID:      orgID,
			PackName:   name,
			OldVersion: rec.Version,
			NewVersion: version,
		})
	}

	return &PackListItem{
		Name:        name,
		Version:     version,
		ContentType: contentType,
		UpdatedAt:   now,
		OwnerEmail:  authorEmail,
	}, nil
}

// ListVersions lists all git tags for a pack, newest first.
func (s *Service) ListVersions(orgID, name string) ([]VersionInfo, error) {
	prefix := name + "/v"
	infos, err := s.store.ListTagsWithInfo(orgID, prefix)
	if err != nil {
		return nil, fmt.Errorf("list tags: %w", err)
	}

	versions := make([]VersionInfo, 0, len(infos))
	for _, t := range infos {
		ver := strings.TrimPrefix(t.TagName, prefix)
		versions = append(versions, VersionInfo{
			Version:     ver,
			TagName:     t.TagName,
			CommittedAt: t.CommittedAt,
			AuthorEmail: t.AuthorEmail,
		})
	}
	return versions, nil
}

// GetVersion returns the content of a pack at a specific version.
func (s *Service) GetVersion(orgID, name, version string) (*PackDetail, error) {
	tagName := fmt.Sprintf("%s/v%s", name, version)
	filePath := name + "/contract"

	content, err := s.store.ReadFileAtTag(orgID, tagName, filePath)
	if err != nil {
		return nil, fmt.Errorf("read version: %w", err)
	}

	return &PackDetail{Name: name, Version: version, Content: content}, nil
}

// DeletePack removes a pack from git and the database.
func (s *Service) DeletePack(orgID, name, authorEmail string) error {
	filePath := name + "/contract"
	commitMsg := fmt.Sprintf("chore(%s): delete pack", name)
	if err := s.store.DeleteFile(orgID, filePath, authorEmail, commitMsg); err != nil {
		return fmt.Errorf("git delete: %w", err)
	}

	_, err := s.db.Exec(
		`DELETE FROM contract_packs WHERE org_id=$1 AND name=$2`, orgID, name)
	return err
}

// ─── helpers ─────────────────────────────────────────────────────────────────

type semver struct{ major, minor, patch int }

func parseSemver(v string) semver {
	parts := strings.Split(v, ".")
	if len(parts) != 3 {
		return semver{}
	}
	maj, _ := strconv.Atoi(parts[0])
	min, _ := strconv.Atoi(parts[1])
	pat, _ := strconv.Atoi(parts[2])
	return semver{maj, min, pat}
}

func isVersionGreater(oldV, newV string) bool {
	o := parseSemver(oldV)
	n := parseSemver(newV)
	if n.major != o.major {
		return n.major > o.major
	}
	if n.minor != o.minor {
		return n.minor > o.minor
	}
	return n.patch > o.patch
}
