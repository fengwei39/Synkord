import apiClient from './client';

export interface ModelPayload {
  name: string;
  description?: string;
  is_team_model?: boolean;
  schema_content: string;
  project_id?: string;
  change_summary?: string;
}

export async function listModels(teamId: string) {
  const resp = await apiClient.get(`/teams/${teamId}/models?limit=200`);
  return resp.data.items || [];
}

export async function createModel(teamId: string, values: ModelPayload) {
  const resp = await apiClient.post(`/teams/${teamId}/models`, values);
  return resp.data;
}

export async function updateModel(teamId: string, modelId: string, values: ModelPayload) {
  const resp = await apiClient.patch(`/teams/${teamId}/models/${modelId}`, values);
  return resp.data;
}

export async function deleteModel(teamId: string, modelId: string) {
  await apiClient.delete(`/teams/${teamId}/models/${modelId}`);
}

export async function listModelVersions(teamId: string, modelId: string) {
  const resp = await apiClient.get(`/teams/${teamId}/models/${modelId}/versions`);
  return resp.data || [];
}
