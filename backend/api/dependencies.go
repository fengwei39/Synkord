package api

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/synkord/core/database"
	"github.com/synkord/core/models"
	"github.com/synkord/core/services"
)

func RegisterTeamDependencyRoutes(r *gin.RouterGroup) {
	d := r.Group("/teams/:team_id/projects/:project_id/dependencies")
	{
		d.GET("/graph", func(c *gin.Context) {
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
			graph, err := services.GetProjectDependencyGraph(database.DB, teamID, projectID)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"detail": err.Error()})
				return
			}
			c.JSON(http.StatusOK, graph)
		})

		d.GET("", func(c *gin.Context) {
			teamID := c.Param("team_id")
			projectID := c.Param("project_id")
			if _, err := services.GetTeamForUser(database.DB, teamID, c.GetString("user_id")); err != nil {
				c.JSON(http.StatusNotFound, gin.H{"detail": "Team not found"})
				return
			}
			deps, err := services.GetTeamProjectDependencies(database.DB, teamID, projectID)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"detail": err.Error()})
				return
			}
			c.JSON(http.StatusOK, deps)
		})

		d.POST("", func(c *gin.Context) {
			teamID := c.Param("team_id")
			if !requireTeamEditor(c, teamID) {
				return
			}
			var req struct {
				SourceProjectID string  `json:"source_project_id" binding:"required"`
				TargetProjectID string  `json:"target_project_id" binding:"required"`
				EntityName      string  `json:"entity_name"`
				APIPath         string  `json:"api_path"`
				APIMethod       string  `json:"api_method"`
				DependencyType  string  `json:"dependency_type"`
				Source          string  `json:"source"`
				LockedVersion   *string `json:"locked_version"`
			}
			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
				return
			}
			currentProjectID := c.Param("project_id")
			if req.SourceProjectID != currentProjectID && req.TargetProjectID != currentProjectID {
				c.JSON(http.StatusBadRequest, gin.H{"detail": "Dependency must include current project"})
				return
			}
			var count int64
			database.DB.Model(&models.Project{}).
				Where("team_id = ? AND id IN ?", teamID, []string{req.SourceProjectID, req.TargetProjectID}).
				Count(&count)
			if count != 2 {
				c.JSON(http.StatusBadRequest, gin.H{"detail": "Source and target projects must belong to current team"})
				return
			}
			dep, err := services.CreateDependency(database.DB, req.SourceProjectID, req.TargetProjectID, req.EntityName, req.APIPath, req.APIMethod, req.DependencyType, req.Source, req.LockedVersion)
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
				return
			}
			c.JSON(http.StatusCreated, dep)
		})

		d.DELETE("/:id", func(c *gin.Context) {
			if !requireTeamEditor(c, c.Param("team_id")) {
				return
			}
			if err := services.DeleteTeamDependency(database.DB, c.Param("team_id"), c.Param("id")); err != nil {
				c.JSON(http.StatusNotFound, gin.H{"detail": "Dependency not found"})
				return
			}
			c.Status(http.StatusNoContent)
		})
	}
}
