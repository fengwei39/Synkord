package api

import (
	"encoding/json"
	"net/http"
	"regexp"
	"sort"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"github.com/synkord/core/database"
	"github.com/synkord/core/models"
	"github.com/synkord/core/services"
)

// RegisterTeamSwaggerSpecRoutes 注册 swagger_specs 相关团队级端点。
// 路径前缀：/api/teams/:team_id/swagger-specs 与 /api/teams/:team_id/validate
//
// 端点（按 docs/ai-development-guide.md §12.4/12.6）：
//
//	GET    /swagger-specs?project_id=&limit=  列出某项目的版本历史
//	GET    /swagger-specs/:spec_id             取单个 spec 详情（含原始 spec_content）
//	POST   /swagger-specs/import               CLI 推送新版本（push-spec）
//	POST   /validate/dependencies              Git Hook 前置校验（validate-deps）
func RegisterTeamSwaggerSpecRoutes(r *gin.RouterGroup) {
	s := r.Group("/teams/:team_id")
	{
		s.GET("/swagger-specs", teamListSwaggerSpecs)
		s.GET("/swagger-specs/:spec_id", teamGetSwaggerSpec)
		s.POST("/swagger-specs/import", teamImportSwaggerSpec)
		s.POST("/validate/dependencies", teamValidateDependencies)
	}
}

func teamListSwaggerSpecs(c *gin.Context) {
	teamID := c.Param("team_id")
	if _, err := services.GetTeamForUser(database.DB, teamID, c.GetString("user_id")); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"detail": "Team not found"})
		return
	}

	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))

	query := database.DB.Model(&models.SwaggerSpec{}).
		Joins("JOIN projects ON projects.id = swagger_specs.project_id").
		Where("projects.team_id = ?", teamID)

	if projectID := c.Query("project_id"); projectID != "" {
		query = query.Where("swagger_specs.project_id = ?", projectID)
	}
	if name := c.Query("name"); name != "" {
		query = query.Where("swagger_specs.name = ?", name)
	}

	var specs []models.SwaggerSpec
	if err := query.Order("swagger_specs.created_at DESC").Limit(limit).Find(&specs).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"detail": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"items": specs, "total": len(specs)})
}

func teamGetSwaggerSpec(c *gin.Context) {
	teamID := c.Param("team_id")
	specID := c.Param("spec_id")
	if _, err := services.GetTeamForUser(database.DB, teamID, c.GetString("user_id")); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"detail": "Team not found"})
		return
	}

	var spec models.SwaggerSpec
	err := database.DB.
		Joins("JOIN projects ON projects.id = swagger_specs.project_id").
		Where("swagger_specs.id = ? AND projects.team_id = ?", specID, teamID).
		First(&spec).Error
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"detail": "Swagger spec not found"})
		return
	}
	c.JSON(http.StatusOK, spec)
}

type importSwaggerSpecRequest struct {
	ProjectID string `json:"project_id" binding:"required"`
	Spec      string `json:"spec" binding:"required"`
	Format    string `json:"format"`
	Note      string `json:"note"`
}

func teamImportSwaggerSpec(c *gin.Context) {
	teamID := c.Param("team_id")
	if !requireTeamEditor(c, teamID) {
		return
	}

	var req importSwaggerSpecRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
		return
	}

	var project models.Project
	if err := database.DB.First(&project, "id = ? AND team_id = ?", req.ProjectID, teamID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"detail": "Project not found in current team"})
		return
	}

	result, err := importAPISpec(req.ProjectID, req.Spec, req.Format)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
		return
	}

	if req.Note != "" {
		database.DB.Model(&models.SwaggerSpec{}).
			Where("id = ?", result.SpecID).
			Update("change_summary", req.Note)
	}

	c.JSON(http.StatusOK, result)
}

// validateDependenciesRequest 是 Git Hook 调用 validate-deps 时的请求体。
//
// PinnedVersion: 消费方声明当前锁定的 spec 版本（可选）。
// UsedEntities / UsedAPIs: 消费方声明本次变更涉及的实体名 / "METHOD path"。
//
// 服务端比对：当目标项目的最新 spec 中已删除某 entity 或 API 时，判定为 breaking。
type validateDependenciesRequest struct {
	ProjectID     string   `json:"project_id" binding:"required"`
	PinnedVersion string   `json:"pinned_version"`
	UsedEntities  []string `json:"used_entities"`
	UsedAPIs      []string `json:"used_apis"`
}

type validateDependenciesResponse struct {
	OK       bool     `json:"ok"`
	Breaking []string `json:"breaking"`
	Warnings []string `json:"warnings"`
}

func teamValidateDependencies(c *gin.Context) {
	teamID := c.Param("team_id")
	if _, err := services.GetTeamForUser(database.DB, teamID, c.GetString("user_id")); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"detail": "Team not found"})
		return
	}

	var req validateDependenciesRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
		return
	}

	var project models.Project
	if err := database.DB.First(&project, "id = ? AND team_id = ?", req.ProjectID, teamID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"detail": "Project not found in current team"})
		return
	}

	currentSpec, err := latestSpecForProject(database.DB, project.ID)
	if err != nil && err != gorm.ErrRecordNotFound {
		c.JSON(http.StatusInternalServerError, gin.H{"detail": err.Error()})
		return
	}

	resp := validateDependenciesResponse{OK: true}

	if currentSpec == nil {
		// 项目尚未导入过 spec：把"使用了 entity/api"作为 warning 提示
		if len(req.UsedEntities) > 0 || len(req.UsedAPIs) > 0 {
			resp.Warnings = append(resp.Warnings, "no spec imported for project; cannot validate references")
		}
		c.JSON(http.StatusOK, resp)
		return
	}

	currentEntities, currentAPIs, err := loadCurrentSpecIndex(database.DB, currentSpec)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"detail": err.Error()})
		return
	}

	for _, entity := range req.UsedEntities {
		if _, ok := currentEntities[entity]; !ok {
			resp.OK = false
			resp.Breaking = append(resp.Breaking, "entity "+entity+" not in latest spec "+currentSpec.Version)
		}
	}
	for _, apiKey := range req.UsedAPIs {
		if _, ok := currentAPIs[apiKey]; !ok {
			resp.OK = false
			resp.Breaking = append(resp.Breaking, "api "+apiKey+" not in latest spec "+currentSpec.Version)
		}
	}

	if req.PinnedVersion != "" && currentSpec.Version != req.PinnedVersion {
		resp.Warnings = append(resp.Warnings,
			"pinned_version "+req.PinnedVersion+" differs from latest "+currentSpec.Version)
	}

	sort.Strings(resp.Breaking)
	sort.Strings(resp.Warnings)
	c.JSON(http.StatusOK, resp)
}

// latestSpecForProject 取项目最新一条 SwaggerSpec（按 created_at）。
func latestSpecForProject(db *gorm.DB, projectID string) (*models.SwaggerSpec, error) {
	var spec models.SwaggerSpec
	err := db.Where("project_id = ?", projectID).
		Order("created_at DESC").
		First(&spec).Error
	if err != nil {
		return nil, err
	}
	return &spec, nil
}

// loadCurrentSpecIndex 从最新 spec 解析出当前所有 entity 名称和 "METHOD path" API 集合。
func loadCurrentSpecIndex(db *gorm.DB, spec *models.SwaggerSpec) (map[string]struct{}, map[string]struct{}, error) {
	entities := map[string]struct{}{}
	apis := map[string]struct{}{}

	if spec == nil {
		return entities, apis, nil
	}

	var endpoints []models.APIEndpoint
	if err := db.Where("spec_id = ?", spec.ID).Find(&endpoints).Error; err != nil {
		return nil, nil, err
	}
	for _, e := range endpoints {
		apis[strings.ToUpper(e.Method)+" "+e.Path] = struct{}{}
	}

	// entity 名从原始 spec_content 抽：
	//   1. 解析 components.schemas 下的所有定义（最权威）
	//   2. 兜底用 $ref 模式抓那些"只被引用但没列在 schemas"的情况
	for _, name := range extractComponentSchemaNames(spec.SpecContent) {
		entities[name] = struct{}{}
	}

	return entities, apis, nil
}

// extractComponentSchemaNames 从 spec 文本里抽出所有 entity 名。
//
// 优先用 JSON 解析走 components.schemas 拿到完整定义列表；解析失败时
// 退到 $ref 兜底正则，确保即便用户粘的不是合法 JSON 也能凑出部分信息。
func extractComponentSchemaNames(specContent string) []string {
	seen := map[string]struct{}{}
	out := make([]string, 0)

	if names := schemaNamesViaJSON(specContent); len(names) > 0 {
		for _, n := range names {
			if _, ok := seen[n]; ok {
				continue
			}
			seen[n] = struct{}{}
			out = append(out, n)
		}
		return out
	}

	for _, m := range componentSchemaRefRe.FindAllStringSubmatch(specContent, -1) {
		if len(m) < 2 {
			continue
		}
		if _, ok := seen[m[1]]; ok {
			continue
		}
		seen[m[1]] = struct{}{}
		out = append(out, m[1])
	}
	return out
}

// schemaNamesViaJSON 用 encoding/json 走 components/schemas 路径，
// 抽取所有 schema 名称。这是规范来源（spec 怎么定义的 entity）。
func schemaNamesViaJSON(specContent string) []string {
	var doc map[string]any
	if err := json.Unmarshal([]byte(specContent), &doc); err != nil {
		return nil
	}
	components, ok := doc["components"].(map[string]any)
	if !ok {
		return nil
	}
	schemas, ok := components["schemas"].(map[string]any)
	if !ok {
		return nil
	}
	out := make([]string, 0, len(schemas))
	for k := range schemas {
		out = append(out, k)
	}
	return out
}

var componentSchemaRefRe = regexp.MustCompile(`"#/components/schemas/([A-Za-z0-9_]+)"`)
