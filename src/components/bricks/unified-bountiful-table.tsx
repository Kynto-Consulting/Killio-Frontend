"use client";

import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  Table as TableIcon,
  CheckSquare, Square,
  Plus, Rows, Columns, Trash2,
  Maximize2, Minimize2, ChevronDown, ChevronLeft, ChevronRight, X,
  Calendar, Link as LinkIcon, Hash, User as UserIcon, FileText,
  Settings, Palette, Edit3, Mail, Phone, Clock, UserCheck,
  ArrowLeftToLine, ArrowRightToLine, Copy, EyeOff, List, Eye,
  Sigma, RotateCw, LayoutDashboard, CreditCard, MoreHorizontal,
  Circle, GripVertical, Pin, WrapText, Wand2, Sparkles, Play,
  ArrowUp, ArrowDown, Filter,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { RefPill } from "../ui/ref-pill";
import { RichText } from "../ui/rich-text";
import { useTranslations } from "@/components/providers/i18n-provider";
import { useSession } from "@/components/providers/session-provider";
import { fetchApi } from "@/lib/api/client";
import katex from "katex";
// @ts-ignore
import "katex/dist/katex.min.css";
import { ReferencePicker, type ReferencePickerSelection } from "@/components/documents/reference-picker";
import { getWorkspaceMemberLabel, WorkspaceMemberLike } from "@/lib/workspace-members";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface BountifulColumn {
  id: string;
  name: string;
  type: string;
  options?: { id: string; name: string; color: string; isDefault?: boolean }[];
  statusGroups?: { name: string; color: string; optionIds: string[] }[];
  hidden?: boolean;
  pinned?: boolean;
  wrap?: boolean;
  width?: number;
  numberFormat?: {
    currency?: string;  // "none" | "pen" | "usd" | "eur" | "gbp" | "percent"
    decimals?: number;  // 0-4, undefined = auto
    display?: string;   // "number" | "bar" | "ring"
  };
  dateFormat?: {
    format?: "friendly" | "relative" | "short" | "iso";
    includeTime?: boolean;
  };
  personFormat?: "name" | "email" | "alias";
  documentFormat?: "name" | "full";
  phoneFormat?: { country?: string };
}

export interface BountifulCell {
  type: string;
  text?: string;
  name?: string;
  color?: string;
  items?: { name: string; color: string }[];
  checked?: boolean;
  start?: string;
  end?: string;
  url?: string;
  number?: number;
  value?: string;
  formula?: string; // LaTeX formula
  users?: { id: string; name?: string; email?: string; avatar?: string }[];
  documents?: { id: string; name?: string }[];
  boards?: { id: string; name?: string }[];
  cards?: { id: string; name?: string }[];
  // Metadata for time tracking
  _createdAt?: string;
  _lastEditedAt?: string;
  _createdBy?: string;
  _lastEditedBy?: string;
}

export interface BountifulRow {
  id: string;
  cells: Record<string, BountifulCell | null>;
  _createdAt?: string;
  _lastEditedAt?: string;
  _createdBy?: string;
  _lastEditedBy?: string;
}

// Constants for AI Usage
const AI_MONTHLY_LIMIT = 10.00; // $10 USD
const AI_COST_PER_RECORD = 0.005; // $0.005 per row roughly

interface UnifiedBountifulTableProps {
  id: string;
  title?: string;
  columns: BountifulColumn[];
  rows: BountifulRow[];
  readonly?: boolean;
  onUpdate?: (content: { title?: string; columns: BountifulColumn[]; rows: BountifulRow[] }) => void;
  onPatchCell?: (rowId: string, colId: string, cell: BountifulCell, rowMeta: { _lastEditedAt: string; _lastEditedBy: string }) => void;
  onPatchColumn?: (colId: string, updates: Partial<BountifulColumn>) => void;
  onAddColumn?: (column: BountifulColumn, atIndex: number) => void;
  onRemoveColumn?: (colId: string) => void;
  onDuplicateColumn?: (srcColId: string, newColId: string, newName: string, atIndex: number) => void;
  // Context for ReferencePicker
  documents?: any[];
  boards?: any[];
  users?: WorkspaceMemberLike[];
  activeBricks?: any[];
}

// ─── Color map ──────────────────────────────────────────────────────────────

const colorThemeMap: Record<string, string> = {
  default: "bg-muted/80 text-foreground",
  gray: "bg-gray-100 text-gray-800 dark:bg-gray-800/80 dark:text-gray-100",
  brown: "bg-amber-100 text-amber-900 dark:bg-amber-900/60 dark:text-amber-100",
  orange: "bg-orange-100 text-orange-900 dark:bg-orange-900/60 dark:text-orange-100",
  yellow: "bg-yellow-100 text-yellow-900 dark:bg-yellow-900/60 dark:text-yellow-100",
  green: "bg-green-100 text-green-900 dark:bg-green-900/60 dark:text-green-100",
  blue: "bg-blue-100 text-blue-900 dark:bg-blue-900/60 dark:text-blue-100",
  purple: "bg-purple-100 text-purple-900 dark:bg-purple-900/60 dark:text-purple-100",
  pink: "bg-pink-100 text-pink-900 dark:bg-pink-900/60 dark:text-pink-100",
  red: "bg-red-100 text-red-900 dark:bg-red-900/60 dark:text-red-100",
  teal: "bg-teal-100 text-teal-900 dark:bg-teal-900/60 dark:text-teal-100",
};
const getPillClass = (c?: string) => colorThemeMap[c || "default"] || colorThemeMap.default;
const AVAILABLE_COLORS = Object.keys(colorThemeMap);

// ─── All column types (icons only, labels come from i18n) ───────────────────

const COL_TYPE_VALUES = [
   "rich_text", "number", "select", "multi_select", "status",
  "date", "people", "checkbox", "url", "email", "phone_number",
  "formula",  "rollup", "created_time", "created_by",
  "last_edited_time", "last_edited_by", "document", "board", "card",
  //"relation","title",
] as const;

const COL_TYPE_ICONS: Record<string, React.ReactNode> = {
  title: <FileText className="h-3.5 w-3.5" />,
  rich_text: <List className="h-3.5 w-3.5" />,
  number: <Hash className="h-3.5 w-3.5" />,
  select: <ChevronDown className="h-3.5 w-3.5" />,
  multi_select: <ChevronDown className="h-3.5 w-3.5" />,
  status: <RotateCw className="h-3.5 w-3.5" />,
  date: <Calendar className="h-3.5 w-3.5" />,
  people: <UserIcon className="h-3.5 w-3.5" />,
  checkbox: <CheckSquare className="h-3.5 w-3.5" />,
  url: <LinkIcon className="h-3.5 w-3.5" />,
  email: <Mail className="h-3.5 w-3.5" />,
  phone_number: <Phone className="h-3.5 w-3.5" />,
  formula: <Sigma className="h-3.5 w-3.5" />,
  relation: <FileText className="h-3.5 w-3.5" />,
  rollup: <Sigma className="h-3.5 w-3.5" />,
  created_time: <Clock className="h-3.5 w-3.5" />,
  created_by: <UserCheck className="h-3.5 w-3.5" />,
  last_edited_time: <Clock className="h-3.5 w-3.5" />,
  last_edited_by: <UserCheck className="h-3.5 w-3.5" />,
  document: <FileText className="h-3.5 w-3.5" />,
  board: <LayoutDashboard className="h-3.5 w-3.5" />,
  card: <CreditCard className="h-3.5 w-3.5" />,
};

const colTypeIcon: Record<string, React.ReactNode> = Object.fromEntries(
  Object.entries(COL_TYPE_ICONS).map(([k, v]) => [k, React.cloneElement(v as React.ReactElement<{ className?: string }>, { className: "h-3 w-3" })])
);

/** Hook to get translated column types list */
function useColumnTypes() {
  const t = useTranslations("document-detail");
  return useMemo(() => COL_TYPE_VALUES.map(v => ({
    value: v,
    label: t(`bountifulTable.types.${v}` as any) || v,
    icon: COL_TYPE_ICONS[v] || <FileText className="h-3.5 w-3.5" />,
  })), [t]);
}

/** Create a default empty cell for the given column type */
function createDefaultCell(colType: string): BountifulCell {
  switch (colType) {
    case "title": case "rich_text": case "email": case "phone_number": return { type: "text", text: "" };
    case "number": return { type: "number" };
    case "select": case "status": return { type: "select", name: "", color: "default" };
    case "multi_select": return { type: "multi_select", items: [] };
    case "checkbox": return { type: "checkbox", checked: false };
    case "date": case "created_time": case "last_edited_time": return { type: "date", start: "" };
    case "url": return { type: "url", url: "" };
    case "people": case "created_by": case "last_edited_by": return { type: "user", users: [] };
    case "relation": case "document": return { type: "document", documents: [] };
    case "board": return { type: "board", boards: [] };
    case "card": return { type: "card", cards: [] };
    case "formula": case "rollup": return { type: "text", text: "" };
    default: return { type: "text", text: "" };
  }
}

const LEGACY_CELL_TYPE_ALIASES: Record<string, string> = {
  title: "text",
  rich_text: "text",
  email: "text",
  phone_number: "text",
  formula: "text",
  rollup: "text",
  relation: "document",
  people: "user",
};

function normalizeStoredCellType(type?: string) {
  if (!type) return undefined;
  return LEGACY_CELL_TYPE_ALIASES[type] || type;
}

function getCellFamily(type?: string) {
  switch (normalizeStoredCellType(type)) {
    case "text":
      return "text";
    case "number":
      return "number";
    case "select":
    case "status":
      return "select";
    case "multi_select":
      return "multi_select";
    case "checkbox":
      return "checkbox";
    case "date":
      return "date";
    case "url":
      return "url";
    case "user":
      return "user";
    case "document":
      return "document";
    case "board":
      return "board";
    case "card":
      return "card";
    default:
      return normalizeStoredCellType(type) || "text";
  }
}

function getCanonicalCellTypeForColumn(colType: string) {
  switch (colType) {
    case "title":
    case "rich_text":
    case "email":
    case "phone_number":
    case "formula":
    case "rollup":
      return "text";
    case "select":
    case "status":
      return "select";
    case "multi_select":
      return "multi_select";
    case "checkbox":
      return "checkbox";
    case "date":
    case "created_time":
    case "last_edited_time":
      return "date";
    case "url":
      return "url";
    case "people":
    case "created_by":
    case "last_edited_by":
      return "user";
    case "relation":
    case "document":
      return "document";
    case "board":
      return "board";
    case "card":
      return "card";
    case "number":
      return "number";
    default:
      return "text";
  }
}

function coerceCellForColumnType(cell: BountifulCell | null, colType: string): BountifulCell | null {
  if (!cell) return null;

  const targetType = getCanonicalCellTypeForColumn(colType);
  const sourceFamily = getCellFamily(cell.type);
  const targetFamily = getCellFamily(targetType);

  if (sourceFamily !== targetFamily) {
    return createDefaultCell(colType);
  }

  switch (targetType) {
    case "text":
      return { ...cell, type: "text", text: cell.text ?? cell.value ?? cell.name ?? "" };
    case "number":
      return { ...cell, type: "number", number: cell.number };
    case "select":
      return { ...cell, type: "select", name: cell.name ?? "", color: cell.color || "default" };
    case "multi_select":
      return { ...cell, type: "multi_select", items: (cell.items || []).map(item => ({ ...item })) };
    case "checkbox":
      return { ...cell, type: "checkbox", checked: !!cell.checked };
    case "date":
      return { ...cell, type: "date", start: cell.start || "", end: cell.end };
    case "url":
      return { ...cell, type: "url", url: cell.url ?? cell.text ?? cell.value ?? "" };
    case "user":
      return { ...cell, type: "user", users: (cell.users || []).map(user => ({ ...user })) };
    case "document":
      return { ...cell, type: "document", documents: (cell.documents || []).map(doc => ({ ...doc })) };
    case "board":
      return { ...cell, type: "board", boards: (cell.boards || []).map(board => ({ ...board })) };
    case "card":
      return { ...cell, type: "card", cards: (cell.cards || []).map(card => ({ ...card })) };
    default:
      return createDefaultCell(colType);
  }
}

// ─── Inline Date Picker (portal) ────────────────────────────────────────────

function InlineDatePicker({ anchorRect, value, onSelect, onClose }: {
  anchorRect: DOMRect; value?: { start?: string; end?: string };
  onSelect: (start: string, end?: string) => void; onClose: () => void;
}) {
  const t = useTranslations("document-detail");
  const [date, setDate] = useState(() => {
    const s = value?.start || "";
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
  });
  const [endDate, setEndDate] = useState(() => {
    const s = value?.end || "";
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
  });
  const [showEnd, setShowEnd] = useState(!!value?.end);
  const [viewDate, setViewDate] = useState(new Date());

  const daysInMonth = (y: number, m: number) => new Date(y, m + 1, 0).getDate();
  const firstDayOfMonth = (y: number, m: number) => new Date(y, m, 1).getDay();

  const handleDayClick = (day: number) => {
    const newD = new Date(viewDate.getFullYear(), viewDate.getMonth(), day);
    const iso = newD.toISOString().slice(0, 10);
    if (showEnd && !endDate) setEndDate(iso);
    else setDate(iso);
  };

  const top = Math.min(anchorRect.bottom + 4, window.innerHeight - 400);
  const left = Math.min(anchorRect.left, window.innerWidth - 300);

  const monthNames = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(m => t(`bountifulTable.months.${m}` as any));

  return createPortal(
    <>
      <div className="fixed inset-0 z-[300]" onClick={onClose} />
      <div className="fixed z-[301] w-[280px] rounded-lg border border-border bg-card shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 flex flex-col"
        style={{ top, left }} onClick={e => e.stopPropagation()}>
        <div className="p-3 border-b border-border bg-muted/20">
          <div className="flex items-center justify-between mb-2">
            <button onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1))} className="p-1 hover:bg-muted rounded transition-colors"><ChevronLeft className="h-4 w-4" /></button>
            <span className="text-xs font-semibold">{monthNames[viewDate.getMonth()]} {viewDate.getFullYear()}</span>
            <button onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1))} className="p-1 hover:bg-muted rounded transition-colors"><ChevronRight className="h-4 w-4" /></button>
          </div>
          <div className="grid grid-cols-7 gap-px mb-1">
            {["D", "L", "M", "X", "J", "V", "S"].map((d, i) => <div key={i} className="text-[10px] text-muted-foreground text-center font-bold">{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-px">
            {Array.from({ length: firstDayOfMonth(viewDate.getFullYear(), viewDate.getMonth()) }).map((_, i) => <div key={i} />)}
            {Array.from({ length: daysInMonth(viewDate.getFullYear(), viewDate.getMonth()) }).map((_, i) => {
              const d = i + 1;
              const cur = new Date(viewDate.getFullYear(), viewDate.getMonth(), d).toISOString().slice(0, 10);
              const isSel = date === cur || endDate === cur;
              const isInRange = date && endDate && cur > date && cur < endDate;
              return (
                <button key={d} onClick={() => handleDayClick(d)}
                  className={cn("h-7 w-7 text-[11px] rounded-md transition-all flex items-center justify-center hover:bg-accent hover:text-accent-foreground",
                    isSel ? "bg-accent text-accent-foreground font-bold shadow-sm" : isInRange ? "bg-accent/20" : "")}>
                  {d}
                </button>
              );
            })}
          </div>
        </div>

        <div className="p-3 space-y-3">
          <div className="flex flex-col gap-1.5">
            <div className="text-[10px] uppercase font-bold text-muted-foreground px-1">{t("bountifulTable.date" as any)}</div>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="w-full h-8 rounded-md border border-input bg-background px-2 py-1 text-sm focus-visible:outline-none focus:ring-1 focus:ring-accent" />
          </div>

          {showEnd && (
            <div className="flex flex-col gap-1.5 animate-in slide-in-from-top-2">
              <div className="text-[10px] uppercase font-bold text-muted-foreground px-1">{t("bountifulTable.dateEnd" as any)}</div>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                className="w-full h-8 rounded-md border border-input bg-background px-2 py-1 text-sm focus-visible:outline-none focus:ring-1 focus:ring-accent" />
            </div>
          )}

          <div className="flex items-center gap-2 pt-1">
            {!showEnd && <button onClick={() => setShowEnd(true)} className="text-[10px] text-accent hover:underline font-medium">{t("bountifulTable.endDate" as any)}</button>}
            <div className="ml-auto flex gap-2">
              <button onClick={onClose} className="px-2.5 py-1 text-[11px] rounded-md border border-border text-muted-foreground hover:bg-muted transition-colors">{t("bountifulTable.cancel" as any)}</button>
              <button onClick={() => { if (date) { onSelect(date, showEnd && endDate ? endDate : undefined); onClose(); } }}
                className="px-2.5 py-1 text-[11px] rounded-md bg-accent text-accent-foreground hover:bg-accent/80 transition-colors shadow-sm">{t("bountifulTable.apply" as any)}</button>
            </div>
          </div>

          <div className="flex flex-wrap gap-1 pt-2 border-t border-border">
            {[
              { label: t("bountifulTable.today" as any), fn: () => { const d = new Date(); setDate(d.toISOString().slice(0, 10)); } },
              { label: t("bountifulTable.tomorrow" as any), fn: () => { const d = new Date(); d.setDate(d.getDate() + 1); setDate(d.toISOString().slice(0, 10)); } },
              { label: t("bountifulTable.clear" as any), fn: () => { setDate(""); setEndDate(""); } },
            ].map(s => (
              <button key={s.label} onClick={s.fn} className="px-2 py-0.5 text-[9px] font-medium rounded-full border border-border text-muted-foreground hover:bg-muted transition-colors">{s.label}</button>
            ))}
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}

// ─── LaTeX render helper ────────────────────────────────────────────────────

function FormulaDisplay({ formula }: { formula: string }) {
  const html = useMemo(() => {
    try {
      return katex.renderToString(formula, { throwOnError: false, displayMode: false });
    } catch {
      return formula;
    }
  }, [formula]);
  return <span dangerouslySetInnerHTML={{ __html: html }} className="text-sm" />;
}

// ─── Color Dot ──────────────────────────────────────────────────────────────

function ColorDot({ color, selected, onClick }: { color: string; selected?: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className={cn("h-5 w-5 rounded-full border-2 transition-all",
        selected ? "border-foreground scale-110" : "border-transparent hover:scale-110", getPillClass(color))}
      title={color} />
  );
}

// ─── Normalize column options to ensure every option has an id ───────────────

function normalizeColumnOptions(cols: BountifulColumn[]): BountifulColumn[] {
  return cols.map(col => ({
    ...col,
    options: col.options?.map((o: any, i: number) => ({
      ...o,
      id: o.id || `opt-${col.id}-${i}`,
    })),
  }));
}

const FILTER_OPERATOR_FALLBACK_LABELS: Record<string, string> = {
  contains: "Contains",
  not_contains: "Does not contain",
  equals: "Is equal",
  not_equals: "Is not equal",
  starts_with: "Starts with",
  ends_with: "Ends with",
  regex: "Regex",
  gt: "Greater than",
  lt: "Less than",
  gte: "Greater or equal",
  lte: "Less or equal",
  between: "Between",
  date_before: "Before",
  date_after: "After",
  date_today: "Today",
  date_this_week: "This week",
  is_any_of: "Any of",
  is_none_of: "None of",
  is_true: "Is true",
  is_false: "Is false",
  empty: "Is empty",
  not_empty: "Is not empty",
};

function getFilterOperatorLabel(t: ReturnType<typeof useTranslations>, op: string): string {
  const key = `bountifulTable.operators.${op}`;
  const translated = t(key as any);
  if (translated && translated !== key) return translated;
  return FILTER_OPERATOR_FALLBACK_LABELS[op] || op;
}

function getFilterOperatorsForType(columnType: string, t: ReturnType<typeof useTranslations>) {
  const textOps = ["contains", "equals", "not_contains", "starts_with", "ends_with", "regex", "empty", "not_empty"];
  const numberOps = ["equals", "not_equals", "gt", "lt", "gte", "lte", "between", "empty", "not_empty"];
  const dateOps = ["equals", "date_before", "date_after", "date_today", "date_this_week", "between", "empty", "not_empty"];
  const choiceOps = ["is_any_of", "is_none_of", "equals", "contains", "empty", "not_empty"];
  const boolOps = ["is_true", "is_false", "empty", "not_empty"];

  let operators = textOps;
  if (columnType === "number") operators = numberOps;
  else if (["date", "created_time", "last_edited_time"].includes(columnType)) operators = dateOps;
  else if (["select", "status", "multi_select"].includes(columnType)) operators = choiceOps;
  else if (columnType === "checkbox") operators = boolOps;
  else if (["people", "created_by", "last_edited_by", "relation", "document", "board", "card"].includes(columnType)) operators = choiceOps;

  return operators.map((value) => ({ value, label: getFilterOperatorLabel(t, value) }));
}

function parseFilterDsl(input: string, fallbackOperator: string) {
  const raw = input.trim();
  if (!raw) return { operator: fallbackOperator, value: "", valid: true };

  const direct = raw.match(/^([a-z_]+)\s*:\s*([\s\S]*)$/i);
  if (direct) {
    return { operator: direct[1].toLowerCase(), value: direct[2].trim(), valid: true };
  }

  const fnLike = raw.match(/^([a-z_]+)\((.*)\)$/i);
  if (fnLike) {
    return { operator: fnLike[1].toLowerCase(), value: fnLike[2].trim(), valid: true };
  }

  const unaryOps = ["empty", "not_empty", "date_today", "date_this_week", "is_true", "is_false"];
  if (unaryOps.includes(raw.toLowerCase())) {
    return { operator: raw.toLowerCase(), value: "", valid: true };
  }

  return { operator: fallbackOperator, value: raw, valid: true };
}

// ─── Column Header Menu (Notion-style) ──────────────────────────────────────

function ColumnHeaderMenu({
  column, anchorRect, onClose, onRename, onChangeType, onUpdateOptions, onUpdateColumn, onDelete,
  onDuplicate, onInsertLeft, onInsertRight, onAIAutocomplete, onSort, sortDir, onFilterChange, filterValue, filterOperator,
}: {
  column: BountifulColumn; anchorRect: DOMRect; onClose: () => void;
  onRename: (name: string) => void; onChangeType: (type: string) => void;
  onUpdateOptions: (options: { id: string; name: string; color: string; isDefault?: boolean }[]) => void;
  onUpdateColumn: (updates: Partial<BountifulColumn>) => void;
  onDelete: () => void; onDuplicate: () => void; onInsertLeft: () => void; onInsertRight: () => void;
  onAIAutocomplete?: () => void;
  onSort?: (dir: "asc" | "desc" | null) => void;
  sortDir?: "asc" | "desc" | null;
  onFilterChange?: (operator: string, val: string) => void;
  filterValue?: string;
  filterOperator?: string;
}) {
  const t = useTranslations("document-detail");
  const COLUMN_TYPES = useColumnTypes();
  const [showFilterFlyout, setShowFilterFlyout] = useState(false);
  const [showAISubmenu, setShowAISubmenu] = useState(false);
  const [showTypeFlyout, setShowTypeFlyout] = useState(false);
  const [showEditPropFlyout, setShowEditPropFlyout] = useState(false);
  const [showSortFlyout, setShowSortFlyout] = useState(false);
  const [aiButtonRef, setAIButtonRef] = useState<HTMLButtonElement | null>(null);
  const [typeButtonRef, setTypeButtonRef] = useState<HTMLButtonElement | null>(null);
  const [filterButtonRef, setFilterButtonRef] = useState<HTMLButtonElement | null>(null);
  const [editPropButtonRef, setEditPropButtonRef] = useState<HTMLButtonElement | null>(null);
  const [sortButtonRef, setSortButtonRef] = useState<HTMLButtonElement | null>(null);
  const [draftName, setDraftName] = useState(column.name);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setTimeout(() => nameRef.current?.focus(), 50); }, []);

  const HAS_EDIT_PROPERTY = ["number", "select", "multi_select", "status", "date", "created_time", "last_edited_time", "people", "created_by", "last_edited_by", "document", "phone_number"].includes(column.type);

  const top = Math.min(anchorRect.bottom + 4, window.innerHeight - 480);
  const left = Math.min(anchorRect.left, window.innerWidth - 280);

  const currentTypeLabel = COLUMN_TYPES.find(ct => ct.value === column.type)?.label || column.type;
  const currentTypeIcon = COLUMN_TYPES.find(ct => ct.value === column.type)?.icon;

  return createPortal(
    <>
      <div className="fixed inset-0 z-[300]" onClick={e => {
        const related = (e.currentTarget as any).nextElementSibling;
        if (related?.contains(e.target as Node)) return;
        e.stopPropagation();
        onClose();
      }} />
      <div className="column-header-menu fixed z-[301] w-[260px] rounded-lg border border-border bg-card shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        data-menu-portal="true"
        style={{ top, left }} onClick={e => e.stopPropagation()}>
          <div className="space-y-0.5">
            <div className="flex items-center gap-2 p-1.5 px-3 pt-2">
              <span className="text-muted-foreground shrink-0">{currentTypeIcon || <FileText className="h-4 w-4" />}</span>
              <input ref={nameRef} value={draftName} onChange={e => setDraftName(e.target.value)}
                onKeyDown={e => { e.stopPropagation(); if (e.key === "Enter" && draftName.trim()) { onRename(draftName.trim()); onClose(); } if (e.key === "Escape") onClose(); }}
                className="w-full rounded-md border border-input bg-background px-2 py-1 text-sm font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent" />
            </div>

            <div className="border-t border-border my-1" />
            {HAS_EDIT_PROPERTY && (
              <button key="editProperty" ref={setEditPropButtonRef}
                onClick={() => setShowEditPropFlyout(v => !v)}
                onMouseEnter={() => setShowEditPropFlyout(true)}
                onMouseLeave={(e) => {
                  const related = e.relatedTarget as HTMLElement;
                  if (!related?.closest('.edit-prop-flyout')) setShowEditPropFlyout(false);
                }}
                className={cn("w-full flex items-center gap-2.5 px-3 py-1.5 text-sm hover:bg-muted/60 transition-colors group", showEditPropFlyout && "bg-muted/60")}>
                <Settings className="h-4 w-4 text-muted-foreground group-hover:text-foreground" />
                <span>{t("bountifulTable.editProperty" as any)}</span>
                <span className="ml-auto text-muted-foreground/30">›</span>
              </button>
            )}
            <button
              key="type"
              ref={setTypeButtonRef}
              onMouseEnter={() => setShowTypeFlyout(true)}
              onMouseLeave={(e) => {
                const related = e.relatedTarget as HTMLElement;
                if (!related?.closest('.type-flyout')) setShowTypeFlyout(false);
              }}
              onClick={() => setShowTypeFlyout(v => !v)}
              className={cn("w-full flex items-center gap-2.5 px-3 py-1.5 text-sm hover:bg-muted/60 transition-colors group", showTypeFlyout && "bg-muted/60")}
            >
              <RotateCw className="h-4 w-4 text-muted-foreground group-hover:text-foreground" />
              <span>{t("bountifulTable.changeType" as any)}</span>
              <span className="ml-auto text-muted-foreground/30">›</span>
            </button>
            <button
              ref={setAIButtonRef}
              onMouseEnter={() => setShowAISubmenu(true)}
              onMouseLeave={(e) => {
                const related = e.relatedTarget as HTMLElement;
                if (!related?.closest('.ai-flyout')) setShowAISubmenu(false);
              }}
              onClick={() => setShowAISubmenu(!showAISubmenu)}
              className={cn("w-full flex items-center gap-2.5 px-3 py-1.5 text-sm hover:bg-muted/60 transition-colors group", showAISubmenu && "bg-muted/60")}>
              <Wand2 className="h-4 w-4 text-muted-foreground group-hover:text-foreground" />
              <span className="truncate">{t("bountifulTable.aiAutocomplete" as any)}</span>
              <span className="ml-auto text-[9px] bg-accent/20 text-accent px-1.5 py-0.5 rounded font-bold uppercase shrink-0">{t("bountifulTable.aiBadge" as any)}</span>
              <span className="ml-auto text-muted-foreground/30">›</span>
            </button>

            <div className="border-t border-border my-1" />
            <button
              ref={setSortButtonRef}
              onMouseEnter={() => setShowSortFlyout(true)}
              onMouseLeave={(e) => {
                const related = e.relatedTarget as HTMLElement;
                if (!related?.closest('.sort-flyout')) setShowSortFlyout(false);
              }}
              onClick={() => setShowSortFlyout(v => !v)}
              className={cn("w-full flex items-center gap-2.5 px-3 py-1.5 text-sm hover:bg-muted/60 transition-colors group", (showSortFlyout || sortDir) && "bg-muted/60")}>
              <ArrowUp className="h-4 w-4 text-muted-foreground group-hover:text-foreground" />
              <span>{t("bountifulTable.sort.title" as any)}</span>
              {sortDir && <span className="ml-auto text-[9px] bg-accent/20 text-accent px-1.5 py-0.5 rounded font-bold uppercase shrink-0">{sortDir === "asc" ? t("bountifulTable.sortBarAsc" as any) : t("bountifulTable.sortBarDesc" as any)}</span>}
              <span className="ml-auto text-muted-foreground/30">›</span>
            </button>

            <div className="border-t border-border my-1" />
            <button
              ref={setFilterButtonRef}
              onMouseEnter={() => setShowFilterFlyout(true)}
              onMouseLeave={(e) => {
                const related = e.relatedTarget as HTMLElement;
                if (!related?.closest('.filter-flyout')) setShowFilterFlyout(false);
              }}
              onClick={() => setShowFilterFlyout(v => !v)}
              className={cn("w-full flex items-center gap-2.5 px-3 py-1.5 text-sm hover:bg-muted/60 transition-colors group", showFilterFlyout && "bg-muted/60")}
            >
              <Filter className="h-4 w-4 text-muted-foreground group-hover:text-foreground" /><span>{t("bountifulTable.filter" as any)}</span>
              <span className="ml-auto text-muted-foreground/30">›</span>
            </button>
            <button key="pin" onClick={() => { onUpdateColumn({ pinned: !column.pinned }); onClose(); }}
              className={cn("w-full flex items-center gap-2.5 px-3 py-1.5 text-sm hover:bg-muted/60 transition-colors group", column.pinned && "bg-accent/5 text-accent font-medium")}>
              <Pin className={cn("h-4 w-4", column.pinned ? "text-accent" : "text-muted-foreground group-hover:text-foreground")} /><span>{t("bountifulTable.pin" as any)}</span>
              {column.pinned && <span className="ml-auto text-xs">✓</span>}
            </button>
            <button key="hide" onClick={() => { onUpdateColumn({ hidden: true }); onClose(); }}
              className="w-full flex items-center gap-2.5 px-3 py-1.5 text-sm hover:bg-muted/60 transition-colors group">
              <EyeOff className="h-4 w-4 text-muted-foreground group-hover:text-foreground" /><span>{t("bountifulTable.hide" as any)}</span>
            </button>
            <button key="wrap" onClick={() => { onUpdateColumn({ wrap: !column.wrap }); onClose(); }}
              className={cn("w-full flex items-center gap-2.5 px-3 py-1.5 text-sm hover:bg-muted/60 transition-colors group", column.wrap && "bg-accent/5 text-accent font-medium")}>
              <WrapText className={cn("h-4 w-4", column.wrap ? "text-accent" : "text-muted-foreground group-hover:text-foreground")} /><span>{t("bountifulTable.wrap" as any)}</span>
              {column.wrap && <span className="ml-auto text-xs">✓</span>}
            </button>

            <div className="border-t border-border my-1" />
            <button onClick={() => { onInsertLeft(); onClose(); }}
              className="w-full flex items-center gap-2.5 px-3 py-1.5 text-sm hover:bg-muted/60 transition-colors group">
              <ArrowLeftToLine className="h-4 w-4 text-muted-foreground group-hover:text-foreground" /><span>{t("bountifulTable.insertLeft" as any)}</span>
            </button>
            <button onClick={() => { onInsertRight(); onClose(); }}
              className="w-full flex items-center gap-2.5 px-3 py-1.5 text-sm hover:bg-muted/60 transition-colors group">
              <ArrowRightToLine className="h-4 w-4 text-muted-foreground group-hover:text-foreground" /><span>{t("bountifulTable.insertRight" as any)}</span>
            </button>
            <button onClick={() => { onDuplicate(); onClose(); }}
              className="w-full flex items-center gap-2.5 px-3 py-1.5 text-sm hover:bg-muted/60 transition-colors group">
              <Copy className="h-4 w-4 text-muted-foreground group-hover:text-foreground" /><span>{t("bountifulTable.duplicateProperty" as any)}</span>
            </button>

            <div className="border-t border-border my-1" />
            <button onClick={() => { onDelete(); onClose(); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors">
              <Trash2 className="h-4 w-4" /><span>{t("bountifulTable.deleteProperty" as any)}</span>
            </button>
          </div>

        {/* Flyout Submenu for AI */}
        {showAISubmenu && aiButtonRef && (
          <AISubmenuFlyout
            anchorRect={aiButtonRef.getBoundingClientRect()}
            onClose={() => setShowAISubmenu(false)}
            onMouseEnter={() => setShowAISubmenu(true)}
            onSelect={(mode) => {
              if (mode === "basic") onAIAutocomplete?.();
              setShowAISubmenu(false);
              onClose();
            }}
          />
        )}

        {showTypeFlyout && typeButtonRef && (
          <TypeSubmenuFlyout
            anchorRect={typeButtonRef.getBoundingClientRect()}
            columnType={column.type}
            columnTypes={COLUMN_TYPES}
            onMouseEnter={() => setShowTypeFlyout(true)}
            onClose={() => setShowTypeFlyout(false)}
            onSelect={(type) => {
              onChangeType(type);
              setShowTypeFlyout(false);
            }}
          />
        )}

        {showFilterFlyout && filterButtonRef && (
          <FilterSubmenuFlyout
            anchorRect={filterButtonRef.getBoundingClientRect()}
            column={column}
            filterOperator={filterOperator}
            filterValue={filterValue}
            onFilterChange={onFilterChange}
            onMouseEnter={() => setShowFilterFlyout(true)}
            onClose={() => setShowFilterFlyout(false)}
          />
        )}

        {showSortFlyout && sortButtonRef && (
          <SortInlineFlyout
            anchorRect={sortButtonRef.getBoundingClientRect()}
            column={column}
            sortDir={sortDir}
            onSort={(dir) => { onSort?.(dir); onClose(); }}
            onMouseEnter={() => setShowSortFlyout(true)}
            onClose={() => setShowSortFlyout(false)}
          />
        )}

        {/* Flyout for Edit Property */}
        {showEditPropFlyout && (
          <EditPropertyFlyout
            column={column}
            menuTop={top}
            menuLeft={left}
            menuWidth={260}
            onClose={() => setShowEditPropFlyout(false)}
            onUpdateOptions={onUpdateOptions}
            onUpdateColumn={onUpdateColumn}
            onAIAutocomplete={onAIAutocomplete}
            onMainClose={onClose}
          />
        )}
      </div>
    </>,
    document.body
  );
}

const PHONE_COUNTRIES = [
  { code: "AR", name: "Argentina", dial: "+54", flag: "🇦🇷" },
  { code: "AU", name: "Australia", dial: "+61", flag: "🇦🇺" },
  { code: "AT", name: "Austria", dial: "+43", flag: "🇦🇹" },
  { code: "BE", name: "Belgium", dial: "+32", flag: "🇧🇪" },
  { code: "BO", name: "Bolivia", dial: "+591", flag: "🇧🇴" },
  { code: "BR", name: "Brazil", dial: "+55", flag: "🇧🇷" },
  { code: "CA", name: "Canada", dial: "+1", flag: "🇨🇦" },
  { code: "CL", name: "Chile", dial: "+56", flag: "🇨🇱" },
  { code: "CN", name: "China", dial: "+86", flag: "🇨🇳" },
  { code: "CO", name: "Colombia", dial: "+57", flag: "🇨🇴" },
  { code: "CR", name: "Costa Rica", dial: "+506", flag: "🇨🇷" },
  { code: "HR", name: "Croatia", dial: "+385", flag: "🇭🇷" },
  { code: "CZ", name: "Czech Republic", dial: "+420", flag: "🇨🇿" },
  { code: "DK", name: "Denmark", dial: "+45", flag: "🇩🇰" },
  { code: "DO", name: "Dominican Republic", dial: "+1", flag: "🇩🇴" },
  { code: "EC", name: "Ecuador", dial: "+593", flag: "🇪🇨" },
  { code: "EG", name: "Egypt", dial: "+20", flag: "🇪🇬" },
  { code: "SV", name: "El Salvador", dial: "+503", flag: "🇸🇻" },
  { code: "FI", name: "Finland", dial: "+358", flag: "🇫🇮" },
  { code: "FR", name: "France", dial: "+33", flag: "🇫🇷" },
  { code: "DE", name: "Germany", dial: "+49", flag: "🇩🇪" },
  { code: "GH", name: "Ghana", dial: "+233", flag: "🇬🇭" },
  { code: "GR", name: "Greece", dial: "+30", flag: "🇬🇷" },
  { code: "GT", name: "Guatemala", dial: "+502", flag: "🇬🇹" },
  { code: "HN", name: "Honduras", dial: "+504", flag: "🇭🇳" },
  { code: "HK", name: "Hong Kong", dial: "+852", flag: "🇭🇰" },
  { code: "HU", name: "Hungary", dial: "+36", flag: "🇭🇺" },
  { code: "IN", name: "India", dial: "+91", flag: "🇮🇳" },
  { code: "ID", name: "Indonesia", dial: "+62", flag: "🇮🇩" },
  { code: "IE", name: "Ireland", dial: "+353", flag: "🇮🇪" },
  { code: "IL", name: "Israel", dial: "+972", flag: "🇮🇱" },
  { code: "IT", name: "Italy", dial: "+39", flag: "🇮🇹" },
  { code: "JP", name: "Japan", dial: "+81", flag: "🇯🇵" },
  { code: "JO", name: "Jordan", dial: "+962", flag: "🇯🇴" },
  { code: "KE", name: "Kenya", dial: "+254", flag: "🇰🇪" },
  { code: "KR", name: "South Korea", dial: "+82", flag: "🇰🇷" },
  { code: "KW", name: "Kuwait", dial: "+965", flag: "🇰🇼" },
  { code: "LB", name: "Lebanon", dial: "+961", flag: "🇱🇧" },
  { code: "MY", name: "Malaysia", dial: "+60", flag: "🇲🇾" },
  { code: "MX", name: "Mexico", dial: "+52", flag: "🇲🇽" },
  { code: "MA", name: "Morocco", dial: "+212", flag: "🇲🇦" },
  { code: "NL", name: "Netherlands", dial: "+31", flag: "🇳🇱" },
  { code: "NZ", name: "New Zealand", dial: "+64", flag: "🇳🇿" },
  { code: "NI", name: "Nicaragua", dial: "+505", flag: "🇳🇮" },
  { code: "NG", name: "Nigeria", dial: "+234", flag: "🇳🇬" },
  { code: "NO", name: "Norway", dial: "+47", flag: "🇳🇴" },
  { code: "PK", name: "Pakistan", dial: "+92", flag: "🇵🇰" },
  { code: "PA", name: "Panama", dial: "+507", flag: "🇵🇦" },
  { code: "PY", name: "Paraguay", dial: "+595", flag: "🇵🇾" },
  { code: "PE", name: "Peru", dial: "+51", flag: "🇵🇪" },
  { code: "PH", name: "Philippines", dial: "+63", flag: "🇵🇭" },
  { code: "PL", name: "Poland", dial: "+48", flag: "🇵🇱" },
  { code: "PT", name: "Portugal", dial: "+351", flag: "🇵🇹" },
  { code: "QA", name: "Qatar", dial: "+974", flag: "🇶🇦" },
  { code: "RO", name: "Romania", dial: "+40", flag: "🇷🇴" },
  { code: "RU", name: "Russia", dial: "+7", flag: "🇷🇺" },
  { code: "SA", name: "Saudi Arabia", dial: "+966", flag: "🇸🇦" },
  { code: "SG", name: "Singapore", dial: "+65", flag: "🇸🇬" },
  { code: "ZA", name: "South Africa", dial: "+27", flag: "🇿🇦" },
  { code: "ES", name: "Spain", dial: "+34", flag: "🇪🇸" },
  { code: "SE", name: "Sweden", dial: "+46", flag: "🇸🇪" },
  { code: "CH", name: "Switzerland", dial: "+41", flag: "🇨🇭" },
  { code: "TW", name: "Taiwan", dial: "+886", flag: "🇹🇼" },
  { code: "TH", name: "Thailand", dial: "+66", flag: "🇹🇭" },
  { code: "TR", name: "Turkey", dial: "+90", flag: "🇹🇷" },
  { code: "AE", name: "UAE", dial: "+971", flag: "🇦🇪" },
  { code: "UA", name: "Ukraine", dial: "+380", flag: "🇺🇦" },
  { code: "GB", name: "United Kingdom", dial: "+44", flag: "🇬🇧" },
  { code: "US", name: "United States", dial: "+1", flag: "🇺🇸" },
  { code: "UY", name: "Uruguay", dial: "+598", flag: "🇺🇾" },
  { code: "VE", name: "Venezuela", dial: "+58", flag: "🇻🇪" },
  { code: "VN", name: "Vietnam", dial: "+84", flag: "🇻🇳" },
];

const SWATCH_COLORS: Record<string, string> = {
  blue: "bg-blue-500", purple: "bg-purple-500", pink: "bg-pink-500",
  red: "bg-red-500", orange: "bg-orange-500", yellow: "bg-yellow-400",
  green: "bg-green-500", teal: "bg-teal-500", gray: "bg-gray-400", brown: "bg-amber-700",
};

function EditPropertyFlyout({
  column, menuTop, menuLeft, menuWidth, onClose, onUpdateOptions, onUpdateColumn, onAIAutocomplete, onMainClose,
}: {
  column: BountifulColumn;
  menuTop: number; menuLeft: number; menuWidth: number;
  onClose: () => void;
  onUpdateOptions: (options: { id: string; name: string; color: string; isDefault?: boolean }[]) => void;
  onUpdateColumn: (updates: Partial<BountifulColumn>) => void;
  onAIAutocomplete?: () => void;
  onMainClose: () => void;
}) {
  const t = useTranslations("document-detail");
  const [subTab, setSubTab] = useState<"main" | "numberFormat" | "decimalPlaces" | "editOption" | "phoneCountry">("main");
  const [editingOption, setEditingOption] = useState<{ id: string; name: string; color: string; isDefault?: boolean } | null>(null);
  const [currencyFilter, setCurrencyFilter] = useState("");
  const [phoneSearch, setPhoneSearch] = useState("");
  const [creatingInGroup, setCreatingInGroup] = useState<string | null>(null);
  const [newInlineOptName, setNewInlineOptName] = useState("");
  const [dragOptId, setDragOptId] = useState<string | null>(null);
  const [dragOverGroup, setDragOverGroup] = useState<string | null>(null);
  const newOptInputRef = useRef<HTMLInputElement>(null);

  const options = column.options || [];
  const statusGroups = column.statusGroups || [];
  const currencies = ["none", "percent", "usd", "aud", "cad", "sgd", "eur", "gbp", "jpy", "rub", "inr", "krw", "cny", "brl", "pen", "numberWithDecimals"];
  const filteredCurrencies = currencies.filter(c => t(`bountifulTable.numberFormat.${c}` as any).toLowerCase().includes(currencyFilter.toLowerCase()));
  const filteredCountries = PHONE_COUNTRIES.filter(c =>
    c.name.toLowerCase().includes(phoneSearch.toLowerCase()) ||
    c.dial.includes(phoneSearch) ||
    c.code.toLowerCase().includes(phoneSearch.toLowerCase())
  );
  const currentCountry = PHONE_COUNTRIES.find(c => c.code === column.phoneFormat?.country);

  const flyWidth = 280;
  const spaceRight = window.innerWidth - (menuLeft + menuWidth) - 8;
  const flyLeft = spaceRight >= flyWidth ? menuLeft + menuWidth - 1 : menuLeft - flyWidth + 1;
  const flyTop = Math.min(menuTop, window.innerHeight - 520);

  useEffect(() => {
    if (creatingInGroup) setTimeout(() => newOptInputRef.current?.focus(), 50);
  }, [creatingInGroup]);

  const startCreating = (groupName: string) => {
    setCreatingInGroup(groupName);
    setNewInlineOptName("");
  };

  const commitNewOpt = (groupName: string) => {
    const name = newInlineOptName.trim();
    if (!name) { setCreatingInGroup(null); return; }
    const newId = `opt-${Date.now()}`;
    const newOpt = { id: newId, name, color: "blue" };
    onUpdateOptions([...options, newOpt]);
    if (groupName !== "__flat__" && column.type === "status") {
      const newGroups = statusGroups.map(g =>
        g.name === groupName ? { ...g, optionIds: [...g.optionIds, newId] } : g
      );
      onUpdateColumn({ statusGroups: newGroups });
    }
    setNewInlineOptName("");
    setTimeout(() => newOptInputRef.current?.focus(), 30);
  };

  const handleDropToGroup = (targetGroupName: string) => {
    if (!dragOptId) return;
    let sourceGroupName: string | null = null;
    for (const g of statusGroups) {
      const found = g.optionIds.some(ref => {
        const resolved = options.find(o => o.id === ref || o.name === ref || o.name.toLowerCase().trim() === String(ref).toLowerCase().trim());
        return resolved?.id === dragOptId || ref === dragOptId;
      });
      if (found) { sourceGroupName = g.name; break; }
    }
    // Allow drop even from unassigned (sourceGroupName === null)
    if (sourceGroupName === targetGroupName) { setDragOptId(null); setDragOverGroup(null); return; }
    const newGroups = statusGroups.map(g => {
      // Remove from old group (if assigned)
      if (sourceGroupName && g.name === sourceGroupName) {
        return { ...g, optionIds: g.optionIds.filter(ref => {
          const resolved = options.find(o => o.id === ref || o.name === ref);
          return resolved?.id !== dragOptId && ref !== dragOptId;
        })};
      }
      // Add to target group
      if (g.name === targetGroupName) return { ...g, optionIds: [...g.optionIds, dragOptId] };
      return g;
    });
    onUpdateColumn({ statusGroups: newGroups });
    setDragOptId(null);
    setDragOverGroup(null);
  };

  const updateOption = (id: string, updates: Partial<{ name: string; color: string; isDefault: boolean }>) => {
    const no = options.map(o => o.id === id ? { ...o, ...(updates as any) } : (updates.isDefault ? { ...o, isDefault: false } : o));
    onUpdateOptions(no);
    setEditingOption(no.find(o => o.id === id) || null);
  };

  const removeOption = (id: string) => {
    onUpdateOptions(options.filter(o => o.id !== id));
    onUpdateColumn({ statusGroups: statusGroups.map(g => ({ ...g, optionIds: g.optionIds.filter(oid => oid !== id) })) });
    setSubTab("main");
  };

  function renderOptionItem(opt: { id: string; name: string; color: string; isDefault?: boolean }) {
    const openEdit = (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      setEditingOption(opt);
      setSubTab("editOption");
    };
    return (
      <div key={opt.id}
        draggable={column.type === "status"}
        onDragStart={e => { e.stopPropagation(); setDragOptId(opt.id); }}
        onDragEnd={() => { setDragOptId(null); setDragOverGroup(null); }}
        className={cn("flex items-center justify-between px-2 py-1.5 rounded-md group transition-all select-none",
          dragOptId === opt.id ? "opacity-40 bg-muted/30" : "hover:bg-muted/60")}>
        <div className="flex items-center gap-2 min-w-0 flex-1 cursor-pointer" onClick={openEdit}>
          <GripVertical className={cn("h-3 w-3 shrink-0 transition-colors",
            column.type === "status" ? "text-muted-foreground/30 group-hover:text-muted-foreground/60 cursor-grab" : "text-muted-foreground/10")} />
          <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-semibold truncate max-w-[160px]", getPillClass(opt.color))}>
            {opt.name}
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {opt.isDefault && <span className="text-[8px] font-black text-muted-foreground/40 uppercase">DEF</span>}
          <button
            onClick={openEdit}
            className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-muted text-muted-foreground/60 hover:text-foreground transition-all">
            <Edit3 className="h-3 w-3" />
          </button>
        </div>
      </div>
    );
  }

  return createPortal(
    <div
      onMouseLeave={(e) => {
        const related = e.relatedTarget as HTMLElement;
        if (!related?.closest('.edit-prop-flyout') && !related?.closest('.column-header-menu')) onClose();
      }}
      className="edit-prop-flyout fixed z-[302] rounded-lg border border-border bg-card shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
      style={{ top: flyTop, left: flyLeft, width: flyWidth }}
      onClick={e => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
        {subTab !== "main" ? (
          <button onClick={() => setSubTab("main")} className="text-muted-foreground hover:text-foreground p-1 rounded-md hover:bg-muted">
            <ArrowLeftToLine className="h-3.5 w-3.5 rotate-90" />
          </button>
        ) : (
          <Settings className="h-3.5 w-3.5 text-muted-foreground/60" />
        )}
        <span className="text-xs font-bold uppercase tracking-tight text-muted-foreground truncate">
          {subTab === "numberFormat" ? t("bountifulTable.numberFormat.title" as any)
            : subTab === "decimalPlaces" ? t("bountifulTable.numberFormat.decimals" as any)
            : subTab === "editOption" ? (editingOption?.name || t("bountifulTable.newOption" as any))
            : subTab === "phoneCountry" ? t("bountifulTable.phoneFormat.title" as any)
            : t("bountifulTable.editProperty" as any)}
        </span>
      </div>

      {/* Number type */}
      {subTab === "main" && column.type === "number" && (
        <div className="p-2 space-y-4">
          <div className="space-y-3">
            <div className="space-y-1">
              <button onClick={() => setSubTab("numberFormat")}
                className="w-full flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-muted text-sm transition-colors">
                <span className="text-muted-foreground">{t("bountifulTable.numberFormat.title" as any)}</span>
                <div className="flex items-center gap-1">
                  <span className="text-[11px] text-muted-foreground/60">{t(`bountifulTable.numberFormat.${column.numberFormat?.currency || "none"}` as any)}</span>
                  <span className="text-muted-foreground/30">›</span>
                </div>
              </button>
              <button onClick={() => setSubTab("decimalPlaces")}
                className="w-full flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-muted text-sm transition-colors">
                <span className="text-muted-foreground">{t("bountifulTable.numberFormat.decimals" as any)}</span>
                <div className="flex items-center gap-1">
                  <span className="text-[11px] text-muted-foreground/60">{column.numberFormat?.decimals ?? t("bountifulTable.numberFormat.automatic" as any)}</span>
                  <span className="text-muted-foreground/30">›</span>
                </div>
              </button>
            </div>
            <div className="space-y-2.5 pt-1 border-t border-border">
              <label className="text-[11px] font-semibold text-muted-foreground px-2">{t("bountifulTable.numberFormat.displayAs" as any)}</label>
              <div className="flex gap-2 px-1">
                {[
                  { id: "number", label: "bountifulTable.numberFormat.number", icon: <div className="text-[18px] font-bold text-accent">42</div> },
                  { id: "bar", label: "bountifulTable.numberFormat.bar", icon: <div className="h-1.5 w-12 bg-muted rounded-full relative overflow-hidden"><div className="absolute inset-y-0 left-0 w-[60%] bg-muted-foreground/50 rounded-full" /></div> },
                  { id: "ring", label: "bountifulTable.numberFormat.ring", icon: <div className="h-5 w-5 rounded-full border-2 border-muted relative"><div className="absolute inset-0 rounded-full border-2 border-muted-foreground/50 border-t-transparent -rotate-45" /></div> },
                ].map(mode => (
                  <button key={mode.id} onClick={() => onUpdateColumn({ numberFormat: { ...column.numberFormat, display: mode.id as any } })}
                    className={cn("flex-1 flex flex-col items-center justify-center gap-2 p-2.5 rounded-lg border transition-all",
                      (column.numberFormat?.display || "number") === mode.id ? "bg-accent/5 border-accent ring-1 ring-accent" : "border-border hover:border-muted-foreground/20")}>
                    <div className={cn("flex items-center justify-center h-8", (column.numberFormat?.display || "number") === mode.id ? "text-accent" : "text-muted-foreground/40")}>
                      {mode.icon}
                    </div>
                    <span className={cn("text-[10px] font-medium", (column.numberFormat?.display || "number") === mode.id ? "text-accent" : "text-muted-foreground/40")}>{t(mode.label as any)}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="p-2 border-t border-border">
            <button onClick={() => { onAIAutocomplete?.(); onMainClose(); }}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-accent/10 text-accent text-xs font-medium transition-colors">
              <Sparkles className="h-3.5 w-3.5" />
              <span>{t("bountifulTable.generateWithAI" as any)}</span>
            </button>
          </div>
        </div>
      )}

      {/* Select / Multi-select / Status type */}
      {subTab === "main" && (column.type === "select" || column.type === "multi_select" || column.type === "status") && (
        <div className="flex flex-col" style={{ maxHeight: 460 }}>
          <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-2">
            {column.type === "status" && statusGroups.length > 0 ? (
              <>
                {statusGroups.map((group) => {
                  const groupOpts = group.optionIds
                    .map(optId => options.find(o =>
                      o.id === optId || o.name === optId ||
                      o.name.toLowerCase().trim() === String(optId).toLowerCase().trim()
                    ))
                    .filter(Boolean) as { id: string; name: string; color: string; isDefault?: boolean }[];
                  const isDragTarget = dragOverGroup === group.name && !!dragOptId;
                  return (
                    <div key={group.name}
                      onDragOver={e => { e.preventDefault(); setDragOverGroup(group.name); }}
                      onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverGroup(null); }}
                      onDrop={() => handleDropToGroup(group.name)}
                      className={cn("rounded-lg p-1.5 transition-colors border",
                        isDragTarget ? "bg-accent/10 border-accent/40" : "border-transparent")}>
                      <div className="flex items-center justify-between px-1 mb-1">
                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{group.name}</span>
                        <button onClick={() => startCreating(group.name)}
                          className="text-muted-foreground hover:text-foreground p-0.5 rounded hover:bg-muted transition-colors">
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>
                      <div className="space-y-0.5">
                        {groupOpts.length > 0
                          ? groupOpts.map(opt => renderOptionItem(opt))
                          : <p className="px-2 py-1 text-[10px] text-muted-foreground/30 italic">{t("bountifulTable.empty" as any)}</p>
                        }
                        {creatingInGroup === group.name && (
                          <div className="flex items-center gap-1.5 px-2 py-1">
                            <input ref={newOptInputRef} value={newInlineOptName}
                              onChange={e => setNewInlineOptName(e.target.value)}
                              onKeyDown={e => { if (e.key === "Enter") commitNewOpt(group.name); if (e.key === "Escape") { e.stopPropagation(); setCreatingInGroup(null); } }}
                              onBlur={() => { if (!newInlineOptName.trim()) setCreatingInGroup(null); }}
                              placeholder={t("bountifulTable.newOption" as any)}
                              className="flex-1 bg-muted/60 rounded px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-accent border border-border/50" />
                            <button onClick={() => commitNewOpt(group.name)} className="text-accent p-0.5 hover:text-accent/70"><Plus className="h-3 w-3" /></button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
                {(() => {
                  const allGroupedRefs = new Set(statusGroups.flatMap(g => g.optionIds));
                  const unassigned = options.filter(o => !allGroupedRefs.has(o.id) && !allGroupedRefs.has(o.name));
                  if (unassigned.length === 0) return null;
                  return (
                    <div className="space-y-0.5 px-1">
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider px-2">—</span>
                      {unassigned.map(opt => renderOptionItem(opt))}
                    </div>
                  );
                })()}
              </>
            ) : (
              <div className="space-y-1">
                <div className="flex items-center justify-between px-2 mb-1">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{t("bountifulTable.options" as any)}</span>
                  <button onClick={() => startCreating("__flat__")}
                    className="text-muted-foreground hover:text-foreground p-0.5 rounded hover:bg-muted transition-colors">
                    <Plus className="h-3 w-3" />
                  </button>
                </div>
                <div className="space-y-0.5">
                  {options.map(opt => renderOptionItem(opt))}
                  {creatingInGroup === "__flat__" && (
                    <div className="flex items-center gap-1.5 px-2 py-1">
                      <input ref={newOptInputRef} value={newInlineOptName}
                        onChange={e => setNewInlineOptName(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") commitNewOpt("__flat__"); if (e.key === "Escape") { e.stopPropagation(); setCreatingInGroup(null); } }}
                        onBlur={() => { if (!newInlineOptName.trim()) setCreatingInGroup(null); }}
                        placeholder={t("bountifulTable.newOption" as any)}
                        className="flex-1 bg-muted/60 rounded px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-accent border border-border/50" />
                      <button onClick={() => commitNewOpt("__flat__")} className="text-accent p-0.5 hover:text-accent/70"><Plus className="h-3 w-3" /></button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          <div className="p-2 border-t border-border shrink-0">
            <button onClick={() => { onAIAutocomplete?.(); onMainClose(); }}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-accent/10 text-accent text-xs font-medium transition-colors">
              <Sparkles className="h-3.5 w-3.5" />
              <span>{t("bountifulTable.generateWithAI" as any)}</span>
            </button>
          </div>
        </div>
      )}

      {/* Date type */}
      {subTab === "main" && (column.type === "date" || column.type === "created_time" || column.type === "last_edited_time") && (
        <div className="p-3 space-y-3">
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-muted-foreground px-1">{t("bountifulTable.dateFormat.title" as any)}</label>
            {(["friendly", "relative", "short", "iso"] as const).map(fmt => (
              <button key={fmt} onClick={() => onUpdateColumn({ dateFormat: { ...column.dateFormat, format: fmt } })}
                className={cn("w-full flex items-center justify-between px-3 py-1.5 rounded-md text-xs transition-colors",
                  (column.dateFormat?.format || "friendly") === fmt ? "bg-accent/15 text-accent font-medium" : "hover:bg-muted")}>
                <span>{t(`bountifulTable.dateFormat.${fmt}` as any)}</span>
                {(column.dateFormat?.format || "friendly") === fmt && <span>✓</span>}
              </button>
            ))}
          </div>
          <div className="border-t border-border pt-2">
            <button onClick={() => onUpdateColumn({ dateFormat: { ...column.dateFormat, includeTime: !column.dateFormat?.includeTime } })}
              className="w-full flex items-center justify-between px-3 py-1.5 rounded-md text-xs hover:bg-muted transition-colors">
              <span>{t("bountifulTable.dateFormat.includeTime" as any)}</span>
              <div className={cn("w-7 h-4 rounded-full transition-colors relative", column.dateFormat?.includeTime ? "bg-accent" : "bg-muted-foreground/30")}>
                <div className={cn("absolute top-0.5 h-3 w-3 rounded-full bg-card transition-transform", column.dateFormat?.includeTime ? "translate-x-3.5" : "translate-x-0.5")} />
              </div>
            </button>
          </div>
        </div>
      )}

      {/* People / Created by / Last edited by */}
      {subTab === "main" && (column.type === "people" || column.type === "created_by" || column.type === "last_edited_by") && (
        <div className="p-3 space-y-1.5">
          <label className="text-[11px] font-semibold text-muted-foreground px-1 block mb-2">{t("bountifulTable.personFormat.title" as any)}</label>
          {(["name", "email", "alias"] as const).map(fmt => (
            <button key={fmt} onClick={() => onUpdateColumn({ personFormat: fmt })}
              className={cn("w-full flex items-center justify-between px-3 py-1.5 rounded-md text-xs transition-colors",
                (column.personFormat || "name") === fmt ? "bg-accent/15 text-accent font-medium" : "hover:bg-muted")}>
              <span>{t(`bountifulTable.personFormat.${fmt}` as any)}</span>
              {(column.personFormat || "name") === fmt && <span>✓</span>}
            </button>
          ))}
        </div>
      )}

      {/* Document type */}
      {subTab === "main" && column.type === "document" && (
        <div className="p-3 space-y-1.5">
          <label className="text-[11px] font-semibold text-muted-foreground px-1 block mb-2">{t("bountifulTable.documentFormat.title" as any)}</label>
          {(["name", "full"] as const).map(fmt => (
            <button key={fmt} onClick={() => onUpdateColumn({ documentFormat: fmt })}
              className={cn("w-full flex items-center justify-between px-3 py-1.5 rounded-md text-xs transition-colors",
                (column.documentFormat || "name") === fmt ? "bg-accent/15 text-accent font-medium" : "hover:bg-muted")}>
              <span>{t(`bountifulTable.documentFormat.${fmt}` as any)}</span>
              {(column.documentFormat || "name") === fmt && <span>✓</span>}
            </button>
          ))}
        </div>
      )}

      {/* Phone number type */}
      {subTab === "main" && column.type === "phone_number" && (
        <div className="p-3 space-y-1.5">
          <label className="text-[11px] font-semibold text-muted-foreground px-1 block mb-2">{t("bountifulTable.phoneFormat.title" as any)}</label>
          <button onClick={() => setSubTab("phoneCountry")}
            className="w-full flex items-center justify-between px-3 py-1.5 rounded-md text-xs hover:bg-muted transition-colors">
            <span className="text-muted-foreground">{t("bountifulTable.phoneFormat.country" as any)}</span>
            <div className="flex items-center gap-1">
              <span className="text-[11px] text-muted-foreground/60">
                {currentCountry ? `${currentCountry.flag} ${currentCountry.name} (${currentCountry.dial})` : t("bountifulTable.phoneFormat.noCountry" as any)}
              </span>
              <span className="text-muted-foreground/30">›</span>
            </div>
          </button>
        </div>
      )}

      {/* Number format sub-tab */}
      {subTab === "numberFormat" && (
        <div className="flex flex-col" style={{ maxHeight: 360 }}>
          <div className="p-1.5 border-b border-border">
            <input value={currencyFilter} onChange={e => setCurrencyFilter(e.target.value)}
              placeholder={t("bountifulTable.numberFormat.searchPlaceholder" as any)}
              className="w-full bg-transparent border-none outline-none text-xs px-1" autoFocus />
          </div>
          <div className="flex-1 overflow-y-auto p-1 py-1.5">
            {filteredCurrencies.map((cur: string) => (
              <button key={cur} onClick={() => {
                const updates: any = { currency: cur };
                if (cur === "numberWithDecimals") { updates.currency = "none"; updates.decimals = 2; }
                onUpdateColumn({ numberFormat: { ...column.numberFormat, ...updates } });
                setSubTab("main");
              }}
                className={cn("w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs transition-colors",
                  (column.numberFormat?.currency || "none") === cur ? "bg-accent/15 text-accent font-medium" : "hover:bg-muted")}>
                <span>{t(`bountifulTable.numberFormat.${cur}` as any)}</span>
                {(column.numberFormat?.currency || "none") === cur && <span className="text-xs">✓</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Decimal places sub-tab */}
      {subTab === "decimalPlaces" && (
        <div className="p-1 py-1.5">
          {[undefined, 0, 1, 2, 3, 4].map(d => (
            <button key={String(d)} onClick={() => { onUpdateColumn({ numberFormat: { ...column.numberFormat, decimals: d } }); setSubTab("main"); }}
              className={cn("w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-sm transition-colors",
                column.numberFormat?.decimals === d ? "bg-accent/15 text-accent" : "hover:bg-muted")}>
              <span>{d === undefined ? t("bountifulTable.numberFormat.automatic" as any) : d}</span>
              {column.numberFormat?.decimals === d && <span className="text-xs">✓</span>}
            </button>
          ))}
        </div>
      )}

      {/* Phone country sub-tab */}
      {subTab === "phoneCountry" && (
        <div className="flex flex-col" style={{ maxHeight: 380 }}>
          <div className="p-1.5 border-b border-border">
            <input value={phoneSearch} onChange={e => setPhoneSearch(e.target.value)}
              placeholder={t("bountifulTable.phoneFormat.searchPlaceholder" as any)}
              className="w-full bg-transparent border-none outline-none text-xs px-1" autoFocus />
          </div>
          <div className="flex-1 overflow-y-auto p-1 py-1.5">
            <button onClick={() => { onUpdateColumn({ phoneFormat: { country: undefined } }); setSubTab("main"); }}
              className={cn("w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs transition-colors",
                !column.phoneFormat?.country ? "bg-accent/15 text-accent font-medium" : "hover:bg-muted")}>
              <span>{t("bountifulTable.phoneFormat.noCountry" as any)}</span>
              {!column.phoneFormat?.country && <span>✓</span>}
            </button>
            {filteredCountries.map(c => (
              <button key={c.code} onClick={() => { onUpdateColumn({ phoneFormat: { country: c.code } }); setSubTab("main"); }}
                className={cn("w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs transition-colors",
                  column.phoneFormat?.country === c.code ? "bg-accent/15 text-accent font-medium" : "hover:bg-muted")}>
                <span className="text-sm">{c.flag}</span>
                <span className="flex-1 text-left truncate">{c.name}</span>
                <span className="text-muted-foreground/60 text-[11px] shrink-0">{c.dial}</span>
                {column.phoneFormat?.country === c.code && <span className="text-accent shrink-0">✓</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Edit option sub-tab — vivid swatches */}
      {subTab === "editOption" && editingOption && (
        <div className="p-3 space-y-3">
          <input value={editingOption.name} onChange={e => updateOption(editingOption.id, { name: e.target.value })}
            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent" autoFocus />
          <div className="flex justify-center py-0.5">
            <span className={cn("px-3 py-1 rounded-full text-xs font-semibold", getPillClass(editingOption.color))}>
              {editingOption.name || "…"}
            </span>
          </div>
          <div className="grid grid-cols-5 gap-2 px-1">
            {Object.entries(SWATCH_COLORS).map(([c, cls]) => (
              <button key={c} onClick={() => updateOption(editingOption.id, { color: c })}
                className={cn("h-6 w-full rounded-md transition-all", cls,
                  editingOption.color === c
                    ? "ring-2 ring-offset-2 ring-foreground/40 scale-110"
                    : "opacity-75 hover:opacity-100 hover:scale-105")} />
            ))}
          </div>
          {column.type === "select" && (
            <button onClick={() => updateOption(editingOption.id, { isDefault: !editingOption.isDefault })}
              className={cn("w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-colors",
                editingOption.isDefault ? "bg-accent/15 text-accent font-medium" : "hover:bg-muted text-muted-foreground")}>
              <span>{editingOption.isDefault ? "✓ " : ""}{t("bountifulTable.setDefault" as any)}</span>
            </button>
          )}
          <button onClick={() => removeOption(editingOption.id)}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-destructive/70 hover:bg-destructive/10 hover:text-destructive transition-colors">
            <Trash2 className="h-3.5 w-3.5" />
            <span>{t("bountifulTable.deleteProperty" as any)}</span>
          </button>
        </div>
      )}
    </div>,
    document.body
  );
}

function AISubmenuFlyout({
  anchorRect,
  onClose,
  onSelect,
  onMouseEnter
}: {
  anchorRect: DOMRect;
  onClose: () => void;
  onSelect: (mode: "basic" | "agent") => void;
  onMouseEnter: () => void;
}) {
  const t = useTranslations("document-detail");
  // Position to the right if space allows, otherwise left
  const spaceRight = window.innerWidth - anchorRect.right;
  const showOnRight = spaceRight > 300;

  const top = Math.min(anchorRect.top - 8, window.innerHeight - 200);
  const left = showOnRight ? anchorRect.right - 1 : anchorRect.left - 279; // -1 to bridge gap

  return (
    <div
      onMouseEnter={onMouseEnter}
      onMouseLeave={onClose}
      className="ai-flyout fixed z-[302] w-[280px] rounded-lg border border-border bg-card shadow-2xl p-1 animate-in fade-in zoom-in-95 slide-in-from-left-1 duration-150"
      style={{ top, left }}
    >
      <div className="px-2 py-1.5 mb-1 border-b border-border/40">
        <span className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-wider flex items-center gap-2">
          <Wand2 className="h-3 w-3" />
          {t("bountifulTable.aiAutocomplete" as any)}
        </span>
      </div>

      <button onClick={() => onSelect("basic")}
        className="w-full flex items-start gap-3 p-2.5 rounded-md hover:bg-muted/60 transition-all text-left group">
        <div className="mt-0.5 h-8 w-8 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
          <Wand2 className="h-5 w-5 text-accent" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold">{t("bountifulTable.aiBasic" as any)}</div>
          <div className="text-[11px] text-muted-foreground leading-snug">{t("bountifulTable.aiBasicDesc" as any)}</div>
        </div>
      </button>

      <button disabled className="w-full flex items-start gap-3 p-2.5 rounded-md hover:bg-muted/60 transition-all text-left group opacity-80 cursor-default">
        <div className="mt-0.5 h-8 w-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
          <Sparkles className="h-5 w-5 text-indigo-500" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">{t("bountifulTable.aiAgent" as any)}</span>
            <span className="text-[10px] bg-indigo-500 text-white px-1.5 rounded-full font-bold uppercase tracking-tighter">{t("bountifulTable.aiAgentBadge" as any)}</span>
          </div>
          <div className="text-[11px] text-muted-foreground leading-snug">{t("bountifulTable.aiAgentDesc" as any)}</div>
        </div>
      </button>
    </div>
  );
}

function TypeSubmenuFlyout({
  anchorRect,
  columnType,
  columnTypes,
  onClose,
  onMouseEnter,
  onSelect,
}: {
  anchorRect: DOMRect;
  columnType: string;
  columnTypes: { value: string; label: string; icon: React.ReactNode }[];
  onClose: () => void;
  onMouseEnter: () => void;
  onSelect: (type: string) => void;
}) {
  const t = useTranslations("document-detail");
  const spaceRight = window.innerWidth - anchorRect.right;
  const showOnRight = spaceRight > 300;
  const top = Math.min(anchorRect.top - 8, window.innerHeight - 420);
  const left = showOnRight ? anchorRect.right - 1 : anchorRect.left - 279;

  return (
    <div
      onMouseEnter={onMouseEnter}
      onMouseLeave={onClose}
      className="type-flyout fixed z-[302] w-[280px] rounded-lg border border-border bg-card shadow-2xl p-1 animate-in fade-in zoom-in-95 slide-in-from-left-1 duration-150"
      style={{ top, left }}
    >
      <div className="px-2 py-1.5 mb-1 border-b border-border/40">
        <span className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-wider flex items-center gap-2">
          <RotateCw className="h-3 w-3" />
          {t("bountifulTable.changeType" as any)}
        </span>
      </div>

      <div className="max-h-[330px] overflow-y-auto">
        {columnTypes.map((ct) => (
          <button
            key={ct.value}
            onClick={() => onSelect(ct.value)}
            className={cn(
              "w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm transition-colors",
              columnType === ct.value ? "bg-accent/15 text-accent" : "hover:bg-muted/60"
            )}
          >
            {ct.icon}
            <span className="truncate">{ct.label}</span>
            {columnType === ct.value && <span className="ml-auto text-accent text-xs">✓</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

function SortInlineFlyout({
  anchorRect, column, sortDir, onSort, onClose, onMouseEnter,
}: {
  anchorRect: DOMRect;
  column: BountifulColumn;
  sortDir?: "asc" | "desc" | null;
  onSort: (dir: "asc" | "desc" | null) => void;
  onClose: () => void;
  onMouseEnter: () => void;
}) {
  const t = useTranslations("document-detail");
  const spaceRight = window.innerWidth - anchorRect.right;
  const showOnRight = spaceRight > 260;
  const top = Math.min(anchorRect.top - 8, window.innerHeight - 200);
  const left = showOnRight ? anchorRect.right - 1 : anchorRect.left - 259;

  const ascLabel = column.type === "number" ? t("bountifulTable.sort.numberAsc" as any)
    : column.type === "date" ? t("bountifulTable.sort.dateAsc" as any)
    : t("bountifulTable.sort.asc" as any);
  const descLabel = column.type === "number" ? t("bountifulTable.sort.numberDesc" as any)
    : column.type === "date" ? t("bountifulTable.sort.dateDesc" as any)
    : t("bountifulTable.sort.desc" as any);

  return (
    <div
      onMouseEnter={onMouseEnter}
      onMouseLeave={onClose}
      className="sort-flyout fixed z-[302] w-[260px] rounded-lg border border-border bg-card shadow-2xl p-1 animate-in fade-in zoom-in-95 slide-in-from-left-1 duration-150"
      style={{ top, left }}
    >
      <div className="px-2 py-1.5 mb-1 border-b border-border/40">
        <span className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-wider flex items-center gap-2">
          <ArrowUp className="h-3 w-3" />
          {t("bountifulTable.sort.title" as any)}
        </span>
      </div>
      <button onClick={() => onSort("asc")}
        className={cn("w-full flex items-center gap-2.5 px-3 py-1.5 rounded-md text-sm transition-colors", sortDir === "asc" ? "bg-accent/15 text-accent font-medium" : "hover:bg-muted/60")}>
        <ArrowUp className="h-4 w-4" />
        <span>{ascLabel}</span>
        {sortDir === "asc" && <span className="ml-auto text-xs">✓</span>}
      </button>
      <button onClick={() => onSort("desc")}
        className={cn("w-full flex items-center gap-2.5 px-3 py-1.5 rounded-md text-sm transition-colors", sortDir === "desc" ? "bg-accent/15 text-accent font-medium" : "hover:bg-muted/60")}>
        <ArrowDown className="h-4 w-4" />
        <span>{descLabel}</span>
        {sortDir === "desc" && <span className="ml-auto text-xs">✓</span>}
      </button>
      {sortDir && (
        <button onClick={() => onSort(null)}
          className="w-full flex items-center gap-2.5 px-3 py-1.5 rounded-md text-sm text-destructive/70 hover:bg-destructive/10 hover:text-destructive transition-colors">
          <Trash2 className="h-4 w-4" />
          <span>{t("bountifulTable.sort.clear" as any)}</span>
        </button>
      )}
    </div>
  );
}

function FilterSubmenuFlyout({
  anchorRect,
  column,
  filterOperator,
  filterValue,
  onFilterChange,
  onClose,
  onMouseEnter,
}: {
  anchorRect: DOMRect;
  column: BountifulColumn;
  filterOperator?: string;
  filterValue?: string;
  onFilterChange?: (operator: string, val: string) => void;
  onClose: () => void;
  onMouseEnter: () => void;
}) {
  const t = useTranslations("document-detail");
  const [mode, setMode] = useState<"simple" | "dsl">("simple");
  const operators = useMemo(() => getFilterOperatorsForType(column.type, t), [column.type, t]);
  const fallbackOperator = operators[0]?.value || "contains";
  const activeOperator = operators.some(o => o.value === filterOperator) ? (filterOperator as string) : fallbackOperator;
  const currentValue = filterValue || "";
  const noValueOps = ["empty", "not_empty", "date_today", "date_this_week", "is_true", "is_false"];
  const needsValue = !noValueOps.includes(activeOperator);

  const [dslInput, setDslInput] = useState(
    activeOperator + (currentValue ? `:${currentValue}` : "")
  );

  useEffect(() => {
    setDslInput(activeOperator + ((filterValue || "") ? `:${filterValue}` : ""));
  }, [activeOperator, filterValue]);

  const dslParsed = parseFilterDsl(dslInput, activeOperator);
  const dslSupported = operators.some(o => o.value === dslParsed.operator);

  const optionNames = (column.options || []).map(o => o.name);
  const selectedOptions = currentValue.split(",").map(v => v.trim()).filter(Boolean);

  const toggleOption = (name: string) => {
    const has = selectedOptions.some(v => v.toLowerCase() === name.toLowerCase());
    const next = has
      ? selectedOptions.filter(v => v.toLowerCase() !== name.toLowerCase())
      : [...selectedOptions, name];
    onFilterChange?.(activeOperator, next.join(", "));
  };

  const spaceRight = window.innerWidth - anchorRect.right;
  const showOnRight = spaceRight > 360;
  const top = Math.min(anchorRect.top - 8, window.innerHeight - 460);
  const left = showOnRight ? anchorRect.right - 1 : anchorRect.left - 339;

  return (
    <div
      onMouseEnter={onMouseEnter}
      onMouseLeave={onClose}
      className="filter-flyout fixed z-[302] w-[340px] rounded-lg border border-border bg-card shadow-2xl p-1 animate-in fade-in zoom-in-95 slide-in-from-left-1 duration-150"
      style={{ top, left }}
    >
      <div className="px-2 py-1.5 border-b border-border/40">
        <div className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-wider flex items-center gap-2">
          <Filter className="h-3 w-3" />
          {t("bountifulTable.filterBy" as any, { name: column.name })}
        </div>
        <div className="mt-2 grid grid-cols-2 gap-1 rounded-md bg-muted/30 p-1">
          <button
            onClick={() => setMode("simple")}
            className={cn("rounded px-2 py-1 text-xs font-medium transition-colors", mode === "simple" ? "bg-card shadow text-foreground" : "text-muted-foreground hover:text-foreground")}
          >
            Simple
          </button>
          <button
            onClick={() => setMode("dsl")}
            className={cn("rounded px-2 py-1 text-xs font-medium transition-colors", mode === "dsl" ? "bg-card shadow text-foreground" : "text-muted-foreground hover:text-foreground")}
          >
            DSL
          </button>
        </div>
      </div>

      {mode === "simple" ? (
        <div className="p-3 space-y-3">
          <div className="space-y-1.5">
            <span className="text-[10px] font-bold text-muted-foreground/60 uppercase">{t("bountifulTable.filterCondition" as any)}</span>
            <select
              value={activeOperator}
              onChange={(e) => onFilterChange?.(e.target.value, currentValue)}
              className="w-full h-9 bg-muted/30 rounded-md border border-border px-2 text-xs outline-none focus:ring-1 focus:ring-accent"
            >
              {operators.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          {needsValue && (
            <div className="space-y-1.5">
              <span className="text-[10px] font-bold text-muted-foreground/60 uppercase">{t("bountifulTable.filterValue" as any)}</span>
              <div className="relative">
                <input
                  value={currentValue}
                  onChange={e => onFilterChange?.(activeOperator, e.target.value)}
                  placeholder={activeOperator === "regex" ? "/pattern/flags" : activeOperator === "between" ? "min,max" : t("bountifulTable.filterPlaceholder" as any)}
                  type={["date", "created_time", "last_edited_time"].includes(column.type) && activeOperator !== "between" ? "date" : "text"}
                  className="w-full h-9 bg-muted/30 rounded-md border border-border pl-8 pr-8 text-xs outline-none focus:ring-1 focus:ring-accent transition-all"
                />
                <Filter className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground/40" />
                {currentValue.length > 0 && (
                  <button onClick={() => onFilterChange?.(activeOperator, "")} className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          )}

          {optionNames.length > 0 && ["is_any_of", "is_none_of", "equals", "contains"].includes(activeOperator) && (
            <div className="space-y-1.5">
              <span className="text-[10px] font-bold text-muted-foreground/60 uppercase">Suggestions</span>
              <div className="flex flex-wrap gap-1">
                {optionNames.slice(0, 16).map((name) => {
                  const active = selectedOptions.some(v => v.toLowerCase() === name.toLowerCase());
                  return (
                    <button
                      key={name}
                      onClick={() => toggleOption(name)}
                      className={cn("px-2 py-0.5 rounded-full text-[11px] border transition-colors", active ? "bg-accent/15 text-accent border-accent/40" : "border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/40")}
                    >
                      {name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <p className="text-[10px] text-muted-foreground leading-tight">
            {activeOperator === "regex"
              ? t("bountifulTable.filterRegexHelp" as any)
              : t("bountifulTable.filterTip" as any)}
          </p>
        </div>
      ) : (
        <div className="p-3 space-y-3">
          <div className="space-y-1.5">
            <span className="text-[10px] font-bold text-muted-foreground/60 uppercase">{t("bountifulTable.filterDslLabel" as any)}</span>
            <textarea
              value={dslInput}
              onChange={(e) => {
                const next = e.target.value;
                setDslInput(next);
                const parsed = parseFilterDsl(next, activeOperator);
                const supported = operators.some(o => o.value === parsed.operator);
                if (supported) onFilterChange?.(parsed.operator, parsed.value);
              }}
              placeholder="contains:juan"
              className="w-full min-h-[72px] resize-y bg-muted/30 rounded-md border border-border px-2 py-1.5 text-xs font-mono outline-none focus:ring-1 focus:ring-accent"
            />
          </div>

          <div className="rounded-md border border-border/60 bg-muted/20 p-2 text-[10px] text-muted-foreground leading-tight space-y-1">
            <p>{t("bountifulTable.filterDslExamples" as any)}</p>
          </div>

          <p className={cn("text-[10px]", dslSupported ? "text-emerald-500" : "text-amber-500")}>
            {dslSupported
              ? t("bountifulTable.filterDslApplying" as any, { operator: dslParsed.operator, value: dslParsed.value ? ` (${dslParsed.value})` : "" })
              : t("bountifulTable.filterDslUnsupported" as any)}
          </p>
        </div>
      )}
    </div>
  );
}

function FilterWorkbenchFlyout({
  anchorRect,
  columns,
  filterConfig,
  initialColId,
  onMouseEnter,
  onClose,
  onFilterChange,
  onRemoveFilter,
  onClearAll,
}: {
  anchorRect: DOMRect;
  columns: BountifulColumn[];
  filterConfig: { colId: string; value: string; operator: string }[];
  initialColId: string | null;
  onMouseEnter: () => void;
  onClose: () => void;
  onFilterChange: (colId: string, operator: string, value: string) => void;
  onRemoveFilter: (colId: string) => void;
  onClearAll: () => void;
}) {
  const t = useTranslations("document-detail");
  const [mode, setMode] = useState<"simple" | "dsl">("simple");
  const [columnQuery, setColumnQuery] = useState("");
  const [selectedColId, setSelectedColId] = useState<string | null>(initialColId || columns[0]?.id || null);
  const [dslInput, setDslInput] = useState("");

  const selectedColumn = useMemo(() => columns.find(c => c.id === selectedColId) || columns[0] || null, [columns, selectedColId]);
  const activeFilter = useMemo(() => filterConfig.find(f => f.colId === selectedColumn?.id) || null, [filterConfig, selectedColumn?.id]);
  const operators = useMemo(() => selectedColumn ? getFilterOperatorsForType(selectedColumn.type, t) : [], [selectedColumn, t]);
  const fallbackOperator = operators[0]?.value || "contains";
  const activeOperator = activeFilter && operators.some(o => o.value === activeFilter.operator) ? activeFilter.operator : fallbackOperator;
  const activeValue = activeFilter?.value || "";
  const needsValue = !["empty", "not_empty", "date_today", "date_this_week", "is_true", "is_false"].includes(activeOperator);

  useEffect(() => {
    if (selectedColId && !columns.some(c => c.id === selectedColId)) {
      setSelectedColId(columns[0]?.id || null);
    }
  }, [columns, selectedColId]);

  useEffect(() => {
    if (!selectedColumn) return;
    const seed = activeFilter ? `${activeFilter.operator}${activeFilter.value ? `:${activeFilter.value}` : ""}` : `${fallbackOperator}${activeValue ? `:${activeValue}` : ""}`;
    setDslInput(seed);
  }, [selectedColumn?.id, activeFilter?.operator, activeFilter?.value, fallbackOperator, activeValue]);

  const filteredColumns = useMemo(() => {
    const q = columnQuery.trim().toLowerCase();
    return columns.filter(c => !q || c.name.toLowerCase().includes(q) || c.type.toLowerCase().includes(q));
  }, [columns, columnQuery]);

  const commitDsl = (next: string) => {
    if (!selectedColumn) return;
    const parsed = parseFilterDsl(next, activeOperator);
    const supported = operators.some(o => o.value === parsed.operator);
    setDslInput(next);
    if (supported) {
      onFilterChange(selectedColumn.id, parsed.operator, parsed.value);
    }
  };

  const spaceRight = window.innerWidth - anchorRect.right;
  const showOnRight = spaceRight > 520;
  const top = Math.min(anchorRect.bottom + 8, window.innerHeight - 560);
  const left = showOnRight ? anchorRect.right - 1 : anchorRect.left - 519;

  const operatorParams = selectedColumn ? [
    ...(selectedColumn.type === "number" ? ["gt", "lt", "gte", "lte", "between"] : []),
    ...(["date", "created_time", "last_edited_time"].includes(selectedColumn.type) ? ["date_before", "date_after", "date_today", "date_this_week", "between"] : []),
    ...(selectedColumn.type === "checkbox" ? ["is_true", "is_false"] : []),
    ...(selectedColumn.options?.length ? ["is_any_of", "is_none_of"] : []),
    ...(["select", "multi_select", "status", "people", "created_by", "last_edited_by", "relation", "document", "board", "card"].includes(selectedColumn.type) ? ["equals", "contains", "is_any_of", "is_none_of"] : []),
  ] : [];

  const paramChips = selectedColumn ? [
    ...(selectedColumn.type === "date" || selectedColumn.type === "created_time" || selectedColumn.type === "last_edited_time" ? ["today", "this_week", "2026-04-22"] : []),
    ...(selectedColumn.options?.slice(0, 8).map(o => o.name) || []),
    ...(selectedColumn.type === "checkbox" ? ["true", "false"] : []),
    ...(selectedColumn.type === "number" ? ["0", "10", "100"] : []),
  ] : [];

  return createPortal(
    <>
      <div className="fixed inset-0 z-[301]" onClick={onClose} />
      <div
        className="filter-flyout fixed z-[302] w-[520px] rounded-lg border border-border bg-card shadow-2xl p-1 animate-in fade-in zoom-in-95 slide-in-from-left-1 duration-150"
        style={{ top, left }}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onClose}
        onClick={e => e.stopPropagation()}
      >
      <div className="px-2 py-1.5 border-b border-border/40 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-wider flex items-center gap-2">
            <Filter className="h-3 w-3" />
            {t("bountifulTable.filterTitle" as any)}
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => setMode("simple")} className={cn("px-2 py-1 rounded text-[10px] font-semibold transition-colors", mode === "simple" ? "bg-accent/15 text-accent" : "text-muted-foreground hover:text-foreground")}>Simple</button>
            <button onClick={() => setMode("dsl")} className={cn("px-2 py-1 rounded text-[10px] font-semibold transition-colors", mode === "dsl" ? "bg-accent/15 text-accent" : "text-muted-foreground hover:text-foreground")}>DSL</button>
            <button onClick={onClearAll} className="px-2 py-1 rounded text-[10px] font-semibold text-muted-foreground hover:text-destructive transition-colors">{t("bountifulTable.filterClearAll" as any)}</button>
          </div>
        </div>
        <input
          value={columnQuery}
          onChange={e => setColumnQuery(e.target.value)}
          placeholder={t("bountifulTable.filterSearchColumns" as any)}
          className="w-full h-9 rounded-md border border-border bg-muted/20 px-3 text-sm outline-none focus:ring-1 focus:ring-accent"
        />
      </div>

      <div className="grid grid-cols-[180px_1fr] gap-2 p-2">
        <div className="max-h-[420px] overflow-y-auto rounded-md border border-border/50 bg-muted/10 p-1">
          <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">{t("bountifulTable.filterColumns" as any)}</div>
          {filteredColumns.map(col => {
            const isActive = selectedColumn?.id === col.id;
            const active = filterConfig.some(f => f.colId === col.id);
            return (
              <button
                key={col.id}
                onClick={() => setSelectedColId(col.id)}
                className={cn(
                  "w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                  isActive ? "bg-accent/15 text-accent" : "hover:bg-muted/60",
                )}
              >
                <span className="opacity-60">{colTypeIcon[col.type] || <FileText className="h-3 w-3" />}</span>
                <span className="min-w-0 flex-1 truncate">{col.name}</span>
                {active && <span className="text-[10px] rounded bg-accent/15 px-1.5 py-0.5 text-accent">{t("bountifulTable.filterActiveTag" as any)}</span>}
                <ChevronRight className="h-3.5 w-3.5 opacity-50" />
              </button>
            );
          })}
        </div>

        <div className="max-h-[420px] overflow-y-auto rounded-md border border-border/50 bg-card p-3 space-y-3">
          {selectedColumn ? (
            <>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold">{selectedColumn.name}</div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground/60">{selectedColumn.type}</div>
                </div>
                {activeFilter && <button onClick={() => onRemoveFilter(selectedColumn.id)} className="text-[10px] text-muted-foreground hover:text-destructive">{t("bountifulTable.filterRemove" as any)}</button>}
              </div>

              {mode === "simple" ? (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-bold text-muted-foreground/60 uppercase">{t("bountifulTable.filterCondition" as any)}</span>
                    <select value={activeOperator} onChange={e => onFilterChange(selectedColumn.id, e.target.value, activeValue)} className="w-full h-9 rounded-md border border-border bg-muted/20 px-2 text-xs outline-none focus:ring-1 focus:ring-accent">
                      {operators.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>

                  {needsValue && (
                    <div className="space-y-1.5">
                      <span className="text-[10px] font-bold text-muted-foreground/60 uppercase">{t("bountifulTable.filterValue" as any)}</span>
                      <div className="relative">
                        <input
                          value={activeValue}
                          onChange={e => onFilterChange(selectedColumn.id, activeOperator, e.target.value)}
                          placeholder={activeOperator === "regex" ? "/pattern/flags" : activeOperator === "between" ? "min,max" : t("bountifulTable.filterPlaceholder" as any)}
                          type={["date", "created_time", "last_edited_time"].includes(selectedColumn.type) && !["between"].includes(activeOperator) ? "date" : "text"}
                          className="w-full h-9 rounded-md border border-border bg-muted/20 pl-8 pr-8 text-sm outline-none focus:ring-1 focus:ring-accent"
                        />
                        <Filter className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground/40" />
                        {activeValue.length > 0 && <button onClick={() => onFilterChange(selectedColumn.id, activeOperator, "")} className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>}
                      </div>
                    </div>
                  )}

                  {selectedColumn.options?.length ? (
                    <div className="space-y-1.5">
                      <span className="text-[10px] font-bold text-muted-foreground/60 uppercase">{t("bountifulTable.filterSuggestions" as any)}</span>
                      <div className="flex flex-wrap gap-1">
                        {selectedColumn.options.slice(0, 10).map(opt => (
                          <button key={opt.id} onClick={() => onFilterChange(selectedColumn.id, ["select", "status", "multi_select"].includes(selectedColumn.type) ? "is_any_of" : activeOperator, opt.name)} className="rounded-full border border-border/60 px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted/40 hover:text-foreground transition-colors">{opt.name}</button>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <div className="rounded-md border border-border/60 bg-muted/20 p-2 text-[10px] text-muted-foreground leading-tight">
                    {t("bountifulTable.filterTip" as any)}
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-bold text-muted-foreground/60 uppercase">{t("bountifulTable.filterDslLabel" as any)}</span>
                    <textarea value={dslInput} onChange={e => commitDsl(e.target.value)} placeholder="contains:juan" className="w-full min-h-[92px] resize-y rounded-md border border-border bg-muted/20 px-2 py-1.5 text-xs font-mono outline-none focus:ring-1 focus:ring-accent" />
                  </div>

                  <div className="space-y-1.5">
                    <span className="text-[10px] font-bold text-muted-foreground/60 uppercase">{t("bountifulTable.filterDslQuickParams" as any)}</span>
                    <div className="flex flex-wrap gap-1">
                      {operatorParams.map(op => (
                        <button key={op} onClick={() => setDslInput(`${op}:`)} className="rounded-full border border-border/60 px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted/40 hover:text-foreground transition-colors">{op}</button>
                      ))}
                      {paramChips.map(param => (
                        <button key={param} onClick={() => setDslInput(prev => `${prev}${prev.endsWith(":") ? "" : ":"}${param}`)} className="rounded-full border border-border/60 px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted/40 hover:text-foreground transition-colors">{param}</button>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-md border border-border/60 bg-muted/20 p-2 text-[10px] text-muted-foreground leading-tight space-y-1">
                    <p>{t("bountifulTable.filterDslExamples" as any)}</p>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="text-sm text-muted-foreground">{t("bountifulTable.filterNoColumns" as any)}</div>
          )}
        </div>
      </div>

      {filterConfig.length > 0 && (
        <div className="border-t border-border/40 px-3 py-2 flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60 mr-1">{t("bountifulTable.filterActiveFilters" as any)}</span>
          {filterConfig.map(f => {
            const col = columns.find(c => c.id === f.colId);
            if (!col) return null;
            return (
              <button key={f.colId} onClick={() => setSelectedColId(f.colId)} className="group inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/20 px-2 py-1 text-[11px] text-foreground hover:bg-muted/40 transition-colors">
                <span className="max-w-[120px] truncate font-medium">{col.name}</span>
                <span className="text-muted-foreground">{getFilterOperatorLabel(t, f.operator)}</span>
                {f.value && <span className="text-muted-foreground/70 max-w-[120px] truncate">{f.value}</span>}
                <span onClick={(e) => { e.stopPropagation(); onRemoveFilter(f.colId); }} className="ml-1 rounded-full px-1 text-muted-foreground hover:text-destructive">×</span>
              </button>
            );
          })}
        </div>
      )}
      </div>
    </>,
    document.body
  );
}

function SortWorkbenchFlyout({
  anchorRect,
  columns,
  sortConfig,
  onMouseEnter,
  onClose,
  onSortChange,
}: {
  anchorRect: DOMRect;
  columns: BountifulColumn[];
  sortConfig: { colId: string; direction: "asc" | "desc" } | null;
  onMouseEnter: () => void;
  onClose: () => void;
  onSortChange: (colId: string | null, direction: "asc" | "desc" | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [selectedColId, setSelectedColId] = useState<string | null>(sortConfig?.colId || columns[0]?.id || null);
  const [showDirectionFlyout, setShowDirectionFlyout] = useState(false);
  const [sortButtonRef, setSortButtonRef] = useState<HTMLButtonElement | null>(null);
  const t = useTranslations("document-detail");
  const filteredColumns = useMemo(() => {
    const q = query.trim().toLowerCase();
    return columns.filter(c => !q || c.name.toLowerCase().includes(q) || c.type.toLowerCase().includes(q));
  }, [columns, query]);

  const selectedColumn = columns.find(c => c.id === selectedColId) || null;
  const spaceRight = window.innerWidth - anchorRect.right;
  const showOnRight = spaceRight > 360;
  const top = Math.min(anchorRect.bottom + 8, window.innerHeight - 360);
  const left = showOnRight ? anchorRect.right - 1 : anchorRect.left - 339;

  const directionAnchorRect = sortButtonRef?.getBoundingClientRect() || anchorRect;
  const directionSpaceRight = window.innerWidth - directionAnchorRect.right;
  const directionShowOnRight = directionSpaceRight > 220;
  const directionTop = Math.min(directionAnchorRect.top - 6, window.innerHeight - 180);
  const directionLeft = directionShowOnRight ? directionAnchorRect.right - 1 : directionAnchorRect.left - 219;

  return createPortal(
    <>
      <div className="fixed inset-0 z-[301]" onClick={onClose} />
      <div
        className="fixed z-[302] w-[340px] rounded-lg border border-border bg-card shadow-2xl p-1 animate-in fade-in zoom-in-95 slide-in-from-left-1 duration-150"
        style={{ top, left }}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onClose}
        onClick={e => e.stopPropagation()}
      >
      <div className="px-2 py-1.5 border-b border-border/40 space-y-2">
        <div className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-wider flex items-center gap-2">
          <ArrowUp className="h-3 w-3" />
          {t("bountifulTable.sort.title" as any)}
        </div>
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder={t("bountifulTable.sort.searchPlaceholder" as any)} className="w-full h-9 rounded-md border border-border bg-muted/20 px-3 text-sm outline-none focus:ring-1 focus:ring-accent" />
      </div>

      <div className="p-2 space-y-2">
        <div className="max-h-[220px] overflow-y-auto rounded-md border border-border/50 bg-muted/10 p-1">
          {filteredColumns.map(col => {
            const active = selectedColId === col.id;
            return (
              <button
                key={col.id}
                onClick={() => setSelectedColId(col.id)}
                className={cn("w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors", active ? "bg-accent/15 text-accent" : "hover:bg-muted/60")}
              >
                <span className="opacity-60">{colTypeIcon[col.type] || <FileText className="h-3 w-3" />}</span>
                <span className="min-w-0 flex-1 truncate">{col.name}</span>
                {sortConfig?.colId === col.id && <span className="text-[10px] rounded bg-accent/15 px-1.5 py-0.5 text-accent">{t("bountifulTable.sort.active" as any)}</span>}
              </button>
            );
          })}
        </div>

        {selectedColumn && (
          <div className="space-y-2 rounded-md border border-border/60 bg-card p-2">
            <div className="text-sm font-semibold truncate">{selectedColumn.name}</div>
              <button ref={setSortButtonRef} onClick={() => setShowDirectionFlyout(v => !v)} className="w-full rounded-md px-3 py-1.5 text-sm border border-border hover:bg-muted/40 transition-colors flex items-center justify-between">
                <span>{t("bountifulTable.sort.pickDirection" as any)}</span>
                <ChevronRight className="h-3.5 w-3.5 opacity-60" />
              </button>
          </div>
        )}
      </div>
        {showDirectionFlyout && sortButtonRef && selectedColumn && (
          <>
            <div className="fixed inset-0 z-[303]" onClick={() => setShowDirectionFlyout(false)} />
            <div
              className="fixed z-[304] w-[220px] rounded-lg border border-border bg-card shadow-2xl p-1 animate-in fade-in zoom-in-95 slide-in-from-left-1 duration-150"
              style={{ top: directionTop, left: directionLeft }}
              onMouseLeave={() => setShowDirectionFlyout(false)}
              onClick={e => e.stopPropagation()}
            >
              <button onClick={() => { onSortChange(selectedColumn.id, "asc"); setShowDirectionFlyout(false); }} className={cn("w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors", sortConfig?.colId === selectedColumn.id && sortConfig.direction === "asc" ? "bg-accent/15 text-accent" : "hover:bg-muted/60")}>
                <ArrowUp className="h-4 w-4" />
                <span>{t("bountifulTable.sort.oldestNewest" as any)}</span>
              </button>
              <button onClick={() => { onSortChange(selectedColumn.id, "desc"); setShowDirectionFlyout(false); }} className={cn("w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors", sortConfig?.colId === selectedColumn.id && sortConfig.direction === "desc" ? "bg-accent/15 text-accent" : "hover:bg-muted/60")}>
                <ArrowDown className="h-4 w-4" />
                <span>{t("bountifulTable.sort.newestOldest" as any)}</span>
              </button>
              <button onClick={() => { onSortChange(null, null); setShowDirectionFlyout(false); }} className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-muted-foreground hover:bg-muted/60 hover:text-destructive transition-colors">
                <Trash2 className="h-4 w-4" />
                <span>{t("bountifulTable.sort.clear" as any)}</span>
              </button>
            </div>
          </>
        )}
      </div>
    </>,
    document.body
  );
}

// ─── Select Dropdown ────────────────────────────────────────────────────────

function SelectDropdown({ options, value, multi, onSelect, onClose, anchorRect }: {
  options: { name: string; color: string }[]; value: string | string[]; multi?: boolean;
  onSelect: (name: string) => void; onClose: () => void; anchorRect: DOMRect;
}) {
  const t = useTranslations("document-detail");
  const [filter, setFilter] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);
  const filtered = options.filter(o => o.name.toLowerCase().includes(filter.toLowerCase()));
  const selected = Array.isArray(value) ? value : [value];

  return createPortal(
    <>
      <div className="fixed inset-0 z-[300]" onClick={e => { e.stopPropagation(); onClose(); }} />
      <div className="fixed z-[301] w-64 max-h-72 rounded-lg border border-border bg-card shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        style={{ top: Math.min(anchorRect.bottom + 4, window.innerHeight - 300), left: Math.min(anchorRect.left, window.innerWidth - 270) }}>
        <div className="p-2 border-b border-border">
          <input ref={inputRef} value={filter} onChange={e => setFilter(e.target.value)} placeholder={t("bountifulTable.searchOption" as any)}
            className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent" />
        </div>
        <div className="overflow-y-auto max-h-52 p-1">
          {filtered.length === 0 && <div className="px-3 py-2 text-xs text-muted-foreground">{t("bountifulTable.noResults" as any)}</div>}
          {filtered.map(opt => {
            const isSel = selected.includes(opt.name);
            return (
              <button key={opt.name} onClick={e => { e.stopPropagation(); onSelect(opt.name); }}
                className={cn("w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-sm transition-colors", isSel ? "bg-accent/15" : "hover:bg-muted/60")}>
                {multi && (
                  <div className={cn("h-3.5 w-3.5 rounded border flex items-center justify-center", isSel ? "bg-accent border-accent text-accent-foreground" : "border-border")}>
                    {isSel && <span className="text-[9px]">✓</span>}
                  </div>
                )}
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getPillClass(opt.color)}`}>{opt.name}</span>
              </button>
            );
          })}
        </div>
      </div>
    </>,
    document.body
  );
}

// ─── Visibility Manager (portal) ───────────────────────────────────────────

function VisibilityManager({ columns, onToggleVisibility, onShowAll, onHideAll, anchorRect, onClose }: {
  columns: BountifulColumn[]; onToggleVisibility: (id: string) => void;
  onShowAll: () => void; onHideAll: () => void; anchorRect: DOMRect; onClose: () => void;
}) {
  const t = useTranslations("document-detail");
  const [filter, setFilter] = useState("");
  const visibleCol = columns.filter(c => !c.hidden && c.name.toLowerCase().includes(filter.toLowerCase()));
  const hiddenCol = columns.filter(c => c.hidden && c.name.toLowerCase().includes(filter.toLowerCase()));

  const top = Math.min(anchorRect.bottom + 4, window.innerHeight - 500);
  const left = Math.max(8, Math.min(anchorRect.left - 240, window.innerWidth - 320));

  return createPortal(
    <>
      <div className="fixed inset-0 z-[300]" onClick={e => { e.stopPropagation(); onClose(); }} />
      <div className="fixed z-[301] w-72 rounded-lg border border-border bg-card shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 flex flex-col"
        style={{ top, left }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/20">
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground hover:bg-muted p-1 rounded-md transition-colors">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="flex-1 text-[11px] font-bold uppercase tracking-tight text-muted-foreground">{t("bountifulTable.visibility.title" as any)}</span>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground hover:bg-muted p-1 rounded-md transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-2 border-b border-border">
          <input value={filter} onChange={e => setFilter(e.target.value)} placeholder={t("bountifulTable.visibility.searchPlaceholder" as any)}
            className="w-full h-8 bg-muted/40 rounded-md border border-input px-2.5 py-1 text-xs focus:ring-1 focus:ring-accent outline-none transition-all" autoFocus />
        </div>

        <div className="flex-1 overflow-y-auto max-h-[400px] p-1.5 space-y-4">
          <div className="space-y-1">
            <div className="flex items-center justify-between px-2 pt-1 pb-1">
              <span className="text-[10px] font-bold text-muted-foreground/60 uppercase">{t("bountifulTable.visibility.visible" as any)}</span>
              <button onClick={onHideAll} className="text-[10px] text-accent hover:underline font-semibold">{t("bountifulTable.visibility.hideAll" as any)}</button>
            </div>
            {visibleCol.map(col => (
              <div key={col.id} className="group flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted/60 transition-colors">
                <GripVertical className="h-3.5 w-3.5 text-muted-foreground/20 group-hover:text-muted-foreground/50 transition-colors" />
                <span className="text-muted-foreground shrink-0">{colTypeIcon[col.type]}</span>
                <span className="flex-1 text-[11px] truncate font-medium">{col.name}</span>
                <button onClick={e => { e.stopPropagation(); onToggleVisibility(col.id); }} className="p-1 hover:bg-background rounded-md text-foreground/40 hover:text-foreground transition-colors group/eye">
                  <Eye className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>

          {hiddenCol.length > 0 && (
            <div className="space-y-1">
              <div className="flex items-center justify-between px-2 pt-1 pb-1">
                <span className="text-[10px] font-bold text-muted-foreground/60 uppercase">{t("bountifulTable.visibility.hidden" as any)}</span>
                <button onClick={onShowAll} className="text-[10px] text-accent hover:underline font-semibold">{t("bountifulTable.visibility.showAll" as any)}</button>
              </div>
              {hiddenCol.map(col => (
                <div key={col.id} className="group flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted/20 opacity-70">
                  <GripVertical className="h-3.5 w-3.5 text-muted-foreground/10" />
                  <span className="text-muted-foreground shrink-0">{colTypeIcon[col.type]}</span>
                  <span className="flex-1 text-[11px] truncate italic">{col.name}</span>
                  <button onClick={() => onToggleVisibility(col.id)} className="p-1 hover:bg-background rounded-md text-muted-foreground/30 hover:text-foreground transition-colors group/eye">
                    <EyeOff className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>,
    document.body
  );
}

// ─── AI Autocomplete Modal ──────────────────────────────────────────────────

function AIAutocompleteModal({
  column, columns, rows, onClose, onSave, aiUsage, setAiUsage
}: {
  column: BountifulColumn;
  columns: BountifulColumn[];
  rows: BountifulRow[];
  onClose: () => void;
  onSave: (rows: BountifulRow[]) => void;
  aiUsage: number;
  setAiUsage: React.Dispatch<React.SetStateAction<number>>;
}) {
  const t = useTranslations("document-detail");
  const { activeTeamId, accessToken } = useSession();
  const [mode, setMode] = useState<"basic" | "agent">("basic");
  const [instructions, setInstructions] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [tempRows, setTempRows] = useState<BountifulRow[]>(JSON.parse(JSON.stringify(rows)));
  const [previewRowIdx, setPreviewRowIdx] = useState(0);
  const previewCols = useMemo(() => {
    const first = columns[0];
    const others = columns.filter(c => c.id !== first.id && c.id !== column.id).slice(0, 2);
    const set = new Set([first.id, column.id, ...others.map(c => c.id)]);
    return columns.filter(c => set.has(c.id)).slice(0, 4);
  }, [columns, column]);

  const runBasicAI = async () => {
    if (!activeTeamId || !accessToken) return;
    setIsProcessing(true);
    setProgress(0);
    const targetColId = column.id;

    try {
      // 1. Prepare Schema & Context
      const colSchema = columns.map(c => ({
        id: c.id,
        name: c.name,
        type: c.type,
        options: c.options?.map((o: any) => o.name || String(o))
      }));

      // Gather current data context with full structural properties
      const rowContext = tempRows.map(r => ({
        id: r.id,
        cells: Object.fromEntries(
          Object.entries(r.cells).map(([cid, cell]) => [
            cid,
            cell // Send full cell object (color, text, number, checked, items, etc)
          ])
        )
      }));

      // 2. Call Real AI Backend
      const res = await fetchApi<{ completions: Record<string, string>, usage: { tokens: number, credits: number } }>(
        `/ai/team/${activeTeamId}/autocomplete-table`,
        {
          method: 'POST',
          accessToken,
          body: JSON.stringify({
            columns: colSchema,
            rows: rowContext,
            targetColumnId: targetColId,
            instructions
          })
        }
      );

      // 3. Process Completions
      if (res.completions) {
        const newRows = [...tempRows];
        Object.entries(res.completions).forEach(([rowId, value]) => {
          const rowIdx = newRows.findIndex(r => r.id === rowId);
          if (rowIdx >= 0) {
            const result = String(value);
            newRows[rowIdx].cells[targetColId] = {
              ...newRows[rowIdx].cells[targetColId],
              type: column.type as any,
              text: result,
              value: result,
              number: column.type === 'number' ? parseFloat(result.replace(/[^0-9.-]+/g, "")) : undefined
            } as any;
          }
        });
        setTempRows(newRows);
        setProgress(100);

        // 4. Update Current Usage Progress Bar
        const usageRes = await fetchApi<{ creditsUsed: number }>(`/ai/team/${activeTeamId}/usage`, { accessToken });
        setAiUsage(usageRes.creditsUsed || 0);
      }
    } catch (err) {
      console.error("AI Generation failed", err);
    }

    setIsProcessing(false);
  };

  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-background/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
      <div className="bg-card w-[1000px] h-[700px] rounded-2xl border border-border shadow-2xl flex flex-col overflow-hidden scale-in-center" onClick={e => e.stopPropagation()}>

        {/* Modal Header */}
        <div className="h-14 border-b border-border flex items-center justify-between px-6 bg-muted/5">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-accent/10 flex items-center justify-center">
              <Wand2 className="h-4 w-4 text-accent" />
            </div>
            <div>
              <h3 className="text-sm font-bold tracking-tight">{t("bountifulTable.aiModal.title" as any)}: {column.name}</h3>
              <p className="text-[10px] text-muted-foreground/60 uppercase font-bold tracking-widest">{t("bountifulTable.aiModal.basic" as any)}</p>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <div className="flex flex-col items-end">
              <span className="text-[9px] font-black text-muted-foreground/40 uppercase tracking-tighter mb-0.5">{t("bountifulTable.aiUsage.title" as any)}</span>
              <div className="flex items-center gap-2 px-2.5 py-1 rounded-md bg-accent/5 border border-accent/10">
                <span className="text-[10px] font-bold text-accent font-mono">${aiUsage.toFixed(3)}</span>
                <div className="h-1 w-12 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-accent" style={{ width: `${Math.min(100, (aiUsage / AI_MONTHLY_LIMIT) * 100)}%` }} />
                </div>
              </div>
            </div>
            <button onClick={onClose} className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-muted transition-colors">
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* Sidebar */}
          <div className="w-[320px] border-r border-border bg-muted/5 flex flex-col">
            <div className="flex-1 overflow-y-auto p-6 space-y-8">
              {/* Mode Toggle */}
              <div className="space-y-3">
                <label className="text-[10px] font-black text-muted-foreground/40 uppercase tracking-widest">{t("bountifulTable.aiModal.modeLabel" as any)}</label>
                <div className="flex p-1 bg-muted/50 rounded-xl border border-border/40">
                  <button onClick={() => setMode("basic")}
                    className={cn("flex-1 py-2 rounded-lg text-[10px] font-bold uppercase transition-all",
                      mode === "basic" ? "bg-card text-foreground shadow-sm ring-1 ring-border/50" : "text-muted-foreground hover:bg-muted/50")}>
                    {t("bountifulTable.aiModal.modeBasic" as any)}
                  </button>
                  <button disabled
                    className={cn("flex-1 py-2 rounded-lg text-[10px] font-bold uppercase transition-all relative opacity-50 cursor-not-allowed",
                      mode === "agent" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground")}>
                    {t("bountifulTable.aiModal.agent" as any)}
                    <span className="absolute -top-1 -right-1 bg-accent/20 text-[7px] text-accent px-1 py-0.5 rounded-full font-black">WIP</span>
                  </button>
                </div>
              </div>

              {/* Instructions */}
              <div className="space-y-3">
                <label className="text-[10px] font-black text-muted-foreground/40 uppercase tracking-widest">{t("bountifulTable.aiModal.instructions" as any)}</label>
                <div className="relative group">
                  <textarea value={instructions} onChange={e => setInstructions(e.target.value)}
                    placeholder={t("bountifulTable.aiModal.instructionsPlaceholder" as any)}
                    className="w-full h-40 bg-card border border-border/60 rounded-xl p-4 text-xs focus:ring-1 focus:ring-accent outline-none resize-none transition-all placeholder:text-muted-foreground/30" />
                  <div className="absolute right-3 bottom-3 text-[9px] text-muted-foreground/20 font-mono">Markdown</div>
                </div>
              </div>

              {/* Run Control */}
              <div className="pt-4 border-t border-border/40 space-y-4">
                <button onClick={runBasicAI} disabled={isProcessing || aiUsage >= AI_MONTHLY_LIMIT}
                  className="w-full h-11 bg-accent text-accent-foreground font-black text-[11px] uppercase tracking-wider rounded-xl shadow-lg shadow-accent/20 flex items-center justify-center gap-2 hover:opacity-90 transition-all disabled:opacity-50 relative overflow-hidden group">
                  {aiUsage >= AI_MONTHLY_LIMIT ? (
                    <span className="text-destructive font-bold">{t("bountifulTable.aiModal.limitReached" as any)}</span>
                  ) : (
                    <>
                      {isProcessing ? <RotateCw className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5 transition-transform group-hover:scale-110" />}
                      {t("bountifulTable.aiModal.run" as any)}
                    </>
                  )}
                </button>

                {isProcessing && (
                  <div className="space-y-1.5 animate-in fade-in duration-300">
                    <div className="flex justify-between text-[9px] font-bold text-muted-foreground/60 uppercase">
                      <span>{t("bountifulTable.aiModal.progress" as any)}</span>
                      <span>{progress}%</span>
                    </div>
                    <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-accent transition-all duration-300" style={{ width: `${progress}%` }} />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Main Preview Container */}
          <div className="flex-1 bg-background flex flex-col overflow-hidden relative">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(var(--accent-rgb),0.02),transparent)] pointer-events-none" />

            <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
              <div className="max-w-4xl mx-auto space-y-6">
                <div className="flex items-center justify-between border-b border-border/20 pb-2">
                  <div className="flex items-center gap-2 text-[10px] font-black uppercase text-muted-foreground/30">
                    <TableIcon className="h-3 w-3" />
                    <span>{t("bountifulTable.aiModal.preview" as any)}</span>
                  </div>
                  {isProcessing && (
                    <span className="text-[9px] text-accent animate-pulse font-bold uppercase tracking-widest">Generando...</span>
                  )}
                </div>

                <div className="rounded-xl border border-border/40 shadow-xl overflow-hidden bg-muted/5">
                  <table className="w-full border-collapse">
                    <thead className="bg-muted/30 border-b border-border/40">
                      <tr>
                        <th className="px-4 py-3 text-left text-[10px] font-bold text-muted-foreground uppercase border-r border-border/40 w-12">{t("bountifulTable.aiModal.rowHeader" as any)}</th>
                        {previewCols.map(c => (
                          <th key={c.id} className={cn("px-4 py-3 text-left text-[10px] font-bold uppercase border-r border-border/40 transition-colors",
                            c.id === column.id ? "text-accent bg-accent/5 ring-1 ring-inset ring-accent/20" : "text-muted-foreground")}>
                            <div className="flex items-center gap-2">
                              {c.id === column.id && <Wand2 className="h-3 w-3" />}
                              {c.name}
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/20">
                      {tempRows.slice(0, 10).map((r, ridx) => (
                        <tr key={r.id} className={cn("group transition-colors", ridx === previewRowIdx && "bg-accent/5")}>
                          <td className="px-4 py-3 text-[10px] font-mono text-muted-foreground/40 border-r border-border/20">{ridx + 1}</td>
                          {previewCols.map(c => {
                            const cell = r.cells[c.id];
                            const isTarget = c.id === column.id;
                            return (
                              <td key={c.id} className={cn("px-4 py-3 text-xs border-r border-border/20 transition-all",
                                isTarget && "bg-accent/[0.04] font-semibold text-accent shadow-[inset_0_0_0_1px_rgba(var(--accent-rgb),0.1)]")}>
                                {cell?.text || cell?.name || cell?.number || (isTarget && isProcessing ? <span className="animate-pulse opacity-40">...</span> : <span className="opacity-10">—</span>)}
                                {isTarget && isProcessing && ridx === previewRowIdx && (
                                  <span className="ml-2 inline-block h-1.5 w-1.5 bg-accent rounded-full animate-ping" />
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {tempRows.length > 10 && (
                  <div className="flex items-center justify-center py-4 text-[10px] text-muted-foreground/40 italic font-medium">
                    {t("bountifulTable.aiModal.additionalRows" as any, { count: String(tempRows.length - 10) })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="h-16 border-t border-border bg-card flex items-center justify-end px-6 gap-3">
          <button onClick={onClose} className="px-5 h-10 text-xs font-bold text-muted-foreground hover:text-foreground transition-colors">
            {t("common.cancel" as any)}
          </button>
          <button onClick={() => onSave(tempRows)} disabled={isProcessing}
            className="px-8 h-10 bg-accent text-accent-foreground rounded-xl text-xs font-black shadow-lg shadow-accent/10 hover:opacity-90 disabled:opacity-30 transition-all">
            {t("common.saveChanges" as any)}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─── Cell Renderer ──────────────────────────────────────────────────────────

function CellRenderer({ cell, column, row, readonly, onCellChange, onOpenReferencePicker, users = [] }: {
  cell: BountifulCell | null; column: BountifulColumn; row: BountifulRow; readonly?: boolean;
  onCellChange?: (newCell: BountifulCell) => void;
  onOpenReferencePicker?: (state: { rowId: string; colId: string; rect: DOMRect; type: "user" | "doc" | "board" | "card" }) => void;
  users?: WorkspaceMemberLike[];
}) {
  const t = useTranslations("document-detail");
  const emptyLabel = ""; // Empty cells show nothing, just clickable area
  const [isEditing, setIsEditing] = useState(false);

  const parseDateInput = (raw: string): Date | null => {
    const source = raw.trim();
    if (!source) return null;

    const isIsoDate = /^\d{4}-\d{2}-\d{2}$/.test(source);
    if (isIsoDate) {
      const dateOnly = new Date(`${source}T00:00:00`);
      return Number.isNaN(dateOnly.getTime()) ? null : dateOnly;
    }

    const parsed = new Date(source);
    if (!Number.isNaN(parsed.getTime())) return parsed;

    const slashDate = source.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/);
    if (slashDate) {
      const day = Number(slashDate[1]);
      const month = Number(slashDate[2]) - 1;
      const year = Number(slashDate[3]);
      const hour = Number(slashDate[4] || "0");
      const minute = Number(slashDate[5] || "0");
      const local = new Date(year, month, day, hour, minute);
      if (!Number.isNaN(local.getTime())) return local;
    }

    const monthMap: Record<string, number> = {
      jan: 0, ene: 0,
      feb: 1,
      mar: 2,
      apr: 3, abr: 3,
      may: 4,
      jun: 5,
      jul: 6,
      aug: 7, ago: 7,
      sep: 8, set: 8,
      oct: 9,
      nov: 10,
      dec: 11, dic: 11,
    };
    const textDate = source.toLowerCase().match(/^(\d{1,2})\s+([a-z.]+)\s+(\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/);
    if (textDate) {
      const day = Number(textDate[1]);
      const monthKey = textDate[2].replace(/\./g, "");
      const month = monthMap[monthKey];
      const year = Number(textDate[3]);
      const hour = Number(textDate[4] || "0");
      const minute = Number(textDate[5] || "0");
      if (month !== undefined) {
        const local = new Date(year, month, day, hour, minute);
        if (!Number.isNaN(local.getTime())) return local;
      }
    }

    return null;
  };

  const formatDate = (d: string | undefined, includeTimeOverride?: boolean) => {
    if (!d) return "";
    try {
      const dateObj = parseDateInput(d);
      if (!dateObj) return d;

      const hasExplicitTime = /T\d{2}:\d{2}|\s\d{1,2}:\d{2}/.test(d);
      const includeTime = includeTimeOverride ?? (column.dateFormat?.includeTime ?? false);
      const showTime = includeTime && hasExplicitTime;
      const format = column.dateFormat?.format || "friendly";

      if (format === "iso") {
        const yyyy = String(dateObj.getFullYear());
        const mm = String(dateObj.getMonth() + 1).padStart(2, "0");
        const dd = String(dateObj.getDate()).padStart(2, "0");
        const dateIso = `${yyyy}-${mm}-${dd}`;
        if (!showTime) return dateIso;
        const hh = String(dateObj.getHours()).padStart(2, "0");
        const min = String(dateObj.getMinutes()).padStart(2, "0");
        return `${dateIso} ${hh}:${min}`;
      }

      if (format === "relative") {
        const diffMs = dateObj.getTime() - Date.now();
        const absMs = Math.abs(diffMs);
        const rtf = new Intl.RelativeTimeFormat("es-PE", { numeric: "auto" });

        let relativeText: string;
        if (absMs < 3_600_000) {
          relativeText = rtf.format(Math.round(diffMs / 60_000), "minute");
        } else if (absMs < 86_400_000) {
          relativeText = rtf.format(Math.round(diffMs / 3_600_000), "hour");
        } else if (absMs < 2_592_000_000) {
          relativeText = rtf.format(Math.round(diffMs / 86_400_000), "day");
        } else if (absMs < 31_536_000_000) {
          relativeText = rtf.format(Math.round(diffMs / 2_592_000_000), "month");
        } else {
          relativeText = rtf.format(Math.round(diffMs / 31_536_000_000), "year");
        }

        if (!showTime) return relativeText;
        const timeText = dateObj.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });
        return `${relativeText} · ${timeText}`;
      }

      if (format === "short") {
        const shortDate = dateObj.toLocaleDateString("es-PE", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        });
        if (!showTime) return shortDate;
        const timeText = dateObj.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });
        return `${shortDate} ${timeText}`;
      }

      return dateObj.toLocaleString("es-PE", {
        year: "numeric",
        month: "short",
        day: "numeric",
        ...(showTime ? { hour: "2-digit", minute: "2-digit" } : {}),
      });
    } catch {
      return d;
    }
  };
  const [editText, setEditText] = useState("");
  const [showSelect, setShowSelect] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const cellRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const colType = column.type;
  const cellType = normalizeStoredCellType(cell?.type);

  // ── Helper: start text editing ──
  const startTextEdit = (initialValue?: string) => {
    if (readonly) return;
    setEditText(initialValue ?? cell?.text ?? cell?.url ?? String(cell?.number ?? ""));
    setIsEditing(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  /** Parse number from text with alias support: 10k, 10m, 10b, commas, decimals */
  const parseNumberAlias = (raw: string): number | undefined => {
    if (!raw || !raw.trim()) return undefined;
    let s = raw.trim().replace(/\s/g, "").replace(/,/g, "."); // commas as decimals
    // Remove currency symbols
    s = s.replace(/^[\$€S\/\.]+/, "").replace(/[\$€]+$/, "");
    // Multiplier aliases
    const aliasMatch = s.match(/^([+-]?[\d.]+)\s*([kKmMbBdD])$/);
    if (aliasMatch) {
      const base = parseFloat(aliasMatch[1]);
      const suffix = aliasMatch[2].toLowerCase();
      if (isNaN(base)) return undefined;
      const multipliers: Record<string, number> = { k: 1_000, m: 1_000_000, b: 1_000_000_000, d: 1 };
      return base * (multipliers[suffix] || 1);
    }
    const n = parseFloat(s);
    return isNaN(n) ? undefined : n;
  };

  /** Format a number for display using column config */
  const formatNumber = (n: number | undefined): string => {
    if (n === undefined || n === null) return "";
    const fmt = column.numberFormat || {};
    const currency = fmt.currency || "none";
    const decimals = fmt.decimals;
    const decimalOptions =
      typeof decimals === "number"
        ? { minimumFractionDigits: decimals, maximumFractionDigits: decimals }
        : undefined;
    if (currency === "percent") {
      return `${n.toLocaleString("es-PE", decimalOptions)}%`;
    }
    const currencyMap: Record<string, { code: string; symbol: string }> = {
      pen: { code: "PEN", symbol: "S/" },
      usd: { code: "USD", symbol: "$" },
      eur: { code: "EUR", symbol: "€" },
      gbp: { code: "GBP", symbol: "£" },
      jpy: { code: "JPY", symbol: "¥" },
      aud: { code: "AUD", symbol: "A$" },
      cad: { code: "CAD", symbol: "C$" },
      sgd: { code: "SGD", symbol: "S$" },
      rub: { code: "RUB", symbol: "₽" },
      inr: { code: "INR", symbol: "₹" },
      krw: { code: "KRW", symbol: "₩" },
      cny: { code: "CNY", symbol: "¥" },
      brl: { code: "BRL", symbol: "R$" },
    };
    const cur = currencyMap[currency];
    if (cur) {
      return `${cur.symbol} ${n.toLocaleString("es-PE", decimalOptions)}`;
    }
    return n.toLocaleString("es-PE", decimalOptions);
  };


  const getUserLabel = (user: WorkspaceMemberLike) => {
    const fmt = column.personFormat || "name";
    if (fmt === "email") return user.email || user.primaryEmail || user.name || "User";
    return getWorkspaceMemberLabel(user, "User");
  };


  const toMetaUserRef = (raw?: string) => {
    const value = (raw || "").trim();
    if (!value) return { id: "system", displayName: "System" };
    if (value.includes("@")) {
      return users.find((u) => u?.primaryEmail === value || u?.email === value)
    }
    
    const pos =  users.find((u) => u?.id === value || u?.userId === value);
    if (pos) return pos;

    return users.find((u) => getWorkspaceMemberLabel(u, "") === value) || { id: value, name: value };
  };

  const getDocumentLabel = (doc: { id: string; name?: string }) => {
    const base = doc.name || "Page";
    if ((column.documentFormat || "name") === "full") {
      return `${base} (${doc.id.slice(0, 8)})`;
    }
    return base;
  };

  const formatPhoneDisplay = (raw?: string) => {
    const value = (raw || "").trim();
    if (!value) return "";

    const country = PHONE_COUNTRIES.find((c) => c.code === column.phoneFormat?.country);
    if (!country) return value;
    if (value.startsWith("+")) return value;

    const digits = value.replace(/[^\d]/g, "");
    if (!digits) return value;

    const dialDigits = country.dial.replace(/\D/g, "");
    if (digits.startsWith(dialDigits)) {
      return `+${digits}`;
    }

    return `${country.dial} ${digits}`;
  };

  const commitTextEdit = () => {
    setIsEditing(false);
    if (!onCellChange) return;
    const ct = cellType || "text";
    if (ct === "number") {
      const parsed = parseNumberAlias(editText);
      onCellChange({ ...cell, type: "number", number: parsed });
    }
    else if (ct === "url") onCellChange({ ...cell, type: "url", url: editText });
    else onCellChange({ ...cell, type: "text", text: editText });
  };

  // ── Magic / Metadata Columns (Read-only) ──
  if (colType === "created_time" || colType === "last_edited_time") {
    const val = colType === "created_time" ? row._createdAt : row._lastEditedAt;
    return <span className="text-xs text-muted-foreground/60">{formatDate(val, column.dateFormat?.includeTime ?? true)}</span>;
  }
  if (colType === "created_by" || colType === "last_edited_by") {
    const val = colType === "created_by" ? row._createdBy : row._lastEditedBy;
    const metaUser = toMetaUserRef(val);;
    return (
      <div className="w-full min-h-[24px] flex items-center">
        <RefPill
          type="user"
          id={metaUser!.id!}
          name={metaUser!.name || "System"}
          label={getUserLabel(metaUser!)}
          workspaceUsers={users}
        />
      </div>
    );
  }

  if (colType === "date") {
    const hasVal = cell && !!(cell.start && cell.start.trim());
    return (
      <div ref={cellRef} className={cn("w-full min-h-[24px] flex items-center cursor-pointer", column.wrap && "py-1")}
        onClick={() => { if (!readonly) setShowDatePicker(true); }}>
        {hasVal ? (
          <span className="text-xs text-muted-foreground">{formatDate(cell!.start)}{cell!.end ? ` → ${formatDate(cell!.end)}` : ""}</span>
        ) : cell && (cell.text || cell.value) ? (
          <span className="text-sm truncate max-w-[280px]">{cell.text || cell.value}</span>
        ) : (
          <span className="text-muted-foreground/30 text-xs hover:text-muted-foreground/50 transition-colors">{emptyLabel}</span>
        )}
        {showDatePicker && cellRef.current && (
          <InlineDatePicker anchorRect={cellRef.current.getBoundingClientRect()} value={cell?.type === "date" ? { start: cell.start, end: cell.end } : undefined}
            onSelect={(start, end) => { onCellChange?.({ type: "date", start, end }); setShowDatePicker(false); }}
            onClose={() => setShowDatePicker(false)} />
        )}
      </div>
    );
  }
  if (colType === "select" || colType === "multi_select" || colType === "status") {
    const hasOptions = column.options && column.options.length > 0;
    const isMulti = colType === "multi_select";
    const valNames = isMulti ? (cell?.items || []).map(i => i.name) : (cell?.name || "");

    return (
      <div ref={cellRef} className={cn("w-full min-h-[24px] flex items-center cursor-pointer", column.wrap && "py-1")}
        onClick={() => { if (!readonly && hasOptions) setShowSelect(true); }}>
        {isMulti ? (
          (cell?.items || []).length > 0 ? (
            <div className="flex gap-1 flex-wrap">
              {cell!.items!.map((x, i) => (
                <span key={i} className={`px-2 py-0.5 rounded-full text-xs font-medium ${getPillClass(x.color)}`}>{x.name}</span>
              ))}
            </div>
          ) : <span className="text-muted-foreground/30 text-xs hover:text-muted-foreground/50 transition-colors">{emptyLabel}</span>
        ) : (
          cell?.name ? (
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getPillClass(cell.color)} hover:opacity-80 transition-opacity`}>{cell.name}</span>
          ) : <span className="text-muted-foreground/30 text-xs hover:text-muted-foreground/50 transition-colors">{emptyLabel}</span>
        )}
        {showSelect && column.options && cellRef.current && (
          <SelectDropdown options={column.options} value={valNames} multi={isMulti}
            onSelect={name => {
              if (isMulti) {
                const current = cell?.items || [];
                const exists = current.find(i => i.name === name);
                const newItems = exists ? current.filter(i => i.name !== name) : [...current, { name, color: column.options!.find(o => o.name === name)?.color || "default" }];
                onCellChange?.({ type: "multi_select", items: newItems });
              } else {
                const opt = column.options!.find(o => o.name === name);
                onCellChange?.({ type: colType, name, color: opt?.color || "default" });
                setShowSelect(false);
              }
            }}
            onClose={() => setShowSelect(false)} anchorRect={cellRef.current.getBoundingClientRect()} />
        )}
      </div>
    );
  }

  const relationPickerType: "user" | "doc" | "board" | "card" | null =
    colType === "people"
      ? "user"
      : colType === "board"
        ? "board"
        : colType === "card"
          ? "card"
          : (colType === "document" || colType === "relation")
            ? "doc"
            : null;

  if (relationPickerType) {
    const openPicker = () => {
      if (!readonly && cellRef.current) {
        onOpenReferencePicker?.({
          rowId: row.id,
          colId: column.id,
          type: relationPickerType,
          rect: cellRef.current.getBoundingClientRect(),
        });
      }
    };

    const clearRelation = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (readonly) return;
      onCellChange?.(createDefaultCell(colType));
    };

    if (relationPickerType === "user") {
      const usersInCell = (cell?.users || []).map((u) => toMetaUserRef(u.id || u.email || "")!);
      const hasUsers = usersInCell.length > 0;
      return (
        <div ref={cellRef} className={cn("w-full min-h-[24px] flex items-center cursor-pointer pr-6", column.wrap && "py-1")} onClick={openPicker}>
          {hasUsers ? (
            <div className="flex items-center gap-1 flex-wrap">
              {usersInCell.map((u, i) => (
                <RefPill
                  key={i}
                  type="user"
                  id={u.id || u.email || String(i)}
                  name={u.name || u.email || "User"}
                  label={getUserLabel(u)}
                  workspaceUsers={users}
                />
              ))}
              {!readonly && (
                <button
                  type="button"
                  onClick={clearRelation}
                  className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover/row:opacity-100 inline-flex h-5 w-5 items-center justify-center rounded-md text-destructive/50 hover:text-destructive hover:bg-destructive/10 transition-all shadow-sm bg-background border border-border"
                  aria-label="Clear people value"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          ) : <span className="text-muted-foreground/30 text-xs hover:text-muted-foreground/50 transition-colors uppercase">{emptyLabel}</span>}
        </div>
      );
    }

    if (relationPickerType === "doc") {
      const docsInCell = cell?.documents || [];
      const hasDocs = docsInCell.length > 0;
      return (
        <div ref={cellRef} className={cn("w-full min-h-[24px] flex items-center cursor-pointer pr-6", column.wrap && "py-1")} onClick={openPicker}>
          {hasDocs ? (
            <div className="flex items-center gap-1 flex-wrap">
              {docsInCell.map((doc, i) => (
                <RefPill key={i} type="doc" id={doc.id} name={doc.name || "Page"} label={getDocumentLabel(doc)} />
              ))}
              {!readonly && (
                <button
                  type="button"
                  onClick={clearRelation}
                  className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover/row:opacity-100 inline-flex h-5 w-5 items-center justify-center rounded-md text-destructive/50 hover:text-destructive hover:bg-destructive/10 transition-all shadow-sm bg-background border border-border"
                  aria-label="Clear relation value"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          ) : <span className="text-muted-foreground/30 text-xs hover:text-muted-foreground/50 transition-colors uppercase">{emptyLabel}</span>}
        </div>
      );
    }

    if (relationPickerType === "board") {
      const boardsInCell = cell?.boards || [];
      const hasBoards = boardsInCell.length > 0;
      return (
        <div ref={cellRef} className={cn("w-full min-h-[24px] flex items-center cursor-pointer pr-6", column.wrap && "py-1")} onClick={openPicker}>
          {hasBoards ? (
            <div className="flex items-center gap-1 flex-wrap">
              {boardsInCell.map((b, i) => (
                <RefPill key={i} type="board" id={b.id} name={b.name || "Board"} />
              ))}
              {!readonly && (
                <button
                  type="button"
                  onClick={clearRelation}
                  className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover/row:opacity-100 inline-flex h-5 w-5 items-center justify-center rounded-md text-destructive/50 hover:text-destructive hover:bg-destructive/10 transition-all shadow-sm bg-background border border-border"
                  aria-label="Clear board value"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          ) : <span className="text-muted-foreground/30 text-xs hover:text-muted-foreground/50 transition-colors uppercase">{emptyLabel}</span>}
        </div>
      );
    }

    const cardsInCell = cell?.cards || [];
    const hasCards = cardsInCell.length > 0;
    return (
      <div ref={cellRef} className={cn("w-full min-h-[24px] flex items-center cursor-pointer pr-6", column.wrap && "py-1")} onClick={openPicker}>
        {hasCards ? (
          <div className="flex items-center gap-1 flex-wrap">
            {cardsInCell.map((c, i) => (
              <RefPill key={i} type="card" id={c.id} name={c.name || "Card"} />
            ))}
            {!readonly && (
              <button
                type="button"
                onClick={clearRelation}
                className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover/row:opacity-100 inline-flex h-5 w-5 items-center justify-center rounded-md text-destructive/50 hover:text-destructive hover:bg-destructive/10 transition-all shadow-sm bg-background border border-border"
                aria-label="Clear card value"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        ) : <span className="text-muted-foreground/30 text-xs hover:text-muted-foreground/50 transition-colors uppercase">{emptyLabel}</span>}
      </div>
    );
  }

  // ── Null / empty cell: entire cell is clickable ──
  if (!cell) {
    if (readonly) return <span className="text-muted-foreground/20 text-xs">—</span>;

    // Checkbox
    if (colType === "checkbox") {
      return (
        <div ref={cellRef} className="w-full min-h-[24px] flex items-center cursor-pointer"
          onClick={() => onCellChange?.({ type: "checkbox", checked: true })}>
          <Square className="w-4 h-4 text-muted-foreground/30 hover:text-muted-foreground/60 transition-colors" />
        </div>
      );
    }

    // Relation-like columns should open the reference picker instead of text editing
    if (colType === "people" || colType === "document" || colType === "relation" || colType === "board" || colType === "card") {
      const pickerType = colType === "people"
        ? "user"
        : colType === "board"
          ? "board"
          : colType === "card"
            ? "card"
            : "doc";
      return (
        <div
          ref={cellRef}
          className={cn("w-full min-h-[24px] flex items-center cursor-pointer", column.wrap && "py-1")}
          onClick={() => {
            if (!readonly && cellRef.current) {
              onOpenReferencePicker?.({
                rowId: row.id,
                colId: column.id,
                type: pickerType,
                rect: cellRef.current.getBoundingClientRect(),
              });
            }
          }}
        >
          <span className="text-muted-foreground/30 text-xs hover:text-muted-foreground/50 transition-colors uppercase">{emptyLabel}</span>
        </div>
      );
    }



    // Text-like: entire cell clickable
    if (isEditing) {
      return (
        <input ref={inputRef} value={editText} onChange={e => setEditText(e.target.value)}
          onBlur={() => { setIsEditing(false); if (editText.trim()) onCellChange?.({ type: "text", text: editText }); }}
          onKeyDown={e => { e.stopPropagation(); if (e.key === "Enter") { setIsEditing(false); if (editText.trim()) onCellChange?.({ type: "text", text: editText }); } if (e.key === "Escape") setIsEditing(false); }}
          className="w-full bg-transparent outline-none text-sm text-foreground px-0" />
      );
    }

    return (
      <div className="w-full min-h-[24px] flex items-center cursor-text" onClick={() => startTextEdit("")}>
        <span className="text-muted-foreground/30 text-xs hover:text-muted-foreground/50 transition-colors">{emptyLabel}</span>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════
  // Existing cell rendering — entire cells are interactive
  // ══════════════════════════════════════════════════════════════

  // Text
  if (cellType === "text") {
    if (isEditing) return (
      <input ref={inputRef} value={editText} onChange={e => setEditText(e.target.value)}
        onBlur={commitTextEdit} onKeyDown={e => { e.stopPropagation(); if (e.key === "Enter") commitTextEdit(); if (e.key === "Escape") setIsEditing(false); }}
        className="w-full bg-transparent outline-none text-sm px-0" />
    );
    const rawText = cell.text || "";
    const displayText = colType === "phone_number" ? formatPhoneDisplay(rawText) : rawText;
    const hasContent = !!(displayText && displayText.trim());
    // Check if text contains LaTeX ($..$ or $$..$$)
    const hasFormula = colType !== "phone_number" && hasContent && (rawText.includes("$") || rawText.includes("\\"));
    return (
      <div className={cn("w-full min-h-[24px] flex items-center cursor-text", column.wrap && "py-1")} onClick={() => startTextEdit(rawText)}>
        {hasContent ? (
          hasFormula ? (
            <RichText content={rawText} context={{ documents: [], boards: [], activeBricks: [], users: [] }} className="text-sm" />
          ) : (
            <span className={cn("text-sm max-w-[280px]", column.wrap ? "whitespace-normal break-words" : "truncate")}>{displayText}</span>
          )
        ) : (
          <span className="text-muted-foreground/30 text-xs">{emptyLabel}</span>
        )}
      </div>
    );
  }


  // Checkbox
  if (cellType === "checkbox") {
    const Icon = cell.checked ? CheckSquare : Square;
    return (
      <div className="w-full min-h-[24px] flex items-center cursor-pointer"
        onClick={() => { if (!readonly) onCellChange?.({ type: "checkbox", checked: !cell.checked }); }}>
        <Icon className={cn("w-4 h-4 transition-colors", cell.checked ? "text-accent" : "text-muted-foreground/40 hover:text-accent")} />
      </div>
    );
  }


  // URL
  if (cellType === "url") {
    if (isEditing) return (
      <input ref={inputRef} value={editText} onChange={e => setEditText(e.target.value)}
        onBlur={commitTextEdit} onKeyDown={e => { e.stopPropagation(); if (e.key === "Enter") commitTextEdit(); if (e.key === "Escape") setIsEditing(false); }}
        className="w-full bg-transparent outline-none text-sm px-0 text-accent" />
    );
    const hasUrl = !!(cell.url && cell.url.trim());
    return (
      <div className={cn("w-full min-h-[24px] flex items-center", column.wrap && "py-1")}>
        {hasUrl ? (
          <a href={cell.url} target="_blank" rel="noreferrer"
            className={cn("text-accent hover:underline text-xs", column.wrap ? "whitespace-normal break-all" : "truncate max-w-[200px]")}
            onDoubleClick={e => { e.preventDefault(); startTextEdit(cell.url || ""); }}>{cell.url}</a>
        ) : (
          <div className="w-full cursor-text" onClick={() => startTextEdit("")}>
            <span className="text-muted-foreground/30 text-xs hover:text-muted-foreground/50 transition-colors">{emptyLabel}</span>
          </div>
        )}
      </div>
    );
  }

  // Number
  if (cellType === "number") {
    if (isEditing) return (
      <input ref={inputRef} value={editText} onChange={e => setEditText(e.target.value)}
        onBlur={commitTextEdit} onKeyDown={e => { e.stopPropagation(); if (e.key === "Enter") commitTextEdit(); if (e.key === "Escape") setIsEditing(false); }}
        placeholder="0"
        className="w-full bg-transparent outline-none text-sm px-0 font-mono" />
    );
    const hasValue = cell.number !== undefined && cell.number !== null;
    const mode = column.numberFormat?.display || "number";
    const val = cell.number || 0;

    // For bar/ring, we usually assume a range or percentage.
    // If currency is percent, use the value directly. Otherwise assume 0-100 or dynamic.
    const percent = column.numberFormat?.currency === "percent" ? val : Math.min(Math.max(val, 0), 100);

    return (
      <div className="w-full min-h-[24px] flex items-center gap-3 cursor-text" onClick={() => startTextEdit(hasValue ? String(cell.number) : "")}>
        {hasValue ? (
          <>
            {mode === "number" && <span className="font-mono text-sm">{formatNumber(cell.number)}</span>}
            {mode === "bar" && (
              <div className="flex items-center gap-2 w-full max-w-[120px]">
                <div className="h-2 flex-1 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-accent transition-all duration-500" style={{ width: `${percent}%` }} />
                </div>
                <span className="font-mono text-[10px] text-muted-foreground w-8 text-right">{formatNumber(cell.number)}</span>
              </div>
            )}
            {mode === "ring" && (
              <div className="flex items-center gap-2">
                <div className="relative h-4 w-4">
                  <svg className="h-full w-full -rotate-90">
                    <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" fill="transparent" className="text-muted" />
                    <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" fill="transparent" className="text-accent"
                      strokeDasharray={37.7} strokeDashoffset={37.7 - (37.7 * percent) / 100} strokeLinecap="round" />
                  </svg>
                </div>
                <span className="font-mono text-xs">{formatNumber(cell.number)}</span>
              </div>
            )}
          </>
        ) : (
          <span className="text-muted-foreground/30 text-xs">{emptyLabel}</span>
        )}
      </div>
    );
  }

  // User
  if (cellType === "user") {
    const hasUsers = (cell.users || []).length > 0;
    return (
      <div ref={cellRef} className={cn("w-full min-h-[24px] flex items-center cursor-pointer", column.wrap && "py-1")}
        onClick={() => {
          if (!readonly && cellRef.current) {
            onOpenReferencePicker?.({ rowId: row.id, colId: column.id, type: "user", rect: cellRef.current.getBoundingClientRect() });
          }
        }}>
        {hasUsers ? (
          <div className="flex gap-1 flex-wrap">{cell.users!.map((u, i) => (
            <RefPill
              key={i}
              type="user"
              id={u.id || u.email || String(i)}
              name={u.name || u.email || "User"}
              label={getUserLabel(u)}
              workspaceUsers={users}
            />
          ))}</div>
        ) : <span className="text-muted-foreground/30 text-xs hover:text-muted-foreground/50 transition-colors uppercase">{emptyLabel}</span>}
      </div>
    );
  }

  // Document (relation)
  if (cellType === "document") {
    const has = (cell.documents || []).length > 0;
    return (
      <div ref={cellRef} className={cn("w-full min-h-[24px] flex items-center cursor-pointer", column.wrap && "py-1")}
        onClick={() => {
          if (!readonly && cellRef.current) {
            onOpenReferencePicker?.({ rowId: row.id, colId: column.id, type: "doc", rect: cellRef.current.getBoundingClientRect() });
          }
        }}>
        {has ? (
          <div className="flex gap-1 flex-wrap">{cell.documents!.map((doc, i) => (
            <RefPill key={i} type="doc" id={doc.id} name={doc.name || "Page"} label={getDocumentLabel(doc)} />
          ))}</div>
        ) : <span className="text-muted-foreground/30 text-xs hover:text-muted-foreground/50 transition-colors uppercase">{emptyLabel}</span>}
      </div>
    );
  }

  // Board
  if (cellType === "board") {
    const has = (cell.boards || []).length > 0;
    return (
      <div ref={cellRef} className={cn("w-full min-h-[24px] flex items-center cursor-pointer", column.wrap && "py-1")}
        onClick={() => {
          if (!readonly && cellRef.current) {
            onOpenReferencePicker?.({ rowId: row.id, colId: column.id, type: "board", rect: cellRef.current.getBoundingClientRect() });
          }
        }}>
        {has ? (
          <div className="flex gap-1 flex-wrap">{cell.boards!.map((b, i) => (
            <RefPill key={i} type="board" id={b.id} name={b.name || "Board"} />
          ))}</div>
        ) : <span className="text-muted-foreground/30 text-xs hover:text-muted-foreground/50 transition-colors uppercase">{emptyLabel}</span>}
      </div>
    );
  }

  // Card
  if (cellType === "card") {
    const has = (cell.cards || []).length > 0;
    return (
      <div ref={cellRef} className={cn("w-full min-h-[24px] flex items-center cursor-pointer", column.wrap && "py-1")}
        onClick={() => {
          if (!readonly && cellRef.current) {
            onOpenReferencePicker?.({ rowId: row.id, colId: column.id, type: "card", rect: cellRef.current.getBoundingClientRect() });
          }
        }}>
        {has ? (
          <div className="flex gap-1 flex-wrap">{cell.cards!.map((c, i) => (
            <RefPill key={i} type="card" id={c.id} name={c.name || "Card"} />
          ))}</div>
        ) : <span className="text-muted-foreground/30 text-xs hover:text-muted-foreground/50 transition-colors uppercase">{emptyLabel}</span>}
      </div>
    );
  }

  // Magic columns (read-only metadata)
  if (column.type === "created_time") return <div className="text-xs text-muted-foreground/60">{formatDate(row._createdAt, column.dateFormat?.includeTime ?? true)}</div>;
  if (column.type === "created_by") {
    const metaUser = toMetaUserRef(row._createdBy)!;
    return (
      <div className="w-full min-h-[24px] flex items-center">
        <RefPill type="user" id={metaUser.id!} name={metaUser.name || "System"} label={getUserLabel(metaUser)} workspaceUsers={users} />
      </div>
    );
  }
  if (column.type === "last_edited_time") return <div className="text-xs text-muted-foreground/60">{formatDate(row._lastEditedAt, column.dateFormat?.includeTime ?? true)}</div>;
  if (column.type === "last_edited_by") {
    const metaUser = toMetaUserRef(row._lastEditedBy)!;
    
    return (
      <div className="w-full min-h-[24px] flex items-center">
        <RefPill type="user" id={metaUser.id!} name={metaUser.name || "System"} label={getUserLabel(metaUser)} workspaceUsers={users} />
      </div>
    );
  }

  // Fallback — render with RichText if contains formatting, otherwise plain
  const fallbackText = cell.text || cell.value || (typeof cell === "object" ? JSON.stringify(cell) : String(cell));
  return (
    <div className="w-full min-h-[24px] flex items-center cursor-text" onClick={() => startTextEdit(fallbackText)}>
      <span className="text-muted-foreground truncate max-w-[200px] text-sm">{fallbackText}</span>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export const UnifiedBountifulTable: React.FC<UnifiedBountifulTableProps> = ({
  id, title, columns: initColumns, rows: initRows, readonly = false,
  onUpdate, onPatchCell, onPatchColumn, onAddColumn, onRemoveColumn, onDuplicateColumn,
  documents = [], boards = [], users = [], activeBricks = [],
}) => {
  const t = useTranslations("document-detail");
  const { activeTeamId, accessToken, user } = useSession();
  const currentUserId = user?.id ?? user?.name ?? "unknown";
  const [columns, setColumns] = useState<BountifulColumn[]>(() => normalizeColumnOptions(initColumns));
  const [rows, setRows] = useState<BountifulRow[]>(initRows);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [draftTitle, setDraftTitle] = useState(title || "");
  const headerRefs = useRef<Record<string, HTMLTableCellElement | null>>({});
  const isInternalUpdate = useRef(false);

  useEffect(() => {
    if (isInternalUpdate.current) { isInternalUpdate.current = false; return; }
    setColumns(normalizeColumnOptions(initColumns));
  }, [initColumns]);
  useEffect(() => {
    if (isInternalUpdate.current) { isInternalUpdate.current = false; return; }
    setRows(initRows);
  }, [initRows]);
  const displayedColumns = columns.filter(c => !c.hidden);

  const [headerMenu, setHeaderMenu] = useState<{ colId: string; rect: DOMRect } | null>(null);
  const [showFilterWorkbench, setShowFilterWorkbench] = useState(false);
  const [filterWorkbenchRect, setFilterWorkbenchRect] = useState<DOMRect | null>(null);
  const [filterWorkbenchColId, setFilterWorkbenchColId] = useState<string | null>(null);
  const [showSortWorkbench, setShowSortWorkbench] = useState(false);
  const [sortWorkbenchRect, setSortWorkbenchRect] = useState<DOMRect | null>(null);
  const [showVisibilityManager, setShowVisibilityManager] = useState<{ rect: DOMRect } | null>(null);
  const [showAIModalColId, setShowAIModalColId] = useState<string | null>(null);
  const [aiUsage, setAiUsage] = useState(0);

  const [pickerState, setPickerState] = useState<{
    rowId: string;
    colId: string;
    rect: DOMRect;
    type: "user" | "doc" | "board" | "card";
  } | null>(null);

  // Fetch real usage when AI modal is about to show
  useEffect(() => {
    if (showAIModalColId && activeTeamId && accessToken) {
      fetchApi<{ creditsUsed: number }>(`/ai/team/${activeTeamId}/usage`, { accessToken })
        .then(res => setAiUsage(res.creditsUsed || 0))
        .catch(err => console.error("Error fetching AI usage", err));
    }
  }, [showAIModalColId, activeTeamId, accessToken]);

  const onUpdateDocument = (updates: Partial<{ title: string; columns: BountifulColumn[]; rows: BountifulRow[] }>) => {
    onUpdate?.({ title: title || "", columns, rows, ...updates });
  };

  useEffect(() => { setDraftTitle(title || ""); }, [title]);

  const emitUpdate = useCallback((cols: BountifulColumn[], rws: BountifulRow[], ttl?: string) => {
    isInternalUpdate.current = true;
    onUpdate?.({ title: ttl ?? draftTitle, columns: cols, rows: rws });
  }, [onUpdate, draftTitle]);

  // Debounced version for high-frequency edits (cell typing, option editing)
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debouncedEmitUpdate = useCallback((cols: BountifulColumn[], rws: BountifulRow[], ttl?: string) => {
    // Update local state immediately (already done by callers), but delay the API call
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      emitUpdate(cols, rws, ttl);
    }, 300);
  }, [emitUpdate]);

  const handleReferenceSelect = (item: ReferencePickerSelection) => {
    if (!pickerState) return;
    const { rowId, colId, type } = pickerState;
    let newCell: BountifulCell | null = null;

    if (type === "user") {
      const match = item.token.match(/@\[user:([^:]+):([^\]]+)\]/);
      const uid = match?.[1] || "";
      const uname = match?.[2] || item.label;
      newCell = { type: "user", users: [{ id: uid, name: uname }] };
    } else if (type === "doc") {
      // Could be complex token $[docId:...] or simple @[doc:id:name]
      let docId = "";
      let docName = item.label;
      const simpleMatch = item.token.match(/@\[doc:([^:]+):([^\]]+)\]/);
      if (simpleMatch) {
        docId = simpleMatch[1];
        docName = simpleMatch[2];
      } else {
        const deepMatch = item.token.match(/\$\[([^:]+):/);
        if (deepMatch) docId = deepMatch[1];
      }
      if (docId) newCell = { type: "document", documents: [{ id: docId, name: docName }] };
    } else if (type === "board") {
      const match = item.token.match(/@\[board:([^:]+):([^\]]+)\]/);
      if (match) newCell = { type: "board", boards: [{ id: match[1], name: match[2] }] };
    } else if (type === "card") {
      const match = item.token.match(/@\[card:([^:]+):([^\]]+)\]/);
      if (match) newCell = { type: "card", cards: [{ id: match[1], name: match[2] }] };
    }

    if (newCell) {
      handleCellChange(rowId, colId, newCell);
    }
    setPickerState(null);
  };

  const handleFilterChange = (colId: string, operator: string, value: string) => {
    let nf = [...filterConfig].filter(f => f.colId !== colId);
    if (value || ["empty", "not_empty", "date_today", "date_this_week"].includes(operator)) {
      nf.push({ colId, operator, value });
    }
    setFilterConfig(nf);
  };

  const removeFilter = (colId: string) => {
    setFilterConfig(prev => prev.filter(f => f.colId !== colId));
  };

  const clearAllFilters = () => setFilterConfig([]);

  const openFilterWorkbench = (colId?: string, rect?: DOMRect | null) => {
    const fallbackColId = colId || filterConfig[0]?.colId || displayedColumns[0]?.id || columns[0]?.id || null;
    setFilterWorkbenchColId(fallbackColId);
    if (rect !== undefined) setFilterWorkbenchRect(rect);
    setShowFilterWorkbench(true);
    setShowSortWorkbench(false);
  };

  const openSortWorkbench = (rect?: DOMRect | null) => {
    if (rect !== undefined) setSortWorkbenchRect(rect);
    setShowSortWorkbench(true);
    setShowFilterWorkbench(false);
  };

  const handleCellChange = (rowId: string, colId: string, newCell: BountifulCell) => {
    const now = new Date().toISOString();
    const enriched = { ...newCell, _lastEditedAt: now, _createdAt: newCell._createdAt || now };
    const rowMeta = { _lastEditedAt: now, _lastEditedBy: currentUserId };
    const nr = rows.map(r => r.id !== rowId ? r : {
      ...r,
      ...rowMeta,
      cells: { ...r.cells, [colId]: enriched }
    });
    setRows(nr);
    if (onPatchCell) {
      onPatchCell(rowId, colId, enriched, rowMeta);
    } else {
      emitUpdate(columns, nr);
    }
  };

  const addRow = () => {
    const now = new Date().toISOString();
    const nr = [...rows, {
      id: `row-${Date.now()}`,
      _createdAt: now,
      _lastEditedAt: now,
      _createdBy: currentUserId,
      _lastEditedBy: currentUserId,
      cells: Object.fromEntries(columns.map(c => [c.id, null]))
    }];
    setRows(nr); emitUpdate(columns, nr);
  };
  const removeRow = (rowId: string) => { const nr = rows.filter(r => r.id !== rowId); setRows(nr); emitUpdate(columns, nr); };

  const insertColumn = (atIndex: number) => {
    const nc2: BountifulColumn = { id: `col-${Date.now()}`, name: `${t("bountifulTable.colNewName" as any)} ${columns.length + 1}`, type: "rich_text" };
    const nc = [...columns]; nc.splice(atIndex, 0, nc2);
    const nr = rows.map(r => ({ ...r, cells: { ...r.cells, [nc2.id]: null } }));
    setColumns(nc); setRows(nr);
    if (onAddColumn) { onAddColumn(nc2, atIndex); }
    else { emitUpdate(nc, nr); }
  };
  const addColumn = () => insertColumn(columns.length);

  const removeColumn = (colId: string) => {
    if (columns.length <= 1) return;
    const nc = columns.filter(c => c.id !== colId);
    const nr = rows.map(r => { const { [colId]: _, ...rest } = r.cells; return { ...r, cells: rest }; });
    setColumns(nc); setRows(nr);
    if (onRemoveColumn) { onRemoveColumn(colId); }
    else { emitUpdate(nc, nr); }
  };

  const duplicateColumn = (colId: string) => {
    const srcIdx = columns.findIndex(c => c.id === colId); if (srcIdx < 0) return;
    const src = columns[srcIdx];
    const nc2: BountifulColumn = { ...src, id: `col-${Date.now()}`, name: `${src.name} (copia)` };
    const nc = [...columns]; nc.splice(srcIdx + 1, 0, nc2);
    const nr = rows.map(r => ({ ...r, cells: { ...r.cells, [nc2.id]: r.cells[colId] ? { ...r.cells[colId]! } : null } }));
    setColumns(nc); setRows(nr);
    if (onDuplicateColumn) { onDuplicateColumn(colId, nc2.id, nc2.name, srcIdx + 1); }
    else if (onAddColumn) { onAddColumn(nc2, srcIdx + 1); }
    else { emitUpdate(nc, nr); }
  };

  const renameColumn = (colId: string, name: string) => {
    const nc = columns.map(c => c.id === colId ? { ...c, name } : c);
    setColumns(nc);
    if (onPatchColumn) { onPatchColumn(colId, { name }); }
    else { emitUpdate(nc, rows); }
  };

  const changeColumnType = (colId: string, newType: string) => {
    const needs = newType === "select" || newType === "multi_select" || newType === "status";
    const col = columns.find(c => c.id === colId);
    const existingOptions = (col?.options || []).map((o, i) => ({ ...o, id: (o as any).id || `opt-${i}-${Date.now()}` }));
    const updates: Partial<BountifulColumn> = { type: newType, options: needs ? existingOptions : undefined };
    const nc = columns.map(c => c.id === colId ? { ...c, ...updates } : c);
    const nr = rows.map(row => ({
      ...row,
      cells: {
        ...row.cells,
        [colId]: coerceCellForColumnType(row.cells[colId] ?? null, newType),
      },
    }));
    setColumns(nc);
    setRows(nr);
    if (onPatchColumn) {
      // Cuando existe parche granular, evita onUpdate completo para no re-renderizar todo el documento.
      onPatchColumn(colId, updates);
      return;
    }
    emitUpdate(nc, nr);
  };

  const updateColumnOptions = (colId: string, options: { id: string; name: string; color: string; isDefault?: boolean }[]) => {
    const nc = columns.map(c => c.id === colId ? { ...c, options } : c);
    setColumns(nc);
    if (onPatchColumn) { onPatchColumn(colId, { options }); }
    else { emitUpdate(nc, rows); }
  };

  const commitTitle = () => { if (readonly || !onUpdate) return; emitUpdate(columns, rows, draftTitle); };

  const visibleColumns = useMemo(() => {
    const pinned = columns.filter(c => !c.hidden && c.pinned);
    const normal = columns.filter(c => !c.hidden && !c.pinned);
    return [...pinned, ...normal];
  }, [columns]);

  const pinnedOffsets = useMemo(() => {
    let current = 0;
    const offsets: Record<string, number> = {};
    visibleColumns.forEach(col => {
      if (col.pinned) {
        offsets[col.id] = current;
        current += (col.width || 180);
      }
    });
    return offsets;
  }, [visibleColumns]);

  const toggleVisibility = (colId: string) => {
    const col = columns.find(c => c.id === colId);
    const nc = columns.map(c => c.id === colId ? { ...c, hidden: !c.hidden } : c);
    setColumns(nc);
    if (onPatchColumn) { onPatchColumn(colId, { hidden: !col?.hidden }); }
    else { emitUpdate(nc, rows); }
  };
  const showAllColumns = () => {
    const nc = columns.map(c => ({ ...c, hidden: false }));
    setColumns(nc); emitUpdate(nc, rows);
  };
  const hideAllColumns = () => {
    const nc = columns.map(c => ({ ...c, hidden: true }));
    setColumns(nc); emitUpdate(nc, rows);
  };

  const [sortConfig, setSortConfig] = useState<{ colId: string; direction: "asc" | "desc" } | null>(null);
  const [filterConfig, setFilterConfig] = useState<{ colId: string; value: string; operator: string }[]>([]);
  const [draggedColIdx, setDraggedColIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  const sortedRows = useMemo(() => {
    let result = [...rows];

    // ── Filtering logic ──
    if (filterConfig.length > 0) {
      result = result.filter(row => {
        return filterConfig.every(f => {
          const cell = row.cells[f.colId] ?? null;
          const col = columns.find(c => c.id === f.colId);
          if (!col) return true;

          const op = (f.operator || "contains").toLowerCase();
          const rawTarget = (f.value || "").trim();
          const target = rawTarget.toLowerCase();

          const systemText =
            col.type === "created_by" ? (row._createdBy || "") :
            col.type === "last_edited_by" ? (row._lastEditedBy || "") :
            "";

          const textParts = [
            cell?.text,
            cell?.name,
            cell?.value,
            systemText,
            ...(cell?.items || []).map(i => i.name),
            ...(cell?.users || []).map(u => u.name || u.email || u.id),
            ...(cell?.documents || []).map(d => d.name || d.id),
            ...(cell?.boards || []).map(b => b.name || b.id),
            ...(cell?.cards || []).map(c => c.name || c.id),
          ].filter((v): v is string => typeof v === "string" && v.trim().length > 0);

          const normalizedParts = textParts.map(v => v.toLowerCase());
          const haystack = normalizedParts.join(" ");

          const parsedNumFromText = cell?.text && !Number.isNaN(Number(cell.text)) ? Number(cell.text) : undefined;
          const cellNum = typeof cell?.number === "number" ? cell.number : parsedNumFromText;

          const dateSource =
            cell?.start ||
            (col.type === "created_time" ? row._createdAt : undefined) ||
            (col.type === "last_edited_time" ? row._lastEditedAt : undefined);
          const cellDate = dateSource ? new Date(dateSource) : null;
          const cellDateMs = cellDate && !Number.isNaN(cellDate.getTime()) ? cellDate.getTime() : null;

          const boolVal = typeof cell?.checked === "boolean" ? cell.checked : undefined;

          const isEmpty = (() => {
            if (["checkbox"].includes(col.type)) return boolVal === undefined;
            if (["number"].includes(col.type)) return cellNum === undefined || Number.isNaN(cellNum);
            if (["date", "created_time", "last_edited_time"].includes(col.type)) return !cellDateMs;
            if (["multi_select"].includes(col.type)) return (cell?.items || []).length === 0;
            if (["people", "created_by", "last_edited_by"].includes(col.type)) {
              return ((cell?.users || []).length === 0) && !systemText;
            }
            if (["relation", "document"].includes(col.type)) return (cell?.documents || []).length === 0;
            if (["board"].includes(col.type)) return (cell?.boards || []).length === 0;
            if (["card"].includes(col.type)) return (cell?.cards || []).length === 0;
            return haystack.length === 0;
          })();

          if (op === "empty") return isEmpty;
          if (op === "not_empty") return !isEmpty;
          if (op === "is_true") return boolVal === true;
          if (op === "is_false") return boolVal === false;

          if (op === "regex") {
            try {
              const parts = rawTarget.match(/\/(.*)\/(.*)/);
              const re = parts ? new RegExp(parts[1], parts[2]) : new RegExp(rawTarget, "i");
              return re.test(haystack);
            } catch {
              return true;
            }
          }

          if (["gt", "lt", "gte", "lte", "between"].includes(op)) {
            if (cellNum === undefined || Number.isNaN(cellNum)) return false;
            if (op === "between") {
              const [min, max] = rawTarget.split(/[,-\s]+/).map(v => Number(v.trim())).filter(v => !Number.isNaN(v));
              if (min === undefined || max === undefined) return false;
              return cellNum >= min && cellNum <= max;
            }
            const tNum = Number(rawTarget);
            if (Number.isNaN(tNum)) return false;
            if (op === "gt") return cellNum > tNum;
            if (op === "lt") return cellNum < tNum;
            if (op === "gte") return cellNum >= tNum;
            if (op === "lte") return cellNum <= tNum;
          }

          if (["date_before", "date_after", "date_today", "date_this_week"].includes(op) || (["date", "created_time", "last_edited_time"].includes(col.type) && op === "between")) {
            if (!cellDateMs) return false;
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            if (op === "date_today") {
              const cd = new Date(cellDateMs);
              cd.setHours(0, 0, 0, 0);
              return cd.getTime() === today.getTime();
            }
            if (op === "date_this_week") {
              const weekStart = new Date(today);
              weekStart.setDate(today.getDate() - 7);
              return cellDateMs >= weekStart.getTime() && cellDateMs <= Date.now();
            }
            if (op === "date_before") {
              const targetDate = new Date(rawTarget);
              if (Number.isNaN(targetDate.getTime())) return false;
              return cellDateMs < targetDate.getTime();
            }
            if (op === "date_after") {
              const targetDate = new Date(rawTarget);
              if (Number.isNaN(targetDate.getTime())) return false;
              return cellDateMs > targetDate.getTime();
            }
            if (op === "between") {
              const [fromRaw, toRaw] = rawTarget.split(/[,-\s]+/).filter(Boolean);
              const from = fromRaw ? new Date(fromRaw).getTime() : NaN;
              const to = toRaw ? new Date(toRaw).getTime() : NaN;
              if (Number.isNaN(from) || Number.isNaN(to)) return false;
              return cellDateMs >= from && cellDateMs <= to;
            }
          }

          if (["is_any_of", "is_none_of"].includes(op)) {
            const values = rawTarget.split(/[\n,|]+/).map(v => v.trim().toLowerCase()).filter(Boolean);
            if (values.length === 0) return true;
            const hit = values.some(v => normalizedParts.some(part => part.includes(v)));
            return op === "is_any_of" ? hit : !hit;
          }

          if (op === "equals") {
            if (cellNum !== undefined && !Number.isNaN(Number(rawTarget))) return cellNum === Number(rawTarget);
            if (cellDateMs && !Number.isNaN(new Date(rawTarget).getTime())) {
              const targetDate = new Date(rawTarget);
              return new Date(cellDateMs).toDateString() === targetDate.toDateString();
            }
            return normalizedParts.some(v => v === target) || haystack === target;
          }

          if (op === "not_equals") {
            if (cellNum !== undefined && !Number.isNaN(Number(rawTarget))) return cellNum !== Number(rawTarget);
            if (cellDateMs && !Number.isNaN(new Date(rawTarget).getTime())) {
              const targetDate = new Date(rawTarget);
              return new Date(cellDateMs).toDateString() !== targetDate.toDateString();
            }
            return !(normalizedParts.some(v => v === target) || haystack === target);
          }

          if (op === "contains") return haystack.includes(target);
          if (op === "not_contains") return !haystack.includes(target);
          if (op === "starts_with") return normalizedParts.some(v => v.startsWith(target));
          if (op === "ends_with") return normalizedParts.some(v => v.endsWith(target));

          return true;
        });
      });
    }

    // ── Sorting logic ──
    if (sortConfig) {
      result.sort((a, b) => {
        const cellA = a.cells[sortConfig.colId];
        const cellB = b.cells[sortConfig.colId];
        const col = columns.find(c => c.id === sortConfig.colId);

        let valA: any = cellA?.number ?? cellA?.text ?? cellA?.name ?? cellA?.value ?? "";
        let valB: any = cellB?.number ?? cellB?.text ?? cellB?.name ?? cellB?.value ?? "";

        if (col?.type === "date") {
          valA = cellA?.start ? new Date(cellA.start).getTime() : 0;
          valB = cellB?.start ? new Date(cellB.start).getTime() : 0;
        }

        if (valA === valB) return 0;
        if (valA < valB) return sortConfig.direction === "asc" ? -1 : 1;
        return sortConfig.direction === "asc" ? 1 : -1;
      });
    }
    return result;
  }, [rows, sortConfig, filterConfig, columns]);

  const onColumnDragStart = (idx: number) => setDraggedColIdx(idx);
  const onColumnDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (draggedColIdx !== null && draggedColIdx !== idx) setDragOverIdx(idx);
  };
  const onColumnDrop = (targetIdx: number) => {
    if (draggedColIdx === null || draggedColIdx === targetIdx) return;
    const newCols = [...columns];
    const [removed] = newCols.splice(draggedColIdx, 1);
    newCols.splice(targetIdx, 0, removed);
    setColumns(newCols);
    emitUpdate(newCols, rows);
    setDraggedColIdx(null); setDragOverIdx(null);
  };

  // --- Multi-Selection logic ---
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set());
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionStart, setSelectionStart] = useState<{rowIdx: number, colIdx: number} | null>(null);

  const handleCellMouseDown = (e: React.MouseEvent, rowIdx: number, colIdx: number, rowId: string, colId: string) => {
    if (readonly || e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (['INPUT', 'BUTTON', 'A', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.closest('button')) return;
    
    setIsSelecting(true);
    if (e.shiftKey && selectionStart) {
      const newSelection = new Set(e.ctrlKey || e.metaKey ? selectedCells : []);
      const minRow = Math.min(selectionStart.rowIdx, rowIdx);
      const maxRow = Math.max(selectionStart.rowIdx, rowIdx);
      const minCol = Math.min(selectionStart.colIdx, colIdx);
      const maxCol = Math.max(selectionStart.colIdx, colIdx);
      
      for (let r = minRow; r <= maxRow; r++) {
        for (let c = minCol; c <= maxCol; c++) {
          newSelection.add(`${sortedRows[r].id}:${visibleColumns[c].id}`);
        }
      }
      setSelectedCells(newSelection);
    } else if (e.ctrlKey || e.metaKey) {
      const newSelection = new Set(selectedCells);
      const key = `${rowId}:${colId}`;
      if (newSelection.has(key)) newSelection.delete(key);
      else newSelection.add(key);
      setSelectedCells(newSelection);
      setSelectionStart({rowIdx, colIdx});
    } else {
      setSelectedCells(new Set([`${rowId}:${colId}`]));
      setSelectionStart({rowIdx, colIdx});
    }
  };

  const handleCellMouseEnter = (rowIdx: number, colIdx: number) => {
    if (!isSelecting || readonly || !selectionStart) return;
    const newSelection = new Set<string>();
    const minRow = Math.min(selectionStart.rowIdx, rowIdx);
    const maxRow = Math.max(selectionStart.rowIdx, rowIdx);
    const minCol = Math.min(selectionStart.colIdx, colIdx);
    const maxCol = Math.max(selectionStart.colIdx, colIdx);
    
    for (let r = minRow; r <= maxRow; r++) {
      for (let c = minCol; c <= maxCol; c++) {
        newSelection.add(`${sortedRows[r].id}:${visibleColumns[c].id}`);
      }
    }
    setSelectedCells(newSelection);
  };

  useEffect(() => {
    const handleMouseUp = () => setIsSelecting(false);
    window.addEventListener('mouseup', handleMouseUp);
    return () => window.removeEventListener('mouseup', handleMouseUp);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (readonly || selectedCells.size === 0) return;
      const target = e.target as HTMLElement;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable) return;

      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        const newRows = [...rows];
        let hasChanges = false;
        
        selectedCells.forEach(key => {
          const [rowId, colId] = key.split(":");
          const rIndex = newRows.findIndex(r => r.id === rowId);
          if (rIndex >= 0) {
            const colInfo = columns.find(c => c.id === colId);
            newRows[rIndex] = {
              ...newRows[rIndex],
              cells: { ...newRows[rIndex].cells, [colId]: null }
            };
            hasChanges = true;
          }
        });
        if (hasChanges) {
          setRows(newRows);
          emitUpdate(columns, newRows);
        }
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        const selectedByRow: Record<string, string[]> = {};
        selectedCells.forEach(key => {
          const [rId, cId] = key.split(":");
          if (!selectedByRow[rId]) selectedByRow[rId] = [];
          selectedByRow[rId].push(cId);
        });

        const lines: string[] = [];
        sortedRows.forEach(r => {
          const colsForR = selectedByRow[r.id];
          if (colsForR) {
            const lineVals: string[] = [];
            visibleColumns.forEach(c => {
               if (colsForR.includes(c.id)) {
                 const cell = r.cells?.[c.id];
                 let txt = cell ? (cell.text || cell.value || cell.name || "") : "";
                 if (cell?.users) txt = cell.users.map(u => u.name || u.email).join(', ');
                 if (cell?.documents) txt = cell.documents.map(d => d.name).join(', ');
                 if (cell?.boards) txt = cell.boards.map(b => b.name).join(', ');
                 lineVals.push(txt.toString());
               }
            });
            lines.push(lineVals.join("\t"));
          }
        });
        navigator.clipboard.writeText(lines.join("\n"));
        e.preventDefault();
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
         navigator.clipboard.readText().then(text => {
           if (!text) return;
           if (selectedCells.size !== 1) return;
           
           const [startRowId, startColId] = Array.from(selectedCells)[0].split(":");
           const sRIdx = sortedRows.findIndex(r => r.id === startRowId);
           const sCIdx = visibleColumns.findIndex(c => c.id === startColId);
           if (sRIdx < 0 || sCIdx < 0) return;

           const pastedLines = text.split(/\r?\n/).filter(l => l.trim() || l === "");
           const newRows = [...rows];
           let hasChanges = false;
           
           pastedLines.forEach((line, rOffset) => {
              const rIdx = sRIdx + rOffset;
              if (rIdx >= sortedRows.length) return;
              const tgtRowId = sortedRows[rIdx].id;
              const actualRowIdx = newRows.findIndex(r => r.id === tgtRowId);
              if (actualRowIdx < 0) return;

              const vals = line.split("\t");
              vals.forEach((val, cOffset) => {
                 const cIdx = sCIdx + cOffset;
                 if (cIdx >= visibleColumns.length) return;
                 const col = visibleColumns[cIdx];
                 
                 const rowCopy = { ...newRows[actualRowIdx] };
                 rowCopy.cells = { ...rowCopy.cells };
                 rowCopy.cells[col.id] = { type: col.type, text: val, value: val };
                 newRows[actualRowIdx] = rowCopy;
                 hasChanges = true;
              });
           });
           
           if (hasChanges) {
             setRows(newRows);
             emitUpdate(columns, newRows);
           }
         }).catch(console.error);
         e.preventDefault();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedCells, readonly, rows, columns, visibleColumns, sortedRows, emitUpdate]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.bountiful-table-container') && !target.closest('[role="dialog"]')) {
        setSelectedCells(new Set());
      }
    };
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const content = (
    <div className={cn(
      "bountiful-table-container rounded-xl border border-border bg-card/70 shadow-sm overflow-hidden flex flex-col select-none",
      isFullscreen ? "fixed inset-4 z-[9999] bg-card h-[calc(100vh-2rem)]" : "w-full my-4"
    )}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border bg-muted/25 p-2">
        <div className="flex min-w-0 flex-1 items-center gap-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <TableIcon className="h-4 w-4 text-accent shrink-0" />
          {readonly ? (
            <span className="truncate">{draftTitle || t("bountifulTable.table" as any)}</span>
          ) : (
            <input value={draftTitle} onChange={e => setDraftTitle(e.target.value)} onBlur={commitTitle}
              onKeyDown={e => { e.stopPropagation(); if (e.key === "Enter") { commitTitle(); (e.target as HTMLInputElement).blur(); } }}
              placeholder={t("bountifulTable.titlePlaceholder" as any)}
              className="no-drag-focus h-7 min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 text-xs font-semibold tracking-wide text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-border focus:bg-background" />
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => {
              openFilterWorkbench(undefined, e.currentTarget.getBoundingClientRect());
            }}
            className={cn("h-7 px-2 gap-1 text-[10px] rounded-md hover:bg-muted transition-colors flex items-center", filterConfig.length > 0 ? "text-accent bg-accent/10" : "text-muted-foreground")}
          >
            <Filter className="h-3 w-3" />
            {t("bountifulTable.filterTitle" as any)}{filterConfig.length > 0 ? ` (${filterConfig.length})` : ""}
          </button>
          <button
            onClick={(e) => {
              openSortWorkbench(e.currentTarget.getBoundingClientRect());
            }}
            className={cn("h-7 px-2 gap-1 text-[10px] rounded-md hover:bg-muted transition-colors flex items-center", sortConfig ? "text-accent bg-accent/10" : "text-muted-foreground")}
          >
            <ArrowUp className="h-3 w-3" />
            {t("bountifulTable.sort.title" as any)}
          </button>
          {!readonly && (
            <>
              <button onClick={addColumn} className="h-7 px-2 gap-1 text-[10px] rounded-md hover:bg-muted transition-colors flex items-center text-muted-foreground">
                <Columns className="h-3 w-3" /> {t("bountifulTable.addCol" as any)}
              </button>
              <button onClick={addRow} className="h-7 px-2 gap-1 text-[10px] rounded-md hover:bg-muted transition-colors flex items-center text-muted-foreground">
                <Rows className="h-3 w-3" /> {t("bountifulTable.addRow" as any)}
              </button>
              <button onClick={(e) => setShowVisibilityManager({ rect: e.currentTarget.getBoundingClientRect() })}
                className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-muted transition-colors text-muted-foreground">
                <MoreHorizontal className="h-3.5 w-3.5" />
              </button>
            </>
          )}
          <button onClick={() => setIsFullscreen(!isFullscreen)} className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-muted transition-colors text-muted-foreground">
            {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {(filterConfig.length > 0 || sortConfig) && (
        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/10 px-3 py-2 text-xs">
          {filterConfig.length > 0 && (
            <>
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">{t("bountifulTable.filterBarLabel" as any)}</span>
              {filterConfig.map(f => {
                const col = columns.find(c => c.id === f.colId);
                if (!col) return null;
                return (
                  <button key={f.colId} onClick={() => openFilterWorkbench(f.colId, filterWorkbenchRect || undefined)} className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-card px-2 py-1 text-[11px] hover:bg-muted/40 transition-colors">
                    <span className="font-medium text-foreground">{col.name}</span>
                    <span className="text-muted-foreground">{getFilterOperatorLabel(t, f.operator)}</span>
                    {f.value && <span className="max-w-[120px] truncate text-muted-foreground/70">{f.value}</span>}
                    <span onClick={(e) => { e.stopPropagation(); removeFilter(f.colId); }} className="ml-1 rounded-full px-1 text-muted-foreground hover:text-destructive">×</span>
                  </button>
                );
              })}
              <button onClick={(e) => { setFilterWorkbenchRect(e.currentTarget.getBoundingClientRect()); openFilterWorkbench(); }} className="rounded-full border border-dashed border-border/60 px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted/40 transition-colors">{t("bountifulTable.filterBarAdd" as any)}</button>
              <button onClick={clearAllFilters} className="text-[11px] text-muted-foreground hover:text-destructive transition-colors">{t("bountifulTable.filterClear" as any)}</button>
            </>
          )}

          {sortConfig && (
            <>
              <span className="mx-1 h-4 w-px bg-border/70" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">{t("bountifulTable.sortBarLabel" as any)}</span>
              {(() => {
                const sortCol = columns.find(c => c.id === sortConfig.colId);
                return sortCol ? (
                  <button onClick={(e) => { setSortWorkbenchRect(e.currentTarget.getBoundingClientRect()); openSortWorkbench(); }} className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-card px-2 py-1 text-[11px] hover:bg-muted/40 transition-colors">
                    <span className="font-medium text-foreground">{sortCol.name}</span>
                    <span className="text-muted-foreground">{sortConfig.direction === "asc" ? t("bountifulTable.sortBarAsc" as any) : t("bountifulTable.sortBarDesc" as any)}</span>
                  </button>
                ) : null;
              })()}
              <button onClick={() => setSortConfig(null)} className="text-[11px] text-muted-foreground hover:text-destructive transition-colors">{t("bountifulTable.sortBarRemove" as any)}</button>
            </>
          )}
        </div>
      )}

      {/* Table */}
      <div className="overflow-auto flex-1 custom-scrollbar">
        <table className="w-full text-sm text-left whitespace-nowrap border-collapse">
          <thead className="bg-muted/30 sticky top-0 z-10">
            <tr>
              {visibleColumns.map(col => {
                const isPinned = !!col.pinned;
                const left = pinnedOffsets[col.id];
                return (
                  <th key={col.id} ref={el => { headerRefs.current[col.id] = el; }}
                    draggable
                    onDragStart={() => onColumnDragStart(columns.indexOf(col))}
                    onDragOver={e => onColumnDragOver(e, columns.indexOf(col))}
                    onDrop={() => onColumnDrop(columns.indexOf(col))}
                    onDragEnd={() => { setDraggedColIdx(null); setDragOverIdx(null); }}
                    className={cn("font-medium px-3 py-2 border-b border-r border-border last:border-r-0 text-muted-foreground min-w-[120px] transition-all bg-muted/30",
                      !readonly && "cursor-pointer hover:bg-muted/40 transition-colors",
                      draggedColIdx === columns.indexOf(col) && "opacity-40 grayscale",
                      dragOverIdx === columns.indexOf(col) && "bg-accent/10 border-l-2 border-l-accent",
                      isPinned && "sticky z-20 shadow-[2px_0_4px_rgba(0,0,0,0.05)]")}
                    onClick={(e) => { if (!readonly) setHeaderMenu({ colId: col.id, rect: e.currentTarget.getBoundingClientRect() }); }}
                    style={{ width: col.width || 180, left: isPinned ? left : undefined }}>
                    <div className="flex items-center gap-1.5 pointer-events-none">
                      <span className="opacity-50">{colTypeIcon[col.type] || <FileText className="h-3 w-3" />}</span>
                      <span className="text-xs truncate">{col.name}</span>
                      {sortConfig?.colId === col.id && (
                        <span className="ml-auto text-accent px-1 bg-accent/10 rounded">
                          {sortConfig.direction === "asc" ? "↑" : "↓"}
                        </span>
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sortedRows.map((row, rIdx) => (
              <tr key={row.id} className="group/row hover:bg-muted/10 transition-colors">
                {visibleColumns.map((col, cIdx) => {
                  const isPinned = !!col.pinned;
                  const left = pinnedOffsets[col.id];
                  const isSelected = selectedCells.has(`${row.id}:${col.id}`);
                  return (
                    <td key={col.id} 
                      onMouseDown={e => handleCellMouseDown(e, rIdx, cIdx, row.id, col.id)}
                      onMouseEnter={() => handleCellMouseEnter(rIdx, cIdx)}
                      className={cn("px-3 py-1.5 border-r border-border last:border-r-0 relative align-middle bg-card/40 transition-colors",
                      isPinned && "sticky z-[5] shadow-[2px_0_4px_rgba(0,0,0,0.02)]",
                      isSelected && "bg-accent/20 ring-1 ring-inset ring-accent")}
                      style={{ left: isPinned ? left : undefined }}>
                      <CellRenderer cell={row.cells?.[col.id] ?? null} column={col} row={row} readonly={readonly}
                        onCellChange={newCell => handleCellChange(row.id, col.id, newCell)}
                        onOpenReferencePicker={setPickerState}
                        users={users} />
                    </td>
                  );
                })}
                {!readonly && (
                  <td className="w-8 border-b border-border">
                    <button onClick={() => removeRow(row.id)}
                      className="opacity-0 group-hover/row:opacity-100 transition-opacity p-1 text-destructive/50 hover:text-destructive">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      {!readonly && (
        <div className="flex items-center gap-2 border-t border-border bg-muted/5 p-2 shrink-0">
          <button onClick={addRow} className="h-7 px-3 gap-1.5 text-[11px] rounded-md border border-border hover:bg-muted transition-colors flex items-center text-muted-foreground">
            <Plus className="h-3 w-3" /> {t("bountifulTable.newRow" as any)}
          </button>
          <div className="ml-auto text-[10px] text-muted-foreground/50">{rows.length} {t("bountifulTable.rows" as any)} · {visibleColumns.length} {t("bountifulTable.columns" as any)}</div>
        </div>
      )}

      {/* Column Header Menu */}
      {headerMenu && !readonly && (() => {
        const col = columns.find(c => c.id === headerMenu.colId);
        if (!col) return null;
        const colIdx = columns.findIndex(c => c.id === headerMenu.colId);
        return (
          <ColumnHeaderMenu column={col}
            anchorRect={headerMenu.rect}
            onClose={() => setHeaderMenu(null)}
            onAIAutocomplete={() => setShowAIModalColId(headerMenu.colId)}
            onRename={name => renameColumn(headerMenu.colId, name)}
            onChangeType={type => changeColumnType(headerMenu.colId, type)}
            onSort={dir => setSortConfig(dir ? { colId: headerMenu.colId, direction: dir } : null)}
            sortDir={sortConfig?.colId === headerMenu.colId ? sortConfig.direction : null}
            onFilterChange={(op, val) => handleFilterChange(headerMenu.colId, op, val)}
            filterValue={filterConfig.find(f => f.colId === headerMenu.colId)?.value}
            filterOperator={filterConfig.find(f => f.colId === headerMenu.colId)?.operator}
            onUpdateOptions={opts => updateColumnOptions(headerMenu.colId, opts)}
            onUpdateColumn={updates => {
              const nc = columns.map(c => c.id === headerMenu.colId ? { ...c, ...updates } : c);
              setColumns(nc);
              if (onPatchColumn) { onPatchColumn(headerMenu.colId, updates); }
              else { emitUpdate(nc, rows); }
            }}
            onDelete={() => { removeColumn(headerMenu.colId); setHeaderMenu(null); }}
            onDuplicate={() => duplicateColumn(headerMenu.colId)}
            onInsertLeft={() => insertColumn(colIdx)}
            onInsertRight={() => insertColumn(colIdx + 1)}
          />
        );
      })()}

      {showFilterWorkbench && filterWorkbenchRect && (
        <FilterWorkbenchFlyout
          anchorRect={filterWorkbenchRect}
          columns={columns}
          filterConfig={filterConfig}
          initialColId={filterWorkbenchColId}
          onMouseEnter={() => setShowFilterWorkbench(true)}
          onClose={() => setShowFilterWorkbench(false)}
          onFilterChange={handleFilterChange}
          onRemoveFilter={removeFilter}
          onClearAll={clearAllFilters}
        />
      )}

      {showSortWorkbench && sortWorkbenchRect && (
        <SortWorkbenchFlyout
          anchorRect={sortWorkbenchRect}
          columns={columns}
          sortConfig={sortConfig}
          onMouseEnter={() => setShowSortWorkbench(true)}
          onClose={() => setShowSortWorkbench(false)}
          onSortChange={(colId, direction) => {
            if (!colId || !direction) setSortConfig(null);
            else setSortConfig({ colId, direction });
          }}
        />
      )}

      {/* Visibility Manager */}
      {showVisibilityManager && (
        <VisibilityManager columns={columns}
          onToggleVisibility={toggleVisibility}
          onShowAll={showAllColumns}
          onHideAll={hideAllColumns}
          onClose={() => setShowVisibilityManager(null)}
          anchorRect={showVisibilityManager.rect} />
      )}
      {/* AI Autocomplete Modal */}
      {showAIModalColId && (() => {
        const col = columns.find(c => c.id === showAIModalColId);
        if (!col) return null;
        return (
          <AIAutocompleteModal
            column={col}
            columns={columns}
            rows={rows}
            aiUsage={aiUsage}
            setAiUsage={setAiUsage}
            onClose={() => setShowAIModalColId(null)}
            onSave={(updatedRows) => {
              setRows(updatedRows);
              emitUpdate(columns, updatedRows);
              setShowAIModalColId(null);
            }}
          />
        );
      })()}
      {pickerState && (
        <ReferencePicker
          onSelect={handleReferenceSelect}
          onClose={() => setPickerState(null)}
          boards={boards}
          documents={documents}
          users={users}
          activeBricks={activeBricks}
          allowedTypes={[pickerState.type]}
        />
      )}
    </div>
  );

  if (isFullscreen) {
    return createPortal(
      <>
        <div className="fixed inset-0 z-[9998] bg-background/80 backdrop-blur-sm" onClick={() => setIsFullscreen(false)} />
        {content}
      </>,
      document.body
    );
  }

  return content;
};
