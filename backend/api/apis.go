package api

import (
	"net/http"
	"strconv"
	"strings"

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
				Format    string `json:"format"`
			}
			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(400, gin.H{"detail": err.Error()})
				return
			}
			result, err := importAPISpec(req.ProjectID, req.Spec, req.Format)
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

func RegisterTeamAPIRoutes(r *gin.RouterGroup) {
	a := r.Group("/teams/:team_id/apis")
	{
		a.GET("", func(c *gin.Context) {
			teamID := c.Param("team_id")
			if _, err := services.GetTeamForUser(database.DB, teamID, c.GetString("user_id")); err != nil {
				c.JSON(http.StatusNotFound, gin.H{"detail": "Team not found"})
				return
			}

			skip, _ := strconv.Atoi(c.DefaultQuery("skip", "0"))
			limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))

			query := database.DB.Model(&models.APIEndpoint{}).
				Joins("JOIN projects ON projects.id = api_endpoints.project_id").
				Where("projects.team_id = ?", teamID)
			if projectID := c.Query("project_id"); projectID != "" {
				query = query.Where("api_endpoints.project_id = ?", projectID)
			}
			if q := c.Query("q"); q != "" {
				like := "%" + q + "%"
				query = query.Where("api_endpoints.path LIKE ? OR api_endpoints.summary LIKE ? OR api_endpoints.tag LIKE ?", like, like, like)
			}

			var total int64
			query.Count(&total)

			var apis []models.APIEndpoint
			if err := query.Order("api_endpoints.path, api_endpoints.method").Offset(skip).Limit(limit).Find(&apis).Error; err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"detail": err.Error()})
				return
			}
			c.JSON(http.StatusOK, gin.H{"items": apis, "total": total})
		})

		a.POST("/import", func(c *gin.Context) {
			teamID := c.Param("team_id")
			if !requireTeamEditor(c, teamID) {
				return
			}

			var req struct {
				ProjectID string `json:"project_id" binding:"required"`
				Spec      string `json:"spec" binding:"required"`
				Format    string `json:"format"`
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

			result, err := importAPISpec(req.ProjectID, req.Spec, req.Format)
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
				return
			}
			c.JSON(http.StatusOK, result)
		})

		a.GET("/:api_id", func(c *gin.Context) {
			teamID := c.Param("team_id")
			if _, err := services.GetTeamForUser(database.DB, teamID, c.GetString("user_id")); err != nil {
				c.JSON(http.StatusNotFound, gin.H{"detail": "Team not found"})
				return
			}

			var endpoint models.APIEndpoint
			if err := database.DB.
				Joins("JOIN projects ON projects.id = api_endpoints.project_id").
				Where("api_endpoints.id = ? AND projects.team_id = ?", c.Param("api_id"), teamID).
				First(&endpoint).Error; err != nil {
				c.JSON(http.StatusNotFound, gin.H{"detail": "API not found"})
				return
			}
			c.JSON(http.StatusOK, endpoint)
		})
	}
}

func importAPISpec(projectID, spec, format string) (*services.ImportOpenAPIResult, error) {
	switch strings.ToLower(strings.TrimSpace(format)) {
	case "", "openapi", "swagger":
		return services.ImportOpenAPISpec(database.DB, projectID, spec)
	case "postman":
		return services.ImportPostmanCollection(database.DB, projectID, spec)
	default:
		return nil, services.ErrUnsupportedAPIImportFormat(format)
	}
}
