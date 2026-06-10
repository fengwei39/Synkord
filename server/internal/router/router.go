package router

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/jmoiron/sqlx"

	"synkord/server/internal/auth"
	"synkord/server/internal/contracts"
	"synkord/server/internal/diff"
	"synkord/server/internal/gitstore"
	"synkord/server/internal/notify"
	"synkord/server/internal/org"
)

type Config struct {
	JWTSecret   string
	BaseURL     string
	GitReposDir string
}

func corsMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		origin := c.GetHeader("Origin")
		if origin == "" {
			origin = "*"
		}
		c.Header("Access-Control-Allow-Origin", origin)
		c.Header("Access-Control-Allow-Credentials", "true")
		c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS, PATCH")
		c.Header("Access-Control-Allow-Headers", "Origin, Content-Type, Authorization, Accept")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
		c.Next()
	}
}

func New(db *sqlx.DB, cfg Config) *gin.Engine {
	r := gin.Default()
	r.Use(corsMiddleware())

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

	// Org + contracts routes (all require auth)
	gs := gitstore.New(cfg.GitReposDir)
	orgSvc := org.NewService(db, cfg.BaseURL, gs)
	orgHandler := org.NewHandler(orgSvc)

	// Notify: WebSocket hub + service + wire to contracts
	wsHub := notify.NewHub()
	notifySvc := notify.NewService(db, wsHub)
	notifyHandler := notify.NewHandler(notifySvc, wsHub)

	contractsSvc := contracts.NewService(db, gs)
	contractsSvc.SetNotifier(notify.NewContractsNotifier(notifySvc))
	contractsHandler := contracts.NewHandler(contractsSvc)
	diffHandler := diff.NewHandler(contractsSvc)

	adminMiddleware := org.AdminMiddleware(db)
	memberMiddleware := org.MemberMiddleware(db)
	emailMiddleware := auth.EmailMiddleware(db)

	orgsGroup := api.Group("/orgs", authMiddleware, emailMiddleware)
	{
		orgsGroup.POST("", orgHandler.CreateOrg)
		orgsGroup.GET("/me", orgHandler.GetMyOrgs) // must be before /:orgId

		orgItem := orgsGroup.Group("/:orgId")
		{
			orgItem.GET("", orgHandler.GetOrg)
			orgItem.GET("/members", memberMiddleware, orgHandler.ListMembers)
			orgItem.POST("/invites", adminMiddleware, orgHandler.CreateInvite)
			orgItem.DELETE("/members/:userId", adminMiddleware, orgHandler.RemoveMember)
			orgItem.PUT("/members/:userId/role", adminMiddleware, orgHandler.UpdateMemberRole)

			// Contract packs
			packsGroup := orgItem.Group("/packs", memberMiddleware)
			{
				packsGroup.GET("", contractsHandler.ListPacks)
				packsGroup.POST("", contractsHandler.CreatePack)
				packItem := packsGroup.Group("/:pack")
				{
					packItem.GET("", contractsHandler.GetPack)
					packItem.PUT("", contractsHandler.UpdatePack)
					packItem.DELETE("", adminMiddleware, contractsHandler.DeletePack)
					packItem.GET("/versions", contractsHandler.ListVersions)
					packItem.GET("/versions/:version", contractsHandler.GetVersion)
				packItem.GET("/diff", diffHandler.GetDiff)
					packItem.POST("/subscribe", notifyHandler.Subscribe)
					packItem.DELETE("/subscribe", notifyHandler.Unsubscribe)
				}
			}
		}
	}

	// Notifications REST
	notifGroup := api.Group("/notifications", authMiddleware)
	{
		notifGroup.GET("", notifyHandler.ListNotifications)
		notifGroup.PUT("/:id/read", notifyHandler.MarkRead)
	}

	// WebSocket: token passed as ?token= query param, validated via auth middleware
	wsAuthMiddleware := auth.WsTokenMiddleware(cfg.JWTSecret)
	r.GET("/ws", wsAuthMiddleware, notifyHandler.ServeWS)

	// Invite routes (accept requires auth, get is public)
	inviteGroup := api.Group("/invites")
	{
		inviteGroup.GET("/:token", orgHandler.GetInvite)
		inviteGroup.POST("/:token/accept", authMiddleware, orgHandler.AcceptInvite)
	}

	return r
}
