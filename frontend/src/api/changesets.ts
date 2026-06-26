import apiClient from './client';

export async function detectChanges(teamId: string, values: any) {
  const resp = await apiClient.post(`/teams/${teamId}/diff/check`, values);
  return resp.data;
}

export async function listChangeSets(teamId: string) {
  const resp = await apiClient.get(`/teams/${teamId}/diff/changesets?limit=200`);
  return resp.data.items || [];
}
