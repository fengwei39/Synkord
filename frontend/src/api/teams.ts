import apiClient from './client';
import type { Team, TeamMember, TeamRole } from '../types/team';

export async function listTeams() {
  const resp = await apiClient.get<{ items: Team[]; total: number }>('/teams');
  return resp.data.items || [];
}

export async function createTeam(values: { name: string; description?: string }) {
  const resp = await apiClient.post<Team>('/teams', values);
  return resp.data;
}

export async function listTeamMembers(teamId: string) {
  const resp = await apiClient.get<{ items: TeamMember[]; total: number }>(`/teams/${teamId}/members`);
  return resp.data.items || [];
}

export async function createTeamMember(teamId: string, values: {
  username: string;
  email?: string;
  password: string;
  role: TeamRole;
  status?: 'active' | 'disabled';
  remark?: string;
}) {
  const resp = await apiClient.post<TeamMember>(`/teams/${teamId}/members`, values);
  return resp.data;
}

export async function updateTeamMember(teamId: string, memberId: string, values: {
  username?: string;
  email?: string;
  role?: TeamRole;
  status?: 'active' | 'disabled';
  remark?: string;
}) {
  const resp = await apiClient.patch<TeamMember>(`/teams/${teamId}/members/${memberId}`, values);
  return resp.data;
}

export async function deleteTeamMember(teamId: string, memberId: string) {
  await apiClient.delete(`/teams/${teamId}/members/${memberId}`);
}

export async function deleteTeamMembers(teamId: string, ids: string[]) {
  await apiClient.delete(`/teams/${teamId}/members`, { data: { ids } });
}

export interface TeamSummary {
  project_count: number;
  api_count: number;
  model_count: number;
  breaking_risk_count: number;
  active_member_count: number;
  enabled_mcp_token_count: number;
  recent_changesets: Array<{
    id: string;
    service_name: string;
    old_version?: string;
    new_version?: string;
    severity: 'info' | 'warning' | 'breaking';
    changes_json?: string;
    affected_json?: string;
    created_at: string;
  }>;
}

export async function getTeamSummary(teamId: string) {
  const resp = await apiClient.get<TeamSummary>(`/teams/${teamId}/summary`);
  return resp.data;
}
