package config

import (
	"os"
)

type Config struct {
	Port      string
	DBPath    string
	JWTSecret string
}

func Load() *Config {
	return &Config{
		Port:      getEnv("SYNKORD_PORT", "8000"),
		DBPath:    getEnv("SYNKORD_DB_PATH", "data/synkord.db"),
		JWTSecret: getEnv("SYNKORD_JWT_SECRET", "change-me-in-production"),
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
