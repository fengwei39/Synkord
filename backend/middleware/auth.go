package middleware

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/synkord/core/config"
	"github.com/synkord/core/models"
	"github.com/synkord/core/services"
)

func AuthMiddleware(cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		auth := c.GetHeader("Authorization")
		if auth == "" {
			c.Next()
			return
		}

		tokenStr := strings.TrimPrefix(auth, "Bearer ")
		claims, err := services.ParseToken(cfg, tokenStr)
		if err != nil {
			c.Next()
			return
		}

		c.Set("user_id", claims.UserID)
		c.Set("username", claims.Username)
		c.Set("role", claims.Role)
		c.Next()
	}
}

func RequireRole(roles ...models.UserRole) gin.HandlerFunc {
	return func(c *gin.Context) {
		roleStr, _ := c.Get("role")
		role, ok := roleStr.(string)
		if !ok {
			c.JSON(http.StatusUnauthorized, gin.H{"detail": "Authentication required"})
			c.Abort()
			return
		}

		for _, r := range roles {
			if string(r) == role {
				c.Next()
				return
			}
		}

		c.JSON(http.StatusForbidden, gin.H{"detail": "Insufficient permissions"})
		c.Abort()
	}
}

func RequireAuthenticated() gin.HandlerFunc {
	return func(c *gin.Context) {
		if _, ok := c.Get("user_id"); !ok {
			c.JSON(http.StatusUnauthorized, gin.H{"detail": "Authentication required"})
			c.Abort()
			return
		}
		c.Next()
	}
}

func RequireEditorOrAdmin() gin.HandlerFunc {
	return RequireRole(models.RoleAdmin, models.RoleEditor)
}

func RequireAdmin() gin.HandlerFunc {
	return RequireRole(models.RoleAdmin)
}
