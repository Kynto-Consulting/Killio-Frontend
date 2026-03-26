import { fetchApi } from './client';

export type NotificationType = 'invite' | 'mention' | 'system';

export type NotificationI18nPayload = {
  // Keys are resolved on the client with the `notifications` namespace.
  // Example: `items.inviteTitle` + params for interpolation.
  titleKey?: string;
  titleParams?: Record<string, string | number>;
  messageKey?: string;
  messageParams?: Record<string, string | number>;
};

export type Notification = {
  id: string;
  userId: string;
  // Legacy plain text fields (kept for backward compatibility).
  title: string;
  message: string | null;
  // Preferred payload: client-side translatable metadata.
  i18n?: NotificationI18nPayload | null;
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
