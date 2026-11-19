"use client";

import { useId } from "react";
import { Users } from "lucide-react";

import { useTranslations } from "@/components/providers/i18n-provider";
import { getUserAvatarUrl } from "@/lib/gravatar";
import { initials, nameHue } from "@/lib/boards/gantt-layout";
import type { Owner, StatusKind } from "@/lib/boards/backlog-common";
import type { GroupingTabConfig } from "@/lib/boards/board-tabs";

/** Colour of each status kind (bar segment, legend dot, chip). Fixed palette that reads in light and dark mode. */
export const STATUS_TONE: Record<StatusKind, { bar: string; chip: string }> = {
  pending: { bar: "bg-slate-400 dark:bg-slate-500", chip: "bg-slate-500/10 text-slate-700 dark:text-slate-300" },
  doing: { bar: "bg-blue-500", chip: "bg-blue-500/10 text-blue-700 dark:text-blue-300" },
  waiting: { bar: "bg-amber-500", chip: "bg-amber-500/10 text-amber-700 dark:text-amber-300" },
  review: { bar: "bg-violet-500", chip: "bg-violet-500/10 text-violet-700 dark:text-violet-300" },
  next: { bar: "bg-cyan-500", chip: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-300" },
  done: { bar: "bg-emerald-500", chip: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
  deprioritized: { bar: "bg-zinc-300 dark:bg-zinc-600", chip: "bg-zinc-500/10 text-zinc-600 dark:text-zinc-300" },
  cancelled: { bar: "bg-rose-300 dark:bg-rose-400/70", chip: "bg-rose-500/10 text-rose-700 dark:text-rose-300" },
  blocked: { bar: "bg-red-500", chip: "bg-red-500/10 text-red-700 dark:text-red-300" },
};

export function OwnerAvatar({ owner, size = 20 }: { owner: Owner; size?: number }) {
  const style = { width: size, height: size };
  if (owner.avatarUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={getUserAvatarUrl(owner.avatarUrl, owner.email, size * 2)} alt="" title={owner.name} style={style} className="shrink-0 rounded-full border border-border object-cover" />;
  }
  return (
    <span title={owner.name} style={{ ...style, backgroundColor: `hsl(${nameHue(owner.name)} 55% 42%)`, fontSize: Math.max(8, size * 0.42) }} className="inline-flex shrink-0 items-center justify-center rounded-full border border-border font-semibold text-white">
      {initials(owner.name)}
    </span>
  );
}

export interface GroupLevel {
  key: keyof GroupingTabConfig;
  label: string;
  /** Name currently configured; empty = the default match. */
  value: string;
  defaultName: string;
}

interface BacklogControlsProps {
  owners: Owner[];
  ownerKey: string | null;
  onOwnerChange: (key: string | null) => void;
  levels: GroupLevel[];
  /** Tag group names / tag prefixes the board offers. */
  groupOptions: string[];
  canEdit: boolean;
  onGroupChange: (key: keyof GroupingTabConfig, value: string | null) => void;
}

/** The top bar of the Resumen / Proyectos views: "Responsable" filter (per browser session) and "Agrupar por" selectors (saved in the tab). */
export function BacklogControls({ owners, ownerKey, onOwnerChange, levels, groupOptions, canEdit, onGroupChange }: BacklogControlsProps) {
  const t = useTranslations("board-detail");
  const uid = useId();
  const select = "h-8 min-w-0 max-w-[11rem] rounded-md border border-border bg-background px-2 text-xs font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60";
  const selectedOwner = owners.find((o) => o.key === ownerKey) ?? null;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground" htmlFor={`${uid}-owner`}>
        {selectedOwner ? <OwnerAvatar owner={selectedOwner} size={18} /> : <Users className="h-3.5 w-3.5" aria-hidden />}
        {t("summary.filterOwner")}
        <select id={`${uid}-owner`} value={selectedOwner ? selectedOwner.key : ""} onChange={(e) => onOwnerChange(e.target.value || null)} className={select}>
          <option value="">{t("summary.allOwners")}</option>
          {owners.map((o) => (
            <option key={o.key} value={o.key}>
              {o.name}
            </option>
          ))}
        </select>
      </label>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2" role="group" aria-label={t("summary.groupBy")}>
        <span className="text-xs font-medium text-muted-foreground">{t("summary.groupBy")}</span>
        {levels.map((lv) => {
          const options = lv.value && !groupOptions.some((g) => g.toLowerCase() === lv.value.toLowerCase()) ? [lv.value, ...groupOptions] : groupOptions;
          return (
            <label key={lv.key} className="flex items-center gap-1.5 text-xs text-muted-foreground" htmlFor={`${uid}-${lv.key}`}>
              {lv.label}
              <select id={`${uid}-${lv.key}`} value={lv.value} disabled={!canEdit} onChange={(e) => onGroupChange(lv.key, e.target.value || null)} className={select}>
                <option value="">{t("summary.groupDefault", { name: lv.defaultName })}</option>
                {options.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </label>
          );
        })}
      </div>
    </div>
  );
}
