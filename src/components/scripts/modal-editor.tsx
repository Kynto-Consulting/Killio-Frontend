"use client";

/**
 * Editor of the modal a script opens (`Room: Respond to Interaction`, mode "modal"): title, submit label and 1-5 text inputs (short or
 * paragraph; label, placeholder, required, min / max length, initial value). The submit reaches the bot through the Interaction trigger
 * with `componentType: "modal"`, the modal's customId and `fields` ({ inputCustomId: text }). Rules: lib/bots/components.ts (MODAL_LIMITS).
 */

import { useId } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";

import { useTranslations } from "@/components/providers/i18n-provider";
import { cx } from "@/components/roles/ui";
import { MODAL_LIMITS, blankModal, blankModalInput, modalIssuesAt, modalPayload, validateModal, type ModalDef, type ModalInput } from "@/lib/bots/components";
import { moveItem } from "@/lib/bots/options";
import type { PayloadVar } from "@/lib/bots/room-nodes";
import { FieldRow, TemplateField, fieldCls, miniBtn } from "./room-fields";

interface Props {
  id: string;
  value: unknown;
  onChange: (next: ModalDef | undefined) => void;
  variables: readonly PayloadVar[];
}

const asModal = (v: unknown): ModalDef => {
  if (!v || typeof v !== "object") return blankModal();
  const m = v as Partial<ModalDef>;
  return { customId: String(m.customId ?? ""), title: String(m.title ?? ""), submitLabel: m.submitLabel ? String(m.submitLabel) : "", inputs: Array.isArray(m.inputs) ? (m.inputs as ModalInput[]) : [] };
};

export function ModalEditor({ id, value, onChange, variables }: Props) {
  const t = useTranslations("integrations");
  const uid = useId();
  const modal = asModal(value);
  const issues = validateModal(value ?? modal);
  const commit = (next: ModalDef) => onChange(modalPayload(next));
  const f = (k: string) => `${id}-${uid}-${k}`;
  const setInput = (i: number, p: Partial<ModalInput>) => commit({ ...modal, inputs: modal.inputs.map((x, k) => (k === i ? { ...x, ...p } : x)) });
  const err = (code: string) => <p key={code} role="alert" className="text-[11px] font-medium text-red-700 dark:text-red-300">{t(`canvas.room.issues.modal.${code}`, { max: MODAL_LIMITS.maxInputs })}</p>;

  return (
    <div className="space-y-2" role="group" aria-labelledby={`${id}-label`}>
      <FieldRow label={t("canvas.room.modal.fields.customId")} hint={t("canvas.room.modal.hints.customId")} htmlFor={f("customId")} required>
        <TemplateField id={f("customId")} value={modal.customId} onChange={(v) => commit({ ...modal, customId: v })} variables={variables} single />
      </FieldRow>
      <FieldRow label={t("canvas.room.modal.fields.title")} htmlFor={f("title")} required>
        <TemplateField id={f("title")} value={modal.title} onChange={(v) => commit({ ...modal, title: v })} variables={variables} single />
      </FieldRow>
      <FieldRow label={t("canvas.room.modal.fields.submitLabel")} htmlFor={f("submit")}>
        <TemplateField id={f("submit")} value={modal.submitLabel ?? ""} onChange={(v) => commit({ ...modal, submitLabel: v })} variables={variables} single />
      </FieldRow>
      {modalIssuesAt(issues, []).map((x) => err(x.code))}

      <ol className="space-y-2">
        {modal.inputs.map((inp, i) => (
          <li key={i} className="rounded-md border border-border/60 bg-background/60 p-2">
            <div className="mb-1.5 flex items-center gap-1">
              <span className="text-[11px] font-bold">{t("canvas.room.modal.input", { n: i + 1 })}</span>
              <span className="ml-auto inline-flex gap-0.5">
                <button type="button" className={miniBtn} disabled={i === 0} aria-label={t("canvas.room.moveUp")} onClick={() => commit({ ...modal, inputs: moveItem(modal.inputs, i, i - 1) })}><ArrowUp className="h-3 w-3" aria-hidden /></button>
                <button type="button" className={miniBtn} disabled={i === modal.inputs.length - 1} aria-label={t("canvas.room.moveDown")} onClick={() => commit({ ...modal, inputs: moveItem(modal.inputs, i, i + 1) })}><ArrowDown className="h-3 w-3" aria-hidden /></button>
                <button type="button" className={miniBtn} aria-label={t("canvas.room.remove")} onClick={() => commit({ ...modal, inputs: modal.inputs.filter((_, k) => k !== i) })}><Trash2 className="h-3 w-3" aria-hidden /></button>
              </span>
            </div>
            <div className="grid gap-1.5">
              <FieldRow label={t("canvas.room.modal.fields.label")} htmlFor={f(`l${i}`)} required>
                <TemplateField id={f(`l${i}`)} value={inp.label ?? ""} onChange={(v) => setInput(i, { label: v })} variables={variables} single />
              </FieldRow>
              <div className="grid grid-cols-2 gap-1.5">
                <FieldRow label={t("canvas.room.modal.fields.customId")} htmlFor={f(`c${i}`)} required>
                  <TemplateField id={f(`c${i}`)} value={inp.customId ?? ""} onChange={(v) => setInput(i, { customId: v })} variables={variables} single />
                </FieldRow>
                <FieldRow label={t("canvas.room.modal.fields.style")} htmlFor={f(`s${i}`)}>
                  <select id={f(`s${i}`)} value={inp.style ?? "short"} onChange={(e) => setInput(i, { style: e.target.value as ModalInput["style"] })} className={fieldCls}>
                    {["short", "paragraph"].map((st) => <option key={st} value={st}>{t(`canvas.room.modal.styles.${st}`)}</option>)}
                  </select>
                </FieldRow>
              </div>
              <FieldRow label={t("canvas.room.modal.fields.placeholder")} htmlFor={f(`p${i}`)}>
                <TemplateField id={f(`p${i}`)} value={inp.placeholder ?? ""} onChange={(v) => setInput(i, { placeholder: v })} variables={variables} single />
              </FieldRow>
              <div className="grid grid-cols-2 gap-1.5">
                <FieldRow label={t("canvas.room.modal.fields.minLength")} htmlFor={f(`mn${i}`)}>
                  <input id={f(`mn${i}`)} type="number" min={0} value={inp.minLength ?? ""} onChange={(e) => setInput(i, { minLength: e.target.value === "" ? undefined : Number(e.target.value) })} className={fieldCls} />
                </FieldRow>
                <FieldRow label={t("canvas.room.modal.fields.maxLength")} htmlFor={f(`mx${i}`)}>
                  <input id={f(`mx${i}`)} type="number" min={1} value={inp.maxLength ?? ""} onChange={(e) => setInput(i, { maxLength: e.target.value === "" ? undefined : Number(e.target.value) })} className={fieldCls} />
                </FieldRow>
              </div>
              <FieldRow label={t("canvas.room.modal.fields.value")} htmlFor={f(`v${i}`)}>
                <TemplateField id={f(`v${i}`)} value={inp.value ?? ""} onChange={(v) => setInput(i, { value: v })} variables={variables} single />
              </FieldRow>
              <label className="flex items-center gap-2 text-[11px] text-foreground">
                <input type="checkbox" checked={inp.required !== false} onChange={(e) => setInput(i, { required: e.target.checked })} className="h-3.5 w-3.5 rounded border-border" />
                {t("canvas.room.modal.fields.required")}
              </label>
            </div>
            {modalIssuesAt(issues, [i]).map((x) => err(x.code))}
          </li>
        ))}
      </ol>
      <button type="button" className={cx(miniBtn)} disabled={modal.inputs.length >= MODAL_LIMITS.maxInputs} onClick={() => commit({ ...modal, inputs: [...modal.inputs, blankModalInput(modal.inputs.length)] })}>
        <Plus className="h-3 w-3" aria-hidden /> {t("canvas.room.modal.addInput")}
      </button>
    </div>
  );
}
