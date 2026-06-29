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
  delivery_status: 'disabled' | 'not_configured' | 'pending' | 'sent' | 'failed';
  delivery_error?: string;
  read_at?: string;
  created_at: string;
}

export interface WebhookConfig {
  team_id: string;
  enabled: boolean;
  provider: 'dingtalk' | 'feishu';
  webhook_url: string;
  notify_warning: boolean;
  created_at?: string;
  updated_at?: string;
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

export async function getWebhookConfig(teamId: string): Promise<WebhookConfig> {
  const resp = await apiClient.get(`/teams/${teamId}/notifications/webhook`);
  return resp.data;
}

export async function updateWebhookConfig(teamId: string, values: Pick<WebhookConfig, 'enabled' | 'provider' | 'webhook_url' | 'notify_warning'>): Promise<WebhookConfig> {
  const resp = await apiClient.patch(`/teams/${teamId}/notifications/webhook`, values);
  return resp.data;
}

export async function testWebhookConfig(teamId: string): Promise<void> {
  await apiClient.post(`/teams/${teamId}/notifications/webhook/test`);
}
