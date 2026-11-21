"use client";

import { useEffect, useState } from "react";
import { Loader2, VolumeX } from "lucide-react";
import { muteTeamMember, RoomsApiError } from "@/lib/api/rooms";
import { MUTE_DURATIONS_MINUTES, sanitizeMuteDuration, sanitizeMuteReason } from "@/lib/rooms/room-controls";
import { RoomModalShell, roomField, roomGhostButton, roomLabel, roomPrimaryButton } from "./RoomModalShell";

type TFn = (key: string, params?: Record<string, string | number>) => string;

interface MuteMemberModalProps {
  open: boolean;
  onClose: () => void;
  teamId: string;
  accessToken: string;
  member: { userId: string; displayName: string } | null;
  onMuted: (userId: string, mutedUntil: string | null) => void;
  t: TFn;
}

/** Time a member out in every room of the team: a reason (kept in the audit log) and a duration chosen from fixed options. */
export function MuteMemberModal({ open, onClose, teamId, accessToken, member, onMuted, t }: MuteMemberModalProps) {
  const [reason, setReason] = useState("");
  const [duration, setDuration] = useState<string>(String(MUTE_DURATIONS_MINUTES[1]));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setReason("");
    setDuration(String(MUTE_DURATIONS_MINUTES[1]));
    setError(null);
    setBusy(false);
  }, [open, member?.userId]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!member || busy) return;
    const minutes = sanitizeMuteDuration(duration === "forever" ? null : Number(duration));
    setBusy(true);
    setError(null);
    try {
      await muteTeamMember(teamId, member.userId, { reason: sanitizeMuteReason(reason), durationMinutes: minutes }, accessToken);
      onMuted(member.userId, minutes === null ? null : new Date(Date.now() + minutes * 60_000).toISOString());
      onClose();
    } catch (err) {
      console.error(err);
      setError(
        err instanceof RoomsApiError && err.isForbidden ? t("mod.errors.forbidden")
          : err instanceof RoomsApiError && err.isUnavailable ? t("channel.errors.unavailable")
          : t("mod.errors.failed"),
      );
    } finally {
      setBusy(false);
    }
  };

  const label = (m: number) => (m < 60 ? t("mod.duration.minutes", { count: m }) : m < 1440 ? t("mod.duration.hours", { count: m / 60 }) : t("mod.duration.days", { count: m / 1440 }));

  return (
    <RoomModalShell
      open={open && Boolean(member)}
      onClose={onClose}
      title={t("mod.muteTitle", { name: member?.displayName ?? "" })}
      icon={<VolumeX className="h-4 w-4" aria-hidden />}
      size="sm"
      closeLabel={t("channel.close")}
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={roomGhostButton}>{t("createRoom.cancel")}</button>
          <button type="submit" form="mute-member-form" disabled={busy} className={roomPrimaryButton}>
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
            {t("mod.mute")}
          </button>
        </div>
      }
    >
      <form id="mute-member-form" onSubmit={submit} className="space-y-4">
        <p className="text-xs text-muted-foreground">{t("mod.muteHelp")}</p>
        <div>
          <label htmlFor="mute-duration" className={roomLabel}>{t("mod.durationLabel")}</label>
          <select id="mute-duration" value={duration} onChange={(e) => setDuration(e.target.value)} className={roomField}>
            {MUTE_DURATIONS_MINUTES.map((m) => <option key={m} value={String(m)}>{label(m)}</option>)}
            <option value="forever">{t("mod.duration.forever")}</option>
          </select>
        </div>
        <div>
          <label htmlFor="mute-reason" className={roomLabel}>{t("mod.reasonLabel")}</label>
          <textarea id="mute-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} rows={3} placeholder={t("mod.reasonPlaceholder")} className={`${roomField} resize-none`} />
          <p className="mt-1 text-right text-[10px] text-muted-foreground">{reason.length}/200</p>
        </div>
        {error && <p role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 p-2.5 text-xs text-destructive">{error}</p>}
      </form>
    </RoomModalShell>
  );
}
