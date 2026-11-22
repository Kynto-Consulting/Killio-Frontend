"use client";

import { useEffect, useMemo, useState } from "react";
import { Hash, Loader2, Megaphone, Trash2 } from "lucide-react";
import {
  createRoom, deleteRoom, getRoomOverrides, readOverridesInfo, setRoomOverrides, updateRoom, updateRoomSettings, RoomsApiError,
  type ChannelType, type Room, type RoomGroup,
} from "@/lib/api/rooms";
import { useRoomSubjects } from "@/hooks/use-room-subjects";
import { useRealtimeAccessRenewal } from "@/hooks/use-room-realtime-access";
import { deleteConfirmationMatches, deleteErrorKind } from "@/lib/rooms/channel-order";
import { draftsToDtos, normalizeOverridesResponse, type OverrideDraft } from "@/lib/rooms/tristate";
import { buildRoomCatalog } from "@/lib/rooms/permission-catalog";
import { useRoomPermissionCatalog } from "@/hooks/use-room-permission-catalog";
import { PermissionOverridesEditor } from "./PermissionOverridesEditor";
import { ChannelWebhooksPanel } from "./ChannelWebhooksPanel";
import { roomSupportsWebhooks } from "@/lib/bots/webhooks";
import { RoomModalShell, roomField, roomGhostButton, roomLabel, roomPrimaryButton } from "./RoomModalShell";

type TFn = (key: string, params?: Record<string, string | number>) => string;

interface ChannelSettingsModalProps {
  open: boolean;
  onClose: () => void;
  teamId: string;
  accessToken: string;
  groups: RoomGroup[];
  /** Existing rooms: blocks a duplicate name. */
  rooms: Room[];
  /** Edit mode when given; otherwise a new channel is created. */
  room?: Room | null;
  initialGroupId?: string;
  /** The user may edit who can do what (needs the permission to manage the channel). */
  canEditPermissions: boolean;
  showReadReceipts?: boolean;
  onCreated?: (room: Room) => void;
  onUpdated?: (room: Room) => void;
  onDeleted?: (roomId: string) => void;
  onReadReceiptsChange?: (value: boolean) => void;
  t: TFn;
}

/** Same normalisation the API applies, so the duplicate check matches what the server stores. */
const normalizeRoomName = (raw: string) => raw.trim().toLowerCase().replace(/\s+/g, "-");

type Tab = "general" | "permissions" | "webhooks";

export function ChannelSettingsModal({
  open, onClose, teamId, accessToken, groups, rooms, room, initialGroupId, canEditPermissions, showReadReceipts, onCreated, onUpdated, onDeleted, onReadReceiptsChange, t,
}: ChannelSettingsModalProps) {
  const editing = Boolean(room);
  const renew = useRealtimeAccessRenewal();
  const { subjects, isLoading: isLoadingSubjects } = useRoomSubjects(teamId, accessToken, open && canEditPermissions);

  const [tab, setTab] = useState<Tab>("general");
  // The webhooks tab stays mounted once opened, so switching tabs never throws away a secret URL the person has not copied yet.
  const [webhooksOpened, setWebhooksOpened] = useState(false);
  const [name, setName] = useState("");
  const [topic, setTopic] = useState("");
  const [channelType, setChannelType] = useState<ChannelType>("text");
  const [categoryId, setCategoryId] = useState<string>("");
  const [receipts, setReceipts] = useState(true);
  const [drafts, setDrafts] = useState<OverrideDraft[]>([]);
  const [initialDtos, setInitialDtos] = useState("[]");
  const [overridesState, setOverridesState] = useState<"idle" | "loading" | "error" | "unavailable" | "unsupported">("idle");
  const [inheritedCount, setInheritedCount] = useState(0);
  /** Answer of GET /rooms/:id/permissions: its `universe` / `catalog` decide which keys the editor shows. */
  const [overridesRaw, setOverridesRaw] = useState<unknown>(null);
  const catalog = useRoomPermissionCatalog(overridesRaw, teamId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteTyped, setDeleteTyped] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Reset whenever the dialog opens.
  useEffect(() => {
    if (!open) return;
    setTab("general");
    setWebhooksOpened(false);
    setError(null);
    setConfirmDelete(false);
    setDeleteTyped("");
    setDeleteError(null);
    setBusy(false);
    setName(room?.name ?? "");
    setTopic(room?.description ?? "");
    setChannelType(room?.channelType ?? "text");
    setCategoryId(room?.categoryId ?? room?.groupId ?? initialGroupId ?? "");
    setReceipts(showReadReceipts ?? true);
    setDrafts([]);
    setInitialDtos("[]");
    setOverridesState("idle");
    setInheritedCount(0);
    setOverridesRaw(null);
  }, [open, room, initialGroupId, showReadReceipts]);

  // Existing channel: load its overrides.
  useEffect(() => {
    if (!open || !room || !canEditPermissions) return;
    let cancelled = false;
    setOverridesState("loading");
    getRoomOverrides(room.id, accessToken)
      .then((raw) => {
        if (cancelled) return;
        const info = readOverridesInfo(raw);
        setInheritedCount(info.inheritedCount);
        if (!info.supportsOverrides) {
          // DMs and chats of a document or board take their access from elsewhere.
          setOverridesState("unsupported");
          return;
        }
        const universe = buildRoomCatalog(raw).universe;
        const loaded = normalizeOverridesResponse(raw, universe);
        setOverridesRaw(raw);
        setDrafts(loaded);
        setInitialDtos(JSON.stringify(draftsToDtos(loaded, universe)));
        setOverridesState("idle");
      })
      .catch((err) => {
        if (cancelled) return;
        setOverridesState(err instanceof RoomsApiError && err.isUnavailable ? "unavailable" : "error");
      });
    return () => { cancelled = true; };
  }, [open, room, accessToken, canEditPermissions]);

  const normalized = normalizeRoomName(name);
  const duplicate = useMemo(
    () => normalized.length > 0 && rooms.some((r) => r.id !== room?.id && r.type === "channel" && normalizeRoomName(r.name) === normalized),
    [rooms, room?.id, normalized],
  );
  const permissionsChanged = JSON.stringify(draftsToDtos(drafts, catalog.universe)) !== initialDtos;
  const canSave = normalized.length > 0 && !duplicate && !busy && !(editing && overridesState === "loading");

  const explain = (err: unknown, fallbackKey: string) => {
    if (err instanceof RoomsApiError) {
      if (err.isForbidden) return t("channel.errors.forbidden");
      if (err.isUnavailable) return t("channel.errors.unavailable");
    }
    return t(fallbackKey);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave) return;
    setBusy(true);
    setError(null);
    try {
      if (room) {
        let updated: Room = room;
        const patch: Record<string, unknown> = {};
        if (normalized !== room.name) patch.name = normalized;
        if ((topic.trim() || null) !== (room.description ?? null)) patch.description = topic.trim() || null;
        if (channelType !== (room.channelType ?? "text")) patch.channelType = channelType;
        if ((categoryId || null) !== (room.categoryId ?? room.groupId ?? null)) patch.categoryId = categoryId || null;
        if (Object.keys(patch).length > 0) updated = { ...room, ...(await updateRoom(room.id, patch, accessToken)) };
        if (canEditPermissions && permissionsChanged && overridesState === "idle") {
          await setRoomOverrides(room.id, draftsToDtos(drafts, catalog.universe), accessToken);
        }
        if (receipts !== (showReadReceipts ?? true)) {
          await updateRoomSettings(room.id, { showReadReceipts: receipts }, accessToken);
          onReadReceiptsChange?.(receipts);
        }
        onUpdated?.({ ...updated, categoryId: categoryId || undefined, groupId: categoryId || undefined });
      } else {
        const created = await createRoom(teamId, {
          name: normalized,
          type: "channel",
          channelType,
          groupId: categoryId || undefined,
          categoryId: categoryId || undefined,
          description: topic.trim() || undefined,
          overrides: canEditPermissions && drafts.length > 0 ? draftsToDtos(drafts, catalog.universe) : undefined,
        }, accessToken);
        // The realtime token was signed before this room existed: renew it so the new channel can be subscribed.
        await renew();
        onCreated?.(created);
      }
      onClose();
    } catch (err) {
      console.error(err);
      setError(explain(err, editing ? "channel.errors.saveFailed" : "createRoom.createError"));
    } finally {
      setBusy(false);
    }
  };

  const deleteMatches = Boolean(room) && deleteConfirmationMatches(deleteTyped, room?.name ?? "");

  const remove = async () => {
    if (!room || !deleteMatches || busy) return;
    setBusy(true);
    setDeleteError(null);
    try {
      await deleteRoom(room.id, accessToken); // 204
      onDeleted?.(room.id);
      onClose();
    } catch (err) {
      const status = err instanceof RoomsApiError ? err.status : undefined;
      const kind = deleteErrorKind(status);
      if (kind === "notFound") {
        // Already gone (someone else deleted it): the sidebar must drop it too.
        onDeleted?.(room.id);
        onClose();
        return;
      }
      setDeleteError(t(kind === "badRequest" ? "channel.errors.deleteBadRequest" : kind === "forbidden" ? "channel.errors.deleteForbidden" : "channel.errors.deleteFailed"));
    } finally {
      setBusy(false);
    }
  };

  const typeOption = (value: ChannelType, label: string, hint: string, icon: React.ReactNode) => {
    const on = channelType === value;
    return (
      <label
        className={`flex cursor-pointer items-start gap-2 rounded-xl border p-2.5 text-sm transition-colors focus-within:ring-2 focus-within:ring-primary/40 motion-reduce:transition-none ${on ? "border-primary/50 bg-primary/5 ring-1 ring-primary/30" : "border-border hover:bg-muted/50"}`}
      >
        <input type="radio" name="channel-type" className="sr-only" checked={on} onChange={() => setChannelType(value)} />
        <span className="mt-0.5 shrink-0">{icon}</span>
        <span className="min-w-0">
          <span className="block font-semibold">{label}</span>
          <span className="block text-[11px] text-muted-foreground">{hint}</span>
        </span>
      </label>
    );
  };

  const title = editing ? t("channel.editTitle") : t("createRoom.title");

  return (
    <RoomModalShell
      open={open}
      onClose={onClose}
      title={title}
      icon={channelType === "announcement" ? <Megaphone className="h-4 w-4" aria-hidden /> : <Hash className="h-4 w-4" aria-hidden />}
      size="lg"
      closeLabel={t("channel.close")}
      footer={
        <div className="flex items-center gap-2">
          {editing && canEditPermissions && (
            <button type="button" onClick={() => { setConfirmDelete((v) => !v); setDeleteTyped(""); setDeleteError(null); }} disabled={busy} aria-expanded={confirmDelete} className={`${roomGhostButton} !text-destructive`}>
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
              {t("channel.delete")}
            </button>
          )}
          <div className="ml-auto flex gap-2">
            <button type="button" onClick={onClose} className={roomGhostButton}>{t("createRoom.cancel")}</button>
            <button type="submit" form="channel-settings-form" disabled={!canSave} className={roomPrimaryButton}>
              {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
              {editing ? t("channel.save") : t("createRoom.submitButton")}
            </button>
          </div>
        </div>
      }
    >
      {canEditPermissions && (
        <div role="tablist" aria-label={title} className="mb-4 flex gap-1 border-b border-border/60">
          {(["general", "permissions", ...(editing && roomSupportsWebhooks(room) ? ["webhooks" as const] : [])] as const).map((id) => (
            <button
              key={id}
              role="tab"
              type="button"
              id={`channel-tab-${id}`}
              aria-selected={tab === id}
              aria-controls={`channel-panel-${id}`}
              onClick={() => { setTab(id); if (id === "webhooks") setWebhooksOpened(true); }}
              className={`-mb-px flex-1 border-b-2 px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 motion-reduce:transition-none ${tab === id ? "border-primary/50 text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            >
              {t(`channel.tabs.${id}`)}
            </button>
          ))}
        </div>
      )}

      <form id="channel-settings-form" onSubmit={submit}>
        <div id="channel-panel-general" role="tabpanel" aria-labelledby="channel-tab-general" hidden={tab !== "general"} className="space-y-4">
          <div>
            <label htmlFor="channel-name" className={roomLabel}>{t("createRoom.nameLabel")}</label>
            <input
              id="channel-name"
              data-autofocus
              type="text"
              value={name}
              onChange={(e) => { setName(e.target.value); if (error) setError(null); }}
              placeholder={t("createRoom.namePlaceholder")}
              maxLength={80}
              aria-invalid={duplicate}
              aria-describedby={duplicate ? "channel-name-error" : undefined}
              className={roomField}
              required
            />
            {duplicate && <p id="channel-name-error" className="mt-1 text-xs text-destructive">{t("createRoom.duplicateName")}</p>}
          </div>

          <fieldset>
            <legend className={roomLabel}>{t("channel.typeLabel")}</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {typeOption("text", t("channel.type.text"), t("channel.type.textHint"), <Hash className="h-4 w-4" aria-hidden />)}
              {typeOption("announcement", t("channel.type.announcement"), t("channel.type.announcementHint"), <Megaphone className="h-4 w-4" aria-hidden />)}
            </div>
          </fieldset>

          <div>
            <label htmlFor="channel-topic" className={roomLabel}>{t("channel.topicLabel")}</label>
            <input
              id="channel-topic"
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder={t("createRoom.descriptionPlaceholder")}
              maxLength={200}
              className={roomField}
            />
          </div>

          {groups.length > 0 && (
            <div>
              <label htmlFor="channel-category" className={roomLabel}>{t("channel.categoryLabel")}</label>
              <select id="channel-category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={roomField}>
                <option value="">{t("createRoom.noGroup")}</option>
                {groups.map((g) => <option key={g.id} value={g.id}>{g.emoji ? `${g.emoji} ${g.name}` : g.name}</option>)}
              </select>
            </div>
          )}

          {editing && (
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={receipts} onChange={(e) => setReceipts(e.target.checked)} className="mt-1" />
              <span>
                <span className="block font-medium">{t("channel.readReceipts")}</span>
                <span className="block text-[11px] text-muted-foreground">{t("channel.readReceiptsHint")}</span>
              </span>
            </label>
          )}
        </div>

        {canEditPermissions && (
          <div id="channel-panel-permissions" role="tabpanel" aria-labelledby="channel-tab-permissions" hidden={tab !== "permissions"}>
            {overridesState === "loading" && (
              <div className="flex items-center gap-2 py-6 text-xs text-muted-foreground" role="status"><Loader2 className="h-4 w-4 animate-spin" aria-hidden />{t("perm.loading")}</div>
            )}
            {overridesState === "error" && <p role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">{t("perm.loadError")}</p>}
            {overridesState === "unavailable" && <p role="status" className="rounded-xl border border-border bg-muted/50 p-3 text-xs text-muted-foreground">{t("perm.unavailable")}</p>}
            {overridesState === "unsupported" && <p role="status" className="rounded-xl border border-border bg-muted/50 p-3 text-xs text-muted-foreground">{t("perm.unsupported")}</p>}
            {(overridesState === "idle") && (
              <>
                {inheritedCount > 0 && <p role="note" className="mb-3 rounded-xl border border-border bg-muted/40 p-2.5 text-[11px] text-muted-foreground">{t("perm.inherited", { count: inheritedCount })}</p>}
                <PermissionOverridesEditor drafts={drafts} onChange={setDrafts} subjects={subjects} isLoadingSubjects={isLoadingSubjects} catalog={catalog} t={t} />
              </>
            )}
          </div>
        )}

        {error && <p role="alert" className="mt-4 rounded-xl border border-destructive/40 bg-destructive/10 p-2.5 text-xs text-destructive">{error}</p>}
      </form>

      {editing && canEditPermissions && room && roomSupportsWebhooks(room) && webhooksOpened && (
        <div id="channel-panel-webhooks" role="tabpanel" aria-labelledby="channel-tab-webhooks" hidden={tab !== "webhooks"}>
          <ChannelWebhooksPanel roomId={room.id} accessToken={accessToken} />
        </div>
      )}

      {editing && confirmDelete && room && (
        <div role="group" aria-label={t("channel.delete")} className="mt-4 rounded-xl border border-destructive/40 bg-destructive/5 p-3">
          <p className="text-xs text-destructive">{t("channel.deleteWarning", { name: room.name })}</p>
          <label className="mt-2 block text-xs font-semibold">
            {t("channel.deleteTypeName", { name: room.name })}
            <input
              autoFocus
              value={deleteTyped}
              onChange={(e) => setDeleteTyped(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void remove(); } }}
              autoComplete="off"
              spellCheck={false}
              className={`${roomField} mt-1`}
            />
          </label>
          {deleteError && <p role="alert" className="mt-2 text-xs text-destructive">{deleteError}</p>}
          <div className="mt-2 flex justify-end gap-2">
            <button type="button" onClick={() => { setConfirmDelete(false); setDeleteTyped(""); setDeleteError(null); }} className={roomGhostButton}>{t("channel.deleteCancel")}</button>
            <button type="button" onClick={() => void remove()} disabled={!deleteMatches || busy} className={`${roomGhostButton} !border-destructive !bg-destructive !text-destructive-foreground disabled:opacity-40`}>
              {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
              {t("channel.deleteConfirmButton")}
            </button>
          </div>
        </div>
      )}
    </RoomModalShell>
  );
}
