"use client";

import { useState, useEffect } from "react";
import { X, Loader2, Trash2 } from "lucide-react";
import { usePlatform } from "@/components/providers/platform-provider";
import { listRoomMembers, updateMemberRole, removeMember, updateRoomSettings, type RoomMember, type RoomRole } from "@/lib/api/rooms";

type TFn = (key: string, params?: Record<string, string | number>) => string;

interface RoomPermissionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  roomId: string;
  accessToken: string;
  currentUserId: string;
  showReadReceipts?: boolean;
  onSettingsChange?: (settings: { showReadReceipts: boolean }) => void;
  t: TFn;
}

const ROLES: RoomRole[] = ["admin", "member", "readonly"];

export function RoomPermissionsModal({ isOpen, onClose, roomId, accessToken, currentUserId, showReadReceipts: initialShowReadReceipts, onSettingsChange, t }: RoomPermissionsModalProps) {
  const platform = usePlatform();
  const isMobile = platform === "mobile";
  const [activeTab, setActiveTab] = useState<"members" | "channel">("members");
  const [members, setMembers] = useState<RoomMember[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [confirmingRemove, setConfirmingRemove] = useState<string | null>(null);
  const [showReceipts, setShowReceipts] = useState(initialShowReadReceipts ?? true);
  const [savingSettings, setSavingSettings] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setIsLoading(true);
    listRoomMembers(roomId, accessToken)
      .then(setMembers)
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, [isOpen, roomId, accessToken]);

  const handleRoleChange = async (userId: string, role: RoomRole) => {
    setSaving(userId);
    try {
      await updateMemberRole(roomId, userId, role, accessToken);
      setMembers((prev) => prev.map((m) => (m.userId === userId ? { ...m, role } : m)));
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(null);
    }
  };

  const handleRemove = async (member: RoomMember) => {
    if (confirmingRemove !== member.userId) {
      setConfirmingRemove(member.userId);
      return;
    }
    setConfirmingRemove(null);
    setSaving(member.userId);
    try {
      await removeMember(roomId, member.userId, accessToken);
      setMembers((prev) => prev.filter((m) => m.userId !== member.userId));
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className={`fixed inset-0 z-[250] flex ${isMobile ? "items-end justify-stretch" : "items-center justify-center"} bg-black/50 backdrop-blur-sm`}>
      <div className={`bg-card border border-border shadow-2xl w-full flex flex-col overflow-hidden ${isMobile ? "h-[92vh] rounded-t-2xl" : "max-w-md rounded-2xl"}`}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h3 className="text-sm font-semibold">{t("permissions.title")}</h3>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-accent/10 text-muted-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border">
          {(["members", "channel"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2.5 text-xs font-semibold uppercase tracking-wider transition-colors border-b-2 ${
                activeTab === tab
                  ? "border-accent text-accent"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t(`permissions.${tab}Tab`)}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className={`flex-1 overflow-y-auto p-4 ${isMobile ? "max-h-none" : "max-h-80"}`}>
          {activeTab === "members" && (
            <div className="space-y-2">
              {isLoading ? (
                <div className="flex justify-center py-6">
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                </div>
              ) : (
                members.map((m) => (
                  <div key={m.userId} className="flex items-center gap-3">
                    <span className="flex-1 text-sm truncate">{m.displayName}</span>
                    <select
                      value={m.role}
                      onChange={(e) => handleRoleChange(m.userId, e.target.value as RoomRole)}
                      disabled={saving === m.userId || m.userId === currentUserId}
                      className="text-xs border border-border rounded-md bg-background px-2 py-1 disabled:opacity-50"
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {t(`permissions.roles.${r}`)}
                        </option>
                      ))}
                    </select>
                    {m.userId !== currentUserId && (
                      confirmingRemove === m.userId ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setConfirmingRemove(null)}
                            className="text-xs px-2 py-0.5 rounded-md border border-border text-muted-foreground hover:bg-muted/50 transition-colors"
                          >
                            {t("permissions.cancelRemove")}
                          </button>
                          <button
                            onClick={() => handleRemove(m)}
                            disabled={saving === m.userId}
                            className="text-xs px-2 py-0.5 rounded-md bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-40 transition-colors"
                          >
                            {saving === m.userId ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              t("permissions.confirmRemove")
                            )}
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => handleRemove(m)}
                          disabled={saving === m.userId}
                          className="p-1 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive disabled:opacity-40 transition-colors"
                        >
                          {saving === m.userId ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="w-3.5 h-3.5" />
                          )}
                        </button>
                      )
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === "channel" && (
            <div className="space-y-4">
              {/* Read receipts toggle */}
              <div className="flex items-center justify-between py-2 border-b border-border/50">
                <div>
                  <p className="text-sm font-medium">{t("permissions.readReceipts")}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{t("permissions.readReceiptsHint")}</p>
                </div>
                <button
                  onClick={async () => {
                    const next = !showReceipts;
                    setShowReceipts(next);
                    setSavingSettings(true);
                    try {
                      await updateRoomSettings(roomId, { showReadReceipts: next }, accessToken);
                      onSettingsChange?.({ showReadReceipts: next });
                    } catch {
                      setShowReceipts(!next);
                    } finally {
                      setSavingSettings(false);
                    }
                  }}
                  disabled={savingSettings}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus-visible:outline-none disabled:opacity-50 ${
                    showReceipts ? "bg-accent" : "bg-muted"
                  }`}
                >
                  <span
                    className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                      showReceipts ? "translate-x-4" : "translate-x-0.5"
                    }`}
                  />
                </button>
              </div>

              {/* Permission list */}
              <div className="space-y-1 text-xs text-muted-foreground">
                {(["canPost", "canCall", "canRecord", "canInvite", "canManage"] as const).map((perm) => (
                  <div key={perm} className="flex items-center gap-2 py-1">
                    <div className="w-2 h-2 rounded-full bg-accent/50" />
                    <span>{t(`permissions.${perm}`)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
