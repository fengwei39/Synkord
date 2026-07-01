package api

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/synkord/core/database"
	"github.com/synkord/core/models"
	"github.com/synkord/core/services"
)

// MCP 接口：基于项目上下文，无需 Token 认证
// IDE/Codex 通过本地 MCP 服务访问，自动使用当前登录用户身份

type mcpQueryRequest struct {
	TeamID    string                 `json:"team_id"`
	ProjectID string                 `json:"project_id"`
	Tool      string                 `json:"tool"`
	Args      map[string]interface{} `json:"args"`
}

type mcpAuditInput struct {
	TeamID        string `json:"team_id"`
	ProjectID     string `json:"project_id"`
	ToolName      string `json:"tool_name"`
	Caller        string `json:"caller"`
	ParamsSummary string `json:"params_summary"`
	ResultStatus  string `json:"result_status"`
	ErrorMessage  string `json:"error_message"`
}

func RegisterProjectMCPRoutes(r *gin.RouterGroup) {
	m := r.Group("/teams/:team_id/projects/:project_id/mcp")
	{
		// 获取项目 MCP 概览
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

		// 获取调用记录（按当前用户过滤）
		m.GET("/audit", func(c *gin.Context) {
			if !requireProjectMember(c) {
				return
			}
			skip, _ := strconv.Atoi(c.DefaultQuery("skip", "0"))
			limit, _ := strconv.Atoi(c.DefaultQuery("limit", "100"))
			userID := c.GetString("user_id")
			items, total, err := services.ListMCPAuditLogs(database.DB, c.Param("team_id"), c.Param("project_id"), userID, skip, limit)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"detail": err.Error()})
				return
			}
			c.JSON(http.StatusOK, gin.H{"items": items, "total": total})
		})

		// IDE 接入说明
		m.GET("/onboarding", func(c *gin.Context) {
			if !requireProjectMember(c) {
				return
			}
			c.JSON(http.StatusOK, gin.H{
				"description": "将以下配置写入 IDE 的 MCP 配置文件。无需 Token，切换项目后自动跟随激活上下文。",
				"modes": gin.H{
					"stdio": gin.H{
						"description":    "适用于 Codex CLI、Claude CLI 等 stdio 模式客户端。",
						"example_command": "node local-mcp-service.cjs --mode stdio",
					},
					"http": gin.H{
						"description":    "适用于 VS Code、Cursor、JetBrains 等 IDE。需要 Electron 运行。",
						"example_command": "http://127.0.0.1:37991/mcp",
					},
				},
				"templates": gin.H{
					"cursor": gin.H{
						"path":  ".cursor/mcp.json",
						"value": cursorTemplate,
					},
					"vscode": gin.H{
						"path":  ".vscode/mcp.json",
						"value": vscodeTemplate,
					},
					"pycharm": gin.H{
						"path":  ".idea/mcp.json",
						"value": jetbrainsTemplate,
					},
					"codex_stdio": gin.H{
						"path":  ".codex/mcp.json",
						"value": codexStdioTemplate,
					},
				},
				"notes": []string{
					"IDE 端无需任何 Token 或认证。",
					"团队和项目由 ~/.synkord/active-context.json 决定。",
					"切换项目后无需修改配置。",
					"MCP 服务内部使用当前登录用户身份调用后端 API。",
				},
			})
		})
	}
}

// Local MCP 服务调用后端的接口
func RegisterLocalMCPRoutes(r *gin.RouterGroup) {
	m := r.Group("/mcp")
	{
		// MCP 查询：本地 MCP 服务以当前用户身份调用后端
		m.POST("/query", func(c *gin.Context) {
			var req mcpQueryRequest
			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
				return
			}

			// 权限验证：当前用户必须是项目成员
			userID := c.GetString("user_id")
			if _, err := services.GetTeamForUser(database.DB, req.TeamID, userID); err != nil {
				c.JSON(http.StatusForbidden, gin.H{"detail": "Not a team member"})
				return
			}

			result, status, errorMessage := services.ExecuteMCPQueryWithUser(database.DB, req.TeamID, req.ProjectID, userID, req.Tool, req.Args)
			_, _ = services.CreateMCPAuditLog(database.DB, services.MCPAuditInput{
				TeamID:        req.TeamID,
				ProjectID:     req.ProjectID,
				UserID:        userID,
				ToolName:      req.Tool,
				Caller:        c.GetString("caller"),
				ParamsSummary: summarizeMCPArgs(req.Args),
				ResultStatus:  status,
				ErrorMessage:  errorMessage,
			})
			if status == "error" {
				c.JSON(http.StatusBadRequest, gin.H{"detail": errorMessage})
				return
			}
			c.JSON(http.StatusOK, gin.H{"result": result})
		})

		// 客户端上报审计
		m.POST("/audit", func(c *gin.Context) {
			var req mcpAuditInput
			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
				return
			}
			userID := c.GetString("user_id")
			_, err := services.CreateMCPAuditLog(database.DB, services.MCPAuditInput{
				TeamID:        req.TeamID,
				ProjectID:     req.ProjectID,
				UserID:        userID,
				ToolName:      req.ToolName,
				Caller:        req.Caller,
				ParamsSummary: req.ParamsSummary,
				ResultStatus:  req.ResultStatus,
				ErrorMessage:  req.ErrorMessage,
			})
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
				return
			}
			c.JSON(http.StatusCreated, gin.H{"ok": true})
		})
	}
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

// IDE 接入配置模板（无需 Token）
const (
	cursorTemplate = `{
  "mcpServers": {
    "synkord": {
      "url": "http://127.0.0.1:37991/mcp"
    }
  }
}`

	vscodeTemplate = `{
  "servers": {
    "synkord": {
      "type": "http",
      "url": "http://127.0.0.1:37991/mcp"
    }
  }
}`

	jetbrainsTemplate = `{
  "mcpServers": {
    "synkord": {
      "url": "http://127.0.0.1:37991/mcp"
    }
  }
}`

	codexStdioTemplate = `{
  "mcpServers": {
    "synkord": {
      "command": "node",
      "args": ["${SYNKORD_HOME}/synkord/frontend/electron/local-mcp-service.cjs", "--mode", "stdio"]
    }
  }
}`
)
