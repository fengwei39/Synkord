package router

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/jmoiron/sqlx"

	"synkord/server/internal/auth"
	"synkord/server/internal/org"
)

type Config struct {
	JWTSecret string
	BaseURL   string
}

func New(db *sqlx.DB, cfg Config) *gin.Engine {
	r := gin.Default()

	r.GET("/health", func(c *gin.Context) {
		if err := db.Ping(); err != nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{
				"status": "error",
				"detail": err.Error(),
			})
			return
		}
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	api := r.Group("/api")
	authMiddleware := auth.Middleware(cfg.JWTSecret)

	// Auth routes
	authSvc := auth.NewService(db, cfg.JWTSecret)
	authHandler := auth.NewHandler(authSvc)

	authGroup := api.Group("/auth")
	{
		authGroup.POST("/register", authHandler.Register)
		authGroup.POST("/login", authHandler.Login)
		authGroup.GET("/me", authMiddleware, authHandler.Me)
		authGroup.POST("/git-email", authMiddleware, authHandler.AddGitEmail)
	}

	// Org routes (all require auth)
	orgSvc := org.NewService(db, cfg.BaseURL)
	orgHandler := org.NewHandler(orgSvc)

	orgsGroup := api.Group("/orgs", authMiddleware)
	{
		orgsGroup.POST("", orgHandler.CreateOrg)
		orgsGroup.GET("/me", orgHandler.GetMyOrgs)       // must be before /:orgId
		orgsGroup.GET("/:orgId", orgHandler.GetOrg)
		orgsGroup.POST("/:orgId/invites", orgHandler.CreateInvite)
	}

	// Invite routes (accept requires auth, get is public)
	inviteGroup := api.Group("/invites")
	{
		inviteGroup.GET("/:token", orgHandler.GetInvite)
		inviteGroup.POST("/:token/accept", authMiddleware, orgHandler.AcceptInvite)
	}

	return r
}
