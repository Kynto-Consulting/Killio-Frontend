"use client";

import { useEffect, useState } from "react";
import { Bell, Loader2, Check } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import Link from "next/link";
import { useSession } from "@/components/providers/session-provider";
import { useUserRealtime } from "@/hooks/useUserRealtime";
import {
  Notification,
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
} from "@/lib/api/notifications";

export function NotificationCenter() {
  const { user, accessToken } = useSession();
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!accessToken || !user) return;

    getUnreadCount(accessToken).then((res) => setUnreadCount(res.count)).catch(console.error);

    if (isOpen) {
      setIsLoading(true);
      getNotifications(accessToken)
        .then((data) => {
          setNotifications(data);
        })
        .catch(console.error)
        .finally(() => setIsLoading(false));
    }
  }, [accessToken, user, isOpen]);

  useUserRealtime((event) => {
    if (event.type === "notification.created") {
      setUnreadCount((c) => c + 1);
      if (isOpen) {
        setNotifications((prev) => [event.payload as Notification, ...prev]);
      }
    }
  });

  const handleMarkAsRead = async (id: string) => {
    if (!accessToken) return;
    try {
      await markAsRead(id, accessToken);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch (error) {
      console.error(error);
    }
  };

  const handleMarkAllRead = async () => {
    if (!accessToken) return;
    try {
      await markAllAsRead(accessToken);
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <div className="relative z-50">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors relative ${
          isOpen
            ? "bg-accent/20 text-accent"
            : "text-muted-foreground hover:bg-accent/20 hover:text-foreground"
        }`}
        title="Notifications"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-accent-foreground px-1 border border-background animate-in zoom-in">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          ></div>
          <div className="absolute top-10 right-0 w-80 rounded-xl border border-border bg-card shadow-lg z-50 animate-in fade-in slide-in-from-top-2 overflow-hidden flex flex-col max-h-[400px]">
            <div className="p-3 border-b border-border/50 flex items-center justify-between bg-muted/30 shrink-0">
              <span className="text-sm font-semibold tracking-tight">
                Notifications
              </span>
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  className="text-xs text-accent hover:underline font-medium"
                >
                  Mark all read
                </button>
              )}
            </div>

            <div className="overflow-y-auto p-0 flex-1 relative">
              {isLoading ? (
                <div className="flex h-32 items-center justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center px-4">
                  <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                    <Bell className="h-5 w-5 text-primary/40" />
                  </div>
                  <p className="text-sm font-medium">No new notifications</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    When someone mentions you or invites you, it will show up here.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col divide-y divide-border/50">
                  {notifications.map((notif) => (
                    <div
                      key={notif.id}
                      className={`p-3 text-sm transition-colors hover:bg-muted/30 group ${
                        !notif.isRead ? "bg-accent/5" : ""
                      }`}
                    >
                      <div className="flex justify-between items-start mb-1">
                        <span className="font-semibold">{notif.title}</span>
                        {!notif.isRead && (
                          <button
                            onClick={() => handleMarkAsRead(notif.id)}
                            className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity hover:text-accent"
                            title="Mark as read"
                          >
                            <Check className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                      {notif.message && (
                        <p className="text-muted-foreground text-xs leading-relaxed mb-2">
                          {notif.message}
                        </p>
                      )}
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-[10px] text-muted-foreground/70 uppercase tracking-widest font-mono">
                          {formatDistanceToNow(new Date(notif.createdAt), {
                            addSuffix: true,
                          })}
                        </span>
                        {notif.linkUrl && (
                          <Link
                            href={notif.linkUrl}
                            onClick={() => setIsOpen(false)}
                            className="text-xs text-accent hover:underline font-medium bg-accent/10 px-2 py-0.5 rounded-sm"
                          >
                            View
                          </Link>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
