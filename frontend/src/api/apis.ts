import apiClient from './client';

export async function listAPIs(teamId: string, projectId: string, params: URLSearchParams = new URLSearchParams()) {
  const query = params.toString();
  const resp = await apiClient.get(`/teams/${teamId}/projects/${projectId}/apis${query ? `?${query}` : ''}`);
  return resp.data.items || [];
}

export async function getAPI(teamId: string, projectId: string, apiId: string) {
  const resp = await apiClient.get(`/teams/${teamId}/projects/${projectId}/apis/${apiId}`);
  return resp.data;
}

export async function importAPISpec(teamId: string, projectId: string, values: { spec: string; format?: 'openapi' | 'postman' }) {
  const resp = await apiClient.post(`/teams/${teamId}/projects/${projectId}/apis/import`, values);
  return resp.data;
}

export async function importAPISpecFromProject(teamId: string, projectId: string) {
  const resp = await apiClient.post(`/teams/${teamId}/projects/${projectId}/apis/import-from-project`);
  return resp.data;
}
