import apiClient from './client';

export interface TeamNotification {
  id: string;
  team_id: string;
  project_id: string;
  changeset_id?: string;
  severity: 'info' | 'warning' | 'breaking';
  title: string;
  summary: string;
  read_status: 'unread' | 'read';
  delivery_status: 'not_configured' | 'pending' | 'sent' | 'failed';
  read_at?: string;
  created_at: string;
}

export async function listNotifications(teamId: string, unreadOnly = false): Promise<TeamNotification[]> {
  const status = unreadOnly ? '?status=unread&limit=100' : '?limit=100';
  const resp = await apiClient.get(`/teams/${teamId}/notifications${status}`);
  return resp.data.items || [];
}

export async function markNotificationRead(teamId: string, notificationId: string): Promise<TeamNotification> {
  const resp = await apiClient.post(`/teams/${teamId}/notifications/${notificationId}/read`);
  return resp.data;
}

export async function retryNotificationDelivery(teamId: string, notificationId: string): Promise<TeamNotification> {
  const resp = await apiClient.post(`/teams/${teamId}/notifications/${notificationId}/retry`);
  return resp.data;
}
