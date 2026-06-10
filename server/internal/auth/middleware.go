package auth

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

const ContextUserID = "userID"

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
