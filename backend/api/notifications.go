package api

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/synkord/core/database"
	"github.com/synkord/core/models"
	"github.com/synkord/core/services"
)

func RegisterTeamNotificationRoutes(r *gin.RouterGroup) {
	n := r.Group("/teams/:team_id/notifications")
	{
		n.GET("", func(c *gin.Context) {
			teamID := c.Param("team_id")
			if _, err := services.GetTeamForUser(database.DB, teamID, c.GetString("user_id")); err != nil {
				c.JSON(http.StatusNotFound, gin.H{"detail": "Team not found"})
				return
			}

			skip, _ := strconv.Atoi(c.DefaultQuery("skip", "0"))
			limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
			unreadOnly := c.Query("status") == string(models.NotificationUnread)

			items, total, err := services.ListTeamNotifications(database.DB, teamID, unreadOnly, skip, limit)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"detail": err.Error()})
				return
			}
			c.JSON(http.StatusOK, gin.H{"items": items, "total": total})
		})

		n.GET("/webhook", func(c *gin.Context) {
			teamID := c.Param("team_id")
			if _, err := services.GetTeamForUser(database.DB, teamID, c.GetString("user_id")); err != nil {
				c.JSON(http.StatusNotFound, gin.H{"detail": "Team not found"})
				return
			}
			config, err := services.GetWebhookConfig(database.DB, teamID)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"detail": err.Error()})
				return
			}
			c.JSON(http.StatusOK, config)
		})

		n.PATCH("/webhook", func(c *gin.Context) {
			teamID := c.Param("team_id")
			if !requireTeamAdmin(c, teamID) {
				return
			}
			var req services.WebhookConfigInput
			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
				return
			}
			config, err := services.UpdateWebhookConfig(database.DB, teamID, req)
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
				return
			}
			c.JSON(http.StatusOK, config)
		})

		n.POST("/webhook/test", func(c *gin.Context) {
			teamID := c.Param("team_id")
			if !requireTeamAdmin(c, teamID) {
				return
			}
			if err := services.TestWebhookConfig(database.DB, teamID); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
				return
			}
			c.JSON(http.StatusOK, gin.H{"status": "sent"})
		})

		n.POST("/:notification_id/read", func(c *gin.Context) {
			teamID := c.Param("team_id")
			if _, err := services.GetTeamForUser(database.DB, teamID, c.GetString("user_id")); err != nil {
				c.JSON(http.StatusNotFound, gin.H{"detail": "Team not found"})
				return
			}
			notification, err := services.MarkNotificationRead(database.DB, teamID, c.Param("notification_id"))
			if err != nil {
				c.JSON(http.StatusNotFound, gin.H{"detail": "Notification not found"})
				return
			}
			c.JSON(http.StatusOK, notification)
		})

		n.POST("/:notification_id/retry", func(c *gin.Context) {
			teamID := c.Param("team_id")
			if !requireTeamAdmin(c, teamID) {
				return
			}
			notification, err := services.RetryNotificationDelivery(database.DB, teamID, c.Param("notification_id"))
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
				return
			}
			c.JSON(http.StatusOK, notification)
		})
	}
}
