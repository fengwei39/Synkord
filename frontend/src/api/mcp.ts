import apiClient from './client';

export type MCPConfigStatus = 'active' | 'disabled';

export interface MCPConfig {
  id: string;
  team_id: string;
  project_id: string;
  name: string;
  purpose: string;
  tool_scope: string[];
  token_preview: string;
  token?: string;
  status: MCPConfigStatus;
  expires_at?: string | null;
  last_used_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface MCPServiceStatus {
  state: string;
  ready: boolean;
  connected: boolean;
  reason: string;
  active_tokens: number;
  last_connected_at?: string;
}

export interface ProjectMCPOverview {
  team_id: string;
  project_id: string;
  project_name?: string;
  status: MCPServiceStatus;
  tools: string[];
  configs: MCPConfig[];
  local_hint_url: string;
}

export interface MCPAuditLog {
  id: string;
  team_id: string;
  project_id: string;
  mcp_config_id: string;
  tool_name: string;
  caller: string;
  params_summary: string;
  result_status: string;
  error_message?: string;
  created_at: string;
}

export async function getProjectMCPOverview(teamId: string, projectId: string): Promise<ProjectMCPOverview> {
  const resp = await apiClient.get(`/teams/${teamId}/projects/${projectId}/mcp`);
  return resp.data;
}

export async function listProjectMCPTokens(teamId: string, projectId: string): Promise<MCPConfig[]> {
  const resp = await apiClient.get(`/teams/${teamId}/projects/${projectId}/mcp/tokens`);
  return resp.data.items || [];
}

export async function createProjectMCPToken(
  teamId: string,
  projectId: string,
  values: { name: string; purpose: string; tool_scope?: string[]; expires_at?: string },
): Promise<MCPConfig> {
  const resp = await apiClient.post(`/teams/${teamId}/projects/${projectId}/mcp/tokens`, values);
  return resp.data;
}

export async function updateProjectMCPToken(
  teamId: string,
  projectId: string,
  tokenId: string,
  values: { status?: MCPConfigStatus; tool_scope?: string[] },
): Promise<MCPConfig> {
  const resp = await apiClient.patch(`/teams/${teamId}/projects/${projectId}/mcp/tokens/${tokenId}`, values);
  return resp.data;
}

export async function rotateProjectMCPToken(teamId: string, projectId: string, tokenId: string): Promise<MCPConfig> {
  const resp = await apiClient.post(`/teams/${teamId}/projects/${projectId}/mcp/tokens/${tokenId}/rotate`);
  return resp.data;
}

export async function listProjectMCPAuditLogs(
  teamId: string,
  projectId: string,
): Promise<{ items: MCPAuditLog[]; total: number }> {
  const resp = await apiClient.get(`/teams/${teamId}/projects/${projectId}/mcp/audit`);
  return resp.data;
}

export interface MCPOnboarding {
  description: string;
  env_vars: Array<{ name: string; description: string }>;
  templates: Record<string, { path: string; value: string }>;
  notes: string[];
}

export async function getProjectMCPOnboarding(teamId: string, projectId: string): Promise<MCPOnboarding> {
  const resp = await apiClient.get(`/teams/${teamId}/projects/${projectId}/mcp/onboarding`);
  return resp.data;
}
