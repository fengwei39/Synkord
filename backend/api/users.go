// Synkord Users API
// 详见 docs/requirements.md §四.8

package api

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/synkord/core/database"
	"github.com/synkord/core/models"
	"github.com/synkord/core/services"
)

func RegisterUserRoutes(r *gin.RouterGroup) {
	r.GET("/users/search", searchUsers)
}

func searchUsers(c *gin.Context) {
	query := c.Query("q")
	contractID := c.Query("contract_id") // 可选：排除已是成员的

	if contractID != "" {
		users, err := services.SearchUsersForInvite(database.DB, contractID, query, 20)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"detail": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"items": users})
		return
	}

	// 全局搜索（无 contract_id）
	users := []models.User{}
	if query != "" {
		database.DB.Where("username LIKE ?", "%"+query+"%").Limit(20).Find(&users)
	}
	c.JSON(http.StatusOK, gin.H{"items": users})
}