package api

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/synkord/core/database"
	"github.com/synkord/core/middleware"
	"github.com/synkord/core/models"
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

func RegisterTeamModelRoutes(r *gin.RouterGroup) {
	m := r.Group("/teams/:team_id/models")
	{
		m.GET("", func(c *gin.Context) {
			teamID := c.Param("team_id")
			if _, err := services.GetTeamForUser(database.DB, teamID, c.GetString("user_id")); err != nil {
				c.JSON(http.StatusNotFound, gin.H{"detail": "Team not found"})
				return
			}

			skip, _ := strconv.Atoi(c.DefaultQuery("skip", "0"))
			limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))

			var projectID *string
			if pid := c.Query("project_id"); pid != "" {
				projectID = &pid
			}
			var isTeamModel *bool
			if v := c.Query("is_team_model"); v != "" {
				value := v == "true"
				isTeamModel = &value
			}

			entities, total, err := services.ListTeamEntities(database.DB, teamID, projectID, isTeamModel, skip, limit)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"detail": err.Error()})
				return
			}
			c.JSON(http.StatusOK, gin.H{"items": entities, "total": total})
		})

		m.POST("", func(c *gin.Context) {
			teamID := c.Param("team_id")
			if !requireTeamEditor(c, teamID) {
				return
			}

			var req struct {
				Name          string  `json:"name" binding:"required"`
				Description   string  `json:"description"`
				IsTeamModel   bool    `json:"is_team_model"`
				SchemaContent string  `json:"schema_content" binding:"required"`
				ProjectID     *string `json:"project_id"`
			}
			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
				return
			}
			if req.ProjectID != nil {
				var project models.Project
				if err := database.DB.First(&project, "id = ? AND team_id = ?", *req.ProjectID, teamID).Error; err != nil {
					c.JSON(http.StatusNotFound, gin.H{"detail": "Project not found"})
					return
				}
			}

			uid := c.GetString("user_id")
			entity, err := services.CreateTeamEntity(database.DB, teamID, req.Name, req.Description, req.SchemaContent, req.IsTeamModel, req.ProjectID, &uid)
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
				return
			}
			c.JSON(http.StatusCreated, entity)
		})

		m.GET("/:model_id", func(c *gin.Context) {
			entity, err := services.GetTeamEntity(database.DB, c.Param("team_id"), c.Param("model_id"))
			if err != nil {
				c.JSON(http.StatusNotFound, gin.H{"detail": "Model not found"})
				return
			}
			c.JSON(http.StatusOK, entity)
		})

		m.PATCH("/:model_id", func(c *gin.Context) {
			updateTeamModel(c)
		})

		m.PUT("/:model_id", func(c *gin.Context) {
			updateTeamModel(c)
		})

		m.GET("/:model_id/versions", func(c *gin.Context) {
			if _, err := services.GetTeamEntity(database.DB, c.Param("team_id"), c.Param("model_id")); err != nil {
				c.JSON(http.StatusNotFound, gin.H{"detail": "Model not found"})
				return
			}
			versions, err := services.GetEntityVersions(database.DB, c.Param("model_id"))
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"detail": err.Error()})
				return
			}
			c.JSON(http.StatusOK, versions)
		})

		m.DELETE("/:model_id", func(c *gin.Context) {
			teamID := c.Param("team_id")
			if !requireTeamEditor(c, teamID) {
				return
			}
			if err := services.DeleteTeamEntity(database.DB, teamID, c.Param("model_id")); err != nil {
				c.JSON(http.StatusNotFound, gin.H{"detail": "Model not found"})
				return
			}
			c.Status(http.StatusNoContent)
		})
	}
}

func updateTeamModel(c *gin.Context) {
	teamID := c.Param("team_id")
	if !requireTeamEditor(c, teamID) {
		return
	}

	var req struct {
		Name          *string `json:"name"`
		Description   *string `json:"description"`
		SchemaContent *string `json:"schema_content"`
		ChangeSummary *string `json:"change_summary"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
		return
	}
	uid := c.GetString("user_id")
	entity, err := services.UpdateTeamEntity(database.DB, teamID, c.Param("model_id"), req.Name, req.Description, req.SchemaContent, req.ChangeSummary, &uid)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"detail": "Model not found"})
		return
	}
	c.JSON(http.StatusOK, entity)
}
