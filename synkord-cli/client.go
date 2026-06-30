package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// client wraps a minimal HTTP client configured for synkord-core REST API.
//
// All public methods take a *Config (server, token) so they remain
// testable and do not read globals. Login is the exception: it has no
// token yet and operates on username/password instead.
type client struct {
	http *http.Client
}

func newClient() *client {
	return &client{http: &http.Client{Timeout: 30 * time.Second}}
}

// Config carries the connection settings for a single CLI invocation.
//
// Precedence: flags > env > defaults. main.go wires this up via loadConfig.
type Config struct {
	Server   string
	Token    string
	Team     string
	Project  string
	Format   string
	Note     string
	Username string
	Password string
}

func loadConfig() *Config {
	c := &Config{
		Server: envOr("SYNKORD_SERVER", "http://127.0.0.1:8000"),
		Token:  os.Getenv("SYNKORD_TOKEN"),
	}
	if cached, err := readCachedToken(); err == nil && c.Token == "" {
		c.Token = cached
	}
	return c
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// tokenCachePath is where the JWT from `synkord login` is persisted.
func tokenCachePath() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	dir := filepath.Join(home, ".synkord")
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return "", err
	}
	return filepath.Join(dir, "token"), nil
}

func readCachedToken() (string, error) {
	p, err := tokenCachePath()
	if err != nil {
		return "", err
	}
	b, err := os.ReadFile(p)
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(string(b)), nil
}

func writeCachedToken(token string) error {
	p, err := tokenCachePath()
	if err != nil {
		return err
	}
	return os.WriteFile(p, []byte(token), 0o600)
}

// resolveServerURL 拼接 base path + relative path 并去掉多余的 /。
func resolveServerURL(server, relative string) (string, error) {
	base, err := url.Parse(strings.TrimRight(server, "/"))
	if err != nil {
		return "", fmt.Errorf("invalid --server: %w", err)
	}
	rel, err := url.Parse(relative)
	if err != nil {
		return "", fmt.Errorf("invalid path: %w", err)
	}
	return base.ResolveReference(rel).String(), nil
}

// do 发起带 JWT 的 JSON 请求，body 留空时使用 GET。
// 返回值是 (status, responseBodyBytes, err)。
func (c *client) do(method, fullURL, token string, payload any) (int, []byte, error) {
	var body io.Reader
	if payload != nil {
		data, err := json.Marshal(payload)
		if err != nil {
			return 0, nil, fmt.Errorf("encode payload: %w", err)
		}
		body = bytes.NewReader(data)
	}

	req, err := http.NewRequest(method, fullURL, body)
	if err != nil {
		return 0, nil, fmt.Errorf("build request: %w", err)
	}
	if payload != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}

	resp, err := c.http.Do(req)
	if err != nil {
		return 0, nil, fmt.Errorf("http: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return resp.StatusCode, nil, fmt.Errorf("read response: %w", err)
	}
	return resp.StatusCode, respBody, nil
}

// formatHTTPError 把非 2xx 响应里的 detail 抽出来。
// 失败响应当作 JSON 处理（{detail: "..."}），失败时回退到 raw text。
func formatHTTPError(status int, body []byte) error {
	var wrapper struct {
		Detail string `json:"detail"`
	}
	if err := json.Unmarshal(body, &wrapper); err == nil && wrapper.Detail != "" {
		return fmt.Errorf("HTTP %d: %s", status, wrapper.Detail)
	}
	return fmt.Errorf("HTTP %d: %s", status, strings.TrimSpace(string(body)))
}

// swaggerSpec 是 swagger_specs API 返回的最小子集。
// 我们不引入后端 models 包，CLI 独立维护所需字段。
type swaggerSpec struct {
	ID             string `json:"id"`
	TeamID         string `json:"team_id"`
	ProjectID      string `json:"project_id"`
	Name           string `json:"name"`
	Version        string `json:"version"`
	Source         string `json:"source"`
	SpecContent    string `json:"spec_content"`
	OpenAPIVersion string `json:"openapi_version"`
	ChangeSummary  string `json:"change_summary"`
	APICount       int    `json:"api_count"`
	CreatedAt      string `json:"created_at"`
}

// swaggerSpecListResponse 匹配 backend/api/swagger_specs.go 的响应结构。
type swaggerSpecListResponse struct {
	Items []swaggerSpec `json:"items"`
	Total int           `json:"total"`
}

// fetchLatestSpec 拉取某项目最新一条 SwaggerSpec（含完整 spec_content）。
// 列表为空时返回 (nil, nil)，表示"项目还没有 baseline"。
func (c *client) fetchLatestSpec(server, token, teamID, projectID string) (*swaggerSpec, error) {
	endpoint, err := resolveServerURL(server,
		"/api/teams/"+teamID+"/swagger-specs?project_id="+projectID+"&limit=1")
	if err != nil {
		return nil, err
	}
	status, body, err := c.do("GET", endpoint, token, nil)
	if err != nil {
		return nil, err
	}
	if status < 200 || status >= 300 {
		return nil, formatHTTPError(status, body)
	}
	var resp swaggerSpecListResponse
	if err := json.Unmarshal(body, &resp); err != nil {
		return nil, fmt.Errorf("decode list: %w", err)
	}
	if len(resp.Items) == 0 {
		return nil, nil
	}
	latest := resp.Items[0]
	return &latest, nil
}
