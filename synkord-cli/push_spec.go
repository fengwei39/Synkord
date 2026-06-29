package main

import (
	"flag"
	"fmt"
	"os"
	"strings"
)

// runPushSpec implements `synkord push-spec`.
//
// 后端 CI 用：把本地 openapi.json / Postman collection 推送到 synkord-core，
// 创建新版本（按 docs/ai-development-guide.md §12.4 的规则）。
func runPushSpec(args []string) error {
	fs := flag.NewFlagSet("push-spec", flag.ContinueOnError)
	server := fs.String("server", "", "synkord-core base URL (env: SYNKOORD_SERVER)")
	token := fs.String("token", "", "JWT (env: SYNKOORD_TOKEN)")
	team := fs.String("team", "", "team ID (required)")
	project := fs.String("project", "", "project ID (required)")
	specPath := fs.String("spec", "", "path to spec file (required)")
	format := fs.String("format", "openapi", "openapi|swagger|postman")
	note := fs.String("note", "", "change summary")

	if err := fs.Parse(args); err != nil {
		return err
	}

	cfg := mergeConfig(*server, *token, *team, *project, *format, *note, "", "")
	if cfg.Team == "" || cfg.Project == "" || *specPath == "" {
		return fmt.Errorf("--team, --project, --spec are required")
	}

	specBytes, err := os.ReadFile(*specPath)
	if err != nil {
		return fmt.Errorf("read spec file: %w", err)
	}

	c := newClient()
	endpoint, err := resolveServerURL(cfg.Server,
		"/api/teams/"+cfg.Team+"/swagger-specs/import")
	if err != nil {
		return err
	}

	payload := map[string]any{
		"project_id": cfg.Project,
		"spec":       string(specBytes),
		"format":     cfg.Format,
		"note":       cfg.Note,
	}
	status, body, err := c.do("POST", endpoint, cfg.Token, payload)
	if err != nil {
		return err
	}
	if status < 200 || status >= 300 {
		return formatHTTPError(status, body)
	}

	fmt.Printf("✅ pushed spec to team=%s project=%s\n", cfg.Team, cfg.Project)
	if cfg.Note != "" {
		fmt.Printf("   note: %s\n", cfg.Note)
	}
	fmt.Println("   response:", strings.TrimSpace(string(body)))
	return nil
}
