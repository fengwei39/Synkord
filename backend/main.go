package main

import (
	"fmt"
	"log"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/synkord/core/api"
	"github.com/synkord/core/config"
	"github.com/synkord/core/database"
	"github.com/synkord/core/middleware"
	"github.com/synkord/core/models"
	"github.com/synkord/core/services"
)

func main() {
	cfg := config.Load()

	if err := database.Init(cfg); err != nil {
		log.Fatalf("Failed to init database: %v", err)
	}

	createDefaultAdmin()

	gin.SetMode(gin.ReleaseMode)
	r := gin.Default()
	r.Use(cors.New(cors.Config{
		AllowOrigins:     []string{"*"},
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Authorization"},
		AllowCredentials: true,
	}))
	r.Use(middleware.AuthMiddleware(cfg))

	apiGroup := r.Group("/api")
	api.RegisterAuthRoutes(apiGroup, cfg)
	api.RegisterLocalMCPRoutes(apiGroup)
	protectedAPI := apiGroup.Group("")
	protectedAPI.Use(middleware.RequireAuthenticated())
	api.RegisterTeamRoutes(protectedAPI)
	api.RegisterTeamProjectRoutes(protectedAPI)
	api.RegisterTeamAPIRoutes(protectedAPI)
	api.RegisterTeamSwaggerSpecRoutes(protectedAPI)
	api.RegisterTeamModelRoutes(protectedAPI)
	api.RegisterTeamDependencyRoutes(protectedAPI)
	api.RegisterProjectMCPRoutes(protectedAPI)
	api.RegisterProjectRoutes(protectedAPI)

	r.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok", "service": "synkord-core"})
	})

	addr := fmt.Sprintf(":%s", cfg.Port)
	log.Printf("synkord-core starting on %s (REST API)", addr)
	if err := r.Run(addr); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}

func createDefaultAdmin() {
	var count int64
	database.DB.Model(&models.User{}).Count(&count)
	if count == 0 {
		hash, _ := services.HashPassword("admin123")
		admin := &models.User{
			Username:       "admin",
			HashedPassword: hash,
			Role:           models.RoleAdmin,
			IsActive:       true,
		}
		database.DB.Create(admin)
		log.Println("Default admin user created: admin / admin123")
	}
}
