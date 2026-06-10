package auth

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/jmoiron/sqlx"
)

const ContextUserID = "userID"
const ContextUserEmail = "userEmail"

func Middleware(jwtSecret string) gin.HandlerFunc {
	return func(c *gin.Context) {
		header := c.GetHeader("Authorization")
		if header == "" || !strings.HasPrefix(header, "Bearer ") {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
			return
		}

		tokenStr := strings.TrimPrefix(header, "Bearer ")
		userID, err := validateToken(tokenStr, jwtSecret)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
			return
		}

		c.Set(ContextUserID, userID)
		c.Next()
	}
}

func GetUserID(c *gin.Context) string {
	id, _ := c.Get(ContextUserID)
	s, _ := id.(string)
	return s
}

// EmailMiddleware enriches the context with userEmail after auth middleware runs.
func EmailMiddleware(db *sqlx.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := GetUserID(c)
		if userID != "" {
			var email string
			_ = db.QueryRow("SELECT email FROM users WHERE id = $1", userID).Scan(&email)
			c.Set(ContextUserEmail, email)
		}
		c.Next()
	}
}
