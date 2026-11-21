"use client";

import { useMemo, useState } from "react";
import { Info, Lock, Search } from "lucide-react";

import { useTranslations } from "@/components/providers/i18n-provider";
import { PERMISSION_GROUPS, permissionBlockReason, setTriState, triStateOf, type Actor, type PermissionMap, type TeamRole } from "@/lib/roles/model";
import { TriStateControl, cx, inputCls } from "./ui";

/** i18n key of a permission: dots are not allowed inside a path segment. */
export const permI18n = (key: string) => key.replace(/[.]/g, "_");

/**
 * Permission list grouped by area with a tri-state control per permission.
 * `locked` = the whole role is read-only here (owner role, or the viewer cannot edit roles at all).
 */
export function RolePermissionsEditor({ role, value, onChange, actor, locked, lockedReason }: { role: TeamRole; value: PermissionMap; onChange: (next: PermissionMap) => void; actor: Actor; locked?: boolean; lockedReason?: string | null }) {
  const t = useTranslations("roles");
  const [query, setQuery] = useState("");

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    return PERMISSION_GROUPS.map((g) => ({
      id: g.id,
      keys: g.keys.filter((k) => {
        if (!q) return true;
        return `${t(`perm.${permI18n(k)}.name`)} ${t(`perm.${permI18n(k)}.desc`)} ${k}`.toLowerCase().includes(q);
      }),
    })).filter((g) => g.keys.length > 0);
  }, [query, t]);

  const reasonText = (k: string): string | null => {
    if (locked) return lockedReason ?? t("block.locked");
    const r = permissionBlockReason(actor, role, k);
    return r ? t(`block.${r}`) : null;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        <p>{t("cascade.explain")}</p>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("permissions.search")} aria-label={t("permissions.search")} className={cx(inputCls, "pl-9")} />
      </div>

      <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground" aria-hidden>
        <span><b className="text-emerald-700 dark:text-emerald-300">✓</b> {t("tri.allowHint")}</span>
        <span><b>–</b> {t("tri.inheritHint")}</span>
        <span><b className="text-red-700 dark:text-red-300">✗</b> {t("tri.denyHint")}</span>
      </div>

      {groups.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">{t("permissions.noMatches")}</p>}

      {groups.map((g) => (
        <section key={g.id} aria-labelledby={`perm-group-${g.id}`}>
          <h3 id={`perm-group-${g.id}`} className="mb-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            {t(`group.${g.id}`)}
          </h3>
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-[var(--memphis-line)] bg-card">
            {g.keys.map((k) => {
              const reason = reasonText(k);
              const state = triStateOf(value, k);
              return (
                <li key={k} className="flex items-center justify-between gap-3 px-3 py-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                      <span className="truncate">{t(`perm.${permI18n(k)}.name`)}</span>
                      {reason && <Lock className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />}
                    </div>
                    <p className="text-xs text-muted-foreground">{t(`perm.${permI18n(k)}.desc`)}</p>
                    {reason && <p className="mt-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">{reason}</p>}
                  </div>
                  <TriStateControl value={state} disabled={!!reason} reason={reason} label={t(`perm.${permI18n(k)}.name`)} onChange={(s) => onChange(setTriState(value, k, s))} />
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
