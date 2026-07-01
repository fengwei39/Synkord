import apiClient from './client';

export interface MCPServiceStatus {
  state: string;
  ready: boolean;
  connected: boolean;
  reason: string;
  last_connected_at?: string;
}

export interface ProjectMCPOverview {
  team_id: string;
  project_id: string;
  project_name?: string;
  status: MCPServiceStatus;
  tools: string[];
  local_hint_url: string;
}

export interface MCPAuditLog {
  id: string;
  team_id: string;
  project_id: string;
  user_id: string;
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

export async function listProjectMCPAuditLogs(
  teamId: string,
  projectId: string,
): Promise<{ items: MCPAuditLog[]; total: number }> {
  const resp = await apiClient.get(`/teams/${teamId}/projects/${projectId}/mcp/audit`);
  return resp.data;
}

export interface MCPOnboarding {
  description: string;
  modes?: {
    stdio?: { description: string; example_command: string };
    http?: { description: string; example_command: string };
  };
  templates: Record<string, { path: string; value: string }>;
  notes: string[];
}

export async function getProjectMCPOnboarding(teamId: string, projectId: string): Promise<MCPOnboarding> {
  const resp = await apiClient.get(`/teams/${teamId}/projects/${projectId}/mcp/onboarding`);
  return resp.data;
}
