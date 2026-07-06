// Synkord Contract APIs (interface definitions)
// 详见 docs/requirements.md §四.4

package api

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/synkord/core/database"
	"github.com/synkord/core/services"
)

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
	c.JSON(http.StatusOK, gin.H{"total": total, "items": apis})
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
	c.JSON(http.StatusCreated, api)
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
	c.JSON(http.StatusOK, api)
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
	c.JSON(http.StatusOK, api)
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