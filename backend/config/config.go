package config

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"os"
	"strconv"
)

// Config 后端运行配置
type Config struct {
	Port      string
	DBPath    string
	JWTSecret string
	// MCP 相关（与 Electron Connect 对齐，默认 37991）
	MCPPort  int
	MCPPath  string
	// CORS 白名单（逗号分隔，"*" 表示开放）
	CORSOrigins []string
}

// Load 读取环境变量并校验
func Load() *Config {
	cfg := &Config{
		Port:        getEnv("SYNKORD_PORT", "8000"),
		DBPath:      getEnv("SYNKORD_DB_PATH", "data/synkord.db"),
		JWTSecret:   getEnv("SYNKORD_JWT_SECRET", "change-me-in-production"),
		MCPPort:     getEnvInt("SYNKORD_MCP_PORT", 37991),
		MCPPath:     getEnv("SYNKORD_MCP_PATH", "/mcp"),
		CORSOrigins: splitCSV(getEnv("SYNKORD_CORS_ORIGINS", "http://127.0.0.1:3000,http://localhost:3000")),
	}
	cfg.validate()
	return cfg
}

// validate 启动时强校验：JWTSecret 强度 + MCPPort 范围
// 失败直接 panic，避免使用不安全默认值进入生产
func (c *Config) validate() {
	if c.JWTSecret == "" || c.JWTSecret == "change-me-in-production" {
		// 仅 dev 模式容错；生产强校验
		if os.Getenv("SYNKORD_ENV") == "production" {
			panic("SYNKORD_JWT_SECRET must be set in production")
		}
	}
	if len(c.JWTSecret) < 16 {
		panic(fmt.Sprintf("SYNKORD_JWT_SECRET too short (got %d, need >=16)", len(c.JWTSecret)))
	}
	if c.MCPPort <= 0 || c.MCPPort > 65535 {
		panic(fmt.Sprintf("invalid SYNKORD_MCP_PORT: %d", c.MCPPort))
	}
}

// IsProductionEnvironment 检查是否生产部署（启动器使用，决定是否启用开发容错）
func IsProductionEnvironment() bool {
	return os.Getenv("SYNKORD_ENV") == "production"
}

// GenerateDevSecret 在开发模式下生成随机 secret
func GenerateDevSecret() string {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "change-me-in-production"
	}
	return hex.EncodeToString(b)
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func getEnvInt(key string, fallback int) int {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return fallback
}

func splitCSV(s string) []string {
	out := []string{}
	cur := ""
	for _, ch := range s {
		if ch == ',' {
			if cur != "" {
				out = append(out, cur)
			}
			cur = ""
			continue
		}
		if ch == ' ' || ch == '\t' {
			continue
		}
		cur += string(ch)
	}
	if cur != "" {
		out = append(out, cur)
	}
	return out
}
