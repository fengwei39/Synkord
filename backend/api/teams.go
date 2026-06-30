package api

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/synkord/core/database"
	"github.com/synkord/core/models"
	"github.com/synkord/core/services"
)

func RegisterTeamRoutes(r *gin.RouterGroup) {
	teams := r.Group("/teams")
	{
		teams.GET("", func(c *gin.Context) {
			userID := c.GetString("user_id")
			items, err := services.ListUserTeams(database.DB, userID)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"detail": err.Error()})
				return
			}
			c.JSON(http.StatusOK, gin.H{"items": items, "total": len(items)})
		})

		teams.POST("", func(c *gin.Context) {
			var req struct {
				Name        string `json:"name" binding:"required,min=2,max=64"`
				Description string `json:"description"`
			}
			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
				return
			}
			team, err := services.CreateTeam(database.DB, c.GetString("user_id"), req.Name, req.Description)
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
				return
			}
			c.JSON(http.StatusCreated, team)
		})

		teams.GET("/:team_id", func(c *gin.Context) {
			team, err := services.GetTeamForUser(database.DB, c.Param("team_id"), c.GetString("user_id"))
			if err != nil {
				c.JSON(http.StatusNotFound, gin.H{"detail": "Team not found"})
				return
			}
			c.JSON(http.StatusOK, team)
		})

		teams.PATCH("/:team_id", func(c *gin.Context) {
			var req struct {
				Name        string `json:"name" binding:"omitempty,min=2,max=64"`
				Description string `json:"description"`
			}
			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
				return
			}
			team, err := services.UpdateTeam(database.DB, c.Param("team_id"), c.GetString("user_id"), req.Name, req.Description)
			if err != nil {
				if err.Error() == "insufficient team permissions" {
					c.JSON(http.StatusForbidden, gin.H{"detail": "Insufficient team permissions"})
					return
				}
				c.JSON(http.StatusNotFound, gin.H{"detail": "Team not found"})
				return
			}
			c.JSON(http.StatusOK, team)
		})

		teams.GET("/:team_id/members", func(c *gin.Context) {
			if _, err := services.GetTeamForUser(database.DB, c.Param("team_id"), c.GetString("user_id")); err != nil {
				c.JSON(http.StatusNotFound, gin.H{"detail": "Team not found"})
				return
			}
			members, err := services.ListTeamMembers(database.DB, c.Param("team_id"))
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"detail": err.Error()})
				return
			}
			c.JSON(http.StatusOK, gin.H{"items": members, "total": len(members)})
		})

		teams.POST("/:team_id/members", func(c *gin.Context) {
			teamID := c.Param("team_id")
			if !requireTeamAdmin(c, teamID) {
				return
			}
			var req struct {
				Username string                  `json:"username" binding:"required,min=2,max=64"`
				Email    string                  `json:"email" binding:"omitempty,email"`
				Password string                  `json:"password" binding:"required,min=8"`
				Role     models.TeamRole         `json:"role" binding:"required"`
				Status   models.TeamMemberStatus `json:"status"`
				Remark   string                  `json:"remark"`
			}
			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
				return
			}
			member, err := services.CreateTeamMember(database.DB, teamID, services.TeamMemberInput{
				Username: req.Username,
				Email:    req.Email,
				Password: req.Password,
				Role:     req.Role,
				Status:   req.Status,
				Remark:   req.Remark,
			})
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
				return
			}
			c.JSON(http.StatusCreated, member)
		})

		teams.PATCH("/:team_id/members/:member_id", func(c *gin.Context) {
			teamID := c.Param("team_id")
			if !requireTeamAdmin(c, teamID) {
				return
			}
			var req struct {
				Username string                  `json:"username" binding:"omitempty,min=2,max=64"`
				Email    string                  `json:"email" binding:"omitempty,email"`
				Role     models.TeamRole         `json:"role"`
				Status   models.TeamMemberStatus `json:"status"`
				Remark   string                  `json:"remark"`
			}
			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
				return
			}
			member, err := services.UpdateTeamMember(database.DB, teamID, c.Param("member_id"), services.TeamMemberInput{
				Username: req.Username,
				Email:    req.Email,
				Role:     req.Role,
				Status:   req.Status,
				Remark:   req.Remark,
			})
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
				return
			}
			c.JSON(http.StatusOK, member)
		})

		teams.DELETE("/:team_id/members/:member_id", func(c *gin.Context) {
			teamID := c.Param("team_id")
			if !requireTeamAdmin(c, teamID) {
				return
			}
			if err := services.DeleteTeamMembers(database.DB, teamID, []string{c.Param("member_id")}); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
				return
			}
			c.Status(http.StatusNoContent)
		})

		teams.DELETE("/:team_id/members", func(c *gin.Context) {
			teamID := c.Param("team_id")
			if !requireTeamAdmin(c, teamID) {
				return
			}
			var req struct {
				IDs []string `json:"ids" binding:"required,min=1"`
			}
			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
				return
			}
			if err := services.DeleteTeamMembers(database.DB, teamID, req.IDs); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
				return
			}
			c.Status(http.StatusNoContent)
		})

	}
}
