"use client";

import { useTranslations } from "@/components/providers/i18n-provider";
import { assignBlockReason, sortRoles, type Actor, type TeamRole } from "@/lib/roles/model";
import { RoleChip, cx } from "./ui";

/**
 * Multi-select of roles. Roles the person using the screen cannot hand out (above them, the owner role,
 * or carrying permissions they lack) stay visible but disabled, with the reason. A role that is already
 * selected and locked keeps its value, so editing other roles never silently removes it.
 */
export function RolePicker({ roles, value, onChange, actor, disabled, hideOwner = true, className }: { roles: TeamRole[]; value: string[]; onChange: (ids: string[]) => void; actor: Actor; disabled?: boolean; hideOwner?: boolean; className?: string }) {
  const t = useTranslations("roles");
  const list = sortRoles(roles).filter((r) => !(hideOwner && r.systemKey === "owner" && !value.includes(r.id)));
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);

  if (list.length === 0) return <p className="text-xs text-muted-foreground">{t("picker.noRoles")}</p>;
  return (
    <ul role="group" aria-label={t("picker.label")} className={cx("max-h-56 divide-y divide-border overflow-y-auto rounded-lg border border-border", className)}>
      {list.map((r) => {
        const block = assignBlockReason(actor, r);
        const off = disabled || !!block;
        return (
          <li key={r.id}>
            <label className={cx("flex items-center gap-3 px-3 py-2 text-sm", off ? "cursor-not-allowed opacity-70" : "cursor-pointer hover:bg-accent/10")}>
              <input type="checkbox" checked={value.includes(r.id)} disabled={off} onChange={() => toggle(r.id)} className="h-4 w-4" />
              <RoleChip name={r.name} color={r.color} />
              {block && <span className="ml-auto text-[11px] text-muted-foreground">{t(`block.assign.${block}`)}</span>}
            </label>
          </li>
        );
      })}
    </ul>
  );
}
