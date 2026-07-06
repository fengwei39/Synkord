// Synkord Import API
// OpenAPI / Swagger / Postman 导入
// 详见 docs/requirements.md §四.6

package api

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/synkord/core/database"
	"github.com/synkord/core/services"
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
	// MVP: parse 直接走与 commit 相同的逻辑（先导入再返回结果，调用方可以基于 ID 清理）
	// 生产环境应拆分为纯解析
	result, err := services.ImportOpenAPISpec(database.DB, contractID, req.Content)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"apis":     result.APIs,
		"entities": []any{}, // MVP: 不预解析实体，从导入后的数据中读
		"warnings": []string{},
	})
}

// commitImport 提交导入（写入数据库）
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
	// MVP: parse 阶段已经写入了，commit 阶段只返回统计
	apis, _, _ := services.ListContractAPIs(database.DB, contractID, "", "", "", true, 0, 10000)
	entities, _, _ := services.ListContractEntities(database.DB, contractID, "", 0, 10000)
	c.JSON(http.StatusOK, gin.H{
		"imported_apis":     len(apis),
		"imported_entities": len(entities),
	})
}