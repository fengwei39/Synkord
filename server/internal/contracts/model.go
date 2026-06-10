package contracts

import "time"

// PackListItem is returned by GET /orgs/:orgId/packs
type PackListItem struct {
	Name       string    `json:"name"`
	Version    string    `json:"version"`
	UpdatedAt  time.Time `json:"updatedAt"`
	OwnerEmail string    `json:"ownerEmail"`
}

// PackDetail is returned by GET /orgs/:orgId/packs/:pack
type PackDetail struct {
	Name    string `json:"name"`
	Version string `json:"version"`
	Content string `json:"content"`
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
	Name    string `json:"name"    binding:"required"`
	Content string `json:"content" binding:"required"`
}

// UpdatePackRequest is the body for PUT /orgs/:orgId/packs/:pack
type UpdatePackRequest struct {
	Content string `json:"content" binding:"required"`
}

// packRecord mirrors the contract_packs DB row (internal use).
type packRecord struct {
	ID         string    `db:"id"`
	OrgID      string    `db:"org_id"`
	Name       string    `db:"name"`
	Version    string    `db:"version"`
	OwnerEmail string    `db:"owner_email"`
	UpdatedAt  time.Time `db:"updated_at"`
}
