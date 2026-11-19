"use client";

import { ChevronDown, ChevronUp, Plus, Sparkles, Trash2 } from "lucide-react";

import { useTranslations } from "@/components/providers/i18n-provider";
import { isMediaKind, starterWizard, WIZARD_MAX_FILES, type TemplateWizard, type WizardField, type WizardFieldKind, type WizardStep } from "@/lib/card-templates/wizard";

interface Group {
  id: string;
  name: string;
  mode?: string;
}

const newId = () => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID().slice(0, 12) : `w${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`);
const inputCls = "h-8 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary";
const iconBtn = "inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent focus:outline-none focus-visible:ring-2 focus-visible:ring-primary";
const KINDS: WizardFieldKind[] = ["tag_group", "list", "title", "line", "text", "checklist", "date", "assignees", "toggle", "image", "file"];
const num = (v: string): number | undefined => (v.trim() === "" || Number.isNaN(Number(v)) ? undefined : Number(v));

/** `Área funcional` -> `area_funcional`: a safe variable name. */
const slug = (label: string): string => {
  const base = label.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "").toLowerCase();
  return /^[a-z]/.test(base) ? base.slice(0, 31) : base ? `v_${base}`.slice(0, 31) : "";
};

const move = <T,>(arr: T[], from: number, to: number): T[] => {
  if (to < 0 || to >= arr.length) return arr;
  const next = [...arr];
  const [x] = next.splice(from, 1);
  next.splice(to, 0, x);
  return next;
};

/** Editor of a template's wizard: steps, and the questions of each step. Edits are handed up as a whole new wizard. */
export function CardTemplateWizardEditor({ wizard, onChange, groups }: { wizard: TemplateWizard | null; onChange: (w: TemplateWizard | null) => void; groups: Group[] }) {
  const t = useTranslations("board-detail");
  const w = wizard ?? { enabled: true, steps: [] };
  const setSteps = (steps: WizardStep[]) => onChange({ ...w, steps });
  const patchStep = (i: number, p: Partial<WizardStep>) => setSteps(w.steps.map((s, k) => (k === i ? { ...s, ...p } : s)));
  const patchField = (si: number, fi: number, p: Partial<WizardField>) => patchStep(si, { fields: w.steps[si].fields.map((f, k) => (k === fi ? { ...f, ...p } : f)) });
  const addField = (si: number) => patchStep(si, { fields: [...w.steps[si].fields, { id: newId(), kind: "tag_group", label: "", required: false }] });

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label={t("cardTemplates.editor.wizard.title")}>
        {([false, true] as const).map((wizardMode) => {
          const on = wizardMode ? w.enabled && w.steps.length > 0 : !(w.enabled && w.steps.length > 0);
          return (
            <button
              key={String(wizardMode)}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={wizardMode && w.steps.length === 0}
              onClick={() => onChange({ ...w, enabled: wizardMode })}
              className={`flex flex-col items-start gap-0.5 rounded-lg border p-3 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50 ${on ? "border-primary bg-primary/10 ring-1 ring-primary" : "border-border bg-background hover:bg-muted"}`}
            >
              <span className="text-sm font-semibold">{wizardMode ? t("cardTemplates.editor.wizard.modeWizard") : t("cardTemplates.editor.wizard.modeFill")}</span>
              <span className="text-xs text-muted-foreground">{wizardMode ? t("cardTemplates.editor.wizard.modeWizardHint") : t("cardTemplates.editor.wizard.modeFillHint")}</span>
            </button>
          );
        })}
      </div>
      {w.enabled && w.steps.length > 0 ? (
        <label className="inline-flex items-center gap-2 text-sm">
          <input type="checkbox" checked={w.autoCreate !== false} onChange={(e) => onChange({ ...w, autoCreate: e.target.checked })} className="h-3.5 w-3.5 accent-primary" />
          {t("cardTemplates.editor.wizard.autoCreate")}
        </label>
      ) : null}
      <p className="text-xs text-muted-foreground">{t("cardTemplates.editor.wizard.placeholderTip")} {t("cardTemplates.editor.wizard.builtins")}</p>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("cardTemplates.editor.wizard.stepsCount", { count: w.steps.length })}</span>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => onChange(starterWizard(groups, newId))} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-xs font-medium hover:bg-muted">
            <Sparkles className="h-3.5 w-3.5" />{t("cardTemplates.editor.wizard.fromGroups")}
          </button>
          <button type="button" onClick={() => setSteps([...w.steps, { id: newId(), title: "", fields: [] }])} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-xs font-medium hover:bg-muted">
            <Plus className="h-3.5 w-3.5" />{t("cardTemplates.editor.wizard.addStep")}
          </button>
        </div>
      </div>
      {w.steps.length === 0 ? <p className="text-xs text-muted-foreground">{t("cardTemplates.editor.wizard.empty")}</p> : null}

      {w.steps.map((step, si) => (
        <section key={step.id} className="space-y-3 rounded-lg border border-border bg-background/50 p-3" aria-label={step.title || `${si + 1}`}>
          <div className="flex items-start gap-2">
            <span className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{si + 1}</span>
            <div className="min-w-0 flex-1 space-y-1.5">
              <input className={inputCls} value={step.title} maxLength={80} onChange={(e) => patchStep(si, { title: e.target.value })} placeholder={t("cardTemplates.editor.wizard.stepTitle")} aria-label={t("cardTemplates.editor.wizard.stepTitle")} />
              <input className={inputCls} value={step.description ?? ""} maxLength={300} onChange={(e) => patchStep(si, { description: e.target.value || undefined })} placeholder={t("cardTemplates.editor.wizard.stepDescription")} aria-label={t("cardTemplates.editor.wizard.stepDescription")} />
            </div>
            <button type="button" className={iconBtn} disabled={si === 0} onClick={() => setSteps(move(w.steps, si, si - 1))} aria-label={t("cardTemplates.editor.wizard.moveUp")}><ChevronUp className="h-4 w-4" /></button>
            <button type="button" className={iconBtn} disabled={si === w.steps.length - 1} onClick={() => setSteps(move(w.steps, si, si + 1))} aria-label={t("cardTemplates.editor.wizard.moveDown")}><ChevronDown className="h-4 w-4" /></button>
            <button type="button" className={`${iconBtn} hover:text-destructive`} onClick={() => setSteps(w.steps.filter((_, k) => k !== si))} aria-label={t("cardTemplates.editor.wizard.removeStep")}><Trash2 className="h-4 w-4" /></button>
          </div>

          <div className="space-y-2 pl-8">
            {step.fields.map((f, fi) => (
              <div key={f.id} className="space-y-2 rounded-md border border-border bg-card p-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <select className={`${inputCls} sm:w-52`} value={f.kind} onChange={(e) => {
                    const kind = e.target.value as WizardFieldKind;
                    // `max` of a number question (any value) is not a valid file count: start the upload question clean
                    const okMax = Number.isInteger(f.max) && (f.max as number) >= 1 && (f.max as number) <= WIZARD_MAX_FILES;
                    patchField(si, fi, { kind, ...(isMediaKind(kind) && !okMax ? { max: undefined } : {}), ...(kind !== "file" ? { accept: undefined } : {}) });
                  }} aria-label={t("cardTemplates.editor.wizard.kind")}>
                    {KINDS.map((k) => <option key={k} value={k}>{t(`cardTemplates.editor.wizard.kinds.${k}`)}</option>)}
                  </select>
                  <input className={`${inputCls} min-w-[8rem] flex-1`} value={f.label} maxLength={80} onChange={(e) => patchField(si, fi, { label: e.target.value })} placeholder={t("cardTemplates.editor.wizard.label")} aria-label={t("cardTemplates.editor.wizard.label")} />
                  <label className="inline-flex items-center gap-1.5 text-xs">
                    <input type="checkbox" checked={f.required} onChange={(e) => patchField(si, fi, { required: e.target.checked })} className="h-3.5 w-3.5 accent-primary" />
                    {t("cardTemplates.editor.wizard.required")}
                  </label>
                  <button type="button" className={iconBtn} disabled={fi === 0} onClick={() => patchStep(si, { fields: move(step.fields, fi, fi - 1) })} aria-label={t("cardTemplates.editor.wizard.moveUp")}><ChevronUp className="h-4 w-4" /></button>
                  <button type="button" className={iconBtn} disabled={fi === step.fields.length - 1} onClick={() => patchStep(si, { fields: move(step.fields, fi, fi + 1) })} aria-label={t("cardTemplates.editor.wizard.moveDown")}><ChevronDown className="h-4 w-4" /></button>
                  <button type="button" className={`${iconBtn} hover:text-destructive`} onClick={() => patchStep(si, { fields: step.fields.filter((_, k) => k !== fi) })} aria-label={t("cardTemplates.editor.wizard.removeField")}><Trash2 className="h-4 w-4" /></button>
                </div>

                {f.kind === "tag_group" ? (
                  <select className={inputCls} value={f.groupId ?? ""} onChange={(e) => {
                    const g = groups.find((x) => x.id === e.target.value);
                    patchField(si, fi, { groupId: e.target.value || undefined, ...(g && !f.label ? { label: g.name, required: g.mode === "single" } : {}) });
                  }} aria-label={t("cardTemplates.editor.wizard.group")}>
                    <option value="">{t("cardTemplates.editor.wizard.noGroup")}</option>
                    {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                ) : null}

                {f.kind === "date" ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <select className={inputCls} value={f.target ?? "due"} onChange={(e) => patchField(si, fi, { target: e.target.value as WizardField["target"] })} aria-label={t("cardTemplates.editor.wizard.dateTarget")}>
                      {(["due", "start", "line"] as const).map((k) => <option key={k} value={k}>{t(`cardTemplates.editor.wizard.dateTargets.${k}`)}</option>)}
                    </select>
                    {f.target === "line" ? <input className={inputCls} value={f.key ?? ""} maxLength={60} onChange={(e) => patchField(si, fi, { key: e.target.value.replace(/[:\n\r]/g, "") })} placeholder={t("cardTemplates.editor.wizard.lineKey")} aria-label={t("cardTemplates.editor.wizard.lineKey")} /> : null}
                  </div>
                ) : null}

                {f.kind === "toggle" ? <input className={inputCls} value={f.key ?? ""} maxLength={60} onChange={(e) => patchField(si, fi, { key: e.target.value.replace(/[:\n\r]/g, "") || undefined })} placeholder={t("cardTemplates.editor.wizard.toggleKey")} aria-label={t("cardTemplates.editor.wizard.toggleKey")} /> : null}

                {f.kind === "line" ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <input className={inputCls} value={f.key ?? ""} maxLength={60} onChange={(e) => patchField(si, fi, { key: e.target.value.replace(/[:\n\r]/g, "") })} placeholder={t("cardTemplates.editor.wizard.lineKey")} aria-label={t("cardTemplates.editor.wizard.lineKey")} />
                    <select className={inputCls} value={f.input ?? "text"} onChange={(e) => patchField(si, fi, { input: e.target.value as WizardField["input"] })} aria-label={t("cardTemplates.editor.wizard.input")}>
                      {(["text", "number", "range", "select"] as const).map((k) => <option key={k} value={k}>{t(`cardTemplates.editor.wizard.inputs.${k}`)}</option>)}
                    </select>
                    {f.input === "number" || f.input === "range" ? (
                      <div className="grid grid-cols-3 gap-2 sm:col-span-2">
                        {(["min", "max", "step"] as const).map((k) => (
                          <input key={k} type="number" className={inputCls} value={f[k] ?? ""} onChange={(e) => patchField(si, fi, { [k]: num(e.target.value) } as Partial<WizardField>)} placeholder={t(`cardTemplates.editor.wizard.${k}`)} aria-label={t(`cardTemplates.editor.wizard.${k}`)} />
                        ))}
                      </div>
                    ) : null}
                    {f.input === "select" ? (
                      <>
                        <textarea className="min-h-[5rem] w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm sm:col-span-2" value={(f.options ?? []).join("\n")} onChange={(e) => patchField(si, fi, { options: e.target.value.split("\n").map((x) => x.trim()).filter(Boolean) })} placeholder={t("cardTemplates.editor.wizard.options")} aria-label={t("cardTemplates.editor.wizard.options")} />
                        <label className="inline-flex items-center gap-1.5 text-xs sm:col-span-2">
                          <input type="checkbox" checked={!!f.allowCustom} onChange={(e) => patchField(si, fi, { allowCustom: e.target.checked || undefined })} className="h-3.5 w-3.5 accent-primary" />
                          {t("cardTemplates.editor.wizard.allowCustom")}
                        </label>
                      </>
                    ) : null}
                  </div>
                ) : null}

                {isMediaKind(f.kind) ? (
                  <div className="grid gap-2 sm:grid-cols-[9rem_1fr]">
                    <input type="number" min={1} max={WIZARD_MAX_FILES} step={1} className={inputCls} value={f.max ?? ""} onChange={(e) => patchField(si, fi, { max: num(e.target.value) })} placeholder={t("cardTemplates.editor.wizard.maxFiles")} aria-label={t("cardTemplates.editor.wizard.maxFiles")} title={t("cardTemplates.editor.wizard.maxFiles")} />
                    {f.kind === "file" ? (
                      <input
                        key={`${f.id}-accept`}
                        className={`${inputCls} font-mono text-xs`}
                        defaultValue={(f.accept ?? []).join(", ")}
                        onBlur={(e) => patchField(si, fi, { accept: e.target.value.split(",").map((x) => x.trim().toLowerCase()).filter(Boolean) })}
                        placeholder="application/pdf, image/*"
                        aria-label={t("cardTemplates.editor.wizard.accept")}
                        title={t("cardTemplates.editor.wizard.accept")}
                      />
                    ) : null}
                    <p className="text-xs text-muted-foreground sm:col-span-2">{t("cardTemplates.editor.wizard.uploadHint")}</p>
                  </div>
                ) : null}

                {f.kind === "text" ? <p className="text-xs text-muted-foreground">{t("cardTemplates.editor.wizard.textHint")}</p> : null}
                <div className="grid gap-2 sm:grid-cols-[1fr_11rem]">
                  <input className={inputCls} value={f.help ?? ""} maxLength={300} onChange={(e) => patchField(si, fi, { help: e.target.value || undefined })} placeholder={t("cardTemplates.editor.wizard.help")} aria-label={t("cardTemplates.editor.wizard.help")} />
                  <div className="relative">
                    <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{"{{"}</span>
                    <input
                      className={`${inputCls} px-6 font-mono text-xs`}
                      value={f.variable ?? ""}
                      maxLength={31}
                      onChange={(e) => patchField(si, fi, { variable: e.target.value.replace(/[^A-Za-z0-9_]/g, "") || undefined })}
                      onBlur={() => { if (!f.variable && f.label) patchField(si, fi, { variable: slug(f.label) || undefined }); }}
                      placeholder={t("cardTemplates.editor.wizard.variable")}
                      aria-label={t("cardTemplates.editor.wizard.variableHint")}
                      title={t("cardTemplates.editor.wizard.variableHint")}
                    />
                    <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{"}}"}</span>
                  </div>
                </div>
              </div>
            ))}
            <button type="button" onClick={() => addField(si)} disabled={step.fields.length >= 8} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-dashed border-border px-2.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50">
              <Plus className="h-3.5 w-3.5" />{t("cardTemplates.editor.wizard.addField")}
            </button>
          </div>
        </section>
      ))}
    </div>
  );
}
