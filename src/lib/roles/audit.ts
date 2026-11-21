/** Pure helpers for the moderation log: action keys, readable fallbacks and metadata summaries. */

/** Actions the backend writes (team_audit_log); the filter offers these. */
export const AUDIT_FILTER_ACTIONS = [
  "member.kicked", "member.banned", "member.unbanned", "member.muted", "member.unmuted",
  "member.roles_changed", "member.role_changed", "role.created", "role.updated", "role.deleted", "role.reordered",
  "group.roles_changed", "ownership.transferred", "invite.revoked", "resource.permissions_changed",
] as const;

/** `group.roles_changed` -> `group_roles_changed` (i18n keys cannot contain the dot separator). */
export const auditActionKey = (action: string) => action.replace(/\./g, "_");

/** Readable fallback for an action nobody translated: `foo.bar_baz` -> `Foo bar baz`. */
export function humanizeKey(raw: string): string {
  const s = raw.replace(/[._-]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").trim().toLowerCase();
  return s ? s[0].toUpperCase() + s.slice(1) : raw;
}

export interface MetaItem { key: string; value: string }

/**
 * Flat summary of an entry's metadata: scalars as text, id arrays resolved through `resolve` (role / group / member names),
 * nested objects skipped. At most `max` items so a row stays short.
 */
export function summarizeMetadata(metadata: Record<string, unknown>, resolve: (id: string) => string | null, max = 4): MetaItem[] {
  const out: MetaItem[] = [];
  const one = (v: unknown): string | null => {
    if (typeof v === "string") return resolve(v) ?? (v.length > 60 ? `${v.slice(0, 57)}...` : v);
    if (typeof v === "number" || typeof v === "boolean") return String(v);
    return null;
  };
  for (const [key, v] of Object.entries(metadata ?? {})) {
    if (out.length >= max) break;
    if (v == null || v === "") continue;
    if (Array.isArray(v)) {
      const parts = v.map(one).filter((x): x is string => !!x);
      if (parts.length) out.push({ key, value: parts.join(", ") });
    } else {
      const text = one(v);
      if (text) out.push({ key, value: text });
    }
  }
  return out;
}
