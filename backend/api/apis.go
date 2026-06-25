package api

import (
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/synkord/core/database"
	"github.com/synkord/core/middleware"
	"github.com/synkord/core/models"
	"github.com/synkord/core/services"
)

func RegisterAPIRoutes(r *gin.RouterGroup) {
	a := r.Group("/apis")
	{
		a.GET("", func(c *gin.Context) {
			skip, _ := strconv.Atoi(c.DefaultQuery("skip", "0"))
			limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
			apis, total, err := services.ListAPIs(database.DB, c.Query("project_id"), c.Query("q"), skip, limit)
			if err != nil {
				c.JSON(500, gin.H{"detail": err.Error()})
				return
			}
			c.JSON(200, gin.H{"items": apis, "total": total})
		})

		a.GET("/project/:project_id", func(c *gin.Context) {
			apis, err := services.GetProjectAPIs(database.DB, c.Param("project_id"))
			if err != nil {
				c.JSON(500, gin.H{"detail": err.Error()})
				return
			}
			c.JSON(200, apis)
		})

		a.POST("/import", middleware.RequireEditorOrAdmin(), func(c *gin.Context) {
			var req struct {
				ProjectID string `json:"project_id" binding:"required"`
				Spec      string `json:"spec" binding:"required"`
			}
			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(400, gin.H{"detail": err.Error()})
				return
			}
			result, err := services.ImportOpenAPISpec(database.DB, req.ProjectID, req.Spec)
			if err != nil {
				c.JSON(400, gin.H{"detail": err.Error()})
				return
			}
			c.JSON(200, result)
		})

		a.GET("/:id", func(c *gin.Context) {
			var endpoint models.APIEndpoint
			if err := database.DB.First(&endpoint, "id = ?", c.Param("id")).Error; err != nil {
				c.JSON(404, gin.H{"detail": "API not found"})
				return
			}
			c.JSON(200, endpoint)
		})
	}
}
