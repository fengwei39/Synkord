package org

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/jmoiron/sqlx"

	"synkord/server/internal/auth"
)

// AdminMiddleware checks that the current user is an admin of the org
// identified by the `:orgId` route parameter.
func AdminMiddleware(db *sqlx.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		orgID := c.Param("orgId")
		userID := auth.GetUserID(c)

		var role string
		err := db.QueryRowxContext(c.Request.Context(),
			`SELECT role FROM org_members WHERE org_id = $1 AND user_id = $2`,
			orgID, userID,
		).Scan(&role)

		if err != nil || role != "admin" {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "admin permission required"})
			return
		}

		c.Next()
	}
}

// MemberMiddleware checks that the current user is a member (any role) of the org.
func MemberMiddleware(db *sqlx.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		orgID := c.Param("orgId")
		userID := auth.GetUserID(c)

		var count int
		err := db.QueryRowxContext(c.Request.Context(),
			`SELECT COUNT(*) FROM org_members WHERE org_id = $1 AND user_id = $2`,
			orgID, userID,
		).Scan(&count)

		if err != nil || count == 0 {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "not a member of this organization"})
			return
		}

		c.Next()
	}
}
