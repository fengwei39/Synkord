// Synkord Import API
// OpenAPI / Swagger / Postman 导入
// 详见 docs/requirements.md §四.6
//
// v1.2 修订：
//   parse 阶段：纯解析，不写 DB，返回预览（apis / entities / warnings）。
//   commit 阶段：把前端选中的 apis / entities 写入 DB。
//   旧的 commit 路径（先 parse 再即时入库）已废除，避免前后端语义错位。

package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/goccy/go-yaml"
	"github.com/synkord/core/database"
	"github.com/synkord/core/models"
	"gorm.io/gorm"
)

// parseImport 解析导入内容并预览（不写入数据库）
func parseImport(c *gin.Context) {
	var req struct {
		Source  string `json:"source" binding:"required"`
		Content string `json:"content" binding:"required"`
		Format  string `json:"format"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
		return
	}
	contractID, ok := requireContractEditor(c)
	if !ok {
		return
	}
	_ = contractID
	preview := parseSpecContent(req.Content)
	if preview.err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": preview.err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"apis":     preview.apis,
		"entities": preview.entities,
		"warnings": preview.warnings,
	})
}

// commitImport 把前端选中的 apis / entities 写入数据库
func commitImport(c *gin.Context) {
	var req struct {
		APIs     []map[string]interface{} `json:"apis"`
		Entities []map[string]interface{} `json:"entities"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
		return
	}
	contractID, ok := requireContractEditor(c)
	if !ok {
		return
	}
	userID := c.GetString("user_id")

	tx := database.DB.Begin()
	if tx.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"detail": tx.Error.Error()})
		return
	}
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	apiCount := 0
	for _, raw := range req.APIs {
		path, _ := raw["path"].(string)
		method, _ := raw["method"].(string)
		if path == "" || method == "" {
			continue
		}
		tags := marshalTags(raw["tags"])
		endpoint := models.APIEndpoint{
			ContractID:      contractID,
			Path:            path,
			Method:          strings.ToUpper(method),
			Tags:            tags,
			Summary:         stringField(raw["summary"]),
			Description:     stringField(raw["description"]),
			ParametersJSON:  marshalAny(raw["parameters"]),
			RequestBodyJSON: marshalAny(raw["request_body"]),
			ResponsesJSON:   marshalAny(raw["responses"]),
			Deprecated:      boolField(raw["deprecated"]),
		}
		if err := tx.Create(&endpoint).Error; err != nil {
			tx.Rollback()
			c.JSON(http.StatusBadRequest, gin.H{"detail": fmt.Sprintf("create api %s %s failed: %v", method, path, err)})
			return
		}
		apiCount++
	}

	entityCount := 0
	for _, raw := range req.Entities {
		name, _ := raw["name"].(string)
		if name == "" {
			continue
		}
		description := stringField(raw["description"])
		schema := marshalAny(raw["schema_content"])
		if schema == "" {
			// 若前端以 fields 数组提交，组装成标准 JSON Schema 字符串
			if fs, ok := raw["fields"].([]interface{}); ok {
				schema = marshalAny(buildSchemaFromFields(name, fs))
			}
		}
		if schema == "" {
			continue
		}
		entity := models.DataModel{
			ContractID:     contractID,
			Name:           name,
			Description:    description,
			SchemaContent:  schema,
			CurrentVersion: "1.0.0",
			VersionCount:   1,
			CreatedBy:      &userID,
		}
		if err := tx.Create(&entity).Error; err != nil {
			tx.Rollback()
			c.JSON(http.StatusBadRequest, gin.H{"detail": fmt.Sprintf("create entity %s failed: %v", name, err)})
			return
		}
		version := models.DataModelVersion{
			DataModelID:   entity.ID,
			VersionNumber: "1.0.0",
			SchemaContent: schema,
			ChangeSummary: "Imported",
			CreatedBy:     &userID,
		}
		if err := tx.Create(&version).Error; err != nil {
			// version 失败不回滚整体，记录即可
			fmt.Printf("[import] version snapshot failed for %s: %v\n", name, err)
		}
		entityCount++
	}

	if err := tx.Commit().Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"detail": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"imported_apis":     apiCount,
		"imported_entities": entityCount,
	})
}

// ============================================================================
// 解析共用辅助
// ============================================================================

type previewResult struct {
	apis     []map[string]interface{}
	entities []map[string]interface{}
	warnings []string
	err      error
}

func parseSpecContent(content string) previewResult {
	out := previewResult{}
	var doc map[string]interface{}
	if err := json.Unmarshal([]byte(content), &doc); err != nil {
		if yamlErr := yaml.Unmarshal([]byte(content), &doc); yamlErr != nil {
			out.err = fmt.Errorf("parse failed: json=%v; yaml=%v", err, yamlErr)
			return out
		}
	}
	paths, _ := doc["paths"].(map[string]interface{})
	methods := map[string]bool{
		"get": true, "post": true, "put": true, "patch": true,
		"delete": true, "head": true, "options": true, "trace": true,
	}
	for path, rawPathItem := range paths {
		pathItem, ok := rawPathItem.(map[string]interface{})
		if !ok {
			continue
		}
		for method, rawOp := range pathItem {
			mLower := strings.ToLower(method)
			if !methods[mLower] {
				continue
			}
			op, ok := rawOp.(map[string]interface{})
			if !ok {
				continue
			}
			entry := map[string]interface{}{
				"path":        path,
				"method":      strings.ToUpper(mLower),
				"summary":     stringField(op["summary"]),
				"description": stringField(op["description"]),
				"tags":        op["tags"],
				"parameters":  op["parameters"],
				"request_body": op["requestBody"],
				"responses":   op["responses"],
				"deprecated":  boolField(op["deprecated"]),
			}
			out.apis = append(out.apis, entry)
		}
	}
	// 仅识别 components.schemas
	if schemas, ok := doc["components"].(map[string]interface{}); ok {
		if defs, ok := schemas["schemas"].(map[string]interface{}); ok {
			for name, raw := range defs {
				entry := map[string]interface{}{
					"name":           name,
					"description":    stringField(raw.(map[string]interface{})["description"]),
					"schema_content": marshalAny(raw),
				}
				out.entities = append(out.entities, entry)
			}
		}
	} else if defs, ok := doc["definitions"].(map[string]interface{}); ok {
		// Swagger 2.0
		for name, raw := range defs {
			entry := map[string]interface{}{
				"name":           name,
				"description":    stringField(raw.(map[string]interface{})["description"]),
				"schema_content": marshalAny(raw),
			}
			out.entities = append(out.entities, entry)
		}
	}
	return out
}

// buildSchemaFromFields 把前端传入的 fields 列表组装回 JSON Schema 字符串
func buildSchemaFromFields(name string, fields []interface{}) map[string]interface{} {
	properties := map[string]interface{}{}
	required := []string{}
	for _, f := range fields {
		m, ok := f.(map[string]interface{})
		if !ok {
			continue
		}
		fname, _ := m["name"].(string)
		if fname == "" {
			continue
		}
		properties[fname] = map[string]interface{}{
			"type":        stringField(m["type"]),
			"description": stringField(m["description"]),
		}
		if r, _ := m["required"].(bool); r {
			required = append(required, fname)
		}
	}
	schema := map[string]interface{}{
		"type":       "object",
		"properties": properties,
	}
	if len(required) > 0 {
		schema["required"] = required
	}
	return schema
}

func stringField(v interface{}) string {
	if s, ok := v.(string); ok {
		return s
	}
	return ""
}

func boolField(v interface{}) bool {
	b, _ := v.(bool)
	return b
}

func marshalAny(v interface{}) string {
	if v == nil {
		return ""
	}
	b, err := json.Marshal(v)
	if err != nil {
		return ""
	}
	return string(b)
}

func marshalTags(v interface{}) string {
	if v == nil {
		return ""
	}
	switch t := v.(type) {
	case []interface{}:
		b, _ := json.Marshal(t)
		return string(b)
	case []string:
		b, _ := json.Marshal(t)
		return string(b)
	}
	return ""
}

// 引用避免 DB import 在某些 build tag 下未使用
var _ = gorm.ErrRecordNotFound
