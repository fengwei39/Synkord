// Synkord MCP API
// 活跃契约集 + 工具调用 + 访问日志
// 详见 docs/requirements.md §四.7

package api

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/synkord/core/database"
	"github.com/synkord/core/models"
	"github.com/synkord/core/services"
)

func RegisterMCPRoutes(r *gin.RouterGroup) {
	m := r.Group("/mcp")
	{
		m.GET("/status", getMCPStatus)
		m.POST("/start", startMCP)
		m.POST("/stop", stopMCP)
		m.POST("/restart", restartMCP)
		// 修复冲突 #4：Electron 主进程用此端点上报真实 pid/port/state
		m.POST("/state", reportMCPState)

		// 评审 R-2：运行时摘要（PID / 启动时间 / 重启次数 / 健康度）
		m.GET("/summary", getMCPRuntimeSummary)

		m.GET("/active-contract", getActiveContract)
		m.PUT("/active-contract", setActiveContract)

		m.GET("/ide-config", getIDEConfig)

		m.GET("/access-log", listAccessLog)
		// 评审 R-3：24h 时序统计（sparkline / 错误率 / Top 工具）
		m.GET("/access-log/stats", getAccessLogStats)
		m.POST("/query", executeMCPQuery)
	}
}

// getMCPStatus 返回 MCP 运行状态
// 修复冲突 #4：pid/port/started_at 全部从 MCPStatus 单例表读真实值
func getMCPStatus(c *gin.Context) {
	c.JSON(http.StatusOK, mcpStatusPayload())
}

func mcpStatusPayload() gin.H {
	// 从单例表读真实状态
	var s models.MCPStatus
	_ = database.DB.First(&s).Error
	payload := gin.H{
		"state":      services.MCPStateOrDefault(),
		"pid":        s.PID,
		"port":       s.Port,
		"url":        services.GetMCPRuntimeURL(),
		"started_at": s.StartedAt,
	}
	if s.LastError != "" {
		payload["last_error"] = gin.H{
			"message": s.LastError,
			"at":      s.StartedAt,
		}
	}
	return payload
}

// startMCP/stopMCP/restartMCP v1.2 修订：
// MCP 进程由 Electron 主进程管理；这些端点仅用于浏览器模式状态同步。
// 真实 pid/port 写入由 Electron 调用 POST /mcp/state 完成。
func startMCP(c *gin.Context) {
	now := time.Now()
	port := services.GetMCPPort()
	if err := services.SetMCPState("running", nil, &port, &now, ""); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"detail": err.Error()})
		return
	}
	c.JSON(http.StatusOK, mcpStatusPayload())
}
func stopMCP(c *gin.Context) {
	if err := services.SetMCPState("stopped", nil, nil, nil, ""); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"detail": err.Error()})
		return
	}
	c.JSON(http.StatusOK, mcpStatusPayload())
}
func restartMCP(c *gin.Context) {
	now := time.Now()
	port := services.GetMCPPort()
	if err := services.SetMCPState("running", nil, &port, &now, ""); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"detail": err.Error()})
		return
	}
	c.JSON(http.StatusOK, mcpStatusPayload())
}

// reportMCPState Electron 主进程上报真实 MCP 进程状态
// 修复冲突 #4：补齐 pid/port/state 同步通道
// 允许的 state 值：stopped | running
func reportMCPState(c *gin.Context) {
	var req struct {
		State     string `json:"state"`
		PID       *int   `json:"pid"`
		Port      *int   `json:"port"`
		LastError string `json:"last_error"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
		return
	}
	// 修复冲突 #15：收紧 state 合法值集合
	if req.State != "stopped" && req.State != "running" {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "state must be 'stopped' or 'running'"})
		return
	}
	var startedAt *time.Time
	if req.State == "running" {
		now := time.Now()
		startedAt = &now
	}
	if err := services.SetMCPState(req.State, req.PID, req.Port, startedAt, req.LastError); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"detail": err.Error()})
		return
	}
	c.JSON(http.StatusOK, mcpStatusPayload())
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
// 修复冲突 #3：HTTP 配置仅在 MCP 实际启动（state=running）时返回；
// token 字段若本地 connect-token.json 未生成则缺省（前端按需提示用户）。
func getIDEConfig(c *gin.Context) {
	payload := gin.H{
		"stdio": gin.H{
			"command": "synkord-mcp",
			"args":    []string{"stdio"},
		},
	}
	if services.MCPStateOrDefault() == "running" {
		payload["http"] = gin.H{
			"url": services.GetMCPRuntimeURL(),
			// token 不再硬编码占位；前端通过 mcp:ide-config IPC 拿真实本地 Bearer
			"token": "",
		}
	}
	c.JSON(http.StatusOK, payload)
}

// listAccessLog 列出访问日志
// 修复冲突 #12：实现 start/end/level/keyword 4 个过滤参数
func listAccessLog(c *gin.Context) {
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "100"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))
	start := c.Query("start")             // RFC3339 时间
	end := c.Query("end")                 // RFC3339 时间
	level := c.Query("level")             // success | error | all
	keyword := c.Query("keyword")         // 工具名/错误消息模糊匹配
	items, total, err := services.ListMCPAuditLogs(database.DB, offset, limit, start, end, level, keyword)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"detail": err.Error()})
		return
	}
	out := make([]gin.H, 0, len(items))
	for _, item := range items {
		args := map[string]interface{}{}
		if item.ArgsJSON != "" {
			_ = json.Unmarshal([]byte(item.ArgsJSON), &args)
		}
		// 修复冲突 #5：client 字段单独维护（人类可读别名），与 caller 区分
		// 当前实现：caller = 原始值（IDE 标识符），client = 同 caller
		// （如未来 IDE 别名表上线，可在此处查表填充）
		out = append(out, gin.H{
			"id":             item.ID,
			"contract_id":    item.ContractID,
			"user_id":        item.UserID,
			"tool_name":      item.ToolName,
			"caller":         item.Caller,
			"client":         item.Caller,
			"params_summary": item.ParamsSummary,
			"args":           args,
			"args_json":      item.ArgsJSON,
			"result_status":  item.ResultStatus,
			"status":         item.Status,
			"duration_ms":    item.DurationMs,
			"error_message":  item.ErrorMessage,
			"created_at":     item.CreatedAt,
			"timestamp":      item.CreatedAt,
		})
	}
	c.JSON(http.StatusOK, gin.H{"items": out, "total": total})
}

// getMCPRuntimeSummary 返回 MCP 运行时完整摘要
// 评审 R-2：让"状态卡"展示 PID / 启动时间 / 重启次数，避免"加载中…"占位
func getMCPRuntimeSummary(c *gin.Context) {
	c.JSON(http.StatusOK, services.GetMCPRuntimeSummary(database.DB))
}

// getAccessLogStats 返回 24h 访问日志统计
// 评审 R-3：sparkline + 错误率 + Top 工具，供 MCP 主页 sparkline 区使用
func getAccessLogStats(c *gin.Context) {
	c.JSON(http.StatusOK, services.GetAccessLogStats(database.DB))
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
