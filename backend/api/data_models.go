package api

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/synkord/core/database"
	"github.com/synkord/core/services"
)

func RegisterTeamModelRoutes(r *gin.RouterGroup) {
	m := r.Group("/teams/:team_id/projects/:project_id/models")
	{
		m.GET("", func(c *gin.Context) {
			teamID := c.Param("team_id")
			projectID := c.Param("project_id")
			if _, err := services.GetTeamForUser(database.DB, teamID, c.GetString("user_id")); err != nil {
				c.JSON(http.StatusNotFound, gin.H{"detail": "Team not found"})
				return
			}
			if !projectBelongsToTeam(projectID, teamID) {
				c.JSON(http.StatusNotFound, gin.H{"detail": "Project not found"})
				return
			}

			skip, _ := strconv.Atoi(c.DefaultQuery("skip", "0"))
			limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))

			entities, total, err := services.ListProjectEntities(database.DB, teamID, projectID, skip, limit)
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
				Name          string `json:"name" binding:"required"`
				Description   string `json:"description"`
				SchemaContent string `json:"schema_content" binding:"required"`
			}
			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
				return
			}
			projectID := c.Param("project_id")
			if !projectBelongsToTeam(projectID, teamID) {
				c.JSON(http.StatusNotFound, gin.H{"detail": "Project not found"})
				return
			}

			uid := c.GetString("user_id")
			entity, err := services.CreateProjectEntity(database.DB, teamID, projectID, req.Name, req.Description, req.SchemaContent, &uid)
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
				return
			}
			c.JSON(http.StatusCreated, entity)
		})

		m.GET("/:model_id", func(c *gin.Context) {
			entity, err := services.GetProjectEntity(database.DB, c.Param("team_id"), c.Param("project_id"), c.Param("model_id"))
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
			if _, err := services.GetProjectEntity(database.DB, c.Param("team_id"), c.Param("project_id"), c.Param("model_id")); err != nil {
				c.JSON(http.StatusNotFound, gin.H{"detail": "Model not found"})
				return
			}
			versions, err := services.GetDataModelVersions(database.DB, c.Param("model_id"))
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
			if err := services.DeleteProjectEntity(database.DB, teamID, c.Param("project_id"), c.Param("model_id")); err != nil {
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
	entity, err := services.UpdateProjectEntity(database.DB, teamID, c.Param("project_id"), c.Param("model_id"), req.Name, req.Description, req.SchemaContent, req.ChangeSummary, &uid)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"detail": "Model not found"})
		return
	}
	c.JSON(http.StatusOK, entity)
}
