"use client";

/**
 * Small form controls of the room / bot node properties: labelled row, entity picker (room / person, or a variable), template field with
 * `{variable}` autocomplete and mention inserter, emoji and weekday pickers. Pure rules: lib/bots/room-nodes.ts.
 * All strings come from `integrations.canvas.room.*`.
 */

import { useId, useMemo, useRef, useState, type ReactNode } from "react";

import { useTranslations } from "@/components/providers/i18n-provider";
import { cx } from "@/components/roles/ui";
import { applyTemplateVariable, filterVariables, templateTrigger, unknownVariables, varI18nKey, type PayloadVar } from "@/lib/bots/room-nodes";
import { Emoji, EmojiPickerButton } from "@/components/emoji";

export const fieldCls =
  "w-full rounded-md border border-border bg-background px-2.5 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60";
export const miniBtn =
  "inline-flex h-7 items-center justify-center gap-1 rounded-md border border-border bg-background px-2 text-[11px] font-semibold text-foreground hover:bg-accent/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

/** Label + control + hint + error, wired with ids so a screen reader reads all of it. */
export function FieldRow({ label, hint, error, required, children, htmlFor, fieldId }: { label: string; hint?: string; error?: string | null; required?: boolean; children: ReactNode; htmlFor?: string; fieldId?: string }) {
  const t = useTranslations("integrations");
  return (
    <div data-field={fieldId}>
      <label htmlFor={htmlFor} className="mb-1 block text-[11px] font-medium text-muted-foreground">
        {label}
        {required && <span className="ml-1 text-red-700 dark:text-red-300" title={t("canvas.room.required")}>*</span>}
      </label>
      {children}
      {hint && <p id={htmlFor ? `${htmlFor}-hint` : undefined} className="mt-1 text-[10px] leading-snug text-muted-foreground">{hint}</p>}
      {error && <p id={htmlFor ? `${htmlFor}-err` : undefined} role="alert" className="mt-1 text-[11px] font-medium text-red-700 dark:text-red-300">{error}</p>}
    </div>
  );
}

/* ───────────── entity picker ───────────── */

export interface EntityOption {
  id: string;
  label: string;
  hint?: string;
}

const CUSTOM = "__custom__";

/**
 * Pick a room / person from a list, or type a variable (`{{ invokedBy }}`) / id. A value that is not in the list is shown as text so
 * nothing the author wrote is ever hidden or lost.
 */
export function EntityField({ id, value, onChange, options, loading, emptyLabel, customLabel, listLabel, placeholder, ariaDescribedBy }: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  options: readonly EntityOption[];
  loading?: boolean;
  /** Text of the "nothing chosen" entry. */
  emptyLabel: string;
  customLabel: string;
  listLabel: string;
  placeholder?: string;
  ariaDescribedBy?: string;
}) {
  const known = useMemo(() => new Set(options.map((o) => o.id)), [options]);
  const [forceText, setForceText] = useState(false);
  const textMode = forceText || (value !== "" && !known.has(value) && !loading);
  if (textMode) {
    return (
      <div className="flex gap-1.5">
        <input id={id} type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-describedby={ariaDescribedBy} spellCheck={false} className={cx(fieldCls, "font-mono")} />
        <button type="button" className={miniBtn} onClick={() => { setForceText(false); onChange(""); }}>{listLabel}</button>
      </div>
    );
  }
  return (
    <select
      id={id}
      value={known.has(value) ? value : ""}
      aria-describedby={ariaDescribedBy}
      aria-busy={loading || undefined}
      onChange={(e) => {
        if (e.target.value === CUSTOM) { setForceText(true); return; }
        onChange(e.target.value);
      }}
      className={fieldCls}
    >
      <option value="">{emptyLabel}</option>
      {options.map((o) => <option key={o.id} value={o.id}>{o.label}{o.hint ? ` · ${o.hint}` : ""}</option>)}
      <option value={CUSTOM}>{customLabel}</option>
    </select>
  );
}

/* ───────────── template field ───────────── */

export interface MentionSource {
  users: readonly EntityOption[];
  roles: readonly EntityOption[];
}

/**
 * Text that is a template: `{field}` and `{{ expression }}` are filled with the run's data. Typing `{` opens the list of variables
 * available at this node; "Insert" does the same without typing. Mentions insert `@[Name](id)` / `@[Name](role:id)`.
 */
export function TemplateField({ id, value, onChange, variables, rows = 3, single = false, placeholder, mentions, describedBy, invalid }: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  variables: readonly PayloadVar[];
  rows?: number;
  single?: boolean;
  placeholder?: string;
  mentions?: MentionSource;
  describedBy?: string;
  invalid?: boolean;
}) {
  const t = useTranslations("integrations");
  const ref = useRef<HTMLTextAreaElement>(null);
  const listId = useId();
  const [caret, setCaret] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [active, setActive] = useState(0);

  const unknown = useMemo(() => unknownVariables(value, variables), [value, variables]);
  const trig = dismissed ? null : templateTrigger(value, caret);
  const matches = trig ? filterVariables(variables, trig.query) : [];
  const open = matches.length > 0;
  const current = Math.min(active, Math.max(0, matches.length - 1));

  const track = () => setCaret(ref.current?.selectionStart ?? 0);
  const commit = (next: string, nextCaret: number) => {
    onChange(next);
    setCaret(nextCaret);
    requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(nextCaret, nextCaret);
    });
  };
  const pick = (name: string) => {
    const edit = applyTemplateVariable(value, ref.current?.selectionStart ?? caret, trig, name);
    commit(edit.text, edit.caret);
  };
  const insertRaw = (text: string) => {
    const el = ref.current;
    const at = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? at;
    commit(`${value.slice(0, at)}${text}${value.slice(end)}`, at + text.length);
  };

  return (
    <div className="relative">
      <textarea
        ref={ref}
        id={id}
        rows={single ? 1 : rows}
        value={value}
        placeholder={placeholder}
        spellCheck={false}
        role="combobox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-autocomplete="list"
        aria-activedescendant={open ? `${listId}-${current}` : undefined}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        onChange={(e) => { setDismissed(false); setActive(0); setCaret(e.target.selectionStart); onChange(e.target.value); }}
        onKeyUp={track}
        onClick={track}
        onKeyDown={(e) => {
          if (single && e.key === "Enter" && !open) e.preventDefault();
          if (!open) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setActive((current + 1) % matches.length); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActive((current - 1 + matches.length) % matches.length); }
          else if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); pick(matches[current].name); }
          else if (e.key === "Escape") { e.preventDefault(); setDismissed(true); }
        }}
        className={cx(fieldCls, single ? "resize-none" : "resize-y", "font-mono")}
      />
      {open && (
        <ul id={listId} role="listbox" aria-label={t("canvas.room.variables.title")} className="absolute left-0 right-0 z-30 mt-1 max-h-44 overflow-y-auto rounded-md border border-border bg-popover py-1 shadow-lg">
          {matches.map((v, i) => (
            <li key={v.name} id={`${listId}-${i}`} role="option" aria-selected={i === current}>
              <button type="button" tabIndex={-1} onMouseDown={(e) => { e.preventDefault(); pick(v.name); }} className={cx("flex w-full items-baseline gap-2 px-2 py-1 text-left text-[11px]", i === current ? "bg-muted" : "hover:bg-muted/60")}>
                <span className="font-mono font-semibold text-foreground">{v.name}</span>
                <span className="truncate text-muted-foreground">{variableText(t, v)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {unknown.length > 0 && (
        <p role="status" className="mt-1 text-[11px] font-medium text-amber-800 dark:text-amber-300">
          {t("canvas.room.variables.unknown", { names: unknown.map((n) => `{${n}}`).join(" ") })}
        </p>
      )}
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        {variables.length > 0 && (
          <label className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
            <span className="sr-only">{t("canvas.room.variables.insert")}</span>
            <select
              value=""
              onChange={(e) => { if (e.target.value) insertRaw(`{${e.target.value}}`); }}
              aria-label={t("canvas.room.variables.insert")}
              className="h-7 max-w-[11rem] rounded-md border border-border bg-background px-1.5 text-[11px] text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">{t("canvas.room.variables.insert")}</option>
              {variables.map((v) => <option key={v.name} value={v.name}>{v.name}</option>)}
            </select>
          </label>
        )}
        {mentions && (mentions.users.length > 0 || mentions.roles.length > 0) && (
          <label className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
            <span className="sr-only">{t("canvas.room.mentions.insert")}</span>
            <select
              value=""
              onChange={(e) => { if (e.target.value) insertRaw(`${e.target.value} `); }}
              aria-label={t("canvas.room.mentions.insert")}
              className="h-7 max-w-[11rem] rounded-md border border-border bg-background px-1.5 text-[11px] text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">{t("canvas.room.mentions.insert")}</option>
              {mentions.users.length > 0 && (
                <optgroup label={t("canvas.room.mentions.people")}>
                  {mentions.users.map((u) => <option key={u.id} value={`@[${cleanLabel(u.label)}](${u.id})`}>{u.label}</option>)}
                </optgroup>
              )}
              {mentions.roles.length > 0 && (
                <optgroup label={t("canvas.room.mentions.roles")}>
                  {mentions.roles.map((r) => <option key={r.id} value={`@[${cleanLabel(r.label)}](role:${r.id})`}>{r.label}</option>)}
                </optgroup>
              )}
            </select>
          </label>
        )}
      </div>
    </div>
  );
}

const cleanLabel = (name: string) => name.replace(/[\]\n\r]/g, " ").trim() || "?";

export function variableText(t: (key: string, p?: Record<string, string | number>) => string, v: PayloadVar): string {
  if (v.text) return v.text;
  const key = `canvas.room.vars.${varI18nKey(v.name)}`;
  const text = t(key);
  return text === key ? "" : text;
}

/* ───────────── emoji ───────────── */

const QUICK_EMOJI = ["👍", "👎", "✅", "❌", "🎉", "👀", "❤️", "🔥"];

export function EmojiField({ id, value, onChange, placeholder, ariaDescribedBy }: { id: string; value: string; onChange: (v: string) => void; placeholder?: string; ariaDescribedBy?: string }) {
  const t = useTranslations("integrations");
  return (
    <div>
      <div className="flex items-center gap-1">
        <input id={id} type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-describedby={ariaDescribedBy} className={fieldCls} />
        <EmojiPickerButton onSelect={(v) => onChange(v)} className="shrink-0 rounded-md border border-border p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
      </div>
      <div className="mt-1 flex flex-wrap gap-1" role="group" aria-label={t("canvas.room.emoji.quick")}>
        {QUICK_EMOJI.map((e) => (
          <button key={e} type="button" onClick={() => onChange(e)} aria-pressed={value === e} aria-label={e} className={cx("flex h-7 w-7 items-center justify-center rounded-md border text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", value === e ? "border-primary bg-primary/5 ring-1 ring-primary/30" : "border-border bg-background hover:bg-muted")}><Emoji value={e} size={16} label="" /></button>
        ))}
      </div>
    </div>
  );
}

/* ───────────── weekdays ───────────── */

export function WeekdaysField({ value, onChange, legend }: { value: number[] | undefined; onChange: (v: number[] | undefined) => void; legend: string }) {
  const t = useTranslations("integrations");
  const days = [1, 2, 3, 4, 5, 6, 0];
  const selected = new Set(value ?? []);
  const toggle = (d: number) => {
    const next = new Set(selected);
    if (next.has(d)) next.delete(d);
    else next.add(d);
    onChange(next.size === 0 ? undefined : [...next].sort((a, b) => a - b));
  };
  return (
    <fieldset>
      <legend className="sr-only">{legend}</legend>
      <div className="flex flex-wrap gap-1">
        {days.map((d) => (
          <button key={d} type="button" aria-pressed={selected.has(d)} onClick={() => toggle(d)} className={cx("h-7 min-w-[2.25rem] rounded-md border px-1.5 text-[11px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", selected.has(d) ? "border-primary bg-primary/5 ring-1 ring-primary/30 text-foreground" : "border-border bg-background text-muted-foreground hover:bg-muted")}>
            {t(`canvas.room.weekdays.${d}`)}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
