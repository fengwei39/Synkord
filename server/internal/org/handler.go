package org

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"

	"synkord/server/internal/auth"
)

type Handler struct {
	svc *Service
}

func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

func (h *Handler) CreateOrg(c *gin.Context) {
	var req CreateOrgRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	resp, err := h.svc.CreateOrg(c.Request.Context(), auth.GetUserID(c), req)
	if err != nil {
		if errors.Is(err, ErrSlugTaken) {
			c.JSON(http.StatusConflict, gin.H{"error": "slug already taken"})
			return
		}
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, resp)
}

func (h *Handler) GetMyOrgs(c *gin.Context) {
	orgs, err := h.svc.GetMyOrgs(c.Request.Context(), auth.GetUserID(c))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}
	c.JSON(http.StatusOK, orgs)
}

func (h *Handler) GetOrg(c *gin.Context) {
	resp, err := h.svc.GetOrgByID(c.Request.Context(), c.Param("orgId"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "organization not found"})
		return
	}
	c.JSON(http.StatusOK, resp)
}

func (h *Handler) CreateInvite(c *gin.Context) {
	var req CreateInviteRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	resp, err := h.svc.CreateInvite(c.Request.Context(), c.Param("orgId"), auth.GetUserID(c), req)
	if err != nil {
		switch {
		case errors.Is(err, ErrNotMember), errors.Is(err, ErrNotAdmin):
			c.JSON(http.StatusForbidden, gin.H{"error": "admin permission required"})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		}
		return
	}

	c.JSON(http.StatusCreated, resp)
}

func (h *Handler) GetInvite(c *gin.Context) {
	resp, err := h.svc.GetInvite(c.Request.Context(), c.Param("token"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "invite not found"})
		return
	}
	c.JSON(http.StatusOK, resp)
}

func (h *Handler) ListMembers(c *gin.Context) {
	members, err := h.svc.ListMembers(c.Request.Context(), c.Param("orgId"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}
	c.JSON(http.StatusOK, members)
}

func (h *Handler) RemoveMember(c *gin.Context) {
	err := h.svc.RemoveMember(
		c.Request.Context(),
		c.Param("orgId"),
		auth.GetUserID(c),
		c.Param("userId"),
	)
	if err != nil {
		switch {
		case errors.Is(err, ErrCannotRemoveSelf):
			c.JSON(http.StatusBadRequest, gin.H{"error": "cannot remove yourself"})
		case errors.Is(err, ErrNotAdmin), errors.Is(err, ErrNotMember):
			c.JSON(http.StatusForbidden, gin.H{"error": "admin permission required"})
		case errors.Is(err, ErrMemberNotFound):
			c.JSON(http.StatusNotFound, gin.H{"error": "member not found"})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		}
		return
	}
	c.Status(http.StatusNoContent)
}

func (h *Handler) UpdateMemberRole(c *gin.Context) {
	var req UpdateRoleRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	resp, err := h.svc.UpdateMemberRole(
		c.Request.Context(),
		c.Param("orgId"),
		auth.GetUserID(c),
		c.Param("userId"),
		req.Role,
	)
	if err != nil {
		switch {
		case errors.Is(err, ErrInvalidRole):
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		case errors.Is(err, ErrNotAdmin), errors.Is(err, ErrNotMember):
			c.JSON(http.StatusForbidden, gin.H{"error": "admin permission required"})
		case errors.Is(err, ErrMemberNotFound):
			c.JSON(http.StatusNotFound, gin.H{"error": "member not found"})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		}
		return
	}
	c.JSON(http.StatusOK, resp)
}

func (h *Handler) AcceptInvite(c *gin.Context) {
	resp, err := h.svc.AcceptInvite(c.Request.Context(), c.Param("token"), auth.GetUserID(c))
	if err != nil {
		switch {
		case errors.Is(err, ErrInviteNotFound):
			c.JSON(http.StatusNotFound, gin.H{"error": "invite not found"})
		case errors.Is(err, ErrInviteExpired):
			c.JSON(http.StatusGone, gin.H{"error": "invite has expired"})
		case errors.Is(err, ErrInviteUsed):
			c.JSON(http.StatusConflict, gin.H{"error": "invite already used"})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		}
		return
	}

	c.JSON(http.StatusOK, resp)
}
