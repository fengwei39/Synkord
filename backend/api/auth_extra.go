// Synkord Auth 扩展
// 详见 docs/requirements.md §四.1

package api

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/synkord/core/config"
	"github.com/synkord/core/database"
	"github.com/synkord/core/models"
	"github.com/synkord/core/middleware"
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
			// 服务端无状态 token，登出仅前端清缓存
			c.JSON(http.StatusOK, gin.H{"ok": true})
		})
		auth.POST("/refresh", refreshTokenHandler(cfg))
		auth.GET("/me", meHandler())

		// admin：用户管理（从老 RegisterAuthRoutes 恢复，避免 v1.2 失落）
		auth.POST("/users", middleware.RequireAdmin(), createUserHandler())
		auth.GET("/users", middleware.RequireAdmin(), listUsersHandler())
		auth.PUT("/users/:id/role", middleware.RequireAdmin(), updateUserRoleHandler())
		auth.POST("/change-password", changePasswordHandler())
	}
}

func createUserHandler() gin.HandlerFunc {
	return func(c *gin.Context) {
		var req struct {
			Username string `json:"username" binding:"required,min=2,max=64"`
			Email    string `json:"email"`
			Password string `json:"password" binding:"required,min=6"`
			Role     string `json:"role"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
			return
		}
		if req.Role == "" {
			req.Role = string(models.RoleViewer)
		}
		u, err := services.CreateUserWithEmail(database.DB, req.Username, req.Email, req.Password, req.Role)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
			return
		}
		c.JSON(http.StatusCreated, u)
	}
}

func listUsersHandler() gin.HandlerFunc {
	return func(c *gin.Context) {
		users, err := services.ListUsers(database.DB)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"detail": err.Error()})
			return
		}
		c.JSON(http.StatusOK, users)
	}
}

func updateUserRoleHandler() gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.Param("id")
		var req struct {
			Role string `json:"role" binding:"required"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
			return
		}
		u, err := services.UpdateUserRole(database.DB, userID, req.Role)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"detail": "user not found"})
			return
		}
		c.JSON(http.StatusOK, u)
	}
}

// changePasswordHandler 修改当前用户密码（v1.2：自助改密）
func changePasswordHandler() gin.HandlerFunc {
	return func(c *gin.Context) {
		userID, ok := c.Get("user_id")
		if !ok {
			c.JSON(http.StatusUnauthorized, gin.H{"detail": "unauthenticated"})
			return
		}
		var req struct {
			OldPassword string `json:"old_password" binding:"required"`
			NewPassword string `json:"new_password" binding:"required,min=6"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
			return
		}
		if err := services.ChangeOwnPassword(database.DB, userID.(string), req.OldPassword, req.NewPassword); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"ok": true})
	}
}