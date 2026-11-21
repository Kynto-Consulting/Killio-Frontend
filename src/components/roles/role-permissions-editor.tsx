"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Info, Lock, Search } from "lucide-react";

import { useTranslations } from "@/components/providers/i18n-provider";
import { catalogIndex, groupCatalog, needsDangerConfirm, obsoleteKeys, providerOrigin, unmetRequires, type CatalogPermission, type PermissionCatalog, type PermissionScope } from "@/lib/roles/catalog";
import { permissionBlockReason, setTriState, triStateOf, type Actor, type PermissionMap, type TeamRole, type TriState } from "@/lib/roles/model";
import { Dialog, TriStateControl, btn, btnDanger, cx, inputCls } from "./ui";

/** i18n key of a permission: dots are not allowed inside a path segment. */
export const permI18n = (key: string) => key.replace(/[.]/g, "_");

/** Translation that falls back to a given text instead of echoing the key when it is missing. */
export function useTr(ns: "roles" = "roles") {
  const t = useTranslations(ns);
  return (key: string, fallback: string, params?: Record<string, string | number>) => {
    const v = t(key, params);
    return v === key ? fallback : v;
  };
}

/** Label / description of a permission: the server's text first, then the app's own translation, then the key. */
export function usePermText() {
  const tr = useTr();
  return {
    name: (d: Pick<CatalogPermission, "key" | "label">) => d.label || tr(`perm.${permI18n(d.key)}.name`, d.key),
    desc: (d: Pick<CatalogPermission, "key" | "description">) => d.description || tr(`perm.${permI18n(d.key)}.desc`, ""),
    nameOfKey: (catalog: PermissionCatalog, key: string) => {
      const d = catalogIndex(catalog).get(key);
      return d ? d.label || tr(`perm.${permI18n(key)}.name`, key) : key;
    },
    group: (id: string, label: string) => label || tr(`group.${id}`, id),
  };
}

/** Provider heading text and origin badge text. */
export function useProviderText() {
  const t = useTranslations("roles");
  return {
    label: (p: { id: string; label: string }) => p.label || (p.id === "core" ? t("catalog.coreName") : p.id),
    origin: (id: string) => t(`catalog.origin.${providerOrigin(id)}`),
  };
}

export function ApproxBanner() {
  const t = useTranslations("roles");
  return (
    <div role="status" className="flex items-start gap-2 rounded-lg border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-xs text-foreground">
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      <p><strong>{t("catalog.approxTitle")}</strong> {t("catalog.approxBody")}</p>
    </div>
  );
}

export function OriginBadge({ providerId }: { providerId: string }) {
  const p = useProviderText();
  return <span className="rounded border border-border bg-muted px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-muted-foreground">{p.origin(providerId)}</span>;
}

export function DangerBadge() {
  const t = useTranslations("roles");
  return (
    <span title={t("catalog.dangerousTitle")} className="inline-flex items-center gap-0.5 rounded border border-red-500/50 bg-red-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase text-red-800 dark:text-red-300">
      <AlertTriangle className="h-2.5 w-2.5" aria-hidden /> {t("catalog.dangerous")}
    </span>
  );
}

/**
 * Permission list built ONLY from the catalogue: one block per provider (with an origin badge), then per group.
 * Obsolete keys the role still stores are shown dimmed at the end, not editable.
 * `locked` = the whole role is read-only here (owner role, or the viewer cannot edit roles at all).
 */
export function RolePermissionsEditor({ role, value, onChange, actor, locked, lockedReason, catalog, scopes = ["team", "room"] }: { role: TeamRole; value: PermissionMap; onChange: (next: PermissionMap) => void; actor: Actor; locked?: boolean; lockedReason?: string | null; catalog: PermissionCatalog; scopes?: PermissionScope[] }) {
  const t = useTranslations("roles");
  const text = usePermText();
  const prov = useProviderText();
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState<{ key: string; next: TriState } | null>(null);

  const sections = useMemo(() => {
    const q = query.trim().toLowerCase();
    return groupCatalog(catalog, scopes)
      .map((s) => ({
        ...s,
        groups: s.groups
          .map((g) => ({ ...g, permissions: g.permissions.filter((d) => !q || `${text.name(d)} ${text.desc(d)} ${d.key} ${prov.label(s.provider)}`.toLowerCase().includes(q)) }))
          .filter((g) => g.permissions.length > 0),
      }))
      .filter((s) => s.groups.length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog, query, scopes.join(), t]);

  const obsolete = useMemo(() => obsoleteKeys(Object.keys(value), catalog), [value, catalog]);
  const isAllowed = (k: string) => value[k] === "allow";

  const reasonText = (k: string): string | null => {
    if (locked) return lockedReason ?? t("block.locked");
    const r = permissionBlockReason(actor, role, k);
    return r ? t(`block.${r}`) : null;
  };

  const request = (key: string, next: TriState) => {
    if (needsDangerConfirm(catalog, key, next) && value[key] !== "allow") setPending({ key, next });
    else onChange(setTriState(value, key, next));
  };

  const pendingDef = pending ? catalogIndex(catalog).get(pending.key) : null;

  return (
    <div className="space-y-4">
      {catalog.source === "approx" && <ApproxBanner />}
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

      {sections.length === 0 && obsolete.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">{t("permissions.noMatches")}</p>}

      {sections.map((s) => (
        <section key={s.provider.id} aria-labelledby={`perm-provider-${s.provider.id}`} className="space-y-3">
          <header className="flex flex-wrap items-center gap-2 border-b border-[var(--memphis-line)] pb-1">
            <h3 id={`perm-provider-${s.provider.id}`} className="text-sm font-bold text-foreground">{prov.label(s.provider)}</h3>
            <OriginBadge providerId={s.provider.id} />
            {s.provider.version && <span className="text-[10px] text-muted-foreground">v{s.provider.version}</span>}
            {s.provider.description && <span className="basis-full text-[11px] text-muted-foreground">{s.provider.description}</span>}
          </header>
          {s.groups.map((g) => (
            <div key={g.id} role="group" aria-label={text.group(g.id, g.label)}>
              <h4 className="mb-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{text.group(g.id, g.label)}</h4>
              <ul className="divide-y divide-border overflow-hidden rounded-xl border border-[var(--memphis-line)] bg-card">
                {g.permissions.map((d) => {
                  const reason = reasonText(d.key);
                  const state = triStateOf(value, d.key);
                  const missing = state === "allow" ? unmetRequires(d.key, isAllowed, catalog) : [];
                  return (
                    <li key={d.key} className="flex items-center justify-between gap-3 px-3 py-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-foreground">
                          <span className="truncate">{text.name(d)}</span>
                          {d.dangerous && <DangerBadge />}
                          {reason && <Lock className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />}
                        </div>
                        {text.desc(d) && <p className="text-xs text-muted-foreground">{text.desc(d)}</p>}
                        {reason && <p className="mt-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">{reason}</p>}
                        {missing.length > 0 && <p className="mt-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">{t("catalog.requires", { names: missing.map((k) => text.nameOfKey(catalog, k)).join(", ") })}</p>}
                      </div>
                      <TriStateControl value={state} disabled={!!reason} reason={reason} label={text.name(d)} onChange={(next) => request(d.key, next)} />
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </section>
      ))}

      {obsolete.length > 0 && (
        <section aria-labelledby="perm-obsolete" className="space-y-1 opacity-80">
          <h3 id="perm-obsolete" className="flex items-center gap-1.5 text-sm font-bold text-muted-foreground"><AlertTriangle className="h-3.5 w-3.5" aria-hidden />{t("catalog.obsoleteTitle")}</h3>
          <p className="text-xs text-muted-foreground">{t("catalog.obsoleteBody")}</p>
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-dashed border-border">
            {obsolete.map((k) => (
              <li key={k} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <code className="truncate text-xs text-muted-foreground line-through">{k}</code>
                  <span className="ml-2 rounded border border-border px-1 text-[9px] font-bold uppercase text-muted-foreground">{t("catalog.obsoleteBadge")}</span>
                </div>
                <TriStateControl value={triStateOf(value, k)} disabled reason={t("catalog.obsoleteLocked")} label={k} onChange={() => undefined} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {pending && pendingDef && (
        <Dialog
          title={t("catalog.dangerConfirmTitle", { name: text.name(pendingDef) })}
          onClose={() => setPending(null)}
          footer={
            <>
              <button type="button" className={btn} onClick={() => setPending(null)}>{t("common.cancel")}</button>
              <button type="button" className={btnDanger} onClick={() => { onChange(setTriState(value, pending.key, pending.next)); setPending(null); }}>{t("catalog.dangerConfirm")}</button>
            </>
          }
        >
          <p className="flex items-start gap-2 text-sm text-foreground"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-300" aria-hidden />{t("catalog.dangerConfirmBody")}</p>
          {text.desc(pendingDef) && <p className="text-xs text-muted-foreground">{text.desc(pendingDef)}</p>}
        </Dialog>
      )}
    </div>
  );
}
