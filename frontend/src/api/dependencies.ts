import apiClient from './client';

export async function getDependencyGraph(teamId: string) {
  const resp = await apiClient.get(`/teams/${teamId}/dependencies/graph`);
  return resp.data;
}
