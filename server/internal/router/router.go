package router

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/jmoiron/sqlx"

	"synkord/server/internal/auth"
)

type Config struct {
	JWTSecret string
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

	// Auth routes
	authSvc := auth.NewService(db, cfg.JWTSecret)
	authHandler := auth.NewHandler(authSvc)
	authMiddleware := auth.Middleware(cfg.JWTSecret)

	authGroup := api.Group("/auth")
	{
		authGroup.POST("/register", authHandler.Register)
		authGroup.POST("/login", authHandler.Login)
		authGroup.GET("/me", authMiddleware, authHandler.Me)
		authGroup.POST("/git-email", authMiddleware, authHandler.AddGitEmail)
	}

	return r
}
