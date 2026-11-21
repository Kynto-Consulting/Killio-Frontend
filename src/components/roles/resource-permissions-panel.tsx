"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Plus, X } from "lucide-react";

import { useSession } from "@/components/providers/session-provider";
import { useTranslations } from "@/components/providers/i18n-provider";
import { useTeamGroups } from "@/hooks/use-team-groups";
import { useTeamRoles } from "@/hooks/use-team-roles";
import { listTeamMembers, type TeamMemberSummary } from "@/lib/api/contracts";
import { getMyResourcePermissions, getResourceOverrides, putResourceOverrides, type ResourceKind } from "@/lib/api/roles";
import { toast } from "@/lib/toast";
import { usePermissionCatalog } from "@/hooks/use-permission-catalog";
import { groupCatalog, needsDangerConfirm, obsoleteKeys, unmetRequires } from "@/lib/roles/catalog";
import {
  isEmptyOverride, overrideKey, overrideState, resourceLevel, setOverrideState, type ResourceOverride, type TriState,
} from "@/lib/roles/model";
import { ApproxBanner, DangerBadge, OriginBadge, usePermText } from "./role-permissions-editor";
import { Avatar, Dialog, RoleChip, TriStateControl, btn, btnDanger, btnPrimary, cx, inputCls } from "./ui";

const EVERYONE: ResourceOverride = { subjectType: "everyone", subjectId: null, allow: [], deny: [] };
const sameList = (a: ResourceOverride[], b: ResourceOverride[]) => JSON.stringify(a.map((o) => [overrideKey(o), [...o.allow].sort(), [...o.deny].sort()]).sort()) === JSON.stringify(b.map((o) => [overrideKey(o), [...o.allow].sort(), [...o.deny].sort()]).sort());

/**
 * "Permissions" tab of the share dialogs (board, document, mesh): per member / group / role / everyone, a tri-state
 * (✓ allow / – inherit / ✗ deny) for view, comment, edit and manage, plus a summary of what the person looking has.
 * The server resolves the real result: this only edits the overrides and shows `my-permissions`.
 */
export function ResourcePermissionsPanel({ kind, id, teamId, canManage }: { kind: ResourceKind; id: string; teamId: string | null | undefined; canManage?: boolean }) {
  const t = useTranslations("roles");
  const { accessToken } = useSession();
  const { roles } = useTeamRoles(teamId);
  const { groups } = useTeamGroups(teamId);
  const { catalog } = usePermissionCatalog(teamId);
  const text = usePermText();
  const [pendingDanger, setPendingDanger] = useState<{ key: string; subject: string; next: TriState } | null>(null);
  const [members, setMembers] = useState<TeamMemberSummary[]>([]);
  const [saved, setSaved] = useState<ResourceOverride[]>([]);
  const [draft, setDraft] = useState<ResourceOverride[]>([]);
  const [mine, setMine] = useState<string[] | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "unavailable">("loading");
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");

  const load = async () => {
    if (!accessToken) return;
    setState("loading");
    const [o, m] = await Promise.allSettled([getResourceOverrides(kind, id, accessToken), getMyResourcePermissions(kind, id, accessToken)]);
    if (o.status === "fulfilled") {
      const withEveryone = o.value.some((x) => x.subjectType === "everyone") ? o.value : [EVERYONE, ...o.value];
      setSaved(o.value);
      setDraft(withEveryone);
      setState("ready");
    } else setState("unavailable");
    setMine(m.status === "fulfilled" ? m.value : null);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, id, accessToken]);

  useEffect(() => {
    if (!teamId || !accessToken) return;
    listTeamMembers(teamId, accessToken).then(setMembers).catch(() => setMembers([]));
  }, [teamId, accessToken]);

  const mayEdit = !!canManage || !!mine?.includes("resource.manage");
  const nonEmpty = (list: ResourceOverride[]) => list.filter((o) => !isEmptyOverride(o));
  const dirty = !sameList(nonEmpty(draft), nonEmpty(saved));

  const nameOf = (o: ResourceOverride): { label: string; chip?: { color: string | null }; member?: TeamMemberSummary } => {
    if (o.subjectType === "everyone") return { label: t("resource.everyone") };
    if (o.subjectType === "role") {
      const r = roles.find((x) => x.id === o.subjectId);
      return { label: r?.name ?? "?", chip: { color: r?.color ?? null } };
    }
    if (o.subjectType === "group") {
      const g = groups.find((x) => x.id === o.subjectId);
      return { label: g?.name ?? "?", chip: { color: g?.color ?? null } };
    }
    const m = members.find((x) => x.id === o.subjectId);
    return { label: m?.alias || m?.name || "?", member: m };
  };

  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const taken = new Set(draft.map(overrideKey));
    const all: ResourceOverride[] = [
      ...roles.filter((r) => r.systemKey !== "owner").map((r) => ({ subjectType: "role" as const, subjectId: r.id, allow: [], deny: [] })),
      ...groups.map((g) => ({ subjectType: "group" as const, subjectId: g.id, allow: [], deny: [] })),
      ...members.filter((m) => m.status === "active").map((m) => ({ subjectType: "member" as const, subjectId: m.id, allow: [], deny: [] })),
    ];
    return all
      .filter((o) => !taken.has(overrideKey(o)))
      .filter((o) => `${nameOf(o).label} ${o.subjectType === "member" ? members.find((m) => m.id === o.subjectId)?.primaryEmail ?? "" : ""}`.toLowerCase().includes(q))
      .slice(0, 8);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, draft, roles, groups, members]);

  // Keys of this resource kind straight from the catalogue (new providers and keys appear on their own).
  const defs = useMemo(() => groupCatalog(catalog, ["resource"], kind).flatMap((sec) => sec.groups.flatMap((g) => g.permissions)), [catalog, kind]);
  const staleKeys = useMemo(() => obsoleteKeys([...new Set(draft.flatMap((o) => [...o.allow, ...o.deny]))], catalog), [draft, catalog]);
  const requestPatch = (key: string, permKey: string, next: TriState) => {
    const current = draft.find((o) => overrideKey(o) === key);
    if (current && overrideState(current, permKey) !== "allow" && needsDangerConfirm(catalog, permKey, next)) setPendingDanger({ key, subject: permKey, next });
    else patch(key, permKey, next);
  };
  const patch = (key: string, permKey: string, s: TriState) => setDraft((prev) => prev.map((o) => (overrideKey(o) === key ? setOverrideState(o, permKey, s) : o)));

  const save = async () => {
    if (!accessToken || saving) return;
    setSaving(true);
    try {
      await putResourceOverrides(kind, id, nonEmpty(draft), accessToken);
      toast(t("resource.saved"), "success");
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : t("toast.error"), "error");
    } finally {
      setSaving(false);
    }
  };

  if (state === "loading") return <p className="py-6 text-center text-sm text-muted-foreground">{t("loading")}</p>;
  if (state === "unavailable") {
    return (
      <div className="space-y-3">
        {mine && <MyLevel perms={mine} />}
        <p role="status" className="rounded-lg border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-xs text-foreground">{t("resource.unavailable")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {mine && <MyLevel perms={mine} />}
      {catalog.source === "approx" && <ApproxBanner />}
      <p className="text-xs text-muted-foreground">{t("resource.intro")}</p>
      {!mayEdit && <p className="text-[11px] text-muted-foreground">{t("resource.readOnly")}</p>}

      {mayEdit && (
        <div className="relative">
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("resource.search")} aria-label={t("resource.search")} className={inputCls} />
          {query.trim() && (
            <ul className="absolute z-10 mt-1 max-h-52 w-full overflow-y-auto rounded-lg border border-border bg-card shadow-lg">
              {candidates.length === 0 && <li className="px-3 py-2 text-xs text-muted-foreground">{t("resource.noResults")}</li>}
              {candidates.map((o) => {
                const n = nameOf(o);
                return (
                  <li key={overrideKey(o)}>
                    <button
                      type="button"
                      onClick={() => {
                        setDraft((p) => [...p, o]);
                        setQuery("");
                      }}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-accent/10 focus-visible:bg-accent/10 focus-visible:outline-none"
                    >
                      <Plus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                      <span className="truncate">{n.label}</span>
                      <span className="ml-auto shrink-0 text-[10px] uppercase text-muted-foreground">{t(`resource.subjectType.${o.subjectType}`)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
        {draft.map((o) => {
          const key = overrideKey(o);
          const n = nameOf(o);
          return (
            <li key={key} className="space-y-2 px-3 py-2">
              <div className="flex items-center gap-2">
                {n.member ? <Avatar name={n.label} email={n.member.primaryEmail} url={n.member.avatarUrl} size={22} /> : n.chip ? <RoleChip name={n.label} color={n.chip.color} /> : null}
                {!n.chip && <span className="truncate text-sm font-semibold text-foreground">{n.label}</span>}
                <span className="text-[10px] uppercase text-muted-foreground">{t(`resource.subjectType.${o.subjectType}`)}</span>
                {mayEdit && o.subjectType !== "everyone" && (
                  <button type="button" aria-label={t("resource.remove", { name: n.label })} onClick={() => setDraft((p) => p.filter((x) => overrideKey(x) !== key))} className="ml-auto rounded p-1 text-muted-foreground hover:bg-accent/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <div className="grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2">
                {defs.map((d) => {
                  const st = overrideState(o, d.key);
                  const missing = st === "allow" ? unmetRequires(d.key, (k) => o.allow.includes(k), catalog) : [];
                  return (
                    <div key={d.key} className="space-y-0.5">
                      <div className="flex items-center justify-between gap-1.5">
                        <span className="flex min-w-0 flex-wrap items-center gap-1 text-xs text-foreground">
                          <span className="truncate">{text.name(d)}</span>
                          {d.dangerous && <DangerBadge />}
                          {d.providerId !== "core" && <OriginBadge providerId={d.providerId} />}
                        </span>
                        <TriStateControl value={st} disabled={!mayEdit} label={`${n.label}: ${text.name(d)}`} onChange={(next) => requestPatch(key, d.key, next)} />
                      </div>
                      {missing.length > 0 && <p className="text-[11px] text-amber-700 dark:text-amber-300">{t("catalog.requires", { names: missing.map((k) => text.nameOfKey(catalog, k)).join(", ") })}</p>}
                    </div>
                  );
                })}
              </div>
            </li>
          );
        })}
        {draft.length === 0 && <li className="px-3 py-3 text-xs text-muted-foreground">{t("resource.empty")}</li>}
      </ul>

      {staleKeys.length > 0 && (
        <p role="status" className="rounded-lg border border-dashed border-border px-3 py-2 text-[11px] text-muted-foreground opacity-80">{t("catalog.obsoleteInOverrides", { keys: staleKeys.join(", ") })}</p>
      )}

      {mayEdit && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground" role="status">{dirty ? t("resource.unsaved") : ""}</span>
          <span className="flex gap-1.5">
            <button type="button" className={btn} disabled={!dirty || saving} onClick={() => setDraft(saved.some((x) => x.subjectType === "everyone") ? saved : [EVERYONE, ...saved])}>{t("resource.reset")}</button>
            <button type="button" className={cx(btnPrimary)} disabled={!dirty || saving} onClick={save}>{t("resource.save")}</button>
          </span>
        </div>
      )}
      {pendingDanger && (
        <Dialog
          icon={<AlertTriangle />}
          tone="danger"
          title={t("catalog.dangerConfirmTitle", { name: text.nameOfKey(catalog, pendingDanger.subject) })}
          onClose={() => setPendingDanger(null)}
          footer={
            <>
              <button type="button" className={btn} onClick={() => setPendingDanger(null)}>{t("common.cancel")}</button>
              <button type="button" className={btnDanger} onClick={() => { patch(pendingDanger.key, pendingDanger.subject, pendingDanger.next); setPendingDanger(null); }}>{t("catalog.dangerConfirm")}</button>
            </>
          }
        >
          <p className="text-sm text-foreground">{t("catalog.dangerConfirmBody")}</p>
        </Dialog>
      )}
    </div>
  );
}

function MyLevel({ perms }: { perms: string[] }) {
  const t = useTranslations("roles");
  const level = resourceLevel(perms);
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2" role="status">
      <span className="text-xs font-semibold text-muted-foreground">{t("resource.mine")}</span>
      <span className="text-sm font-bold text-foreground">{t(`resource.level.${level}`)}</span>
    </div>
  );
}

/** Two-tab switcher used at the top of the share dialogs: "Share" (the existing content) and "Permissions". */
export function ShareTabs({ active, onChange }: { active: "share" | "permissions"; onChange: (t: "share" | "permissions") => void }) {
  const t = useTranslations("roles");
  const items: Array<["share" | "permissions", string]> = [["share", t("resource.share")], ["permissions", t("resource.tab")]];
  return (
    <div role="tablist" aria-label={t("resource.tabs")} className="flex gap-1 border-b border-border px-4">
      {items.map(([id, label]) => (
        <button
          key={id}
          role="tab"
          type="button"
          id={`share-tab-${id}`}
          aria-selected={active === id}
          aria-controls={`share-panel-${id}`}
          tabIndex={active === id ? 0 : -1}
          onClick={() => onChange(id)}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight" || e.key === "ArrowLeft") onChange(active === "share" ? "permissions" : "share");
          }}
          className={cx("-mb-px border-b-2 px-3 py-2 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", active === id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
