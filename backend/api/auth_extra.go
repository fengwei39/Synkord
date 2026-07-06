// Synkord Auth 扩展
// 详见 docs/requirements.md §四.1

package api

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/synkord/core/config"
	"github.com/synkord/core/database"
	"github.com/synkord/core/models"
	"github.com/synkord/core/services"
)

// LoginResponse 登录响应（对齐前端期望）
type LoginResponse struct {
	AccessToken string       `json:"access_token"`
	TokenType   string       `json:"token_type"`
	ExpiresIn   int          `json:"expires_in"`
	User        models.User  `json:"user"`
}

// Auth handler 包装
func loginHandler(cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req struct {
			Username string `json:"username" binding:"required"`
			Password string `json:"password" binding:"required"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
			return
		}
		user, err := services.AuthenticateUser(database.DB, req.Username, req.Password)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"detail": "Invalid credentials"})
			return
		}
		token, err := services.GenerateToken(cfg, user)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"detail": "Failed to generate token"})
			return
		}
		c.JSON(http.StatusOK, LoginResponse{
			AccessToken: token,
			TokenType:   "bearer",
			ExpiresIn:   8 * 3600,
			User:        *user,
		})
	}
}

func refreshTokenHandler(cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req struct {
			RefreshToken string `json:"refresh_token" binding:"required"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
			return
		}
		// MVP: 直接用 refresh_token 签发新 access_token
		// 生产环境应该：refresh_token 是单独签发的 token，存储于服务端
		claims, err := services.ParseToken(cfg, req.RefreshToken)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"detail": "Invalid refresh token"})
			return
		}
		var user models.User
		if err := database.DB.First(&user, "id = ?", claims.UserID).Error; err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"detail": "User not found"})
			return
		}
		token, err := services.GenerateToken(cfg, &user)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"detail": "Failed to generate token"})
			return
		}
		c.JSON(http.StatusOK, gin.H{
			"access_token": token,
			"token_type":   "bearer",
			"expires_in":   8 * 3600,
		})
	}
}

func meHandler() gin.HandlerFunc {
	return func(c *gin.Context) {
		userID, _ := c.Get("user_id")
		if userID == nil {
			c.JSON(http.StatusUnauthorized, gin.H{"detail": "Not authenticated"})
			return
		}
		var user models.User
		if err := database.DB.First(&user, "id = ?", userID).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"detail": "User not found"})
			return
		}
		c.JSON(http.StatusOK, user)
	}
}

// 重新注册认证路由（更完整的版本）
func RegisterAuthRoutesV2(r *gin.RouterGroup, cfg *config.Config) {
	auth := r.Group("/auth")
	{
		auth.POST("/login", loginHandler(cfg))
		auth.POST("/logout", func(c *gin.Context) {
			c.JSON(http.StatusOK, gin.H{"ok": true})
		})
		auth.POST("/refresh", refreshTokenHandler(cfg))
		auth.GET("/me", meHandler())
	}
}

// trim util
func _trim(s string) string {
	return strings.TrimSpace(s)
}

var _ = _trim
var _ = http.StatusOK