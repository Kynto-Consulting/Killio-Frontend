"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Users } from "lucide-react";

import { useTranslations } from "@/components/providers/i18n-provider";
import { ConfirmDeleteModal } from "@/components/ui/confirm-delete-modal";
import { invalidateTeamGroups, useTeamGroups } from "@/hooks/use-team-groups";
import { invalidateTeamPermissions } from "@/hooks/use-team-permissions";
import { createTeamGroup, deleteTeamGroup, setTeamGroupMembers, updateTeamGroup, type TeamGroup } from "@/lib/api/groups";
import { setGroupRoles } from "@/lib/api/roles";
import { toast } from "@/lib/toast";
import { ROLE_NAME_RE, sortRoles } from "@/lib/roles/model";
import { RolePicker } from "./role-picker";
import { useSettings } from "./settings-context";
import { Avatar, ColorField, EmptyState, RoleChip, TabBar, btn, btnDanger, btnPrimary, card, cx, inputCls } from "./ui";

export function GroupsTab() {
  const t = useTranslations("roles");
  const s = useSettings();
  const { groups, isLoading } = useTeamGroups(s.teamId);
  const canManage = s.perms.can("groups.manage");
  const [selected, setSelected] = useState<string | "new" | null>(null);
  const [query, setQuery] = useState("");
  const [deleting, setDeleting] = useState<TeamGroup | null>(null);

  useEffect(() => {
    if (selected === "new") return;
    if (!selected || !groups.some((g) => g.id === selected)) setSelected(groups[0]?.id ?? null);
  }, [groups, selected]);
  const group = selected && selected !== "new" ? groups.find((g) => g.id === selected) ?? null : null;
  const visible = groups.filter((g) => `${g.name} ${g.slug}`.toLowerCase().includes(query.trim().toLowerCase()));

  const remove = async () => {
    if (!deleting) return;
    try {
      await deleteTeamGroup(s.teamId, deleting.id, s.accessToken);
      invalidateTeamGroups(s.teamId);
      invalidateTeamPermissions(s.teamId);
      toast(t("groups.toast.deleted"), "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : t("toast.error"), "error");
      throw e;
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(240px,300px)_1fr]">
      <section aria-labelledby="groups-list-title" className={cx(card, "self-start p-3")}>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 id="groups-list-title" className="text-sm font-bold text-foreground">{t("groups.title")}</h2>
          {canManage && (
            <button type="button" className={btnPrimary} onClick={() => setSelected("new")}>
              <Plus className="h-3.5 w-3.5" aria-hidden /> {t("groups.new")}
            </button>
          )}
        </div>
        <p className="mb-2 text-[11px] text-muted-foreground">{t("groups.hint")}</p>
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("groups.search")} aria-label={t("groups.search")} className={cx(inputCls, "mb-2")} />
        {isLoading && groups.length === 0 ? (
          <p className="py-4 text-center text-xs text-muted-foreground">{t("loading")}</p>
        ) : visible.length === 0 ? (
          <EmptyState icon={<Users className="h-6 w-6" />} title={t("groups.emptyTitle")} body={canManage ? t("groups.emptyBody") : t("groups.emptyReadOnly")} />
        ) : (
          <ul className="space-y-1">
            {visible.map((g) => (
              <li key={g.id}>
                <button type="button" aria-current={g.id === selected ? "true" : undefined} onClick={() => setSelected(g.id)} className={cx("flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", g.id === selected ? "border-border bg-accent/15" : "border-transparent hover:bg-accent/10")}>
                  <span aria-hidden className="h-3 w-3 shrink-0 rounded-full border border-black/20" style={{ background: g.color ?? "hsl(var(--muted-foreground))" }} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-foreground">{g.name}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">@{g.slug}</span>
                  </span>
                  <span className="text-[11px] text-muted-foreground">{g.memberCount}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {selected === "new" ? (
        <GroupEditor key="new" group={null} canManage={canManage} onCreated={(id) => setSelected(id)} onCancel={() => setSelected(groups[0]?.id ?? null)} />
      ) : group ? (
        <GroupEditor key={group.id} group={group} canManage={canManage} onDelete={() => setDeleting(group)} />
      ) : (
        <EmptyState title={t("groups.pick")} />
      )}

      <ConfirmDeleteModal isOpen={!!deleting} onClose={() => setDeleting(null)} onConfirm={remove} title={t("groups.deleteTitle")} description={t("groups.deleteDescription")} itemName={deleting?.name} />
    </div>
  );
}

function GroupEditor({ group, canManage, onDelete, onCreated, onCancel }: { group: TeamGroup | null; canManage: boolean; onDelete?: () => void; onCreated?: (id: string) => void; onCancel?: () => void }) {
  const t = useTranslations("roles");
  const s = useSettings();
  const [sub, setSub] = useState<"general" | "members" | "roles" | "resources">("general");
  const [name, setName] = useState(group?.name ?? "");
  const [color, setColor] = useState<string | null>(group?.color ?? null);
  const [description, setDescription] = useState(group?.description ?? "");
  const [memberIds, setMemberIds] = useState<Set<string>>(() => new Set(group?.memberUserIds ?? []));
  const [roleIds, setRoleIds] = useState<string[]>(group?.roleIds ?? []);
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);

  const nameValid = ROLE_NAME_RE.test(name.trim());
  const active = useMemo(() => s.members.filter((m) => m.status === "active"), [s.members]);
  const shown = active.filter((m) => `${m.alias ?? ""} ${m.name} ${m.primaryEmail}`.toLowerCase().includes(query.trim().toLowerCase()));
  const toggle = (id: string) =>
    setMemberIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const setMany = (ids: string[], on: boolean) =>
    setMemberIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => (on ? next.add(id) : next.delete(id)));
      return next;
    });

  const run = async (fn: () => Promise<void>, okKey: string) => {
    setSaving(true);
    try {
      await fn();
      invalidateTeamGroups(s.teamId);
      invalidateTeamPermissions(s.teamId);
      toast(t(okKey), "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : t("toast.error"), "error");
    } finally {
      setSaving(false);
    }
  };

  const saveGeneral = () =>
    run(async () => {
      const desc = description.trim() || null;
      if (group) await updateTeamGroup(s.teamId, group.id, { name: name.trim(), color, description: desc }, s.accessToken);
      else {
        const created = await createTeamGroup(s.teamId, { name: name.trim(), color, description: desc }, s.accessToken);
        onCreated?.(created.id);
      }
    }, group ? "groups.toast.updated" : "groups.toast.created");
  const saveMembers = () => run(async () => void (group && (await setTeamGroupMembers(s.teamId, group.id, [...memberIds], s.accessToken))), "groups.toast.membersSaved");
  const saveRoles = () => run(async () => void (group && (await setGroupRoles(s.teamId, group.id, roleIds, s.accessToken))), "groups.toast.rolesSaved");

  const membersChanged = group ? [...memberIds].sort().join() !== [...group.memberUserIds].sort().join() : false;
  const rolesChanged = group ? roleIds.slice().sort().join() !== (group.roleIds ?? []).slice().sort().join() : false;
  const groupRoles = sortRoles(s.roles).filter((r) => roleIds.includes(r.id));

  const tabs = group
    ? [
        { id: "general", label: t("groups.general") },
        { id: "members", label: t("groups.members"), badge: memberIds.size },
        { id: "roles", label: t("groups.roles"), badge: roleIds.length || null },
        { id: "resources", label: t("groups.resources") },
      ]
    : [{ id: "general", label: t("groups.general") }];

  return (
    <section className={cx(card, "min-w-0 p-3")} aria-label={group?.name ?? t("groups.new")}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span aria-hidden className="h-3.5 w-3.5 rounded-full border border-black/20" style={{ background: color ?? "hsl(var(--muted-foreground))" }} />
          <h2 className="truncate text-sm font-bold text-foreground">{group?.name ?? t("groups.new")}</h2>
          {group && <span className="text-xs text-muted-foreground">@{group.slug}</span>}
        </div>
        {group && canManage && onDelete && (
          <button type="button" className={btnDanger} onClick={onDelete}><Trash2 className="h-3.5 w-3.5" aria-hidden /> {t("groups.delete")}</button>
        )}
      </div>
      <TabBar idPrefix="group-editor" label={t("groups.tabs")} tabs={tabs} active={sub} onChange={(id) => setSub(id as typeof sub)} />

      <div className="space-y-3 pt-3" role="tabpanel" id={`group-editor-panel-${sub}`} aria-labelledby={`group-editor-tab-${sub}`}>
        {sub === "general" && (
          <>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-foreground">{t("groups.name")}</span>
              <input value={name} maxLength={40} disabled={!canManage} onChange={(e) => setName(e.target.value)} className={inputCls} />
              <span className={cx("mt-1 block text-[11px]", name && !nameValid ? "text-red-600 dark:text-red-400" : "text-muted-foreground")}>{name && !nameValid ? t("display.nameInvalid") : t("groups.nameHelp")}</span>
            </label>
            {group && (
              <div>
                <span className="mb-1 block text-xs font-semibold text-foreground">{t("groups.mention")}</span>
                <code className="rounded border border-border bg-muted px-2 py-1 text-xs">@{group.slug}</code>
                <p className="mt-1 text-[11px] text-muted-foreground">{t("groups.mentionHelp")}</p>
              </div>
            )}
            <ColorField value={color} onChange={setColor} label={t("display.color")} disabled={!canManage} />
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-foreground">{t("groups.description")}</span>
              <textarea value={description} maxLength={300} rows={2} disabled={!canManage} onChange={(e) => setDescription(e.target.value)} className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring" />
            </label>
            {canManage && (
              <div className="flex justify-end gap-1.5">
                {!group && onCancel && <button type="button" className={btn} onClick={onCancel}>{t("common.cancel")}</button>}
                <button type="button" className={btnPrimary} disabled={!nameValid || saving} onClick={saveGeneral}>{group ? t("common.save") : t("groups.create")}</button>
              </div>
            )}
          </>
        )}

        {sub === "members" && group && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("groups.searchPeople")} aria-label={t("groups.searchPeople")} className={cx(inputCls, "min-w-0 flex-1")} />
              {canManage && (
                <span className="flex gap-1.5">
                  <button type="button" className={btn} onClick={() => setMany(shown.map((m) => m.id), true)}>{t("groups.addAll")}</button>
                  <button type="button" className={btn} onClick={() => setMany(shown.map((m) => m.id), false)}>{t("groups.removeAll")}</button>
                </span>
              )}
            </div>
            <ul className="max-h-80 divide-y divide-border overflow-y-auto rounded-lg border border-border">
              {shown.length === 0 && <li className="px-3 py-3 text-xs text-muted-foreground">{t("members.empty")}</li>}
              {shown.map((m) => (
                <li key={m.id}>
                  <label className={cx("flex items-center gap-3 px-3 py-2", canManage ? "cursor-pointer hover:bg-accent/10" : "opacity-70")}>
                    <input type="checkbox" className="h-4 w-4" disabled={!canManage} checked={memberIds.has(m.id)} onChange={() => toggle(m.id)} />
                    <Avatar name={m.alias || m.name} email={m.primaryEmail} url={m.avatarUrl} size={26} />
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-foreground">{m.alias || m.name}</span>
                      <span className="block truncate text-[11px] text-muted-foreground">{m.primaryEmail}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            {canManage && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">{t("groups.selected", { count: memberIds.size })}</span>
                <button type="button" className={btnPrimary} disabled={!membersChanged || saving} onClick={saveMembers}>{t("common.save")}</button>
              </div>
            )}
          </>
        )}

        {sub === "roles" && group && (
          <>
            <p className="text-xs text-muted-foreground">{t("groups.rolesHelp")}</p>
            {s.roles.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t("apiUnavailable.body")}</p>
            ) : (
              <RolePicker roles={s.roles} value={roleIds} onChange={setRoleIds} actor={s.actor} disabled={!canManage || !s.perms.can("roles.manage") && !s.perms.can("members.manage_roles")} />
            )}
            {groupRoles.length > 0 && <div className="flex flex-wrap gap-1">{groupRoles.map((r) => <RoleChip key={r.id} name={r.name} color={r.color} />)}</div>}
            {canManage && (
              <div className="flex justify-end">
                <button type="button" className={btnPrimary} disabled={!rolesChanged || saving} onClick={saveRoles}>{t("common.save")}</button>
              </div>
            )}
          </>
        )}

        {sub === "resources" && group && (
          <>
            <p className="text-xs text-muted-foreground">{t("groups.resourcesHelp")}</p>
            {(group.resources ?? []).length === 0 ? (
              <EmptyState title={t("groups.resourcesNone")} body={t("groups.resourcesNoneBody")} />
            ) : (
              <ul className="divide-y divide-border rounded-lg border border-border">
                {(group.resources ?? []).map((r) => (
                  <li key={`${r.type}-${r.id}`} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                    <span className="truncate font-medium text-foreground">{r.name}</span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">{t(`groups.resourceType.${r.type}`)}{r.role ? ` · ${r.role}` : ""}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </section>
  );
}
