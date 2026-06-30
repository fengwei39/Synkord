import apiClient from './client';

export interface DependencyNode {
  id: string;
  name: string;
  project_type: string;
}

export interface DependencyEdge {
  source: string;
  target: string;
  entity_name: string;
  api_path?: string;
  api_method?: string;
}

export async function getDependencyGraph(teamId: string, projectId: string): Promise<{ nodes: DependencyNode[]; edges: DependencyEdge[] }> {
  const resp = await apiClient.get(`/teams/${teamId}/projects/${projectId}/dependencies/graph`);
  return resp.data || { nodes: [], edges: [] };
}
