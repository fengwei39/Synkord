package config

import (
	"os"
)

type Config struct {
	Port       string
	MCPPort    string
	DBPath     string
	JWTSecret  string
	MCPToken   string
	DingTalkURL string
	FeishuURL  string
}

func Load() *Config {
	return &Config{
		Port:        getEnv("SYNKORD_PORT", "8000"),
		MCPPort:     getEnv("SYNKORD_MCP_PORT", "8100"),
		DBPath:      getEnv("SYNKORD_DB_PATH", "data/synkord.db"),
		JWTSecret:   getEnv("SYNKORD_JWT_SECRET", "change-me-in-production"),
		MCPToken:    getEnv("SYNKORD_MCP_TOKEN", "change-me-mcp-token"),
		DingTalkURL: getEnv("SYNKORD_DINGTALK_WEBHOOK", ""),
		FeishuURL:   getEnv("SYNKORD_FEISHU_WEBHOOK", ""),
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
