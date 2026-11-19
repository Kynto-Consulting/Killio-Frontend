"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronLeft, ChevronRight, FileText, ImageIcon, Loader2, Plus, Upload, X } from "lucide-react";

import { useTranslations } from "@/components/providers/i18n-provider";
import { groupLimit, type RuleGroup } from "@/lib/tags/group-rules";
import {
  acceptOf,
  checkWizardFile,
  encodeWizardFile,
  isAnswered,
  isMediaKind,
  maxFilesOf,
  missingRequired,
  WIZARD_MAX_FILE_BYTES,
  wizardFiles,
  type TemplateWizard,
  type WizardAnswers,
  type WizardField,
  type WizardFile,
} from "@/lib/card-templates/wizard";

interface WizardTag {
  id: string;
  name?: string | null;
  color?: string | null;
}

interface Props {
  open: boolean;
  wizard: TemplateWizard;
  templateName: string;
  tags: WizardTag[];
  groups: RuleGroup[];
  lists: Array<{ id: string; name: string }>;
  /** People of the board, for the `assignees` question. */
  members?: Array<{ id: string; name: string }>;
  /** Answers to start from (the tags and list the template already put on the card). */
  initial: WizardAnswers;
  /** Uploads one file of an `image` / `file` question (the card does not exist yet, so it happens while answering). */
  onUploadFile?: (file: File) => Promise<{ url: string }>;
  onFinish: (answers: WizardAnswers) => void;
  onClose: () => void;
}

interface PendingUpload {
  key: string;
  name: string;
}

const fmtSize = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : n >= 1024 ? `${Math.round(n / 1024)} KB` : `${n} B`);
let uploadSeq = 0;

const chip = (on: boolean) =>
  `inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${on ? "border-primary bg-primary/10 text-foreground ring-1 ring-primary" : "border-border bg-background text-foreground hover:bg-muted"}`;
const inputCls = "h-9 w-full rounded-md border border-border bg-background px-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary";

/** The "new card" wizard: one step at a time, required fields checked before moving on, answers handed back on finish. */
export function CardTemplateWizardDialog({ open, wizard, templateName, tags, groups, lists, members = [], initial, onUploadFile, onFinish, onClose }: Props) {
  const t = useTranslations("board-detail");
  const [stepIndex, setStepIndex] = useState(0);
  const [answers, setAnswers] = useState<WizardAnswers>(initial);
  const [tried, setTried] = useState(false);
  const [pending, setPending] = useState<Record<string, PendingUpload[]>>({});
  const [fileErrors, setFileErrors] = useState<Record<string, string[]>>({});
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const previewUrls = useRef<string[]>([]);

  useEffect(() => () => previewUrls.current.forEach((u) => URL.revokeObjectURL(u)), []);

  useEffect(() => {
    if (!open) return;
    setStepIndex(0);
    setAnswers(initial);
    setTried(false);
    setPending({});
    setFileErrors({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, wizard]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  const steps = wizard.steps;
  const step = steps[Math.min(stepIndex, steps.length - 1)];
  const last = stepIndex >= steps.length - 1;
  const missing = useMemo(() => new Set(step ? missingRequired(step, answers) : []), [step, answers]);
  const set = (id: string, v: string | string[]) => setAnswers((cur) => ({ ...cur, [id]: v }));
  const busy = Object.values(pending).some((l) => l.length > 0);

  const addUploaded = (f: WizardField, file: WizardFile) =>
    setAnswers((cur) => {
      const have = Array.isArray(cur[f.id]) ? (cur[f.id] as string[]) : [];
      const max = maxFilesOf(f);
      return { ...cur, [f.id]: max === 1 ? [encodeWizardFile(file)] : [...have, encodeWizardFile(file)].slice(0, max) };
    });

  /** Checks the files against the question (type, size, count) and uploads the good ones; the bad ones are reported inline. */
  const pickFiles = (f: WizardField, picked: File[]) => {
    const max = maxFilesOf(f);
    const list = max === 1 ? picked.slice(0, 1) : picked;
    const errors: string[] = [];
    const accepted: File[] = [];
    const mb = WIZARD_MAX_FILE_BYTES / 1048576;
    for (const file of list) {
      const existing = wizardFiles(answers[f.id]).length + (pending[f.id]?.length ?? 0) + accepted.length;
      const code = checkWizardFile(f, file, existing);
      if (code) errors.push(t(`cardTemplates.wizard.fileErrors.${code}`, { name: file.name, mb, max }));
      else accepted.push(file);
    }
    setFileErrors((cur) => ({ ...cur, [f.id]: errors }));
    for (const file of accepted) {
      const key = `u${++uploadSeq}`;
      setPending((cur) => ({ ...cur, [f.id]: [...(cur[f.id] ?? []), { key, name: file.name }] }));
      const done = () => setPending((cur) => ({ ...cur, [f.id]: (cur[f.id] ?? []).filter((p) => p.key !== key) }));
      void (async () => {
        try {
          if (!onUploadFile) throw new Error("no upload");
          const up = await onUploadFile(file);
          if (file.type.startsWith("image/")) {
            const blob = URL.createObjectURL(file);
            previewUrls.current.push(blob);
            setPreviews((cur) => ({ ...cur, [up.url]: blob }));
          }
          addUploaded(f, { url: up.url, name: file.name, mime: file.type, size: file.size });
        } catch {
          setFileErrors((cur) => ({ ...cur, [f.id]: [...(cur[f.id] ?? []), t("cardTemplates.wizard.fileErrors.upload", { name: file.name })] }));
        } finally {
          done();
        }
      })();
    }
  };

  const removeFile = (f: WizardField, index: number) => {
    const have = Array.isArray(answers[f.id]) ? (answers[f.id] as string[]) : [];
    set(f.id, have.filter((_, i) => i !== index));
    setFileErrors((cur) => ({ ...cur, [f.id]: [] }));
  };

  if (!open || typeof document === "undefined" || !step) return null;

  const next = () => {
    if (busy) return;
    if (missing.size > 0) {
      setTried(true);
      return;
    }
    setTried(false);
    if (last) onFinish(answers);
    else setStepIndex((i) => i + 1);
  };

  const tagsOf = (groupId?: string) => {
    const g = groups.find((x) => x.id === groupId);
    if (!g) return { group: null as RuleGroup | null, items: [] as WizardTag[] };
    const byName = new Map(tags.map((x) => [String(x.name ?? "").trim().toLowerCase(), x]));
    return { group: g, items: g.tags.map((n) => byName.get(n.trim().toLowerCase())).filter((x): x is WizardTag => !!x) };
  };

  const renderField = (f: WizardField) => {
    const bad = tried && missing.has(f.id);
    const value = answers[f.id];
    let control: React.ReactNode = null;
    if (f.kind === "tag_group") {
      const { group, items } = tagsOf(f.groupId);
      const selected = Array.isArray(value) ? value : [];
      const limit = group ? groupLimit(group) : null;
      control = items.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("cardTemplates.wizard.noTags")}</p>
      ) : (
        <div className="flex flex-wrap gap-1.5" role={group?.mode === "single" ? "radiogroup" : "group"} aria-label={f.label}>
          {items.map((tag) => {
            const on = selected.includes(tag.id);
            return (
              <button
                key={tag.id}
                type="button"
                role={group?.mode === "single" ? "radio" : undefined}
                aria-checked={group?.mode === "single" ? on : undefined}
                aria-pressed={group?.mode === "single" ? undefined : on}
                onClick={() => {
                  if (on) set(f.id, selected.filter((x) => x !== tag.id));
                  else if (limit === 1) set(f.id, [tag.id]);
                  else if (limit !== null && selected.length >= limit) return;
                  else set(f.id, [...selected, tag.id]);
                }}
                className={chip(on)}
              >
                {on ? <Check className="h-3 w-3 text-primary" aria-hidden /> : <span className="h-2 w-2 rounded-full border border-border/60" style={{ background: tag.color ? (String(tag.color).startsWith("#") ? String(tag.color) : `#${tag.color}`) : "transparent" }} />}
                {String(tag.name ?? "").replace(new RegExp(`^${(group?.name ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*:\\s*`, "i"), "")}
              </button>
            );
          })}
          {limit !== null && limit > 1 ? <span className="self-center text-[11px] text-muted-foreground">{selected.length}/{limit}</span> : null}
        </div>
      );
    } else if (f.kind === "list") {
      control = (
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={f.label}>
          {lists.map((l) => (
            <button key={l.id} type="button" role="radio" aria-checked={value === l.id} onClick={() => set(f.id, l.id)} className={chip(value === l.id)}>
              {value === l.id ? <Check className="h-3 w-3 text-primary" aria-hidden /> : null}
              {l.name}
            </button>
          ))}
        </div>
      );
    } else if (f.kind === "line" && f.input === "select") {
      const v = typeof value === "string" ? value : "";
      control = (f.options ?? []).length > 12 ? (
        <>
          <input className={inputCls} list={`wiz-${f.id}`} value={v} onChange={(e) => set(f.id, e.target.value)} placeholder={t("cardTemplates.wizard.searchOption")} aria-label={f.label} />
          <datalist id={`wiz-${f.id}`}>{(f.options ?? []).map((o) => <option key={o} value={o} />)}</datalist>
        </>
      ) : (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={f.label}>
            {(f.options ?? []).map((o) => (
              <button key={o} type="button" role="radio" aria-checked={v === o} onClick={() => set(f.id, v === o ? "" : o)} className={chip(v === o)}>
                {v === o ? <Check className="h-3 w-3 text-primary" aria-hidden /> : null}
                {o}
              </button>
            ))}
          </div>
          {f.allowCustom ? <input className={inputCls} value={v && !(f.options ?? []).includes(v) ? v : ""} onChange={(e) => set(f.id, e.target.value)} placeholder={t("cardTemplates.wizard.other")} aria-label={`${f.label}: ${t("cardTemplates.wizard.other")}`} /> : null}
        </div>
      );
    } else if (f.kind === "checklist") {
      const items = Array.isArray(value) && value.length > 0 ? value : [""];
      control = (
        <div className="space-y-1.5">
          {items.map((it, i) => (
            <div key={i} className="flex gap-1.5">
              <input
                className={inputCls}
                value={it}
                placeholder={f.placeholder ?? t("cardTemplates.wizard.itemPlaceholder")}
                aria-label={`${f.label} ${i + 1}`}
                onChange={(e) => set(f.id, items.map((x, k) => (k === i ? e.target.value : x)))}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); set(f.id, [...items.slice(0, i + 1), "", ...items.slice(i + 1)]); } }}
              />
              {items.length > 1 ? (
                <button type="button" onClick={() => set(f.id, items.filter((_, k) => k !== i))} aria-label={t("cardTemplates.wizard.removeItem")} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-destructive"><X className="h-4 w-4" /></button>
              ) : null}
            </div>
          ))}
          <button type="button" onClick={() => set(f.id, [...items, ""])} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-dashed border-border px-2.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground">
            <Plus className="h-3.5 w-3.5" />{t("cardTemplates.wizard.addItem")}
          </button>
        </div>
      );
    } else if (f.kind === "date") {
      control = <input type="date" className={`${inputCls} sm:w-56`} value={typeof value === "string" ? value : ""} onChange={(e) => set(f.id, e.target.value)} aria-label={f.label} />;
    } else if (f.kind === "assignees") {
      const selected = Array.isArray(value) ? value : [];
      control = members.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("cardTemplates.wizard.noMembers")}</p>
      ) : (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={f.label}>
          {members.map((m) => {
            const on = selected.includes(m.id);
            return (
              <button key={m.id} type="button" aria-pressed={on} onClick={() => set(f.id, on ? selected.filter((x) => x !== m.id) : [...selected, m.id])} className={chip(on)}>
                {on ? <Check className="h-3 w-3 text-primary" aria-hidden /> : null}
                {m.name}
              </button>
            );
          })}
        </div>
      );
    } else if (f.kind === "toggle") {
      control = (
        <div className="flex gap-1.5" role="radiogroup" aria-label={f.label}>
          {(["yes", "no"] as const).map((o) => (
            <button key={o} type="button" role="radio" aria-checked={value === o} onClick={() => set(f.id, value === o ? "" : o)} className={chip(value === o)}>
              {value === o ? <Check className="h-3 w-3 text-primary" aria-hidden /> : null}
              {o === "yes" ? t("cardTemplates.wizard.yes") : t("cardTemplates.wizard.no")}
            </button>
          ))}
        </div>
      );
    } else if (f.kind === "line" && f.input === "range") {
      const min = f.min ?? 0;
      const max = f.max ?? 10;
      const num = typeof value === "string" && value !== "" ? Number(value) : null;
      control = (
        <div className="flex items-center gap-3">
          <input type="range" min={min} max={max} step={f.step ?? 1} value={num ?? min} onChange={(e) => set(f.id, e.target.value)} className="h-2 flex-1 accent-primary" aria-label={f.label} />
          <output className="w-12 rounded-md border border-border bg-background px-2 py-1 text-center text-sm tabular-nums">{num ?? "–"}</output>
          {num !== null ? <button type="button" onClick={() => set(f.id, "")} className="text-xs text-muted-foreground hover:text-foreground">{t("cardTemplates.wizard.clear")}</button> : null}
        </div>
      );
    } else if (isMediaKind(f.kind)) {
      control = (
        <FileControl
          field={f}
          files={wizardFiles(value)}
          pending={pending[f.id] ?? []}
          errors={fileErrors[f.id] ?? []}
          previews={previews}
          invalid={bad}
          onPick={(list) => pickFiles(f, list)}
          onRemove={(i) => removeFile(f, i)}
        />
      );
    } else if (f.kind === "text") {
      control = <textarea className={`${inputCls} h-24 py-2`} value={typeof value === "string" ? value : ""} onChange={(e) => set(f.id, e.target.value)} placeholder={f.placeholder} />;
    } else {
      control = (
        <input
          className={inputCls}
          type={f.kind === "line" && f.input === "number" ? "number" : "text"}
          inputMode={f.kind === "line" && f.input === "number" ? "decimal" : undefined}
          step={f.kind === "line" && f.input === "number" ? f.step ?? "0.5" : undefined}
          min={f.kind === "line" && f.input === "number" ? f.min : undefined}
          max={f.kind === "line" && f.input === "number" ? f.max : undefined}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => set(f.id, e.target.value)}
          placeholder={f.placeholder}
          autoFocus={f === step.fields[0]}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); next(); } }}
        />
      );
    }
    return (
      <div key={f.id} className="space-y-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm font-semibold text-foreground">{f.label}{f.required ? <span className="ml-0.5 text-destructive" aria-hidden>*</span> : null}</span>
          {!f.required ? <span className="text-[11px] text-muted-foreground">{t("cardTemplates.wizard.optional")}</span> : null}
        </div>
        {f.help ? <p className="text-xs text-muted-foreground">{f.help}</p> : null}
        {control}
        {bad ? <p role="alert" className="text-xs text-destructive">{t("cardTemplates.wizard.required")}</p> : null}
      </div>
    );
  };

  return createPortal(
    <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/60 p-2 sm:p-4">
      <div role="dialog" aria-modal="true" aria-label={templateName} className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border bg-card text-foreground shadow-2xl">
        <header className="shrink-0 border-b border-border px-5 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{templateName} · {t("cardTemplates.wizard.stepOf", { n: stepIndex + 1, total: steps.length })}</p>
              <h2 className="truncate text-base font-semibold">{step.title}</h2>
              {step.description ? <p className="text-xs text-muted-foreground">{step.description}</p> : null}
            </div>
            <button type="button" onClick={onClose} aria-label={t("cardTemplates.wizard.skip")} title={t("cardTemplates.wizard.skip")} className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-3 flex gap-1" aria-hidden>
            {steps.map((s, i) => <span key={s.id} className={`h-1 flex-1 rounded-full ${i <= stepIndex ? "bg-primary" : "bg-muted"}`} />)}
          </div>
        </header>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">{step.fields.map(renderField)}</div>
        <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-border bg-card px-5 py-3">
          <button type="button" onClick={onClose} className="h-9 rounded-md px-3 text-sm text-muted-foreground hover:bg-muted hover:text-foreground">{t("cardTemplates.wizard.skip")}</button>
          <div className="flex items-center gap-2">
            {stepIndex > 0 ? (
              <button type="button" onClick={() => { setTried(false); setStepIndex((i) => i - 1); }} className="inline-flex h-9 items-center gap-1 rounded-md border border-border bg-background px-3 text-sm font-medium hover:bg-muted">
                <ChevronLeft className="h-4 w-4" />{t("cardTemplates.wizard.back")}
              </button>
            ) : null}
            {busy ? <span role="status" className="text-xs text-muted-foreground">{t("cardTemplates.wizard.uploadsBusy")}</span> : null}
            <button type="button" onClick={next} disabled={busy} aria-busy={busy} className="inline-flex h-9 items-center gap-1 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60">
              {last ? (wizard.autoCreate === false ? t("cardTemplates.wizard.finishFill") : t("cardTemplates.wizard.finish")) : t("cardTemplates.wizard.next")}
              {last ? <Check className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
          </div>
        </footer>
      </div>
    </div>,
    document.body,
  );
}

/** Picker of an `image` / `file` question: choose or drop files, thumbnails / names, remove buttons and inline errors. */
function FileControl({ field, files, pending, errors, previews, invalid, onPick, onRemove }: {
  field: WizardField;
  files: WizardFile[];
  pending: PendingUpload[];
  errors: string[];
  previews: Record<string, string>;
  invalid: boolean;
  onPick: (files: File[]) => void;
  onRemove: (index: number) => void;
}) {
  const t = useTranslations("board-detail");
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const isImage = field.kind === "image";
  const max = maxFilesOf(field);
  const accept = acceptOf(field);
  const full = max > 1 && files.length + pending.length >= max;
  const errId = `wiz-err-${field.id}`;

  return (
    <div
      role="group"
      aria-label={field.label}
      aria-describedby={errors.length > 0 ? errId : undefined}
      className={`space-y-2 rounded-lg border-2 border-dashed p-3 transition-colors ${dragging ? "border-primary bg-primary/10" : invalid ? "border-destructive/60 bg-background" : "border-border bg-background"}`}
      onDragOver={(e) => { e.preventDefault(); if (!full) setDragging(true); }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false); }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const dropped = Array.from(e.dataTransfer?.files ?? []);
        if (dropped.length > 0) onPick(dropped);
      }}
    >
      <input
        ref={input}
        type="file"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        multiple={max > 1}
        accept={accept.length > 0 ? accept.join(",") : undefined}
        onChange={(e) => {
          const picked = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (picked.length > 0) onPick(picked);
        }}
      />
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
        <Upload className="h-4 w-4 shrink-0" aria-hidden />
        {dragging ? (
          <span className="font-medium text-foreground">{t("cardTemplates.wizard.dropActive")}</span>
        ) : (
          <>
            <span>{isImage ? t("cardTemplates.wizard.dropImages") : t("cardTemplates.wizard.dropFiles")}</span>
            <button
              type="button"
              disabled={full}
              onClick={() => input.current?.click()}
              className="rounded font-medium text-primary underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              {max === 1 && files.length > 0 ? t("cardTemplates.wizard.replaceFile") : isImage ? t("cardTemplates.wizard.chooseImages") : t("cardTemplates.wizard.chooseFiles")}
            </button>
          </>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground">
        {t("cardTemplates.wizard.fileLimits", { mb: WIZARD_MAX_FILE_BYTES / 1048576 })}
        {!isImage && accept.length > 0 ? ` · ${t("cardTemplates.wizard.fileTypes", { types: accept.join(", ") })}` : ""}
        {max > 1 ? ` · ${t("cardTemplates.wizard.filesCount", { n: files.length, max })}` : ""}
      </p>

      {files.length > 0 || pending.length > 0 ? (
        <ul className="space-y-1.5">
          {files.map((file, i) => (
            <li key={`${file.url}-${i}`} className="flex items-center gap-2 rounded-md border border-border bg-card p-1.5">
              <span className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded bg-muted text-muted-foreground">
                {isImage ? <ImageIcon className="h-5 w-5" aria-hidden /> : <FileText className="h-5 w-5" aria-hidden />}
                {isImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={previews[file.url] ?? file.url} alt="" className="absolute inset-0 h-full w-full object-cover" onError={(e) => { e.currentTarget.style.display = "none"; }} />
                ) : null}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-foreground">{file.name}</span>
                {file.size > 0 ? <span className="block text-[11px] text-muted-foreground">{fmtSize(file.size)}</span> : null}
              </span>
              <button
                type="button"
                onClick={() => onRemove(i)}
                aria-label={t("cardTemplates.wizard.removeFile", { name: file.name })}
                title={t("cardTemplates.wizard.removeFile", { name: file.name })}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-destructive focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
          {pending.map((p) => (
            <li key={p.key} role="status" className="flex items-center gap-2 rounded-md border border-border bg-card p-1.5 text-sm text-muted-foreground">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded bg-muted"><Loader2 className="h-5 w-5 animate-spin" aria-hidden /></span>
              <span className="min-w-0 flex-1"><span className="block truncate">{p.name}</span><span className="block text-[11px]">{t("cardTemplates.wizard.uploading")}</span></span>
            </li>
          ))}
        </ul>
      ) : null}

      {errors.length > 0 ? (
        <ul id={errId} role="alert" className="space-y-0.5 text-xs text-destructive">
          {errors.map((m, i) => <li key={i}>{m}</li>)}
        </ul>
      ) : null}
    </div>
  );
}

export { isAnswered };
