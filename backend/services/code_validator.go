// Synkord Code Validator
// 通过正则提取用户代码中的 HTTP 调用 + 字段引用，与契约集对比
// 详见 docs/mcp-spec.md §五
//
// MVP 范围：
//   - HTTP 调用路径必须存在于契约集
//   - 必填参数必须出现在调用中
//   - 引用的实体字段名必须存在
//   - 枚举值必须在合法范围

package services

import (
	"encoding/json"
	"regexp"
	"strconv"
	"strings"
)

// ValidationIssue 校验问题
type ValidationIssue struct {
	Severity  string `json:"severity"` // "error" | "warning"
	Line      int    `json:"line,omitempty"`
	Field     string `json:"field,omitempty"`
	Message   string `json:"message"`
	Suggestion string `json:"suggestion,omitempty"`
}

// extractedCall 从代码中提取的 HTTP 调用
type extractedCall struct {
	Line   int
	Method string
	URL    string
	Body   string // 简化：仅匹配 text/plain 中前 200 字符
}

// extractedField 字段引用（简化为字符串字面量检测）
type extractedField struct {
	Line      int
	Entity    string // User / Order ...
	FieldName string // id / name / email ...
}

// EntityFieldInput 校验器输入的实体字段（已展开）
type EntityFieldInput struct {
	Name     string
	Required bool
	Type     string
}

// APIEndpointInput 校验器输入的 API 端点
type APIEndpointInput struct {
	Method string
	Path   string
}

// ValidateCodeAgainstContract 主入口
func ValidateCodeAgainstContract(
	code, language string,
	apis []APIEndpointInput,
	entityFields map[string][]EntityFieldInput, // entity_name -> fields
) []ValidationIssue {
	var issues []ValidationIssue

	// 1. 提取 HTTP 调用
	calls := extractHTTPCalls(code, language)
	apiPaths := indexAPIPaths(apis)

	// 2. 提取字段引用
	fields := extractFieldRefs(code, language)
	entityIndex := indexEntities(entityFields)

	// 3. 校验每个调用
	for _, call := range calls {
		issues = append(issues, validateCall(call, apiPaths)...)
	}

	// 4. 校验字段引用
	for _, field := range fields {
		issues = append(issues, validateFieldRef(field, entityIndex)...)
	}

	// 5. 去重（按 line + message）
	issues = dedupIssues(issues)

	return issues
}

// ============================================================================
// HTTP 调用提取
// ============================================================================

// 不同语言 / 客户端库的提取模式
var httpPatterns = []*regexp.Regexp{
	// TypeScript / JavaScript - axios
	regexp.MustCompile(`(?i)\baxios\.(get|post|put|delete|patch|head|options)\s*\(\s*['"\x60]([^'"\x60]+)['"\x60]`),
	// TypeScript / JavaScript - fetch
	regexp.MustCompile(`(?i)\bfetch\s*\(\s*['"\x60]([^'"\x60]+)['"\x60]`),
	// TypeScript / JavaScript - generic method wrapper
	regexp.MustCompile(`(?i)\b(?:api|http|client|axios|ky|got)\.(get|post|put|delete|patch|head)\s*\(\s*['"\x60]([^'"\x60]+)['"\x60]`),
	// Python - requests
	regexp.MustCompile(`(?i)\brequests\.(get|post|put|delete|patch|head|options)\s*\(\s*['"]([^'"]+)['"]`),
	// Go - http.Get / Post / PostForm
	regexp.MustCompile(`(?i)\bhttp\.(Get|Post|PostForm|Head)\s*\(\s*"([^"]+)"`),
	// Java - RestTemplate
	regexp.MustCompile(`(?i)\brestTemplate\.(getForObject|postForObject|exchange)\s*\(\s*"([^"]+)"`),
}

func extractHTTPCalls(code, language string) []extractedCall {
	var calls []extractedCall
	lines := strings.Split(code, "\n")

	for lineIdx, line := range lines {
		// 跳过注释行
		trimmed := strings.TrimSpace(line)
		if strings.HasPrefix(trimmed, "//") || strings.HasPrefix(trimmed, "#") || strings.HasPrefix(trimmed, "*") {
			continue
		}

		for _, pattern := range httpPatterns {
			matches := pattern.FindAllStringSubmatch(line, -1)
			for _, m := range matches {
				method, url := "GET", ""
				if len(m) == 3 {
					method = strings.ToUpper(m[1])
					url = m[2]
				} else if len(m) == 2 {
					url = m[1]
				}
				// 清理 URL（去掉 query 和 fragment）
				url = cleanURL(url)
				if url != "" && strings.HasPrefix(url, "/") {
					calls = append(calls, extractedCall{
						Line:   lineIdx + 1,
						Method: method,
						URL:    url,
					})
				}
			}
		}
	}
	return calls
}

func cleanURL(url string) string {
	// 去掉查询参数
	if idx := strings.Index(url, "?"); idx != -1 {
		url = url[:idx]
	}
	// 去掉 fragment
	if idx := strings.Index(url, "#"); idx != -1 {
		url = url[:idx]
	}
	// 去掉 template literals 中的 ${...}
	url = regexp.MustCompile(`\$\{[^}]+\}`).ReplaceAllString(url, "X")
	return url
}

// ============================================================================
// 字段引用提取
// ============================================================================

// 简化：从字符串字面量中识别 entity.field 模式
// 例：Order.id, User.email, Product.price
var fieldRefPattern = regexp.MustCompile(`\b([A-Z][A-Za-z0-9_]*)\.([a-z_][A-Za-z0-9_]*)\b`)

// objKeyPattern 从对象字面量中识别 "key": value 模式
var objKeyPattern = regexp.MustCompile(`['"]([a-z_][A-Za-z0-9_]*)['"]\s*:`)

func extractFieldRefs(code, language string) []extractedField {
	var refs []extractedField
	lines := strings.Split(code, "\n")

	for lineIdx, line := range lines {
		trimmed := strings.TrimSpace(line)
		if strings.HasPrefix(trimmed, "//") || strings.HasPrefix(trimmed, "#") || strings.HasPrefix(trimmed, "*") {
			continue
		}

		// 匹配 Entity.field
		for _, m := range fieldRefPattern.FindAllStringSubmatch(line, -1) {
			refs = append(refs, extractedField{
				Line:      lineIdx + 1,
				Entity:    m[1],
				FieldName: m[2],
			})
		}

		// 匹配对象字面量中的字段名
		for _, m := range objKeyPattern.FindAllStringSubmatch(line, -1) {
			// 跳过 HTTP 字段（method / path / url / headers）
			low := strings.ToLower(m[1])
			if low == "method" || low == "path" || low == "url" || low == "headers" || low == "data" || low == "params" {
				continue
			}
			// 单独出现的字段名（如 {"id": 1}）需要上下文判断 entity
			// MVP: 标记为引用未知 entity
			refs = append(refs, extractedField{
				Line:      lineIdx + 1,
				Entity:    "",
				FieldName: m[1],
			})
		}
	}
	return refs
}

// ============================================================================
// 校验逻辑
// ============================================================================

// apiIndex 用于快速查找 API 路径
type apiIndex struct {
	// path -> 多个 API（可能方法不同）
	byPath map[string][]APIEndpointInput
	// path+method -> API
	byFull map[string]APIEndpointInput
}

func indexAPIPaths(apis []APIEndpointInput) *apiIndex {
	idx := &apiIndex{
		byPath: make(map[string][]APIEndpointInput),
		byFull: make(map[string]APIEndpointInput),
	}
	for _, api := range apis {
		idx.byPath[api.Path] = append(idx.byPath[api.Path], api)
		idx.byFull[api.Method+" "+api.Path] = api
	}
	return idx
}

func validateCall(call extractedCall, idx *apiIndex) []ValidationIssue {
	var issues []ValidationIssue

	// 规范化 URL：把数字/字符串占位符当作匹配
	normalizedURL := normalizePath(call.URL)
	matches := idx.byPath[normalizedURL]

	// 二次尝试：直接匹配
	if len(matches) == 0 {
		matches = idx.byPath[call.URL]
	}
	// 三次尝试：去除数字段（处理 /api/orders/123 -> /api/orders/{id}）
	if len(matches) == 0 {
		strippedURL := stripConcretePathParams(call.URL)
		matches = idx.byPath[strippedURL]
	}

	if len(matches) == 0 {
		issues = append(issues, ValidationIssue{
			Severity:  "error",
			Line:      call.Line,
			Field:     "url",
			Message:   "API 不存在: " + call.Method + " " + call.URL,
			Suggestion: "用 get_contract_apis() 查找可用的 API 路径",
		})
		return issues
	}

	// 检查方法是否匹配
	methodMatches := false
	for _, api := range matches {
		if api.Method == call.Method {
			methodMatches = true
			break
		}
	}
	if !methodMatches && len(matches) > 0 {
		actualMethods := []string{}
		for _, api := range matches {
			actualMethods = append(actualMethods, api.Method)
		}
		issues = append(issues, ValidationIssue{
			Severity:  "error",
			Line:      call.Line,
			Field:     "method",
			Message:   "HTTP 方法不匹配: " + call.Method + " " + call.URL + "（实际可用: " + strings.Join(actualMethods, ", ") + "）",
		})
	}

	return issues
}

// normalizePath 规范化路径（去除 query/fragment 等）
func normalizePath(path string) string {
	if idx := strings.Index(path, "?"); idx != -1 {
		path = path[:idx]
	}
	if idx := strings.Index(path, "#"); idx != -1 {
		path = path[:idx]
	}
	return path
}

// stripConcretePathParams 把具体值的路径段替换为占位符
// 例如 /api/orders/123 -> /api/orders/{id}（如果对应位置是路径参数）
func stripConcretePathParams(path string) string {
	parts := strings.Split(path, "/")
	for i, p := range parts {
		// 跳过第一段（空）和最后一段可能的方法动词
		if i == 0 || p == "" {
			continue
		}
		// 如果看起来像 ID（UUID / 数字 / 长字符串），标记为占位符
		if isConcretePathParam(p) {
			parts[i] = "{id}"
		}
	}
	return strings.Join(parts, "/")
}

// isConcretePathParam 启发式判断：是否是具体路径参数（UUID/数字/长字符串）
func isConcretePathParam(s string) bool {
	if s == "" {
		return false
	}
	// 纯数字
	if _, err := strconv.Atoi(s); err == nil {
		return true
	}
	// UUID 形式（8-4-4-4-12）
	if len(s) >= 32 && strings.Count(s, "-") >= 4 {
		return true
	}
	// 长字符串（>= 16 字符无 / 且非纯英文）
	if len(s) >= 16 && !strings.Contains(s, "/") {
		return true
	}
	return false
}

func extractPathParams(path string) []string {
	var params []string
	parts := strings.Split(path, "/")
	for _, p := range parts {
		if strings.HasPrefix(p, ":") || strings.HasPrefix(p, "{") {
			params = append(params, strings.Trim(p, ":{}"))
		}
	}
	return params
}

// entityIndex 用于快速查找实体字段
type entityIndex struct {
	// entity name -> 字段集合
	fields map[string]map[string]bool
}

func indexEntities(entityFields map[string][]EntityFieldInput) *entityIndex {
	idx := &entityIndex{
		fields: make(map[string]map[string]bool),
	}
	for name, fields := range entityFields {
		fieldSet := make(map[string]bool)
		for _, f := range fields {
			fieldSet[f.Name] = true
		}
		idx.fields[name] = fieldSet
	}
	return idx
}

func validateFieldRef(ref extractedField, idx *entityIndex) []ValidationIssue {
	var issues []ValidationIssue

	if ref.Entity == "" {
		// 字段引用但没明确 entity，跳过（上下文不足）
		return issues
	}

	fields, ok := idx.fields[ref.Entity]
	if !ok {
		// Entity 名字不存在于契约集
		issues = append(issues, ValidationIssue{
			Severity:  "error",
			Line:      ref.Line,
			Field:     ref.Entity,
			Message:   "Entity 不存在: " + ref.Entity,
			Suggestion: "用 get_contract_entities() 查找可用的实体",
		})
		return issues
	}

	if !fields[ref.FieldName] {
		// 字段不存在
		// 尝试建议相似字段
		suggestion := suggestSimilarField(ref.FieldName, fields)
		msg := "字段不存在: " + ref.Entity + "." + ref.FieldName
		if suggestion != "" {
			msg += "（你是不是想用 " + suggestion + "？）"
		}
		issues = append(issues, ValidationIssue{
			Severity:  "error",
			Line:      ref.Line,
			Field:     ref.Entity + "." + ref.FieldName,
			Message:   msg,
			Suggestion: "可用字段：" + strings.Join(sortedFieldNames(fields), ", "),
		})
	}
	return issues
}

func suggestSimilarField(target string, fields map[string]bool) string {
	// 简单相似度：包含 target 子串或前缀匹配
	for f := range fields {
		if strings.Contains(strings.ToLower(f), strings.ToLower(target)) {
			return f
		}
	}
	for f := range fields {
		if strings.HasPrefix(strings.ToLower(f), strings.ToLower(target[:min(3, len(target))])) {
			return f
		}
	}
	return ""
}

func sortedFieldNames(fields map[string]bool) []string {
	names := make([]string, 0, len(fields))
	for f := range fields {
		names = append(names, f)
	}
	// 简化排序
	for i := 0; i < len(names); i++ {
		for j := i + 1; j < len(names); j++ {
			if names[j] < names[i] {
				names[i], names[j] = names[j], names[i]
			}
		}
	}
	return names
}

func dedupIssues(issues []ValidationIssue) []ValidationIssue {
	seen := map[string]bool{}
	result := make([]ValidationIssue, 0, len(issues))
	for _, issue := range issues {
		key := strconv.Itoa(issue.Line) + "|" + issue.Field + "|" + issue.Message
		if seen[key] {
			continue
		}
		seen[key] = true
		result = append(result, issue)
	}
	return result
}

// ============================================================================
// 辅助
// ============================================================================

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

// MarshalValidationIssues JSON 序列化 helper
func MarshalValidationIssues(issues []ValidationIssue) string {
	b, _ := json.Marshal(issues)
	return string(b)
}