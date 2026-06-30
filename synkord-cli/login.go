package main

import (
	"flag"
	"fmt"
	"os"
	"strings"
)

func runLogin(args []string) error {
	fs := flag.NewFlagSet("login", flag.ContinueOnError)
	server := fs.String("server", "", "synkord-core base URL")
	username := fs.String("username", "", "username (env: SYNKORD_USERNAME)")
	password := fs.String("password", "", "password (env: SYNKORD_PASSWORD)")

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
		cfg.Username = os.Getenv("SYNKORD_USERNAME")
	}
	if cfg.Password == "" {
		cfg.Password = os.Getenv("SYNKORD_PASSWORD")
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

	fmt.Println("logged in; token cached at ~/.synkord/token")
	_ = strings.TrimSpace(resp.TokenType)
	return nil
}
