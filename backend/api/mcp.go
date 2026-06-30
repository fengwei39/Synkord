package api

import (
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/synkord/core/database"
	"github.com/synkord/core/middleware"
	"github.com/synkord/core/models"
	"github.com/synkord/core/services"
)

type mcpConfigRequest struct {
	Name         string   `json:"name"`
	Purpose      string   `json:"purpose"`
	ProjectScope []string `json:"project_scope"`
	ToolScope    []string `json:"tool_scope"`
	ExpiresAt    string   `json:"expires_at"`
}

type mcpStatusRequest struct {
	Status models.MCPConfigStatus `json:"status"`
}

type enabledRequest struct {
	Enabled bool `json:"enabled"`
}

type globalMCPRequest struct {
	Enabled            bool     `json:"enabled"`
	Tools              []string `json:"tools"`
	RateLimitPerMinute int      `json:"rate_limit_per_minute"`
}

func RegisterTeamMCPRoutes(r *gin.RouterGroup) {
	m := r.Group("/teams/:team_id/mcp")
	{
		m.GET("", func(c *gin.Context) {
			teamID := c.Param("team_id")
			if _, err := services.GetTeamForUser(database.DB, teamID, c.GetString("user_id")); err != nil {
				c.JSON(http.StatusNotFound, gin.H{"detail": "Team not found"})
				return
			}
			overview, err := teamMCPOverview(teamID)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"detail": err.Error()})
				return
			}
			c.JSON(http.StatusOK, overview)
		})

		m.PATCH("", func(c *gin.Context) {
			teamID := c.Param("team_id")
			if !requireTeamAdmin(c, teamID) {
				return
			}
			var req enabledRequest
			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
				return
			}
			if _, err := services.UpdateTeamMCPEnabled(database.DB, teamID, req.Enabled); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"detail": err.Error()})
				return
			}
			overview, err := teamMCPOverview(teamID)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"detail": err.Error()})
				return
			}
			c.JSON(http.StatusOK, overview)
		})

		m.GET("/tokens", func(c *gin.Context) {
			teamID := c.Param("team_id")
			if _, err := services.GetTeamForUser(database.DB, teamID, c.GetString("user_id")); err != nil {
				c.JSON(http.StatusNotFound, gin.H{"detail": "Team not found"})
				return
			}
			configs, err := services.ListTeamMCPConfigs(database.DB, teamID)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"detail": err.Error()})
				return
			}
			c.JSON(http.StatusOK, gin.H{"items": configs})
		})

		m.POST("/tokens", func(c *gin.Context) {
			teamID := c.Param("team_id")
			if !requireTeamAdmin(c, teamID) {
				return
			}
			var req mcpConfigRequest
			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
				return
			}
			if req.Name == "" || req.Purpose == "" {
				c.JSON(http.StatusBadRequest, gin.H{"detail": "name and purpose are required"})
				return
			}
			input, err := buildMCPConfigInput(req)
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
				return
			}
			uid := c.GetString("user_id")
			config, err := services.CreateMCPConfig(database.DB, teamID, &uid, input)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"detail": err.Error()})
				return
			}
			c.JSON(http.StatusCreated, config)
		})

		m.POST("/tokens/ensure-codex", func(c *gin.Context) {
			teamID := c.Param("team_id")
			if !requireTeamAdmin(c, teamID) {
				return
			}
			uid := c.GetString("user_id")
			config, err := services.EnsureCodexMCPConfig(database.DB, teamID, &uid)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"detail": err.Error()})
				return
			}
			c.JSON(http.StatusOK, config)
		})

		m.PATCH("/tokens/:token_id", func(c *gin.Context) {
			teamID := c.Param("team_id")
			if !requireTeamAdmin(c, teamID) {
				return
			}
			var req mcpStatusRequest
			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
				return
			}
			config, err := services.UpdateMCPConfigStatus(database.DB, teamID, c.Param("token_id"), req.Status)
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
				return
			}
			c.JSON(http.StatusOK, config)
		})

		m.POST("/tokens/:token_id/rotate", func(c *gin.Context) {
			teamID := c.Param("team_id")
			if !requireTeamAdmin(c, teamID) {
				return
			}
			config, err := services.RotateMCPConfigToken(database.DB, teamID, c.Param("token_id"))
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
				return
			}
			c.JSON(http.StatusOK, config)
		})

		m.POST("/active-team", func(c *gin.Context) {
			teamID := c.Param("team_id")
			if !requireTeamAdmin(c, teamID) {
				return
			}
			if err := services.SetActiveMCPTeamID(database.DB, teamID); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
				return
			}
			c.JSON(http.StatusOK, gin.H{"active_team_id": services.GetActiveMCPTeamID()})
		})

		m.DELETE("/active-team", func(c *gin.Context) {
			teamID := c.Param("team_id")
			if !requireTeamAdmin(c, teamID) {
				return
			}
			services.SetActiveMCPTeamID(database.DB, "")
			c.Status(http.StatusNoContent)
		})

		m.GET("/audit", func(c *gin.Context) {
			teamID := c.Param("team_id")
			if _, err := services.GetTeamForUser(database.DB, teamID, c.GetString("user_id")); err != nil {
				c.JSON(http.StatusNotFound, gin.H{"detail": "Team not found"})
				return
			}
			skip, _ := strconv.Atoi(c.DefaultQuery("skip", "0"))
			limit, _ := strconv.Atoi(c.DefaultQuery("limit", "100"))
			items, total, err := services.ListMCPAuditLogs(database.DB, teamID, skip, limit)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"detail": err.Error()})
				return
			}
			c.JSON(http.StatusOK, gin.H{"items": items, "total": total})
		})
	}
}

func RegisterAdminMCPRoutes(r *gin.RouterGroup) {
	m := r.Group("/admin/mcp-server")
	m.Use(middleware.RequireAdmin())
	{
		m.GET("", func(c *gin.Context) {
			cfg, err := services.GetGlobalMCPConfig(database.DB)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"detail": err.Error()})
				return
			}
			c.JSON(http.StatusOK, gin.H{
				"enabled":                  cfg.Enabled,
				"streamable_http_endpoint": "/mcp",
				"sse_endpoint":             "/mcp/sse",
				"message_endpoint":         "/mcp/message",
				"status":                   mcpServerStatus(cfg.Enabled),
				"tools":                    services.GlobalMCPTools(cfg),
				"rate_limit_per_minute":    cfg.RateLimitPerMinute,
			})
		})

		m.PATCH("", func(c *gin.Context) {
			var req globalMCPRequest
			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
				return
			}
			cfg, err := services.UpdateGlobalMCPConfig(database.DB, req.Enabled, req.Tools, req.RateLimitPerMinute)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"detail": err.Error()})
				return
			}
			c.JSON(http.StatusOK, gin.H{
				"enabled":                  cfg.Enabled,
				"streamable_http_endpoint": "/mcp",
				"sse_endpoint":             "/mcp/sse",
				"message_endpoint":         "/mcp/message",
				"status":                   mcpServerStatus(cfg.Enabled),
				"tools":                    services.GlobalMCPTools(cfg),
				"rate_limit_per_minute":    cfg.RateLimitPerMinute,
			})
		})
	}
}

func teamMCPOverview(teamID string) (*services.TeamMCPOverview, error) {
	setting, err := services.GetTeamMCPSetting(database.DB, teamID)
	if err != nil {
		return nil, err
	}
	global, err := services.GetGlobalMCPConfig(database.DB)
	if err != nil {
		return nil, err
	}

	if setting.Enabled && global.Enabled {
		_, _ = services.EnsureCodexMCPConfig(database.DB, teamID, nil)
	}
	configs, err := services.ListTeamMCPConfigs(database.DB, teamID)
	if err != nil {
		return nil, err
	}

	status := services.BuildMCPServiceStatus(global.Enabled, setting.Enabled, configs)
	return &services.TeamMCPOverview{
		StreamableHTTPEndpoint: "/mcp",
		Enabled:         setting.Enabled,
		GlobalEnabled:   global.Enabled,
		Status:          status,
		SSEEndpoint:     "/mcp/sse",
		MessageEndpoint: "/mcp/message",
		Tools:           services.GlobalMCPTools(global),
		Configs:         configs,
	}, nil
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
		Name:         req.Name,
		Purpose:      req.Purpose,
		ProjectScope: req.ProjectScope,
		ToolScope:    req.ToolScope,
		ExpiresAt:    expiresAt,
	}, nil
}

func mcpServerStatus(enabled bool) string {
	if enabled {
		return "running"
	}
	return "disabled"
}
