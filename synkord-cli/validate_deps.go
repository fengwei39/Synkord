package main

import (
	"flag"
	"fmt"
	"os"
)

// runValidateDeps implements `synkord validate-deps`.
//
// 前端 Git Hook 用：消费方声明"我用了哪些 entity / API"，synkord-core
// 对照最新 spec 校验这些引用是否仍存在。
//
// 阻塞式语义：若返回 violations 非空，CLI 退出码非零，pre-commit hook
// 据此阻止 commit（docs/ai-development-guide.md §12.6）。
func runValidateDeps(args []string) error {
	fs := flag.NewFlagSet("validate-deps", flag.ContinueOnError)
	server := fs.String("server", "", "synkord-core base URL")
	token := fs.String("token", "", "JWT")
	team := fs.String("team", "", "team ID (required)")
	project := fs.String("project", "", "project ID (required)")
	pinnedVersion := fs.String("pinned-version", "", "consumer-locked spec version")
	usedEntities := fs.String("used-entities", "", "comma-separated entity names")
	usedAPIs := fs.String("used-apis", "", `comma-separated "METHOD path" entries, e.g. "GET /users,POST /orders"`)

	if err := fs.Parse(args); err != nil {
		return err
	}

	cfg := mergeConfig(*server, *token, *team, *project, "", "", "", "")
	if cfg.Team == "" || cfg.Project == "" {
		return fmt.Errorf("--team and --project are required")
	}

	payload := map[string]any{
		"project_id":     cfg.Project,
		"pinned_version": *pinnedVersion,
		"used_entities":  splitCSV(*usedEntities),
		"used_apis":      splitCSV(*usedAPIs),
	}

	c := newClient()
	endpoint, err := resolveServerURL(cfg.Server,
		"/api/teams/"+cfg.Team+"/validate/dependencies")
	if err != nil {
		return err
	}

	status, body, err := c.do("POST", endpoint, cfg.Token, payload)
	if err != nil {
		return err
	}
	if status < 200 || status >= 300 {
		return formatHTTPError(status, body)
	}

	var resp struct {
		OK         bool     `json:"ok"`
		Violations []string `json:"violations"`
		Warnings   []string `json:"warnings"`
	}
	if err := decodeJSON(body, &resp); err != nil {
		return err
	}

	if len(resp.Warnings) > 0 {
		fmt.Fprintln(os.Stderr, "⚠️  warnings:")
		for _, w := range resp.Warnings {
			fmt.Fprintf(os.Stderr, "  - %s\n", w)
		}
	}

	if !resp.OK {
		fmt.Fprintln(os.Stderr, "❌ invalid references detected:")
		for _, violation := range resp.Violations {
			fmt.Fprintf(os.Stderr, "  - %s\n", violation)
		}
		return fmt.Errorf("validation failed: %d violation(s)", len(resp.Violations))
	}

	fmt.Println("✅ validation passed")
	return nil
}
