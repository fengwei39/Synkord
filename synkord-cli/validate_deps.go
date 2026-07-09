package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"net/url"
	"os"
	"strings"
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
	contract := fs.String("contract", "", "contract ID (required)")
	team := fs.String("team", "", "deprecated; ignored")
	project := fs.String("project", "", "deprecated alias for --contract")
	pinnedVersion := fs.String("pinned-version", "", "consumer-locked spec version")
	usedEntities := fs.String("used-entities", "", "comma-separated entity names")
	usedAPIs := fs.String("used-apis", "", `comma-separated "METHOD path" entries, e.g. "GET /users,POST /orders"`)

	if err := fs.Parse(args); err != nil {
		return err
	}

	cfg := mergeConfig(*server, *token, *team, *project, "", "", "", "")
	contractID := *contract
	if contractID == "" {
		contractID = cfg.Project
	}
	if contractID == "" {
		return fmt.Errorf("--contract is required")
	}
	if *pinnedVersion != "" {
		fmt.Fprintf(os.Stderr, "⚠️  --pinned-version is currently ignored by contract-based validation\n")
	}

	c := newClient()
	apisEndpoint, err := resolveServerURL(cfg.Server,
		"/api/contracts/"+contractID+"/apis?include_deprecated=true&limit=500")
	if err != nil {
		return err
	}
	status, body, err := c.do("GET", apisEndpoint, cfg.Token, nil)
	if err != nil {
		return err
	}
	if status < 200 || status >= 300 {
		return formatHTTPError(status, body)
	}
	var apiResp struct {
		Items []struct {
			Method string `json:"method"`
			Path   string `json:"path"`
		} `json:"items"`
	}
	if err := json.Unmarshal(body, &apiResp); err != nil {
		return fmt.Errorf("decode apis: %w", err)
	}

	entitiesEndpoint, err := resolveServerURL(cfg.Server,
		"/api/contracts/"+contractID+"/entities?limit=500")
	if err != nil {
		return err
	}
	status, body, err = c.do("GET", entitiesEndpoint, cfg.Token, nil)
	if err != nil {
		return err
	}
	if status < 200 || status >= 300 {
		return formatHTTPError(status, body)
	}
	var entityResp struct {
		Items []struct {
			Name string `json:"name"`
		} `json:"items"`
	}
	if err := json.Unmarshal(body, &entityResp); err != nil {
		return fmt.Errorf("decode entities: %w", err)
	}

	apiSet := map[string]bool{}
	for _, api := range apiResp.Items {
		apiSet[normalizeAPIRef(api.Method+" "+api.Path)] = true
	}
	entitySet := map[string]bool{}
	for _, entity := range entityResp.Items {
		entitySet[entity.Name] = true
	}

	violations := []string{}
	for _, ref := range splitCSV(*usedAPIs) {
		if !apiSet[normalizeAPIRef(ref)] {
			violations = append(violations, "API not found: "+ref)
		}
	}
	for _, name := range splitCSV(*usedEntities) {
		if !entitySet[name] {
			violations = append(violations, "Entity not found: "+name)
		}
	}

	if len(violations) > 0 {
		fmt.Fprintln(os.Stderr, "❌ invalid references detected:")
		for _, violation := range violations {
			fmt.Fprintf(os.Stderr, "  - %s\n", violation)
		}
		return fmt.Errorf("validation failed: %d violation(s)", len(violations))
	}

	fmt.Println("✅ validation passed")
	return nil
}

func normalizeAPIRef(ref string) string {
	parts := strings.Fields(strings.TrimSpace(ref))
	if len(parts) < 2 {
		return strings.ToUpper(strings.TrimSpace(ref))
	}
	method := strings.ToUpper(parts[0])
	path := parts[1]
	if u, err := url.Parse(path); err == nil && u.Path != "" {
		path = u.Path
	}
	return method + " " + path
}
