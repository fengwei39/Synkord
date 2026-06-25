package api

import (
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/synkord/core/database"
	"github.com/synkord/core/middleware"
	"github.com/synkord/core/services"
)

func RegisterEntityRoutes(r *gin.RouterGroup) {
	e := r.Group("/entities")
	{
		e.GET("", func(c *gin.Context) {
			skip, _ := strconv.Atoi(c.DefaultQuery("skip", "0"))
			limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))

			var projectID *string
			if pid := c.Query("project_id"); pid != "" {
				projectID = &pid
			}
			var isGlobal *bool
			if g := c.Query("is_global"); g != "" {
				v := g == "true"
				isGlobal = &v
			}

			entities, total, err := services.ListEntities(database.DB, projectID, isGlobal, skip, limit)
			if err != nil {
				c.JSON(500, gin.H{"detail": err.Error()})
				return
			}
			c.JSON(200, gin.H{"items": entities, "total": total})
		})

		e.GET("/global", func(c *gin.Context) {
			entities, err := services.GetGlobalEntities(database.DB)
			if err != nil {
				c.JSON(500, gin.H{"detail": err.Error()})
				return
			}
			c.JSON(200, entities)
		})

		e.GET("/service/:project_id", func(c *gin.Context) {
			entities, err := services.GetServiceEntities(database.DB, c.Param("project_id"))
			if err != nil {
				c.JSON(500, gin.H{"detail": err.Error()})
				return
			}
			c.JSON(200, entities)
		})

		e.POST("", middleware.RequireEditorOrAdmin(), func(c *gin.Context) {
			var req struct {
				Name          string  `json:"name" binding:"required"`
				Description   string  `json:"description"`
				IsGlobal      bool    `json:"is_global"`
				SchemaContent string  `json:"schema_content" binding:"required"`
				ProjectID     *string `json:"project_id"`
			}
			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(400, gin.H{"detail": err.Error()})
				return
			}
			userID, _ := c.Get("user_id")
			uid := userID.(string)
			entity, err := services.CreateEntity(database.DB, req.Name, req.Description, req.SchemaContent, req.IsGlobal, req.ProjectID, &uid)
			if err != nil {
				c.JSON(400, gin.H{"detail": err.Error()})
				return
			}
			c.JSON(201, entity)
		})

		e.GET("/:id", func(c *gin.Context) {
			entity, err := services.GetEntity(database.DB, c.Param("id"))
			if err != nil {
				c.JSON(404, gin.H{"detail": "Entity not found"})
				return
			}
			c.JSON(200, entity)
		})

		e.PUT("/:id", middleware.RequireEditorOrAdmin(), func(c *gin.Context) {
			var req struct {
				Name          *string `json:"name"`
				Description   *string `json:"description"`
				SchemaContent *string `json:"schema_content"`
				ChangeSummary *string `json:"change_summary"`
			}
			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(400, gin.H{"detail": err.Error()})
				return
			}
			userID, _ := c.Get("user_id")
			uid := userID.(string)
			entity, err := services.UpdateEntity(database.DB, c.Param("id"), req.Name, req.Description, req.SchemaContent, req.ChangeSummary, &uid)
			if err != nil {
				c.JSON(404, gin.H{"detail": "Entity not found"})
				return
			}
			c.JSON(200, entity)
		})

		e.GET("/:id/versions", func(c *gin.Context) {
			versions, err := services.GetEntityVersions(database.DB, c.Param("id"))
			if err != nil {
				c.JSON(500, gin.H{"detail": err.Error()})
				return
			}
			c.JSON(200, versions)
		})

		e.DELETE("/:id", middleware.RequireEditorOrAdmin(), func(c *gin.Context) {
			if err := services.DeleteEntity(database.DB, c.Param("id")); err != nil {
				c.JSON(404, gin.H{"detail": "Entity not found"})
				return
			}
			c.Status(204)
		})
	}
}
