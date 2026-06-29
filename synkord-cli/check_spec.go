package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"strings"
)

// runCheckSpec implements `synkord check-spec`.
//
// CI 通用：检查新 spec 与项目当前最新版本之间的破坏性变更。
// 命中 breaking 时退出码非零，CI 据此可以 fail pipeline。
//
// 实现（修 P0 review 问题 1）：
//  1. 先 GET /swagger-specs 拉取项目最新一条 spec
//  2. 拿到 old_spec_content 后才 POST /diff/check（API 强制要求 old_spec 必填）
//  3. 若项目尚无 baseline，返回友好错误提示用户先 push-spec
func runCheckSpec(args []string) error {
	fs := flag.NewFlagSet("check-spec", flag.ContinueOnError)
	server := fs.String("server", "", "synkord-core base URL")
	token := fs.String("token", "", "JWT")
	team := fs.String("team", "", "team ID (required)")
	project := fs.String("project", "", "project ID (required)")
	specPath := fs.String("spec", "", "path to new spec file (required)")
	_ = fs.String("format", "openapi", "openapi|swagger|postman (reserved, not yet used)")

	if err := fs.Parse(args); err != nil {
		return err
	}

	cfg := mergeConfig(*server, *token, *team, *project, "", "", "", "")
	if cfg.Team == "" || cfg.Project == "" || *specPath == "" {
		return fmt.Errorf("--team, --project, --spec are required")
	}

	specBytes, err := os.ReadFile(*specPath)
	if err != nil {
		return fmt.Errorf("read spec file: %w", err)
	}

	c := newClient()

	// Step 1: 拉取项目最新 spec 作为 old_spec。
	latest, err := c.fetchLatestSpec(cfg.Server, cfg.Token, cfg.Team, cfg.Project)
	if err != nil {
		return fmt.Errorf("fetch latest spec: %w", err)
	}
	if latest == nil {
		return fmt.Errorf("no baseline spec for project %s; run `synkord push-spec` first to establish one", cfg.Project)
	}

	// Step 2: POST /diff/check，必须同时带 old_spec 和 new_spec。
	endpoint, err := resolveServerURL(cfg.Server,
		"/api/teams/"+cfg.Team+"/diff/check")
	if err != nil {
		return err
	}

	payload := map[string]any{
		"service_name": latest.Name,
		"project_id":   cfg.Project,
		"old_spec":     latest.SpecContent,
		"new_spec":     string(specBytes),
		"old_version":  latest.Version,
	}

	status, body, err := c.do("POST", endpoint, cfg.Token, payload)
	if err != nil {
		return err
	}
	if status < 200 || status >= 300 {
		return formatHTTPError(status, body)
	}

	var resp struct {
		Severity         string   `json:"severity"`
		IsBreaking       bool     `json:"is_breaking"`
		Changes          []any    `json:"changes"`
		AffectedProjects []string `json:"affected_projects"`
	}
	if err := json.Unmarshal(body, &resp); err != nil {
		return fmt.Errorf("decode response: %w", err)
	}

	fmt.Printf("compared: %s v%s (baseline) → %s (new)\n", latest.Name, latest.Version, *specPath)
	fmt.Printf("severity=%s breaking=%v changes=%d affected=%d\n",
		resp.Severity, resp.IsBreaking, len(resp.Changes), len(resp.AffectedProjects))

	if resp.IsBreaking {
		return fmt.Errorf("breaking changes detected")
	}
	return nil
}

// runLogin 登录并把 JWT 写入 ~/.synkord/token。
//
// 这是 CLI 唯一的非 token 命令。其他命令靠 --token / env / cache 工作。
func runLogin(args []string) error {
	fs := flag.NewFlagSet("login", flag.ContinueOnError)
	server := fs.String("server", "", "synkord-core base URL")
	username := fs.String("username", "", "username (env: SYNKOORD_USERNAME)")
	password := fs.String("password", "", "password (env: SYNKOORD_PASSWORD)")

	if err := fs.Parse(args); err != nil {
		return err
	}

	cfg := &Config{
		Server:   *server,
		Username: *username,
		Password: *password,
	}
	if cfg.Server == "" {
		cfg.Server = envOr("SYNKORD_SERVER", "http://127.0.0.1:8000")
	}
	if cfg.Username == "" {
		cfg.Username = os.Getenv("SYNKOORD_USERNAME")
	}
	if cfg.Password == "" {
		cfg.Password = os.Getenv("SYNKOORD_PASSWORD")
	}
	if cfg.Username == "" || cfg.Password == "" {
		return fmt.Errorf("--username and --password are required")
	}

	c := newClient()
	endpoint, err := resolveServerURL(cfg.Server, "/api/auth/login")
	if err != nil {
		return err
	}

	status, body, err := c.do("POST", endpoint, "", map[string]string{
		"username": cfg.Username,
		"password": cfg.Password,
	})
	if err != nil {
		return err
	}
	if status < 200 || status >= 300 {
		return formatHTTPError(status, body)
	}

	var resp struct {
		Token     string `json:"access_token"`
		TokenType string `json:"token_type"`
	}
	if err := decodeJSON(body, &resp); err != nil {
		return err
	}
	if resp.Token == "" {
		return fmt.Errorf("login response missing access_token: %s", string(body))
	}

	if err := writeCachedToken(resp.Token); err != nil {
		return fmt.Errorf("cache token: %w", err)
	}

	fmt.Println("✅ logged in; token cached at ~/.synkord/token")
	_ = strings.TrimSpace(resp.TokenType)
	return nil
}
