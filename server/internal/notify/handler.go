package notify

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin:     func(r *http.Request) bool { return true },
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
}

// Handler exposes notify REST endpoints and the WebSocket endpoint.
type Handler struct {
	svc *Service
	hub *Hub
}

func NewHandler(svc *Service, hub *Hub) *Handler {
	return &Handler{svc: svc, hub: hub}
}

// Subscribe  POST /api/orgs/:orgId/packs/:pack/subscribe
func (h *Handler) Subscribe(c *gin.Context) {
	userID := c.GetString("userID")
	orgID := c.Param("orgId")
	packName := c.Param("pack")

	var req SubscribeRequest
	_ = c.ShouldBindJSON(&req)

	id, err := h.svc.Subscribe(userID, orgID, packName, req.ProjectName)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"id": id})
}

// Unsubscribe  DELETE /api/orgs/:orgId/packs/:pack/subscribe
func (h *Handler) Unsubscribe(c *gin.Context) {
	userID := c.GetString("userID")
	orgID := c.Param("orgId")
	packName := c.Param("pack")

	if err := h.svc.Unsubscribe(userID, orgID, packName); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.Status(http.StatusNoContent)
}

// ListNotifications  GET /api/notifications?unreadOnly=true
func (h *Handler) ListNotifications(c *gin.Context) {
	userID := c.GetString("userID")
	unreadOnly := c.Query("unreadOnly") == "true"

	items, err := h.svc.ListNotifications(userID, unreadOnly)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if items == nil {
		items = []Notification{}
	}
	c.JSON(http.StatusOK, items)
}

// MarkRead  PUT /api/notifications/:id/read
func (h *Handler) MarkRead(c *gin.Context) {
	userID := c.GetString("userID")
	notifID := c.Param("id")

	if err := h.svc.MarkRead(userID, notifID); err != nil {
		if errors.Is(err, ErrNotificationNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "notification not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.Status(http.StatusNoContent)
}

// ServeWS  GET /ws?token=<jwt>
// The token is validated by auth middleware before reaching this handler.
func (h *Handler) ServeWS(c *gin.Context) {
	userID := c.GetString("userID")
	if userID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		return
	}

	h.hub.ServeClient(userID, conn)
}
