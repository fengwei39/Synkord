package contracts

import (
	"encoding/json"
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

// ListSubscribers returns all subscribers of a pack with device/git/project info.
func (s *Service) ListSubscribers(orgID, packName string) ([]SubscriberItem, error) {
	var currentVersion string
	err := s.db.QueryRow(
		`SELECT version FROM contract_packs WHERE org_id=$1 AND name=$2`,
		orgID, packName).Scan(&currentVersion)
	if err != nil {
		return nil, ErrPackNotFound
	}

	var rows []subscriptionRecord
	// Use array_to_string for TEXT[] columns to avoid driver array parsing issues.
	// JSONB columns are read as raw text and parsed manually.
	err = s.db.Select(&rows, `
		SELECT
		  s.id, s.user_id, s.org_id, s.pack_name,
		  s.pinned_version,
		  COALESCE(s.device_info::text,  '{}')                    AS device_info,
		  COALESCE(s.git_info::text,     '{}')                    AS git_info,
		  COALESCE(array_to_string(s.project_names, ','), '')     AS project_names,
		  COALESCE(
		    array_to_string(
		      ARRAY(SELECT ge.email FROM git_emails ge WHERE ge.user_id = u.id),
		      ','
		    ),
		    ''
		  )                                                        AS git_emails,
		  COALESCE(s.updated_at, s.created_at)                    AS updated_at,
		  u.email
		FROM subscriptions s
		JOIN users u ON u.id = s.user_id
		WHERE s.org_id=$1 AND s.pack_name=$2
		ORDER BY u.email`, orgID, packName)
	if err != nil {
		return nil, fmt.Errorf("query subscribers: %w", err)
	}

	items := make([]SubscriberItem, 0, len(rows))
	for _, r := range rows {
		var device DeviceInfo
		_ = json.Unmarshal(r.DeviceInfoRaw, &device)

		var gi GitInfo
		_ = json.Unmarshal(r.GitInfoRaw, &gi)

		// Merge git emails from git_emails table
		if r.GitEmailsRaw != "" {
			for _, e := range strings.Split(r.GitEmailsRaw, ",") {
				if e != "" {
					gi.Emails = append(gi.Emails, e)
				}
			}
		}

		// Parse project names from comma-separated string
		var projectNames []string
		if r.ProjectNamesRaw != "" {
			for _, p := range strings.Split(r.ProjectNamesRaw, ",") {
				if p != "" {
					projectNames = append(projectNames, p)
				}
			}
		}

		items = append(items, SubscriberItem{
			UserID:        r.UserID,
			Email:         r.Email,
			PinnedVersion: r.PinnedVersion,
			IsLatest:      r.PinnedVersion == currentVersion,
			Device:        device,
			Git:           gi,
			ProjectNames:  projectNames,
			UpdatedAt:     r.UpdatedAt,
		})
	}
	return items, nil
}

// AddSubscriber subscribes a user (by email) to a pack with the current version as pinned.
func (s *Service) AddSubscriber(orgID, packName, email string) (*SubscriberItem, error) {
	var currentVersion string
	err := s.db.QueryRow(
		`SELECT version FROM contract_packs WHERE org_id=$1 AND name=$2`,
		orgID, packName).Scan(&currentVersion)
	if err != nil {
		return nil, ErrPackNotFound
	}

	var userID string
	err = s.db.QueryRow(`
		SELECT u.id FROM users u
		JOIN org_members om ON om.user_id = u.id
		WHERE u.email=$1 AND om.org_id=$2`, email, orgID).Scan(&userID)
	if err != nil {
		return nil, fmt.Errorf("user %q not found in organisation", email)
	}

	now := time.Now().UTC()
	_, err = s.db.Exec(`
		INSERT INTO subscriptions (user_id, org_id, pack_name, pinned_version, updated_at)
		VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT (user_id, org_id, pack_name, project_name)
		DO UPDATE SET pinned_version = EXCLUDED.pinned_version, updated_at = EXCLUDED.updated_at`,
		userID, orgID, packName, currentVersion, now)
	if err != nil {
		return nil, fmt.Errorf("insert subscription: %w", err)
	}

	return &SubscriberItem{
		UserID:        userID,
		Email:         email,
		PinnedVersion: currentVersion,
		IsLatest:      true,
		UpdatedAt:     now,
	}, nil
}

// UpdatePinnedVersion updates the pinned_version for a single subscription,
// reflecting that the user has synced and is now tracking this version.
func (s *Service) UpdatePinnedVersion(orgID, packName, userID, version string) error {
	now := time.Now().UTC()
	_, err := s.db.Exec(`
		UPDATE subscriptions
		SET pinned_version = $1, updated_at = $2
		WHERE org_id = $3 AND pack_name = $4 AND user_id = $5`,
		version, now, orgID, packName, userID)
	return err
}

// RemoveSubscriber removes a subscription by userId.
func (s *Service) RemoveSubscriber(orgID, packName, userID string) error {
	_, err := s.db.Exec(`
		DELETE FROM subscriptions WHERE org_id=$1 AND pack_name=$2 AND user_id=$3`,
		orgID, packName, userID)
	return err
}

// RegisterDevice upserts subscriptions for ALL packs in an org for the given user,
// recording device and project info. This is called by the desktop client on startup
// so every org member is automatically a subscriber.
func (s *Service) RegisterDevice(orgID, userID string, req RegisterDeviceRequest) error {
	// Fetch all packs in org
	var packs []struct {
		Name    string `db:"name"`
		Version string `db:"version"`
	}
	if err := s.db.Select(&packs,
		`SELECT name, version FROM contract_packs WHERE org_id=$1`, orgID); err != nil {
		return fmt.Errorf("list packs: %w", err)
	}

	// Fetch git emails for this user
	var gitEmails []string
	_ = s.db.Select(&gitEmails,
		`SELECT email FROM git_emails WHERE user_id=$1`, userID)
	gi := GitInfo{Emails: gitEmails}

	now := time.Now().UTC()
	for _, p := range packs {
		projectNames := pgTextArray(req.ProjectNames)
		_, err := s.db.Exec(`
			INSERT INTO subscriptions
			  (user_id, org_id, pack_name, pinned_version, device_info, git_info, project_names, updated_at)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
			ON CONFLICT (user_id, org_id, pack_name, project_name)
			DO UPDATE SET
			  device_info   = EXCLUDED.device_info,
			  git_info      = EXCLUDED.git_info,
			  project_names = EXCLUDED.project_names,
			  updated_at    = EXCLUDED.updated_at`,
			userID, orgID, p.Name, p.Version,
			req.Device, gi, projectNames, now)
		if err != nil {
			return fmt.Errorf("upsert subscription for pack %s: %w", p.Name, err)
		}
	}
	return nil
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
