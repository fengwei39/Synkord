package main

import (
	"fmt"
	"log"
	"net/http"

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
	// 公共路由
	api.RegisterAuthRoutesV2(apiGroup, cfg)

	// 受保护路由
	protectedAPI := apiGroup.Group("")
	protectedAPI.Use(middleware.RequireAuthenticated())
	api.RegisterContractRoutes(protectedAPI)
	api.RegisterMCPRoutes(protectedAPI)
	api.RegisterUserRoutes(protectedAPI)

	// GET /health
	r.GET("/health", func(c *gin.Context) {
		dbStatus := "ok"
		dbErr := ""
		sqlDB, err := database.DB.DB()
		if err != nil || sqlDB == nil {
			dbStatus = "error"
			if err != nil {
				dbErr = err.Error()
			}
		} else if pingErr := sqlDB.PingContext(c.Request.Context()); pingErr != nil {
			dbStatus = "error"
			dbErr = pingErr.Error()
		}

		status := "ok"
		code := http.StatusOK
		if dbStatus != "ok" {
			status = "degraded"
			code = http.StatusServiceUnavailable
		}

		payload := gin.H{
			"status":     status,
			"service":    "synkord-core",
			"version":    "1.0.0",
			"components": gin.H{
				"database": dbStatus,
			},
		}
		if dbErr != "" {
			payload["components"].(gin.H)["database_error"] = dbErr
		}
		c.JSON(code, payload)
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