// Synkord Contracts API
// 契约集 CRUD
// 详见 docs/requirements.md §四.2

package api

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/synkord/core/database"
	"github.com/synkord/core/models"
	"github.com/synkord/core/services"
)

func RegisterContractRoutes(r *gin.RouterGroup) {
	c := r.Group("/contracts")
	{
		c.GET("", listContracts)
		c.POST("", createContract)
		c.GET("/:id", getContract)
		c.PATCH("/:id", updateContract)
		c.DELETE("/:id", deleteContract)

		// 成员管理
		c.GET("/:id/members", listMembers)
		c.POST("/:id/members", addMember)
		c.PATCH("/:id/members/:userId", updateMember)
		c.DELETE("/:id/members/:userId", removeMember)

		// 接口定义
		c.GET("/:id/apis", listContractAPIs)
		c.POST("/:id/apis", createContractAPI)
		c.GET("/:id/apis/:apiId", getContractAPI)
		c.PATCH("/:id/apis/:apiId", updateContractAPI)
		c.DELETE("/:id/apis/:apiId", deleteContractAPI)
		c.GET("/:id/apis/:apiId/dependencies", getContractAPIDependencies)

		// 数据模型
		c.GET("/:id/entities", listContractEntities)
		c.POST("/:id/entities", createContractEntity)
		c.GET("/:id/entities/:entityId", getContractEntity)
		c.PATCH("/:id/entities/:entityId", updateContractEntity)
		c.DELETE("/:id/entities/:entityId", deleteContractEntity)
		c.GET("/:id/entities/:entityId/dependencies", getContractEntityDependencies)
		c.GET("/:id/entities/:entityId/versions", listContractEntityVersions)

		// 导入
		c.POST("/:id/import/parse", parseImport)
		c.POST("/:id/import/commit", commitImport)

		// 依赖图
		c.GET("/:id/dependencies/graph", getContractDependencyGraph)

		// 跨契约集搜索
		c.GET("/_search/apis", searchAPIsAcrossContracts)
		c.GET("/_search/entities", searchEntitiesAcrossContracts)
	}
}

// ============================================================================
// Contract CRUD
// ============================================================================

func listContracts(c *gin.Context) {
	userID := c.GetString("user_id")
	keyword := c.Query("keyword")
	includeArchived := c.Query("include_archived") == "true"

	contracts, err := services.ListUserContractsWithCounts(database.DB, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"detail": err.Error()})
		return
	}

	filtered := make([]services.ContractWithCounts, 0, len(contracts))
	for _, ct := range contracts {
		if keyword != "" && !contains(ct.Name, keyword) {
			continue
		}
		if !includeArchived && ct.Archived {
			continue
		}
		filtered = append(filtered, ct)
	}

	c.JSON(http.StatusOK, gin.H{
		"total":  len(filtered),
		"items": filtered,
	})
}

func createContract(c *gin.Context) {
	var req struct {
		Name        string `json:"name" binding:"required,min=2,max=128"`
		Description string `json:"description"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
		return
	}
	userID := c.GetString("user_id")
	contract, err := services.CreateContract(database.DB, userID, req.Name, req.Description)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, contract)
}

func getContract(c *gin.Context) {
	contractID := c.Param("id")
	userID := c.GetString("user_id")
	contract, role, err := services.GetContractForUser(database.DB, contractID, userID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"detail": "Contract not found or access denied"})
		return
	}

	// 详情页也需要 3 个计数（用于"删除契约集"前置条件 + Tab 计数）
	var apiCount, entityCount, memberCount int64
	if err := database.DB.Model(&models.APIEndpoint{}).Where("contract_id = ?", contractID).Count(&apiCount).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"detail": err.Error()})
		return
	}
	if err := database.DB.Model(&models.DataModel{}).Where("contract_id = ?", contractID).Count(&entityCount).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"detail": err.Error()})
		return
	}
	if err := database.DB.Model(&models.ContractMember{}).Where("contract_id = ?", contractID).Count(&memberCount).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"detail": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"id":           contract.ID,
		"name":         contract.Name,
		"description":  contract.Description,
		"creator_id":   contract.CreatorID,
		"created_at":   contract.CreatedAt,
		"updated_at":   contract.UpdatedAt,
		"archived":     contract.Archived,
		"my_role":      role,
		"api_count":    apiCount,
		"entity_count": entityCount,
		"member_count": memberCount,
	})
}

func updateContract(c *gin.Context) {
	var req struct {
		Name        *string `json:"name"`
		Description *string `json:"description"`
		Archived    *bool   `json:"archived"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
		return
	}
	contractID := c.Param("id")
	userID := c.GetString("user_id")
	contract, err := services.UpdateContract(database.DB, contractID, userID, req.Name, req.Description, req.Archived)
	if err != nil {
		if err.Error() == "only owner can update contract" {
			c.JSON(http.StatusForbidden, gin.H{"detail": err.Error()})
			return
		}
		c.JSON(http.StatusNotFound, gin.H{"detail": err.Error()})
		return
	}
	c.JSON(http.StatusOK, contract)
}

func deleteContract(c *gin.Context) {
	contractID := c.Param("id")
	userID := c.GetString("user_id")
	if err := services.DeleteContract(database.DB, contractID, userID); err != nil {
		if err.Error() == "only owner can delete contract" {
			c.JSON(http.StatusForbidden, gin.H{"detail": err.Error()})
			return
		}
		if errors.Is(err, services.ErrContractNotEmpty) {
			c.JSON(http.StatusConflict, gin.H{"detail": err.Error()})
			return
		}
		c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
		return
	}
	c.Status(http.StatusNoContent)
}

// 共享权限校验：校验当前用户对 contractID 有访问权限
func requireContractAccess(c *gin.Context) (string, bool) {
	contractID := c.Param("id")
	userID := c.GetString("user_id")
	_, _, err := services.GetContractForUser(database.DB, contractID, userID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"detail": "Contract not found or access denied"})
		return "", false
	}
	return contractID, true
}

// 共享权限校验：校验当前用户对 contractID 有 editor 或 owner 权限
func requireContractEditor(c *gin.Context) (contractID string, ok bool) {
	contractID = c.Param("id")
	userID := c.GetString("user_id")
	_, role, err := services.GetContractForUser(database.DB, contractID, userID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"detail": "Contract not found or access denied"})
		return "", false
	}
	if role != "owner" && role != "editor" {
		c.JSON(http.StatusForbidden, gin.H{"detail": "editor or owner required"})
		return "", false
	}
	return contractID, true
}

// contains 简单子串匹配（不区分大小写）
func contains(s, sub string) bool {
	if len(sub) == 0 {
		return true
	}
	for i := 0; i+len(sub) <= len(s); i++ {
		if equalFold(s[i:i+len(sub)], sub) {
			return true
		}
	}
	return false
}

func equalFold(a, b string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := 0; i < len(a); i++ {
		ca, cb := a[i], b[i]
		if ca >= 'A' && ca <= 'Z' {
			ca += 'a' - 'A'
		}
		if cb >= 'A' && cb <= 'Z' {
			cb += 'a' - 'A'
		}
		if ca != cb {
			return false
		}
	}
	return true
}