package contracts

import "time"

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
