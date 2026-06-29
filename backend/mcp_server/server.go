package mcp_server

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/mark3labs/mcp-go/mcp"
	"github.com/mark3labs/mcp-go/server"
	"github.com/synkord/core/config"
	"github.com/synkord/core/database"
	"github.com/synkord/core/models"
	"github.com/synkord/core/services"
)

func CreateMCPServer(cfg *config.Config) *server.MCPServer {
	s := server.NewMCPServer(
		"synkord-core",
		"0.1.0",
		server.WithToolCapabilities(true),
	)

	// Tool 1: get_team_entities
	// 对应 docs/ai-development-guide.md §8 与 docs/requirements.md §6.6。
	// 旧名 get_global_entities 已在 §2 禁止沿用。
	s.AddTool(mcp.NewTool("get_team_entities",
		mcp.WithDescription("获取当前团队（由 MCP Token 解析得到）的公共数据模型定义（DTO、VO、枚举、返回体等）。AI 编码助手应在生成任何 DTO 或实体代码前调用此工具。"),
		mcp.WithString("team_id", mcp.Required(), mcp.Description("团队 ID（由 MCP 客户端从 token 元数据中获取并传入）")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		args := getArgs(req)
		teamID, ok := args["team_id"].(string)
		if !ok {
			return mcp.NewToolResultError("team_id is required"), nil
		}
		items, _, err := services.ListTeamEntities(database.DB, teamID, nil, ptrBool(true), 0, 200)
		if err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("Failed to get team entities: %v", err)), nil
		}
		data, _ := json.MarshalIndent(items, "", "  ")
		return mcp.NewToolResultText(string(data)), nil
	})

	// Tool 2: get_project_entities
	// 旧名 get_service_entities 已在 §2 禁止沿用。
	s.AddTool(mcp.NewTool("get_project_entities",
		mcp.WithDescription("获取指定项目的私有实体及该项目引用的团队公共实体。"),
		mcp.WithString("team_id", mcp.Required(), mcp.Description("团队 ID")),
		mcp.WithString("project_id", mcp.Required(), mcp.Description("项目 ID")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		args := getArgs(req)
		teamID, ok := args["team_id"].(string)
		if !ok {
			return mcp.NewToolResultError("team_id is required"), nil
		}
		projectID, ok := args["project_id"].(string)
		if !ok {
			return mcp.NewToolResultError("project_id is required"), nil
		}
		// 先取项目私有
		privItems, _, err := services.ListTeamEntities(database.DB, teamID, &projectID, ptrBool(false), 0, 200)
		if err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("Failed: %v", err)), nil
		}
		// 再追加团队公共
		pubItems, _, err := services.ListTeamEntities(database.DB, teamID, nil, ptrBool(true), 0, 200)
		if err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("Failed: %v", err)), nil
		}
		merged := append(privItems, pubItems...)
		data, _ := json.MarshalIndent(merged, "", "  ")
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
		mcp.WithString("team_id", mcp.Required(), mcp.Description("所属团队 ID")),
		mcp.WithString("project_id", mcp.Required(), mcp.Description("所属项目 ID")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		args := getArgs(req)
		codeSnippet, _ := args["code_snippet"].(string)
		teamID, ok := args["team_id"].(string)
		if !ok {
			return mcp.NewToolResultError("team_id is required"), nil
		}
		projectID, ok := args["project_id"].(string)
		if !ok {
			return mcp.NewToolResultError("project_id is required"), nil
		}

		privItems, _, err := services.ListTeamEntities(database.DB, teamID, &projectID, ptrBool(false), 0, 500)
		if err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("Failed: %v", err)), nil
		}
		pubItems, _, err := services.ListTeamEntities(database.DB, teamID, nil, ptrBool(true), 0, 500)
		if err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("Failed: %v", err)), nil
		}
		merged := append(privItems, pubItems...)
		schemas := make([]string, len(merged))
		for i, e := range merged {
			schemas[i] = e.SchemaContent
		}
		result := services.ValidateEntityUsage(codeSnippet, schemas)
		data, _ := json.MarshalIndent(result, "", "  ")
		return mcp.NewToolResultText(string(data)), nil
	})

	// Tool 8: get_swagger_spec_versions
	// 新增：返回某项目的 spec 版本历史，AI 升级前应先调此工具。
	s.AddTool(mcp.NewTool("get_swagger_spec_versions",
		mcp.WithDescription("返回指定项目的 SwaggerSpec / PostmanCollection 版本历史，AI 在升级依赖前应先调此工具确认当前最新版本。"),
		mcp.WithString("team_id", mcp.Required(), mcp.Description("团队 ID")),
		mcp.WithString("project_id", mcp.Required(), mcp.Description("项目 ID")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		args := getArgs(req)
		teamID, ok := args["team_id"].(string)
		if !ok {
			return mcp.NewToolResultError("team_id is required"), nil
		}
		projectID, ok := args["project_id"].(string)
		if !ok {
			return mcp.NewToolResultError("project_id is required"), nil
		}

		var specs []models.SwaggerSpec
		err := database.DB.
			Joins("JOIN projects ON projects.id = swagger_specs.project_id").
			Where("swagger_specs.project_id = ? AND projects.team_id = ?", projectID, teamID).
			Order("swagger_specs.created_at DESC").
			Limit(50).
			Find(&specs).Error
		if err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("Failed: %v", err)), nil
		}
		data, _ := json.MarshalIndent(specs, "", "  ")
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

func ptrBool(b bool) *bool { return &b }
