package contracts

import (
	"database/sql/driver"
	"encoding/json"
	"time"
)

// ─── JSONB value types (used for INSERT/UPDATE only) ─────────────────────────

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

// Value lets DeviceInfo be passed as a JSONB parameter in INSERT/UPDATE.
func (d DeviceInfo) Value() (driver.Value, error) { return json.Marshal(d) }

// Value lets GitInfo be passed as a JSONB parameter in INSERT/UPDATE.
func (g GitInfo) Value() (driver.Value, error) { return json.Marshal(g) }

// pgTextArray is used for INSERT/UPDATE of TEXT[] columns.
type pgTextArray []string

func (a pgTextArray) Value() (driver.Value, error) {
	if len(a) == 0 {
		return "{}", nil
	}
	out := "{"
	for i, s := range a {
		if i > 0 {
			out += ","
		}
		out += `"` + s + `"`
	}
	return out + "}", nil
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
// JSONB columns are scanned as json.RawMessage to avoid driver type issues.
type subscriptionRecord struct {
	ID              string          `db:"id"`
	UserID          string          `db:"user_id"`
	OrgID           string          `db:"org_id"`
	PackName        string          `db:"pack_name"`
	PinnedVersion   string          `db:"pinned_version"`
	DeviceInfoRaw   json.RawMessage `db:"device_info"`
	GitInfoRaw      json.RawMessage `db:"git_info"`
	ProjectNamesRaw string          `db:"project_names"` // read as text, then parse
	GitEmailsRaw    string          `db:"git_emails"`    // read as text, then parse
	UpdatedAt       time.Time       `db:"updated_at"`
	Email           string          `db:"email"`
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
