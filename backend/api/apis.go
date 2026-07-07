// Synkord Contract APIs (interface definitions)
// 详见 docs/requirements.md §四.4

package api

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/synkord/core/database"
	"github.com/synkord/core/models"
	"github.com/synkord/core/services"
)

// apiResponseItem 把 models.APIEndpoint 的 JSON 字符串字段（tags / parameters_json /
// request_body_json / responses_json）解码成前端友好的对象/数组形式。
// 模型底层仍是 JSON 字符串（GORM schema 兼容），但 API 契约层面保持干净的 JSON 结构。
type apiResponseItem struct {
	ID              string                 `json:"id"`
	ContractID      string                 `json:"contract_id"`
	Path            string                 `json:"path"`
	Method          string                 `json:"method"`
	Summary         string                 `json:"summary"`
	Description     string                 `json:"description"`
	Tags            []string               `json:"tags"`
	Parameters      []interface{}           `json:"parameters"`
	RequestBody     map[string]interface{} `json:"request_body"`
	Responses       map[string]interface{} `json:"responses"`
	Deprecated      bool                   `json:"deprecated"`
	CreatedAt       time.Time              `json:"created_at"`
	UpdatedAt       time.Time              `json:"updated_at"`
}

func toAPIResponse(a models.APIEndpoint) apiResponseItem {
	return apiResponseItem{
		ID:          a.ID,
		ContractID:  a.ContractID,
		Path:        a.Path,
		Method:      a.Method,
		Summary:     a.Summary,
		Description: a.Description,
		Tags:        decodeStringSlice(a.Tags),
		Parameters:  decodeAnySlice(a.ParametersJSON),
		RequestBody: decodeAnyMap(a.RequestBodyJSON),
		Responses:   decodeAnyMap(a.ResponsesJSON),
		Deprecated:  a.Deprecated,
		CreatedAt:   a.CreatedAt,
		UpdatedAt:   a.UpdatedAt,
	}
}

func decodeStringSlice(raw string) []string {
	if raw == "" {
		return []string{}
	}
	var out []string
	if err := json.Unmarshal([]byte(raw), &out); err != nil {
		return []string{}
	}
	return out
}

func decodeAnySlice(raw string) []interface{} {
	if raw == "" {
		return nil
	}
	var out []interface{}
	if err := json.Unmarshal([]byte(raw), &out); err != nil {
		return nil
	}
	return out
}

func decodeAnyMap(raw string) map[string]interface{} {
	if raw == "" {
		return nil
	}
	var out map[string]interface{}
	if err := json.Unmarshal([]byte(raw), &out); err != nil {
		return nil
	}
	return out
}

func listContractAPIs(c *gin.Context) {
	contractID := c.Param("id")
	userID := c.GetString("user_id")
	if _, _, err := services.GetContractForUser(database.DB, contractID, userID); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"detail": "Contract not found"})
		return
	}
	keyword := c.Query("keyword")
	method := c.Query("method")
	tag := c.Query("tag")
	includeDeprecated := c.Query("include_deprecated") == "true"
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "200"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))

	apis, total, err := services.ListContractAPIs(database.DB, contractID, keyword, method, tag, includeDeprecated, offset, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"detail": err.Error()})
		return
	}
	items := make([]apiResponseItem, 0, len(apis))
	for _, a := range apis {
		items = append(items, toAPIResponse(a))
	}
	c.JSON(http.StatusOK, gin.H{"total": total, "items": items})
}

func createContractAPI(c *gin.Context) {
	contractID, ok := requireContractEditor(c)
	if !ok {
		return
	}
	var req struct {
		Path            string                 `json:"path" binding:"required"`
		Method          string                 `json:"method" binding:"required"`
		Summary         string                 `json:"summary"`
		Description     string                 `json:"description"`
		Tags            []string               `json:"tags"`
		Parameters      []map[string]interface{} `json:"parameters"`
		RequestBody     map[string]interface{} `json:"request_body"`
		Responses       map[string]interface{} `json:"responses"`
		Deprecated      bool                   `json:"deprecated"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
		return
	}
	api, err := services.CreateContractAPIFromInput(database.DB, contractID, req)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, toAPIResponse(*api))
}

func getContractAPI(c *gin.Context) {
	contractID := c.Param("id")
	apiID := c.Param("apiId")
	userID := c.GetString("user_id")
	if _, _, err := services.GetContractForUser(database.DB, contractID, userID); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"detail": "Contract not found"})
		return
	}
	api, err := services.GetContractAPI(database.DB, contractID, apiID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"detail": "API not found"})
		return
	}
	c.JSON(http.StatusOK, toAPIResponse(*api))
}

func updateContractAPI(c *gin.Context) {
	contractID, ok := requireContractEditor(c)
	if !ok {
		return
	}
	apiID := c.Param("apiId")
	var req map[string]interface{}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
		return
	}
	api, err := services.UpdateContractAPI(database.DB, contractID, apiID, req)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
		return
	}
	c.JSON(http.StatusOK, toAPIResponse(*api))
}

func deleteContractAPI(c *gin.Context) {
	contractID, ok := requireContractEditor(c)
	if !ok {
		return
	}
	apiID := c.Param("apiId")
	if err := services.DeleteContractAPI(database.DB, contractID, apiID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
		return
	}
	c.Status(http.StatusNoContent)
}

func getContractAPIDependencies(c *gin.Context) {
	contractID := c.Param("id")
	apiID := c.Param("apiId")
	userID := c.GetString("user_id")
	if _, _, err := services.GetContractForUser(database.DB, contractID, userID); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"detail": "Contract not found"})
		return
	}
	deps, err := services.GetAPIDependencies(database.DB, contractID, apiID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
		return
	}
	c.JSON(http.StatusOK, deps)
}