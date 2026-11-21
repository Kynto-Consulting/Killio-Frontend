"use client";

import { useMemo, useState } from "react";
import { Pencil, Plus, Trash2, Users, X } from "lucide-react";

import { useSession } from "@/components/providers/session-provider";
import { useTranslations } from "@/components/providers/i18n-provider";
import { ConfirmDeleteModal } from "@/components/ui/confirm-delete-modal";
import { useTeamGroups, invalidateTeamGroups } from "@/hooks/use-team-groups";
import { createTeamGroup, deleteTeamGroup, setTeamGroupMembers, updateTeamGroup, type TeamGroup } from "@/lib/api/groups";
import type { TeamMemberSummary } from "@/lib/api/contracts";
import { getUserAvatarUrl } from "@/lib/gravatar";
import { toast } from "@/lib/toast";

export const GROUP_COLORS = ["#22d3ee", "#6366f1", "#f472b6", "#fb923c", "#a78bfa", "#34d399", "#fbbf24", "#f87171"];
const NAME_RE = /^[^<>\[\]]{1,40}$/;

const memberLabel = (m: TeamMemberSummary) => m.alias || m.name || m.primaryEmail;

function Avatar({ member, size = 28 }: { member: TeamMemberSummary; size?: number }) {
  return (
    <span
      title={memberLabel(member)}
      className="inline-flex items-center justify-center overflow-hidden rounded-full border border-border bg-muted text-[10px] font-bold text-foreground"
      style={{ width: size, height: size, marginLeft: -6, boxShadow: "0 0 0 2px hsl(var(--background))" }}
    >
      {member.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={getUserAvatarUrl(member.avatarUrl, member.primaryEmail, 40)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        memberLabel(member).slice(0, 1).toUpperCase()
      )}
    </span>
  );
}

export function TeamGroupsSection({ teamId, members, canManage }: { teamId: string; members: TeamMemberSummary[]; canManage: boolean }) {
  const t = useTranslations("groups");
  const { accessToken } = useSession();
  const { groups, isLoading } = useTeamGroups(teamId);
  const [editing, setEditing] = useState<TeamGroup | "new" | null>(null);
  const [deleting, setDeleting] = useState<TeamGroup | null>(null);

  const byId = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);

  const handleDelete = async () => {
    if (!deleting || !accessToken) return;
    try {
      await deleteTeamGroup(teamId, deleting.id, accessToken);
      invalidateTeamGroups(teamId);
      toast(t("toast.deleted"), "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : t("toast.error"), "error");
      throw e;
    }
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6, gap: 12 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: "hsl(var(--ink))" }}>{t("title")}</span>
        {canManage && (
          <button
            onClick={() => setEditing("new")}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-accent/10"
          >
            <Plus className="h-3.5 w-3.5" /> {t("newGroup")}
          </button>
        )}
      </div>
      <p style={{ fontSize: 12, color: "hsl(var(--ink) / 0.45)", marginBottom: 12 }}>{t("subtitle")}</p>

      {isLoading && groups.length === 0 ? (
        <div style={{ padding: 24, textAlign: "center", fontSize: 13, color: "hsl(var(--ink) / 0.42)" }}>{t("loading")}</div>
      ) : groups.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-6 py-8 text-center">
          <Users className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
          <div className="text-sm font-semibold text-foreground">{t("emptyTitle")}</div>
          <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">{canManage ? t("emptyBody") : `${t("emptyBody")} ${t("emptyReadOnly")}`}</p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
          {groups.map((group) => {
            const people = group.memberUserIds.map((id) => byId.get(id)).filter((m): m is TeamMemberSummary => !!m);
            const shown = people.slice(0, 5);
            const extra = group.memberCount - shown.length;
            return (
              <div key={group.id} className="relative rounded-[14px] border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="h-3 w-3 shrink-0 rounded-full border border-border" style={{ background: group.color ?? "transparent" }} />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-bold text-foreground">{group.name}</div>
                      <div className="truncate text-xs text-muted-foreground">@{group.slug}</div>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {group.isMember && (
                      <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-bold" style={{ color: "hsl(var(--accent-ink))" }}>
                        {t("inGroup")}
                      </span>
                    )}
                    {canManage && (
                      <>
                        <button onClick={() => setEditing(group)} title={t("edit")} className="rounded-md p-1 text-muted-foreground hover:bg-accent/10 hover:text-foreground">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => setDeleting(group)} title={t("delete")} className="rounded-md p-1 text-muted-foreground hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
                {group.description && <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{group.description}</p>}
                <div className="mt-3 flex items-center justify-between">
                  <div className="flex items-center pl-1.5">
                    {shown.map((m) => (
                      <Avatar key={m.id} member={m} />
                    ))}
                    {extra > 0 && <span className="ml-1.5 text-xs font-semibold text-muted-foreground">+{extra}</span>}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {group.memberCount === 0 ? t("membersNone") : group.memberCount === 1 ? t("membersOne") : t("members", { count: group.memberCount })}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <GroupEditorModal
          teamId={teamId}
          group={editing === "new" ? null : editing}
          members={members}
          onClose={() => setEditing(null)}
        />
      )}
      <ConfirmDeleteModal
        isOpen={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={handleDelete}
        title={t("deleteTitle")}
        description={t("deleteDescription")}
        itemName={deleting?.name}
      />
    </div>
  );
}

function GroupEditorModal({ teamId, group, members, onClose }: { teamId: string; group: TeamGroup | null; members: TeamMemberSummary[]; onClose: () => void }) {
  const t = useTranslations("groups");
  const { accessToken } = useSession();
  const [name, setName] = useState(group?.name ?? "");
  const [color, setColor] = useState<string | null>(group?.color ?? null);
  const [description, setDescription] = useState(group?.description ?? "");
  const [selected, setSelected] = useState<Set<string>>(() => new Set(group?.memberUserIds ?? []));
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);

  const active = useMemo(() => members.filter((m) => m.status === "active"), [members]);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return active;
    return active.filter((m) => `${m.alias ?? ""} ${m.name} ${m.primaryEmail}`.toLowerCase().includes(q));
  }, [active, query]);

  const nameValid = NAME_RE.test(name.trim());
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const setMany = (ids: string[], on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => (on ? next.add(id) : next.delete(id)));
      return next;
    });

  const save = async () => {
    if (!accessToken || !nameValid || saving) return;
    setSaving(true);
    try {
      const memberUserIds = Array.from(selected);
      const desc = description.trim() || null;
      const saved = group
        ? await updateTeamGroup(teamId, group.id, { name: name.trim(), color, description: desc }, accessToken)
        : await createTeamGroup(teamId, { name: name.trim(), color, description: desc }, accessToken);
      await setTeamGroupMembers(teamId, saved.id, memberUserIds, accessToken);
      invalidateTeamGroups(teamId);
      toast(group ? t("toast.updated") : t("toast.created"), "success");
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : t("toast.error"), "error");
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
      <div className="fixed inset-0" onClick={() => !saving && onClose()} />
      <div className="relative flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-border bg-card shadow-lg">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="text-base font-bold text-foreground">{group ? t("editGroup") : t("newGroup")}</h2>
          <button onClick={onClose} disabled={saving} className="rounded-md p-1 text-muted-foreground hover:bg-accent/10">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto px-5 py-4">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-foreground">{t("form.name")}</span>
            <input
              autoFocus
              value={name}
              maxLength={40}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("form.namePlaceholder")}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-ring"
            />
            <span className={`mt-1 block text-[11px] ${name && !nameValid ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}`}>
              {name && !nameValid ? t("form.nameInvalid") : t("form.nameHelp")}
            </span>
          </label>

          <div>
            <span className="mb-1 block text-xs font-semibold text-foreground">{t("form.color")}</span>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                title={t("form.noColor")}
                onClick={() => setColor(null)}
                className={`flex h-6 w-6 items-center justify-center rounded-full border text-muted-foreground ${color === null ? "border-foreground ring-2 ring-ring" : "border-border"}`}
              >
                <X className="h-3 w-3" />
              </button>
              {GROUP_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={c}
                  onClick={() => setColor(c)}
                  className={`h-6 w-6 rounded-full border ${color === c ? "border-foreground ring-2 ring-ring" : "border-border"}`}
                  style={{ background: c }}
                />
              ))}
            </div>
          </div>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-foreground">{t("form.description")}</span>
            <textarea
              value={description}
              maxLength={300}
              rows={2}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("form.descriptionPlaceholder")}
              className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-ring"
            />
          </label>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-semibold text-foreground">
                {t("form.members")} <span className="font-normal text-muted-foreground">· {t("form.selected", { count: selected.size })}</span>
              </span>
              <span className="flex gap-3 text-xs">
                <button type="button" onClick={() => setMany(visible.map((m) => m.id), true)} className="font-semibold text-foreground hover:underline">
                  {t("form.selectAll")}
                </button>
                <button type="button" onClick={() => setMany(visible.map((m) => m.id), false)} className="font-semibold text-muted-foreground hover:underline">
                  {t("form.selectNone")}
                </button>
              </span>
            </div>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("form.search")}
              className="mb-2 w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground outline-none focus:border-ring"
            />
            <div className="max-h-56 overflow-y-auto rounded-md border border-border">
              {visible.length === 0 ? (
                <div className="p-3 text-center text-xs text-muted-foreground">{t("form.noMatches")}</div>
              ) : (
                visible.map((m) => (
                  <label key={m.id} className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-accent/10">
                    <input type="checkbox" checked={selected.has(m.id)} onChange={() => toggle(m.id)} />
                    <div className="min-w-0">
                      <div className="truncate text-sm text-foreground">{memberLabel(m)}</div>
                      <div className="truncate text-xs text-muted-foreground">{m.primaryEmail}</div>
                    </div>
                  </label>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          <button onClick={onClose} disabled={saving} className="rounded-md px-4 py-2 text-sm font-medium hover:bg-accent/10 disabled:opacity-50">
            {t("form.cancel")}
          </button>
          <button
            onClick={save}
            disabled={!nameValid || saving}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {saving ? t("form.saving") : group ? t("form.save") : t("form.create")}
          </button>
        </div>
      </div>
    </div>
  );
}
