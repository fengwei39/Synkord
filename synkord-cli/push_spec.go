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
	server := fs.String("server", "", "synkord-core base URL (env: SYNKORD_SERVER)")
	token := fs.String("token", "", "JWT (env: SYNKORD_TOKEN)")
	contract := fs.String("contract", "", "contract ID (required)")
	team := fs.String("team", "", "deprecated; ignored")
	project := fs.String("project", "", "deprecated alias for --contract")
	specPath := fs.String("spec", "", "path to spec file (required)")
	format := fs.String("format", "openapi", "openapi|swagger|postman")
	note := fs.String("note", "", "change summary")

	if err := fs.Parse(args); err != nil {
		return err
	}

	cfg := mergeConfig(*server, *token, *team, *project, *format, *note, "", "")
	contractID := *contract
	if contractID == "" {
		contractID = cfg.Project
	}
	if contractID == "" || *specPath == "" {
		return fmt.Errorf("--contract and --spec are required")
	}

	specBytes, err := os.ReadFile(*specPath)
	if err != nil {
		return fmt.Errorf("read spec file: %w", err)
	}

	c := newClient()
	parseEndpoint, err := resolveServerURL(cfg.Server,
		"/api/contracts/"+contractID+"/import/parse")
	if err != nil {
		return err
	}

	parsePayload := map[string]any{
		"source":  "file",
		"content": string(specBytes),
		"format":  cfg.Format,
	}
	status, body, err := c.do("POST", parseEndpoint, cfg.Token, parsePayload)
	if err != nil {
		return err
	}
	if status < 200 || status >= 300 {
		return formatHTTPError(status, body)
	}
	var preview struct {
		APIs     []map[string]any `json:"apis"`
		Entities []map[string]any `json:"entities"`
		Warnings []string         `json:"warnings"`
	}
	if err := decodeJSON(body, &preview); err != nil {
		return err
	}

	commitEndpoint, err := resolveServerURL(cfg.Server,
		"/api/contracts/"+contractID+"/import/commit")
	if err != nil {
		return err
	}
	commitPayload := map[string]any{
		"apis":     preview.APIs,
		"entities": preview.Entities,
	}
	status, body, err = c.do("POST", commitEndpoint, cfg.Token, commitPayload)
	if err != nil {
		return err
	}
	if status < 200 || status >= 300 {
		return formatHTTPError(status, body)
	}

	fmt.Printf("✅ pushed spec to contract=%s\n", contractID)
	if cfg.Note != "" {
		fmt.Printf("   note: %s\n", cfg.Note)
	}
	for _, warning := range preview.Warnings {
		fmt.Printf("   warning: %s\n", warning)
	}
	fmt.Println("   response:", strings.TrimSpace(string(body)))
	return nil
}
