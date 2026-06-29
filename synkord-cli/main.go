// Package main implements the synkord CLI.
//
// synkord is the cross-language client for synkord-core REST API.
// It is invoked from three places (per docs/ai-development-guide.md §12.4):
//
//   - backend CI pipeline:     synkord push-spec --spec ./openapi.json
//   - frontend Git pre-commit: synkord validate-deps --used-entities X --used-apis Y
//   - any CI job:              synkord check-spec --spec ./openapi.json
//
// Authentication: the CLI authenticates against /api/auth/login with
// username + password and stores the returned JWT in $HOME/.synkord/token.
// All subsequent commands read the token from there.
//
// The CLI never talks to MCP. The MCP protocol is reserved for
// IDE/AI agents (Cursor/VSCode/Codex) per the protocol separation in
// docs/requirements.md §4.1.
package main

import (
	"errors"
	"flag"
	"fmt"
	"os"
)

const version = "0.1.0"

func main() {
	if len(os.Args) < 2 {
		usage()
		os.Exit(1)
	}

	cmd := os.Args[1]
	args := os.Args[2:]

	var err error
	switch cmd {
	case "push-spec":
		err = runPushSpec(args)
	case "validate-deps":
		err = runValidateDeps(args)
	case "check-spec":
		err = runCheckSpec(args)
	case "login":
		err = runLogin(args)
	case "version", "-v", "--version":
		fmt.Println("synkord", version)
		return
	case "help", "-h", "--help":
		usage()
		return
	default:
		fmt.Fprintf(os.Stderr, "unknown command: %s\n", cmd)
		usage()
		os.Exit(1)
	}

	// flag.ContinueOnError + Parse 返回 ErrHelp 时表示用户请求 --help，
	// 算成功退出，不当作失败。
	if err != nil && !errors.Is(err, flag.ErrHelp) {
		fmt.Fprintf(os.Stderr, "❌ %v\n", err)
		os.Exit(1)
	}
}

func usage() {
	fmt.Print(`synkord — CLI client for synkord-core (REST only, not MCP)

Usage:
  synkord <command> [flags]

Commands:
  push-spec       Import a new OpenAPI/Postman spec version (CI 推送)
  validate-deps   Validate code references against latest spec (Git Hook 前置校验)
  check-spec      Check spec compatibility against the latest version (CI 通用校验)
  login           Login to synkord-core and cache JWT
  version         Print version
  help            Show this help

Environment:
  SYNKOORD_SERVER   default server URL (overridden by --server)
  SYNKOORD_TOKEN    default JWT (overridden by --token)

Per docs/ai-development-guide.md §12.4, this CLI talks REST only.
MCP is reserved for IDE/AI assistants (Cursor/VSCode/Codex).
`)
}
