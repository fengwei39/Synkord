package contracts

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
)

// Handler holds the contracts service and exposes Gin handlers.
type Handler struct {
	svc *Service
}

func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

// ListPacks  GET /api/orgs/:orgId/packs
func (h *Handler) ListPacks(c *gin.Context) {
	orgID := c.Param("orgId")
	items, err := h.svc.ListPacks(orgID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, items)
}

// CreatePack  POST /api/orgs/:orgId/packs
func (h *Handler) CreatePack(c *gin.Context) {
	orgID := c.Param("orgId")
	authorEmail := c.GetString("userEmail")

	var req CreatePackRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	item, err := h.svc.CreatePack(orgID, req.Name, req.Version, req.Content, req.ContentType, authorEmail)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, item)
}

// GetPack  GET /api/orgs/:orgId/packs/:pack
func (h *Handler) GetPack(c *gin.Context) {
	orgID := c.Param("orgId")
	name := c.Param("pack")

	detail, err := h.svc.GetPack(orgID, name)
	if err != nil {
		if errors.Is(err, ErrPackNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "pack not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, detail)
}

// UpdatePack  PUT /api/orgs/:orgId/packs/:pack
func (h *Handler) UpdatePack(c *gin.Context) {
	orgID := c.Param("orgId")
	name := c.Param("pack")
	authorEmail := c.GetString("userEmail")

	var req UpdatePackRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	item, err := h.svc.UpdatePack(orgID, name, req.Version, req.Content, req.ContentType, authorEmail)
	if err != nil {
		if errors.Is(err, ErrPackNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "pack not found"})
			return
		}
		if errors.Is(err, ErrVersionNotGreater) {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, item)
}

// ListVersions  GET /api/orgs/:orgId/packs/:pack/versions
func (h *Handler) ListVersions(c *gin.Context) {
	orgID := c.Param("orgId")
	name := c.Param("pack")

	versions, err := h.svc.ListVersions(orgID, name)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, versions)
}

// GetVersion  GET /api/orgs/:orgId/packs/:pack/versions/:version
func (h *Handler) GetVersion(c *gin.Context) {
	orgID := c.Param("orgId")
	name := c.Param("pack")
	version := c.Param("version")

	detail, err := h.svc.GetVersion(orgID, name, version)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, detail)
}

// RegisterDevice  POST /api/orgs/:orgId/register-device
// Called by the desktop client on startup to auto-subscribe the current user to
// all packs and persist device/git/project metadata.
func (h *Handler) RegisterDevice(c *gin.Context) {
	orgID := c.Param("orgId")
	userID := c.GetString("userID")

	var req RegisterDeviceRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := h.svc.RegisterDevice(orgID, userID, req); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.Status(http.StatusNoContent)
}

// ListSubscribers  GET /api/orgs/:orgId/packs/:pack/subscribers
func (h *Handler) ListSubscribers(c *gin.Context) {
	orgID := c.Param("orgId")
	name := c.Param("pack")

	items, err := h.svc.ListSubscribers(orgID, name)
	if err != nil {
		if errors.Is(err, ErrPackNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "pack not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if items == nil {
		items = []SubscriberItem{}
	}
	c.JSON(http.StatusOK, items)
}

// AddSubscriber  POST /api/orgs/:orgId/packs/:pack/subscribers
func (h *Handler) AddSubscriber(c *gin.Context) {
	orgID := c.Param("orgId")
	name := c.Param("pack")

	var req AddSubscriberRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	item, err := h.svc.AddSubscriber(orgID, name, req.Email)
	if err != nil {
		if errors.Is(err, ErrPackNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "pack not found"})
			return
		}
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, item)
}

// UpdatePinnedVersion  PATCH /api/orgs/:orgId/packs/:pack/subscribers/me
// Called after an IDE sync so the cloud knows the user has pulled this version.
func (h *Handler) UpdatePinnedVersion(c *gin.Context) {
	orgID := c.Param("orgId")
	name := c.Param("pack")
	userID := c.GetString("userID")

	var body struct {
		Version string `json:"version"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || body.Version == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "version required"})
		return
	}

	if err := h.svc.UpdatePinnedVersion(orgID, name, userID, body.Version); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.Status(http.StatusNoContent)
}

// RemoveSubscriber  DELETE /api/orgs/:orgId/packs/:pack/subscribers/:userId
func (h *Handler) RemoveSubscriber(c *gin.Context) {
	orgID := c.Param("orgId")
	name := c.Param("pack")
	userID := c.Param("userId")

	if err := h.svc.RemoveSubscriber(orgID, name, userID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.Status(http.StatusNoContent)
}

// DeletePack  DELETE /api/orgs/:orgId/packs/:pack  (admin only)
func (h *Handler) DeletePack(c *gin.Context) {
	orgID := c.Param("orgId")
	name := c.Param("pack")
	authorEmail := c.GetString("userEmail")

	if err := h.svc.DeletePack(orgID, name, authorEmail); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.Status(http.StatusNoContent)
}
