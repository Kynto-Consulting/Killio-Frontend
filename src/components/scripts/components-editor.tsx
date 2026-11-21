"use client";

/**
 * Editor of the buttons and selects of a bot message node: rows (max 5) of up to 5 buttons or one select; label, style, customId (or url
 * for link buttons), emoji, options of a select, min / max values. Validated with the backend's limits (lib/bots/components.ts) and
 * previewed with the renderer the room uses. The button press reaches the script through the Interaction trigger with the same customId.
 */

import { useEffect, useId, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";

import { useTranslations } from "@/components/providers/i18n-provider";
import { InteractiveComponents } from "@/components/rooms/bot-message-parts";
import { cx } from "@/components/roles/ui";
import {
  BUTTON_STYLES, COMPONENT_LIMITS, blankButton, blankSelect, componentIssuesAt, componentsPayload, toRows, validateComponents,
  type ButtonComponent, type Component, type ComponentRow, type SelectComponent, type SelectOption,
} from "@/lib/bots/components";
import { moveItem } from "@/lib/bots/options";
import type { PayloadVar } from "@/lib/bots/room-nodes";
import { FieldRow, TemplateField, fieldCls, miniBtn } from "./room-fields";

interface Props {
  id: string;
  value: unknown[] | undefined;
  expiresInMinutes?: unknown;
  onChange: (rows: ComponentRow[] | undefined) => void;
  variables: readonly PayloadVar[];
}

const usedIds = (rows: readonly ComponentRow[]) => new Set(rows.flatMap((r) => r.components.map((c) => (c as { customId?: string }).customId ?? "")));
const freeId = (rows: readonly ComponentRow[], base: string) => {
  const used = usedIds(rows);
  let n = 1;
  while (used.has(`${base}_${n}`)) n += 1;
  return `${base}_${n}`;
};

export function ComponentsEditor({ id, value, expiresInMinutes, onChange, variables }: Props) {
  const t = useTranslations("integrations");
  const rows = toRows(value);
  const issues = validateComponents(rows, expiresInMinutes);
  const commit = (next: ComponentRow[]) => onChange(next.length ? componentsPayload(next) : undefined);
  const setRow = (r: number, components: Component[]) => commit(rows.map((row, k) => (k === r ? { components } : row)).filter((row) => row.components.length > 0));
  const patchComp = (r: number, i: number, p: Partial<ButtonComponent> | Partial<SelectComponent>) => setRow(r, rows[r].components.map((c, k) => (k === i ? ({ ...c, ...p } as Component) : c)));

  return (
    <div className="space-y-2" role="group" aria-labelledby={`${id}-label`}>
      {issues.filter((i) => i.at.length === 0).map((i) => <p key={i.code} role="alert" className="text-[11px] font-medium text-red-700 dark:text-red-300">{t(`canvas.room.issues.components.${i.code}`, { max: COMPONENT_LIMITS.maxRows, min: COMPONENT_LIMITS.minExpiresMinutes, maxMin: COMPONENT_LIMITS.maxExpiresMinutes })}</p>)}
      {rows.length === 0 && <p className="rounded-md border border-dashed border-border px-2.5 py-2 text-[11px] text-muted-foreground">{t("canvas.room.components.empty")}</p>}

      <ol className="space-y-2">
        {rows.map((row, r) => {
          const hasSelect = row.components.some((c) => c.type === "select");
          const rowIssues = componentIssuesAt(issues, [r]);
          return (
            <li key={r} className="rounded-md border border-border bg-background/60 p-2">
              <div className="mb-1.5 flex items-center gap-1">
                <span className="text-[11px] font-bold">{t("canvas.room.components.row", { n: r + 1 })}</span>
                <span className="ml-auto inline-flex gap-0.5">
                  <button type="button" className={miniBtn} disabled={r === 0} aria-label={t("canvas.room.moveUp")} onClick={() => commit(moveItem(rows, r, r - 1))}><ArrowUp className="h-3 w-3" aria-hidden /></button>
                  <button type="button" className={miniBtn} disabled={r === rows.length - 1} aria-label={t("canvas.room.moveDown")} onClick={() => commit(moveItem(rows, r, r + 1))}><ArrowDown className="h-3 w-3" aria-hidden /></button>
                  <button type="button" className={miniBtn} aria-label={t("canvas.room.remove")} onClick={() => commit(rows.filter((_, k) => k !== r))}><Trash2 className="h-3 w-3" aria-hidden /></button>
                </span>
              </div>
              <ul className="space-y-2">
                {row.components.map((c, i) => (
                  <li key={i} className="rounded border border-dashed border-border p-2">
                    <div className="mb-1 flex items-center gap-1">
                      <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{t(`canvas.room.components.kind.${c.type}`)}</span>
                      <span className="ml-auto inline-flex gap-0.5">
                        <button type="button" className={miniBtn} disabled={i === 0} aria-label={t("canvas.room.moveUp")} onClick={() => setRow(r, moveItem(row.components, i, i - 1))}><ArrowUp className="h-3 w-3" aria-hidden /></button>
                        <button type="button" className={miniBtn} disabled={i === row.components.length - 1} aria-label={t("canvas.room.moveDown")} onClick={() => setRow(r, moveItem(row.components, i, i + 1))}><ArrowDown className="h-3 w-3" aria-hidden /></button>
                        <button type="button" className={miniBtn} aria-label={t("canvas.room.remove")} onClick={() => setRow(r, row.components.filter((_, k) => k !== i))}><Trash2 className="h-3 w-3" aria-hidden /></button>
                      </span>
                    </div>
                    {c.type === "button"
                      ? <ButtonFields id={`${id}-${r}-${i}`} b={c} variables={variables} onPatch={(p) => patchComp(r, i, p)} />
                      : <SelectFields id={`${id}-${r}-${i}`} s={c} variables={variables} onPatch={(p) => patchComp(r, i, p)} />}
                    {componentIssuesAt(issues, [r, i]).map((x, k) => <p key={k} role="alert" className="mt-1 text-[11px] font-medium text-red-700 dark:text-red-300">{t(`canvas.room.issues.components.${x.code}`, { max: COMPONENT_LIMITS.maxLabelLength })}</p>)}
                    {c.type === "select" && issues.filter((x) => x.at.length === 3 && x.at[0] === r && x.at[1] === i).map((x, k) => <p key={`o${k}`} role="alert" className="mt-1 text-[11px] font-medium text-red-700 dark:text-red-300">{t(`canvas.room.issues.components.${x.code}`)} ({x.at[2] + 1})</p>)}
                  </li>
                ))}
              </ul>
              {rowIssues.map((x, k) => <p key={k} role="alert" className="mt-1 text-[11px] font-medium text-red-700 dark:text-red-300">{t(`canvas.room.issues.components.${x.code}`)}</p>)}
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <button type="button" className={miniBtn} disabled={hasSelect || row.components.length >= COMPONENT_LIMITS.maxButtonsPerRow} onClick={() => setRow(r, [...row.components, { ...blankButton(0), customId: freeId(rows, "btn") }])}>
                  <Plus className="h-3 w-3" aria-hidden /> {t("canvas.room.components.addButton")}
                </button>
                <button type="button" className={miniBtn} disabled={row.components.length > 0} onClick={() => setRow(r, [{ ...blankSelect(0), customId: freeId(rows, "select") }])}>
                  <Plus className="h-3 w-3" aria-hidden /> {t("canvas.room.components.addSelect")}
                </button>
              </div>
            </li>
          );
        })}
      </ol>

      <button type="button" className={miniBtn} disabled={rows.length >= COMPONENT_LIMITS.maxRows} onClick={() => commit([...rows, { components: [{ ...blankButton(0), customId: freeId(rows, "btn") }] }])}>
        <Plus className="h-3 w-3" aria-hidden /> {t("canvas.room.components.addRow")}
      </button>

      {rows.length > 0 && (
        <details className="rounded-md border border-border">
          <summary className="cursor-pointer px-2 py-1.5 text-[11px] font-semibold text-muted-foreground">{t("canvas.room.preview")}</summary>
          <div className="border-t border-border p-2">
            <p className="mb-1.5 text-[10px] text-muted-foreground">{t("canvas.room.components.previewNote")}</p>
            <InteractiveComponents rows={rows} preview idPrefix={`${id}-preview`} />
          </div>
        </details>
      )}
    </div>
  );
}

function ButtonFields({ id, b, variables, onPatch }: { id: string; b: ButtonComponent; variables: readonly PayloadVar[]; onPatch: (p: Partial<ButtonComponent>) => void }) {
  const t = useTranslations("integrations");
  const uid = useId();
  const f = (k: string) => `${id}-${uid}-${k}`;
  const isLink = b.style === "link";
  return (
    <div className="grid gap-1.5">
      <FieldRow label={t("canvas.room.components.fields.label")} htmlFor={f("label")} required>
        <TemplateField id={f("label")} value={b.label ?? ""} onChange={(v) => onPatch({ label: v })} variables={variables} single />
      </FieldRow>
      <div className="grid grid-cols-2 gap-1.5">
        <FieldRow label={t("canvas.room.components.fields.style")} htmlFor={f("style")}>
          <select id={f("style")} value={b.style} onChange={(e) => { const style = e.target.value as ButtonComponent["style"]; onPatch(style === "link" ? { style, customId: undefined, url: b.url ?? "" } : { style, url: undefined, customId: b.customId || "btn" }); }} className={fieldCls}>
            {BUTTON_STYLES.map((s) => <option key={s} value={s}>{t(`canvas.room.components.styles.${s}`)}</option>)}
          </select>
        </FieldRow>
        <FieldRow label={t("canvas.room.components.fields.emoji")} htmlFor={f("emoji")}>
          <input id={f("emoji")} type="text" value={b.emoji ?? ""} maxLength={16} onChange={(e) => onPatch({ emoji: e.target.value })} className={fieldCls} />
        </FieldRow>
      </div>
      {isLink ? (
        <FieldRow label={t("canvas.room.components.fields.url")} hint={t("canvas.room.components.hints.url")} htmlFor={f("url")} required>
          <TemplateField id={f("url")} value={b.url ?? ""} onChange={(v) => onPatch({ url: v })} variables={variables} single />
        </FieldRow>
      ) : (
        <FieldRow label={t("canvas.room.components.fields.customId")} hint={t("canvas.room.components.hints.customId")} htmlFor={f("customId")} required>
          <TemplateField id={f("customId")} value={b.customId ?? ""} onChange={(v) => onPatch({ customId: v })} variables={variables} single />
        </FieldRow>
      )}
      <label className="flex items-center gap-2 text-[11px] text-foreground">
        <input type="checkbox" checked={b.disabled === true} onChange={(e) => onPatch({ disabled: e.target.checked })} className="h-3.5 w-3.5 rounded border-border" />
        {t("canvas.room.components.fields.disabled")}
      </label>
    </div>
  );
}

const optionsToLines = (opts: readonly SelectOption[]) => opts.map((o) => [o.label, o.value, o.description ?? ""].join(" | ").replace(/( \| )+$/, "")).join("\n");
const linesToOptions = (text: string): SelectOption[] =>
  text.split(/\r?\n/).filter((l) => l.trim() !== "").map((l) => {
    const [label = "", value = "", ...rest] = l.split("|").map((x) => x.trim());
    const description = rest.join(" | ");
    return { label, value: value || label, ...(description ? { description } : {}) };
  });

function SelectFields({ id, s, variables, onPatch }: { id: string; s: SelectComponent; variables: readonly PayloadVar[]; onPatch: (p: Partial<SelectComponent>) => void }) {
  const t = useTranslations("integrations");
  const uid = useId();
  const f = (k: string) => `${id}-${uid}-${k}`;
  return (
    <div className="grid gap-1.5">
      <FieldRow label={t("canvas.room.components.fields.customId")} hint={t("canvas.room.components.hints.customId")} htmlFor={f("customId")} required>
        <TemplateField id={f("customId")} value={s.customId ?? ""} onChange={(v) => onPatch({ customId: v })} variables={variables} single />
      </FieldRow>
      <FieldRow label={t("canvas.room.components.fields.placeholder")} htmlFor={f("placeholder")}>
        <TemplateField id={f("placeholder")} value={s.placeholder ?? ""} onChange={(v) => onPatch({ placeholder: v })} variables={variables} single />
      </FieldRow>
      <FieldRow label={t("canvas.room.components.fields.options")} hint={t("canvas.room.components.hints.options", { max: COMPONENT_LIMITS.maxSelectOptions })} htmlFor={f("options")} required>
        <OptionLines id={f("options")} value={optionsToLines(s.options)} onCommit={(text) => onPatch({ options: linesToOptions(text) })} variables={variables} />
      </FieldRow>
      <div className="grid grid-cols-2 gap-1.5">
        <FieldRow label={t("canvas.room.components.fields.minValues")} htmlFor={f("min")}>
          <input id={f("min")} type="number" min={0} value={Number.isFinite(s.minValues) ? s.minValues : ""} onChange={(e) => onPatch({ minValues: e.target.value === "" ? (undefined as unknown as number) : Number(e.target.value) })} className={fieldCls} />
        </FieldRow>
        <FieldRow label={t("canvas.room.components.fields.maxValues")} htmlFor={f("max")}>
          <input id={f("max")} type="number" min={1} value={Number.isFinite(s.maxValues) ? s.maxValues : ""} onChange={(e) => onPatch({ maxValues: e.target.value === "" ? (undefined as unknown as number) : Number(e.target.value) })} className={fieldCls} />
        </FieldRow>
      </div>
      <label className="flex items-center gap-2 text-[11px] text-foreground">
        <input type="checkbox" checked={s.disabled === true} onChange={(e) => onPatch({ disabled: e.target.checked })} className="h-3.5 w-3.5 rounded border-border" />
        {t("canvas.room.components.fields.disabled")}
      </label>
    </div>
  );
}

function OptionLines({ id, value, onCommit, variables }: { id: string; value: string; onCommit: (text: string) => void; variables: readonly PayloadVar[] }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <div onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null) && draft !== value) onCommit(draft); }}>
      <TemplateField id={id} value={draft} onChange={setDraft} variables={variables} rows={4} />
    </div>
  );
}
