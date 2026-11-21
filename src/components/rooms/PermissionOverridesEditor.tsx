"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Globe, Megaphone, Lock, Trash2, Users, UserRound, Shield, AlertTriangle } from "lucide-react";
import { TriStateControl } from "@/components/roles/ui";
import { roomField, roomGhostButton, roomPrimaryButton } from "./RoomModalShell";
import type { RoomSubjects } from "@/hooks/use-room-subjects";
import {
  applyAnnouncementPreset, applyPrivatePreset, detectPreset, ensureSubject, removeSubject, ROOM_PERMISSION_KEYS, setState, stateOf,
  subjectKey, summarize, validateDrafts, EVERYONE,
  type OverrideDraft, type RoomPermissionKey, type Subject, type TriState,
} from "@/lib/rooms/tristate";
import { safeColor } from "@/lib/rooms/mentions";

type TFn = (key: string, params?: Record<string, string | number>) => string;

interface PermissionOverridesEditorProps {
  drafts: OverrideDraft[];
  onChange: (next: OverrideDraft[]) => void;
  subjects: RoomSubjects;
  isLoadingSubjects?: boolean;
  /** Keys shown, in order. Categories and channels use the same seven. */
  keys?: readonly RoomPermissionKey[];
  disabled?: boolean;
  t: TFn;
}

type PresetPanel = "announcement" | "private" | null;

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

/**
 * Editor of the tri-state permissions of a channel or category: per role / group / member / everyone, each of the seven
 * keys is yes, no or inherit. Presets cover the two common setups in one click. Pure state lives in lib/rooms/tristate.
 */
export function PermissionOverridesEditor({ drafts, onChange, subjects, isLoadingSubjects, keys = ROOM_PERMISSION_KEYS, disabled, t }: PermissionOverridesEditorProps) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [panel, setPanel] = useState<PresetPanel>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [addValue, setAddValue] = useState("");

  const preset = detectPreset(drafts);
  const warnings = validateDrafts(drafts);
  const rows = useMemo(() => {
    const everyone = drafts.find((d) => d.subjectType === "everyone") ?? { ...EVERYONE, states: {} };
    return [everyone as OverrideDraft, ...drafts.filter((d) => d.subjectType !== "everyone")];
  }, [drafts]);


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

  const applyPreset = () => {
    const ids = [...picked];
    onChange(panel === "announcement" ? applyAnnouncementPreset(drafts, ids) : applyPrivatePreset(drafts, ids));
    setPanel(null);
    setPicked(new Set());
    setOpenKey(null);
  };

  const pickedNames = subjects.roles.filter((r) => picked.has(r.id)).map((r) => r.name);

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">{t("perm.help")}</p>

      {/* Presets */}
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2" role="group" aria-label={t("perm.presets")}>
          <button
            type="button"
            disabled={disabled}
            aria-pressed={preset === "announcement"}
            onClick={() => { setPanel(panel === "announcement" ? null : "announcement"); setPicked(new Set()); }}
            className={`${roomGhostButton} ${preset === "announcement" || panel === "announcement" ? "!border-[var(--memphis-line)] !bg-muted !text-foreground" : ""}`}
          >
            <Megaphone className="h-3.5 w-3.5" aria-hidden />
            {t("perm.presetAnnouncement")}
          </button>
          <button
            type="button"
            disabled={disabled}
            aria-pressed={preset === "private"}
            onClick={() => { setPanel(panel === "private" ? null : "private"); setPicked(new Set()); }}
            className={`${roomGhostButton} ${preset === "private" || panel === "private" ? "!border-[var(--memphis-line)] !bg-muted !text-foreground" : ""}`}
          >
            <Lock className="h-3.5 w-3.5" aria-hidden />
            {t("perm.presetPrivate")}
          </button>
        </div>

        {panel && (
          <div className="rounded-xl border-2 border-[var(--memphis-line)] bg-muted/40 p-3">
            <p className="mb-2 text-xs font-semibold">
              {panel === "announcement"
                ? (pickedNames.length ? t("perm.announcementWho", { names: pickedNames.join(", ") }) : t("perm.announcementPick"))
                : (pickedNames.length ? t("perm.privateWho", { names: pickedNames.join(", ") }) : t("perm.privatePick"))}
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
                      className={`flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors focus-within:ring-2 focus-within:ring-[hsl(var(--accent-ink))] motion-reduce:transition-none ${on ? "border-[var(--memphis-line)] bg-background font-semibold" : "border-border text-muted-foreground hover:bg-background"}`}
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
              <button type="button" onClick={applyPreset} className={roomPrimaryButton}>{t("perm.apply")}</button>
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

      {/* Subjects */}
      <ul className="space-y-2">
        {rows.map((draft) => {
          const key = subjectKey(draft);
          const info = subjectLabel(draft, subjects, t);
          const open = openKey === key || (draft.subjectType === "everyone" && openKey === null && drafts.length === 0);
          const sum = summarize(draft);
          const panelId = `perm-${key.replace(/[^a-z0-9]/gi, "_")}`;
          return (
            <li key={key} className="overflow-hidden rounded-xl border border-border bg-background">
              <div className="flex items-center gap-1 pr-1">
                <button
                  type="button"
                  aria-expanded={open}
                  aria-controls={panelId}
                  onClick={() => setOpenKey(open ? "" : key)}
                  className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[hsl(var(--accent-ink))]"
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
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--accent-ink))]"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </button>
                )}
              </div>
              {open && (
                <div id={panelId} className="divide-y divide-border/60 border-t border-border/60">
                  {keys.map((k) => (
                    <div key={k} className="flex items-center justify-between gap-3 px-3 py-1.5">
                      <div className="min-w-0">
                        <div className="truncate text-xs font-medium">{t(`perm.keys.${k}`)}</div>
                        <div className="truncate text-[11px] text-muted-foreground">{t(`perm.keyHints.${k}`)}</div>
                      </div>
                      <TriStateControl
                        value={stateOf(draft, k)}
                        onChange={(next: TriState) => onChange(setState(drafts, draft, k, next))}
                        label={`${t(`perm.keys.${k}`)}: ${info.label}`}
                        disabled={disabled}
                      />
                    </div>
                  ))}
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
