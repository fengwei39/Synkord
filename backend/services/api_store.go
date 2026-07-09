// Synkord APIEndpoint service
// 接口定义 CRUD + OpenAPI / Postman 导入

package services

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/goccy/go-yaml"
	"github.com/synkord/core/models"
	"gorm.io/gorm"
)

// ImportOpenAPIResult 导入结果
type ImportOpenAPIResult struct {
	ContractID  string               `json:"contract_id"`
	SpecID      string               `json:"spec_id"`
	SpecName    string               `json:"spec_name"`
	SpecVersion string               `json:"spec_version"`
	APICount    int                  `json:"api_count"`
	RefCount    int                  `json:"ref_count"`
	DepCount    int                  `json:"dependency_count"`
	APIs        []models.APIEndpoint `json:"apis"`
}

func ErrUnsupportedAPIImportFormat(format string) error {
	return fmt.Errorf("unsupported API import format: %s", format)
}

// ListContractAPIs 列出契约集下的接口（支持 keyword / method / tag / include_deprecated）
func ListContractAPIs(db *gorm.DB, contractID, keyword, method, tag string, includeDeprecated bool, offset, limit int) ([]models.APIEndpoint, int64, error) {
	if limit <= 0 || limit > 500 {
		limit = 200
	}
	q := db.Model(&models.APIEndpoint{}).Where("contract_id = ?", contractID)
	if keyword != "" {
		like := "%" + keyword + "%"
		q = q.Where("path LIKE ? OR summary LIKE ? OR tags LIKE ?", like, like, like)
	}
	if method != "" {
		q = q.Where("method = ?", strings.ToUpper(method))
	}
	if tag != "" {
		q = q.Where("tags LIKE ?", "%\""+tag+"\"%")
	}
	if !includeDeprecated {
		q = q.Where("deprecated = ?", false)
	}
	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var apis []models.APIEndpoint
	if err := q.Order("path, method").Offset(offset).Limit(limit).Find(&apis).Error; err != nil {
		return nil, 0, err
	}
	return apis, total, nil
}

// GetContractAPI 获取单个接口
func GetContractAPI(db *gorm.DB, contractID, apiID string) (*models.APIEndpoint, error) {
	var a models.APIEndpoint
	if err := db.Where("id = ? AND contract_id = ?", apiID, contractID).First(&a).Error; err != nil {
		return nil, err
	}
	return &a, nil
}

// CreateContractAPI 创建接口
func CreateContractAPI(db *gorm.DB, contractID string, api *models.APIEndpoint) (*models.APIEndpoint, error) {
	api.ContractID = contractID
	if err := db.Create(api).Error; err != nil {
		return nil, err
	}
	return api, nil
}

// CreateContractAPIFromInput 从前端入参创建接口（处理 tags / parameters / requestBody 等 JSON 字段）
func CreateContractAPIFromInput(db *gorm.DB, contractID string, input any) (*models.APIEndpoint, error) {
	type apiInput struct {
		Path        string           `json:"path"`
		Method      string           `json:"method"`
		Summary     string           `json:"summary"`
		Description string           `json:"description"`
		Tags        []string         `json:"tags"`
		Parameters  []map[string]any `json:"parameters"`
		RequestBody map[string]any   `json:"request_body"`
		Responses   map[string]any   `json:"responses"`
		Deprecated  bool             `json:"deprecated"`
	}
	var in apiInput
	b, err := json.Marshal(input)
	if err != nil {
		return nil, err
	}
	if err := json.Unmarshal(b, &in); err != nil {
		return nil, err
	}
	if in.Path == "" || in.Method == "" {
		return nil, errors.New("path and method are required")
	}
	tagsJSON, _ := json.Marshal(in.Tags)
	paramsJSON, _ := json.Marshal(in.Parameters)
	bodyJSON, _ := json.Marshal(in.RequestBody)
	respJSON, _ := json.Marshal(in.Responses)

	api := &models.APIEndpoint{
		ContractID:      contractID,
		Path:            in.Path,
		Method:          strings.ToUpper(in.Method),
		Tags:            string(tagsJSON),
		Summary:         in.Summary,
		Description:     in.Description,
		ParametersJSON:  string(paramsJSON),
		RequestBodyJSON: string(bodyJSON),
		ResponsesJSON:   string(respJSON),
		Deprecated:      in.Deprecated,
	}
	return CreateContractAPI(db, contractID, api)
}

// UpdateContractAPI 更新接口
// v1.2 修订：仅允许白名单字段，避免通过 patch 篡改 contract_id 等关键外键
func UpdateContractAPI(db *gorm.DB, contractID, apiID string, patch map[string]interface{}) (*models.APIEndpoint, error) {
	allowed := map[string]bool{
		"path":              true,
		"method":            true,
		"summary":           true,
		"description":       true,
		"tags":              true,
		"parameters":        true,
		"request_body":      true,
		"responses":         true,
		"parameters_json":   true,
		"request_body_json": true,
		"responses_json":    true,
		"security_json":     true,
		"deprecated":        true,
		"version":           true,
	}
	safe := map[string]interface{}{}
	for k, v := range patch {
		if allowed[k] {
			safe[k] = v
		}
	}
	if len(safe) == 0 {
		// 无有效字段：返回当前对象（幂等）
		return GetContractAPI(db, contractID, apiID)
	}
	if v, ok := safe["method"].(string); ok {
		safe["method"] = strings.ToUpper(v)
	}
	if v, ok := safe["tags"]; ok {
		b, _ := json.Marshal(v)
		safe["tags"] = string(b)
	}
	if v, ok := safe["parameters"]; ok {
		b, _ := json.Marshal(v)
		safe["parameters_json"] = string(b)
		delete(safe, "parameters")
	}
	if v, ok := safe["request_body"]; ok {
		b, _ := json.Marshal(v)
		safe["request_body_json"] = string(b)
		delete(safe, "request_body")
	}
	if v, ok := safe["responses"]; ok {
		b, _ := json.Marshal(v)
		safe["responses_json"] = string(b)
		delete(safe, "responses")
	}
	if err := db.Model(&models.APIEndpoint{}).
		Where("id = ? AND contract_id = ?", apiID, contractID).
		Updates(safe).Error; err != nil {
		return nil, err
	}
	return GetContractAPI(db, contractID, apiID)
}

// DeleteContractAPI 删除接口
func DeleteContractAPI(db *gorm.DB, contractID, apiID string) error {
	return db.Where("id = ? AND contract_id = ?", apiID, contractID).Delete(&models.APIEndpoint{}).Error
}

// GetAPIDependencies 获取 API 的依赖关系
func GetAPIDependencies(db *gorm.DB, contractID, apiID string) (map[string]interface{}, error) {
	api, err := GetContractAPI(db, contractID, apiID)
	if err != nil {
		return nil, err
	}
	// 找出该 API 引用的实体（api_entity）
	var deps []models.Dependency
	if err := db.Where("contract_id = ? AND api_path = ? AND api_method = ?", contractID, api.Path, api.Method).Find(&deps).Error; err != nil {
		return nil, err
	}
	usesEntities := make([]map[string]string, 0, len(deps))
	for _, d := range deps {
		usesEntities = append(usesEntities, map[string]string{
			"entity_id":   "",
			"entity_name": d.EntityName,
			"usage":       d.DependencyType,
		})
	}
	// 找出引用该 API 的其他 API（同 contract）
	var usedBy []models.APIEndpoint
	if err := db.Where("contract_id = ? AND id != ?", contractID, apiID).Find(&usedBy).Error; err != nil {
		return nil, err
	}
	usedByApis := make([]map[string]string, 0, len(usedBy))
	for _, u := range usedBy {
		usedByApis = append(usedByApis, map[string]string{
			"api_id": u.ID,
			"path":   u.Path,
			"method": u.Method,
		})
	}
	return map[string]interface{}{
		"uses_entities": usesEntities,
		"used_by_apis":  usedByApis,
	}, nil
}

// ImportOpenAPISpec 解析 OpenAPI/Swagger 文本并存入数据库
func ImportOpenAPISpec(db *gorm.DB, contractID, spec string) (*ImportOpenAPIResult, error) {
	var doc map[string]interface{}
	if err := json.Unmarshal([]byte(spec), &doc); err != nil {
		if yamlErr := yaml.Unmarshal([]byte(spec), &doc); yamlErr != nil {
			return nil, fmt.Errorf("openapi parse failed: json=%v; yaml=%v", err, yamlErr)
		}
	}

	paths, ok := doc["paths"].(map[string]interface{})
	if !ok {
		return nil, fmt.Errorf("openapi paths is missing or invalid")
	}

	oasVersion := ""
	infoVersion := ""
	if info, ok := doc["info"].(map[string]interface{}); ok {
		infoVersion = stringValue(info["version"])
	}
	if v, ok := doc["openapi"].(string); ok {
		oasVersion = v
	}
	specName := specNameFromOpenAPI(doc)
	if specName == "" {
		specName = "default"
	}

	var c models.ContractSet
	if err := db.First(&c, "id = ?", contractID).Error; err != nil {
		return nil, fmt.Errorf("contract not found: %w", err)
	}

	tx := db.Begin()
	if tx.Error != nil {
		return nil, tx.Error
	}
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	specVersion, err := nextSpecVersion(tx, contractID, specName, infoVersion)
	if err != nil {
		tx.Rollback()
		return nil, err
	}

	swaggerSpec := &models.SwaggerSpec{
		ContractID:     contractID,
		Name:           specName,
		Version:        specVersion,
		Source:         models.SpecSourceOpenAPI,
		SpecContent:    spec,
		OpenAPIVersion: oasVersion,
	}
	if err := tx.Create(swaggerSpec).Error; err != nil {
		tx.Rollback()
		return nil, err
	}

	if err := tx.Where("contract_id = ?", contractID).Delete(&models.APIEndpoint{}).Error; err != nil {
		tx.Rollback()
		return nil, err
	}
	if err := tx.Where("contract_id = ? AND source = ?", contractID, "openapi").Delete(&models.Dependency{}).Error; err != nil {
		tx.Rollback()
		return nil, err
	}

	apis := make([]models.APIEndpoint, 0)
	refSeen := make(map[string]bool)
	depSeen := make(map[string]bool)
	depCount := 0
	methods := map[string]bool{
		"get": true, "post": true, "put": true, "patch": true,
		"delete": true, "head": true, "options": true, "trace": true,
	}

	for path, rawPathItem := range paths {
		pathItem, ok := rawPathItem.(map[string]interface{})
		if !ok {
			continue
		}
		for method, rawOperation := range pathItem {
			methodLower := strings.ToLower(method)
			if !methods[methodLower] {
				continue
			}
			op, ok := rawOperation.(map[string]interface{})
			if !ok {
				continue
			}
			tagsJSON, _ := json.Marshal(op["tags"])
			endpoint := models.APIEndpoint{
				ContractID:      contractID,
				SpecID:          swaggerSpec.ID,
				Path:            path,
				Method:          strings.ToUpper(methodLower),
				Tags:            string(tagsJSON),
				Summary:         stringValue(op["summary"]),
				Description:     stringValue(op["description"]),
				ParametersJSON:  mustJSON(op["parameters"]),
				RequestBodyJSON: mustJSON(op["requestBody"]),
				ResponsesJSON:   mustJSON(op["responses"]),
				SecurityJSON:    mustJSON(op["security"]),
				Deprecated:      boolValue(op["deprecated"]),
				Version:         specVersion,
			}
			if err := tx.Create(&endpoint).Error; err != nil {
				tx.Rollback()
				return nil, err
			}
			apis = append(apis, endpoint)
			refs := make(map[string]bool)
			collectRefs(op, refs)
			for ref := range refs {
				refSeen[ref] = true
				entityName := refEntityName(ref)
				if entityName == "" {
					continue
				}
				key := strings.Join([]string{endpoint.Path, endpoint.Method, entityName}, "|")
				if depSeen[key] {
					continue
				}
				depSeen[key] = true
				dep := models.Dependency{
					ContractID:     contractID,
					EntityName:     entityName,
					APIPath:        endpoint.Path,
					APIMethod:      endpoint.Method,
					DependencyType: "api_entity",
					Source:         "openapi",
				}
				if err := tx.Create(&dep).Error; err != nil {
					tx.Rollback()
					return nil, err
				}
				depCount++
			}
		}
	}

	if err := tx.Model(swaggerSpec).Update("api_count", len(apis)).Error; err != nil {
		tx.Rollback()
		return nil, err
	}

	if err := tx.Commit().Error; err != nil {
		return nil, err
	}

	return &ImportOpenAPIResult{
		ContractID:  contractID,
		SpecID:      swaggerSpec.ID,
		SpecName:    swaggerSpec.Name,
		SpecVersion: specVersion,
		APICount:    len(apis),
		RefCount:    len(refSeen),
		DepCount:    depCount,
		APIs:        apis,
	}, nil
}

// ============================================================================
// 工具方法（OpenAPI 解析共用）
// ============================================================================

func stringValue(v interface{}) string {
	if s, ok := v.(string); ok {
		return s
	}
	return ""
}

func boolValue(v interface{}) bool {
	if b, ok := v.(bool); ok {
		return b
	}
	return false
}

func mustJSON(v interface{}) string {
	if v == nil {
		return ""
	}
	data, _ := json.Marshal(v)
	return string(data)
}

func collectRefs(v interface{}, seen map[string]bool) {
	switch t := v.(type) {
	case map[string]interface{}:
		for k, val := range t {
			if k == "$ref" {
				if s, ok := val.(string); ok {
					seen[s] = true
				}
			}
			collectRefs(val, seen)
		}
	case []interface{}:
		for _, item := range t {
			collectRefs(item, seen)
		}
	}
}

func refEntityName(ref string) string {
	if ref == "" {
		return ""
	}
	parts := strings.Split(ref, "/")
	if len(parts) == 0 {
		return ""
	}
	name := parts[len(parts)-1]
	if name == "" || strings.Contains(name, "#") {
		return ""
	}
	return name
}

func specNameFromOpenAPI(doc map[string]interface{}) string {
	info, ok := doc["info"].(map[string]interface{})
	if !ok {
		return ""
	}
	return strings.TrimSpace(stringValue(info["title"]))
}

func nextSpecVersion(tx *gorm.DB, contractID, name, hint string) (string, error) {
	if hint = strings.TrimSpace(hint); hint != "" {
		return hint, nil
	}
	var last models.SwaggerSpec
	err := tx.Where("contract_id = ? AND name = ?", contractID, name).
		Order("created_at DESC").
		First(&last).Error
	if err != nil && err != gorm.ErrRecordNotFound {
		return "", err
	}
	if err == gorm.ErrRecordNotFound {
		return "1.0.0", nil
	}
	return bumpPatchVersion(last.Version, "1.0.0")
}

func bumpPatchVersion(current, seed string) (string, error) {
	cur := strings.TrimSpace(current)
	if cur == "" {
		return seed, nil
	}
	parts := strings.Split(cur, ".")
	if len(parts) != 3 {
		return seed, nil
	}
	var major, minor, patch int
	if _, err := fmt.Sscanf(parts[0], "%d", &major); err != nil {
		return seed, nil
	}
	if _, err := fmt.Sscanf(parts[1], "%d", &minor); err != nil {
		return seed, nil
	}
	if _, err := fmt.Sscanf(parts[2], "%d", &patch); err != nil {
		return seed, nil
	}
	patch++
	return fmt.Sprintf("%d.%d.%d", major, minor, patch), nil
}
