import apiClient from './client';

export type MCPConfigStatus = 'active' | 'disabled';

export interface MCPConfig {
  id: string;
  name: string;
  purpose: string;
  project_scope: string[];
  tool_scope: string[];
  token_preview: string;
  token?: string;
  status: MCPConfigStatus;
  expires_at?: string;
  last_used_at?: string;
  created_at?: string;
}

export interface TeamMCPOverview {
  enabled: boolean;
  global_enabled: boolean;
  sse_endpoint: string;
  message_endpoint: string;
  tools: string[];
  configs: MCPConfig[];
}

export interface GlobalMCPServerConfig {
  enabled: boolean;
  sse_endpoint: string;
  message_endpoint: string;
  status: 'running' | 'disabled' | 'error';
  tools: string[];
  rate_limit_per_minute: number;
}

export async function getTeamMCPOverview(teamId: string): Promise<TeamMCPOverview> {
  const resp = await apiClient.get(`/teams/${teamId}/mcp`);
  return resp.data;
}

export async function updateTeamMCPEnabled(teamId: string, enabled: boolean): Promise<TeamMCPOverview> {
  const resp = await apiClient.patch(`/teams/${teamId}/mcp`, { enabled });
  return resp.data;
}

export async function createMCPConfig(teamId: string, values: {
  name: string;
  purpose: string;
  project_scope?: string[];
  tool_scope: string[];
  expires_at?: string;
}): Promise<MCPConfig> {
  const resp = await apiClient.post(`/teams/${teamId}/mcp/tokens`, values);
  return resp.data;
}

export async function updateMCPConfigStatus(
  teamId: string,
  tokenId: string,
  status: MCPConfigStatus,
): Promise<MCPConfig> {
  const resp = await apiClient.patch(`/teams/${teamId}/mcp/tokens/${tokenId}`, { status });
  return resp.data;
}

export async function rotateMCPConfigToken(teamId: string, tokenId: string): Promise<MCPConfig> {
  const resp = await apiClient.post(`/teams/${teamId}/mcp/tokens/${tokenId}/rotate`);
  return resp.data;
}

export async function getGlobalMCPServer(): Promise<GlobalMCPServerConfig> {
  const resp = await apiClient.get('/admin/mcp-server');
  return resp.data;
}

export async function updateGlobalMCPServer(values: {
  enabled: boolean;
  tools: string[];
  rate_limit_per_minute: number;
}): Promise<GlobalMCPServerConfig> {
  const resp = await apiClient.patch('/admin/mcp-server', values);
  return resp.data;
}
