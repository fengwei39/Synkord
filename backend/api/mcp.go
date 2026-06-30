package api

import (
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/synkord/core/database"
	"github.com/synkord/core/models"
	"github.com/synkord/core/services"
)

type mcpConfigRequest struct {
	Name      string   `json:"name"`
	Purpose   string   `json:"purpose"`
	ToolScope []string `json:"tool_scope"`
	ExpiresAt string   `json:"expires_at"`
}

type mcpConfigPatchRequest struct {
	Status    models.MCPConfigStatus `json:"status"`
	ToolScope []string               `json:"tool_scope"`
}

type mcpIntrospectRequest struct {
	Token     string `json:"token"`
	TeamID    string `json:"team_id"`
	ProjectID string `json:"project_id"`
}

func RegisterProjectMCPRoutes(r *gin.RouterGroup) {
	m := r.Group("/teams/:team_id/projects/:project_id/mcp")
	{
		m.GET("", func(c *gin.Context) {
			if !requireProjectMember(c) {
				return
			}
			overview, err := services.GetProjectMCPOverview(database.DB, c.Param("team_id"), c.Param("project_id"))
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"detail": err.Error()})
				return
			}
			c.JSON(http.StatusOK, overview)
		})

		m.GET("/tokens", func(c *gin.Context) {
			if !requireProjectMember(c) {
				return
			}
			configs, err := services.ListProjectMCPConfigs(database.DB, c.Param("team_id"), c.Param("project_id"))
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"detail": err.Error()})
				return
			}
			c.JSON(http.StatusOK, gin.H{"items": configs})
		})

		m.POST("/tokens", func(c *gin.Context) {
			if !requireTeamAdmin(c, c.Param("team_id")) || !requireProjectExists(c) {
				return
			}
			var req mcpConfigRequest
			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
				return
			}
			input, err := buildMCPConfigInput(req)
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
				return
			}
			uid := c.GetString("user_id")
			config, err := services.CreateProjectMCPConfig(database.DB, c.Param("team_id"), c.Param("project_id"), &uid, input)
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
				return
			}
			c.JSON(http.StatusCreated, config)
		})

		m.PATCH("/tokens/:token_id", func(c *gin.Context) {
			if !requireTeamAdmin(c, c.Param("team_id")) || !requireProjectExists(c) {
				return
			}
			var req mcpConfigPatchRequest
			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
				return
			}
			config, err := services.UpdateProjectMCPConfig(database.DB, c.Param("team_id"), c.Param("project_id"), c.Param("token_id"), req.Status, req.ToolScope)
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
				return
			}
			c.JSON(http.StatusOK, config)
		})

		m.POST("/tokens/:token_id/rotate", func(c *gin.Context) {
			if !requireTeamAdmin(c, c.Param("team_id")) || !requireProjectExists(c) {
				return
			}
			config, err := services.RotateProjectMCPConfigToken(database.DB, c.Param("team_id"), c.Param("project_id"), c.Param("token_id"))
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
				return
			}
			c.JSON(http.StatusOK, config)
		})

		m.GET("/audit", func(c *gin.Context) {
			if !requireProjectMember(c) {
				return
			}
			skip, _ := strconv.Atoi(c.DefaultQuery("skip", "0"))
			limit, _ := strconv.Atoi(c.DefaultQuery("limit", "100"))
			items, total, err := services.ListMCPAuditLogs(database.DB, c.Param("team_id"), c.Param("project_id"), skip, limit)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"detail": err.Error()})
				return
			}
			c.JSON(http.StatusOK, gin.H{"items": items, "total": total})
		})
	}
}

func RegisterLocalMCPRoutes(r *gin.RouterGroup) {
	m := r.Group("/mcp")
	{
		m.POST("/introspect", func(c *gin.Context) {
			var req mcpIntrospectRequest
			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
				return
			}
			ctx, err := services.ValidateMCPAccessToken(database.DB, req.Token, req.TeamID, req.ProjectID)
			if err != nil {
				c.JSON(http.StatusUnauthorized, gin.H{"ok": false, "detail": err.Error()})
				return
			}
			c.JSON(http.StatusOK, gin.H{
				"ok":            true,
				"team_id":       ctx.Config.TeamID,
				"project_id":    ctx.Config.ProjectID,
				"config_id":     ctx.Config.ID,
				"tool_scope":    ctx.ToolScope,
				"token_preview": ctx.Config.TokenPreview,
				"expires_at":    ctx.Config.ExpiresAt,
			})
		})

		m.POST("/query", func(c *gin.Context) {
			var req services.MCPQueryRequest
			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
				return
			}
			result, ctx, err := services.ExecuteMCPQuery(database.DB, req)
			status := "success"
			errorMessage := ""
			if err != nil {
				status = "error"
				errorMessage = err.Error()
			}
			configID := ""
			if ctx != nil {
				configID = ctx.Config.ID
			}
			_, _ = services.CreateMCPAuditLog(database.DB, services.MCPAuditInput{
				TeamID:        req.TeamID,
				ProjectID:     req.ProjectID,
				MCPConfigID:   configID,
				ToolName:      req.Tool,
				Caller:        "local-mcp",
				ParamsSummary: summarizeMCPArgs(req.Arguments),
				ResultStatus:  status,
				ErrorMessage:  errorMessage,
			})
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
				return
			}
			c.JSON(http.StatusOK, gin.H{"result": result})
		})

		m.POST("/audit", func(c *gin.Context) {
			var req services.MCPAuditInput
			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
				return
			}
			if req.Token == "" {
				c.JSON(http.StatusUnauthorized, gin.H{"detail": "MCP token required"})
				return
			}
			item, err := services.CreateMCPAuditLog(database.DB, req)
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
				return
			}
			c.JSON(http.StatusCreated, item)
		})
	}
}

func buildMCPConfigInput(req mcpConfigRequest) (services.MCPConfigInput, error) {
	var expiresAt *time.Time
	if req.ExpiresAt != "" {
		parsed, err := time.Parse("2006-01-02", req.ExpiresAt)
		if err != nil {
			return services.MCPConfigInput{}, err
		}
		expiresAt = &parsed
	}
	return services.MCPConfigInput{
		Name:      req.Name,
		Purpose:   req.Purpose,
		ToolScope: req.ToolScope,
		ExpiresAt: expiresAt,
	}, nil
}

func requireProjectMember(c *gin.Context) bool {
	if _, err := services.GetTeamForUser(database.DB, c.Param("team_id"), c.GetString("user_id")); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"detail": "Team not found"})
		return false
	}
	return requireProjectExists(c)
}

func requireProjectExists(c *gin.Context) bool {
	var project models.Project
	if err := database.DB.First(&project, "id = ? AND team_id = ?", c.Param("project_id"), c.Param("team_id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"detail": "Project not found"})
		return false
	}
	return true
}

func summarizeMCPArgs(args map[string]interface{}) string {
	if len(args) == 0 {
		return "{}"
	}
	out := "{"
	count := 0
	for key := range args {
		if count > 0 {
			out += ", "
		}
		out += key
		count++
		if count >= 8 {
			out += ", ..."
			break
		}
	}
	out += "}"
	return out
}
