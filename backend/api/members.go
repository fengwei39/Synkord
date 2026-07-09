// Synkord Contract Members API
// 详见 docs/requirements.md §四.3

package api

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/synkord/core/database"
	"github.com/synkord/core/models"
	"github.com/synkord/core/services"
)

func listMembers(c *gin.Context) {
	contractID := c.Param("id")
	userID := c.GetString("user_id")
	if _, _, err := services.GetContractForUser(database.DB, contractID, userID); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"detail": "Contract not found"})
		return
	}
	members, err := services.ListContractMembers(database.DB, contractID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"detail": err.Error()})
		return
	}
	c.JSON(http.StatusOK, members)
}

func addMember(c *gin.Context) {
	var req struct {
		UserID   string                 `json:"user_id"`
		Username string                 `json:"username"`
		Role     models.ContractSetRole `json:"role" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
		return
	}
	targetUserID := req.UserID
	if targetUserID == "" && req.Username != "" {
		var user models.User
		if err := database.DB.Where("username = ?", req.Username).First(&user).Error; err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"detail": "target user not found"})
			return
		}
		targetUserID = user.ID
	}
	if targetUserID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "user_id or username is required"})
		return
	}
	contractID := c.Param("id")
	actingUserID := c.GetString("user_id")
	member, err := services.AddContractMember(database.DB, contractID, actingUserID, targetUserID, req.Role)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, member)
}

func updateMember(c *gin.Context) {
	var req struct {
		Role models.ContractSetRole `json:"role" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
		return
	}
	contractID := c.Param("id")
	targetUserID := c.Param("userId")
	actingUserID := c.GetString("user_id")
	member, err := services.UpdateContractMemberRole(database.DB, contractID, actingUserID, targetUserID, req.Role)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
		return
	}
	c.JSON(http.StatusOK, member)
}

func removeMember(c *gin.Context) {
	contractID := c.Param("id")
	targetUserID := c.Param("userId")
	actingUserID := c.GetString("user_id")
	if err := services.RemoveContractMember(database.DB, contractID, actingUserID, targetUserID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
		return
	}
	c.Status(http.StatusNoContent)
}
