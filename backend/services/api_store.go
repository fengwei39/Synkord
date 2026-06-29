package services

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/goccy/go-yaml"
	"github.com/synkord/core/models"
	"gorm.io/gorm"
)

type ImportOpenAPIResult struct {
	ProjectID   string               `json:"project_id"`
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

type postmanCollection struct {
	Info postmanInfo   `json:"info"`
	Item []postmanItem `json:"item"`
}

type postmanInfo struct {
	Name string `json:"name"`
}

type postmanItem struct {
	Name    string          `json:"name"`
	Item    []postmanItem   `json:"item"`
	Request *postmanRequest `json:"request"`
}

type postmanRequest struct {
	Method      string           `json:"method"`
	Header      interface{}      `json:"header"`
	Body        interface{}      `json:"body"`
	URL         postmanURL       `json:"url"`
	Description postmanTextOrRaw `json:"description"`
}

type postmanURL struct {
	Raw  string        `json:"raw"`
	Path []interface{} `json:"path"`
}

type postmanTextOrRaw struct {
	Raw string `json:"raw"`
}

func ImportOpenAPISpec(db *gorm.DB, projectID, spec string) (*ImportOpenAPIResult, error) {
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

	var project models.Project
	if err := db.First(&project, "id = ?", projectID).Error; err != nil {
		return nil, fmt.Errorf("project not found: %w", err)
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

	specVersion, err := nextSpecVersion(tx, projectID, specName, infoVersion)
	if err != nil {
		tx.Rollback()
		return nil, err
	}

	swaggerSpec := &models.SwaggerSpec{
		TeamID:         project.TeamID,
		ProjectID:      projectID,
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

	if err := tx.Where("project_id = ?", projectID).Delete(&models.APIEndpoint{}).Error; err != nil {
		tx.Rollback()
		return nil, err
	}
	if err := tx.Where("source_project_id = ? AND source = ?", projectID, "openapi").Delete(&models.Dependency{}).Error; err != nil {
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
			endpoint := models.APIEndpoint{
				ProjectID:       projectID,
				SpecID:          swaggerSpec.ID,
				Path:            path,
				Method:          strings.ToUpper(methodLower),
				Tag:             firstTag(op["tags"]),
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
					SourceProjectID: projectID,
					TargetProjectID: projectID,
					EntityName:      entityName,
					APIPath:         endpoint.Path,
					APIMethod:       endpoint.Method,
					DependencyType:  "api_entity",
					Source:          "openapi",
				}
				if err := tx.Create(&dep).Error; err != nil {
					tx.Rollback()
					return nil, err
				}
				depCount++
			}
		}
	}

	if err := tx.Model(&swaggerSpec).Update("api_count", len(apis)).Error; err != nil {
		tx.Rollback()
		return nil, err
	}

	if err := tx.Model(&models.Project{}).Where("id = ?", projectID).Updates(map[string]interface{}{
		"open_api_spec":    spec,
		"open_api_version": oasVersion,
	}).Error; err != nil {
		tx.Rollback()
		return nil, err
	}

	if err := tx.Commit().Error; err != nil {
		return nil, err
	}

	return &ImportOpenAPIResult{
		ProjectID:   projectID,
		SpecID:      swaggerSpec.ID,
		SpecName:    swaggerSpec.Name,
		SpecVersion: specVersion,
		APICount:    len(apis),
		RefCount:    len(refSeen),
		DepCount:    depCount,
		APIs:        apis,
	}, nil
}

func ImportPostmanCollection(db *gorm.DB, projectID, collectionJSON string) (*ImportOpenAPIResult, error) {
	var collection postmanCollection
	if err := json.Unmarshal([]byte(collectionJSON), &collection); err != nil {
		return nil, fmt.Errorf("postman collection parse failed: %w", err)
	}
	if len(collection.Item) == 0 {
		return nil, fmt.Errorf("postman collection item is missing or empty")
	}

	specName := strings.TrimSpace(collection.Info.Name)
	if specName == "" {
		specName = "default"
	}

	var project models.Project
	if err := db.First(&project, "id = ?", projectID).Error; err != nil {
		return nil, fmt.Errorf("project not found: %w", err)
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

	specVersion, err := nextSpecVersion(tx, projectID, specName, "")
	if err != nil {
		tx.Rollback()
		return nil, err
	}

	swaggerSpec := &models.SwaggerSpec{
		TeamID:      project.TeamID,
		ProjectID:   projectID,
		Name:        specName,
		Version:     specVersion,
		Source:      models.SpecSourcePostman,
		SpecContent: collectionJSON,
	}
	if err := tx.Create(swaggerSpec).Error; err != nil {
		tx.Rollback()
		return nil, err
	}

	if err := tx.Where("project_id = ?", projectID).Delete(&models.APIEndpoint{}).Error; err != nil {
		tx.Rollback()
		return nil, err
	}
	if err := tx.Where("source_project_id = ? AND source = ?", projectID, "postman").Delete(&models.Dependency{}).Error; err != nil {
		tx.Rollback()
		return nil, err
	}

	apis := make([]models.APIEndpoint, 0)
	var createErr error
	walkPostmanItems(collection.Item, "", func(item postmanItem, req postmanRequest, tag string) {
		if createErr != nil {
			return
		}
		path := postmanPath(req.URL)
		method := strings.ToUpper(strings.TrimSpace(req.Method))
		if path == "" || method == "" {
			return
		}
		endpoint := models.APIEndpoint{
			ProjectID:       projectID,
			SpecID:          swaggerSpec.ID,
			Path:            path,
			Method:          method,
			Tag:             tag,
			Summary:         item.Name,
			Description:     req.Description.Raw,
			ParametersJSON:  mustJSON(req.URL),
			RequestBodyJSON: mustJSON(req.Body),
			ResponsesJSON:   "",
			SecurityJSON:    mustJSON(req.Header),
			Deprecated:      false,
			Version:         specVersion,
		}
		if err := tx.Create(&endpoint).Error; err != nil {
			createErr = err
			return
		}
		apis = append(apis, endpoint)
	})
	if createErr != nil {
		tx.Rollback()
		return nil, createErr
	}

	if err := tx.Model(&swaggerSpec).Update("api_count", len(apis)).Error; err != nil {
		tx.Rollback()
		return nil, err
	}

	if err := tx.Model(&models.Project{}).Where("id = ?", projectID).Updates(map[string]interface{}{
		"open_api_spec":    collectionJSON,
		"open_api_version": collection.Info.Name,
	}).Error; err != nil {
		tx.Rollback()
		return nil, err
	}

	if err := tx.Commit().Error; err != nil {
		return nil, err
	}

	return &ImportOpenAPIResult{
		ProjectID:   projectID,
		SpecID:      swaggerSpec.ID,
		SpecName:    swaggerSpec.Name,
		SpecVersion: specVersion,
		APICount:    len(apis),
		RefCount:    0,
		DepCount:    0,
		APIs:        apis,
	}, nil
}

func ListAPIs(db *gorm.DB, projectID, query string, offset, limit int) ([]models.APIEndpoint, int64, error) {
	var apis []models.APIEndpoint
	var total int64
	q := db.Model(&models.APIEndpoint{})
	if projectID != "" {
		q = q.Where("project_id = ?", projectID)
	}
	if query != "" {
		like := "%" + query + "%"
		q = q.Where("path LIKE ? OR summary LIKE ? OR tag LIKE ?", like, like, like)
	}
	q.Count(&total)
	if err := q.Order("path, method").Offset(offset).Limit(limit).Find(&apis).Error; err != nil {
		return nil, 0, err
	}
	return apis, total, nil
}

func GetProjectAPIs(db *gorm.DB, projectID string) ([]models.APIEndpoint, error) {
	var apis []models.APIEndpoint
	err := db.Where("project_id = ?", projectID).Order("path, method").Find(&apis).Error
	return apis, err
}

// specNameFromOpenAPI 从 OpenAPI 文档的 info.title 提取 spec 名称。
// 找不到时返回空字符串，调用方需自行决定回退值。
func specNameFromOpenAPI(doc map[string]interface{}) string {
	info, ok := doc["info"].(map[string]interface{})
	if !ok {
		return ""
	}
	return strings.TrimSpace(stringValue(info["title"]))
}

// nextSpecVersion 决定新建 SwaggerSpec 应当使用的版本号。
//
// 规则：
//  1. 调用方显式传入 hint（非空）且为合法 semver → 直接使用
//  2. 否则查询该项目同名 spec 的最新版本，自动递增 patch 段
//  3. 首次导入默认 v1.0.0
func nextSpecVersion(tx *gorm.DB, projectID, name, hint string) (string, error) {
	if hint = strings.TrimSpace(hint); hint != "" {
		return hint, nil
	}

	var last models.SwaggerSpec
	err := tx.Where("project_id = ? AND name = ?", projectID, name).
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

// bumpPatchVersion 把 v1.2.3 → v1.2.4；如果解析失败或为空则 fallback 到 seed。
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

func firstTag(v interface{}) string {
	arr, ok := v.([]interface{})
	if !ok || len(arr) == 0 {
		return ""
	}
	return stringValue(arr[0])
}

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

func walkPostmanItems(items []postmanItem, parent string, visit func(postmanItem, postmanRequest, string)) {
	for _, item := range items {
		tag := itemTag(parent, item.Name)
		if item.Request != nil {
			visit(postmanItem{Name: item.Name}, *item.Request, parent)
		}
		if len(item.Item) > 0 {
			walkPostmanItems(item.Item, tag, visit)
		}
	}
}

func itemTag(parent, name string) string {
	if parent != "" {
		return parent
	}
	return name
}

func postmanPath(url postmanURL) string {
	if url.Raw != "" {
		raw := strings.TrimSpace(url.Raw)
		if idx := strings.Index(raw, "://"); idx >= 0 {
			if slash := strings.Index(raw[idx+3:], "/"); slash >= 0 {
				raw = raw[idx+3+slash:]
			}
		}
		if q := strings.Index(raw, "?"); q >= 0 {
			raw = raw[:q]
		}
		if raw != "" && !strings.HasPrefix(raw, "/") {
			raw = "/" + raw
		}
		return raw
	}
	parts := make([]string, 0, len(url.Path))
	for _, part := range url.Path {
		value := stringValue(part)
		if value != "" {
			parts = append(parts, value)
		}
	}
	if len(parts) == 0 {
		return ""
	}
	return "/" + strings.Join(parts, "/")
}

func (u *postmanURL) UnmarshalJSON(data []byte) error {
	var raw string
	if err := json.Unmarshal(data, &raw); err == nil {
		u.Raw = raw
		return nil
	}
	type alias postmanURL
	var next alias
	if err := json.Unmarshal(data, &next); err != nil {
		return err
	}
	*u = postmanURL(next)
	return nil
}

func (t *postmanTextOrRaw) UnmarshalJSON(data []byte) error {
	var raw string
	if err := json.Unmarshal(data, &raw); err == nil {
		t.Raw = raw
		return nil
	}
	type alias postmanTextOrRaw
	var next alias
	if err := json.Unmarshal(data, &next); err != nil {
		return err
	}
	*t = postmanTextOrRaw(next)
	return nil
}
