package contracts

import (
	"database/sql/driver"
	"encoding/json"
	"fmt"
	"time"
)

// ─── JSONB helpers ────────────────────────────────────────────────────────────

// DeviceInfo holds OS / machine information reported by the client.
type DeviceInfo struct {
	Platform string `json:"platform"` // "darwin" | "win32" | "linux"
	Hostname string `json:"hostname"`
	Username string `json:"username,omitempty"`
}

// GitInfo holds the git identities registered on the device.
type GitInfo struct {
	Emails []string `json:"emails"`
}

// jsonbValue / jsonbScan lets sqlx store/load these structs as JSONB.
type jsonbDeviceInfo DeviceInfo
type jsonbGitInfo GitInfo

func (d DeviceInfo) Value() (driver.Value, error) {
	return json.Marshal(d)
}
func (d *DeviceInfo) Scan(src any) error {
	if src == nil {
		return nil
	}
	b, ok := src.([]byte)
	if !ok {
		return fmt.Errorf("DeviceInfo.Scan: expected []byte, got %T", src)
	}
	return json.Unmarshal(b, d)
}

func (g GitInfo) Value() (driver.Value, error) {
	return json.Marshal(g)
}
func (g *GitInfo) Scan(src any) error {
	if src == nil {
		return nil
	}
	b, ok := src.([]byte)
	if !ok {
		return fmt.Errorf("GitInfo.Scan: expected []byte, got %T", src)
	}
	return json.Unmarshal(b, g)
}

// pgTextArray lets sqlx read/write TEXT[] columns.
type pgTextArray []string

func (a pgTextArray) Value() (driver.Value, error) {
	if len(a) == 0 {
		return "{}", nil
	}
	b, err := json.Marshal([]string(a))
	if err != nil {
		return nil, err
	}
	// Convert JSON array → Postgres literal  {"a","b"}
	var strs []string
	_ = json.Unmarshal(b, &strs)
	out := "{"
	for i, s := range strs {
		if i > 0 {
			out += ","
		}
		out += `"` + s + `"`
	}
	out += "}"
	return out, nil
}
func (a *pgTextArray) Scan(src any) error {
	if src == nil {
		*a = nil
		return nil
	}
	var s string
	switch v := src.(type) {
	case []byte:
		s = string(v)
	case string:
		s = v
	default:
		return fmt.Errorf("pgTextArray.Scan: unexpected type %T", src)
	}
	// Parse Postgres array literal: {a,b,"c d"}
	s = s[1 : len(s)-1] // strip { }
	if s == "" {
		*a = []string{}
		return nil
	}
	// simple CSV-like split (no escaping needed for our use-case)
	var out []string
	for _, part := range splitPGArray(s) {
		out = append(out, part)
	}
	*a = out
	return nil
}

func splitPGArray(s string) []string {
	var result []string
	var cur []byte
	inQuote := false
	for i := 0; i < len(s); i++ {
		c := s[i]
		if c == '"' {
			inQuote = !inQuote
		} else if c == ',' && !inQuote {
			result = append(result, string(cur))
			cur = cur[:0]
		} else {
			cur = append(cur, c)
		}
	}
	result = append(result, string(cur))
	return result
}

// PackListItem is returned by GET /orgs/:orgId/packs
type PackListItem struct {
	Name        string    `json:"name"`
	Version     string    `json:"version"`
	ContentType string    `json:"contentType"` // e.g. "markdown", "yaml", "json"
	UpdatedAt   time.Time `json:"updatedAt"`
	OwnerEmail  string    `json:"ownerEmail"`
}

// PackDetail is returned by GET /orgs/:orgId/packs/:pack
type PackDetail struct {
	Name        string `json:"name"`
	Version     string `json:"version"`
	ContentType string `json:"contentType"`
	Content     string `json:"content"`
}

// VersionInfo is one entry in GET /orgs/:orgId/packs/:pack/versions
type VersionInfo struct {
	Version     string    `json:"version"`
	TagName     string    `json:"tagName"`
	CommittedAt time.Time `json:"committedAt"`
	AuthorEmail string    `json:"authorEmail"`
}

// CreatePackRequest is the body for POST /orgs/:orgId/packs
type CreatePackRequest struct {
	Name        string `json:"name"        binding:"required"`
	Version     string `json:"version"     binding:"required"`
	Content     string `json:"content"     binding:"required"`
	ContentType string `json:"contentType"` // optional: "markdown","yaml","json","text"…
}

// UpdatePackRequest is the body for PUT /orgs/:orgId/packs/:pack
type UpdatePackRequest struct {
	Version     string `json:"version"     binding:"required"`
	Content     string `json:"content"     binding:"required"`
	ContentType string `json:"contentType"`
}

// SubscriberItem represents one subscriber of a contract pack.
type SubscriberItem struct {
	UserID        string     `json:"userId"`
	Email         string     `json:"email"`
	PinnedVersion string     `json:"pinnedVersion"`
	IsLatest      bool       `json:"isLatest"`
	Device        DeviceInfo `json:"device"`
	Git           GitInfo    `json:"git"`
	ProjectNames  []string   `json:"projectNames"`
	UpdatedAt     time.Time  `json:"updatedAt"`
}

// AddSubscriberRequest is the body for POST /orgs/:orgId/packs/:pack/subscribers
type AddSubscriberRequest struct {
	Email string `json:"email" binding:"required"`
}

// RegisterDeviceRequest is the body for POST /api/orgs/:orgId/register-device
// The client sends its device/git/project info; the server upserts subscriptions
// for ALL packs in the org so every member is automatically a subscriber.
type RegisterDeviceRequest struct {
	Device       DeviceInfo `json:"device"`
	ProjectNames []string   `json:"projectNames"` // local project names for this org
}

// subscriptionRecord mirrors the subscriptions DB row (internal use).
type subscriptionRecord struct {
	ID            string      `db:"id"`
	UserID        string      `db:"user_id"`
	OrgID         string      `db:"org_id"`
	PackName      string      `db:"pack_name"`
	PinnedVersion string      `db:"pinned_version"`
	DeviceInfo    DeviceInfo  `db:"device_info"`
	GitInfo       GitInfo     `db:"git_info"`
	ProjectNames  pgTextArray `db:"project_names"`
	UpdatedAt     time.Time   `db:"updated_at"`
	Email         string      `db:"email"` // joined from users
	GitEmails     pgTextArray `db:"git_emails"` // joined from user_git_emails
}

// packRecord mirrors the contract_packs DB row (internal use).
type packRecord struct {
	ID          string    `db:"id"`
	OrgID       string    `db:"org_id"`
	Name        string    `db:"name"`
	Version     string    `db:"version"`
	ContentType string    `db:"content_type"`
	OwnerEmail  string    `db:"owner_email"`
	UpdatedAt   time.Time `db:"updated_at"`
}
