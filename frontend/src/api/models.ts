import apiClient from './client';

export interface ModelPayload {
  name: string;
  description?: string;
  schema_content: string;
  change_summary?: string;
}

export async function listModels(teamId: string, projectId: string) {
  const resp = await apiClient.get(`/teams/${teamId}/projects/${projectId}/models?limit=200`);
  return resp.data.items || [];
}

export async function getModel(teamId: string, projectId: string, modelId: string) {
  const resp = await apiClient.get(`/teams/${teamId}/projects/${projectId}/models/${modelId}`);
  return resp.data;
}

export async function createModel(teamId: string, projectId: string, values: ModelPayload) {
  const resp = await apiClient.post(`/teams/${teamId}/projects/${projectId}/models`, values);
  return resp.data;
}

export async function updateModel(teamId: string, projectId: string, modelId: string, values: ModelPayload) {
  const resp = await apiClient.patch(`/teams/${teamId}/projects/${projectId}/models/${modelId}`, values);
  return resp.data;
}

export async function deleteModel(teamId: string, projectId: string, modelId: string) {
  await apiClient.delete(`/teams/${teamId}/projects/${projectId}/models/${modelId}`);
}

export async function listModelVersions(teamId: string, projectId: string, modelId: string) {
  const resp = await apiClient.get(`/teams/${teamId}/projects/${projectId}/models/${modelId}/versions`);
  return resp.data || [];
}
