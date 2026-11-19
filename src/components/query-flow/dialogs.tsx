"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { useTranslations } from "@/components/providers/i18n-provider";
import { KqlInput } from "@/components/ui/kql-input";
import type { KqlTable } from "@/lib/query/kql";
import type { KqlSchema } from "@/lib/query/kql-complete";
import { uid } from "@/lib/query-flow/defaults";
import { registerPopup } from "@/lib/query-flow/escape";
import { checkScript } from "@/lib/query-flow/diagnose";
import { COND_OP_KEYS } from "@/lib/query-flow/labels";
import type { OpDef } from "@/lib/query-flow/ops";
import { catalogGroups, checkDeclaration, validateExpression } from "@/lib/query-flow/expression";
import { INLINE_MAX_COLUMNS, INLINE_MAX_ROWS, INLINE_TYPES, METRIC_KINDS } from "@/lib/query-flow/types";
import type { CondOp, FlowFunction, FlowNode, FlowParam, FlowQuery, GroupData, InlineTable, InlineType, MetricKind, ParamType, SourceData } from "@/lib/query-flow/types";
import type { QueryTable } from "@/lib/api/query-files";
import type { TableOrigin } from "@/lib/query-flow/table-names";
import type { QueryFile } from "@/lib/api/query-files";
import { FieldLabel, SelectInput, SmallButton, TextInput } from "./fields";
import { GroupFields, NodeInspector, type InspectorProps } from "./node-inspector";
import { SourceFields } from "./source-fields";

/** A modal like Power Query's dialogs: title, body, OK / Cancel. Escape closes it (and nothing behind it). */
export function ModalShell({ title, onClose, children, onOk, okDisabled, okLabel, cancelLabel, wide }: { title: string; onClose: () => void; children: ReactNode; onOk?: () => void; okDisabled?: boolean; okLabel?: string; cancelLabel?: string; wide?: boolean }) {
  const t = useTranslations("query-flow");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  useEffect(() => registerPopup(), []);
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[1500] flex items-center justify-center bg-black/50 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onKeyDown={(e) => {
          if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); }
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && onOk && !okDisabled) { e.preventDefault(); e.stopPropagation(); onOk(); }
        }}
        className={`flex max-h-[88vh] w-full flex-col rounded-xl border border-border bg-card text-card-foreground shadow-2xl outline-none ${wide ? "max-w-3xl" : "max-w-md"}`}
      >
        <p className="border-b border-border px-4 py-3 text-sm font-semibold">{title}</p>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
        <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
          <SmallButton onClick={onClose} className="h-8 px-3 text-xs">{cancelLabel ?? t("dialog.cancel")}</SmallButton>
          {onOk ? <button type="button" disabled={okDisabled} onClick={onOk} className="inline-flex h-8 items-center rounded-md bg-primary px-4 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">{okLabel ?? t("dialog.ok")}</button> : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Checklist of column names with a search box ("Choose Columns"). */
export function ColumnChecklist({ columns, picked, onChange }: { columns: string[]; picked: string[]; onChange: (next: string[]) => void }) {
  const t = useTranslations("query-flow");
  const [search, setSearch] = useState("");
  const shown = columns.filter((c) => c.toLowerCase().includes(search.trim().toLowerCase()));
  return (
    <div className="space-y-2">
      <TextInput value={search} placeholder={t("dialogs.searchColumns")} aria-label={t("dialogs.searchColumns")} onChange={(e) => setSearch(e.target.value)} />
      <div className="flex gap-2">
        <SmallButton onClick={() => onChange([...columns])}>{t("dialogs.selectAll")}</SmallButton>
        <SmallButton onClick={() => onChange([])}>{t("dialogs.selectNone")}</SmallButton>
      </div>
      <ul className="max-h-64 space-y-0.5 overflow-y-auto rounded-md border border-border p-1">
        {shown.map((c) => (
          <li key={c}>
            <label className="flex items-center gap-2 rounded px-1.5 py-1 text-xs text-foreground hover:bg-muted">
              <input type="checkbox" checked={picked.includes(c)} onChange={(e) => onChange(e.target.checked ? [...picked, c] : picked.filter((x) => x !== c))} />
              <span className="min-w-0 flex-1 truncate">{c}</span>
            </label>
          </li>
        ))}
        {shown.length === 0 ? <li className="px-1.5 py-1 text-xs text-muted-foreground">{t("dialogs.noColumns")}</li> : null}
      </ul>
    </div>
  );
}

export function ChooseColumnsDialog({ columns, initial, onOk, onClose }: { columns: string[]; initial: string[]; onOk: (picked: string[]) => void; onClose: () => void }) {
  const t = useTranslations("query-flow");
  const [order, setOrder] = useState<string[]>(columns);
  const [picked, setPicked] = useState<string[]>(initial.length > 0 ? initial : columns);
  const [search, setSearch] = useState("");
  const move = (name: string, delta: -1 | 1) => setOrder((o) => {
    const i = o.indexOf(name);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= o.length) return o;
    const next = [...o];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  });
  // the order of the list is the order of the result
  const chosen = order.filter((c) => picked.includes(c));
  const shown = order.filter((c) => c.toLowerCase().includes(search.trim().toLowerCase()));
  return (
    <ModalShell title={t("rb.chooseColumns")} onClose={onClose} onOk={() => onOk(chosen)} okDisabled={chosen.length === 0}>
      <div className="space-y-2">
        <TextInput value={search} placeholder={t("dialogs.searchColumns")} aria-label={t("dialogs.searchColumns")} onChange={(e) => setSearch(e.target.value)} />
        <div className="flex gap-2">
          <SmallButton onClick={() => setPicked([...columns])}>{t("dialogs.selectAll")}</SmallButton>
          <SmallButton onClick={() => setPicked([])}>{t("dialogs.selectNone")}</SmallButton>
        </div>
        <ul className="max-h-64 space-y-0.5 overflow-y-auto rounded-md border border-border p-1">
          {shown.map((c) => (
            <li key={c} className="flex items-center gap-1 rounded px-1 hover:bg-muted">
              <label className="flex min-w-0 flex-1 items-center gap-2 py-1 text-xs text-foreground">
                <input type="checkbox" checked={picked.includes(c)} onChange={(e) => setPicked(e.target.checked ? [...picked, c] : picked.filter((x) => x !== c))} />
                <span className="min-w-0 flex-1 truncate">{c}</span>
              </label>
              <button type="button" aria-label={t("select.moveUp")} title={t("select.moveUp")} onClick={() => move(c, -1)} className="h-6 w-6 rounded text-muted-foreground hover:bg-background hover:text-foreground">↑</button>
              <button type="button" aria-label={t("dialogs.moveDown")} title={t("dialogs.moveDown")} onClick={() => move(c, 1)} className="h-6 w-6 rounded text-muted-foreground hover:bg-background hover:text-foreground">↓</button>
            </li>
          ))}
          {shown.length === 0 ? <li className="px-1.5 py-1 text-xs text-muted-foreground">{t("dialogs.noColumns")}</li> : null}
        </ul>
      </div>
    </ModalShell>
  );
}

/** Dialog of an operation with parameters (Keep Top Rows, Replace Values, Split Column...): the fields come from its definition. */
export function ParamDialog({ def, initial, columns, selected, onOk, onClose }: { def: OpDef; initial: Record<string, string>; columns: string[]; selected: string[]; onOk: (params: Record<string, string>, picked: string[]) => void; onClose: () => void }) {
  const t = useTranslations("query-flow");
  const [params, setParams] = useState<Record<string, string>>(() => {
    const start: Record<string, string> = {};
    for (const p of def.params) start[p.key] = initial[p.key] ?? p.default ?? "";
    return start;
  });
  const [picked, setPicked] = useState<string[]>(selected);
  const choiceLabel = (key: string, value: string): string => {
    if (key === "op") return t(`cond.ops.${COND_OP_KEYS[value as CondOp] ?? "eq"}`);
    if (key === "parser") return t(`types.${value}`);
    return value === "yes" ? t("dialogs.yes") : value === "no" ? t("dialogs.no") : value;
  };
  const hasColumns = def.params.some((p) => p.kind === "columns");
  const set = (key: string, value: string) => setParams((p) => ({ ...p, [key]: value }));
  return (
    <ModalShell title={t(`ops.${def.id}`)} onClose={onClose} onOk={() => onOk(params, picked)} okDisabled={hasColumns && picked.length < 2 && def.id === "merge"}>
      <div className="space-y-3">
        {def.params.map((p) => (
          <div key={p.key}>
            <FieldLabel>{t(`params.${p.key}`)}</FieldLabel>
            {p.kind === "columns" ? (
              <ColumnChecklist columns={columns} picked={picked} onChange={setPicked} />
            ) : p.kind === "choice" ? (
              <SelectInput ariaLabel={t(`params.${p.key}`)} value={params[p.key]} onChange={(v) => set(p.key, v)} options={(p.choices ?? []).map((c) => ({ value: c, label: choiceLabel(p.key, c) }))} />
            ) : (
              <TextInput type={p.kind === "number" ? "number" : "text"} autoFocus={p === def.params[0]} value={params[p.key]} aria-label={t(`params.${p.key}`)} onChange={(e) => set(p.key, e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onOk(params, picked); } }} />
            )}
          </div>
        ))}
      </div>
    </ModalShell>
  );
}

const BASIC_METRICS: MetricKind[] = ["count", "sum", "avg", "min", "max", "median", "count_distinct"];

/** Group By with the Basic / Advanced radio of Power Query. */
export function GroupByDialog({ columns, initialDims, filterSchema, onOk, onClose }: { columns: string[]; initialDims: string[]; filterSchema: KqlSchema; onOk: (data: Record<string, unknown>) => void; onClose: () => void }) {
  const t = useTranslations("query-flow");
  const [advanced, setAdvanced] = useState(initialDims.length > 1);
  const [dim, setDim] = useState(initialDims[0] ?? columns[0] ?? "");
  const [fn, setFn] = useState<MetricKind>("count");
  const [field, setField] = useState("");
  const [data, setData] = useState<GroupData>(() => ({
    dimensions: initialDims.map((f) => ({ id: uid("d"), field: f, bucket: "none" as const })),
    metrics: [{ id: uid("m"), fn: "count" as MetricKind, field: "", field2: "", arg: "" }],
    having: "",
  }));
  const basicData = (): GroupData => ({ dimensions: dim ? [{ id: uid("d"), field: dim, bucket: "none" }] : [], metrics: [{ id: uid("m"), fn, field: fn === "count" ? "" : field, field2: "", arg: "" }], having: "" });
  return (
    <ModalShell title={t("rb.groupBy")} wide={advanced} onClose={onClose} onOk={() => onOk({ ...(advanced ? data : basicData()) })}>
      <div className="space-y-3">
        <div role="radiogroup" aria-label={t("dialogs.groupMode")} className="flex gap-4 text-xs text-foreground">
          <label className="flex items-center gap-1.5"><input type="radio" checked={!advanced} onChange={() => setAdvanced(false)} />{t("dialogs.basic")}</label>
          <label className="flex items-center gap-1.5"><input type="radio" checked={advanced} onChange={() => setAdvanced(true)} />{t("dialogs.advanced")}</label>
        </div>
        {advanced ? (
          <GroupFields d={data} columns={columns} filterSchema={filterSchema} onChange={(d) => setData(d as unknown as GroupData)} />
        ) : (
          <div className="space-y-2">
            <div>
              <FieldLabel>{t("group.dimensions")}</FieldLabel>
              <SelectInput ariaLabel={t("group.dimensions")} value={dim} onChange={setDim} options={[{ value: "", label: "—" }, ...columns.map((c) => ({ value: c, label: c }))]} />
            </div>
            <div>
              <FieldLabel>{t("group.metric")}</FieldLabel>
              <SelectInput ariaLabel={t("group.metric")} value={fn} onChange={(v) => setFn(v as MetricKind)} options={BASIC_METRICS.filter((m) => METRIC_KINDS.includes(m)).map((m) => ({ value: m, label: t(`group.metricKinds.${m}`) }))} />
            </div>
            {fn !== "count" ? (
              <div>
                <FieldLabel>{t("group.field")}</FieldLabel>
                <SelectInput ariaLabel={t("group.field")} value={field} onChange={setField} options={[{ value: "", label: "—" }, ...columns.map((c) => ({ value: c, label: c }))]} />
              </div>
            ) : null}
          </div>
        )}
      </div>
    </ModalShell>
  );
}

const JOIN_KINDS: Array<{ id: string; supported: boolean; kind?: "inner" | "left" }> = [
  { id: "leftOuter", supported: true, kind: "left" },
  { id: "rightOuter", supported: false },
  { id: "fullOuter", supported: false },
  { id: "inner", supported: true, kind: "inner" },
  { id: "leftAnti", supported: false },
  { id: "rightAnti", supported: false },
];

function MiniTable({ columns, rows, picked, onPick }: { columns: string[]; rows: string[][]; picked: string; onPick: (c: string) => void }) {
  return (
    <div className="max-h-40 overflow-auto rounded-md border border-border">
      <table className="w-full border-collapse text-[11px]">
        <thead className="sticky top-0 bg-muted">
          <tr>{columns.map((c) => (
            <th key={c} className={`border border-border p-0 text-left ${c === picked ? "bg-primary/20" : ""}`}>
              <button type="button" onClick={() => onPick(c)} className="block w-full truncate px-1.5 py-1 text-left font-semibold text-foreground">{c}</button>
            </th>
          ))}</tr>
        </thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{r.map((cell, j) => <td key={j} className={`max-w-[140px] truncate border border-border bg-card px-1.5 py-0.5 text-foreground ${columns[j] === picked ? "bg-primary/5" : ""}`}>{cell}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

export interface MergeResult { rightSource: SourceData; leftKey: string; rightKey: string; kind: "inner" | "left" }

/** Merge Queries: the two tables with their key picked by clicking a header, and the join kind list of Power Query. */
export function MergeDialog({ leftColumns, leftRows, queries, activeQueryId, tables, onOk, onClose }: { leftColumns: string[]; leftRows: string[][]; queries: FlowQuery[]; activeQueryId: string; tables: KqlTable[]; onOk: (r: MergeResult) => void; onClose: () => void }) {
  const t = useTranslations("query-flow");
  const options = useMemo(() => [
    ...queries.filter((q) => q.id !== activeQueryId).map((q) => ({ value: `q:${q.id}`, label: q.name, source: { kind: "query", name: q.id } as SourceData })),
    ...tables.map((tb) => ({ value: `t:${tb.id}`, label: tb.title, source: { kind: "rows", name: tb.title } as SourceData })),
  ], [queries, activeQueryId, tables]);
  const [right, setRight] = useState(options[0]?.value ?? "");
  const [leftKey, setLeftKey] = useState("");
  const [rightKey, setRightKey] = useState("");
  const [kindId, setKindId] = useState("leftOuter");
  const chosen = options.find((o) => o.value === right);
  const rightTable = right.startsWith("t:") ? tables.find((tb) => `t:${tb.id}` === right) : undefined;
  const rightRows = rightTable ? rightTable.rows.slice(0, 5).map((r) => rightTable.columns.map((c) => { const v = r.fields?.[c]; return Array.isArray(v) ? v.join(", ") : v === null || v === undefined ? "" : String(v); })) : [];
  const kind = JOIN_KINDS.find((k) => k.id === kindId)?.kind ?? "left";
  return (
    <ModalShell title={t("rb.mergeQueries")} wide onClose={onClose} okDisabled={!chosen || !leftKey.trim() || !rightKey.trim()} onOk={() => chosen && onOk({ rightSource: chosen.source, leftKey: leftKey.trim(), rightKey: rightKey.trim(), kind })}>
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">{t("dialogs.mergeHint")}</p>
        <div>
          <FieldLabel>{t("dialogs.leftTable")}</FieldLabel>
          {leftColumns.length > 0 ? <MiniTable columns={leftColumns} rows={leftRows.slice(0, 5)} picked={leftKey} onPick={setLeftKey} /> : <p className="text-xs text-muted-foreground">{t("ribbon.noColumnsYet")}</p>}
          <TextInput className="mt-1" value={leftKey} placeholder={t("join.leftKey")} aria-label={t("join.leftKey")} onChange={(e) => setLeftKey(e.target.value)} />
        </div>
        <div>
          <FieldLabel>{t("dialogs.rightTable")}</FieldLabel>
          <SelectInput ariaLabel={t("dialogs.rightTable")} value={right} onChange={(v) => { setRight(v); setRightKey(""); }} options={options.length > 0 ? options.map((o) => ({ value: o.value, label: o.label })) : [{ value: "", label: t("dialogs.noOtherTables") }]} />
          {rightTable ? <div className="mt-1"><MiniTable columns={rightTable.columns} rows={rightRows} picked={rightKey} onPick={setRightKey} /></div> : null}
          <TextInput className="mt-1" value={rightKey} placeholder={t("join.rightKey")} aria-label={t("join.rightKey")} onChange={(e) => setRightKey(e.target.value)} />
        </div>
        <div>
          <FieldLabel>{t("join.kind")}</FieldLabel>
          <SelectInput ariaLabel={t("join.kind")} value={kindId} onChange={setKindId} options={JOIN_KINDS.map((k) => ({ value: k.id, label: `${t(`dialogs.joinKinds.${k.id}`)}${k.supported ? "" : ` (${t("steps.needsEngine")})`}`, disabled: !k.supported }))} />
          <p className="mt-1 text-[10px] text-muted-foreground">{t("dialogs.joinKindHint")}</p>
        </div>
      </div>
    </ModalShell>
  );
}

/** Append Queries: the second source to put after the current query. */
export function AppendDialog({ queries, activeQueryId, tables, onOk, onClose }: { queries: FlowQuery[]; activeQueryId: string; tables: KqlTable[]; onOk: (source: SourceData) => void; onClose: () => void }) {
  const t = useTranslations("query-flow");
  const options = [
    ...queries.filter((q) => q.id !== activeQueryId).map((q) => ({ value: `q:${q.id}`, label: q.name, source: { kind: "query", name: q.id } as SourceData })),
    ...tables.map((tb) => ({ value: `t:${tb.id}`, label: tb.title, source: { kind: "rows", name: tb.title } as SourceData })),
  ];
  const [value, setValue] = useState(options[0]?.value ?? "");
  const chosen = options.find((o) => o.value === value);
  return (
    <ModalShell title={t("rb.appendQueries")} onClose={onClose} okDisabled={!chosen} onOk={() => chosen && onOk(chosen.source)}>
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">{t("dialogs.appendHint")}</p>
        <SelectInput ariaLabel={t("dialogs.rightTable")} value={value} onChange={setValue} options={options.length > 0 ? options.map((o) => ({ value: o.value, label: o.label })) : [{ value: "", label: t("dialogs.noOtherTables") }]} />
      </div>
    </ModalShell>
  );
}

/** Settings of one step in a dialog (the gear / double click / Edit Settings of Power Query): edits a draft, OK applies it. */
export function StepDialog({ node, title, inspector, onOk, onDelete, onClose }: { node: FlowNode; title: string; inspector: Omit<InspectorProps, "node" | "onChange" | "onMeta" | "onDelete">; onOk: (node: FlowNode) => void; onDelete: () => void; onClose: () => void }) {
  const t = useTranslations("query-flow");
  const [draft, setDraft] = useState<FlowNode>(node);
  return (
    <ModalShell title={title || t("inspector.stepSettings")} wide={node.type === "group" || node.type === "transform" || node.type === "filter"} onClose={onClose} onOk={() => onOk(draft)} okLabel={t("dialog.ok")}>
      <NodeInspector {...inspector} node={draft} onChange={(data) => setDraft((d) => ({ ...d, data }))} onMeta={(patch) => setDraft((d) => ({ ...d, ...patch }))} onDelete={onDelete} />
    </ModalShell>
  );
}

/** The generated KQL, editable; keeping an edit turns the diagram into one Advanced KQL step. */
export function AdvancedEditorDialog({ script, schema, onKeep, onClose }: { script: string; schema: KqlSchema; onKeep: (script: string) => void; onClose: () => void }) {
  const t = useTranslations("query-flow");
  const [text, setText] = useState(script);
  const syntax = checkScript(text);
  const edited = text.trim() !== script.trim();
  return (
    <ModalShell title={t("rb.advancedEditor")} wide onClose={onClose} onOk={edited ? () => onKeep(text) : undefined} okDisabled={!!syntax || !text.trim()} okLabel={t("advancedView.keep")}>
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">{t("advancedView.hint")}</p>
        <KqlInput multiline rows={14} value={text} onChange={setText} schema={schema} error={syntax ? { message: syntax.message, position: syntax.position ?? 0 } : null} ariaLabel={t("advancedView.label")} className="text-xs" />
        {syntax ? <p role="alert" className="text-xs text-destructive">{syntax.message}</p> : text.trim() ? <p className="text-[11px] text-emerald-700 dark:text-emerald-300">{t("advancedView.valid")}</p> : null}
        {edited ? <p className="rounded-md border border-amber-500/50 bg-amber-500/10 p-2 text-xs text-amber-900 dark:text-amber-200">{t("advancedView.editedWarning")}</p> : null}
      </div>
    </ModalShell>
  );
}

/** "Do you want to discard your changes?" (Cancel, Escape or leaving with unapplied work). */
export function ConfirmDiscardDialog({ onDiscard, onKeep }: { onDiscard: () => void; onKeep: () => void }) {
  const t = useTranslations("query-flow");
  return (
    <ModalShell title={t("discard.title")} onClose={onKeep} onOk={onDiscard} okLabel={t("discard.discard")} cancelLabel={t("discard.keep")}>
      <p className="text-xs text-muted-foreground">{t("discard.body")}</p>
    </ModalShell>
  );
}

/** Custom Column: name, an expression box with completion, the columns and the functions to double click, and the syntax status line. */
export function CustomColumnDialog({ columns, schema, userFunctions, params, initialName, initialExpr, onOk, onClose }: { columns: string[]; schema: KqlSchema; userFunctions: FlowFunction[]; params: FlowParam[]; initialName?: string; initialExpr?: string; onOk: (name: string, expr: string) => void; onClose: () => void }) {
  const t = useTranslations("query-flow");
  const [name, setName] = useState(initialName ?? "");
  const [expr, setExpr] = useState(initialExpr ?? "");
  const [search, setSearch] = useState("");
  const check = useMemo(() => validateExpression(expr), [expr]);
  const groups = useMemo(() => catalogGroups(search, userFunctions, params), [search, userFunctions, params]);
  const q = search.trim().toLowerCase();
  const insert = (text: string) => setExpr((e) => `${e}${e && !/[\s(,]$/.test(e) ? " " : ""}${text}`);
  const shownCols = columns.filter((c) => c.toLowerCase().includes(q));
  return (
    <ModalShell title={t("rb.customColumn")} wide onClose={onClose} onOk={() => onOk(name.trim(), expr.trim())} okDisabled={!name.trim() || !check.ok}>
      <div className="grid gap-3 md:grid-cols-[1fr_220px]">
        <div className="space-y-2">
          <div>
            <FieldLabel>{t("transform.newName")}</FieldLabel>
            <TextInput autoFocus value={name} aria-label={t("transform.newName")} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <FieldLabel>{t("custom.formula")}</FieldLabel>
            <KqlInput multiline rows={7} value={expr} onChange={setExpr} schema={schema} placeholder={t("transform.exprPlaceholder")} ariaLabel={t("custom.formula")} className="text-xs" />
          </div>
          <p role="status" className={`flex items-center gap-1.5 text-xs ${check.ok ? "text-emerald-700 dark:text-emerald-300" : check.message ? "text-destructive" : "text-muted-foreground"}`}>
            <span aria-hidden>{check.ok ? "✓" : check.message ? "✗" : "•"}</span>
            {check.ok ? t("custom.noErrors") : check.message || t("custom.empty")}
          </p>
        </div>
        <div className="space-y-2">
          <TextInput value={search} placeholder={t("custom.search")} aria-label={t("custom.search")} onChange={(e) => setSearch(e.target.value)} />
          <div>
            <FieldLabel>{t("custom.columns")}</FieldLabel>
            <ul className="max-h-28 overflow-y-auto rounded-md border border-border">
              {shownCols.map((c) => <li key={c}><button type="button" title={t("custom.insertHint")} onDoubleClick={() => insert(`[${c}]`)} onClick={() => undefined} className="block w-full truncate px-2 py-1 text-left text-xs text-foreground hover:bg-muted">{c}</button></li>)}
              {shownCols.length === 0 ? <li className="px-2 py-1 text-xs text-muted-foreground">{t("dialogs.noColumns")}</li> : null}
            </ul>
          </div>
          <div>
            <FieldLabel>{t("custom.functions")}</FieldLabel>
            <div className="max-h-64 overflow-y-auto rounded-md border border-border">
              {groups.map((g) => (
                <section key={g.category}>
                  <h4 className="sticky top-0 bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{t(`custom.categories.${g.category}`)}</h4>
                  <ul>
                    {g.items.map((item) => (
                      <li key={`${g.category}${item.name}`}>
                        <button
                          type="button"
                          title={[item.signature, item.description, item.example ? `${t("custom.example")}: ${item.example}` : "", t("custom.insertHint")].filter(Boolean).join("\n")}
                          onDoubleClick={() => insert(item.insert)}
                          className="block w-full px-2 py-1 text-left hover:bg-muted"
                        >
                          <span className="block truncate font-mono text-[11px] text-foreground">{item.signature}</span>
                          {item.description ? <span className="block truncate text-[10px] text-muted-foreground">{item.description}</span> : null}
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
              {groups.length === 0 ? <p className="px-2 py-2 text-xs text-muted-foreground">{t("cm.noResults")}</p> : null}
            </div>
          </div>
        </div>
      </div>
    </ModalShell>
  );
}

const PARAM_TYPES: ParamType[] = ["text", "number", "bool", "date"];

/** Manage Parameters: name, type, current value, description. Used as `$name`. */
export function ParametersDialog({ initial, supported, onOk, onClose }: { initial: FlowParam[]; supported: boolean; onOk: (params: FlowParam[]) => void; onClose: () => void }) {
  const t = useTranslations("query-flow");
  const [rows, setRows] = useState<FlowParam[]>(initial.length > 0 ? initial : []);
  const set = (id: string, patch: Partial<FlowParam>) => setRows((r) => r.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  return (
    <ModalShell title={t("params.manage")} wide onClose={onClose} okDisabled={rows.some((r) => r.name.trim() && !!checkDeclaration({ param: r }))} onOk={() => onOk(rows.filter((r) => r.name.trim()))}>
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">{t("params.hint")}</p>
        {!supported ? <p role="status" className="rounded-md border border-amber-500/50 bg-amber-500/10 p-2 text-xs text-amber-900 dark:text-amber-200">{t("params.needsEngine")}</p> : null}
        {rows.map((r) => (
          <div key={r.id} className="grid grid-cols-[1fr_96px_1fr_1fr_auto] items-center gap-1">
            <TextInput value={r.name} placeholder={t("params.name")} aria-label={t("params.name")} onChange={(e) => set(r.id, { name: e.target.value })} />
            <SelectInput ariaLabel={t("params.type")} value={r.type} onChange={(v) => set(r.id, { type: v as ParamType })} options={PARAM_TYPES.map((p) => ({ value: p, label: t(`params.types.${p}`) }))} />
            <TextInput value={r.value} placeholder={t("params.value")} aria-label={t("params.value")} onChange={(e) => set(r.id, { value: e.target.value })} />
            <TextInput value={r.description} placeholder={t("params.description")} aria-label={t("params.description")} onChange={(e) => set(r.id, { description: e.target.value })} />
            <SmallButton onClick={() => setRows((x) => x.filter((y) => y.id !== r.id))} aria-label={t("params.remove")}>✕</SmallButton>
            {r.name.trim() && checkDeclaration({ param: r }) ? <p role="alert" className="col-span-5 text-[11px] text-destructive">{checkDeclaration({ param: r })}</p> : null}
          </div>
        ))}
        <SmallButton onClick={() => setRows((r) => [...r, { id: uid("p"), name: "", type: "number", value: "", description: "" }])}>{t("params.add")}</SmallButton>
      </div>
    </ModalShell>
  );
}

/** Create Function: name, argument names and one expression body. */
export function FunctionsDialog({ initial, supported, schema, onOk, onClose }: { initial: FlowFunction[]; supported: boolean; schema: KqlSchema; onOk: (functions: FlowFunction[]) => void; onClose: () => void }) {
  const t = useTranslations("query-flow");
  const [rows, setRows] = useState<FlowFunction[]>(initial.length > 0 ? initial : [{ id: uid("f"), name: "", args: ["x"], body: "", description: "" }]);
  const set = (id: string, patch: Partial<FlowFunction>) => setRows((r) => r.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  return (
    <ModalShell title={t("functions.create")} wide onClose={onClose} okDisabled={rows.some((r) => r.name.trim() && !!checkDeclaration({ fn: r }))} onOk={() => onOk(rows.filter((r) => r.name.trim()))}>
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">{t("functions.hint")}</p>
        {!supported ? <p role="status" className="rounded-md border border-amber-500/50 bg-amber-500/10 p-2 text-xs text-amber-900 dark:text-amber-200">{t("params.needsEngine")}</p> : null}
        {rows.map((r) => {
          const problem = r.name.trim() ? checkDeclaration({ fn: r }) : null;
          return (
            <div key={r.id} className="space-y-1 rounded-md border border-border p-2">
              <div className="grid grid-cols-[1fr_1fr_auto] items-center gap-1">
                <TextInput value={r.name} placeholder={t("functions.name")} aria-label={t("functions.name")} onChange={(e) => set(r.id, { name: e.target.value })} />
                <TextInput value={r.args.join(", ")} placeholder={t("functions.args")} aria-label={t("functions.args")} onChange={(e) => set(r.id, { args: e.target.value.split(",").map((a) => a.trim()).filter(Boolean) })} />
                <SmallButton onClick={() => setRows((x) => x.filter((y) => y.id !== r.id))} aria-label={t("functions.remove")}>✕</SmallButton>
              </div>
              <KqlInput value={r.body} onChange={(body) => set(r.id, { body })} schema={schema} placeholder={t("functions.body")} ariaLabel={t("functions.body")} className="text-xs" />
              {problem ? <p role="alert" className="text-[11px] text-destructive">{problem}</p> : <p className="text-[11px] text-muted-foreground">{t("functions.argHint")}</p>}
              <TextInput value={r.description} placeholder={t("params.description")} aria-label={t("params.description")} onChange={(e) => set(r.id, { description: e.target.value })} />
            </div>
          );
        })}
        <div className="flex flex-wrap gap-1.5">
          <SmallButton onClick={() => setRows((r) => [...r, { id: uid("f"), name: "", args: ["x"], body: "", description: "" }])}>{t("functions.add")}</SmallButton>
          <SmallButton onClick={() => setRows((r) => [...r, { id: uid("f"), name: "limpiar", args: ["t", "minimo"], body: "from t where Monto >= minimo select *", description: t("functions.exampleTableDescription") }])}>{t("functions.addTable")}</SmallButton>
          <SmallButton onClick={() => setRows((r) => [...r, { id: uid("f"), name: "cruzar", args: ["a", "b"], body: "from a join b as b on Cliente = b.Nombre select *", description: t("functions.exampleCrossDescription") }])}>{t("functions.addCross")}</SmallButton>
        </div>
      </div>
    </ModalShell>
  );
}

/** Enter Data: a small editable grid that becomes an inline table (`from values (...)`). */
export function EnterDataDialog({ initial, onOk, onClose }: { initial?: InlineTable; onOk: (table: InlineTable) => void; onClose: () => void }) {
  const t = useTranslations("query-flow");
  const [columns, setColumns] = useState<string[]>(initial?.columns ?? ["Column1", "Column2"]);
  const [rows, setRows] = useState<string[][]>(initial?.rows ?? [["", ""], ["", ""], ["", ""]]);
  const [types, setTypes] = useState<InlineType[]>(initial?.types ?? ["auto", "auto"]);
  const setCell = (r: number, c: number, v: string) => setRows((all) => all.map((row, i) => (i === r ? row.map((cell, j) => (j === c ? v : cell)) : row)));
  const filled = rows.filter((r) => r.some((c) => c.trim() !== ""));
  const names = columns.map((c) => c.trim());
  const tooBig = names.length > INLINE_MAX_COLUMNS ? t("enterData.tooManyColumns", { max: INLINE_MAX_COLUMNS }) : rows.length > INLINE_MAX_ROWS ? t("enterData.tooManyRows", { max: INLINE_MAX_ROWS }) : null;
  const valid = names.length > 0 && names.every(Boolean) && new Set(names.map((n) => n.toLowerCase())).size === names.length && filled.length > 0 && !tooBig;
  return (
    <ModalShell title={t("rb.enterData")} wide onClose={onClose} okDisabled={!valid} onOk={() => onOk({ columns: names, rows: filled, types: names.map((_, i) => types[i] ?? "auto") })}>
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">{t("enterData.hint", { rows: INLINE_MAX_ROWS, columns: INLINE_MAX_COLUMNS })}</p>
        {tooBig ? <p role="alert" className="text-xs text-destructive">{tooBig}</p> : null}
        <div className="max-h-72 overflow-auto rounded-md border border-border">
          <table className="border-collapse text-xs">
            <thead className="sticky top-0 bg-muted">
              <tr>
                <th className="w-8 border border-border" />
                {columns.map((c, i) => (
                  <th key={i} className="border border-border p-0">
                    <input value={c} aria-label={t("enterData.columnName")} onChange={(e) => setColumns((all) => all.map((x, j) => (j === i ? e.target.value : x)))} className="h-7 w-32 bg-transparent px-1.5 font-semibold text-foreground" />
                    <select aria-label={t("enterData.columnType")} value={types[i] ?? "auto"} onChange={(e) => setTypes((all) => { const next = [...all]; while (next.length < columns.length) next.push("auto"); next[i] = e.target.value as InlineType; return next; })} className="block h-6 w-32 border-t border-border bg-background px-1 text-[11px] text-foreground">
                      {INLINE_TYPES.map((ty) => <option key={ty} value={ty}>{t(`enterData.types.${ty}`)}</option>)}
                    </select>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, r) => (
                <tr key={r}>
                  <td className="border border-border bg-muted px-1 text-center text-[10px] text-muted-foreground">{r + 1}</td>
                  {columns.map((_, c) => (
                    <td key={c} className="border border-border p-0"><input value={row[c] ?? ""} aria-label={t("enterData.cell")} onChange={(e) => setCell(r, c, e.target.value)} className="h-7 w-32 bg-card px-1.5 text-foreground" /></td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap gap-2">
          <SmallButton disabled={columns.length >= INLINE_MAX_COLUMNS} onClick={() => { setColumns((c) => [...c, `Column${c.length + 1}`]); setTypes((ty) => [...ty, "auto"]); }}>{t("enterData.addColumn")}</SmallButton>
          <SmallButton disabled={columns.length <= 1} onClick={() => { setColumns((c) => c.slice(0, -1)); setTypes((ty) => ty.slice(0, -1)); setRows((all) => all.map((r) => r.slice(0, -1))); }}>{t("enterData.removeColumn")}</SmallButton>
          <SmallButton disabled={rows.length >= INLINE_MAX_ROWS} onClick={() => setRows((r) => [...r, columns.map(() => "")])}>{t("enterData.addRow")}</SmallButton>
          <SmallButton disabled={rows.length <= 1} onClick={() => setRows((r) => r.slice(0, -1))}>{t("enterData.removeRow")}</SmallButton>
        </div>
      </div>
    </ModalShell>
  );
}

/** From cards: the optional board / list scope (compiled to filter conditions on the cards). */
export function FromCardsDialog({ onOk, onClose }: { onOk: (scope: { board: string; list: string }) => void; onClose: () => void }) {
  const t = useTranslations("query-flow");
  const [board, setBoard] = useState("");
  const [list, setList] = useState("");
  return (
    <ModalShell title={t("rb.srcCards")} onClose={onClose} onOk={() => onOk({ board: board.trim(), list: list.trim() })}>
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">{t("fromCards.hint")}</p>
        <div><FieldLabel>{t("fromCards.board")}</FieldLabel><TextInput autoFocus value={board} aria-label={t("fromCards.board")} onChange={(e) => setBoard(e.target.value)} /></div>
        <div><FieldLabel>{t("fromCards.list")}</FieldLabel><TextInput value={list} aria-label={t("fromCards.list")} onChange={(e) => setList(e.target.value)} /></div>
      </div>
    </ModalShell>
  );
}

/** From document table / From file: the table or file by name (with the gear for its Read options). */
export function SourcePickDialog({ title, initial, tables, files, queryTables, origins, queries, teamId, onOk, onClose }: { title: string; initial: SourceData; tables: KqlTable[]; files: QueryFile[]; queryTables?: QueryTable[]; origins?: TableOrigin[]; queries: FlowQuery[]; teamId: string | null; onOk: (source: SourceData) => void; onClose: () => void }) {
  const [source, setSource] = useState<SourceData>(initial);
  return (
    <ModalShell title={title} onClose={onClose} okDisabled={source.kind === "rows" && !source.name.trim()} onOk={() => onOk(source)}>
      <SourceFields value={source} onChange={setSource} tables={tables} files={files} queryTables={queryTables} origins={origins} queries={queries} teamId={teamId} />
    </ModalShell>
  );
}
