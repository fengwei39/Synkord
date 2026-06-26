package api

import (
	"github.com/gin-gonic/gin"
	"github.com/synkord/core/config"
	"github.com/synkord/core/database"
	"github.com/synkord/core/middleware"
	"github.com/synkord/core/models"
	"github.com/synkord/core/services"
)

func RegisterAuthRoutes(r *gin.RouterGroup, cfg *config.Config) {
	auth := r.Group("/auth")
	{
		auth.POST("/login", func(c *gin.Context) {
			var req struct {
				Username string `json:"username" binding:"required"`
				Password string `json:"password" binding:"required"`
			}
			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(400, gin.H{"detail": err.Error()})
				return
			}
			user, err := services.AuthenticateUser(database.DB, req.Username, req.Password)
			if err != nil {
				c.JSON(401, gin.H{"detail": "Invalid credentials"})
				return
			}
			token, err := services.GenerateToken(cfg, user)
			if err != nil {
				c.JSON(500, gin.H{"detail": "Failed to generate token"})
				return
			}
			c.JSON(200, gin.H{
				"access_token": token,
				"token_type":   "bearer",
				"id":           user.ID,
				"username":     user.Username,
				"role":         user.Role,
			})
		})

		auth.POST("/register", middleware.RequireAdmin(), func(c *gin.Context) {
			var req struct {
				Username string `json:"username" binding:"required"`
				Email    string `json:"email"`
				Password string `json:"password" binding:"required,min=6"`
				Role     string `json:"role"`
			}
			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(400, gin.H{"detail": err.Error()})
				return
			}
			if req.Role == "" {
				req.Role = "viewer"
			}
			user, err := services.CreateUserWithEmail(database.DB, req.Username, req.Email, req.Password, req.Role)
			if err != nil {
				c.JSON(400, gin.H{"detail": err.Error()})
				return
			}
			c.JSON(201, user)
		})

		auth.GET("/me", func(c *gin.Context) {
			userID, _ := c.Get("user_id")
			if userID == nil {
				c.JSON(401, gin.H{"detail": "Not authenticated"})
				return
			}
			var user models.User
			if err := database.DB.First(&user, "id = ?", userID).Error; err != nil {
				c.JSON(404, gin.H{"detail": "User not found"})
				return
			}
			c.JSON(200, user)
		})

		auth.GET("/users", middleware.RequireAdmin(), func(c *gin.Context) {
			users, err := services.ListUsers(database.DB)
			if err != nil {
				c.JSON(500, gin.H{"detail": err.Error()})
				return
			}
			c.JSON(200, users)
		})

		auth.PUT("/users/:id/role", middleware.RequireAdmin(), func(c *gin.Context) {
			userID := c.Param("id")
			var req struct {
				Role string `json:"role" binding:"required"`
			}
			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(400, gin.H{"detail": err.Error()})
				return
			}
			user, err := services.UpdateUserRole(database.DB, userID, req.Role)
			if err != nil {
				c.JSON(404, gin.H{"detail": "User not found"})
				return
			}
			c.JSON(200, user)
		})
	}
}
