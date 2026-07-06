// Synkord MCP service
// 活跃契约集 + MCP 工具调用 + 审计日志
// 详见 docs/requirements.md §四.7

package services

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/synkord/core/models"
	"gorm.io/gorm"
)

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
				"match_type":     matchType,
			})
		}
	}
	return items, nil
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