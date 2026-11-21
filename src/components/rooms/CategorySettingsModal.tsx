"use client";

import { useEffect, useState } from "react";
import { FolderOpen, Loader2 } from "lucide-react";
import {
  createRoomGroup, getCategoryOverrides, setCategoryOverrides, updateRoomGroup, RoomsApiError, type RoomGroup,
} from "@/lib/api/rooms";
import { useRoomSubjects } from "@/hooks/use-room-subjects";
import { draftsToDtos, normalizeOverridesResponse, type OverrideDraft } from "@/lib/rooms/tristate";
import { buildRoomCatalog } from "@/lib/rooms/permission-catalog";
import { useRoomPermissionCatalog } from "@/hooks/use-room-permission-catalog";
import { PermissionOverridesEditor } from "./PermissionOverridesEditor";
import { RoomModalShell, roomField, roomGhostButton, roomLabel, roomPrimaryButton } from "./RoomModalShell";

type TFn = (key: string, params?: Record<string, string | number>) => string;

interface CategorySettingsModalProps {
  open: boolean;
  onClose: () => void;
  teamId: string;
  accessToken: string;
  /** Edit mode when given. */
  group?: RoomGroup | null;
  canEditPermissions: boolean;
  onSaved: (group: RoomGroup, mode: "created" | "updated") => void;
  t: TFn;
}

/** Create or rename a category and, when allowed, say who can see / write in every channel inside it. */
export function CategorySettingsModal({ open, onClose, teamId, accessToken, group, canEditPermissions, onSaved, t }: CategorySettingsModalProps) {
  const editing = Boolean(group);
  const { subjects, isLoading: isLoadingSubjects } = useRoomSubjects(teamId, accessToken, open && canEditPermissions);
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("");
  const [tab, setTab] = useState<"general" | "permissions">("general");
  const [drafts, setDrafts] = useState<OverrideDraft[]>([]);
  const [initialDtos, setInitialDtos] = useState("[]");
  const [overridesState, setOverridesState] = useState<"idle" | "loading" | "error" | "unavailable">("idle");
  /** Answer of GET /teams/:id/room-groups/:groupId/permissions: its `universe` / `catalog` decide the keys shown. */
  const [overridesRaw, setOverridesRaw] = useState<unknown>(null);
  const catalog = useRoomPermissionCatalog(overridesRaw, teamId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(group?.name ?? "");
    setEmoji(group?.emoji ?? "");
    setTab("general");
    setDrafts([]);
    setInitialDtos("[]");
    setOverridesState("idle");
    setOverridesRaw(null);
    setError(null);
    setBusy(false);
  }, [open, group]);

  useEffect(() => {
    if (!open || !group || !canEditPermissions) return;
    let cancelled = false;
    setOverridesState("loading");
    getCategoryOverrides(teamId, group.id, accessToken)
      .then((raw) => {
        if (cancelled) return;
        const universe = buildRoomCatalog(raw).universe;
        const loaded = normalizeOverridesResponse(raw, universe);
        setOverridesRaw(raw);
        setDrafts(loaded);
        setInitialDtos(JSON.stringify(draftsToDtos(loaded, universe)));
        setOverridesState("idle");
      })
      .catch((err) => { if (!cancelled) setOverridesState(err instanceof RoomsApiError && err.isUnavailable ? "unavailable" : "error"); });
    return () => { cancelled = true; };
  }, [open, group, teamId, accessToken, canEditPermissions]);

  const showPermissions = canEditPermissions && editing; // a new category is created first, permissions follow
  const changed = JSON.stringify(draftsToDtos(drafts, catalog.universe)) !== initialDtos;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      let saved: RoomGroup;
      if (group) {
        const patch: { name?: string; emoji?: string | null } = {};
        if (name.trim() !== group.name) patch.name = name.trim();
        if ((emoji.trim() || null) !== (group.emoji ?? null)) patch.emoji = emoji.trim() || null;
        saved = Object.keys(patch).length > 0 ? { ...group, ...(await updateRoomGroup(teamId, group.id, patch, accessToken)) } : group;
        if (showPermissions && changed && overridesState === "idle") await setCategoryOverrides(teamId, group.id, draftsToDtos(drafts, catalog.universe), accessToken);
      } else {
        saved = await createRoomGroup(teamId, { name: name.trim(), emoji: emoji.trim() || undefined }, accessToken);
      }
      onSaved(saved, group ? "updated" : "created");
      onClose();
    } catch (err) {
      console.error(err);
      setError(err instanceof RoomsApiError && err.isForbidden ? t("channel.errors.forbidden")
        : err instanceof RoomsApiError && err.isUnavailable ? t("channel.errors.unavailable")
        : t("category.errors.saveFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <RoomModalShell
      open={open}
      onClose={onClose}
      title={editing ? t("category.editTitle") : t("createGroup.title")}
      icon={<FolderOpen className="h-4 w-4" aria-hidden />}
      size={showPermissions ? "lg" : "sm"}
      closeLabel={t("channel.close")}
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={roomGhostButton}>{t("createRoom.cancel")}</button>
          <button type="submit" form="category-settings-form" disabled={!name.trim() || busy} className={roomPrimaryButton}>
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
            {editing ? t("channel.save") : t("createRoom.submitButton")}
          </button>
        </div>
      }
    >
      {showPermissions && (
        <div role="tablist" aria-label={t("category.editTitle")} className="mb-4 flex gap-1 rounded-xl bg-muted/60 p-1">
          {(["general", "permissions"] as const).map((id) => (
            <button
              key={id}
              role="tab"
              type="button"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--accent-ink))] motion-reduce:transition-none ${tab === id ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              {t(`channel.tabs.${id}`)}
            </button>
          ))}
        </div>
      )}

      <form id="category-settings-form" onSubmit={submit}>
        <div hidden={tab !== "general"} className="space-y-4">
          <div className="flex gap-2">
            <div className="w-16">
              <label htmlFor="category-emoji" className={roomLabel}>{t("createGroup.emojiLabel")}</label>
              <input id="category-emoji" type="text" value={emoji} onChange={(e) => setEmoji(e.target.value)} placeholder="📁" maxLength={4} className={`${roomField} text-center text-lg`} />
            </div>
            <div className="flex-1">
              <label htmlFor="category-name" className={roomLabel}>{t("createGroup.nameLabel")}</label>
              <input id="category-name" data-autofocus type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("createGroup.namePlaceholder")} maxLength={80} className={roomField} required />
            </div>
          </div>
          {!editing && canEditPermissions && <p className="text-[11px] text-muted-foreground">{t("category.permissionsAfter")}</p>}
        </div>

        {showPermissions && (
          <div hidden={tab !== "permissions"}>
            <p className="mb-3 text-xs text-muted-foreground">{t("category.permissionsHelp")}</p>
            {overridesState === "loading" && <div className="flex items-center gap-2 py-6 text-xs text-muted-foreground" role="status"><Loader2 className="h-4 w-4 animate-spin" aria-hidden />{t("perm.loading")}</div>}
            {overridesState === "error" && <p role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">{t("perm.loadError")}</p>}
            {overridesState === "unavailable" && <p role="status" className="rounded-xl border border-border bg-muted/50 p-3 text-xs text-muted-foreground">{t("perm.unavailable")}</p>}
            {overridesState === "idle" && <PermissionOverridesEditor drafts={drafts} onChange={setDrafts} subjects={subjects} isLoadingSubjects={isLoadingSubjects} catalog={catalog} t={t} />}
          </div>
        )}

        {error && <p role="alert" className="mt-4 rounded-xl border border-destructive/40 bg-destructive/10 p-2.5 text-xs text-destructive">{error}</p>}
      </form>
    </RoomModalShell>
  );
}
