import { fetchApi } from './client';

export type NotificationType = 'invite' | 'mention' | 'system';

export type Notification = {
  id: string;
  userId: string;
  title: string;
  message: string | null;
  type: NotificationType;
  isRead: boolean;
  linkUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

export async function getNotifications(accessToken: string): Promise<Notification[]> {
  return fetchApi('/notifications', { accessToken });
}

export async function getUnreadCount(accessToken: string): Promise<{ count: number }> {
  return fetchApi('/notifications/unread-count', { accessToken });
}

export async function markAsRead(notificationId: string, accessToken: string): Promise<Notification> {
  return fetchApi(`/notifications/${notificationId}/read`, { method: 'POST', accessToken });
}

export async function markAllAsRead(accessToken: string): Promise<{ success: boolean }> {
  return fetchApi('/notifications/read-all', { method: 'POST', accessToken });
}
