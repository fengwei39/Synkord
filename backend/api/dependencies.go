package api

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/synkord/core/database"
	"github.com/synkord/core/middleware"
	"github.com/synkord/core/models"
	"github.com/synkord/core/services"
)

func RegisterDependencyRoutes(r *gin.RouterGroup) {
	d := r.Group("/dependencies")
	{
		d.GET("/graph", func(c *gin.Context) {
			graph, err := services.GetFullDependencyGraph(database.DB)
			if err != nil {
				c.JSON(500, gin.H{"detail": err.Error()})
				return
			}
			c.JSON(200, graph)
		})

		d.GET("/entity/:name", func(c *gin.Context) {
			deps, err := services.GetEntityDependencies(database.DB, c.Param("name"))
			if err != nil {
				c.JSON(500, gin.H{"detail": err.Error()})
				return
			}
			c.JSON(200, deps)
		})

		d.GET("/api", func(c *gin.Context) {
			deps, err := services.GetAPIDependencies(database.DB, c.Query("path"), c.Query("method"))
			if err != nil {
				c.JSON(500, gin.H{"detail": err.Error()})
				return
			}
			c.JSON(200, deps)
		})

		d.GET("/project/:id", func(c *gin.Context) {
			deps, err := services.GetProjectDependencies(database.DB, c.Param("id"))
			if err != nil {
				c.JSON(500, gin.H{"detail": err.Error()})
				return
			}
			c.JSON(200, deps)
		})

		d.GET("/affected/:id", func(c *gin.Context) {
			projects, err := services.FindAffectedProjects(database.DB, c.Param("id"))
			if err != nil {
				c.JSON(500, gin.H{"detail": err.Error()})
				return
			}
			c.JSON(200, gin.H{"project_id": c.Param("id"), "affected_projects": projects})
		})

		d.POST("", middleware.RequireEditorOrAdmin(), func(c *gin.Context) {
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
				c.JSON(400, gin.H{"detail": err.Error()})
				return
			}
			dep, err := services.CreateDependency(database.DB, req.SourceProjectID, req.TargetProjectID, req.EntityName, req.APIPath, req.APIMethod, req.DependencyType, req.Source, req.LockedVersion)
			if err != nil {
				c.JSON(400, gin.H{"detail": err.Error()})
				return
			}
			c.JSON(201, dep)
		})

		d.DELETE("/:id", middleware.RequireEditorOrAdmin(), func(c *gin.Context) {
			if err := services.DeleteDependency(database.DB, c.Param("id")); err != nil {
				c.JSON(404, gin.H{"detail": "Dependency not found"})
				return
			}
			c.Status(204)
		})
	}
}

func RegisterTeamDependencyRoutes(r *gin.RouterGroup) {
	d := r.Group("/teams/:team_id/dependencies")
	{
		d.GET("/graph", func(c *gin.Context) {
			teamID := c.Param("team_id")
			if _, err := services.GetTeamForUser(database.DB, teamID, c.GetString("user_id")); err != nil {
				c.JSON(http.StatusNotFound, gin.H{"detail": "Team not found"})
				return
			}
			graph, err := services.GetTeamDependencyGraph(database.DB, teamID)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"detail": err.Error()})
				return
			}
			c.JSON(http.StatusOK, graph)
		})

		d.GET("/project/:project_id", func(c *gin.Context) {
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

		d.GET("/affected/:project_id", func(c *gin.Context) {
			teamID := c.Param("team_id")
			projectID := c.Param("project_id")
			if _, err := services.GetTeamForUser(database.DB, teamID, c.GetString("user_id")); err != nil {
				c.JSON(http.StatusNotFound, gin.H{"detail": "Team not found"})
				return
			}
			projects, err := services.FindTeamAffectedProjects(database.DB, teamID, projectID)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"detail": err.Error()})
				return
			}
			c.JSON(http.StatusOK, gin.H{"project_id": projectID, "affected_projects": projects})
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
			if err := services.DeleteDependency(database.DB, c.Param("id")); err != nil {
				c.JSON(http.StatusNotFound, gin.H{"detail": "Dependency not found"})
				return
			}
			c.Status(http.StatusNoContent)
		})
	}
}
