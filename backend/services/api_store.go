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
	ProjectID string               `json:"project_id"`
	APICount  int                  `json:"api_count"`
	RefCount  int                  `json:"ref_count"`
	DepCount  int                  `json:"dependency_count"`
	APIs      []models.APIEndpoint `json:"apis"`
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

	version := ""
	if v, ok := doc["openapi"].(string); ok {
		version = v
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
				Version:         version,
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

	if err := tx.Model(&models.Project{}).Where("id = ?", projectID).Updates(map[string]interface{}{
		"open_api_spec":    spec,
		"open_api_version": version,
	}).Error; err != nil {
		tx.Rollback()
		return nil, err
	}

	if err := tx.Commit().Error; err != nil {
		return nil, err
	}

	return &ImportOpenAPIResult{
		ProjectID: projectID,
		APICount:  len(apis),
		RefCount:  len(refSeen),
		DepCount:  depCount,
		APIs:      apis,
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
