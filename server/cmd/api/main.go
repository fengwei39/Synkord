package main

import (
	"fmt"
	"log"

	"synkord/server/internal/config"
	"synkord/server/internal/db"
	"synkord/server/internal/router"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("load config: %v", err)
	}

	database, err := db.Connect(cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("connect database: %v", err)
	}
	defer database.Close()

	r := router.New(database)

	addr := fmt.Sprintf(":%s", cfg.AppPort)
	log.Printf("server listening on %s", addr)
	if err := r.Run(addr); err != nil {
		log.Fatalf("run server: %v", err)
	}
}
