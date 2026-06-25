package api

import (
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/synkord/core/database"
	"github.com/synkord/core/middleware"
	"github.com/synkord/core/models"
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
