"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Trash2, Users } from "lucide-react";

import { useSession } from "@/components/providers/session-provider";
import { useTranslations } from "@/components/providers/i18n-provider";
import { useTeamGroups } from "@/hooks/use-team-groups";
import {
  listGroupAccess,
  removeGroupAccess,
  setGroupAccess,
  type GroupAccessEntry,
  type GroupAccessScope,
} from "@/lib/api/group-access";
import { addableGroups, canModifyGroupRole, grantableRoles, type GroupAccessRole } from "@/lib/groups/access";
import { ApiRequestError } from "@/lib/api/groups";
import { toast } from "@/lib/toast";

interface GroupAccessSectionProps {
  scope: GroupAccessScope;
  id: string;
  teamId: string | null | undefined;
  /** Only people who manage the board / document get the controls; everyone else sees a read-only list. */
  canManage: boolean;
  /** The caller's own role, to limit which roles they can grant. Omitted = the server decides. */
  callerRole?: GroupAccessRole | null;
}

const selectClass =
  "h-8 rounded-md border border-input bg-card text-foreground px-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-60";

export function GroupAccessSection({ scope, id, teamId, canManage, callerRole = "owner" }: GroupAccessSectionProps) {
  const t = useTranslations("groups");
  const { accessToken } = useSession();
  const { groups: teamGroups } = useTeamGroups(teamId);
  const [entries, setEntries] = useState<GroupAccessEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pickedGroupId, setPickedGroupId] = useState("");
  const [newRole, setNewRole] = useState<GroupAccessRole>("viewer");

  const roles = useMemo(() => grantableRoles(callerRole), [callerRole]);
  const candidates = useMemo(() => addableGroups(teamGroups, entries), [teamGroups, entries]);
  const roleLabel = (r: string) => t(`sharing.roles.${r}`);

  const load = useCallback(async () => {
    if (!accessToken || !id) return;
    setLoading(true);
    try {
      setEntries(await listGroupAccess(scope, id, accessToken));
    } catch (err) {
      // The list endpoint is for managers only: anyone else simply does not see the section.
      if (err instanceof ApiRequestError && err.status === 403) setForbidden(true);
      else toast((err as Error).message || t("sharing.loadError"), "error");
    } finally {
      setLoading(false);
    }
  }, [accessToken, id, scope, t]);

  useEffect(() => {
    void load();
  }, [load]);

  // Keep the picked role grantable if the caller's role changes.
  useEffect(() => {
    if (roles.length && !roles.includes(newRole)) setNewRole(roles[roles.length - 1]);
  }, [roles, newRole]);

  const run = async (groupId: string, action: () => Promise<void>) => {
    setBusyId(groupId);
    try {
      await action();
    } catch (err) {
      toast((err as Error).message || t("sharing.error"), "error");
    } finally {
      setBusyId(null);
    }
  };

  const handleAdd = () => {
    const group = candidates.find((g) => g.id === pickedGroupId);
    if (!group || !accessToken) return;
    void run(group.id, async () => {
      setEntries(await setGroupAccess(scope, id, group.id, newRole, accessToken));
      setPickedGroupId("");
      toast(t("sharing.added", { name: group.name }), "success");
    });
  };

  const handleRole = (entry: GroupAccessEntry, role: GroupAccessRole) => {
    if (!accessToken || role === entry.role) return;
    void run(entry.groupId, async () => {
      setEntries(await setGroupAccess(scope, id, entry.groupId, role, accessToken));
      toast(t("sharing.updated"), "success");
    });
  };

  const handleRemove = (entry: GroupAccessEntry) => {
    if (!accessToken) return;
    void run(entry.groupId, async () => {
      await removeGroupAccess(scope, id, entry.groupId, accessToken);
      setEntries((prev) => prev.filter((e) => e.groupId !== entry.groupId));
      toast(t("sharing.removed", { name: entry.name }), "success");
    });
  };

  if (!teamId || forbidden) return null;

  return (
    <div className="space-y-3" data-testid="group-access-section">
      <div>
        <label className="text-sm font-medium text-foreground flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          {t("sharing.title")}
        </label>
        <p className="text-xs text-muted-foreground mt-0.5">
          {t("sharing.hint", { scope: t(scope === "board" ? "sharing.scopeBoard" : "sharing.scopeDocument") })}
        </p>
      </div>

      {loading && entries.length === 0 ? (
        <p className="text-xs text-muted-foreground flex items-center gap-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {t("sharing.loading")}
        </p>
      ) : entries.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("sharing.empty")}</p>
      ) : (
        <ul className="space-y-2 max-h-48 overflow-y-auto pr-1">
          {entries.map((entry) => {
            const editable = canManage && canModifyGroupRole(callerRole, entry.role);
            const busy = busyId === entry.groupId;
            const options = roles.includes(entry.role) ? roles : [entry.role, ...roles];
            return (
              <li key={entry.groupId} className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="h-2.5 w-2.5 rounded-full shrink-0 bg-muted-foreground/50"
                    style={entry.color ? { backgroundColor: entry.color } : undefined}
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{entry.name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      @{entry.slug} · {t("sharing.members", { count: entry.memberCount })}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {editable ? (
                    <>
                      <select
                        aria-label={t("sharing.role")}
                        className={selectClass}
                        value={entry.role}
                        disabled={busy}
                        onChange={(e) => handleRole(entry, e.target.value as GroupAccessRole)}
                      >
                        {options.map((r) => (
                          <option key={r} value={r}>
                            {roleLabel(r)}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleRemove(entry)}
                        aria-label={t("sharing.removeLabel", { name: entry.name })}
                        title={t("sharing.remove")}
                        className="h-8 w-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-red-600 dark:hover:text-red-400 hover:bg-red-500/10 disabled:opacity-60"
                      >
                        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      </button>
                    </>
                  ) : (
                    <span className="text-xs font-medium text-muted-foreground px-2 py-1 rounded-md bg-muted">{roleLabel(entry.role)}</span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {canManage && (
        <div className="space-y-1">
          {candidates.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t("sharing.noneToAdd")}</p>
          ) : (
            <div className="flex items-center gap-2">
              <select
                aria-label={t("sharing.addGroup")}
                className={`${selectClass} flex-1 min-w-0`}
                value={pickedGroupId}
                onChange={(e) => setPickedGroupId(e.target.value)}
              >
                <option value="">{t("sharing.pickGroup")}</option>
                {candidates.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name} (@{g.slug})
                  </option>
                ))}
              </select>
              <select
                aria-label={t("sharing.role")}
                className={selectClass}
                value={newRole}
                onChange={(e) => setNewRole(e.target.value as GroupAccessRole)}
              >
                {roles.map((r) => (
                  <option key={r} value={r}>
                    {roleLabel(r)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={!pickedGroupId || busyId !== null}
                onClick={handleAdd}
                className="h-8 px-3 inline-flex items-center gap-1 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-50"
              >
                <Plus className="h-3.5 w-3.5" />
                {t("sharing.add")}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
