"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Copy, GripVertical, Lock, Plus, Trash2 } from "lucide-react";

import { useTranslations } from "@/components/providers/i18n-provider";
import { ConfirmDeleteModal } from "@/components/ui/confirm-delete-modal";
import { invalidateTeamRoles } from "@/hooks/use-team-roles";
import { invalidateTeamPermissions } from "@/hooks/use-team-permissions";
import { createRole, deleteRole, reorderRoles, setMemberRoles, updateRole } from "@/lib/api/roles";
import { toast } from "@/lib/toast";
import {
  ROLE_NAME_RE, canManageRole, canMoveRole, countStates, dropId, effectiveRoles, enforcePinned, groupRoleIds, isOwnerRole, isPinnedRole, memberRoleIds,
  moveId, permissionsChanged, simulateTeamPermission, sortRoles, type PermissionMap, type TeamRole,
} from "@/lib/roles/model";
import { usePermissionCatalog } from "@/hooks/use-permission-catalog";
import { groupCatalog } from "@/lib/roles/catalog";
import { ApproxBanner, RolePermissionsEditor, usePermText } from "./role-permissions-editor";
import { useSettings, type SettingsMember } from "./settings-context";
import { ApiNotice, Avatar, ColorField, EmptyState, RoleChip, Switch, TabBar, btn, btnDanger, btnPrimary, card, cx, inputCls } from "./ui";

export function RolesTab() {
  const t = useTranslations("roles");
  const s = useSettings();
  const canEdit = s.perms.can("roles.manage");
  const [order, setOrder] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<TeamRole | null>(null);

  // The list is the hierarchy: server order (position desc) with the pinned roles forced to their ends.
  useEffect(() => {
    setOrder(enforcePinned(sortRoles(s.roles).map((r) => r.id), s.roles));
  }, [s.roles]);
  const byId = useMemo(() => new Map(s.roles.map((r) => [r.id, r])), [s.roles]);
  const ordered = useMemo(() => order.map((id) => byId.get(id)).filter((r): r is TeamRole => !!r), [order, byId]);
  useEffect(() => {
    if (!selectedId || !byId.has(selectedId)) setSelectedId(ordered.find((r) => !isOwnerRole(r))?.id ?? ordered[0]?.id ?? null);
  }, [ordered, byId, selectedId]);
  const selected = selectedId ? byId.get(selectedId) ?? null : null;

  const memberCount = (r: TeamRole) =>
    r.memberCount ?? s.members.filter((m) => memberRoleIds(m, s.roles).includes(r.id) || groupRoleIds(m.id, s.groups).includes(r.id)).length;

  const commitOrder = async (next: string[]) => {
    const fixed = enforcePinned(next, s.roles);
    if (fixed.join() === order.join()) return;
    const previous = order;
    setOrder(fixed);
    try {
      await reorderRoles(s.teamId, fixed, s.accessToken);
      invalidateTeamRoles(s.teamId);
      invalidateTeamPermissions(s.teamId);
      toast(t("toast.reordered"), "success");
    } catch (e) {
      setOrder(previous);
      toast(e instanceof Error ? e.message : t("toast.error"), "error");
    }
  };

  const move = (id: string, delta: -1 | 1) => {
    if (!canMoveRole(s.actor, ordered, id, delta)) return;
    void commitOrder(moveId(order, id, delta));
  };

  const drop = (overId: string) => {
    const from = dragId ? byId.get(dragId) : null;
    const over = byId.get(overId);
    setDragId(null);
    if (!from || !over || !canManageRole(s.actor, from) || isPinnedRole(from) || !canManageRole(s.actor, over) || isPinnedRole(over)) return;
    void commitOrder(dropId(order, from.id, over.id));
  };

  const create = async (base?: TeamRole) => {
    if (busy) return;
    setBusy(true);
    try {
      const name = base ? t("list.copyName", { name: base.name }).slice(0, 40) : t("list.newName");
      const created = await createRole(s.teamId, { name, color: base?.color ?? null, mentionable: base?.mentionable ?? false, permissions: base ? base.permissions : {} }, s.accessToken);
      invalidateTeamRoles(s.teamId);
      setSelectedId(created.id);
      toast(t("toast.created"), "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : t("toast.error"), "error");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!deleting) return;
    try {
      await deleteRole(s.teamId, deleting.id, s.accessToken);
      invalidateTeamRoles(s.teamId);
      invalidateTeamPermissions(s.teamId);
      void s.reloadMembers();
      toast(t("toast.deleted"), "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : t("toast.error"), "error");
      throw e;
    }
  };

  if (s.rolesError && s.roles.length === 0) return <ApiNotice message={s.rolesError} />;
  if (s.rolesLoading && s.roles.length === 0) return <p className="py-8 text-center text-sm text-muted-foreground">{t("loading")}</p>;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(240px,300px)_1fr]">
        {/* ── hierarchy ── */}
        <section aria-labelledby="roles-list-title" className={cx(card, "self-start p-3")}>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 id="roles-list-title" className="text-sm font-bold text-foreground">{t("list.title")}</h2>
            {canEdit && (
              <button type="button" className={btnPrimary} disabled={busy} onClick={() => create()}>
                <Plus className="h-3.5 w-3.5" aria-hidden /> {t("list.create")}
              </button>
            )}
          </div>
          <p className="mb-2 text-[11px] text-muted-foreground">{t("list.hint")}</p>
          <ul aria-label={t("list.title")} className="space-y-1">
            {ordered.map((r, i) => {
              const pinned = isPinnedRole(r);
              const movable = canEdit && !pinned && canManageRole(s.actor, r);
              const active = r.id === selectedId;
              const prev = ordered[i - 1];
              const showSep = pinned && !r.isDefault ? false : r.isDefault && prev && !isPinnedRole(prev);
              return (
                <li key={r.id}>
                  {showSep && <div className="my-1 border-t border-dashed border-border" aria-hidden />}
                  <div
                    draggable={movable}
                    onDragStart={() => movable && setDragId(r.id)}
                    onDragOver={(e) => dragId && e.preventDefault()}
                    onDrop={() => drop(r.id)}
                    onDragEnd={() => setDragId(null)}
                    className={cx("flex items-center gap-1 rounded-lg border px-1.5 py-1", active ? "border-[var(--memphis-line)] bg-accent/15" : "border-transparent hover:bg-accent/10", dragId === r.id && "opacity-50")}
                  >
                    <span className={cx("shrink-0 text-muted-foreground", movable ? "cursor-grab" : "opacity-30")} aria-hidden>
                      {pinned ? <Lock className="h-3.5 w-3.5" /> : <GripVertical className="h-3.5 w-3.5" />}
                    </span>
                    <button type="button" onClick={() => setSelectedId(r.id)} aria-current={active ? "true" : undefined} className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      <span aria-hidden className="h-3 w-3 shrink-0 rounded-full border border-black/20" style={{ background: r.color ?? "hsl(var(--muted-foreground))" }} />
                      <span className="truncate text-sm font-semibold text-foreground">{r.name}</span>
                      {r.isDefault && <span className="rounded border border-border px-1 text-[9px] font-bold uppercase text-muted-foreground">{t("list.default")}</span>}
                    </button>
                    <span className="shrink-0 text-[11px] text-muted-foreground" title={t("list.members", { count: memberCount(r) })}>{memberCount(r)}</span>
                    {canEdit && (
                      <span className="flex shrink-0 flex-col">
                        <button type="button" aria-label={t("list.moveUp", { name: r.name })} disabled={!canMoveRole(s.actor, ordered, r.id, -1)} onClick={() => move(r.id, -1)} className="rounded p-0.5 text-muted-foreground hover:bg-accent/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-25">
                          <ArrowUp className="h-3 w-3" />
                        </button>
                        <button type="button" aria-label={t("list.moveDown", { name: r.name })} disabled={!canMoveRole(s.actor, ordered, r.id, 1)} onClick={() => move(r.id, 1)} className="rounded p-0.5 text-muted-foreground hover:bg-accent/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-25">
                          <ArrowDown className="h-3 w-3" />
                        </button>
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          {!canEdit && <p className="mt-3 text-[11px] text-muted-foreground">{t("list.readOnly")}</p>}
        </section>

        {/* ── editor ── */}
        {selected ? (
          <RoleEditor key={selected.id} role={selected} canEdit={canEdit} onDuplicate={() => create(selected)} onDelete={() => setDeleting(selected)} />
        ) : (
          <EmptyState title={t("editor.pick")} />
        )}
      </div>

      <PermissionSimulator />

      <ConfirmDeleteModal isOpen={!!deleting} onClose={() => setDeleting(null)} onConfirm={remove} title={t("delete.title")} description={t("delete.description")} itemName={deleting?.name} />
    </div>
  );
}

/* ───────────────────────── Editor ───────────────────────── */

function RoleEditor({ role, canEdit, onDuplicate, onDelete }: { role: TeamRole; canEdit: boolean; onDuplicate: () => void; onDelete: () => void }) {
  const t = useTranslations("roles");
  const s = useSettings();
  const { catalog } = usePermissionCatalog(s.teamId);
  const [sub, setSub] = useState<"display" | "permissions" | "members">("display");
  const [name, setName] = useState(role.name);
  const [color, setColor] = useState<string | null>(role.color);
  const [mentionable, setMentionable] = useState(role.mentionable);
  const [perms, setPerms] = useState<PermissionMap>(role.permissions);
  const [saving, setSaving] = useState(false);

  const isOwner = isOwnerRole(role);
  const manageable = canEdit && canManageRole(s.actor, role);
  const lockedReason = isOwner ? t("block.owner_role") : !canEdit ? t("block.noRolesManage") : !canManageRole(s.actor, role) ? t("block.position") : null;
  const nameValid = ROLE_NAME_RE.test(name.trim());
  const dirty = name.trim() !== role.name || color !== role.color || mentionable !== role.mentionable || permissionsChanged(perms, role.permissions);
  const { allow, deny } = countStates(perms);
  const deletable = manageable && !role.isSystem && !role.isDefault;

  const reset = () => {
    setName(role.name);
    setColor(role.color);
    setMentionable(role.mentionable);
    setPerms(role.permissions);
  };

  const save = async () => {
    if (!nameValid || saving || !dirty) return;
    setSaving(true);
    try {
      await updateRole(s.teamId, role.id, { name: name.trim(), color, mentionable, permissions: perms }, s.accessToken);
      invalidateTeamRoles(s.teamId);
      invalidateTeamPermissions(s.teamId);
      toast(t("toast.saved"), "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : t("toast.error"), "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section aria-label={role.name} className={cx(card, "min-w-0 p-3")}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <RoleChip name={name.trim() || role.name} color={color} />
          {role.isSystem && <span className="rounded border border-border px-1.5 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">{t("editor.system")}</span>}
          {isOwner && <Lock className="h-3.5 w-3.5 text-muted-foreground" aria-label={t("block.owner_role")} />}
        </div>
        <div className="flex gap-1.5">
          {canEdit && !isOwner && (
            <button type="button" className={btn} onClick={onDuplicate}>
              <Copy className="h-3.5 w-3.5" aria-hidden /> {t("editor.duplicate")}
            </button>
          )}
          {deletable && (
            <button type="button" className={btnDanger} onClick={onDelete}>
              <Trash2 className="h-3.5 w-3.5" aria-hidden /> {t("editor.delete")}
            </button>
          )}
        </div>
      </div>
      {isOwner && <p className="mb-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">{t("editor.ownerNote")}</p>}
      {role.isSystem && !isOwner && !role.isDefault && <p className="mb-2 text-[11px] text-muted-foreground">{t("editor.systemNote")}</p>}

      <TabBar
        label={t("editor.tabs")}
        idPrefix="role-editor"
        active={sub}
        onChange={(id) => setSub(id as typeof sub)}
        tabs={[
          { id: "display", label: t("editor.display") },
          { id: "permissions", label: t("editor.permissions"), badge: allow + deny > 0 ? `${allow}✓ ${deny}✗` : null },
          { id: "members", label: t("editor.members") },
        ]}
      />

      <div className="pt-3" role="tabpanel" id={`role-editor-panel-${sub}`} aria-labelledby={`role-editor-tab-${sub}`}>
        {sub === "display" && (
          <div className="space-y-4">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-foreground">{t("display.name")}</span>
              <input value={name} maxLength={40} disabled={!manageable} onChange={(e) => setName(e.target.value)} className={inputCls} />
              <span className={cx("mt-1 block text-[11px]", name && !nameValid ? "text-red-600 dark:text-red-400" : "text-muted-foreground")}>{name && !nameValid ? t("display.nameInvalid") : t("display.nameHelp")}</span>
            </label>
            <ColorField value={color} onChange={setColor} label={t("display.color")} disabled={!manageable} />
            <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
              <div>
                <div className="text-sm font-semibold text-foreground">{t("display.mentionable")}</div>
                <p className="text-xs text-muted-foreground">{t("display.mentionableHelp")}</p>
              </div>
              <Switch checked={mentionable} onChange={setMentionable} label={t("display.mentionable")} disabled={!manageable} />
            </div>
            <div className="rounded-lg border border-dashed border-border px-3 py-2">
              <div className="mb-1 text-[11px] font-semibold text-muted-foreground">{t("display.preview")}</div>
              <RoleChip name={name.trim() || role.name} color={color} />
            </div>
          </div>
        )}
        {sub === "permissions" && <RolePermissionsEditor role={role} value={perms} onChange={setPerms} actor={s.actor} locked={!manageable} lockedReason={lockedReason} catalog={catalog} />}
        {sub === "members" && <RoleMembersPanel role={role} />}
      </div>

      {(sub !== "members") && manageable && (
        <div className="sticky bottom-0 mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--memphis-line)] bg-card px-3 py-2">
          <span className="text-xs text-muted-foreground" role="status">{dirty ? t("editor.unsaved") : t("editor.saved")}</span>
          <div className="flex gap-1.5">
            <button type="button" className={btn} disabled={!dirty || saving} onClick={reset}>{t("editor.reset")}</button>
            <button type="button" className={btnPrimary} disabled={!dirty || !nameValid || saving} onClick={save}>{saving ? t("editor.saving") : t("editor.save")}</button>
          </div>
        </div>
      )}
    </section>
  );
}

/* ───────────────────────── Members of a role ───────────────────────── */

function RoleMembersPanel({ role }: { role: TeamRole }) {
  const t = useTranslations("roles");
  const s = useSettings();
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const canAssign = s.perms.can("members.manage_roles") || s.perms.can("members.manage") || s.perms.can("roles.manage");
  const allowed = canAssign && canManageRole(s.actor, role);
  const personal = s.members.filter((m) => memberRoleIds(m, s.roles).includes(role.id));
  const viaGroup = s.members.filter((m) => !memberRoleIds(m, s.roles).includes(role.id) && groupRoleIds(m.id, s.groups).includes(role.id));
  const candidates = s.members
    .filter((m) => m.status === "active" && !personal.some((p) => p.id === m.id))
    .filter((m) => `${m.alias ?? ""} ${m.name} ${m.primaryEmail}`.toLowerCase().includes(query.trim().toLowerCase()))
    .slice(0, 8);

  const change = async (m: SettingsMember, add: boolean) => {
    setPending(m.id);
    const current = memberRoleIds(m, s.roles);
    const next = add ? [...current, role.id] : current.filter((id) => id !== role.id);
    try {
      await setMemberRoles(s.teamId, m.id, next, s.accessToken);
      invalidateTeamPermissions(s.teamId);
      await s.reloadMembers();
      toast(t("toast.membersUpdated"), "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : t("toast.error"), "error");
    } finally {
      setPending(null);
    }
  };

  const row = (m: SettingsMember, action?: ReactNodeLike) => (
    <li key={m.id} className="flex items-center gap-2 px-3 py-2">
      <Avatar name={m.alias || m.name} email={m.primaryEmail} url={m.avatarUrl} size={26} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-foreground">{m.alias || m.name}</div>
        <div className="truncate text-[11px] text-muted-foreground">{m.primaryEmail}</div>
      </div>
      {action}
    </li>
  );

  return (
    <div className="space-y-3">
      {!allowed && <p className="text-xs text-muted-foreground">{role.systemKey === "owner" ? t("block.owner_role") : t("block.noAssign")}</p>}
      <ul className="divide-y divide-border rounded-lg border border-border">
        {personal.length === 0 && <li className="px-3 py-3 text-xs text-muted-foreground">{t("roleMembers.none")}</li>}
        {personal.map((m) =>
          row(
            m,
            allowed && role.systemKey !== "owner" ? (
              <button type="button" className={btn} disabled={pending === m.id} onClick={() => change(m, false)}>{t("roleMembers.remove")}</button>
            ) : null,
          ),
        )}
        {viaGroup.map((m) => row(m, <span className="text-[11px] text-muted-foreground">{t("roleMembers.viaGroup")}</span>))}
      </ul>
      {allowed && (
        <div>
          <label className="mb-1 block text-xs font-semibold text-foreground" htmlFor="role-member-search">{t("roleMembers.add")}</label>
          <input id="role-member-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("roleMembers.search")} className={cx(inputCls, "mb-2")} />
          <ul className="divide-y divide-border rounded-lg border border-border">
            {candidates.length === 0 && <li className="px-3 py-3 text-xs text-muted-foreground">{t("roleMembers.noCandidates")}</li>}
            {candidates.map((m) => row(m, <button type="button" className={btn} disabled={pending === m.id} onClick={() => change(m, true)}>{t("roleMembers.addShort")}</button>))}
          </ul>
        </div>
      )}
    </div>
  );
}
type ReactNodeLike = React.ReactNode;

/* ───────────────────────── Simulator ───────────────────────── */

/**
 * "Why can / can't this person do X?": runs the cascade (groups, then personal roles, then the default role)
 * on the data on screen. It is an approximation (the server is the judge, and may know overrides this screen
 * does not): it is labelled as such.
 */
function PermissionSimulator() {
  const t = useTranslations("roles");
  const s = useSettings();
  const { catalog } = usePermissionCatalog(s.teamId);
  const text = usePermText();
  const keys = useMemo(() => groupCatalog(catalog, ["team", "room"]).flatMap((sec) => sec.groups.flatMap((g) => g.permissions.map((d) => d.key))), [catalog]);
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState("");
  const [query, setQuery] = useState("");
  const member = s.members.find((m) => m.id === userId) ?? null;

  const rows = useMemo(() => {
    if (!member) return [];
    const eff = effectiveRoles({ userId: member.id, roleIds: member.roleIds, role: member.role }, s.roles, s.groups);
    const input = {
      isOwner: member.role === "owner" || eff.some((e) => e.role.systemKey === "owner"),
      groupRoles: eff.filter((e) => e.source.kind === "group").map((e) => e.role),
      personalRoles: eff.filter((e) => e.source.kind === "personal").map((e) => e.role),
      defaultRole: s.roles.find((r) => r.isDefault) ?? null,
    };
    return keys.map((k) => ({ key: k, ...simulateTeamPermission(k, input) }));
  }, [member, s.roles, s.groups, keys]);

  const visible = rows.filter((r) => !query.trim() || `${text.nameOfKey(catalog, r.key)} ${r.key}`.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <section className={cx(card, "p-3")}>
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between text-left text-sm font-bold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {t("sim.title")}
        <span aria-hidden className="text-muted-foreground">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div className="mt-3 space-y-3">
          {catalog.source === "approx" && <ApproxBanner />}
          <p className="text-xs text-muted-foreground">{t("sim.help")}</p>
          <select value={userId} onChange={(e) => setUserId(e.target.value)} aria-label={t("sim.pick")} className={inputCls}>
            <option value="">{t("sim.pick")}</option>
            {s.members.filter((m) => m.status === "active").map((m) => (
              <option key={m.id} value={m.id}>{m.alias || m.name}</option>
            ))}
          </select>
          {member && (
            <>
              <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("permissions.search")} aria-label={t("permissions.search")} className={inputCls} />
              <ul className="divide-y divide-border rounded-lg border border-border">
                {visible.map((r) => (
                  <li key={r.key} className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 text-xs">
                    <span className="font-medium text-foreground">{text.nameOfKey(catalog, r.key)}</span>
                    <span className="flex items-center gap-2">
                      <span className={r.state === "allow" ? "font-bold text-emerald-700 dark:text-emerald-300" : "font-bold text-red-700 dark:text-red-300"}>{r.state === "allow" ? t("sim.can") : t("sim.cannot")}</span>
                      <span className="text-muted-foreground">
                        {r.source.layer === "owner" ? t("sim.fromOwner") : r.source.layer === "none" ? t("sim.fromNone") : t(`sim.from.${r.source.layer}`, { role: r.source.role.name })}
                      </span>
                    </span>
                  </li>
                ))}
                {visible.length === 0 && <li className="px-3 py-3 text-xs text-muted-foreground">{t("permissions.noMatches")}</li>}
              </ul>
            </>
          )}
        </div>
      )}
    </section>
  );
}
