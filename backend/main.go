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

// version 通过 -ldflags "-X main.version=vX.Y.Z" 在构建时注入（见 scripts/bump-version.sh）
// 运行时 `synkord-core --version` 也会打印
var version = "dev"

func main() {
	cfg := config.Load()

	if err := database.Init(cfg); err != nil {
		log.Fatalf("Failed to init database: %v", err)
	}

	createDefaultAdmin()

	gin.SetMode(gin.ReleaseMode)
	r := gin.Default()

	// CORS: 由环境变量 SYNKORD_CORS_ORIGINS 驱动（默认仅允许本地 dev 来源）
	// 当 SYNKORD_CORS_ORIGINS=* 时使用全局开放（仅调试时考虑）
	corsOrigins := cfg.CORSOrigins
	if len(corsOrigins) == 0 {
		corsOrigins = []string{"http://127.0.0.1:3000", "http://localhost:3000"}
	}
	allowAll := false
	for _, o := range corsOrigins {
		if o == "*" {
			allowAll = true
			break
		}
	}
	if allowAll {
		log.Println("[WARN] CORS is set to * (AllowAllOrigins). Do not use in production.")
	}
	r.Use(cors.New(cors.Config{
		AllowOrigins:     corsOrigins,
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Authorization", "X-Mcp-Instance"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: !allowAll, // 与 * 互斥，避免违反规范
		MaxAge:           12 * 3600,
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
			"version":    version,
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
	log.Printf("synkord-core v%s starting on %s (REST API)", version, addr)
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