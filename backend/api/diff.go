package api

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/synkord/core/database"
	"github.com/synkord/core/models"
	"github.com/synkord/core/services"
)

func RegisterDiffRoutes(r *gin.RouterGroup) {
	d := r.Group("/diff")
	{
		d.POST("/detect", func(c *gin.Context) {
			var req struct {
				ServiceName string `json:"service_name" binding:"required"`
				ProjectID   string `json:"project_id" binding:"required"`
				OldSpec     string `json:"old_spec" binding:"required"`
				NewSpec     string `json:"new_spec" binding:"required"`
				OldVersion  string `json:"old_version"`
				NewVersion  string `json:"new_version"`
			}
			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(400, gin.H{"detail": err.Error()})
				return
			}

			affected, _ := services.FindAffectedProjects(database.DB, req.ProjectID)
			result := services.DetectBreakingChanges(req.OldSpec, req.NewSpec, req.ServiceName, req.OldVersion, req.NewVersion, affected)
			var changedBy *string
			if userID, ok := c.Get("user_id"); ok {
				if uid, ok := userID.(string); ok {
					changedBy = &uid
				}
			}
			changeSet, err := services.SaveChangeSet(database.DB, req.ProjectID, changedBy, result)
			if err != nil {
				c.JSON(500, gin.H{"detail": err.Error()})
				return
			}
			c.JSON(200, gin.H{"result": result, "change_set": changeSet})
		})

		d.GET("/changesets", func(c *gin.Context) {
			skip, _ := strconv.Atoi(c.DefaultQuery("skip", "0"))
			limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
			items, total, err := services.ListChangeSets(database.DB, c.Query("project_id"), skip, limit)
			if err != nil {
				c.JSON(500, gin.H{"detail": err.Error()})
				return
			}
			c.JSON(200, gin.H{"items": items, "total": total})
		})

		d.POST("/validate", func(c *gin.Context) {
			var req struct {
				CodeSnippet string `json:"code_snippet" binding:"required"`
				ProjectID   string `json:"project_id" binding:"required"`
			}
			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(400, gin.H{"detail": err.Error()})
				return
			}

			entities, err := services.GetServiceEntities(database.DB, req.ProjectID)
			if err != nil {
				c.JSON(500, gin.H{"detail": err.Error()})
				return
			}

			schemas := make([]string, len(entities))
			for i, e := range entities {
				schemas[i] = e.SchemaContent
			}

			result := services.ValidateEntityUsage(req.CodeSnippet, schemas)
			c.JSON(200, result)
		})
	}
}

func RegisterTeamDiffRoutes(r *gin.RouterGroup) {
	d := r.Group("/teams/:team_id/diff")
	{
		d.POST("/check", func(c *gin.Context) {
			teamID := c.Param("team_id")
			if !requireTeamEditor(c, teamID) {
				return
			}

			var req struct {
				ServiceName string `json:"service_name"`
				ProjectID   string `json:"project_id" binding:"required"`
				OldSpec     string `json:"old_spec" binding:"required"`
				NewSpec     string `json:"new_spec" binding:"required"`
				OldVersion  string `json:"old_version"`
				NewVersion  string `json:"new_version"`
			}
			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
				return
			}

			var project models.Project
			if err := database.DB.First(&project, "id = ? AND team_id = ?", req.ProjectID, teamID).Error; err != nil {
				c.JSON(http.StatusNotFound, gin.H{"detail": "Project not found"})
				return
			}
			if req.ServiceName == "" {
				req.ServiceName = project.Name
			}

			affected, _ := services.FindTeamAffectedProjects(database.DB, teamID, req.ProjectID)
			result := services.DetectBreakingChanges(req.OldSpec, req.NewSpec, req.ServiceName, req.OldVersion, req.NewVersion, affected)
			uid := c.GetString("user_id")
			changeSet, err := services.SaveTeamChangeSet(database.DB, teamID, req.ProjectID, &uid, result)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"detail": err.Error()})
				return
			}
			c.JSON(http.StatusOK, gin.H{"result": result, "change_set": changeSet})
		})

		d.GET("/changesets", func(c *gin.Context) {
			teamID := c.Param("team_id")
			if _, err := services.GetTeamForUser(database.DB, teamID, c.GetString("user_id")); err != nil {
				c.JSON(http.StatusNotFound, gin.H{"detail": "Team not found"})
				return
			}
			skip, _ := strconv.Atoi(c.DefaultQuery("skip", "0"))
			limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
			items, total, err := services.ListTeamChangeSets(database.DB, teamID, c.Query("project_id"), skip, limit)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"detail": err.Error()})
				return
			}
			c.JSON(http.StatusOK, gin.H{"items": items, "total": total})
		})
	}
}
