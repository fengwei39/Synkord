import apiClient from './client';

export async function listAPIs(teamId: string, params: URLSearchParams) {
  const resp = await apiClient.get(`/teams/${teamId}/apis?${params.toString()}`);
  return resp.data.items || [];
}

export async function importAPISpec(teamId: string, values: { project_id: string; spec: string; format?: 'openapi' | 'postman' }) {
  const resp = await apiClient.post(`/teams/${teamId}/apis/import`, values);
  return resp.data;
}
