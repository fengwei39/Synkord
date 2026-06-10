package diff

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"synkord/server/internal/contracts"
)

// Handler exposes the diff endpoint.
type Handler struct {
	contractsSvc *contracts.Service
}

func NewHandler(contractsSvc *contracts.Service) *Handler {
	return &Handler{contractsSvc: contractsSvc}
}

// GetDiff  GET /api/orgs/:orgId/packs/:pack/diff?from=1.0.0&to=1.2.0
func (h *Handler) GetDiff(c *gin.Context) {
	orgID := c.Param("orgId")
	packName := c.Param("pack")
	fromVer := c.Query("from")
	toVer := c.Query("to")

	if fromVer == "" || toVer == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "'from' and 'to' query params are required"})
		return
	}

	fromDetail, err := h.contractsSvc.GetVersion(orgID, packName, fromVer)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "version " + fromVer + " not found"})
		return
	}

	toDetail, err := h.contractsSvc.GetVersion(orgID, packName, toVer)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "version " + toVer + " not found"})
		return
	}

	result, err := Compute(fromVer, toVer, fromDetail.Content, toDetail.Content)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, result)
}
