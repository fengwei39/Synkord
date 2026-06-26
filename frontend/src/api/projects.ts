import apiClient from './client';

export interface ProjectPayload {
  name: string;
  description?: string;
  project_type: 'backend' | 'web' | 'app';
  owner?: string;
  repo_url?: string;
}

export async function listProjects(teamId: string) {
  const resp = await apiClient.get(`/teams/${teamId}/projects?limit=200`);
  return resp.data.items || [];
}

export async function createProject(teamId: string, values: ProjectPayload) {
  const resp = await apiClient.post(`/teams/${teamId}/projects`, values);
  return resp.data;
}

export async function updateProject(teamId: string, projectId: string, values: ProjectPayload) {
  const resp = await apiClient.patch(`/teams/${teamId}/projects/${projectId}`, values);
  return resp.data;
}

export async function deleteProject(teamId: string, projectId: string) {
  await apiClient.delete(`/teams/${teamId}/projects/${projectId}`);
}
