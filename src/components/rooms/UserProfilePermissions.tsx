"use client";

import { useMemo } from "react";
import { Check, XCircle } from "lucide-react";

import { coreRoomCatalog, groupRoomKeys, permLabelPath, type KeyTextResolver, type RoomKeyInfo } from "@/lib/rooms/permission-catalog";
import type { MemberProfile } from "@/lib/rooms/user-profile";

type TFn = (key: string, params?: Record<string, string | number>) => string;

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border/50 bg-background/60 px-3 py-2.5">
      <h4 className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{title}</h4>
      {children}
    </section>
  );
}

/** What the person can do in THIS channel (permission engine v2: allowed / denied), grouped like the channel permissions editor. */
export function ChannelPermissions({ profile, t }: { profile: MemberProfile; t: TFn }) {
  const perms = profile.room?.permissions;
  const groups = useMemo(() => {
    const resolve: KeyTextResolver = {
      name: (k: RoomKeyInfo) => { const p = `perm.keys.${permLabelPath(k.key)}`; const v = t(p); return v === p ? k.key : v; },
      desc: () => "",
      group: (id) => { const p = `perm.keyGroups.${id}`; const v = t(p); return v === p ? id : v; },
    };
    const catalog = coreRoomCatalog();
    // Keys the server reported that the fixed list does not know still show (as allowed), never silently dropped.
    const known = new Set(catalog.universe);
    return { view: groupRoomKeys(catalog, resolve), resolve, extra: (perms?.allowed ?? []).filter((k) => !known.has(k)) };
  }, [t, perms]);
  if (!perms) return null;
  const allowed = new Set(perms.allowed);
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">{t("profile.perm.intro", { name: profile.displayName })}</p>
      <p className="text-xs font-semibold">{t("profile.perm.summary", { allowed: perms.allowed.length, denied: perms.denied.length })}</p>
      {!perms.canSee && <p role="note" className="rounded-lg border border-border/50 bg-muted/60 px-2.5 py-1.5 text-xs">{t("profile.perm.cannotSee")}</p>}
      {groups.view.map((g) => (
        <Block key={g.id} title={g.label}>
          <ul className="space-y-0.5">
            {g.keys.map((k) => {
              const ok = allowed.has(k.key);
              return (
                <li key={k.key} className="flex items-center gap-2 text-xs">
                  {ok ? <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden /> : <XCircle className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />}
                  <span className={ok ? "" : "text-muted-foreground"}>{groups.resolve.name(k)}</span>
                  <span className="sr-only">{ok ? t("profile.perm.allowed") : t("profile.perm.denied")}</span>
                </li>
              );
            })}
          </ul>
        </Block>
      ))}
      {groups.extra.length > 0 && (
        <Block title={t("perm.keyGroups.other")}>
          <ul className="space-y-0.5">
            {groups.extra.map((k) => (
              <li key={k} className="flex items-center gap-2 text-xs"><Check className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden /><span>{k}</span><span className="sr-only">{t("profile.perm.allowed")}</span></li>
            ))}
          </ul>
        </Block>
      )}
    </div>
  );
}
