package mcp_server

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/mark3labs/mcp-go/mcp"
	"github.com/mark3labs/mcp-go/server"
	"github.com/synkord/core/config"
	"github.com/synkord/core/database"
	"github.com/synkord/core/services"
)

func CreateMCPServer(cfg *config.Config) *server.MCPServer {
	s := server.NewMCPServer(
		"synkord-core",
		"0.1.0",
		server.WithToolCapabilities(true),
	)

	// Tool 1: get_global_entities
	s.AddTool(mcp.NewTool("get_global_entities",
		mcp.WithDescription("获取全局公共实体定义（统一返回体、分页 DTO、枚举等）。AI 编码助手应在生成任何 DTO 或实体代码前调用此工具。"),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		entities, err := services.GetGlobalEntities(database.DB)
		if err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("Failed to get global entities: %v", err)), nil
		}
		data, _ := json.MarshalIndent(entities, "", "  ")
		return mcp.NewToolResultText(string(data)), nil
	})

	// Tool 2: get_service_entities
	s.AddTool(mcp.NewTool("get_service_entities",
		mcp.WithDescription("获取指定服务的私有实体及引用的公共实体。"),
		mcp.WithString("project_id", mcp.Required(), mcp.Description("服务项目的唯一标识符")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		args := getArgs(req)
		projectID, ok := args["project_id"].(string)
		if !ok {
			return mcp.NewToolResultError("project_id is required"), nil
		}
		entities, err := services.GetServiceEntities(database.DB, projectID)
		if err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("Failed: %v", err)), nil
		}
		data, _ := json.MarshalIndent(entities, "", "  ")
		return mcp.NewToolResultText(string(data)), nil
	})

	// Tool 3: get_entity_dependencies
	s.AddTool(mcp.NewTool("get_entity_dependencies",
		mcp.WithDescription("查询实体被哪些服务引用、完整依赖链路。用于在修改实体前评估影响范围。"),
		mcp.WithString("entity_name", mcp.Required(), mcp.Description("实体名称")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		args := getArgs(req)
		entityName, ok := args["entity_name"].(string)
		if !ok {
			return mcp.NewToolResultError("entity_name is required"), nil
		}
		deps, err := services.GetEntityDependencies(database.DB, entityName)
		if err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("Failed: %v", err)), nil
		}
		data, _ := json.MarshalIndent(deps, "", "  ")
		return mcp.NewToolResultText(string(data)), nil
	})

	// Tool 4: get_project_apis
	s.AddTool(mcp.NewTool("get_project_apis",
		mcp.WithDescription("获取指定项目的 API 列表与详情。"),
		mcp.WithString("project_id", mcp.Required(), mcp.Description("项目 ID")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		args := getArgs(req)
		projectID, ok := args["project_id"].(string)
		if !ok {
			return mcp.NewToolResultError("project_id is required"), nil
		}
		apis, err := services.GetProjectAPIs(database.DB, projectID)
		if err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("Failed: %v", err)), nil
		}
		data, _ := json.MarshalIndent(apis, "", "  ")
		return mcp.NewToolResultText(string(data)), nil
	})

	// Tool 5: get_api_dependencies
	s.AddTool(mcp.NewTool("get_api_dependencies",
		mcp.WithDescription("查询 API 被哪些项目引用。"),
		mcp.WithString("path", mcp.Required(), mcp.Description("API 路径")),
		mcp.WithString("method", mcp.Description("HTTP 方法")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		args := getArgs(req)
		path, ok := args["path"].(string)
		if !ok {
			return mcp.NewToolResultError("path is required"), nil
		}
		method, _ := args["method"].(string)
		deps, err := services.GetAPIDependencies(database.DB, path, method)
		if err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("Failed: %v", err)), nil
		}
		data, _ := json.MarshalIndent(deps, "", "  ")
		return mcp.NewToolResultText(string(data)), nil
	})

	// Tool 6: detect_breaking_changes
	s.AddTool(mcp.NewTool("detect_breaking_changes",
		mcp.WithDescription("对比新旧 JSON Schema 规范，输出字段级破坏性变更清单及影响范围。"),
		mcp.WithString("service_name", mcp.Required(), mcp.Description("服务名称")),
		mcp.WithString("project_id", mcp.Required(), mcp.Description("项目 ID")),
		mcp.WithString("old_spec", mcp.Required(), mcp.Description("旧 JSON Schema（JSON 字符串）")),
		mcp.WithString("new_spec", mcp.Required(), mcp.Description("新 JSON Schema（JSON 字符串）")),
		mcp.WithString("old_version", mcp.Description("旧版本号")),
		mcp.WithString("new_version", mcp.Description("新版本号")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		args := getArgs(req)
		serviceName, _ := args["service_name"].(string)
		projectID, _ := args["project_id"].(string)
		oldSpec, _ := args["old_spec"].(string)
		newSpec, _ := args["new_spec"].(string)
		oldVersion, _ := args["old_version"].(string)
		newVersion, _ := args["new_version"].(string)

		affected, _ := services.FindAffectedProjects(database.DB, projectID)
		result := services.DetectBreakingChanges(oldSpec, newSpec, serviceName, oldVersion, newVersion, affected)
		data, _ := json.MarshalIndent(result, "", "  ")
		return mcp.NewToolResultText(string(data)), nil
	})

	// Tool 7: validate_entity_usage
	s.AddTool(mcp.NewTool("validate_entity_usage",
		mcp.WithDescription("校验代码片段中的实体使用是否符合平台规范。"),
		mcp.WithString("code_snippet", mcp.Required(), mcp.Description("需要校验的代码片段")),
		mcp.WithString("project_id", mcp.Required(), mcp.Description("所属项目 ID")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		args := getArgs(req)
		codeSnippet, _ := args["code_snippet"].(string)
		projectID, _ := args["project_id"].(string)

		entities, err := services.GetServiceEntities(database.DB, projectID)
		if err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("Failed: %v", err)), nil
		}
		schemas := make([]string, len(entities))
		for i, e := range entities {
			schemas[i] = e.SchemaContent
		}
		result := services.ValidateEntityUsage(codeSnippet, schemas)
		data, _ := json.MarshalIndent(result, "", "  ")
		return mcp.NewToolResultText(string(data)), nil
	})

	return s
}

func getArgs(req mcp.CallToolRequest) map[string]interface{} {
	if args, ok := req.Params.Arguments.(map[string]interface{}); ok {
		return args
	}
	return make(map[string]interface{})
}
