// mcp-server 是 Synkord MCP 双模式服务入口
//
// 用法：
//   mcp-server stdio [flags]
//   mcp-server http [flags]
//
// 详细参数通过 --help 查看子命令。
package main

import (
	"fmt"
	"os"
)

func main() {
	if len(os.Args) < 2 {
		printUsage()
		os.Exit(2)
	}

	cmd := os.Args[1]
	switch cmd {
	case "stdio":
		runStdio(os.Args[2:])
	case "http":
		runHTTP(os.Args[2:])
	case "-h", "--help", "help":
		printUsage()
	default:
		fmt.Fprintf(os.Stderr, "未知子命令: %s\n", cmd)
		printUsage()
		os.Exit(2)
	}
}

func printUsage() {
	fmt.Fprintln(os.Stderr, `mcp-server - Synkord MCP 双模式服务

用法:
  mcp-server <stdio|http> [flags]

子命令:
  stdio   STDIO 本地模式（通过 stdin/stdout 与 MCP 客户端通信）
  http    SSE 流式 HTTP 远程模式（监听 HTTP 端口，Bearer Token 鉴权）

公共环境变量:
  MCP_LOG_FORMAT=json|text    日志格式，默认 text

运行 'mcp-server <stdio|http> -h' 查看子命令详细参数。`)
}
