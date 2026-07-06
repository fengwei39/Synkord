// Synkord MCP API
// 活跃契约集 + 工具调用 + 访问日志
// 详见 docs/requirements.md §四.7

package api

import (
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/synkord/core/database"
	"github.com/synkord/core/services"
)

func RegisterMCPRoutes(r *gin.RouterGroup) {
	m := r.Group("/mcp")
	{
		m.GET("/status", getMCPStatus)
		m.POST("/start", startMCP)
		m.POST("/stop", stopMCP)
		m.POST("/restart", restartMCP)

		m.GET("/active-contract", getActiveContract)
		m.PUT("/active-contract", setActiveContract)

		m.GET("/ide-config", getIDEConfig)

		m.GET("/access-log", listAccessLog)
		m.POST("/query", executeMCPQuery)
	}
}

// getMCPStatus 返回 MCP 运行状态
// v1.2 修订：端口从环境变量 SYNKORD_MCP_PORT 读，默认 37991（与 Electron Connect 对齐）
// 状态字段由 MCPStatus 单例表承载（保留向后兼容 running 默认值）
func getMCPStatus(c *gin.Context) {
	url := services.GetMCPRuntimeURL()
	c.JSON(http.StatusOK, gin.H{
		"state":      services.MCPStateOrDefault(),
		"pid":        nil,
		"port":       services.GetMCPPort(),
		"url":        url,
		"started_at": time.Now().Format(time.RFC3339),
	})
}

// startMCP/stopMCP/restartMCP v1.2 修订：
// MCP 进程由 Electron 主进程管理；后端仅保存状态到 MCPStatus 单例表，
// 实时控制走 IPC。当前端在浏览器模式下访问，这些端点仅作状态同步。
func startMCP(c *gin.Context) {
	if err := services.SetMCPState("running"); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"detail": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"state": "running"})
}
func stopMCP(c *gin.Context) {
	if err := services.SetMCPState("stopped"); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"detail": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"state": "stopped"})
}
func restartMCP(c *gin.Context) {
	if err := services.SetMCPState("running"); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"detail": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"state": "running"})
}

func getActiveContract(c *gin.Context) {
	ac, err := services.GetActiveContract(database.DB)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"detail": err.Error()})
		return
	}
	if ac == nil {
		c.JSON(http.StatusOK, nil)
		return
	}
	c.JSON(http.StatusOK, ac)
}

func setActiveContract(c *gin.Context) {
	var req struct {
		ContractID string `json:"contract_id"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
		return
	}
	if req.ContractID == "" {
		// 清空
		if err := services.ClearActiveContract(database.DB); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"detail": err.Error()})
			return
		}
		c.JSON(http.StatusOK, nil)
		return
	}
	userID := c.GetString("user_id")
	ac, err := services.SetActiveContract(database.DB, req.ContractID, userID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
		return
	}
	c.JSON(http.StatusOK, ac)
}

// getIDEConfig 返回给 IDE 的连接配置
// v1.2 修订：HTTP URL 从环境变量推导（默认 37991，与 Electron Connect 对齐），
// STDIO 由本地命令 `synkord-mcp stdio` 触发。
func getIDEConfig(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"stdio": gin.H{
			"command": "synkord-mcp",
			"args":    []string{"stdio"},
		},
		"http": gin.H{
			"url":   services.GetMCPRuntimeURL(),
			"token": "synk_local_placeholder",
		},
	})
}

// listAccessLog 列出访问日志
func listAccessLog(c *gin.Context) {
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "100"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))
	items, total, err := services.ListMCPAuditLogs(database.DB, offset, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"detail": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": items, "total": total})
}

// executeMCPQuery 处理 MCP 工具调用（本地 Connect 进程调用）
func executeMCPQuery(c *gin.Context) {
	var req struct {
		ContractID string                 `json:"contract_id"`
		Tool       string                 `json:"tool" binding:"required"`
		Args       map[string]interface{} `json:"args"`
		Caller     string                 `json:"caller"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
		return
	}
	userID := c.GetString("user_id")
	// 如果没传 contract_id，使用活跃契约集
	contractID := req.ContractID
	if contractID == "" {
		ac, err := services.GetActiveContract(database.DB)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"detail": err.Error()})
			return
		}
		if ac == nil {
			recordAndRespond(c, userID, req.Tool, req.Args, req.Caller, 400, 0, "NO_ACTIVE_CONTRACT")
			return
		}
		contractID = ac.ContractID
	}

	// 校验权限
	if _, _, err := services.GetContractForUser(database.DB, contractID, userID); err != nil {
		recordAndRespond(c, userID, req.Tool, req.Args, req.Caller, 403, 0, "CONTRACT_ACCESS_DENIED")
		return
	}

	start := time.Now()
	result, err := services.DefaultMCPToolRegistry.Execute(database.DB, req.Tool, contractID, userID, req.Args)
	duration := int(time.Since(start).Milliseconds())
	if err != nil {
		recordAndRespond(c, userID, req.Tool, req.Args, req.Caller, 400, duration, err.Error())
		return
	}
	_, _ = services.CreateMCPAuditLog(database.DB, services.MCPAuditInput{
		ContractID:   contractID,
		UserID:       userID,
		ToolName:     req.Tool,
		Caller:       req.Caller,
		Args:         req.Args,
		ResultStatus: "success",
		Status:       200,
		DurationMs:   duration,
	})
	c.JSON(http.StatusOK, gin.H{"result": result})
}

func recordAndRespond(c *gin.Context, userID, tool string, args map[string]interface{}, caller string, status, duration int, errMsg string) {
	_, _ = services.CreateMCPAuditLog(database.DB, services.MCPAuditInput{
		UserID:       userID,
		ToolName:     tool,
		Caller:       caller,
		Args:         args,
		ResultStatus: "error",
		Status:       status,
		DurationMs:   duration,
		ErrorMessage: errMsg,
	})
	c.JSON(status, gin.H{"detail": errMsg})
}