// Synkord Contract Entities (data models)
// 详见 docs/requirements.md §四.5

package api

import (
	"net/http"
	"regexp"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/synkord/core/database"
	"github.com/synkord/core/models"
	"github.com/synkord/core/services"
)

func listContractEntities(c *gin.Context) {
	contractID := c.Param("id")
	userID := c.GetString("user_id")
	if _, _, err := services.GetContractForUser(database.DB, contractID, userID); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"detail": "Contract not found"})
		return
	}
	keyword := c.Query("keyword")
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "200"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))
	entities, total, err := services.ListContractEntities(database.DB, contractID, keyword, offset, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"detail": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"total": total, "items": entities})
}

func createContractEntity(c *gin.Context) {
	contractID, ok := requireContractEditor(c)
	if !ok {
		return
	}
	userID := c.GetString("user_id")
	var req struct {
		Name          string        `json:"name" binding:"required"`
		Description   string        `json:"description"`
		SchemaContent string        `json:"schema_content"`
		Fields        []interface{} `json:"fields"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
		return
	}
	schemaContent := req.SchemaContent
	if schemaContent == "" && len(req.Fields) > 0 {
		schemaContent = marshalAny(buildSchemaFromFields(req.Name, req.Fields))
	}
	entity, err := services.CreateContractEntity(database.DB, contractID, req.Name, req.Description, schemaContent, userID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, entity)
}

func getContractEntity(c *gin.Context) {
	contractID := c.Param("id")
	entityID := c.Param("entityId")
	userID := c.GetString("user_id")
	if _, _, err := services.GetContractForUser(database.DB, contractID, userID); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"detail": "Contract not found"})
		return
	}
	entity, err := services.GetContractEntity(database.DB, contractID, entityID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"detail": "Entity not found"})
		return
	}
	c.JSON(http.StatusOK, entity)
}

func updateContractEntity(c *gin.Context) {
	contractID, ok := requireContractEditor(c)
	if !ok {
		return
	}
	entityID := c.Param("entityId")
	userID := c.GetString("user_id")
	var req struct {
		Name          *string       `json:"name"`
		Description   *string       `json:"description"`
		SchemaContent *string       `json:"schema_content"`
		Fields        []interface{} `json:"fields"`
		ChangeSummary *string       `json:"change_summary"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
		return
	}
	schemaContent := req.SchemaContent
	if schemaContent == nil && len(req.Fields) > 0 {
		name := ""
		if req.Name != nil {
			name = *req.Name
		}
		schema := marshalAny(buildSchemaFromFields(name, req.Fields))
		schemaContent = &schema
	}
	entity, err := services.UpdateContractEntity(database.DB, contractID, entityID, userID, req.Name, req.Description, schemaContent, req.ChangeSummary)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
		return
	}
	c.JSON(http.StatusOK, entity)
}

func deleteContractEntity(c *gin.Context) {
	contractID, ok := requireContractEditor(c)
	if !ok {
		return
	}
	entityID := c.Param("entityId")
	if err := services.DeleteContractEntity(database.DB, contractID, entityID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
		return
	}
	c.Status(http.StatusNoContent)
}

func getContractEntityDependencies(c *gin.Context) {
	contractID := c.Param("id")
	entityID := c.Param("entityId")
	userID := c.GetString("user_id")
	if _, _, err := services.GetContractForUser(database.DB, contractID, userID); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"detail": "Contract not found"})
		return
	}
	entity, err := services.GetContractEntity(database.DB, contractID, entityID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"detail": "Entity not found"})
		return
	}
	deps, err := services.GetEntityDependencies(database.DB, contractID, entity.Name)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"detail": err.Error()})
		return
	}
	c.JSON(http.StatusOK, deps)
}

// getContractDependencyGraph 契约集内的依赖图
// 从 APIEndpoint 的 ParametersJSON / RequestBodyJSON / ResponsesJSON 中提取 $ref
// 找出 API → Entity 的依赖边
func getContractDependencyGraph(c *gin.Context) {
	contractID := c.Param("id")
	userID := c.GetString("user_id")
	if _, _, err := services.GetContractForUser(database.DB, contractID, userID); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"detail": "Contract not found"})
		return
	}

	apis, _, _ := services.ListContractAPIs(database.DB, contractID, "", "", "", false, 0, 500)
	entities, _, _ := services.ListContractEntities(database.DB, contractID, "", 0, 500)

	// 收集实体名集合
	entityNames := make(map[string]bool)
	entityIDByName := make(map[string]string)
	for _, e := range entities {
		entityNames[e.Name] = true
		entityIDByName[e.Name] = e.ID
	}

	type node struct {
		ID   string `json:"id"`
		Name string `json:"name"`
		Type string `json:"type"`
	}
	type edge struct {
		Source string `json:"source"`
		Target string `json:"target"`
		Kind   string `json:"kind"`
	}
	nodes := []node{}
	for _, e := range entities {
		nodes = append(nodes, node{ID: "entity:" + e.ID, Name: e.Name, Type: "entity"})
	}
	for _, a := range apis {
		nodes = append(nodes, node{ID: "api:" + a.ID, Name: a.Method + " " + a.Path, Type: "api"})
	}

	edges := []edge{}
	// 扫描每个 API 的 JSON 字段，提取 $ref 引用
	for _, api := range apis {
		refs := extractRefsFromAPI(&api)
		for _, entityName := range refs {
			if entityID, ok := entityIDByName[entityName]; ok {
				edges = append(edges, edge{
					Source: "api:" + api.ID,
					Target: "entity:" + entityID,
					Kind:   "uses_entity",
				})
			}
		}
	}

	// 实体间引用（从 SchemaContent 的 $ref）
	for _, e := range entities {
		refs := extractRefsFromSchema(e.SchemaContent)
		for _, refName := range refs {
			if _, ok := entityIDByName[refName]; ok {
				edges = append(edges, edge{
					Source: "entity:" + e.ID,
					Target: "entity:" + entityIDByName[refName],
					Kind:   "references_entity",
				})
			}
		}
	}

	c.JSON(http.StatusOK, gin.H{"nodes": nodes, "edges": edges})
}

// listContractEntityVersions 列出数据模型的版本快照
func listContractEntityVersions(c *gin.Context) {
	contractID := c.Param("id")
	entityID := c.Param("entityId")
	userID := c.GetString("user_id")
	if _, _, err := services.GetContractForUser(database.DB, contractID, userID); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"detail": "Contract not found"})
		return
	}
	versions, err := services.GetEntityVersions(database.DB, entityID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"detail": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": versions, "total": len(versions)})
}
func extractRefsFromAPI(api *models.APIEndpoint) []string {
	refs := make(map[string]bool)
	jsonStr := api.ParametersJSON + api.RequestBodyJSON + api.ResponsesJSON
	if jsonStr == "" {
		return nil
	}
	re := regexp.MustCompile(`"#/components/schemas/([A-Za-z0-9_]+)"`)
	for _, m := range re.FindAllStringSubmatch(jsonStr, -1) {
		refs[m[1]] = true
	}
	result := make([]string, 0, len(refs))
	for r := range refs {
		result = append(result, r)
	}
	return result
}

// extractRefsFromSchema 从 SchemaContent JSON 提取 $ref 引用的实体名
func extractRefsFromSchema(schemaContent string) []string {
	if schemaContent == "" {
		return nil
	}
	refs := make(map[string]bool)
	re := regexp.MustCompile(`"#/components/schemas/([A-Za-z0-9_]+)"`)
	for _, m := range re.FindAllStringSubmatch(schemaContent, -1) {
		refs[m[1]] = true
	}
	result := make([]string, 0, len(refs))
	for r := range refs {
		result = append(result, r)
	}
	return result
}

// ApiSummary 跨契约集搜索 API 时返回的精简视图（对齐 docs/requirements.md §4.11）
// 仅暴露 ai_id/path/method/summary 四个字段，避免 schema_content 等大字段污染 MCP 响应
type ApiSummary struct {
	APIID   string `json:"api_id"`
	Path    string `json:"path"`
	Method  string `json:"method"`
	Summary string `json:"summary"`
}

// EntitySummary 跨契约集搜索 实体时返回的精简视图（对齐 docs/requirements.md §4.11）
type EntitySummary struct {
	EntityID    string `json:"entity_id"`
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
}

// searchAPIsAcrossContracts 跨契约集搜索 API
// 修复冲突 #2：返回 ApiSummary（仅 4 字段），禁止透传完整 APIEndpoint + schema_content
func searchAPIsAcrossContracts(c *gin.Context) {
	keyword := c.Query("keyword")
	filterContractID := c.Query("contract_id")
	method := c.Query("method")
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "30"))
	if limit <= 0 || limit > 100 {
		limit = 30
	}
	userID := c.GetString("user_id")
	if keyword == "" {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "keyword is required"})
		return
	}
	contracts, err := services.ListUserContracts(database.DB, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"detail": err.Error()})
		return
	}
	type item struct {
		ContractID   string     `json:"contract_id"`
		ContractName string     `json:"contract_name"`
		API          ApiSummary `json:"api"`
	}
	results := []item{}
	for _, ct := range contracts {
		if filterContractID != "" && ct.ID != filterContractID {
			continue
		}
		apis, _, _ := services.ListContractAPIs(database.DB, ct.ID, keyword, method, "", true, 0, limit)
		for _, a := range apis {
			results = append(results, item{
				ContractID:   ct.ID,
				ContractName: ct.Name,
				API: ApiSummary{
					APIID:   a.ID,
					Path:    a.Path,
					Method:  a.Method,
					Summary: a.Summary,
				},
			})
			if len(results) >= limit {
				c.JSON(http.StatusOK, results)
				return
			}
		}
	}
	c.JSON(http.StatusOK, results)
}

// searchEntitiesAcrossContracts 跨契约集搜索实体
// 修复冲突 #6：返回 EntitySummary（仅 3 字段），禁止透传完整 DataModel + schema_content
func searchEntitiesAcrossContracts(c *gin.Context) {
	keyword := c.Query("keyword")
	filterContractID := c.Query("contract_id")
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "30"))
	if limit <= 0 || limit > 100 {
		limit = 30
	}
	userID := c.GetString("user_id")
	if keyword == "" {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "keyword is required"})
		return
	}
	contracts, err := services.ListUserContracts(database.DB, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"detail": err.Error()})
		return
	}
	type item struct {
		ContractID   string       `json:"contract_id"`
		ContractName string       `json:"contract_name"`
		Entity       EntitySummary `json:"entity"`
	}
	results := []item{}
	for _, ct := range contracts {
		if filterContractID != "" && ct.ID != filterContractID {
			continue
		}
		entities, _, _ := services.ListContractEntities(database.DB, ct.ID, keyword, 0, limit)
		for _, e := range entities {
			results = append(results, item{
				ContractID:   ct.ID,
				ContractName: ct.Name,
				Entity: EntitySummary{
					EntityID:    e.ID,
					Name:        e.Name,
					Description: e.Description,
				},
			})
			if len(results) >= limit {
				c.JSON(http.StatusOK, results)
				return
			}
		}
	}
	c.JSON(http.StatusOK, results)
}
