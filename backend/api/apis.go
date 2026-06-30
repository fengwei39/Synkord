package api

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/synkord/core/database"
	"github.com/synkord/core/models"
	"github.com/synkord/core/services"
)

func RegisterTeamAPIRoutes(r *gin.RouterGroup) {
	a := r.Group("/teams/:team_id/projects/:project_id/apis")
	{
		a.GET("", func(c *gin.Context) {
			teamID := c.Param("team_id")
			projectID := c.Param("project_id")
			if _, err := services.GetTeamForUser(database.DB, teamID, c.GetString("user_id")); err != nil {
				c.JSON(http.StatusNotFound, gin.H{"detail": "Team not found"})
				return
			}
			if !projectBelongsToTeam(projectID, teamID) {
				c.JSON(http.StatusNotFound, gin.H{"detail": "Project not found"})
				return
			}

			skip, _ := strconv.Atoi(c.DefaultQuery("skip", "0"))
			limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))

			query := database.DB.Model(&models.APIEndpoint{}).
				Where("team_id = ? AND project_id = ?", teamID, projectID)
			if q := c.Query("q"); q != "" {
				like := "%" + q + "%"
				query = query.Where("api_endpoints.path LIKE ? OR api_endpoints.summary LIKE ? OR api_endpoints.tag LIKE ?", like, like, like)
			}

			var total int64
			query.Count(&total)

			var apis []models.APIEndpoint
			if err := query.Order("api_endpoints.path, api_endpoints.method").Offset(skip).Limit(limit).Find(&apis).Error; err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"detail": err.Error()})
				return
			}
			c.JSON(http.StatusOK, gin.H{"items": apis, "total": total})
		})

		a.POST("/import", func(c *gin.Context) {
			teamID := c.Param("team_id")
			if !requireTeamEditor(c, teamID) {
				return
			}
			projectID := c.Param("project_id")

			var req struct {
				Spec   string `json:"spec" binding:"required"`
				Format string `json:"format"`
			}
			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
				return
			}

			var project models.Project
			if err := database.DB.First(&project, "id = ? AND team_id = ?", projectID, teamID).Error; err != nil {
				c.JSON(http.StatusNotFound, gin.H{"detail": "Project not found"})
				return
			}

			result, err := importAPISpec(projectID, req.Spec, req.Format)
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
				return
			}
			c.JSON(http.StatusOK, result)
		})

		a.POST("/import-from-project", func(c *gin.Context) {
			teamID := c.Param("team_id")
			if !requireTeamEditor(c, teamID) {
				return
			}
			projectID := c.Param("project_id")

			var project models.Project
			if err := database.DB.First(&project, "id = ? AND team_id = ?", projectID, teamID).Error; err != nil {
				c.JSON(http.StatusNotFound, gin.H{"detail": "Project not found"})
				return
			}
			if project.SwaggerURL == "" {
				c.JSON(http.StatusBadRequest, gin.H{"detail": "Project swagger_url is empty"})
				return
			}

			spec, err := fetchSwaggerSpec(project.SwaggerURL)
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
				return
			}

			result, err := importAPISpec(project.ID, spec, "openapi")
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
				return
			}
			database.DB.Model(&project).Updates(map[string]any{
				"open_api_spec":    spec,
				"open_api_version": result.SpecVersion,
			})
			c.JSON(http.StatusOK, result)
		})

		a.GET("/:api_id", func(c *gin.Context) {
			teamID := c.Param("team_id")
			if _, err := services.GetTeamForUser(database.DB, teamID, c.GetString("user_id")); err != nil {
				c.JSON(http.StatusNotFound, gin.H{"detail": "Team not found"})
				return
			}

			var endpoint models.APIEndpoint
			if err := database.DB.
				Where("id = ? AND team_id = ? AND project_id = ?", c.Param("api_id"), teamID, c.Param("project_id")).
				First(&endpoint).Error; err != nil {
				c.JSON(http.StatusNotFound, gin.H{"detail": "API not found"})
				return
			}
			c.JSON(http.StatusOK, endpoint)
		})

		// GET /teams/:team_id/projects/:project_id/apis/:api_id/export
		// 导出当前项目的 OpenAPI 3.0 规范。:api_id 仅为路径占位（导出是项目级操作），
		// 实际只校验该 api_id 属于该项目；存在即代表进入正确项目。
		// 优先返回项目最近一次导入的原始 spec；如果项目从未导入过 spec，则根据
		// 当前 APIEndpoint + DataModel 记录动态生成一份。
		a.GET("/:api_id/export", func(c *gin.Context) {
			teamID := c.Param("team_id")
			projectID := c.Param("project_id")
			apiID := c.Param("api_id")

			if _, err := services.GetTeamForUser(database.DB, teamID, c.GetString("user_id")); err != nil {
				c.JSON(http.StatusNotFound, gin.H{"detail": "Team not found"})
				return
			}

			var endpoint models.APIEndpoint
			if err := database.DB.
				Where("id = ? AND team_id = ? AND project_id = ?", apiID, teamID, projectID).
				First(&endpoint).Error; err != nil {
				c.JSON(http.StatusNotFound, gin.H{"detail": "API not found in project"})
				return
			}

			var project models.Project
			if err := database.DB.First(&project, "id = ? AND team_id = ?", projectID, teamID).Error; err != nil {
				c.JSON(http.StatusNotFound, gin.H{"detail": "Project not found"})
				return
			}

			filename := fmt.Sprintf("%s-openapi.json", sanitizeFileName(project.Name))
			if strings.TrimSpace(project.OpenAPISpec) != "" {
				c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=%q", filename))
				c.Data(http.StatusOK, "application/json; charset=utf-8", []byte(project.OpenAPISpec))
				return
			}

			doc := buildOpenAPIFromDB(project, teamID, projectID)
			payload, err := marshalJSONPretty(doc)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"detail": err.Error()})
				return
			}
			c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=%q", filename))
			c.Data(http.StatusOK, "application/json; charset=utf-8", payload)
		})
	}
}

func projectBelongsToTeam(projectID, teamID string) bool {
	var count int64
	database.DB.Model(&models.Project{}).Where("id = ? AND team_id = ?", projectID, teamID).Count(&count)
	return count == 1
}

func fetchSwaggerSpec(rawURL string) (string, error) {
	parsed, err := url.Parse(strings.TrimSpace(rawURL))
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return "", fmt.Errorf("invalid swagger_url")
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return "", fmt.Errorf("swagger_url must use http or https")
	}

	client := &http.Client{Timeout: 15 * time.Second}
	req, err := http.NewRequest(http.MethodGet, parsed.String(), nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("Accept", "application/json, application/yaml, text/yaml, */*")

	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("fetch swagger failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", fmt.Errorf("fetch swagger failed: HTTP %d", resp.StatusCode)
	}

	const maxSpecSize = 10 << 20
	body, err := io.ReadAll(io.LimitReader(resp.Body, maxSpecSize+1))
	if err != nil {
		return "", fmt.Errorf("read swagger failed: %w", err)
	}
	if len(body) > maxSpecSize {
		return "", fmt.Errorf("swagger spec exceeds 10MB")
	}
	if len(strings.TrimSpace(string(body))) == 0 {
		return "", fmt.Errorf("swagger spec is empty")
	}
	return string(body), nil
}

func importAPISpec(projectID, spec, format string) (*services.ImportOpenAPIResult, error) {
	switch strings.ToLower(strings.TrimSpace(format)) {
	case "", "openapi", "swagger":
		return services.ImportOpenAPISpec(database.DB, projectID, spec)
	case "postman":
		return services.ImportPostmanCollection(database.DB, projectID, spec)
	default:
		return nil, services.ErrUnsupportedAPIImportFormat(format)
	}
}

// buildOpenAPIFromDB 在项目没有原始导入 spec 时，根据当前 APIEndpoint 和
// DataModel 记录动态生成一份 OpenAPI 3.0 文档，供 /export 端点返回。
func buildOpenAPIFromDB(project models.Project, teamID, projectID string) map[string]interface{} {
	apis, _ := services.GetTeamProjectAPIs(database.DB, teamID, projectID)
	entities, _, _ := services.ListProjectEntities(database.DB, teamID, projectID, 0, 10000)

	paths := map[string]interface{}{}
	for i := range apis {
		api := apis[i]
		pathItem, ok := paths[api.Path].(map[string]interface{})
		if !ok {
			pathItem = map[string]interface{}{}
			paths[api.Path] = pathItem
		}
		method := strings.ToLower(strings.TrimSpace(api.Method))
		if method == "" {
			method = "get"
		}
		operation := map[string]interface{}{}
		if api.Summary != "" {
			operation["summary"] = api.Summary
		}
		if api.Description != "" {
			operation["description"] = api.Description
		}
		if api.Tag != "" {
			operation["tags"] = []string{api.Tag}
		}
		if api.Deprecated {
			operation["deprecated"] = true
		}
		if v := parseJSONOrNil(api.ParametersJSON); v != nil {
			operation["parameters"] = v
		}
		if v := parseJSONOrNil(api.RequestBodyJSON); v != nil {
			operation["requestBody"] = v
		}
		if v := parseJSONOrNil(api.ResponsesJSON); v != nil {
			operation["responses"] = v
		}
		if v := parseJSONOrNil(api.SecurityJSON); v != nil {
			operation["security"] = v
		}
		pathItem[method] = operation
	}

	components := map[string]interface{}{}
	schemas := map[string]interface{}{}
	for i := range entities {
		e := entities[i]
		if schema := parseJSONOrNil(e.SchemaContent); schema != nil {
			schemas[e.Name] = schema
		}
	}
	if len(schemas) > 0 {
		components["schemas"] = schemas
	}

	doc := map[string]interface{}{
		"openapi": "3.0.3",
		"info": map[string]interface{}{
			"title":       project.Name,
			"description": project.Description,
			"version":     nonEmpty(project.OpenAPIVersion, "1.0.0"),
		},
		"paths": paths,
	}
	if len(components) > 0 {
		doc["components"] = components
	}
	return doc
}

func parseJSONOrNil(raw string) interface{} {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil
	}
	var v interface{}
	if err := json.Unmarshal([]byte(raw), &v); err != nil {
		return nil
	}
	return v
}

func nonEmpty(s, fallback string) string {
	if strings.TrimSpace(s) == "" {
		return fallback
	}
	return s
}

func marshalJSONPretty(v interface{}) ([]byte, error) {
	return json.MarshalIndent(v, "", "  ")
}

var fileNameSanitizer = regexp.MustCompile(`[^A-Za-z0-9._-]+`)

func sanitizeFileName(s string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return "project"
	}
	return fileNameSanitizer.ReplaceAllString(s, "-")
}
