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
}

// ─── Color map ──────────────────────────────────────────────────────────────

const colorThemeMap: Record<string, string> = {
  default: "bg-muted text-foreground",
  gray: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
  brown: "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200",
  orange: "bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-200",
  yellow: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-200",
  green: "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200",
  blue: "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200",
  purple: "bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-200",
  pink: "bg-pink-100 text-pink-800 dark:bg-pink-900/50 dark:text-pink-200",
  red: "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200",
  teal: "bg-teal-100 text-teal-800 dark:bg-teal-900/50 dark:text-teal-200",
};
const getPillClass = (c?: string) => colorThemeMap[c || "default"] || colorThemeMap.default;
const AVAILABLE_COLORS = Object.keys(colorThemeMap);

// ─── All column types (icons only, labels come from i18n) ───────────────────

const COL_TYPE_VALUES = [
  "title", "rich_text", "number", "select", "multi_select", "status",
  "date", "people", "checkbox", "url", "email", "phone_number",
  "formula", "relation", "rollup", "created_time", "created_by",
  "last_edited_time", "last_edited_by", "document", "board", "card",
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
  const [tab, setTab] = useState<"main" | "type" | "filter">("main");
  const [showAISubmenu, setShowAISubmenu] = useState(false);
  const [showEditPropFlyout, setShowEditPropFlyout] = useState(false);
  const [aiButtonRef, setAIButtonRef] = useState<HTMLButtonElement | null>(null);
  const [editPropButtonRef, setEditPropButtonRef] = useState<HTMLButtonElement | null>(null);
  const [draftName, setDraftName] = useState(column.name);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (tab === "main") setTimeout(() => nameRef.current?.focus(), 50); }, [tab]);

  const HAS_EDIT_PROPERTY = ["number", "select", "multi_select", "status", "date", "created_time", "last_edited_time", "people", "created_by", "last_edited_by", "document", "phone_number"].includes(column.type);

  const top = Math.min(anchorRect.bottom + 4, window.innerHeight - 480);
  const left = Math.min(anchorRect.left, window.innerWidth - 280);

  const currentTypeLabel = COLUMN_TYPES.find(ct => ct.value === column.type)?.label || column.type;
  const currentTypeIcon = COLUMN_TYPES.find(ct => ct.value === column.type)?.icon;

  return createPortal(
    <>
      <div className="fixed inset-0 z-[300]" onClick={e => { e.stopPropagation(); onClose(); }} />
      <div className="column-header-menu fixed z-[301] w-[260px] rounded-lg border border-border bg-card shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        style={{ top, left }} onClick={e => e.stopPropagation()}>

        {tab === "main" && (
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
            <button key="type" onClick={() => setTab("type")}
              className="w-full flex items-center gap-2.5 px-3 py-1.5 text-sm hover:bg-muted/60 transition-colors group">
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
            <button onClick={() => { onSort?.("asc"); onClose(); }}
              className={cn("w-full flex items-center gap-2.5 px-3 py-1.5 text-sm hover:bg-muted/60 transition-colors group", sortDir === "asc" && "bg-accent/5 text-accent font-medium")}>
              <ArrowUp className="h-4 w-4 text-muted-foreground group-hover:text-foreground" /><span>
                {column.type === "number" ? t("bountifulTable.sort.numberAsc" as any) : column.type === "date" ? t("bountifulTable.sort.dateAsc" as any) : t("bountifulTable.sort.asc" as any)}
              </span>
              {sortDir === "asc" && <span className="ml-auto text-xs">✓</span>}
            </button>
            <button onClick={() => { onSort?.("desc"); onClose(); }}
              className={cn("w-full flex items-center gap-2.5 px-3 py-1.5 text-sm hover:bg-muted/60 transition-colors group", sortDir === "desc" && "bg-accent/5 text-accent font-medium")}>
              <ArrowDown className="h-4 w-4 text-muted-foreground group-hover:text-foreground" /><span>
                {column.type === "number" ? t("bountifulTable.sort.numberDesc" as any) : column.type === "date" ? t("bountifulTable.sort.dateDesc" as any) : t("bountifulTable.sort.desc" as any)}
              </span>
              {sortDir === "desc" && <span className="ml-auto text-xs">✓</span>}
            </button>
            {sortDir && (
              <button onClick={() => { onSort?.(null); onClose(); }}
                className="w-full flex items-center gap-2.5 px-3 py-1.5 text-sm hover:bg-muted/60 transition-colors group text-destructive/70 hover:text-destructive">
                <Trash2 className="h-4 w-4" /><span>{t("bountifulTable.sort.clear" as any)}</span>
              </button>
            )}

            <div className="border-t border-border my-1" />
            <button onClick={() => setTab("filter")}
              className="w-full flex items-center gap-2.5 px-3 py-1.5 text-sm hover:bg-muted/60 transition-colors group">
              <Filter className="h-4 w-4 text-muted-foreground group-hover:text-foreground" /><span>{t("bountifulTable.filter" as any)}</span>
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
        )}

        {tab === "type" && (
          <div>
            <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
              <button onClick={() => setTab("main")} className="text-muted-foreground hover:text-foreground p-1 rounded-md hover:bg-muted">
                <ArrowLeftToLine className="h-3.5 w-3.5 rotate-90" />
              </button>
              <span className="text-xs font-bold uppercase tracking-tight text-muted-foreground">{t("bountifulTable.changeType" as any)}</span>
            </div>
            <div className="p-1 max-h-[350px] overflow-y-auto pt-1.5">
              {COLUMN_TYPES.map(ct => (
                <button key={ct.value} onClick={() => { onChangeType(ct.value); setTab("main"); }}
                  className={cn("w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm transition-colors",
                    column.type === ct.value ? "bg-accent/15 text-accent" : "hover:bg-muted/60")}>
                  {ct.icon}<span className="truncate">{ct.label}</span>
                  {column.type === ct.value && <span className="ml-auto text-accent text-xs">✓</span>}
                </button>
              ))}
            </div>
          </div>
        )}
        {tab === "filter" && (() => {
          const ct = column.type;
          const ops = (ct === "number" ? [
            { label: t("bountifulTable.operators.equals" as any), value: "equals" },
            { label: t("bountifulTable.operators.not_equals" as any), value: "not_equals" },
            { label: t("bountifulTable.operators.gt" as any), value: "gt" },
            { label: t("bountifulTable.operators.lt" as any), value: "lt" },
            { label: t("bountifulTable.operators.gte" as any), value: "gte" },
            { label: t("bountifulTable.operators.lte" as any), value: "lte" },
            { label: t("bountifulTable.operators.between" as any), value: "between" },
            { label: t("bountifulTable.operators.empty" as any), value: "empty" },
            { label: t("bountifulTable.operators.not_empty" as any), value: "not_empty" }
          ] : ct === "date" ? [
            { label: t("bountifulTable.operators.equals" as any), value: "equals" },
            { label: t("bountifulTable.operators.date_before" as any), value: "date_before" },
            { label: t("bountifulTable.operators.date_after" as any), value: "date_after" },
            { label: t("bountifulTable.operators.date_today" as any), value: "date_today" },
            { label: t("bountifulTable.operators.date_this_week" as any), value: "date_this_week" },
            { label: t("bountifulTable.operators.empty" as any), value: "empty" }
          ] : (ct === "select" || ct === "multi_select" || ct === "status") ? [
            { label: t("bountifulTable.operators.is_any_of" as any), value: "is_any_of" },
            { label: t("bountifulTable.operators.is_none_of" as any), value: "is_none_of" },
            { label: t("bountifulTable.operators.empty" as any), value: "empty" }
          ] : [
            { label: t("bountifulTable.operators.contains" as any), value: "contains" },
            { label: t("bountifulTable.operators.equals" as any), value: "equals" },
            { label: t("bountifulTable.operators.not_contains" as any), value: "not_contains" },
            { label: t("bountifulTable.operators.starts_with" as any), value: "starts_with" },
            { label: t("bountifulTable.operators.ends_with" as any), value: "ends_with" },
            { label: t("bountifulTable.operators.regex" as any), value: "regex" },
            { label: t("bountifulTable.operators.empty" as any), value: "empty" },
            { label: t("bountifulTable.operators.not_empty" as any), value: "not_empty" }
          ]);

          return (
            <div className="flex flex-col">
              <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
                <button onClick={() => setTab("main")} className="text-muted-foreground hover:text-foreground p-1 rounded-md hover:bg-muted">
                  <ArrowLeftToLine className="h-3.5 w-3.5 rotate-90" />
                </button>
                <span className="text-xs font-bold uppercase tracking-tight text-muted-foreground">{t("bountifulTable.filterBy" as any, { name: column.name })}</span>
              </div>
              <div className="p-3 space-y-3">
                <div className="space-y-1.5">
                  <span className="text-[10px] font-bold text-muted-foreground/60 uppercase">{t("bountifulTable.filterCondition" as any)}</span>
                  <select value={filterOperator || (ct === "number" ? "gt" : "contains")}
                    onChange={e => onFilterChange?.(e.target.value, filterValue || "")}
                    className="w-full h-8 bg-muted/40 rounded border border-border px-2 text-xs outline-none focus:ring-1 focus:ring-accent">
                    {ops.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>

                {!["empty", "date_today", "date_this_week"].includes(filterOperator || "") && (
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-bold text-muted-foreground/60 uppercase">{t("bountifulTable.filterValue" as any)}</span>
                    <div className="relative">
                      <input value={filterValue || ""} onChange={e => onFilterChange?.(filterOperator || (ct === "number" ? "gt" : "contains"), e.target.value)}
                        placeholder={filterOperator === "regex" ? "/pattern/flags" : t("bountifulTable.filterPlaceholder" as any)}
                        className="w-full h-8 bg-muted/40 rounded border border-border pl-8 pr-2 text-xs outline-none focus:ring-1 focus:ring-accent transition-all" autoFocus />
                      <Filter className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground/40" />
                      {(filterValue || "").length > 0 && (
                        <button onClick={() => onFilterChange?.(filterOperator || "contains", "")} className="absolute right-2.5 top-2 text-muted-foreground hover:text-foreground">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                )}

                <p className="text-[9px] text-muted-foreground italic leading-tight">
                  {filterOperator === "regex" ? t("bountifulTable.filterRegexHelp" as any) : t("bountifulTable.filterHelp" as any)}
                </p>
              </div>
            </div>
          );
        })()}

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
    if (!sourceGroupName || sourceGroupName === targetGroupName) { setDragOptId(null); setDragOverGroup(null); return; }
    const newGroups = statusGroups.map(g => {
      if (g.name === sourceGroupName) return { ...g, optionIds: g.optionIds.filter(ref => {
        const resolved = options.find(o => o.id === ref || o.name === ref);
        return resolved?.id !== dragOptId && ref !== dragOptId;
      })};
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
    return (
      <div key={opt.id}
        draggable={column.type === "status"}
        onDragStart={e => { e.stopPropagation(); setDragOptId(opt.id); }}
        onDragEnd={() => { setDragOptId(null); setDragOverGroup(null); }}
        onClick={() => { setEditingOption(opt); setSubTab("editOption"); }}
        className={cn("flex items-center justify-between px-2 py-1.5 rounded-md group cursor-pointer transition-all select-none",
          dragOptId === opt.id ? "opacity-40 bg-muted/30" : "hover:bg-muted/60")}>
        <div className="flex items-center gap-2 min-w-0">
          <GripVertical className={cn("h-3 w-3 shrink-0 transition-colors",
            column.type === "status" ? "text-muted-foreground/30 group-hover:text-muted-foreground/60 cursor-grab" : "text-muted-foreground/10")} />
          <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-semibold truncate max-w-[160px]", getPillClass(opt.color))}>
            {opt.name}
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {opt.isDefault && <span className="text-[8px] font-black text-muted-foreground/30 uppercase">DEF</span>}
          <Edit3 className="h-3 w-3 text-muted-foreground/20 opacity-0 group-hover:opacity-100 transition-all" />
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
              <span>{editingOption.isDefault ? "✓ " : ""}{t("bountifulTable.sortManual" as any)}</span>
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
                <label className="text-[10px] font-black text-muted-foreground/40 uppercase tracking-widest">Modo de IA</label>
                <div className="flex p-1 bg-muted/50 rounded-xl border border-border/40">
                  <button onClick={() => setMode("basic")}
                    className={cn("flex-1 py-2 rounded-lg text-[10px] font-bold uppercase transition-all",
                      mode === "basic" ? "bg-card text-foreground shadow-sm ring-1 ring-border/50" : "text-muted-foreground hover:bg-muted/50")}>
                    Básico
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
                    <span className="text-destructive font-bold">Límite alcanzado</span>
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
                      <span>Progreso</span>
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
                        {columns.slice(0, 3).map(c => (
                          <th key={c.id} className="px-4 py-3 text-left text-[10px] font-bold text-muted-foreground uppercase border-r border-border/40">{c.name}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/20">
                      {tempRows.slice(0, 10).map((r, ridx) => (
                        <tr key={r.id} className={cn("group transition-colors", ridx === previewRowIdx && "bg-accent/5")}>
                          <td className="px-4 py-3 text-[10px] font-mono text-muted-foreground/40 border-r border-border/20">{ridx + 1}</td>
                          {columns.slice(0, 3).map(c => {
                            const cell = r.cells[c.id];
                            const isTarget = c.id === column.id;
                            return (
                              <td key={c.id} className={cn("px-4 py-3 text-xs border-r border-border/20 transition-all",
                                isTarget && "bg-accent/[0.02] font-semibold text-accent/90")}>
                                {cell?.text || cell?.name || cell?.number || <span className="opacity-10">—</span>}
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
                    + {tempRows.length - 10} filas adicionales se procesarán
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

function CellRenderer({ cell, column, row, readonly, onCellChange }: {
  cell: BountifulCell | null; column: BountifulColumn; row: BountifulRow; readonly?: boolean;
  onCellChange?: (newCell: BountifulCell) => void;
}) {
  const t = useTranslations("document-detail");
  const emptyLabel = ""; // Empty cells show nothing, just clickable area
  const [isEditing, setIsEditing] = useState(false);

  const formatDate = (d: string | undefined, includeTime = false) => {
    if (!d) return "";
    try {
      // Ensure local time for date-only strings (YYYY-MM-DD)
      const isIsoDate = /^\d{4}-\d{2}-\d{2}$/.test(d);
      const dateObj = new Date(isIsoDate ? d + "T00:00:00" : d);
      if (isNaN(dateObj.getTime())) return d;
      return dateObj.toLocaleString("es-PE", {
        year: "numeric", month: "short", day: "numeric",
        ...(includeTime ? { hour: "2-digit", minute: "2-digit" } : {})
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
    const decimals = fmt.decimals ?? 2;
    if (currency === "percent") {
      return `${n.toLocaleString("es-PE", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}%`;
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
      return `${cur.symbol} ${n.toLocaleString("es-PE", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
    }
    return n.toLocaleString("es-PE", { maximumFractionDigits: decimals });
  };

  const commitTextEdit = () => {
    setIsEditing(false);
    if (!onCellChange) return;
    const ct = cell?.type || "text";
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
    return <span className="text-xs text-muted-foreground/60">{formatDate(val, true)}</span>;
  }
  if (colType === "created_by" || colType === "last_edited_by") {
    const val = colType === "created_by" ? row._createdBy : row._lastEditedBy;
    return <span className="text-xs text-muted-foreground/60 italic">{val || "—"}</span>;
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
  if (cell.type === "text") {
    if (isEditing) return (
      <input ref={inputRef} value={editText} onChange={e => setEditText(e.target.value)}
        onBlur={commitTextEdit} onKeyDown={e => { e.stopPropagation(); if (e.key === "Enter") commitTextEdit(); if (e.key === "Escape") setIsEditing(false); }}
        className="w-full bg-transparent outline-none text-sm px-0" />
    );
    const hasContent = !!(cell.text && cell.text.trim());
    // Check if text contains LaTeX ($..$ or $$..$$)
    const hasFormula = hasContent && (cell.text!.includes("$") || cell.text!.includes("\\"));
    return (
      <div className={cn("w-full min-h-[24px] flex items-center cursor-text", column.wrap && "py-1")} onClick={() => startTextEdit(cell.text || "")}>
        {hasContent ? (
          hasFormula ? (
            <RichText content={cell.text!} context={{ documents: [], boards: [], activeBricks: [], users: [] }} className="text-sm" />
          ) : (
            <span className={cn("text-sm max-w-[280px]", column.wrap ? "whitespace-normal break-words" : "truncate")}>{cell.text}</span>
          )
        ) : (
          <span className="text-muted-foreground/30 text-xs">{emptyLabel}</span>
        )}
      </div>
    );
  }


  // Checkbox
  if (cell.type === "checkbox") {
    const Icon = cell.checked ? CheckSquare : Square;
    return (
      <div className="w-full min-h-[24px] flex items-center cursor-pointer"
        onClick={() => { if (!readonly) onCellChange?.({ type: "checkbox", checked: !cell.checked }); }}>
        <Icon className={cn("w-4 h-4 transition-colors", cell.checked ? "text-accent" : "text-muted-foreground/40 hover:text-accent")} />
      </div>
    );
  }


  // URL
  if (cell.type === "url") {
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
  if (cell.type === "number") {
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
  if (cell.type === "user") {
    const hasUsers = (cell.users || []).length > 0;
    return (
      <div className={cn("w-full min-h-[24px] flex items-center", column.wrap && "py-1")}>
        {hasUsers ? (
          <div className="flex gap-1 flex-wrap">{cell.users!.map((u, i) => (
            <RefPill key={i} type="user" id={u.id || u.email || String(i)} name={u.name || "User"} label={u.email || u.name} />
          ))}</div>
        ) : <span className="text-muted-foreground/30 text-xs">{emptyLabel}</span>}
      </div>
    );
  }

  // Document (relation)
  if (cell.type === "document") {
    const has = (cell.documents || []).length > 0;
    return (
      <div className={cn("w-full min-h-[24px] flex items-center", column.wrap && "py-1")}>
        {has ? (
          <div className="flex gap-1 flex-wrap">{cell.documents!.map((doc, i) => (
            <RefPill key={i} type="doc" id={doc.id} name={doc.name || "Page"} />
          ))}</div>
        ) : <span className="text-muted-foreground/30 text-xs">{emptyLabel}</span>}
      </div>
    );
  }

  // Board
  if (cell.type === "board") {
    const has = (cell.boards || []).length > 0;
    return (
      <div className={cn("w-full min-h-[24px] flex items-center", column.wrap && "py-1")}>
        {has ? (
          <div className="flex gap-1 flex-wrap">{cell.boards!.map((b, i) => (
            <RefPill key={i} type="board" id={b.id} name={b.name || "Board"} />
          ))}</div>
        ) : <span className="text-muted-foreground/30 text-xs">{emptyLabel}</span>}
      </div>
    );
  }

  // Card
  if (cell.type === "card") {
    const has = (cell.cards || []).length > 0;
    return (
      <div className={cn("w-full min-h-[24px] flex items-center", column.wrap && "py-1")}>
        {has ? (
          <div className="flex gap-1 flex-wrap">{cell.cards!.map((c, i) => (
            <RefPill key={i} type="card" id={c.id} name={c.name || "Card"} />
          ))}</div>
        ) : <span className="text-muted-foreground/30 text-xs">{emptyLabel}</span>}
      </div>
    );
  }

  // Magic columns (read-only metadata)
  if (column.type === "created_time") return <div className="text-xs text-muted-foreground/60">{formatDate(row._createdAt, true)}</div>;
  if (column.type === "created_by") return <div className="text-xs text-muted-foreground/60">{row._createdBy || "System"}</div>;
  if (column.type === "last_edited_time") return <div className="text-xs text-muted-foreground/60">{formatDate(row._lastEditedAt, true)}</div>;
  if (column.type === "last_edited_by") return <div className="text-xs text-muted-foreground/60">{row._lastEditedBy || "System"}</div>;

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
  id, title, columns: initColumns, rows: initRows, readonly = false, onUpdate, onPatchCell,
}) => {
  const t = useTranslations("document-detail");
  const { activeTeamId, accessToken, user } = useSession();
  const currentUserId = user?.id ?? user?.email ?? "unknown";
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
  const [showVisibilityManager, setShowVisibilityManager] = useState<{ rect: DOMRect } | null>(null);
  const [showAIModalColId, setShowAIModalColId] = useState<string | null>(null);
  const [aiUsage, setAiUsage] = useState(0);

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

  const handleFilterChange = (colId: string, operator: string, value: string) => {
    let nf = [...filterConfig].filter(f => f.colId !== colId);
    if (value || ["empty", "not_empty", "date_today", "date_this_week"].includes(operator)) {
      nf.push({ colId, operator, value });
    }
    setFilterConfig(nf);
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
    const nc2 = { id: `col-${Date.now()}`, name: `${t("bountifulTable.colNewName" as any)} ${columns.length + 1}`, type: "rich_text" };
    const nc = [...columns]; nc.splice(atIndex, 0, nc2);
    const nr = rows.map(r => ({ ...r, cells: { ...r.cells, [nc2.id]: null } }));
    setColumns(nc); setRows(nr); emitUpdate(nc, nr);
  };
  const addColumn = () => insertColumn(columns.length);

  const removeColumn = (colId: string) => {
    if (columns.length <= 1) return;
    const nc = columns.filter(c => c.id !== colId);
    const nr = rows.map(r => { const { [colId]: _, ...rest } = r.cells; return { ...r, cells: rest }; });
    setColumns(nc); setRows(nr); emitUpdate(nc, nr);
  };

  const duplicateColumn = (colId: string) => {
    const srcIdx = columns.findIndex(c => c.id === colId); if (srcIdx < 0) return;
    const src = columns[srcIdx];
    const nc2: BountifulColumn = { ...src, id: `col-${Date.now()}`, name: `${src.name} (copia)` };
    const nc = [...columns]; nc.splice(srcIdx + 1, 0, nc2);
    const nr = rows.map(r => ({ ...r, cells: { ...r.cells, [nc2.id]: r.cells[colId] ? { ...r.cells[colId]! } : null } }));
    setColumns(nc); setRows(nr); emitUpdate(nc, nr);
  };

  const renameColumn = (colId: string, name: string) => { const nc = columns.map(c => c.id === colId ? { ...c, name } : c); setColumns(nc); emitUpdate(nc, rows); };

  const changeColumnType = (colId: string, newType: string) => {
    const nc = columns.map(c => {
      if (c.id !== colId) return c;
      const needs = newType === "select" || newType === "multi_select" || newType === "status";
      // Ensure options have IDs if they exist
      const existingOptions = (c.options || []).map((o, i) => ({ ...o, id: (o as any).id || `opt-${i}-${Date.now()}` }));
      return { ...c, type: newType, options: needs ? existingOptions : undefined };
    });
    setColumns(nc); emitUpdate(nc, rows);
  };

  const updateColumnOptions = (colId: string, options: { id: string; name: string; color: string; isDefault?: boolean }[]) => {
    const nc = columns.map(c => c.id === colId ? { ...c, options } : c); setColumns(nc); emitUpdate(nc, rows);
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
    const nc = columns.map(c => c.id === colId ? { ...c, hidden: !c.hidden } : c);
    setColumns(nc); emitUpdate(nc, rows);
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
          const cell = row.cells[f.colId];
          const col = columns.find(c => c.id === f.colId);
          if (!col) return true;

          // Normalize values for comparison
          const cellText = (cell?.text || cell?.name || cell?.value || "").toLowerCase();
          const cellNum = cell?.number;
          const cellDate = cell?.start ? new Date(cell.start) : null;
          const cellItems = (cell?.items || []).map(i => i.name.toLowerCase());

          const target = f.value.toLowerCase();
          const op = f.operator;

          // Common empty check
          if (op === "empty") return !cell || (!cellText && cellNum === undefined && !cellDate && cellItems.length === 0 && !cell.checked);
          if (op === "not_empty") return cell && (cellText || cellNum !== undefined || cellDate || cellItems.length > 0 || cell.checked);

          // Text / Regex logic
          if (op === "contains") return cellText.includes(target);
          if (op === "not_contains") return !cellText.includes(target);
          if (op === "equals") return cellText === target;
          if (op === "starts_with") return cellText.startsWith(target);
          if (op === "ends_with") return cellText.endsWith(target);
          if (op === "regex") {
            try {
              const parts = f.value.match(/\/(.*)\/(.*)/);
              const re = parts ? new RegExp(parts[1], parts[2]) : new RegExp(f.value);
              return re.test(cellText);
            } catch { return true; }
          }

          // Number logic
          if (cellNum !== undefined) {
            const tNum = parseFloat(f.value);
            if (op === "gt") return cellNum > tNum;
            if (op === "lt") return cellNum < tNum;
            if (op === "gte") return cellNum >= tNum;
            if (op === "lte") return cellNum <= tNum;
            if (op === "between") {
              const [min, max] = f.value.split(/[,-\s]+/).map(parseFloat);
              return cellNum >= min && cellNum <= max;
            }
          }

          // Date logic
          if (cellDate) {
            const today = new Date(); today.setHours(0, 0, 0, 0);
            if (op === "date_today") return cellDate.toDateString() === today.toDateString();
            if (op === "date_before") return cellDate < new Date(f.value);
            if (op === "date_after") return cellDate > new Date(f.value);
            if (op === "date_this_week") {
              const lastWeek = new Date(); lastWeek.setDate(today.getDate() - 7);
              return cellDate >= lastWeek && cellDate <= today;
            }
          }

          // Select logic
          if (op === "is_any_of") return target.split(",").some(t => cellText.includes(t.trim()) || cellItems.includes(t.trim()));
          if (op === "is_none_of") return !target.split(",").some(t => cellText.includes(t.trim()) || cellItems.includes(t.trim()));

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

  const content = (
    <div className={cn(
      "rounded-xl border border-border bg-card/70 shadow-sm overflow-hidden flex flex-col",
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
            {sortedRows.map(row => (
              <tr key={row.id} className="group/row hover:bg-muted/10 transition-colors">
                {visibleColumns.map(col => {
                  const isPinned = !!col.pinned;
                  const left = pinnedOffsets[col.id];
                  return (
                    <td key={col.id} className={cn("px-3 py-1.5 border-r border-border last:border-r-0 relative align-middle bg-card/40",
                      isPinned && "sticky z-[5] shadow-[2px_0_4px_rgba(0,0,0,0.02)]")}
                      style={{ left: isPinned ? left : undefined }}>
                      <CellRenderer cell={row.cells?.[col.id] ?? null} column={col} row={row} readonly={readonly}
                        onCellChange={newCell => handleCellChange(row.id, col.id, newCell)} />
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
              setColumns(nc); emitUpdate(nc, rows);
            }}
            onDelete={() => { removeColumn(headerMenu.colId); setHeaderMenu(null); }}
            onDuplicate={() => duplicateColumn(headerMenu.colId)}
            onInsertLeft={() => insertColumn(colIdx)}
            onInsertRight={() => insertColumn(colIdx + 1)}
          />
        );
      })()}
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
