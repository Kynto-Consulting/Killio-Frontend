"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle, ChevronDown, ChevronRight, Globe, Lock, Megaphone, Eye, Shield, ShieldCheck, Bot, Search, Trash2, Users, UserRound,
} from "lucide-react";
import { TriStateControl } from "@/components/roles/ui";
import { roomField, roomGhostButton, roomPrimaryButton } from "./RoomModalShell";
import type { RoomSubjects } from "@/hooks/use-room-subjects";
import {
  groupRoomKeys, groupRuleCounts, type KeyTextResolver, type RoomKeyInfo, type RoomPermissionCatalog,
} from "@/lib/rooms/permission-catalog";
import {
  applyAnnouncementPreset, applyBotsPreset, applyModerationPreset, applyPrivatePreset, applyReadonlyPreset, availablePresets, detectPreset,
  ensureSubject, removeSubject, setState, stateOf, subjectKey, summarize, validateDrafts, EVERYONE,
  type OverrideDraft, type PresetId, type Subject, type TriState,
} from "@/lib/rooms/tristate";
import { safeColor } from "@/lib/rooms/mentions";

type TFn = (key: string, params?: Record<string, string | number>) => string;

interface PermissionOverridesEditorProps {
  drafts: OverrideDraft[];
  onChange: (next: OverrideDraft[]) => void;
  subjects: RoomSubjects;
  isLoadingSubjects?: boolean;
  /** The keys to show (the server's universe, or the fixed fallback). Channels and categories use the same ones. */
  catalog: RoomPermissionCatalog;
  disabled?: boolean;
  t: TFn;
}

/** Presets that first ask which roles they are for; the rest apply in one click. */
type RolePreset = Extract<PresetId, "announcement" | "private" | "moderation">;
const ROLE_PRESETS: readonly RolePreset[] = ["announcement", "private", "moderation"];
const isRolePreset = (p: PresetId): p is RolePreset => (ROLE_PRESETS as readonly string[]).includes(p);

const PRESET_ICON: Record<PresetId, React.ReactNode> = {
  announcement: <Megaphone className="h-3.5 w-3.5" aria-hidden />,
  private: <Lock className="h-3.5 w-3.5" aria-hidden />,
  readonly: <Eye className="h-3.5 w-3.5" aria-hidden />,
  moderation: <ShieldCheck className="h-3.5 w-3.5" aria-hidden />,
  bots: <Bot className="h-3.5 w-3.5" aria-hidden />,
};
const PRESET_LABEL: Record<PresetId, string> = {
  announcement: "perm.presetAnnouncement",
  private: "perm.presetPrivate",
  readonly: "perm.presetReadonly",
  moderation: "perm.presetModeration",
  bots: "perm.presetBots",
};

function subjectLabel(subject: Subject, subjects: RoomSubjects, t: TFn): { label: string; color: string | null; icon: React.ReactNode } {
  if (subject.subjectType === "everyone") return { label: t("perm.everyone"), color: null, icon: <Globe className="h-3.5 w-3.5" aria-hidden /> };
  if (subject.subjectType === "role") {
    const role = subjects.roles.find((r) => r.id === subject.subjectId);
    return { label: role?.name ?? t("perm.unknownRole"), color: safeColor(role?.color), icon: <Shield className="h-3.5 w-3.5" aria-hidden /> };
  }
  if (subject.subjectType === "group") {
    const group = subjects.groups.find((g) => g.id === subject.subjectId);
    return { label: group?.name ?? t("perm.unknownGroup"), color: safeColor(group?.color), icon: <Users className="h-3.5 w-3.5" aria-hidden /> };
  }
  const member = subjects.members.find((m) => m.id === subject.subjectId);
  return { label: member?.name ?? t("perm.unknownMember"), color: null, icon: <UserRound className="h-3.5 w-3.5" aria-hidden /> };
}

/** i18n of the editor's own text for a key: `perm.keys.room.view` (nested objects, no dots inside a segment). Empty when missing. */
function ownText(t: TFn, ns: "keys" | "keyHints", key: string): string {
  const path = `perm.${ns}.${key}`;
  const v = t(path);
  return v === path ? "" : v;
}

/**
 * Editor of the tri-state permissions of a channel or category: per role / group / member / everyone, every key of the catalog is
 * yes, no or inherit. Keys come from the server (grouped, searchable, with its texts); the fixed list is only the fallback.
 * Presets cover the common setups in one click. Pure state lives in lib/rooms/tristate and lib/rooms/permission-catalog.
 */
export function PermissionOverridesEditor({ drafts, onChange, subjects, isLoadingSubjects, catalog, disabled, t }: PermissionOverridesEditorProps) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [panel, setPanel] = useState<RolePreset | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [addValue, setAddValue] = useState("");
  const [query, setQuery] = useState("");
  /** Explicit open / closed state of a key group; a group with no explicit state opens when it holds rules or a search is active. */
  const [groupOpen, setGroupOpen] = useState<Record<string, boolean>>({});

  const preset = detectPreset(drafts);
  const presets = useMemo(() => availablePresets(catalog.universeSet), [catalog]);
  const warnings = validateDrafts(drafts);
  const rows = useMemo(() => {
    const everyone = drafts.find((d) => d.subjectType === "everyone") ?? { ...EVERYONE, states: {} };
    return [everyone as OverrideDraft, ...drafts.filter((d) => d.subjectType !== "everyone")];
  }, [drafts]);

  // Texts: the app-language text of the team catalogue, then the editor's own translation, then the server's (English) text, then the key.
  const resolve = useMemo<KeyTextResolver>(() => ({
    name: (k) => (k.localized ? k.label : ownText(t, "keys", k.key) || k.label || k.key),
    desc: (k) => (k.localized ? k.description : ownText(t, "keyHints", k.key) || k.description),
    group: (id, label) => {
      if (id.startsWith("srv:")) return label || t("perm.keyGroups.other");
      const own = t(`perm.keyGroups.${id}`);
      return own === `perm.keyGroups.${id}` ? id : own;
    },
  }), [t]);

  const allGroups = useMemo(() => groupRoomKeys(catalog, resolve), [catalog, resolve]);
  const groups = useMemo(() => groupRoomKeys(catalog, resolve, query), [catalog, resolve, query]);
  const searching = query.trim().length > 0;
  const nameOfKey = (key: string) => {
    const k = catalog.index.get(key);
    return k ? resolve.name(k) : key;
  };

  const addable = useMemo(() => {
    const present = new Set(drafts.map(subjectKey));
    return {
      roles: subjects.roles.filter((r) => !present.has(`role:${r.id}`)),
      groups: subjects.groups.filter((g) => !present.has(`group:${g.id}`)),
      members: subjects.members.filter((m) => !present.has(`member:${m.id}`)),
    };
  }, [drafts, subjects]);

  const togglePicked = (id: string) => setPicked((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const applyRolePreset = () => {
    const ids = [...picked];
    const universe = catalog.universeSet;
    onChange(panel === "announcement" ? applyAnnouncementPreset(drafts, ids, universe)
      : panel === "moderation" ? applyModerationPreset(drafts, ids, universe)
      : applyPrivatePreset(drafts, ids, universe));
    setPanel(null);
    setPicked(new Set());
    setOpenKey(null);
  };

  const clickPreset = (id: PresetId) => {
    if (isRolePreset(id)) {
      setPanel(panel === id ? null : id);
      setPicked(new Set());
      return;
    }
    setPanel(null);
    onChange(id === "readonly" ? applyReadonlyPreset(drafts, catalog.universeSet) : applyBotsPreset(drafts, catalog.universeSet));
    setOpenKey(null);
  };

  const pickedNames = subjects.roles.filter((r) => picked.has(r.id)).map((r) => r.name);
  const setAllGroups = (open: boolean) => setGroupOpen(Object.fromEntries(allGroups.map((g) => [g.id, open])));

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">{t("perm.help")}</p>
      {catalog.source === "fallback" && (
        <p role="status" className="rounded-xl border border-border bg-muted/50 p-2.5 text-[11px] text-muted-foreground">{t("perm.fallbackNote")}</p>
      )}

      {/* Presets */}
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2" role="group" aria-label={t("perm.presets")}>
          {presets.map((id) => {
            const on = preset === id || panel === id;
            return (
              <button
                key={id}
                type="button"
                disabled={disabled}
                aria-pressed={preset === id}
                title={t(`${PRESET_LABEL[id]}Hint`)}
                onClick={() => clickPreset(id)}
                className={`${roomGhostButton} ${on ? "!border-primary !bg-primary/5 !ring-1 !ring-primary/30 !text-foreground" : ""}`}
              >
                {PRESET_ICON[id]}
                {t(PRESET_LABEL[id])}
              </button>
            );
          })}
        </div>

        {panel && (
          <div className="rounded-xl border border-border bg-muted/40 p-3">
            <p className="mb-2 text-xs font-semibold">
              {pickedNames.length ? t(`perm.${panel}Who`, { names: pickedNames.join(", ") }) : t(`perm.${panel}Pick`)}
            </p>
            {subjects.roles.length === 0 ? (
              <p className="text-xs text-muted-foreground">{isLoadingSubjects ? t("perm.loading") : t("perm.noRoles")}</p>
            ) : (
              <div className="mb-3 flex flex-wrap gap-1.5">
                {subjects.roles.map((r) => {
                  const on = picked.has(r.id);
                  const color = safeColor(r.color);
                  return (
                    <label
                      key={r.id}
                      className={`flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors focus-within:ring-2 focus-within:ring-primary/40 motion-reduce:transition-none ${on ? "border-primary bg-primary/5 ring-1 ring-primary/30 font-semibold" : "border-border text-muted-foreground hover:bg-background"}`}
                    >
                      <input type="checkbox" className="sr-only" checked={on} onChange={() => togglePicked(r.id)} />
                      <span className="h-2 w-2 rounded-full" style={{ background: color ?? "currentColor" }} aria-hidden />
                      {r.name}
                    </label>
                  );
                })}
              </div>
            )}
            <div className="flex gap-2">
              <button type="button" onClick={applyRolePreset} className={roomPrimaryButton}>{t("perm.apply")}</button>
              <button type="button" onClick={() => { setPanel(null); setPicked(new Set()); }} className={roomGhostButton}>{t("perm.cancel")}</button>
            </div>
          </div>
        )}
      </div>

      {warnings.length > 0 && (
        <div role="status" className="space-y-1 rounded-xl border border-amber-500/50 bg-amber-500/10 p-2.5 text-xs text-amber-800 dark:text-amber-200">
          {warnings.map((w) => (
            <p key={w} className="flex items-start gap-1.5"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />{t(`perm.warn.${w}`)}</p>
          ))}
        </div>
      )}

      {/* Search over the keys of every subject */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("perm.search")}
            aria-label={t("perm.search")}
            className={`${roomField} pl-8`}
          />
        </div>
        {!searching && (
          <button type="button" onClick={() => setAllGroups(!allGroups.every((g) => groupOpen[g.id]))} className={roomGhostButton}>
            {allGroups.every((g) => groupOpen[g.id]) ? t("perm.collapseAll") : t("perm.expandAll")}
          </button>
        )}
      </div>

      {/* Subjects */}
      <ul className="space-y-2">
        {rows.map((draft) => {
          const key = subjectKey(draft);
          const info = subjectLabel(draft, subjects, t);
          const open = openKey === key || (draft.subjectType === "everyone" && openKey === null && drafts.length === 0) || (searching && openKey !== "");
          const sum = summarize(draft, catalog.universe);
          const counts = groupRuleCounts(draft.states, allGroups);
          const panelId = `perm-${key.replace(/[^a-z0-9]/gi, "_")}`;
          return (
            <li key={key} className="overflow-hidden rounded-xl border border-border bg-background">
              <div className="flex items-center gap-1 pr-1">
                <button
                  type="button"
                  aria-expanded={open}
                  aria-controls={panelId}
                  onClick={() => setOpenKey(open ? "" : key)}
                  className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40"
                >
                  {open ? <ChevronDown className="h-3.5 w-3.5 shrink-0" aria-hidden /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden />}
                  <span className="flex items-center gap-1.5 truncate" style={info.color ? { color: info.color } : undefined}>
                    {info.icon}
                    <span className="truncate">{info.label}</span>
                  </span>
                  <span className="ml-auto shrink-0 text-[11px] font-normal text-muted-foreground">
                    {sum.allow + sum.deny === 0 ? t("perm.noRules") : t("perm.summary", { allow: sum.allow, deny: sum.deny })}
                  </span>
                </button>
                {draft.subjectType !== "everyone" && (
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => onChange(removeSubject(drafts, draft))}
                    aria-label={t("perm.removeSubject", { name: info.label })}
                    title={t("perm.removeSubject", { name: info.label })}
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </button>
                )}
              </div>
              {open && (
                <div id={panelId} className="border-t border-border/60">
                  {groups.length === 0 && <p className="px-3 py-3 text-xs text-muted-foreground">{t("perm.noMatches")}</p>}
                  {groups.map((g) => {
                    const count = counts.get(g.id) ?? { allow: 0, deny: 0 };
                    const rules = count.allow + count.deny;
                    const groupPanelId = `${panelId}-${g.id.replace(/[^a-z0-9]/gi, "_")}`;
                    const groupIsOpen = searching || (groupOpen[g.id] ?? rules > 0);
                    return (
                      <div key={g.id} role="group" aria-label={g.label}>
                        <button
                          type="button"
                          aria-expanded={groupIsOpen}
                          aria-controls={groupPanelId}
                          disabled={searching}
                          onClick={() => setGroupOpen((prev) => ({ ...prev, [g.id]: !groupIsOpen }))}
                          className="flex w-full items-center gap-1.5 border-t border-border/60 bg-muted/40 px-3 py-1 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground first:border-t-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40"
                        >
                          {groupIsOpen ? <ChevronDown className="h-3 w-3 shrink-0" aria-hidden /> : <ChevronRight className="h-3 w-3 shrink-0" aria-hidden />}
                          <span className="truncate">{g.label}</span>
                          <span className="font-normal normal-case tracking-normal">({g.keys.length})</span>
                          {rules > 0 && (
                            <span className="ml-auto rounded-full bg-background px-1.5 py-0.5 font-semibold normal-case tracking-normal text-foreground">
                              {t("perm.summary", { allow: count.allow, deny: count.deny })}
                            </span>
                          )}
                        </button>
                        {groupIsOpen && (
                          <div id={groupPanelId} className="divide-y divide-border/60">
                            {g.keys.map((k) => (
                              <KeyRow
                                key={k.key}
                                info={k}
                                name={resolve.name(k)}
                                description={resolve.desc(k)}
                                state={stateOf(draft, k.key)}
                                parentName={k.impliedBy ? nameOfKey(k.impliedBy) : null}
                                subjectName={info.label}
                                disabled={disabled}
                                onChange={(next) => onChange(setState(drafts, draft, k.key, next))}
                                t={t}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {/* Add subject */}
      <div className="flex gap-2">
        <select
          value={addValue}
          disabled={disabled}
          onChange={(e) => setAddValue(e.target.value)}
          aria-label={t("perm.addLabel")}
          className={`${roomField} flex-1`}
        >
          <option value="">{isLoadingSubjects ? t("perm.loading") : t("perm.addPlaceholder")}</option>
          {addable.roles.length > 0 && (
            <optgroup label={t("perm.roles")}>{addable.roles.map((r) => <option key={r.id} value={`role:${r.id}`}>{r.name}</option>)}</optgroup>
          )}
          {addable.groups.length > 0 && (
            <optgroup label={t("perm.groups")}>{addable.groups.map((g) => <option key={g.id} value={`group:${g.id}`}>{g.name}</option>)}</optgroup>
          )}
          {addable.members.length > 0 && (
            <optgroup label={t("perm.members")}>{addable.members.map((m) => <option key={m.id} value={`member:${m.id}`}>{m.name}</option>)}</optgroup>
          )}
        </select>
        <button
          type="button"
          disabled={disabled || !addValue}
          onClick={() => {
            const [subjectType, ...rest] = addValue.split(":");
            const subject: Subject = { subjectType: subjectType as Subject["subjectType"], subjectId: rest.join(":") };
            onChange(ensureSubject(drafts, subject));
            setOpenKey(subjectKey(subject));
            setAddValue("");
          }}
          className={roomGhostButton}
        >
          {t("perm.add")}
        </button>
      </div>
    </div>
  );
}

interface KeyRowProps {
  info: RoomKeyInfo;
  name: string;
  description: string;
  state: TriState;
  /** Label of the key this one falls back to while it stays on "inherit" (null = it decides alone). */
  parentName: string | null;
  subjectName: string;
  disabled?: boolean;
  onChange: (next: TriState) => void;
  t: TFn;
}

function KeyRow({ info, name, description, state, parentName, subjectName, disabled, onChange, t }: KeyRowProps) {
  const inheritText = parentName ? t("perm.inheritsFrom", { name: parentName }) : null;
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-1.5" title={description || undefined}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5 text-xs font-medium">
          <span className="truncate">{name}</span>
          {info.dangerous && (
            <span title={t("perm.dangerousTitle")} className="inline-flex shrink-0 items-center gap-0.5 rounded border border-red-500/50 bg-red-500/10 px-1 py-px text-[9px] font-bold uppercase text-red-800 dark:text-red-300">
              <AlertTriangle className="h-2.5 w-2.5" aria-hidden />{t("perm.dangerous")}
            </span>
          )}
        </div>
        {description && <div className="truncate text-[11px] text-muted-foreground">{description}</div>}
        {inheritText && state === "inherit" && <div className="truncate text-[11px] text-muted-foreground/90">{"↳ "}{inheritText}</div>}
      </div>
      <TriStateControl value={state} onChange={onChange} label={`${name}: ${subjectName}`} disabled={disabled} />
    </div>
  );
}
