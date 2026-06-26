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

func RegisterProjectRoutes(r *gin.RouterGroup) {
	p := r.Group("/projects")
	{
		p.GET("", func(c *gin.Context) {
			projectType := c.Query("project_type")
			skip, _ := strconv.Atoi(c.DefaultQuery("skip", "0"))
			limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))

			query := database.DB.Model(&models.Project{})
			if projectType != "" {
				query = query.Where("project_type = ?", projectType)
			}

			var total int64
			query.Count(&total)

			var projects []models.Project
			query.Order("name").Offset(skip).Limit(limit).Find(&projects)

			c.JSON(200, gin.H{"items": projects, "total": total})
		})

		p.POST("", middleware.RequireEditorOrAdmin(), func(c *gin.Context) {
			var project models.Project
			if err := c.ShouldBindJSON(&project); err != nil {
				c.JSON(400, gin.H{"detail": err.Error()})
				return
			}
			if err := database.DB.Create(&project).Error; err != nil {
				c.JSON(400, gin.H{"detail": err.Error()})
				return
			}
			c.JSON(201, project)
		})

		p.GET("/:id", func(c *gin.Context) {
			var project models.Project
			if err := database.DB.First(&project, "id = ?", c.Param("id")).Error; err != nil {
				c.JSON(404, gin.H{"detail": "Project not found"})
				return
			}
			c.JSON(200, project)
		})

		p.PUT("/:id", middleware.RequireEditorOrAdmin(), func(c *gin.Context) {
			var project models.Project
			if err := database.DB.First(&project, "id = ?", c.Param("id")).Error; err != nil {
				c.JSON(404, gin.H{"detail": "Project not found"})
				return
			}
			var updates models.Project
			if err := c.ShouldBindJSON(&updates); err != nil {
				c.JSON(400, gin.H{"detail": err.Error()})
				return
			}
			database.DB.Model(&project).Updates(updates)
			c.JSON(200, project)
		})

		p.DELETE("/:id", middleware.RequireEditorOrAdmin(), func(c *gin.Context) {
			if err := database.DB.Delete(&models.Project{}, "id = ?", c.Param("id")).Error; err != nil {
				c.JSON(404, gin.H{"detail": "Project not found"})
				return
			}
			c.Status(204)
		})
	}
}

func RegisterTeamProjectRoutes(r *gin.RouterGroup) {
	p := r.Group("/teams/:team_id/projects")
	{
		p.GET("", func(c *gin.Context) {
			teamID := c.Param("team_id")
			if _, err := services.GetTeamForUser(database.DB, teamID, c.GetString("user_id")); err != nil {
				c.JSON(http.StatusNotFound, gin.H{"detail": "Team not found"})
				return
			}

			projectType := c.Query("project_type")
			skip, _ := strconv.Atoi(c.DefaultQuery("skip", "0"))
			limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))

			query := database.DB.Model(&models.Project{}).Where("team_id = ?", teamID)
			if projectType != "" {
				query = query.Where("project_type = ?", projectType)
			}

			var total int64
			query.Count(&total)

			var projects []models.Project
			query.Order("name").Offset(skip).Limit(limit).Find(&projects)

			c.JSON(http.StatusOK, gin.H{"items": projects, "total": total})
		})

		p.POST("", func(c *gin.Context) {
			teamID := c.Param("team_id")
			if !requireTeamEditor(c, teamID) {
				return
			}

			var project models.Project
			if err := c.ShouldBindJSON(&project); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
				return
			}
			project.TeamID = teamID
			if err := database.DB.Create(&project).Error; err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
				return
			}
			c.JSON(http.StatusCreated, project)
		})

		p.GET("/:project_id", func(c *gin.Context) {
			var project models.Project
			if err := database.DB.First(&project, "id = ? AND team_id = ?", c.Param("project_id"), c.Param("team_id")).Error; err != nil {
				c.JSON(http.StatusNotFound, gin.H{"detail": "Project not found"})
				return
			}
			c.JSON(http.StatusOK, project)
		})

		p.PATCH("/:project_id", func(c *gin.Context) {
			if !requireTeamEditor(c, c.Param("team_id")) {
				return
			}
			updateTeamProject(c)
		})

		p.PUT("/:project_id", func(c *gin.Context) {
			if !requireTeamEditor(c, c.Param("team_id")) {
				return
			}
			updateTeamProject(c)
		})

		p.DELETE("/:project_id", func(c *gin.Context) {
			if !requireTeamEditor(c, c.Param("team_id")) {
				return
			}
			if err := database.DB.Delete(&models.Project{}, "id = ? AND team_id = ?", c.Param("project_id"), c.Param("team_id")).Error; err != nil {
				c.JSON(http.StatusNotFound, gin.H{"detail": "Project not found"})
				return
			}
			c.Status(http.StatusNoContent)
		})
	}
}

func requireTeamEditor(c *gin.Context, teamID string) bool {
	team, err := services.GetTeamForUser(database.DB, teamID, c.GetString("user_id"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"detail": "Team not found"})
		return false
	}
	if team.Role != models.TeamRoleAdmin && team.Role != models.TeamRoleEditor {
		c.JSON(http.StatusForbidden, gin.H{"detail": "Insufficient team permissions"})
		return false
	}
	return true
}

func requireTeamAdmin(c *gin.Context, teamID string) bool {
	team, err := services.GetTeamForUser(database.DB, teamID, c.GetString("user_id"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"detail": "Team not found"})
		return false
	}
	if team.Role != models.TeamRoleAdmin {
		c.JSON(http.StatusForbidden, gin.H{"detail": "Insufficient team permissions"})
		return false
	}
	return true
}

func updateTeamProject(c *gin.Context) {
	var project models.Project
	if err := database.DB.First(&project, "id = ? AND team_id = ?", c.Param("project_id"), c.Param("team_id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"detail": "Project not found"})
		return
	}
	var updates models.Project
	if err := c.ShouldBindJSON(&updates); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
		return
	}
	updates.TeamID = project.TeamID
	if err := database.DB.Model(&project).Updates(updates).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
		return
	}
	c.JSON(http.StatusOK, project)
}
