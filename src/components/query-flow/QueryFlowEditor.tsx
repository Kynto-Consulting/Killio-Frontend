"use client";

import "@xyflow/react/dist/style.css";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Background, BackgroundVariant, Controls, MiniMap, ReactFlow, type Connection, type Edge, type Node, type NodeChange, type ReactFlowInstance } from "@xyflow/react";
import { AlertTriangle, ChevronDown, ChevronLeft, ChevronRight, Copy, Loader2, Redo2, RefreshCw, Undo2, Wand2 } from "lucide-react";

import { useTranslations } from "@/components/providers/i18n-provider";
import { useSession } from "@/components/providers/session-provider";
import { KqlInput } from "@/components/ui/kql-input";
import { listQueryFiles, listQueryTables, type QueryFile, type QueryTable } from "@/lib/api/query-files";
import { SourcesCatalog } from "./sources-catalog";
import { useKqlScopeTeamId } from "@/lib/kql-pill/scope";
import { describeKqlDeclarations, type KqlTable } from "@/lib/query/kql";
import { buildKqlSchema } from "@/lib/query/kql-complete";
import { compileFlow } from "@/lib/query-flow/compile";
import { advancedGraph, DEFAULT_QUERY_ID, dataOf, emptyGraph, makeNode, newCondition, newTransformColumn, normalizeGraph, uid } from "@/lib/query-flow/defaults";
import { diagnoseFlow, engineSupportsDeclarations } from "@/lib/query-flow/diagnose";
import { clearDraft, DRAFT_DEBOUNCE_MS, readDraft, restorableDraft, saveDraft, type StoredDraft } from "@/lib/query-flow/draft";
import { escapeContext, escapeDecision } from "@/lib/query-flow/escape";
import { CARD_FIELDS } from "@/lib/query-flow/labels";
import { autoLayout } from "@/lib/query-flow/layout";
import { clockText, loadUiState, saveUiState, type UiState } from "@/lib/query-flow/layout-state";
import { buildOp, detectTypeStep, opById, type StepSpec } from "@/lib/query-flow/ops";
import { profileColumn, profileTable, type ColumnType } from "@/lib/query-flow/profile";
import { parseCommand, type Needs, type TabId } from "@/lib/query-flow/ribbon-config";
import {
  addQuery, appendGraph, chainAround, chainTo, deleteUntilEnd, duplicateQuery, extractPrevious, inputOf, insertAfter, insertionPoint, moveStep, queriesOf, queryIdOf, referenceQuery,
  removeQuery, removeStep, renameQuery, renameStep, summarize, terminalOfQuery, updateNode,
} from "@/lib/query-flow/steps";
import { FLOW_TEMPLATES } from "@/lib/query-flow/templates";
import type { FlowFunction, FlowGraph, FlowNode, FlowParam, InlineTable, NodeType, OutputData, SourceData, SourceKind } from "@/lib/query-flow/types";
import { cn } from "@/lib/utils";
import { AppliedSteps } from "./applied-steps";
import { ColumnMenu } from "./column-menu";
import { ColumnProfilePanel, DataGrid, SchemaView } from "./data-views";
import {
  AdvancedEditorDialog, AppendDialog, ChooseColumnsDialog, ConfirmDiscardDialog, CustomColumnDialog, EnterDataDialog, FromCardsDialog, FunctionsDialog, GroupByDialog, MergeDialog, ParametersDialog,
  ParamDialog, SourcePickDialog, StepDialog, type MergeResult,
} from "./dialogs";
import { FloatingMenu, IconButton, SmallButton, type MenuItem } from "./fields";
import { QueriesPane } from "./queries-pane";
import { ResultChart } from "./result-chart";
import { Ribbon } from "./ribbon";
import { Splitter } from "./splitter";
import { nodeTypes, type StepNodeView } from "./step-node";
import { useFlowPreview } from "./use-flow-preview";

export interface QueryFlowValue {
  script: string;
  flow: FlowGraph;
  /** Steps with a problem (the script cannot be applied while there are some). */
  errors: number;
}

export interface QueryFlowEditorProps {
  /** Who opened the editor (a brick id...): the key of the autosaved draft. */
  ownerId: string;
  /** Script to start from when there is no saved flow (it opens as one Advanced KQL step). */
  initialScript?: string;
  /** A saved `source.flow`: anything malformed is ignored. */
  initialFlow?: unknown;
  /** The graph of an editor that was mounted before (kept by the session store): wins over `initialFlow`. */
  draftGraph?: FlowGraph | null;
  tables: KqlTable[];
  /** False when whoever opened the editor is not on the page any more (Apply keeps the result here and offers to copy it). */
  ownerPresent?: boolean;
  /** Every change of the graph, with whether there is anything not applied yet. */
  onDraft?: (graph: FlowGraph, dirty: boolean) => void;
  onChange?: (value: QueryFlowValue) => void;
  /** Close & Apply / Apply of the title row. `keepOpen` is true for the plain "Apply". */
  onApply?: (value: { script: string; flow: FlowGraph }, options?: { keepOpen?: boolean }) => "applied" | "owner-gone" | void;
  /** Close without applying (the editor asks first when there are unapplied changes). */
  onClose?: () => void;
  className?: string;
}

interface History { past: FlowGraph[]; present: FlowGraph; future: FlowGraph[] }
type Dialog =
  | { kind: "param"; opId: string; params: Record<string, string>; selected?: string[] }
  | { kind: "choose" }
  | { kind: "group" }
  | { kind: "merge" }
  | { kind: "append" }
  | { kind: "custom" }
  | { kind: "fromCards" }
  | { kind: "pick"; source: "table" | "file" | "shared" }
  | { kind: "enter" }
  | { kind: "params" }
  | { kind: "functions" }
  | { kind: "discard" }
  | { kind: "step"; nodeId: string }
  | { kind: "advanced" };

const MAX_HISTORY = 100;
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

function initialGraph(script: string | undefined, flow: unknown): FlowGraph {
  const saved = normalizeGraph(flow);
  if (saved) return saved.queries?.length ? saved : { ...saved, queries: [{ id: DEFAULT_QUERY_ID, name: "Query1" }] };
  if (script && script.trim()) return advancedGraph(script.trim());
  return emptyGraph();
}

function storage(kind: "local" | "session"): Storage | null {
  try {
    return typeof window === "undefined" ? null : kind === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

/** Formula bar: the KQL of the selected step ("fx"), read-only; editable when the step is an Advanced KQL step. */
function FormulaBar({ script, advanced, schema, onAdvanced }: { script: string; advanced: FlowNode | null; schema: ReturnType<typeof buildKqlSchema>; onAdvanced: (script: string) => void }) {
  const t = useTranslations("query-flow");
  const [draft, setDraft] = useState<string | null>(null);
  const text = advanced ? draft ?? dataOf<{ script: string }>(advanced).script : script;
  return (
    <div className="flex items-start gap-2 border-b border-border bg-card px-2 py-1">
      <span className="mt-1 select-none rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] font-semibold text-muted-foreground" title={t("formula.hint")}>fx</span>
      {advanced ? (
        <div className="min-w-0 flex-1" onBlur={() => { if (draft !== null) { onAdvanced(draft); setDraft(null); } }}>
          <KqlInput multiline rows={2} value={text} onChange={setDraft} schema={schema} ariaLabel={t("formula.label")} className="text-xs" />
        </div>
      ) : (
        <pre aria-label={t("formula.label")} title={text} className="m-0 max-h-16 min-w-0 flex-1 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-background px-2 py-1 font-mono text-xs text-foreground">{text || t("formula.empty")}</pre>
      )}
    </div>
  );
}

/** Below this width the queries and settings panes start folded. */
const NARROW_EDITOR_PX = 900;

export function QueryFlowEditor({ ownerId, initialScript, initialFlow, draftGraph, tables, ownerPresent = true, onDraft, onChange, onApply, onClose, className }: QueryFlowEditorProps) {
  const t = useTranslations("query-flow");
  const { accessToken, activeTeamId: sessionTeamId } = useSession();
  const teamId = useKqlScopeTeamId() ?? sessionTeamId ?? null;

  // the graph the editor starts from, and what "unapplied changes" is measured against
  const startGraph = useRef<FlowGraph | null>(null);
  if (startGraph.current === null) startGraph.current = initialGraph(initialScript, initialFlow);
  const baselineRef = useRef<string>(JSON.stringify(startGraph.current));
  const [baselineTick, setBaselineTick] = useState(0);
  const [history, setHistory] = useState<History>(() => ({ past: [], present: draftGraph ?? startGraph.current!, future: [] }));
  const graph = history.present;
  const [ui, setUi] = useState<UiState>(() => loadUiState(storage("local")));
  const [tab, setTab] = useState<TabId>("home");
  const [view, setView] = useState<"data" | "schema">("data");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeQueryId, setActiveQueryId] = useState<string>(() => queriesOf(history.present)[0].id);
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
  const [anchorColumn, setAnchorColumn] = useState<string | null>(null);
  const [selectedCell, setSelectedCell] = useState<{ row: number; column: string } | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const [colMenu, setColMenu] = useState<{ x: number; y: number; column: string } | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [renamingStep, setRenamingStep] = useState<string | null>(null);
  const [renamingQuery, setRenamingQuery] = useState<string | null>(null);
  const [renamingColumn, setRenamingColumn] = useState<string | null>(null);
  const [applyMenuOpen, setApplyMenuOpen] = useState<{ x: number; y: number } | null>(null);
  const [nonce, setNonce] = useState(0);
  const [previewAt, setPreviewAt] = useState<Date | null>(null);
  const [previewTab, setPreviewTab] = useState<"table" | "chart">("table");
  const [notice, setNotice] = useState<string | null>(null);
  const [files, setFiles] = useState<QueryFile[]>([]);
  const [queryTables, setQueryTables] = useState<QueryTable[]>([]);
  const [restore, setRestore] = useState<StoredDraft | null>(null);
  const rfRef = useRef<ReactFlowInstance | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const centerRef = useRef<HTMLDivElement>(null);

  // a short window (a side pane, a phone) opens with both side panes folded, so the data keeps the width; opening one is the user's call
  const [autoFold, setAutoFold] = useState({ left: false, right: false });
  useEffect(() => {
    const w = rootRef.current?.clientWidth ?? 0;
    if (w > 0 && w < NARROW_EDITOR_PX) setAutoFold({ left: true, right: true });
  }, []);
  const patchUi = useCallback((patch: Partial<UiState>) => {
    setUi((u) => ({ ...u, ...patch }));
    if ("leftCollapsed" in patch || "rightCollapsed" in patch) setAutoFold((f) => ({ left: "leftCollapsed" in patch ? false : f.left, right: "rightCollapsed" in patch ? false : f.right }));
  }, []);
  const leftCollapsed = ui.leftCollapsed || autoFold.left;
  const rightCollapsed = ui.rightCollapsed || autoFold.right;
  const setSize = useCallback((key: keyof UiState["sizes"], value: number) => setUi((u) => ({ ...u, sizes: { ...u.sizes, [key]: value } })), []);
  useEffect(() => { saveUiState(storage("local"), ui); }, [ui]);
  // focus the editor so Escape / Ctrl+Z / Ctrl+Enter work right away
  useEffect(() => { rootRef.current?.focus(); }, []);

  // ── history ────────────────────────────────────────────────────────────────
  const commit = useCallback((next: FlowGraph) => { setHistory((h) => ({ past: [...h.past, h.present].slice(-MAX_HISTORY), present: next, future: [] })); }, []);
  const replace = useCallback((fn: (g: FlowGraph) => FlowGraph) => setHistory((h) => ({ ...h, present: fn(h.present) })), []);
  const pushHistory = useCallback(() => setHistory((h) => ({ past: [...h.past, h.present].slice(-MAX_HISTORY), present: h.present, future: [] })), []);
  const undo = useCallback(() => setHistory((h) => (h.past.length ? { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] } : h)), []);
  const redo = useCallback(() => setHistory((h) => (h.future.length ? { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) } : h)), []);

  // ── unapplied changes: dirty flag, draft autosave, restore offer ───────────
  const graphJson = useMemo(() => JSON.stringify(graph), [graph]);
  const dirty = graphJson !== baselineRef.current;
  void baselineTick;
  useEffect(() => { onDraft?.(graph, dirty); }, [graph, dirty, onDraft]);
  useEffect(() => {
    // a fresh open (nothing kept by the session store): offer the autosaved draft of this owner when it is newer than the saved flow
    if (draftGraph) return;
    const found = restorableDraft(readDraft(storage("session"), ownerId), initialFlow, baselineRef.current);
    if (found) setRestore(found);
    // only once, when the editor opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (restore) return; // do not overwrite or clear the draft while the user decides
    if (!dirty) { clearDraft(storage("session"), ownerId); return; }
    const timer = window.setTimeout(() => saveDraft(storage("session"), ownerId, graph), DRAFT_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [graph, dirty, restore, ownerId]);

  useEffect(() => {
    if (!notice) return;
    const id = window.setTimeout(() => setNotice(null), 4500);
    return () => window.clearTimeout(id);
  }, [notice]);

  useEffect(() => {
    if (!teamId || !accessToken) { setFiles([]); return; }
    let cancelled = false;
    listQueryFiles(teamId, accessToken).then((list) => { if (!cancelled) setFiles(list); }).catch(() => { if (!cancelled) setFiles([]); });
    listQueryTables(teamId, accessToken).then((list) => { if (!cancelled) setQueryTables(list); }).catch(() => { if (!cancelled) setQueryTables([]); });
    return () => { cancelled = true; };
  }, [teamId, accessToken, nonce]);

  const declarations = useMemo(() => engineSupportsDeclarations(), []);
  const columnsOf = useCallback((s: SourceData): string[] | null => {
    if (s.kind !== "rows") return null;
    const wanted = norm(s.name);
    const table = tables.find((tb) => tb.id === s.name || norm(tb.title) === wanted);
    return table && table.columns.length > 0 ? table.columns : null;
  }, [tables]);
  const scriptSchema = useMemo(() => buildKqlSchema({ mode: "script", tables }), [tables]);
  const filterSchema = useMemo(() => buildKqlSchema({ mode: "filter", tables }), [tables]);

  // ── derived state ─────────────────────────────────────────────────────────
  const queries = queriesOf(graph);
  const params: FlowParam[] = graph.params ?? [];
  const functions: FlowFunction[] = graph.functions ?? [];
  // an Advanced KQL step may declare parameters / functions itself: they are listed too (read back with the engine's own parser)
  const readBack = useMemo(() => {
    const found = { params: [] as FlowParam[], functions: [] as FlowFunction[] };
    for (const n of graph.nodes) {
      if (n.type !== "advanced") continue;
      try {
        const d = describeKqlDeclarations(dataOf<{ script: string }>(n).script);
        for (const p of d.params) if (!params.some((x) => x.name === p.name) && !found.params.some((x) => x.name === p.name)) found.params.push({ id: `read:${p.name}`, name: p.name, type: "text", value: p.value, description: "" });
        for (const f of d.functions) if (!functions.some((x) => x.name === f.name) && !found.functions.some((x) => x.name === f.name)) found.functions.push({ id: `read:${f.name}`, name: f.name, args: f.args, body: f.body, description: "" });
      } catch { /* a script that does not parse declares nothing */ }
    }
    return found;
  }, [graph.nodes, params, functions]);
  const activeId = queries.some((q) => q.id === activeQueryId) ? activeQueryId : queries[0].id;
  const activeQuery = queries.find((q) => q.id === activeId) ?? queries[0];
  const activeNodes = useMemo(() => graph.nodes.filter((n) => queryIdOf(graph, n) === activeId), [graph, activeId]);
  const selected = selectedId ? graph.nodes.find((n) => n.id === selectedId) ?? null : null;
  const diagnosis = useMemo(() => diagnoseFlow(graph, { columnsOf, declarations }), [graph, columnsOf, declarations]);
  const script = diagnosis.result.script;
  const errorCount = Object.keys(diagnosis.issues).length;
  const canApply = errorCount === 0 && !diagnosis.engineError && script.trim().length > 0;

  const steps = useMemo(() => {
    const focus = selected && queryIdOf(graph, selected) === activeId ? selected : terminalOfQuery(graph, activeId);
    return focus ? chainAround(graph, focus.id) : [];
  }, [graph, selected, activeId]);
  const stepsSelectedId = selected && steps.some((s) => s.id === selected.id) ? selected.id : steps[steps.length - 1]?.id ?? null;
  const previewNodeId = stepsSelectedId;
  const previewCompile = useMemo(() => (previewNodeId ? compileFlow(graph, { upTo: previewNodeId, columnsOf, declarations }) : null), [graph, previewNodeId, columnsOf, declarations]);
  const previewScript = previewCompile && previewCompile.errors.length === 0 ? previewCompile.script : "";
  const previewIssue = previewCompile?.errors[0] ?? (previewNodeId && diagnosis.issues[previewNodeId]?.kind === "engine" ? { nodeId: previewNodeId, message: diagnosis.issues[previewNodeId].message } : null);
  const run = useFlowPreview(previewScript, !previewIssue, tables, teamId, accessToken, nonce);
  const result = run.status === "ok" && run.forScript === previewScript ? run.outputs[0]?.result ?? null : null;
  const resultColumns = useMemo(() => result?.columns.map((c) => c.label) ?? [], [result]);
  const resultRows = useMemo(() => result?.rows.map((r) => r.cells) ?? [], [result]);
  const profile = useMemo(() => (result ? profileTable(resultColumns, resultRows, { sample: ui.wholeProfile ? Infinity : 1000 }) : null), [result, resultColumns, resultRows, ui.wholeProfile]);
  const selectedColumn = selectedColumns[0] ?? null;
  const profiledColumn = profile?.columns.find((c) => c.name === selectedColumn) ?? null;
  const outputNode = steps.find((n) => n.type === "output");
  const outputKind = (outputNode ? dataOf<OutputData>(outputNode).kind : "table") as OutputData["kind"];
  const previewColumnsNow = resultColumns.length > 0 ? resultColumns : previewCompile?.columns ?? [];
  const advancedNode = selected && selected.type === "advanced" ? selected : null;
  const sorted = steps.some((s) => s.type === "sort" && !s.disabled);

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  useEffect(() => { onChangeRef.current?.({ script, flow: graph, errors: errorCount + (diagnosis.engineError ? 1 : 0) }); }, [script, graph, errorCount, diagnosis.engineError]);
  useEffect(() => { if (result) setPreviewAt(new Date()); }, [result]);
  useEffect(() => { if (selectedId && !graph.nodes.some((n) => n.id === selectedId)) setSelectedId(null); }, [graph, selectedId]);
  useEffect(() => {
    if (result) setSelectedColumns((cols) => { const kept = cols.filter((c) => resultColumns.includes(c)); return kept.length === cols.length ? cols : kept; });
  }, [result, resultColumns]);

  const titleOf = useCallback((n: FlowNode) => n.label || t(`nodes.${n.type}.title`), [t]);
  const summaryOf = useCallback((n: FlowNode) => {
    if (n.type === "source" && dataOf<SourceData>(n).kind === "query") return queries.find((q) => q.id === dataOf<SourceData>(n).name)?.name ?? "";
    return summarize(n);
  }, [queries]);

  /** Columns / fields known at the input of a step (suggestions of its settings). */
  const suggestionsFor = useCallback((nodeId: string): string[] => {
    const upstream = inputOf(graph, nodeId);
    const target = upstream?.id ?? nodeId;
    const r = compileFlow(graph, { upTo: target, columnsOf, declarations });
    if (r.columns) return r.columns;
    const root = chainTo(graph, target)[0];
    if (root?.type === "source") {
      const d = dataOf<SourceData>(root);
      if (d.kind === "cards") return CARD_FIELDS;
      return columnsOf(d) ?? [];
    }
    return [];
  }, [graph, columnsOf, declarations]);

  // ── canvas (the optional diagram) ─────────────────────────────────────────
  const rfNodes = useMemo<Node[]>(() => (ui.diagramOpen ? activeNodes : []).map((n) => {
    const nodeView: StepNodeView = { type: n.type, title: titleOf(n), summary: summaryOf(n), note: n.note, disabled: !!n.disabled, issue: diagnosis.issues[n.id] ?? null, engineLabel: t("steps.needsEngine"), errorLabel: t("steps.problem") };
    return { id: n.id, type: "step", position: n.position, selected: n.id === selectedId, data: nodeView };
  }), [ui.diagramOpen, activeNodes, diagnosis.issues, selectedId, titleOf, summaryOf, t]);
  const rfEdges = useMemo<Edge[]>(() => {
    const ids = new Set(activeNodes.map((n) => n.id));
    return graph.edges.filter((e) => ids.has(e.source) && ids.has(e.target)).map((e) => ({ id: e.id, source: e.source, target: e.target, sourceHandle: "out", targetHandle: e.targetHandle ?? "in" }));
  }, [graph.edges, activeNodes]);
  const onNodesChange = useCallback((changes: NodeChange[]) => {
    const moves = changes.filter((c): c is Extract<NodeChange, { type: "position" }> => c.type === "position" && !!c.position);
    if (moves.length > 0) replace((g) => ({ ...g, nodes: g.nodes.map((n) => { const m = moves.find((c) => c.id === n.id); return m?.position ? { ...n, position: m.position } : n; }) }));
    for (const c of changes) if (c.type === "select" && c.selected) setSelectedId(c.id);
  }, [replace]);
  const onConnect = useCallback((conn: Connection) => {
    if (!conn.source || !conn.target || conn.source === conn.target) return;
    const handle = conn.targetHandle === "right" || conn.targetHandle === "in2" ? conn.targetHandle : "in";
    const target = graph.nodes.find((n) => n.id === conn.target);
    if (!target || target.type === "source" || graph.nodes.find((n) => n.id === conn.source)?.type === "output") return;
    const kept = graph.edges.filter((e) => !(e.target === conn.target && (handle === "in" ? e.targetHandle !== "right" && e.targetHandle !== "in2" : e.targetHandle === handle)));
    commit({ ...graph, edges: [...kept, { id: uid("e"), source: conn.source, target: conn.target, targetHandle: handle }] });
  }, [graph, commit]);

  // ── editing ───────────────────────────────────────────────────────────────
  const place = useCallback((node: FlowNode, afterId: string | null): FlowGraph => {
    const withQuery = { ...node, query: activeId };
    if (afterId) return insertAfter(graph, afterId, withQuery);
    const maxY = Math.max(-170, ...activeNodes.map((n) => n.position.y));
    return { ...graph, nodes: [...graph.nodes, { ...withQuery, position: { x: 0, y: maxY + 170 } }] };
  }, [graph, activeId, activeNodes]);

  /** A new named query made of these steps (the first one is its source); with no steps, a blank query. */
  const startQuery = useCallback((stepsToAdd: Array<{ type: NodeType; data: Record<string, unknown>; label?: string }>, name?: string) => {
    const added = addQuery(graph, name);
    let g = added.graph;
    let previous: FlowNode | null = null;
    for (const s of stepsToAdd) {
      const node = makeNode(s.type, { x: 0, y: Math.max(0, ...g.nodes.map((n) => n.position.y)) + 170 }, s.data, { query: added.id, ...(s.label ? { label: s.label } : {}) });
      g = previous ? insertAfter(g, previous.id, node) : { ...g, nodes: [...g.nodes, node] };
      previous = g.nodes.find((n) => n.id === node.id) ?? node;
    }
    commit(g);
    setActiveQueryId(added.id);
    setSelectedId(previous ? previous.id : null);
    setSelectedColumns([]);
  }, [graph, commit]);

  /** Adds a step after the selected one; with `edit` its settings open right away. */
  const addStep = useCallback((spec: StepSpec, edit = false): FlowNode | null => {
    const point = insertionPoint(graph, stepsSelectedId, activeId);
    if (!point) { setNotice(t("ribbon.needsSource")); return null; }
    const node = makeNode(spec.type, { x: 0, y: 0 }, spec.data, { label: `${t(spec.labelKey)}${spec.labelArg ? `: ${spec.labelArg}` : ""}` });
    commit(place(node, point.id));
    setSelectedId(node.id);
    if (edit) setDialog({ kind: "step", nodeId: node.id });
    return node;
  }, [graph, stepsSelectedId, activeId, place, commit, t]);

  const parserFor = useCallback((column: string | undefined): "number" | "date" | null => {
    const type: ColumnType | undefined = profile?.columns.find((c) => c.name === column)?.type;
    return type === "number" || type === "date" ? type : null;
  }, [profile]);

  const applyOp = useCallback((opId: string, params: Record<string, string> = {}, extra: { selected?: string[]; values?: string[]; edit?: boolean } = {}) => {
    const def = opById(opId);
    const sel = extra.selected && extra.selected.length > 0 ? extra.selected : selectedColumns;
    if (def?.needsColumn && sel.length === 0) { setNotice(t("ribbon.needsColumn")); return; }
    const defaults: Record<string, string> = {};
    for (const p of def?.params ?? []) if (p.default !== undefined) defaults[p.key] = p.default;
    const merged = { ...defaults, ...params };
    if ((opId === "removeErrors" || opId === "replaceErrors") && !params.parser) {
      const parser = parserFor(sel[0]);
      if (!parser) { setNotice(t("ribbon.errorsNeedType")); return; }
      merged.parser = parser;
      if (opId === "replaceErrors" && !("fallback" in params)) merged.fallback = parser === "number" ? "0" : "";
    }
    const spec = buildOp(opId, { column: sel[0], selected: sel, columns: previewColumnsNow, params: merged, values: extra.values, lenient: true });
    if (!spec) {
      setNotice(opId === "changeType" ? t("typeMenu.unsupported") : previewColumnsNow.length === 0 ? t("ribbon.noColumnsYet") : t("ribbon.cannotApply"));
      return;
    }
    addStep(spec, extra.edit);
  }, [selectedColumns, previewColumnsNow, parserFor, addStep, t]);

  const deleteNode = useCallback((id: string) => {
    const chain = chainTo(graph, id);
    const before = chain[chain.length - 2];
    commit(removeStep(graph, id));
    setSelectedId(before ? before.id : null);
    setDialog(null);
  }, [graph, commit]);

  const doClose = useCallback(() => { setDialog(null); onClose?.(); }, [onClose]);
  /** Cancel / Escape / the title row's close: asks first when there is work that was not applied. */
  const requestClose = useCallback(() => { if (dirty) setDialog({ kind: "discard" }); else doClose(); }, [dirty, doClose]);

  const doApply = useCallback((keepOpen: boolean) => {
    if (!canApply) { setNotice(errorCount > 0 ? t("dialog.fixProblems", { count: errorCount }) : t("dialog.nothingToApply")); return; }
    const outcome = onApply?.({ script, flow: { ...graph, savedAt: Date.now() } }, { keepOpen });
    if (outcome === "owner-gone") { setNotice(t("owner.gone")); return; }
    clearDraft(storage("session"), ownerId);
    baselineRef.current = graphJson;
    setBaselineTick((n) => n + 1);
  }, [canApply, errorCount, onApply, script, graph, graphJson, ownerId, t]);

  const doLayout = () => {
    commit(autoLayout(graph));
    window.setTimeout(() => rfRef.current?.fitView({ padding: 0.2 }), 50);
  };

  const loadTemplate = (id: string) => {
    const tpl = FLOW_TEMPLATES.find((x) => x.id === id);
    if (!tpl) return;
    const name = t(`templates.${id}`);
    const merged = appendGraph(graph, tpl.build(name), name);
    commit(merged.graph);
    setActiveQueryId(merged.queryId);
    setSelectedId(null);
  };

  const copyScript = () => { try { void navigator.clipboard.writeText(script); setNotice(t("owner.copied")); } catch { setNotice(t("owner.copyFailed")); } };

  // ── commands (ribbon, column menu) ────────────────────────────────────────
  const runCommand = useCallback((command: string, forced?: string[]) => {
    const { kind, id, params } = parseCommand(command);
    const sel = forced ?? selectedColumns;
    switch (kind) {
      case "op": applyOp(id, params, { selected: sel }); break;
      case "dlg": {
        const def = opById(id);
        if (!def) return;
        if (def.needsColumn && sel.length === 0) { setNotice(t("ribbon.needsColumn")); return; }
        if (!steps.length) { setNotice(t("ribbon.needsSource")); return; }
        setDialog({ kind: "param", opId: id, params, selected: sel });
        break;
      }
      case "new":
        if (!steps.length) { setNotice(t("ribbon.needsSource")); return; }
        if (id === "customColumn") setDialog({ kind: "custom" });
        else if (id === "conditional") addStep({ type: "transform", data: { columns: [{ ...newTransformColumn("conditional"), clauses: [{ id: uid("cl"), condition: newCondition(), then: "", thenType: "auto" }] }] }, labelKey: "rb.conditionalColumn", labelArg: "" }, true);
        else applyOp(id, params, { edit: true, selected: sel });
        break;
      case "x":
        if (id === "properties") { patchUi({ rightCollapsed: false }); window.setTimeout(() => document.getElementById("qf-query-name")?.focus(), 50); return; }
        if (id === "params") { setDialog({ kind: "params" }); return; }
        if (id === "function") { setDialog({ kind: "functions" }); return; }
        if (id === "fromCards") { setDialog({ kind: "fromCards" }); return; }
        if (id === "fromTable") { setDialog({ kind: "pick", source: "table" }); return; }
        if (id === "fromFile") { setDialog({ kind: "pick", source: "file" }); return; }
        if (id === "fromShared") { setDialog({ kind: "pick", source: "shared" }); return; }
        if (id === "enterData") { setDialog({ kind: "enter" }); return; }
        if (!steps.length) { setNotice(t("ribbon.needsSource")); return; }
        if (id === "sort") { addStep({ type: "sort", data: { keys: (sel.length ? sel : [""]).map((c) => ({ id: uid("k"), field: c, dir: "asc" })) }, labelKey: "rb.sortLevels", labelArg: "" }, true); return; }
        setDialog({ kind: id === "chooseColumns" ? "choose" : id === "groupBy" ? "group" : id === "merge" ? "merge" : "append" });
        break;
      case "src":
        if (id === "blank") startQuery([]);
        else startQuery([{ type: "source", data: { kind: id as SourceKind, name: "" } }]);
        break;
      case "col":
        if (id === "rename") { if (sel[0]) setRenamingColumn(sel[0]); else setNotice(t("ribbon.needsColumn")); }
        else if (id === "copyName") { try { void navigator.clipboard.writeText(sel.join(", ")); setNotice(t("cm.copied")); } catch { setNotice(t("owner.copyFailed")); } }
        else if (id === "clearSort") {
          let g = graph;
          for (const s of steps.filter((x) => x.type === "sort")) g = removeStep(g, s.id);
          if (g !== graph) commit(g);
        } else if (id === "detectType") {
          const spec = detectTypeStep(resultColumns, resultRows, sel);
          if (!spec) setNotice(t("typeMenu.nothingToDetect")); else addStep(spec);
        }
        break;
      case "home":
        if (id === "apply") doApply(true);
        else if (id === "close") requestClose();
        else if (id === "refresh") setNonce((n) => n + 1);
        break;
      case "view":
        if (id === "querySettings") patchUi({ rightCollapsed: !rightCollapsed });
        else if (id === "queriesPane") patchUi({ leftCollapsed: !leftCollapsed });
        else if (id === "formulaBar") patchUi({ formulaBar: !ui.formulaBar });
        else if (id === "monospaced") patchUi({ monospaced: !ui.monospaced });
        else if (id === "showWhitespace") patchUi({ showWhitespace: !ui.showWhitespace });
        else if (id === "quality") patchUi({ showQuality: !ui.showQuality });
        else if (id === "distribution") patchUi({ showDistribution: !ui.showDistribution });
        else if (id === "profile") patchUi({ showProfile: !ui.showProfile });
        else if (id === "profileTop") patchUi({ wholeProfile: false });
        else if (id === "profileAll") patchUi({ wholeProfile: true });
        else if (id === "diagram") patchUi({ diagramOpen: !ui.diagramOpen });
        else if (id === "schema") setView((v) => (v === "schema" ? "data" : "schema"));
        else if (id === "advanced") setDialog({ kind: "advanced" });
        break;
      default: break;
    }
  }, [applyOp, addStep, selectedColumns, steps, startQuery, graph, commit, resultColumns, resultRows, doApply, requestClose, patchUi, ui, t]);

  /** A ribbon button that needs a column with none selected asks which one in a small popover. */
  const ribbonCommand = (command: string, needs?: Needs) => {
    if (needs === "column" && selectedColumns.length === 0) {
      if (previewColumnsNow.length === 0) { setNotice(t("ribbon.noColumnsYet")); return; }
      const box = rootRef.current?.getBoundingClientRect();
      setMenu({
        x: (box?.left ?? 0) + 140, y: (box?.top ?? 0) + 150,
        items: [{ key: "h", label: t("ribbon.pickColumn"), heading: true }, ...previewColumnsNow.map((c): MenuItem => ({ key: c, label: c, onSelect: () => { setSelectedColumns([c]); setAnchorColumn(c); runCommand(command, [c]); } }))],
      });
      return;
    }
    runCommand(command);
  };

  const toggles: Record<string, boolean> = {
    querySettings: !rightCollapsed, queriesPane: !leftCollapsed, formulaBar: ui.formulaBar, monospaced: ui.monospaced, showWhitespace: ui.showWhitespace,
    quality: ui.showQuality, distribution: ui.showDistribution, profile: ui.showProfile, profileTop: !ui.wholeProfile, profileAll: ui.wholeProfile, diagram: ui.diagramOpen, schema: view === "schema",
  };

  // ── selection and menus ───────────────────────────────────────────────────
  const selectColumn = useCallback((name: string, mode: "single" | "toggle" | "range") => {
    if (mode === "toggle") {
      setSelectedColumns((cols) => (cols.includes(name) ? cols.filter((c) => c !== name) : [...cols, name]));
      setAnchorColumn(name);
    } else if (mode === "range" && anchorColumn) {
      const a = resultColumns.indexOf(anchorColumn);
      const b = resultColumns.indexOf(name);
      if (a >= 0 && b >= 0) setSelectedColumns(resultColumns.slice(Math.min(a, b), Math.max(a, b) + 1));
      else setSelectedColumns([name]);
    } else {
      setSelectedColumns([name]);
      setAnchorColumn(name);
    }
  }, [anchorColumn, resultColumns]);

  const typeOfColumn = (name: string): ColumnType => profile?.columns.find((c) => c.name === name)?.type ?? "text";

  const openColumnMenu = (name: string, x: number, y: number) => {
    // the menu acts on the clicked column, or on the whole selection when the column is part of it
    if (!selectedColumns.includes(name)) { setSelectedColumns([name]); setAnchorColumn(name); }
    setColMenu({ x, y, column: name });
  };

  const openTypeMenu = (name: string, x: number, y: number) => {
    if (!selectedColumns.includes(name)) { setSelectedColumns([name]); setAnchorColumn(name); }
    const ids = ["any", "text", "whole", "decimal", "date", "datetime", "bool", "list"] as const;
    setMenu({
      x, y,
      items: ids.map((id): MenuItem => ({
        key: id, label: t(`typeMenu.${id}`), disabled: id === "list" || id === "any", hint: id === "list" ? t("ribbon.needsEngineHint") : undefined,
        onSelect: () => applyOp("changeType", { type: id }, { selected: selectedColumns.includes(name) ? selectedColumns : [name] }),
      })),
    });
  };

  const openCellMenu = (row: number, column: string, x: number, y: number) => {
    const value = resultRows[row]?.[resultColumns.indexOf(column)] ?? "";
    setMenu({
      x, y,
      items: [
        { key: "eq", label: t("cellMenu.equals", { value: value.length > 24 ? `${value.slice(0, 23)}…` : value }), onSelect: () => applyOp("filterValues", {}, { selected: [column], values: [value] }) },
        { key: "ne", label: t("cellMenu.notEquals"), onSelect: () => applyOp("filterCompare", { op: "!=", value }, { selected: [column] }) },
        { key: "rp", label: t("cellMenu.replace"), onSelect: () => { setSelectedColumns([column]); setDialog({ kind: "param", opId: "replace", params: { find: value }, selected: [column] }); } },
        { key: "cp", label: t("cellMenu.copy"), onSelect: () => { try { void navigator.clipboard.writeText(value); } catch { /* clipboard unavailable */ } } },
      ],
    });
  };

  const openStepMenu = (id: string, x: number, y: number) => {
    if (x < 0) { setRenamingStep(id); return; }
    const node = graph.nodes.find((n) => n.id === id);
    if (!node) return;
    const first = node.type === "source";
    setMenu({
      x, y,
      items: [
        { key: "edit", label: t("steps.editSettings"), onSelect: () => setDialog({ kind: "step", nodeId: id }) },
        { key: "rename", label: t("steps.rename"), onSelect: () => setRenamingStep(id) },
        { key: "del", label: t("steps.delete"), disabled: node.type === "output", onSelect: () => deleteNode(id) },
        { key: "end", label: t("steps.deleteUntilEnd"), disabled: node.type === "output", onSelect: () => { commit(deleteUntilEnd(graph, id)); setSelectedId(null); } },
        { key: "s", label: "", separator: true },
        { key: "ins", label: t("steps.insertAfter"), onSelect: () => { setSelectedId(id); setNotice(t("steps.insertHint")); } },
        { key: "mb", label: t("steps.moveBefore"), disabled: first || node.type === "output", onSelect: () => commit(moveStep(graph, id, -1)) },
        { key: "ma", label: t("steps.moveAfter"), disabled: first || node.type === "output", onSelect: () => commit(moveStep(graph, id, 1)) },
        { key: "ex", label: t("steps.extractPrevious"), disabled: first, onSelect: () => { const r = extractPrevious(graph, id); if (r) { commit(r.graph); setNotice(t("steps.extracted")); } } },
        { key: "pr", label: t("steps.properties"), onSelect: () => setDialog({ kind: "step", nodeId: id }) },
      ],
    });
  };

  const openQueryMenu = (id: string, x: number, y: number) => {
    if (x < 0) { setRenamingQuery(id); return; }
    const query = queries.find((q) => q.id === id);
    setMenu({
      x, y,
      items: [
        { key: "rn", label: t("queries.rename"), onSelect: () => setRenamingQuery(id) },
        { key: "dup", label: t("queries.duplicate"), onSelect: () => { const r = duplicateQuery(graph, id); commit(r.graph); setActiveQueryId(r.id); setSelectedId(null); } },
        { key: "ref", label: t("queries.reference"), onSelect: () => { const r = referenceQuery(graph, id); commit(r.graph); setActiveQueryId(r.id); setSelectedId(r.sourceId); } },
        { key: "load", label: `${query?.load === false ? "" : "✓ "}${t("queries.enableLoad")}`, hint: t("queries.enableLoadHint"), onSelect: () => commit({ ...graph, queries: queries.map((q) => { if (q.id !== id) return q; const { load: _load, ...rest } = q; void _load; return q.load === false ? rest : { ...rest, load: false }; }) }) },
        { key: "del", label: t("queries.delete"), disabled: queries.length <= 1, onSelect: () => { const next = removeQuery(graph, id); commit(next); if (id === activeId) setActiveQueryId(queriesOf(next)[0].id); } },
      ],
    });
  };

  /** The New Source menu of the "+" of the queries pane (the same entries as the ribbon's New Source). */
  const openNewSourceMenu = (x: number, y: number) => {
    const entry = (id: string, command: string, disabled = false): MenuItem => ({ key: id, label: t(`rb.${id}`), disabled, hint: disabled ? t("ribbon.needsEngineHint") : undefined, onSelect: () => runCommand(command) });
    setMenu({
      x, y,
      items: [
        entry("srcBlank", "src:blank"), entry("srcCards", "x:fromCards"), entry("srcRows", "x:fromTable"), entry("srcFile", "x:fromFile"), entry("srcShared", "x:fromShared"), entry("srcAttachments", "src:files"), entry("enterData", "x:enterData"),
        { key: "s", label: "", separator: true },
        entry("srcMembers", "src:members"), entry("srcDocuments", "src:documents"), entry("srcBoards", "src:boards"), entry("srcItems", "src:items"), entry("srcActivity", "src:activity"),
        { key: "s2", label: "", separator: true },
        { key: "tpl", label: t("toolbar.templates"), heading: true },
        ...FLOW_TEMPLATES.map((tpl): MenuItem => ({ key: tpl.id, label: t(`templates.${tpl.id}`), onSelect: () => loadTemplate(tpl.id) })),
      ],
    });
  };

  // ── keyboard ──────────────────────────────────────────────────────────────
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement | null;
    const typing = !!target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable);
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key === "Enter") { e.preventDefault(); doApply(false); return; }
    if (e.key === "Escape") {
      // only when nothing inside the editor used the key (a completion list, a menu, a dialog, a select, a text box)
      const decision = escapeDecision(escapeContext(e, dirty));
      if (decision === "confirm") { e.preventDefault(); setDialog({ kind: "discard" }); } else if (decision === "close") doClose();
      return;
    }
    if (typing) return;
    if (mod && !e.shiftKey && e.key.toLowerCase() === "z") { e.preventDefault(); undo(); }
    else if (mod && (e.key.toLowerCase() === "y" || (e.shiftKey && e.key.toLowerCase() === "z"))) { e.preventDefault(); redo(); }
    else if (e.key === "F2" && selectedColumns[0] && !(target?.closest("ol"))) { e.preventDefault(); setRenamingColumn(selectedColumns[0]); }
  };

  // ── views ─────────────────────────────────────────────────────────────────
  const hasNodes = activeNodes.length > 0;
  const previewBody = (() => {
    if (!hasNodes) {
      return (
        <div className="flex flex-1 items-center justify-center overflow-auto p-4">
          <div className="max-w-md space-y-3 rounded-xl border border-border bg-card p-4 text-center shadow-sm">
            <Wand2 className="mx-auto h-6 w-6 text-primary" aria-hidden />
            <p className="text-sm font-semibold text-foreground">{t("empty.title")}</p>
            <p className="text-xs text-muted-foreground">{t("empty.body")}</p>
            <div className="flex flex-wrap justify-center gap-1.5">
              {(["cards", "rows", "members", "documents"] as const).map((kind) => (
                <SmallButton key={kind} onClick={() => { const node = makeNode("source", { x: 0, y: 0 }, { kind, name: kind === "rows" ? tables[0]?.title ?? "" : "" }); commit(place(node, null)); setSelectedId(node.id); }}>{t(`source.kinds.${kind}`)}</SmallButton>
              ))}
              <SmallButton onClick={() => setDialog({ kind: "enter" })}>{t("rb.enterData")}</SmallButton>
            </div>
            <p className="text-[11px] text-muted-foreground">{t("empty.templates")}</p>
            <div className="flex flex-wrap justify-center gap-1.5">
              {FLOW_TEMPLATES.map((tpl) => <SmallButton key={tpl.id} onClick={() => loadTemplate(tpl.id)}>{t(`templates.${tpl.id}`)}</SmallButton>)}
            </div>
          </div>
        </div>
      );
    }
    if (previewIssue) return <p role="alert" className="flex items-start gap-1.5 p-3 text-xs text-destructive"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{previewIssue.message}</p>;
    if (run.status === "error") {
      return (
        <div role="alert" className="space-y-1 p-3 text-xs text-destructive">
          <p>{t("preview.failed", { message: run.error ?? "" })}</p>
          {run.error && /transpose/i.test(run.error) ? <p className="text-muted-foreground">{t("preview.transposeHint")}</p> : null}
        </div>
      );
    }
    if (!result) return <div className="p-3"><div className="h-5 w-40 animate-pulse rounded bg-muted" aria-label={t("preview.running")} /></div>;
    if (result.rows.length === 0) return <p className="p-3 text-xs text-muted-foreground">{t("preview.empty")}</p>;
    if (previewTab === "chart") return <div className="h-full min-h-[160px] flex-1 p-2"><ResultChart result={result} kind={outputKind === "table" ? "bar" : outputKind} /></div>;
    return (
      <DataGrid
        columns={resultColumns}
        rows={resultRows}
        profile={profile}
        showQuality={ui.showQuality}
        showDistribution={ui.showDistribution}
        monospaced={ui.monospaced}
        showWhitespace={ui.showWhitespace}
        selectedColumns={selectedColumns}
        selectedCell={selectedCell}
        onSelectColumn={selectColumn}
        onSelectCell={(row, column) => { setSelectedCell({ row, column }); if (!selectedColumns.includes(column)) { setSelectedColumns([column]); setAnchorColumn(column); } }}
        onColumnMenu={openColumnMenu}
        onFilterMenu={openColumnMenu}
        onCellMenu={openCellMenu}
        onTypeMenu={openTypeMenu}
        onMoveColumn={(name, toIndex) => applyOp("moveTo", { index: String(toIndex) }, { selected: [name] })}
        onRenameColumn={(name, to) => applyOp("renameColumn", { name: to }, { selected: [name] })}
        renamingColumn={renamingColumn}
        onRenamingDone={() => setRenamingColumn(null)}
      />
    );
  })();

  const diagramStrip = ui.diagramOpen ? (
    <>
      <div style={{ height: ui.sizes.diagramHeight }} className="relative shrink-0">
        <ReactFlow
          nodes={rfNodes}
          edges={rfEdges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onConnect={onConnect}
          onNodeDragStart={pushHistory}
          onNodesDelete={(deleted) => { let g = graph; for (const n of deleted) g = removeStep(g, n.id); commit(g); }}
          onEdgesDelete={(deleted) => { const ids = new Set(deleted.map((e) => e.id)); commit({ ...graph, edges: graph.edges.filter((e) => !ids.has(e.id)) }); }}
          onNodeClick={(_, node) => setSelectedId(node.id)}
          onNodeDoubleClick={(_, node) => setDialog({ kind: "step", nodeId: node.id })}
          onPaneClick={() => setSelectedId(null)}
          onInit={(instance) => { rfRef.current = instance; }}
          deleteKeyCode={["Backspace", "Delete"]}
          isValidConnection={(c) => !!c.source && !!c.target && c.source !== c.target}
          fitView
          className="killio-reactflow h-full w-full bg-background"
        >
          <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="var(--rf-dots-color)" />
          <Controls />
          <MiniMap nodeStrokeWidth={3} zoomable pannable />
        </ReactFlow>
        <div className="absolute right-2 top-2 flex gap-1">
          <SmallButton onClick={doLayout} title={t("toolbar.autoLayoutHint")}>{t("toolbar.autoLayout")}</SmallButton>
        </div>
      </div>
      <Splitter orientation="horizontal" paneKey="diagramHeight" size={ui.sizes.diagramHeight} grow={1} onResize={(v) => setSize("diagramHeight", v)} label={t("layout.resizeDiagram")} available={() => (centerRef.current ? centerRef.current.clientHeight - 160 : undefined)} />
    </>
  ) : null;

  const profileDock = ui.showProfile && view === "data" && hasNodes && profiledColumn && profile ? (
    <>
      <Splitter orientation="horizontal" paneKey="profileHeight" size={ui.sizes.profileHeight} grow={-1} onResize={(v) => setSize("profileHeight", v)} label={t("layout.resizeProfile")} available={() => (centerRef.current ? centerRef.current.clientHeight - 160 : undefined)} />
      <div style={{ height: ui.sizes.profileHeight }} className="shrink-0 overflow-hidden">
        <ColumnProfilePanel
          profile={profiledColumn}
          result={profile}
          onPickValue={(v) => selectedColumn && applyOp("filterValues", {}, { selected: [selectedColumn], values: [v] })}
          onValueMenu={(value, x, y) => selectedColumn && setMenu({ x, y, items: [
            { key: "keep", label: t("profile.keepOnly"), onSelect: () => applyOp("filterValues", {}, { selected: [selectedColumn], values: [value] }) },
            { key: "exclude", label: t("profile.exclude"), onSelect: () => applyOp("filterCompare", { op: "!=", value }, { selected: [selectedColumn] }) },
            { key: "replace", label: t("profile.replaceValue"), onSelect: () => setDialog({ kind: "param", opId: "replace", params: { find: value }, selected: [selectedColumn] }) },
          ] })}
          onToggleWhole={() => patchUi({ wholeProfile: !ui.wholeProfile })}
        />
      </div>
    </>
  ) : null;

  const stepDialogNode = dialog?.kind === "step" ? graph.nodes.find((n) => n.id === dialog.nodeId) ?? null : null;
  const menuValues = colMenu ? profileColumn(colMenu.column, resultRows.map((r) => r[resultColumns.indexOf(colMenu.column)] ?? ""), { topValues: 200 }).distribution : [];
  const customColumns = previewColumnsNow;

  return (
    <div ref={rootRef} tabIndex={-1} onKeyDown={onKeyDown} className={cn("flex h-full min-h-0 flex-col bg-background text-foreground outline-none", className)}>
      {/* title row */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-card px-3 py-1.5">
        <h2 className="min-w-0 truncate text-sm font-semibold">{t("dialog.title")} <span className="font-normal text-muted-foreground">· {activeQuery.name}</span>{dirty ? <span className="ml-1 text-amber-600 dark:text-amber-400" title={t("dialog.unapplied")}>●</span> : null}</h2>
        <span className="flex items-center gap-1">
          <IconButton label={t("toolbar.undo")} disabled={history.past.length === 0} onClick={undo}><Undo2 className="h-4 w-4" /></IconButton>
          <IconButton label={t("toolbar.redo")} disabled={history.future.length === 0} onClick={redo}><Redo2 className="h-4 w-4" /></IconButton>
        </span>
        <span className="ml-auto flex items-center gap-2 text-[11px]" aria-live="polite">
          {notice ? <span className="rounded bg-amber-500/15 px-2 py-0.5 text-amber-900 dark:text-amber-200">{notice}</span> : null}
          {errorCount > 0 ? <span className="inline-flex items-center gap-1 text-destructive"><AlertTriangle className="h-3.5 w-3.5" />{t("toolbar.problems", { count: errorCount })}</span> : null}
        </span>
        {onApply ? (
          <span className="flex">
            <button type="button" disabled={!canApply} onClick={() => doApply(false)} title={`${t("rb.closeApply")} (Ctrl+Enter)`} className="inline-flex h-8 items-center rounded-l-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">{t("rb.closeApply")}</button>
            <button type="button" aria-haspopup="menu" aria-label={t("dialog.applyMenu")} onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setApplyMenuOpen({ x: r.right - 200, y: r.bottom + 2 }); }} className="inline-flex h-8 w-7 items-center justify-center rounded-r-md border-l border-primary-foreground/30 bg-primary text-primary-foreground hover:bg-primary/90"><ChevronDown className="h-3.5 w-3.5" /></button>
          </span>
        ) : null}
        <IconButton label={t("rb.refreshPreview")} onClick={() => setNonce((n) => n + 1)}><RefreshCw className="h-4 w-4" /></IconButton>
      </div>

      {restore ? (
        <div role="alert" className="flex flex-wrap items-center gap-2 border-b border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-900 dark:text-amber-200">
          <span className="min-w-0 flex-1">{t("draft.restoreQuestion")}</span>
          <SmallButton onClick={() => { commit(restore.graph); setRestore(null); }}>{t("draft.restore")}</SmallButton>
          <SmallButton onClick={() => { clearDraft(storage("session"), ownerId); setRestore(null); }}>{t("draft.discard")}</SmallButton>
        </div>
      ) : null}
      {!ownerPresent ? (
        <div role="alert" className="flex flex-wrap items-center gap-2 border-b border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-900 dark:text-amber-200">
          <span className="min-w-0 flex-1">{t("owner.goneBanner")}</span>
          <SmallButton onClick={copyScript} disabled={!script}><Copy className="h-3 w-3" />{t("owner.copyScript")}</SmallButton>
        </div>
      ) : null}

      <Ribbon tab={tab} onTab={setTab} hasSteps={steps.length > 0} hasColumn={selectedColumns.length > 0} toggles={toggles} compact={ui.ribbonCompact} onCompact={(ribbonCompact) => patchUi({ ribbonCompact })} onCommand={ribbonCommand} />

      <div className="flex min-h-0 flex-1">
        {/* left: queries */}
        <div style={{ width: leftCollapsed ? undefined : ui.sizes.leftWidth }} className={cn("flex min-h-0 shrink-0 border-r border-border bg-card/40", leftCollapsed ? "" : "hidden md:flex")}>
          <QueriesPane
            queries={queries}
            params={[...params, ...readBack.params]}
            functions={[...functions, ...readBack.functions]}
            activeId={activeId}
            collapsed={leftCollapsed}
            onToggle={() => patchUi({ leftCollapsed: !leftCollapsed })}
            onSelect={(id) => { setActiveQueryId(id); setSelectedId(null); setSelectedColumns([]); }}
            onAdd={openNewSourceMenu}
            onRename={(id, name) => commit(renameQuery(graph, id, name))}
            onContextMenu={openQueryMenu}
            onOpenParams={() => setDialog({ kind: "params" })}
            onOpenFunctions={() => setDialog({ kind: "functions" })}
            renamingId={renamingQuery}
            onRenamingDone={() => setRenamingQuery(null)}
          />
        </div>
        {!leftCollapsed ? <div className="hidden md:flex"><Splitter orientation="vertical" paneKey="leftWidth" size={ui.sizes.leftWidth} grow={1} onResize={(v) => setSize("leftWidth", v)} label={t("layout.resizeQueries")} available={() => (rootRef.current ? rootRef.current.clientWidth - 520 : undefined)} /></div> : null}

        {/* centre */}
        <main ref={centerRef} className="flex min-h-0 min-w-0 flex-1 flex-col">
          {diagramStrip}
          {ui.formulaBar ? <FormulaBar script={previewScript} advanced={advancedNode} schema={scriptSchema} onAdvanced={(s) => advancedNode && commit(updateNode(graph, advancedNode.id, { data: { script: s } }))} /> : null}
          {tab === "sources" ? (
            <SourcesCatalog
              tables={tables}
              files={files}
              queryTables={queryTables}
              queries={queries}
              currentQueryId={activeId}
              onRefresh={() => setNonce((n) => n + 1)}
              teamId={teamId}
              accessToken={accessToken}
              nonce={nonce}
              onPickTags={(board) => {
                startQuery([{ type: "source", data: { kind: "tags", name: "" } }, { type: "filter" as const, data: { combine: "and", advanced: "", conditions: [{ ...newCondition(), field: "board", op: "=" as const, value: board, vtype: "text" as const }] } }]);
                setTab("home");
              }}
              onPickCards={(plan) => {
                // a whole board / list is a scope; single cards are picked by id
                const byId = plan.ids.length ? [{ type: "filter" as const, data: { combine: "and", advanced: "", conditions: [{ ...newCondition(), field: "id", op: "in" as const, value: plan.ids.join(", "), values: plan.ids, vtype: "text" as const }] } }] : [];
                startQuery([{ type: "source", data: { ...plan.source } }, ...byId]);
                setTab("home");
              }}
              onUse={(source, where) => {
                // a folder of one document / card (its bricks, its checklist items): the source narrowed to that owner
                const narrow = where ? [{ type: "filter" as const, data: { combine: "and", advanced: "", conditions: [{ ...newCondition(), field: where.field, op: "=" as const, value: where.value, vtype: "text" as const }] } }] : [];
                startQuery([{ type: "source", data: { ...source } }, ...narrow]);
                setTab("home");
              }}
            />
          ) : view === "schema" && hasNodes ? (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              {previewIssue ? <p role="alert" className="p-3 text-xs text-destructive">{previewIssue.message}</p> : (
                <SchemaView
                  profile={profile}
                  selectedColumn={selectedColumn}
                  onSelect={(c) => setSelectedColumns([c])}
                  onRename={(c, name) => applyOp("renameColumn", { name }, { selected: [c] })}
                  onRemove={(c) => applyOp("removeColumn", {}, { selected: [c] })}
                  onDuplicate={(c) => applyOp("duplicateColumn", {}, { selected: [c] })}
                  onMove={(c, dir) => applyOp(dir === "left" ? "moveLeft" : "moveRight", {}, { selected: [c] })}
                  onChangeType={(c, type) => applyOp("changeType", { type }, { selected: [c] })}
                  onMenu={(c, x, y) => setColMenu({ x, y, column: c })}
                  onMoveTo={(c, index) => applyOp("moveTo", { index: String(index) }, { selected: [c] })}
                />
              )}
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{previewBody}</div>
          )}
          {profileDock}
        </main>

        {/* right: query settings */}
        {!rightCollapsed ? <Splitter orientation="vertical" paneKey="rightWidth" size={ui.sizes.rightWidth} grow={-1} onResize={(v) => setSize("rightWidth", v)} label={t("layout.resizeSettings")} available={() => (rootRef.current ? rootRef.current.clientWidth - 520 : undefined)} /> : null}
        {rightCollapsed ? (
          <div className="flex w-7 shrink-0 flex-col items-center border-l border-border bg-card/60 py-1">
            <IconButton label={t("settings.expand")} onClick={() => patchUi({ rightCollapsed: false })}><ChevronLeft className="h-4 w-4" /></IconButton>
            <span className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground [writing-mode:vertical-rl]">{t("settings.title")}</span>
          </div>
        ) : (
          <aside style={{ width: ui.sizes.rightWidth }} className="flex min-h-0 shrink-0 flex-col border-l border-border bg-card/40" aria-label={t("settings.title")}>
            <div className="flex items-center justify-between border-b border-border px-2 py-1">
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t("settings.title")}</h3>
              <IconButton label={t("settings.collapse")} onClick={() => patchUi({ rightCollapsed: true })}><ChevronRight className="h-4 w-4" /></IconButton>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              <h4 className="mb-1 text-[11px] font-semibold text-muted-foreground">{t("settings.properties")}</h4>
              <label className="mb-0.5 block text-[11px] text-muted-foreground" htmlFor="qf-query-name">{t("settings.name")}</label>
              <input
                id="qf-query-name"
                key={activeQuery.id + activeQuery.name}
                defaultValue={activeQuery.name}
                spellCheck={false}
                onBlur={(e) => { if (e.target.value.trim() && e.target.value !== activeQuery.name) commit(renameQuery(graph, activeQuery.id, e.target.value)); }}
                onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                className="mb-3 h-8 w-full rounded-md border border-border bg-background px-2 text-xs text-foreground"
              />
              <h4 className="mb-1 text-[11px] font-semibold text-muted-foreground">{t("steps.title")}</h4>
              <AppliedSteps
                steps={steps}
                selectedId={stepsSelectedId}
                issues={diagnosis.issues}
                titleOf={titleOf}
                summaryOf={summaryOf}
                onSelect={setSelectedId}
                onEdit={(id) => setDialog({ kind: "step", nodeId: id })}
                onDelete={deleteNode}
                onReorder={(id, toIndex) => {
                  const from = steps.findIndex((s) => s.id === id);
                  if (from < 0) return;
                  let g = graph;
                  const dir: -1 | 1 = toIndex > from ? 1 : -1;
                  for (let i = 0; i < Math.abs(toIndex - from); i++) g = moveStep(g, id, dir);
                  if (g !== graph) commit(g);
                }}
                onRename={(id, label) => commit(renameStep(graph, id, label))}
                onContextMenu={openStepMenu}
                renamingId={renamingStep}
                onRenamingDone={() => setRenamingStep(null)}
              />
            </div>
          </aside>
        )}
      </div>

      {/* status bar */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5 border-t border-border bg-card px-3 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground" role="status">
        <span>{result ? t("status.counts", { columns: resultColumns.length, rows: result.rows.length }) : t("status.noData")}</span>
        {result?.scope && result.scope.qualifiers.length > 0 ? <span title={t("status.scopeHint")}>{t("status.scope", { label: result.scope.label, count: result.scope.cards })}</span> : null}
        <button type="button" className="uppercase hover:text-foreground" onClick={() => patchUi({ wholeProfile: !ui.wholeProfile })} title={t("status.profilingToggle")}>
          {ui.wholeProfile ? t("status.profilingAll") : t("status.profilingTop", { count: 1000 })}
        </button>
        {previewAt ? <span>{t("status.downloadedAt", { time: clockText(previewAt) })}</span> : null}
        {run.status === "loading" ? <span className="inline-flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" />{t("preview.running")}</span> : null}
        <span className="ml-auto flex items-center gap-1">
          {([["diagram", t("views.diagram"), ui.diagramOpen], ["data", t("views.data"), view === "data"], ["schema", t("views.schema"), view === "schema"]] as const).map(([id, label, on]) => (
            <button key={id} type="button" aria-pressed={on} onClick={() => (id === "diagram" ? patchUi({ diagramOpen: !ui.diagramOpen }) : setView(id))} className={cn("rounded px-2 py-0.5 uppercase", on ? "bg-primary text-primary-foreground" : "hover:bg-muted hover:text-foreground")}>{label}</button>
          ))}
          {result && result.columns.some((c) => c.kind === "metric") ? (
            <button type="button" aria-pressed={previewTab === "chart"} onClick={() => setPreviewTab((p) => (p === "chart" ? "table" : "chart"))} className={cn("rounded px-2 py-0.5 uppercase", previewTab === "chart" ? "bg-primary text-primary-foreground" : "hover:bg-muted hover:text-foreground")}>{t("preview.chart")}</button>
          ) : null}
        </span>
      </div>

      {/* menus and dialogs */}
      {menu ? <FloatingMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} /> : null}
      {applyMenuOpen ? <FloatingMenu x={applyMenuOpen.x} y={applyMenuOpen.y} items={[{ key: "apply", label: t("rb.apply"), onSelect: () => doApply(true) }, { key: "close", label: t("rb.closeWithout"), onSelect: requestClose }]} onClose={() => setApplyMenuOpen(null)} /> : null}
      {colMenu ? (
        <ColumnMenu
          x={colMenu.x}
          y={colMenu.y}
          column={colMenu.column}
          type={typeOfColumn(colMenu.column)}
          selectedCount={selectedColumns.length}
          sorted={sorted}
          values={menuValues}
          toggles={toggles}
          onCommand={(command) => runCommand(command)}
          onKeepValues={(values) => applyOp("filterValues", {}, { selected: [colMenu.column], values })}
          onClose={() => setColMenu(null)}
        />
      ) : null}
      {dialog?.kind === "param" && opById(dialog.opId) ? (
        <ParamDialog
          def={opById(dialog.opId)!}
          initial={dialog.params}
          columns={previewColumnsNow}
          selected={dialog.selected ?? selectedColumns}
          onClose={() => setDialog(null)}
          onOk={(params, picked) => { const id = dialog.opId; const sel = dialog.selected; setDialog(null); applyOp(id, { ...dialog.params, ...params }, { selected: picked.length > 0 ? picked : sel }); }}
        />
      ) : null}
      {dialog?.kind === "choose" ? <ChooseColumnsDialog columns={previewColumnsNow} initial={[]} onClose={() => setDialog(null)} onOk={(picked) => { setDialog(null); applyOp("keepColumns", {}, { selected: picked }); }} /> : null}
      {dialog?.kind === "group" ? (
        <GroupByDialog
          columns={previewColumnsNow}
          initialDims={selectedColumns}
          filterSchema={filterSchema}
          onClose={() => setDialog(null)}
          onOk={(data) => { setDialog(null); addStep({ type: "group", data, labelKey: "ops.groupBy", labelArg: selectedColumns.join(", ") }); }}
        />
      ) : null}
      {dialog?.kind === "merge" ? (
        <MergeDialog
          leftColumns={resultColumns}
          leftRows={resultRows}
          queries={queries}
          activeQueryId={activeId}
          tables={tables}
          onClose={() => setDialog(null)}
          onOk={(r: MergeResult) => { setDialog(null); addStep({ type: "join", data: { rightSource: r.rightSource, alias: "", leftKey: r.leftKey, rightKey: r.rightKey, kind: r.kind, expand: [] }, labelKey: "rb.mergeQueries", labelArg: "" }, true); }}
        />
      ) : null}
      {dialog?.kind === "append" ? (
        <AppendDialog
          queries={queries}
          activeQueryId={activeId}
          tables={tables}
          onClose={() => setDialog(null)}
          onOk={(source) => {
            setDialog(null);
            const point = insertionPoint(graph, stepsSelectedId, activeId);
            if (!point) return;
            const union = makeNode("union", { x: 0, y: 0 }, undefined, { label: t("rb.appendQueries"), query: activeId });
            const next = insertAfter(graph, point.id, union);
            const placedUnion = next.nodes.find((n) => n.id === union.id)!;
            const second = makeNode("source", { x: placedUnion.position.x - 280, y: placedUnion.position.y + 170 }, { ...source }, { query: activeId });
            commit({ ...next, nodes: [...next.nodes, second], edges: [...next.edges, { id: uid("e"), source: second.id, target: union.id, targetHandle: "in2" }] });
            setSelectedId(union.id);
          }}
        />
      ) : null}
      {dialog?.kind === "custom" ? (
        <CustomColumnDialog
          columns={customColumns}
          schema={scriptSchema}
          userFunctions={functions}
          params={params}
          onClose={() => setDialog(null)}
          onOk={(name, expr) => { setDialog(null); addStep({ type: "transform", data: { columns: [newTransformColumn("custom", { alias: name, expr })] }, labelKey: "ops.customColumn", labelArg: name }); }}
        />
      ) : null}
      {dialog?.kind === "fromCards" ? (
        <FromCardsDialog
          onClose={() => setDialog(null)}
          onOk={({ board, list }) => {
            setDialog(null);
            // `cards in board "X" list "Y"`: the engine scopes the cards itself (and reports what it read)
            startQuery([{ type: "source", data: { kind: "cards", name: "", ...(board || list ? { scope: { board, list } } : {}) } }]);
          }}
        />
      ) : null}
      {dialog?.kind === "pick" ? (
        <SourcePickDialog
          title={t(dialog.source === "table" ? "rb.srcRows" : dialog.source === "file" ? "rb.srcFile" : "rb.srcShared")}
          initial={{ kind: "rows", name: dialog.source === "table" ? tables[0]?.title ?? "" : "" }}
          tables={dialog.source === "table" ? tables : []}
          files={files}
          queryTables={queryTables}
          origins={dialog.source === "table" ? ["document", "card"] : dialog.source === "file" ? ["file"] : ["shared"]}
          queries={queries}
          teamId={teamId}
          onClose={() => setDialog(null)}
          onOk={(source) => { setDialog(null); startQuery([{ type: "source", data: { ...source } }]); }}
        />
      ) : null}
      {dialog?.kind === "enter" ? (
        <EnterDataDialog
          onClose={() => setDialog(null)}
          onOk={(table: InlineTable) => { setDialog(null); startQuery([{ type: "source", data: { kind: "inline", name: "", table } }], t("rb.enterData")); }}
        />
      ) : null}
      {dialog?.kind === "params" ? <ParametersDialog initial={params} supported={declarations} onClose={() => setDialog(null)} onOk={(list) => { setDialog(null); commit({ ...graph, params: list.length ? list : undefined }); }} /> : null}
      {dialog?.kind === "functions" ? <FunctionsDialog initial={functions} supported={declarations} schema={scriptSchema} onClose={() => setDialog(null)} onOk={(list) => { setDialog(null); commit({ ...graph, functions: list.length ? list : undefined }); }} /> : null}
      {dialog?.kind === "discard" ? <ConfirmDiscardDialog onKeep={() => setDialog(null)} onDiscard={() => { clearDraft(storage("session"), ownerId); doClose(); }} /> : null}
      {stepDialogNode ? (
        <StepDialog
          node={stepDialogNode}
          title={titleOf(stepDialogNode)}
          inspector={{
            columns: suggestionsFor(stepDialogNode.id), tables, files, queryTables, queries, currentQueryId: activeId, teamId, scriptSchema, filterSchema,
            issue: diagnosis.issues[stepDialogNode.id] ?? null, previewColumns: previewColumnsNow,
          }}
          onClose={() => setDialog(null)}
          onDelete={() => deleteNode(stepDialogNode.id)}
          onOk={(draft) => { setDialog(null); commit(updateNode(graph, draft.id, { data: draft.data, label: draft.label, note: draft.note, disabled: draft.disabled })); }}
        />
      ) : null}
      {dialog?.kind === "advanced" ? <AdvancedEditorDialog script={script} schema={scriptSchema} onClose={() => setDialog(null)} onKeep={(s) => { setDialog(null); commit(advancedGraph(s)); setActiveQueryId(DEFAULT_QUERY_ID); setSelectedId(null); }} /> : null}
    </div>
  );
}
