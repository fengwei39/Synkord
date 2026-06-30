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
