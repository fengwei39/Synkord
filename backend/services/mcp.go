// Synkord MCP service
// 活跃契约集 + MCP 工具调用 + 审计日志
// 详见 docs/requirements.md §四.7

package services

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/synkord/core/database"
	"github.com/synkord/core/models"
	"gorm.io/gorm"
)

// ============================================================================
// MCP 进程运行时（端口 + 状态）单例
// 详见 docs/architecture.md §四
// ============================================================================

// getMCPPortFromEnv 解析 MCP 端口；与 Electron Connect 默认端口 37991 对齐
func getMCPPortFromEnv() int {
	if v := os.Getenv("SYNKORD_MCP_PORT"); v != "" {
		if p, err := strconv.Atoi(v); err == nil && p > 0 && p < 65536 {
			return p
		}
	}
	return 37991
}

// GetMCPPort 返回 MCP Connect 默认端口
func GetMCPPort() int { return getMCPPortFromEnv() }

// GetMCPRuntimeURL 返回当前 MCP HTTP 入口 URL（127.0.0.1）
func GetMCPRuntimeURL() string {
	return fmt.Sprintf("http://127.0.0.1:%d/mcp", getMCPPortFromEnv())
}

// MCPStateOrDefault 从 MCPStatus 单例表读 state；空时默认为 running
// （Electron 模式下 MCP 一直常驻）
func MCPStateOrDefault() string {
	var s models.MCPStatus
	if err := database.DB.First(&s).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return "running"
		}
		return "running"
	}
	if s.State == "" {
		return "running"
	}
	return s.State
}

// SetMCPState 设置 MCP 运行状态（持久化到 MCPStatus 单例表）
func SetMCPState(state string) error {
	var s models.MCPStatus
	err := database.DB.First(&s).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return database.DB.Create(&models.MCPStatus{State: state}).Error
	}
	if err != nil {
		return err
	}
	return database.DB.Model(&s).Updates(map[string]interface{}{
		"state": state,
		"url":   GetMCPRuntimeURL(),
		"port":  getMCPPortFromEnv(),
	}).Error
}

// ============================================================================
// 活跃契约集
// ============================================================================

// GetActiveContract 获取当前活跃契约集
func GetActiveContract(db *gorm.DB) (*models.ActiveContract, error) {
	var ac models.ActiveContract
	if err := db.First(&ac, "id = ?", "s").Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return &ac, nil
}

// SetActiveContract 设置活跃契约集（用户手动切换）
func SetActiveContract(db *gorm.DB, contractID, setBy string) (*models.ActiveContract, error) {
	c, err := GetContractByID(db, contractID)
	if err != nil {
		return nil, err
	}
	ac := &models.ActiveContract{
		ID:           "s",
		ContractID:   c.ID,
		ContractName: c.Name,
		SetBy:        setBy,
		SetAt:        time.Now(),
	}
	// upsert
	if err := db.Save(ac).Error; err != nil {
		return nil, err
	}
	return ac, nil
}

// ClearActiveContract 清空活跃契约集
func ClearActiveContract(db *gorm.DB) error {
	return db.Where("id = ?", "s").Delete(&models.ActiveContract{}).Error
}

// ============================================================================
// MCP 工具调用
// ============================================================================

// MCPToolExecutor 单个工具调用的结果
type MCPToolExecutor func(db *gorm.DB, contractID, userID string, args map[string]interface{}) (interface{}, error)

// MCPToolRegistry MCP 工具注册表
type MCPToolRegistry struct {
	tools map[string]MCPToolExecutor
}

var DefaultMCPToolRegistry = &MCPToolRegistry{
	tools: map[string]MCPToolExecutor{},
}

func init() {
	DefaultMCPToolRegistry.registerDefaults()
}

func (r *MCPToolRegistry) Register(name string, fn MCPToolExecutor) {
	r.tools[name] = fn
}

func (r *MCPToolRegistry) Execute(db *gorm.DB, name, contractID, userID string, args map[string]interface{}) (interface{}, error) {
	fn, ok := r.tools[name]
	if !ok {
		return nil, fmt.Errorf("unknown tool: %s", name)
	}
	return fn(db, contractID, userID, args)
}

func (r *MCPToolRegistry) List() []string {
	names := make([]string, 0, len(r.tools))
	for k := range r.tools {
		names = append(names, k)
	}
	return names
}

func (r *MCPToolRegistry) registerDefaults() {
	r.Register("get_contract_apis", toolGetContractAPIs)
	r.Register("get_contract_entities", toolGetContractEntities)
	r.Register("get_api_detail", toolGetAPIDetail)
	r.Register("get_entity_detail", toolGetEntityDetail)
	r.Register("get_api_dependencies", toolGetAPIDependencies)
	r.Register("get_entity_dependencies", toolGetEntityDependencies)
	r.Register("validate_code_against_contract", toolValidateCode)
	r.Register("list_contracts", toolListContracts)
	r.Register("find_contract", toolFindContract)
	r.Register("search_apis_across_contracts", toolSearchAPIsAcrossContracts)
	r.Register("search_entities_across_contracts", toolSearchEntitiesAcrossContracts)
}

// === 工具实现 ===

func toolGetContractAPIs(db *gorm.DB, contractID, userID string, args map[string]interface{}) (interface{}, error) {
	if contractID == "" {
		return nil, errors.New("NO_ACTIVE_CONTRACT")
	}
	keyword := stringArg(args, "keyword")
	method := stringArg(args, "method")
	tag := stringArg(args, "tag")
	includeDeprecated := boolArg(args, "include_deprecated")
	apis, _, err := ListContractAPIs(db, contractID, keyword, method, tag, includeDeprecated, 0, 200)
	if err != nil {
		return nil, err
	}
	return map[string]interface{}{
		"total": len(apis),
		"items": apis,
	}, nil
}

func toolGetContractEntities(db *gorm.DB, contractID, userID string, args map[string]interface{}) (interface{}, error) {
	if contractID == "" {
		return nil, errors.New("NO_ACTIVE_CONTRACT")
	}
	keyword := stringArg(args, "keyword")
	entities, _, err := ListContractEntities(db, contractID, keyword, 0, 200)
	if err != nil {
		return nil, err
	}
	return map[string]interface{}{
		"total": len(entities),
		"items": entities,
	}, nil
}

func toolGetAPIDetail(db *gorm.DB, contractID, userID string, args map[string]interface{}) (interface{}, error) {
	apiID := stringArg(args, "api_id")
	contractIDArg := stringArg(args, "contract_id")
	if contractIDArg != "" {
		contractID = contractIDArg
	}
	if contractID == "" {
		return nil, errors.New("NO_ACTIVE_CONTRACT")
	}
	if apiID == "" {
		return nil, errors.New("MISSING_PARAM: api_id")
	}
	return GetContractAPI(db, contractID, apiID)
}

func toolGetEntityDetail(db *gorm.DB, contractID, userID string, args map[string]interface{}) (interface{}, error) {
	entityID := stringArg(args, "entity_id")
	contractIDArg := stringArg(args, "contract_id")
	if contractIDArg != "" {
		contractID = contractIDArg
	}
	if contractID == "" {
		return nil, errors.New("NO_ACTIVE_CONTRACT")
	}
	if entityID == "" {
		return nil, errors.New("MISSING_PARAM: entity_id")
	}
	return GetContractEntity(db, contractID, entityID)
}

func toolGetAPIDependencies(db *gorm.DB, contractID, userID string, args map[string]interface{}) (interface{}, error) {
	apiID := stringArg(args, "api_id")
	contractIDArg := stringArg(args, "contract_id")
	if contractIDArg != "" {
		contractID = contractIDArg
	}
	if contractID == "" {
		return nil, errors.New("NO_ACTIVE_CONTRACT")
	}
	if apiID == "" {
		return nil, errors.New("MISSING_PARAM: api_id")
	}
	return GetAPIDependencies(db, contractID, apiID)
}

func toolGetEntityDependencies(db *gorm.DB, contractID, userID string, args map[string]interface{}) (interface{}, error) {
	entityID := stringArg(args, "entity_id")
	contractIDArg := stringArg(args, "contract_id")
	if contractIDArg != "" {
		contractID = contractIDArg
	}
	if contractID == "" {
		return nil, errors.New("NO_ACTIVE_CONTRACT")
	}
	if entityID == "" {
		return nil, errors.New("MISSING_PARAM: entity_id")
	}
	e, err := GetContractEntity(db, contractID, entityID)
	if err != nil {
		return nil, err
	}
	return GetEntityDependencies(db, contractID, e.Name)
}

func toolValidateCode(db *gorm.DB, contractID, userID string, args map[string]interface{}) (interface{}, error) {
	if contractID == "" {
		return nil, errors.New("NO_ACTIVE_CONTRACT")
	}

	code := stringArg(args, "code_snippet")
	language := stringArg(args, "language")
	if code == "" {
		return map[string]interface{}{
			"valid":  false,
			"issues": []ValidationIssue{{Severity: "error", Message: "code_snippet is required"}},
		}, nil
	}

	// 加载契约集的所有 API + Entity
	apiEndpoints, _, err := ListContractAPIs(db, contractID, "", "", "", true, 0, 500)
	if err != nil {
		return nil, err
	}
	entities, _, err := ListContractEntities(db, contractID, "", 0, 500)
	if err != nil {
		return nil, err
	}

	// 转换为验证器输入
	apis := make([]APIEndpointInput, 0, len(apiEndpoints))
	for _, api := range apiEndpoints {
		apis = append(apis, APIEndpointInput{
			Method: api.Method,
			Path:   api.Path,
		})
	}

	entityFields := make(map[string][]EntityFieldInput)
	for _, e := range entities {
		// 从 schema_content 解析出字段名（JSON Schema）
		fields := parseEntityFields(e.SchemaContent)
		entityFields[e.Name] = fields
	}

	issues := ValidateCodeAgainstContract(code, language, apis, entityFields)

	valid := true
	for _, issue := range issues {
		if issue.Severity == "error" {
			valid = false
			break
		}
	}
	return map[string]interface{}{
		"valid":  valid,
		"issues": issues,
	}, nil
}

// parseEntityFields 从 JSON Schema 提取字段名
func parseEntityFields(schemaContent string) []EntityFieldInput {
	var schema struct {
		Properties map[string]struct {
			Type     string `json:"type"`
			Required bool   `json:"-"`
		} `json:"properties"`
		Required []string `json:"required"`
	}
	if err := json.Unmarshal([]byte(schemaContent), &schema); err != nil {
		return nil
	}
	requiredSet := make(map[string]bool)
	for _, r := range schema.Required {
		requiredSet[r] = true
	}
	fields := make([]EntityFieldInput, 0, len(schema.Properties))
	for name, prop := range schema.Properties {
		fields = append(fields, EntityFieldInput{
			Name:     name,
			Type:     prop.Type,
			Required: requiredSet[name],
		})
	}
	return fields
}

func toolListContracts(db *gorm.DB, contractID, userID string, args map[string]interface{}) (interface{}, error) {
	keyword := stringArg(args, "keyword")
	contracts, err := ListUserContracts(db, userID)
	if err != nil {
		return nil, err
	}
	items := make([]models.ContractSet, 0, len(contracts))
	for _, c := range contracts {
		if keyword != "" && !strings.Contains(strings.ToLower(c.Name), strings.ToLower(keyword)) {
			continue
		}
		items = append(items, c)
	}
	return map[string]interface{}{
		"total": len(items),
		"items": items,
	}, nil
}

func toolFindContract(db *gorm.DB, contractID, userID string, args map[string]interface{}) (interface{}, error) {
	keyword := stringArg(args, "keyword")
	if keyword == "" {
		return nil, errors.New("MISSING_PARAM: keyword")
	}
	contracts, err := ListUserContracts(db, userID)
	if err != nil {
		return nil, err
	}
	kw := strings.ToLower(keyword)
	items := make([]map[string]string, 0)
	for _, c := range contracts {
		cl := strings.ToLower(c.Name)
		matchType := "contains"
		if cl == kw {
			matchType = "exact"
		} else if strings.HasPrefix(cl, kw) {
			matchType = "prefix"
		}
		if strings.Contains(cl, kw) {
			items = append(items, map[string]string{
				"contract_id":   c.ID,
				"contract_name": c.Name,
				"match_type":    matchType,
			})
		}
	}
	return items, nil
}

func toolSearchAPIsAcrossContracts(db *gorm.DB, contractID, userID string, args map[string]interface{}) (interface{}, error) {
	keyword := stringArg(args, "keyword")
	if keyword == "" {
		return nil, errors.New("MISSING_PARAM: keyword")
	}
	method := stringArg(args, "method")
	limit := intArg(args, "limit", 30)
	if limit <= 0 || limit > 100 {
		limit = 30
	}
	filterContractID := stringArg(args, "contract_id")
	contracts, err := ListUserContracts(db, userID)
	if err != nil {
		return nil, err
	}
	results := make([]map[string]interface{}, 0)
	for _, ct := range contracts {
		if filterContractID != "" && ct.ID != filterContractID {
			continue
		}
		apis, _, err := ListContractAPIs(db, ct.ID, keyword, method, "", true, 0, limit)
		if err != nil {
			return nil, err
		}
		for _, api := range apis {
			results = append(results, map[string]interface{}{
				"contract_id":   ct.ID,
				"contract_name": ct.Name,
				"api": map[string]interface{}{
					"api_id":  api.ID,
					"path":    api.Path,
					"method":  api.Method,
					"summary": api.Summary,
				},
			})
			if len(results) >= limit {
				return results, nil
			}
		}
	}
	return results, nil
}

func toolSearchEntitiesAcrossContracts(db *gorm.DB, contractID, userID string, args map[string]interface{}) (interface{}, error) {
	keyword := stringArg(args, "keyword")
	if keyword == "" {
		return nil, errors.New("MISSING_PARAM: keyword")
	}
	limit := intArg(args, "limit", 30)
	if limit <= 0 || limit > 100 {
		limit = 30
	}
	filterContractID := stringArg(args, "contract_id")
	contracts, err := ListUserContracts(db, userID)
	if err != nil {
		return nil, err
	}
	results := make([]map[string]interface{}, 0)
	for _, ct := range contracts {
		if filterContractID != "" && ct.ID != filterContractID {
			continue
		}
		entities, _, err := ListContractEntities(db, ct.ID, keyword, 0, limit)
		if err != nil {
			return nil, err
		}
		for _, entity := range entities {
			results = append(results, map[string]interface{}{
				"contract_id":   ct.ID,
				"contract_name": ct.Name,
				"entity": map[string]interface{}{
					"entity_id":   entity.ID,
					"name":        entity.Name,
					"description": entity.Description,
				},
			})
			if len(results) >= limit {
				return results, nil
			}
		}
	}
	return results, nil
}

// ============================================================================
// 审计日志
// ============================================================================

// MCPAuditInput 审计日志输入
type MCPAuditInput struct {
	ContractID    string                 `json:"contract_id"`
	UserID        string                 `json:"user_id"`
	ToolName      string                 `json:"tool_name"`
	Caller        string                 `json:"caller"`
	Args          map[string]interface{} `json:"args"`
	ParamsSummary string                 `json:"params_summary"`
	ResultStatus  string                 `json:"result_status"`
	Status        int                    `json:"status"`
	DurationMs    int                    `json:"duration_ms"`
	ErrorMessage  string                 `json:"error_message"`
}

// CreateMCPAuditLog 记录一次 MCP 工具调用
func CreateMCPAuditLog(db *gorm.DB, input MCPAuditInput) (*models.MCPAuditLog, error) {
	if input.UserID == "" {
		return nil, errors.New("user_id required")
	}
	argsJSON := ""
	if input.Args != nil {
		if b, err := json.Marshal(input.Args); err == nil {
			argsJSON = string(b)
		}
	}
	summary := summarizeMCPArgs(input.Args)
	if input.ResultStatus == "" {
		input.ResultStatus = "success"
	}
	log := &models.MCPAuditLog{
		ContractID:    input.ContractID,
		UserID:        input.UserID,
		ToolName:      input.ToolName,
		Caller:        input.Caller,
		ParamsSummary: summary,
		ArgsJSON:      argsJSON,
		ResultStatus:  input.ResultStatus,
		Status:        input.Status,
		DurationMs:    input.DurationMs,
		ErrorMessage:  input.ErrorMessage,
	}
	if err := db.Create(log).Error; err != nil {
		return nil, err
	}
	return log, nil
}

// ListMCPAuditLogs 列出访问日志
func ListMCPAuditLogs(db *gorm.DB, offset, limit int) ([]models.MCPAuditLog, int64, error) {
	if limit <= 0 || limit > 500 {
		limit = 100
	}
	var items []models.MCPAuditLog
	var total int64
	q := db.Model(&models.MCPAuditLog{})
	q.Count(&total)
	if err := q.Order("created_at DESC").Offset(offset).Limit(limit).Find(&items).Error; err != nil {
		return nil, 0, err
	}
	return items, total, nil
}

func summarizeMCPArgs(args map[string]interface{}) string {
	if len(args) == 0 {
		return "{}"
	}
	out := "{"
	count := 0
	for k := range args {
		if count > 0 {
			out += ", "
		}
		out += k
		count++
		if count >= 8 {
			out += ", ..."
			break
		}
	}
	out += "}"
	return out
}

// ============================================================================
// 工具函数
// ============================================================================

func stringArg(args map[string]interface{}, key string) string {
	if args == nil {
		return ""
	}
	v, ok := args[key]
	if !ok || v == nil {
		return ""
	}
	return strings.TrimSpace(fmt.Sprint(v))
}

func boolArg(args map[string]interface{}, key string) bool {
	if args == nil {
		return false
	}
	v, ok := args[key]
	if !ok || v == nil {
		return false
	}
	if b, ok := v.(bool); ok {
		return b
	}
	return false
}

func intArg(args map[string]interface{}, key string, fallback int) int {
	if args == nil {
		return fallback
	}
	v, ok := args[key]
	if !ok || v == nil {
		return fallback
	}
	switch n := v.(type) {
	case int:
		return n
	case float64:
		return int(n)
	case json.Number:
		if i, err := n.Int64(); err == nil {
			return int(i)
		}
	case string:
		if i, err := strconv.Atoi(strings.TrimSpace(n)); err == nil {
			return i
		}
	}
	return fallback
}

// ============================================================================
// 运行时摘要 + 访问日志统计（v1.2 评审 R-2 / R-3）
// 供前端 MCP 主页"状态卡 / 最近调用 sparkline + Top 工具"使用
// ============================================================================

// McpHealthSummary MCP 健康度摘要
// 字段命名与前端 types/contract.ts McpHealthSummary 一致
type McpHealthSummary struct {
	RecentErrors        int     `json:"recent_errors"`
	ConsecutiveFailures int     `json:"consecutive_failures"`
	Calls24h            int     `json:"calls_24h"`
	QPS24h              float64 `json:"qps_24h"`
	ErrorRate24h        float64 `json:"error_rate_24h"`
}

// McpRuntimeSummary MCP 运行时摘要（PID / 启动时间 / 重启次数 / 健康度）
type McpRuntimeSummary struct {
	PID           *int             `json:"pid"`
	StartedAt     *time.Time       `json:"started_at"`
	UptimeSeconds *int             `json:"uptime_seconds"`
	RestartCount  int              `json:"restart_count"`
	Health        McpHealthSummary `json:"health"`
}

// TopToolStat 工具调用次数统计项
type TopToolStat struct {
	ToolName string `json:"tool_name"`
	Count    int    `json:"count"`
}

// AccessLogStats 24h 访问日志统计
type AccessLogStats struct {
	Sparkline []int         `json:"sparkline"` // 长度 24；索引 0 = 当前小时
	ErrorRate float64       `json:"error_rate"`
	TopTools  []TopToolStat `json:"top_tools"`
}

// GetMCPHealthSummary 计算 MCP 健康度摘要
// 数据为空时返回零值结构体，不返回 error（前端不因空数据报错）
func GetMCPHealthSummary(db *gorm.DB) McpHealthSummary {
	summary := McpHealthSummary{}

	// 最近 100 条（按时间倒序）
	var recent []models.MCPAuditLog
	if err := db.Order("created_at DESC").Limit(100).Find(&recent).Error; err != nil {
		return summary
	}
	for _, log := range recent {
		if log.ResultStatus == "error" {
			summary.RecentErrors++
		}
	}
	// 连续失败（从最新往回数，遇到第一条成功即停）
	for _, log := range recent {
		if log.ResultStatus == "error" {
			summary.ConsecutiveFailures++
		} else {
			break
		}
	}

	// 24h 全量
	since24h := time.Now().Add(-24 * time.Hour)
	var dayLogs []models.MCPAuditLog
	if err := db.Where("created_at >= ?", since24h).Find(&dayLogs).Error; err != nil {
		return summary
	}
	summary.Calls24h = len(dayLogs)
	var errCount int
	for _, log := range dayLogs {
		if log.ResultStatus == "error" {
			errCount++
		}
	}
	if summary.Calls24h > 0 {
		summary.ErrorRate24h = float64(errCount) / float64(summary.Calls24h)
	}
	summary.QPS24h = float64(summary.Calls24h) / 86400.0
	return summary
}

// GetMCPRuntimeSummary 获取 MCP 运行时摘要
// 单例表为空时仍返回结构（health 仍可计算）
func GetMCPRuntimeSummary(db *gorm.DB) McpRuntimeSummary {
	summary := McpRuntimeSummary{
		Health: GetMCPHealthSummary(db),
	}
	var status models.MCPStatus
	if err := db.First(&status).Error; err != nil {
		return summary
	}
	summary.PID = status.PID
	summary.StartedAt = status.StartedAt
	summary.RestartCount = status.RestartCount
	if status.StartedAt != nil && status.State == "running" {
		secs := int(time.Since(*status.StartedAt).Seconds())
		if secs >= 0 {
			summary.UptimeSeconds = &secs
		}
	}
	return summary
}

// GetAccessLogStats 24h 访问日志统计
// sparkline 索引 0 = 当前小时（部分填充），索引 23 = 23 小时前
func GetAccessLogStats(db *gorm.DB) AccessLogStats {
	stats := AccessLogStats{
		Sparkline: make([]int, 24),
		TopTools:  []TopToolStat{},
	}

	since24h := time.Now().Add(-24 * time.Hour)
	var dayLogs []models.MCPAuditLog
	if err := db.Where("created_at >= ?", since24h).Find(&dayLogs).Error; err != nil {
		return stats
	}

	nowHour := time.Now().Truncate(time.Hour)
	toolCounts := map[string]int{}
	var errCount int
	for _, log := range dayLogs {
		bucketHour := log.CreatedAt.Truncate(time.Hour)
		idx := int(nowHour.Sub(bucketHour).Hours())
		if idx >= 0 && idx < 24 {
			stats.Sparkline[idx]++
		}
		toolCounts[log.ToolName]++
		if log.ResultStatus == "error" {
			errCount++
		}
	}
	if len(dayLogs) > 0 {
		stats.ErrorRate = float64(errCount) / float64(len(dayLogs))
	}

	// Top 5 工具（按调用次数倒序）
	type kv struct {
		Name  string
		Count int
	}
	var topK []kv
	for k, v := range toolCounts {
		topK = append(topK, kv{k, v})
	}
	sort.Slice(topK, func(i, j int) bool { return topK[i].Count > topK[j].Count })
	for i := 0; i < len(topK) && i < 5; i++ {
		stats.TopTools = append(stats.TopTools, TopToolStat{
			ToolName: topK[i].Name,
			Count:    topK[i].Count,
		})
	}
	return stats
}
