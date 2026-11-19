"use client";

import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { AlertTriangle, CalendarDays, Clock, List as ListIcon, Loader2, X } from "lucide-react";
import { useTranslations } from "@/components/providers/i18n-provider";
import { Portal } from "@/components/ui/portal";
import type { PreviewCell, PreviewColumn } from "@/lib/api/file-read-options";
import type { FileColumnType, FileReadOptions } from "@/lib/query/file-read-options";
import { clampSkipRows, COLUMN_TYPES, normalizeDelimiter } from "@/lib/query/file-read-options-state";
import { useFileReadOptions } from "./use-file-read-options";

export interface FileReadOptionsDialogProps {
  open: boolean;
  teamId: string;
  fileId: string;
  fileName: string;
  canEdit: boolean;
  onClose: () => void;
  onSaved?: (options: FileReadOptions) => void;
}

type T = (key: string, params?: Record<string, string | number>) => string;

const FIELD = "h-8 w-full min-w-0 rounded-md border border-border bg-background px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-60";
const LABEL = "mb-1 block text-[11px] font-semibold text-muted-foreground";

const ENCODINGS = ["auto", "utf-8", "utf-16le", "utf-16be", "windows-1252", "iso-8859-1", "iso-8859-15"] as const;
const DELIMS: Array<{ value: string; key: string }> = [
  { value: "auto", key: "auto" },
  { value: ",", key: "comma" },
  { value: ";", key: "semicolon" },
  { value: "\t", key: "tab" },
  { value: "|", key: "pipe" },
  { value: " ", key: "space" },
  { value: ":", key: "colon" },
];
const DETECTIONS = ["first-200", "first-1000", "all", "none"] as const;
const DATE_PRESETS = ["auto", "ymd", "dmy", "mdy"];
const THOUSANDS: Array<{ value: FileReadOptions["thousandsSeparator"]; key: string }> = [
  { value: "", key: "thousandsNone" },
  { value: ",", key: "thousandsComma" },
  { value: ".", key: "thousandsDot" },
  { value: " ", key: "thousandsSpace" },
  { value: "'", key: "thousandsApostrophe" },
];
const DATE_KEYS: Record<string, string> = { auto: "dateAuto", ymd: "dateYmd", dmy: "dateDmy", mdy: "dateMdy" };

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block min-w-0 ${className ?? ""}`}>
      <span className={LABEL}>{label}</span>
      {children}
    </label>
  );
}

function Check({ label, checked, disabled, onChange }: { label: string; checked: boolean; disabled: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className={`flex h-8 items-center gap-2 text-xs text-foreground ${disabled ? "opacity-60" : "cursor-pointer"}`}>
      <input type="checkbox" role="switch" aria-checked={checked} checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-primary" />
      {label}
    </label>
  );
}

function TypeIcon({ type }: { type: FileColumnType }) {
  const cls = "inline-flex h-5 min-w-[1.75rem] items-center justify-center rounded bg-muted px-1 text-[10px] font-bold text-foreground";
  switch (type) {
    case "text": return <span className={cls} aria-hidden>ABC</span>;
    case "integer": return <span className={cls} aria-hidden>123</span>;
    case "decimal": return <span className={cls} aria-hidden>1.2</span>;
    case "boolean": return <span className={cls} aria-hidden>T/F</span>;
    case "date": return <span className={cls} aria-hidden><CalendarDays className="h-3 w-3" /></span>;
    case "datetime": return <span className={cls} aria-hidden><Clock className="h-3 w-3" /></span>;
    default: return <span className={cls} aria-hidden><ListIcon className="h-3 w-3" /></span>;
  }
}

/** Does this cell look like it failed the column's type? The server sends parsed values, so a string in a typed column is a failure. */
function cellFailed(type: FileColumnType, cell: PreviewCell): boolean {
  if (cell === null || cell === undefined) return false;
  switch (type) {
    case "integer":
    case "decimal": return typeof cell !== "number";
    case "boolean": return typeof cell !== "boolean";
    case "date":
    case "datetime": return typeof cell === "string" ? !/\d/.test(cell) : typeof cell === "boolean";
    default: return false;
  }
}

function pct(n: number, total: number): number {
  return total > 0 ? Math.round((n / total) * 1000) / 10 : 0;
}

function ColumnHeader({ column, original, canEdit, t, onType, onRename }: {
  column: PreviewColumn;
  original: string;
  canEdit: boolean;
  t: T;
  onType: (original: string, value: FileColumnType | null, detected: FileColumnType) => void;
  onRename: (original: string, value: string) => void;
}) {
  const [name, setName] = useState(column.name);
  useEffect(() => setName(column.name), [column.name]);
  const valid = Number(column.valid) || 0;
  const errors = Number(column.errors) || 0;
  const empty = Number(column.empty) || 0;
  const total = valid + errors + empty;
  const vp = pct(valid, total);
  const ep = pct(errors, total);
  const mp = pct(empty, total);
  const type = COLUMN_TYPES.includes(column.type) ? column.type : "text";
  const detected = COLUMN_TYPES.includes(column.detectedType) ? column.detectedType : type;
  const tip = t("column.tooltip", { valid, validPct: vp, errors, errorsPct: ep, empty, emptyPct: mp, distinct: Number(column.distinct) || 0 });
  const commit = () => {
    if (name.trim() !== column.name) onRename(original, name);
    if (!name.trim()) setName(column.name);
  };
  return (
    <div className="group flex min-w-[9.5rem] flex-col gap-1.5 p-1.5">
      <div className="flex items-center gap-1.5">
        <TypeIcon type={type} />
        <select
          value={type}
          disabled={!canEdit}
          onChange={(e) => onType(original, e.target.value as FileColumnType, detected)}
          aria-label={t("column.type", { name: column.name })}
          title={type !== detected ? `${t("column.overridden")} - ${t("column.autoType", { type: t(`types.${detected}`) })}` : t("column.autoType", { type: t(`types.${detected}`) })}
          className={`${FIELD} h-7 flex-1 ${type !== detected ? "border-primary" : ""}`}
        >
          {COLUMN_TYPES.map((ty) => <option key={ty} value={ty}>{t(`types.${ty}`)}</option>)}
        </select>
      </div>
      <input
        value={name}
        disabled={!canEdit}
        onChange={(e) => setName(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") { setName(column.name); e.stopPropagation(); }
        }}
        aria-label={t("column.rename", { name: column.name })}
        className="h-7 w-full min-w-0 rounded border border-transparent bg-transparent px-1 text-xs font-semibold text-foreground hover:border-border focus-visible:border-primary focus-visible:outline-none disabled:opacity-100"
      />
      <div title={tip} role="img" aria-label={`${t("column.quality")}: ${tip}`}>
        <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div className="bg-emerald-500" style={{ width: `${vp}%` }} />
          <div className="bg-red-500" style={{ width: `${ep}%` }} />
          <div className="bg-muted-foreground/40" style={{ width: `${mp}%` }} />
        </div>
        <div className="mt-0.5 flex justify-between text-[10px] text-muted-foreground">
          <span>{vp}%{errors > 0 ? ` / ${ep}%` : ""}</span>
          <span className="opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">{t("column.distinct", { n: Number(column.distinct) || 0 })}</span>
        </div>
      </div>
    </div>
  );
}

function NullChips({ tokens, disabled, t, onChange }: { tokens: string[]; disabled: boolean; t: T; onChange: (v: string[]) => void }) {
  const [text, setText] = useState("");
  const add = () => {
    if (!tokens.includes(text)) onChange([...tokens, text]);
    setText("");
  };
  return (
    <div className="flex min-h-8 flex-wrap items-center gap-1 rounded-md border border-border bg-background px-1.5 py-1">
      {tokens.map((tok) => (
        <span key={tok} className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[11px] text-foreground">
          {tok === "" ? <em className="text-muted-foreground">{t("locale.emptyString")}</em> : tok}
          {!disabled && (
            <button type="button" onClick={() => onChange(tokens.filter((x) => x !== tok))} aria-label={t("locale.nullTokenRemove", { token: tok === "" ? t("locale.emptyString") : tok })} className="rounded text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
              <X className="h-3 w-3" />
            </button>
          )}
        </span>
      ))}
      {!disabled && (
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          onBlur={() => { if (text) add(); }}
          placeholder={t("locale.nullTokensHint")}
          aria-label={t("locale.nullTokens")}
          className="h-6 min-w-[8rem] flex-1 bg-transparent px-1 text-xs text-foreground focus-visible:outline-none"
        />
      )}
    </div>
  );
}

function showDelim(d: string, t: T): string {
  if (d === "\t") return t("delimiterName.tab");
  if (d === " ") return t("delimiterName.space");
  return d || t("delimiterName.none");
}

function Body({ teamId, fileId, fileName, canEdit, onClose, onSaved, t }: Omit<FileReadOptionsDialogProps, "open"> & { t: T }) {
  const h = useFileReadOptions(teamId, fileId, true);
  const { draft, set, preview } = h;
  const [tab, setTab] = useState<"data" | "raw">("data");
  const [delimCustom, setDelimCustom] = useState(false);
  const [dateCustom, setDateCustom] = useState(false);
  const loadedKey = useRef<string>("");
  const isXlsx = h.kind === "xlsx";
  const tabId = useId();

  // When the loaded options already use a custom delimiter / date pattern, open those fields.
  useEffect(() => {
    if (h.loading || loadedKey.current === fileId) return;
    loadedKey.current = fileId;
    setDelimCustom(draft.delimiter !== "auto" && !DELIMS.some((d) => d.value === draft.delimiter));
    setDateCustom(!DATE_PRESETS.includes(draft.dateFormat));
  }, [h.loading, fileId, draft.delimiter, draft.dateFormat]);

  const delimSelect = delimCustom || !DELIMS.some((d) => d.value === draft.delimiter) ? "custom" : draft.delimiter;
  const dateSelect = dateCustom || !DATE_PRESETS.includes(draft.dateFormat) ? "custom" : draft.dateFormat;

  const data = preview.data;
  const columns = data?.columns ?? [];
  const rows = data?.rows ?? [];
  const original = (name: string) => Object.keys(draft.columnNames).find((k) => draft.columnNames[k] === name) ?? name;

  const onType = (orig: string, value: FileColumnType | null, detected: FileColumnType) =>
    h.setColumnType(orig, value === null || value === detected ? null : value);

  const submit = async () => {
    if (canEdit && !h.dirty) {
      onSaved?.(draft);
      onClose();
      return;
    }
    const saved = await h.save(canEdit);
    if (saved) {
      onSaved?.(saved);
      onClose();
    }
  };

  const dis = !canEdit;
  const sheetList = h.sheets;

  return (
    <>
      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <h2 id={`${tabId}-title`} className="text-base font-bold text-foreground">{t("title")}</h2>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{t("subtitle", { name: fileName })}</p>
        </div>
        <button type="button" onClick={onClose} aria-label={t("close")} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          <X className="h-4 w-4" />
        </button>
      </div>

      {h.loading ? (
        <div className="flex flex-1 items-center justify-center gap-2 p-10 text-sm text-muted-foreground" role="status">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />{t("loading")}
        </div>
      ) : h.loadError ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-10 text-center text-sm text-foreground" role="alert">
          <p>{t("loadError", { message: h.loadError })}</p>
          <button type="button" onClick={() => window.location.reload()} className="rounded-md border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted">{t("retry")}</button>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <div className="shrink-0 space-y-3 border-b border-border px-4 py-3 sm:px-5">
            {!canEdit && <p className="rounded-md bg-muted px-2.5 py-1.5 text-xs text-foreground">{t("readOnly")}</p>}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {isXlsx ? (
                <Field label={t("sheet.label")}>
                  <select className={FIELD} disabled={dis} value={draft.sheet ?? ""} onChange={(e) => set({ sheet: e.target.value || null })}>
                    <option value="">{t("sheet.first")}</option>
                    {sheetList.map((s) => <option key={s} value={s}>{s}</option>)}
                    {draft.sheet && !sheetList.includes(draft.sheet) && <option value={draft.sheet}>{draft.sheet}</option>}
                  </select>
                </Field>
              ) : (
                <>
                  <Field label={t("origin.label")}>
                    <select className={FIELD} disabled={dis} value={draft.encoding} onChange={(e) => set({ encoding: e.target.value as FileReadOptions["encoding"] })}>
                      {ENCODINGS.map((enc) => <option key={enc} value={enc}>{t(`origin.${enc}`)}</option>)}
                    </select>
                  </Field>
                  <div className="min-w-0">
                    <Field label={t("delimiter.label")}>
                      <select
                        className={FIELD}
                        disabled={dis}
                        value={delimSelect}
                        onChange={(e) => {
                          if (e.target.value === "custom") { setDelimCustom(true); return; }
                          setDelimCustom(false);
                          set({ delimiter: e.target.value });
                        }}
                      >
                        {DELIMS.map((d) => <option key={d.key} value={d.value}>{t(`delimiter.${d.key}`)}</option>)}
                        <option value="custom">{t("delimiter.custom")}</option>
                      </select>
                    </Field>
                    {delimSelect === "custom" && (
                      <input
                        className={`${FIELD} mt-1 font-mono`}
                        disabled={dis}
                        maxLength={3}
                        value={draft.delimiter === "auto" ? "" : draft.delimiter}
                        placeholder={t("delimiter.customPlaceholder")}
                        aria-label={t("delimiter.customLabel")}
                        onChange={(e) => set({ delimiter: normalizeDelimiter(e.target.value) })}
                      />
                    )}
                  </div>
                </>
              )}
              <Field label={t("detection.label")} className={isXlsx ? "" : "sm:col-span-2 lg:col-span-1"}>
                <select className={FIELD} disabled={dis} value={draft.typeDetection} onChange={(e) => set({ typeDetection: e.target.value as FileReadOptions["typeDetection"] })}>
                  {DETECTIONS.map((d) => <option key={d} value={d}>{t(`detection.${d}`)}</option>)}
                </select>
              </Field>
            </div>

            <div className="grid grid-cols-2 items-end gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <Field label={t("skipRows")}>
                <input type="number" min={0} max={1000} className={FIELD} disabled={dis} value={draft.skipRows} onChange={(e) => set({ skipRows: clampSkipRows(e.target.value) })} />
              </Field>
              <Check label={t("header")} checked={draft.hasHeader} disabled={dis} onChange={(v) => set({ hasHeader: v })} />
              <Check label={t("skipBlank")} checked={draft.skipBlankLines} disabled={dis} onChange={(v) => set({ skipBlankLines: v })} />
              {!isXlsx && (
                <Field label={t("comment.label")}>
                  <input className={FIELD} disabled={dis} maxLength={5} value={draft.commentPrefix ?? ""} placeholder={t("comment.placeholder")} onChange={(e) => set({ commentPrefix: e.target.value || null })} />
                </Field>
              )}
              <Check label={t("trim")} checked={draft.trim} disabled={dis} onChange={(v) => set({ trim: v })} />
              {!isXlsx && (
                <Field label={t("quote.label")}>
                  <select className={FIELD} disabled={dis} value={draft.quote} onChange={(e) => set({ quote: e.target.value as FileReadOptions["quote"] })}>
                    <option value={'"'}>{t("quote.double")}</option>
                    <option value="'">{t("quote.single")}</option>
                    <option value="none">{t("quote.none")}</option>
                  </select>
                </Field>
              )}
            </div>

            <fieldset className="rounded-lg border border-border p-3">
              <legend className="px-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{t("locale.title")}</legend>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Field label={t("locale.decimal")}>
                  <select className={FIELD} disabled={dis} value={draft.decimalSeparator} onChange={(e) => { const d = e.target.value === "," ? "," : "."; set(draft.thousandsSeparator === d ? { decimalSeparator: d, thousandsSeparator: "" } : { decimalSeparator: d }); }}>
                    <option value=".">{t("locale.decimalDot")}</option>
                    <option value=",">{t("locale.decimalComma")}</option>
                  </select>
                </Field>
                <Field label={t("locale.thousands")}>
                  <select className={FIELD} disabled={dis} value={draft.thousandsSeparator} onChange={(e) => set({ thousandsSeparator: e.target.value as FileReadOptions["thousandsSeparator"] })}>
                    {THOUSANDS.map((th) => <option key={th.key} value={th.value} disabled={th.value !== "" && th.value === draft.decimalSeparator}>{t(`locale.${th.key}`)}</option>)}
                  </select>
                </Field>
                <div className="min-w-0">
                  <Field label={t("locale.dateOrder")}>
                    <select
                      className={FIELD}
                      disabled={dis}
                      value={dateSelect}
                      onChange={(e) => {
                        if (e.target.value === "custom") { setDateCustom(true); return; }
                        setDateCustom(false);
                        set({ dateFormat: e.target.value });
                      }}
                    >
                      {DATE_PRESETS.map((p) => <option key={p} value={p}>{t(`locale.${DATE_KEYS[p]}`)}</option>)}
                      <option value="custom">{t("locale.dateCustom")}</option>
                    </select>
                  </Field>
                  {dateSelect === "custom" && (
                    <input
                      className={`${FIELD} mt-1 font-mono`}
                      disabled={dis}
                      value={DATE_PRESETS.includes(draft.dateFormat) ? "" : draft.dateFormat}
                      placeholder={t("locale.datePatternPlaceholder")}
                      aria-label={t("locale.datePattern")}
                      onChange={(e) => set({ dateFormat: e.target.value })}
                    />
                  )}
                </div>
                <Field label={t("locale.listSeparator")}>
                  <input className={FIELD} disabled={dis} maxLength={10} value={draft.listSeparator ?? ""} placeholder={t("locale.listSeparatorPlaceholder")} onChange={(e) => set({ listSeparator: e.target.value || null })} />
                </Field>
                <div className="min-w-0 sm:col-span-2 lg:col-span-4">
                  <span className={LABEL}>{t("locale.nullTokens")}</span>
                  <NullChips tokens={draft.nullTokens} disabled={dis} t={t} onChange={(v) => set({ nullTokens: v })} />
                </div>
              </div>
            </fieldset>
          </div>

          <div className="flex min-h-[16rem] flex-1 flex-col px-4 py-3 sm:px-5">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div role="tablist" aria-label={t("tabs.label")} className="inline-flex rounded-md border border-border p-0.5">
                {(["data", "raw"] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    role="tab"
                    aria-selected={tab === k}
                    onClick={() => setTab(k)}
                    className={`rounded px-3 py-1 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${tab === k ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted"}`}
                  >
                    {k === "data" ? t("tabs.preview") : t("tabs.raw")}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground" aria-live="polite">
                {preview.loading && <><Loader2 className="h-3 w-3 animate-spin" aria-hidden />{t("preview.loading")}</>}
                {!preview.loading && data && (
                  <span>{t("preview.summary", { rows: data.totalRowsSeen, more: data.truncated ? t("preview.moreRows") : "", encoding: data.encodingUsed || "-", delimiter: showDelim(data.delimiterUsed, t) })}</span>
                )}
              </div>
            </div>

            {preview.error && (
              <div className="mb-2 flex items-start gap-1.5 rounded-md border border-red-500/40 bg-red-500/10 px-2 py-1.5 text-xs text-red-800 dark:text-red-200" role="alert">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                <span>{t("preview.error", { message: preview.error })}</span>
              </div>
            )}

            <div className={`relative min-h-0 flex-1 overflow-auto rounded-lg border border-border ${preview.loading ? "opacity-70" : ""}`} role="tabpanel">
              {!data ? (
                <div className="p-6 text-center text-xs text-muted-foreground">{preview.loading ? t("preview.loading") : t("preview.empty")}</div>
              ) : tab === "data" ? (
                columns.length === 0 ? (
                  <div className="p-6 text-center text-xs text-muted-foreground">{t("preview.empty")}</div>
                ) : (
                  <table className="w-max min-w-full border-collapse text-xs">
                    <thead className="sticky top-0 z-10 bg-card">
                      <tr>
                        <th scope="col" className="w-10 border-b border-r border-border bg-muted px-2 text-right align-bottom text-[10px] font-normal text-muted-foreground">#</th>
                        {columns.map((c, i) => (
                          <th key={`${c.name}-${i}`} scope="col" className="border-b border-r border-border bg-card text-left align-top font-normal">
                            <ColumnHeader column={c} original={original(String(c.name))} canEdit={canEdit} t={t} onType={onType} onRename={(o, v) => h.setColumnName(o, v)} />
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row, r) => (
                        <tr key={r} className="odd:bg-card even:bg-muted/30">
                          <th scope="row" className="border-r border-border px-2 text-right text-[10px] font-normal text-muted-foreground">{r + 1}</th>
                          {columns.map((c, ci) => {
                            const cell = row[ci] ?? null;
                            const failed = cellFailed(c.type, cell);
                            return (
                              <td key={ci} title={failed ? t("preview.cellError") : undefined} className={`max-w-[18rem] truncate border-r border-border px-2 py-1 text-foreground ${failed ? "bg-red-500/15 text-red-700 dark:text-red-300" : ""}`}>
                                {cell === null ? <span className="italic text-muted-foreground">{t("preview.nullCell")}</span> : String(cell)}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )
              ) : (data.rawRows ?? []).length === 0 ? (
                <div className="p-6 text-center text-xs text-muted-foreground">{t("preview.empty")}</div>
              ) : (
                <pre className="m-0 w-max min-w-full p-2 font-mono text-[11px] leading-5 text-foreground">
                  {data.rawRows.map((fields, r) => (
                    <div key={r} className="whitespace-pre">
                      <span className="mr-3 inline-block w-8 select-none text-right text-muted-foreground">{r + 1}</span>
                      {fields.map((f, i) => (
                        <React.Fragment key={i}>
                          {i > 0 && <span className="rounded-sm bg-primary/20 px-0.5 font-bold text-primary">{data.delimiterUsed === "\t" ? "→" : data.delimiterUsed || "|"}</span>}
                          {String(f)}
                        </React.Fragment>
                      ))}
                    </div>
                  ))}
                </pre>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="shrink-0 space-y-2 border-t border-border px-4 py-3 sm:px-5">
        {(data?.warnings?.length ?? 0) > 0 && (
          <div className="rounded-md border border-amber-500/50 bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-900 dark:text-amber-200" role="status">
            <div className="flex items-center gap-1 font-semibold"><AlertTriangle className="h-3 w-3" aria-hidden />{t("warnings")}</div>
            <ul className="ml-4 list-disc">{data!.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
          </div>
        )}
        {h.saveError && <p className="text-xs text-red-700 dark:text-red-300" role="alert">{t("saveError", { message: h.saveError })}</p>}
        <div className="flex flex-wrap items-center justify-end gap-2">
          {canEdit && h.dirty && (
            <button type="button" onClick={h.reset} className="mr-auto rounded-md px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">{t("reset")}</button>
          )}
          <button type="button" onClick={onClose} className="rounded-md border border-border px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">{t("cancel")}</button>
          <button
            type="button"
            onClick={submit}
            disabled={h.loading || !!h.loadError || h.saving}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-1.5 text-xs font-bold text-primary-foreground hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:opacity-50"
          >
            {h.saving && <Loader2 className="h-3 w-3 animate-spin" aria-hidden />}
            {h.saving ? t("saving") : canEdit ? t("load") : t("useSession")}
          </button>
        </div>
      </div>
    </>
  );
}

export function FileReadOptionsDialog(props: FileReadOptionsDialogProps) {
  const { open, onClose } = props;
  const tr = useTranslations("file-options") as T;
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); onClose(); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      previous?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <Portal>
      <div className="fixed inset-0 z-[300] flex items-stretch justify-center bg-background/80 p-0 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={tr("title")} className="flex h-full max-h-full w-full max-w-6xl flex-col overflow-hidden border border-border bg-card text-foreground shadow-2xl focus:outline-none sm:h-auto sm:max-h-[94vh] sm:rounded-2xl">
          <Body {...props} t={tr} />
        </div>
      </div>
    </Portal>
  );
}
