package main

import (
	"fmt"
	"log"
	"net/http"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/mark3labs/mcp-go/server"
	"github.com/synkord/core/api"
	"github.com/synkord/core/config"
	"github.com/synkord/core/database"
	"github.com/synkord/core/mcp_server"
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
	protectedAPI := apiGroup.Group("")
	protectedAPI.Use(middleware.RequireAuthenticated())
	api.RegisterTeamRoutes(protectedAPI)
	api.RegisterTeamProjectRoutes(protectedAPI)
	api.RegisterTeamAPIRoutes(protectedAPI)
	api.RegisterTeamSwaggerSpecRoutes(protectedAPI)
	api.RegisterTeamModelRoutes(protectedAPI)
	api.RegisterTeamDependencyRoutes(protectedAPI)
	api.RegisterTeamDiffRoutes(protectedAPI)
	api.RegisterTeamNotificationRoutes(protectedAPI)
	api.RegisterTeamMCPRoutes(protectedAPI)
	api.RegisterAdminMCPRoutes(protectedAPI)
	api.RegisterProjectRoutes(protectedAPI)
	api.RegisterAPIRoutes(protectedAPI)
	api.RegisterEntityRoutes(protectedAPI)
	api.RegisterDependencyRoutes(protectedAPI)
	api.RegisterDiffRoutes(protectedAPI)

	r.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok", "service": "synkord-core"})
	})

	mcpSrv := mcp_server.CreateMCPServer(cfg)
	streamableHTTPServer := server.NewStreamableHTTPServer(mcpSrv)
	sseServer := server.NewSSEServer(mcpSrv,
		server.WithSSEEndpoint("/mcp/sse"),
		server.WithMessageEndpoint("/mcp/message"),
	)

	mux := http.NewServeMux()
	mux.Handle("/mcp", streamableHTTPServer)
	mux.Handle("/mcp/", requireMCPToken(cfg, sseServer))
	mux.Handle("/", r)

	addr := fmt.Sprintf(":%s", cfg.Port)
	log.Printf("synkord-core starting on %s (REST API + MCP Server)", addr)
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}

func requireMCPToken(cfg *config.Config, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		global, err := services.GetGlobalMCPConfig(database.DB)
		if err != nil || !global.Enabled {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusServiceUnavailable)
			_, _ = w.Write([]byte(`{"detail":"MCP server disabled"}`))
			return
		}
		token := r.URL.Query().Get("token")
		if auth := r.Header.Get("Authorization"); auth != "" {
			const prefix = "Bearer "
			if len(auth) > len(prefix) && auth[:len(prefix)] == prefix {
				token = auth[len(prefix):]
			}
		}
		if cfg.MCPToken != "" && token == cfg.MCPToken {
			next.ServeHTTP(w, r)
			return
		}
		if _, err := services.ValidateMCPAccessToken(database.DB, token); err != nil {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusUnauthorized)
			_, _ = w.Write([]byte(`{"detail":"MCP token required"}`))
			return
		}
		next.ServeHTTP(w, r)
	})
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
