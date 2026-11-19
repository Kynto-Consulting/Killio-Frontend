"use client";

import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Calendar, ChevronDown, Clock, Copy, Trash2 } from "lucide-react";

import { useTranslations } from "@/components/providers/i18n-provider";
import { cellClass, percent, qualityBar, type ColumnProfile, type ColumnType, type ProfileResult } from "@/lib/query-flow/profile";
import { cn } from "@/lib/utils";
import { IconButton, TextInput } from "./fields";

export function TypeIcon({ type, decimal, hasTime }: { type: ColumnType; decimal?: boolean; hasTime?: boolean }) {
  const t = useTranslations("query-flow");
  const cls = "inline-flex h-4 min-w-[22px] items-center justify-center rounded bg-muted px-1 text-[9px] font-bold text-muted-foreground";
  const label = t(`types.${type}`);
  if (type === "date") {
    const Icon = hasTime ? Clock : Calendar;
    return <span className={cls} title={label}><Icon className="h-3 w-3" aria-label={label} /></span>;
  }
  return <span className={cls} title={label} aria-label={label}>{type === "number" ? (decimal ? "1.2" : "123") : type === "boolean" ? "T/F" : type === "empty" ? "—" : "ABC"}</span>;
}

function QualityBar({ profile }: { profile: ColumnProfile }) {
  const t = useTranslations("query-flow");
  const q = profile.quality;
  const bar = qualityBar(q);
  const title = t("profile.qualityTitle", { valid: q.valid, validPct: percent(q.valid, q.total), error: q.error, errorPct: percent(q.error, q.total), empty: q.empty, emptyPct: percent(q.empty, q.total) });
  return (
    <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-muted" title={title} role="img" aria-label={title}>
      <div className="h-full bg-emerald-500" style={{ width: `${bar.valid}%` }} />
      <div className="h-full bg-red-500" style={{ width: `${bar.error}%` }} />
      <div className="h-full bg-slate-500" style={{ width: `${bar.empty}%` }} />
    </div>
  );
}

function MiniDistribution({ profile }: { profile: ColumnProfile }) {
  const t = useTranslations("query-flow");
  const bars = profile.distribution.slice(0, 10);
  const max = bars[0]?.count ?? 1;
  const title = t("profile.distributionTitle", { distinct: profile.distinct, unique: profile.unique });
  return (
    <div className="flex h-6 items-end gap-px" title={title} role="img" aria-label={title}>
      {bars.map((b) => (
        <div key={b.value} className="w-1.5 rounded-t-sm bg-sky-600/70" style={{ height: `${Math.max(8, (b.count / max) * 100)}%` }} />
      ))}
    </div>
  );
}

export interface DataGridProps {
  columns: string[];
  rows: string[][];
  profile: ProfileResult | null;
  showQuality: boolean;
  showDistribution: boolean;
  monospaced: boolean;
  showWhitespace: boolean;
  selectedColumns: string[];
  selectedCell: { row: number; column: string } | null;
  maxRows?: number;
  onSelectColumn: (name: string, mode: "single" | "toggle" | "range") => void;
  onSelectCell: (row: number, column: string) => void;
  /** Right click on a header. */
  onColumnMenu: (name: string, x: number, y: number) => void;
  /** The dropdown arrow of a header (filter / sort). */
  onFilterMenu: (name: string, x: number, y: number) => void;
  onCellMenu: (row: number, column: string, x: number, y: number) => void;
  /** The type icon of a header: opens the data type menu. */
  onTypeMenu: (name: string, x: number, y: number) => void;
  /** A header was dropped on another one: the column goes to that index. */
  onMoveColumn: (name: string, toIndex: number) => void;
  onRenameColumn: (name: string, to: string) => void;
  /** F2: the editor asks the grid to edit this header's name. */
  renamingColumn: string | null;
  onRenamingDone: () => void;
}

export function DataGrid({ columns, rows, profile, showQuality, showDistribution, monospaced, showWhitespace, selectedColumns, selectedCell, maxRows = 200, onSelectColumn, onSelectCell, onColumnMenu, onFilterMenu, onCellMenu, onTypeMenu, onMoveColumn, onRenameColumn, renamingColumn, onRenamingDone }: DataGridProps) {
  const t = useTranslations("query-flow");
  const shown = rows.slice(0, maxRows);
  const [dragName, setDragName] = useState<string | null>(null);
  const [overName, setOverName] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  useEffect(() => { if (renamingColumn) { setEditing(renamingColumn); setDraft(renamingColumn); } }, [renamingColumn]);
  const finishRename = (name: string, commit: boolean) => { if (commit && draft.trim() && draft !== name) onRenameColumn(name, draft.trim()); setEditing(null); onRenamingDone(); };
  return (
    <div className={cn("min-h-0 flex-1 overflow-auto", monospaced && "font-mono")}>
      <table className="border-collapse text-xs">
        <thead className="sticky top-0 z-10 bg-card">
          <tr>
            <th className="w-10 border border-border bg-muted px-1 py-1 text-right text-[10px] font-normal text-muted-foreground">#</th>
            {columns.map((name, i) => {
              const p = profile?.columns[i];
              const selected = selectedColumns.includes(name);
              return (
                <th
                  key={`${name}:${i}`}
                  scope="col"
                  aria-selected={selected}
                  draggable={editing !== name}
                  onDragStart={(e) => { setDragName(name); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", name); }}
                  onDragOver={(e) => { if (dragName && dragName !== name) { e.preventDefault(); setOverName(name); } }}
                  onDragEnd={() => { setDragName(null); setOverName(null); }}
                  onDrop={(e) => { e.preventDefault(); if (dragName && dragName !== name) onMoveColumn(dragName, i); setDragName(null); setOverName(null); }}
                  onContextMenu={(e) => { e.preventDefault(); onColumnMenu(name, e.clientX, e.clientY); }}
                  className={cn("min-w-[120px] max-w-[260px] border border-border p-0 text-left align-top", selected ? "bg-primary/15" : "bg-muted", overName === name && "outline outline-2 -outline-offset-2 outline-primary")}
                >
                  <div className="flex items-center gap-1 px-1.5 pt-1">
                    {p ? (
                      <button type="button" title={t("grid.changeType")} aria-label={t("grid.changeType")} onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); onTypeMenu(name, r.left, r.bottom + 2); }} className="rounded hover:ring-1 hover:ring-primary">
                        <TypeIcon type={p.type} decimal={p.decimal} hasTime={p.hasTime} />
                      </button>
                    ) : null}
                    {editing === name ? (
                      <input autoFocus value={draft} aria-label={t("schema.rename")} onChange={(e) => setDraft(e.target.value)} onBlur={() => finishRename(name, true)} onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") finishRename(name, true); if (e.key === "Escape") finishRename(name, false); }} className="h-5 min-w-0 flex-1 rounded border border-border bg-background px-1 text-xs font-semibold text-foreground" />
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => onSelectColumn(name, e.shiftKey ? "range" : e.ctrlKey || e.metaKey ? "toggle" : "single")}
                        onDoubleClick={() => { setEditing(name); setDraft(name); }}
                        className="min-w-0 flex-1 truncate text-left font-semibold text-foreground"
                        title={name}
                      >
                        {name}
                      </button>
                    )}
                    <button
                      type="button"
                      title={t("grid.filterMenu")}
                      aria-label={t("grid.filterMenu")}
                      onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); onFilterMenu(name, r.left, r.bottom + 2); }}
                      className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-background hover:text-foreground"
                    >
                      <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="space-y-1 px-1.5 pb-1.5 pt-1">
                    {showDistribution && p ? <MiniDistribution profile={p} /> : null}
                    {showQuality && p ? <QualityBar profile={p} /> : null}
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {shown.map((row, ri) => (
            <tr key={ri}>
              <td className="border border-border bg-muted px-1 py-0.5 text-right text-[10px] text-muted-foreground">{ri + 1}</td>
              {columns.map((name, ci) => {
                const cell = row[ci] ?? "";
                const kind = cellClass(cell, profile?.columns[ci]?.type ?? "text");
                const here = selectedCell?.row === ri && selectedCell.column === name;
                return (
                  <td
                    key={`${ci}`}
                    onClick={() => onSelectCell(ri, name)}
                    onContextMenu={(e) => { e.preventDefault(); onSelectCell(ri, name); onCellMenu(ri, name, e.clientX, e.clientY); }}
                    className={cn(
                      "max-w-[260px] truncate border border-border px-1.5 py-0.5",
                      kind === "error" ? "bg-red-500/10 font-medium text-red-700 dark:text-red-300" : kind === "empty" ? "bg-card italic text-muted-foreground" : "bg-card text-foreground",
                      selectedColumns.includes(name) && kind !== "error" && "bg-primary/5",
                      here && "outline outline-2 -outline-offset-2 outline-primary",
                    )}
                    title={cell}
                  >
                    {kind === "error" ? t("grid.error") : kind === "empty" ? t("grid.empty") : showWhitespace ? cell.replace(/ /g, "·") : cell}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > shown.length ? <p className="p-2 text-[11px] text-muted-foreground">{t("grid.moreRows", { count: rows.length - shown.length })}</p> : null}
    </div>
  );
}

const fmt = (n: number): string => (Number.isInteger(n) ? String(n) : String(Math.round(n * 1000) / 1000));

export function ColumnProfilePanel({
  profile,
  result,
  onPickValue,
  onValueMenu,
  onToggleWhole,
}: {
  profile: ColumnProfile;
  result: ProfileResult;
  onPickValue: (value: string) => void;
  onValueMenu: (value: string, x: number, y: number) => void;
  onToggleWhole: () => void;
}) {
  const t = useTranslations("query-flow");
  const [byLength, setByLength] = useState(false);
  const bars = byLength ? profile.lengthDistribution : profile.distribution;
  const max = Math.max(1, ...bars.map((b) => b.count));
  const q = profile.quality;
  const rows: Array<[string, string]> = [
    [t("profile.count"), String(q.total)],
    [t("profile.empty"), String(q.empty)],
    [t("profile.errors"), String(q.error)],
    [t("profile.distinct"), String(profile.distinct)],
    [t("profile.unique"), String(profile.unique)],
  ];
  if (profile.stats) {
    rows.push([t("profile.min"), fmt(profile.stats.min)], [t("profile.max"), fmt(profile.stats.max)], [t("profile.average"), fmt(profile.stats.average)], [t("profile.median"), fmt(profile.stats.median)], [t("profile.stdDev"), fmt(profile.stats.stdDev)]);
  } else if (profile.textMin !== null) {
    rows.push([t("profile.min"), profile.textMin], [t("profile.max"), profile.textMax ?? ""]);
  }
  return (
    <div className="grid h-full gap-3 overflow-auto border-t border-border bg-card/60 p-2 md:grid-cols-[220px_1fr]">
      <div>
        <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <TypeIcon type={profile.type} decimal={profile.decimal} hasTime={profile.hasTime} />
          <span className="truncate">{profile.name}</span>
        </p>
        <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 text-[11px]">
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="max-w-[110px] truncate text-right font-mono text-foreground" title={v}>{v}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="min-w-0">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <p className="text-xs font-semibold text-foreground">{byLength ? t("profile.lengthDistribution") : t("profile.valueDistribution")}</p>
          {profile.type === "text" ? (
            <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <input type="checkbox" checked={byLength} onChange={(e) => setByLength(e.target.checked)} />
              {t("profile.groupByLength")}
            </label>
          ) : null}
          <span className="ml-auto text-[10px] text-muted-foreground">{result.sampled ? t("profile.sampled", { count: result.rowsProfiled }) : t("profile.whole", { count: result.rowsTotal })}</span>
          {result.sampled || result.rowsTotal > 1000 ? (
            <button type="button" onClick={onToggleWhole} className="rounded border border-border px-1.5 py-0.5 text-[10px] font-medium text-foreground hover:bg-muted">
              {result.sampled ? t("profile.profileWhole") : t("profile.profileSample")}
            </button>
          ) : null}
        </div>
        <ul className="space-y-0.5">
          {bars.map((b) => (
            <li key={b.value}>
              <button
                type="button"
                disabled={byLength}
                title={byLength ? undefined : t("profile.barHint", { value: b.value })}
                onClick={() => onPickValue(b.value)}
                onContextMenu={(e) => { if (byLength) return; e.preventDefault(); onValueMenu(b.value, e.clientX, e.clientY); }}
                className="flex w-full items-center gap-2 rounded px-1 py-0.5 text-left text-[11px] hover:bg-muted disabled:cursor-default disabled:hover:bg-transparent"
              >
                <span className="w-28 shrink-0 truncate text-foreground">{b.value}</span>
                <span className="h-3 min-w-[2px] rounded-sm bg-sky-600" style={{ width: `${Math.max(1, (b.count / max) * 60)}%` }} />
                <span className="shrink-0 font-mono text-muted-foreground">{b.count} · {percent(b.count, q.valid)}%</span>
              </button>
            </li>
          ))}
          {bars.length === 0 ? <li className="text-[11px] text-muted-foreground">{t("profile.noValues")}</li> : null}
        </ul>
      </div>
    </div>
  );
}

const SCHEMA_TYPES = ["any", "text", "whole", "decimal", "date", "datetime", "bool", "list"] as const;

/** The Power Query type a profiled column corresponds to. */
function typeIdOf(c: ColumnProfile): string {
  if (c.type === "number") return c.decimal ? "decimal" : "whole";
  if (c.type === "date") return c.hasTime ? "datetime" : "date";
  if (c.type === "boolean") return "bool";
  if (c.type === "empty") return "any";
  return "text";
}

export function SchemaView({
  profile,
  onRename,
  onRemove,
  onDuplicate,
  onMove,
  onSelect,
  selectedColumn,
  onChangeType,
  onMenu,
  onMoveTo,
}: {
  profile: ProfileResult | null;
  onRename: (column: string, name: string) => void;
  onRemove: (column: string) => void;
  onDuplicate: (column: string) => void;
  onMove: (column: string, dir: "left" | "right") => void;
  onSelect: (column: string) => void;
  selectedColumn: string | null;
  /** The type select of a row: a "Changed Type" step. */
  onChangeType: (column: string, type: string) => void;
  /** Right click on a row: the column menu. */
  onMenu: (column: string, x: number, y: number) => void;
  /** A row was dropped at this index. */
  onMoveTo: (column: string, index: number) => void;
}) {
  const t = useTranslations("query-flow");
  const [dragName, setDragName] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  if (!profile || profile.columns.length === 0) return <p className="p-3 text-xs text-muted-foreground">{t("schema.empty")}</p>;
  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <table className="w-full border-collapse text-xs">
        <thead className="sticky top-0 bg-muted text-left text-[11px] text-muted-foreground">
          <tr>
            <th className="border border-border px-2 py-1">{t("schema.column")}</th>
            <th className="border border-border px-2 py-1">{t("schema.type")}</th>
            <th className="border border-border px-2 py-1">{t("schema.quality")}</th>
            <th className="border border-border px-2 py-1">{t("profile.distinct")}</th>
            <th className="border border-border px-2 py-1"><span className="sr-only">{t("schema.actions")}</span></th>
          </tr>
        </thead>
        <tbody>
          {profile.columns.map((c, i) => (
            <tr
              key={`${c.name}:${i}`}
              draggable
              onDragStart={(e) => { setDragName(c.name); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", c.name); }}
              onDragOver={(e) => { if (dragName && dragName !== c.name) e.preventDefault(); }}
              onDrop={(e) => { e.preventDefault(); if (dragName && dragName !== c.name) onMoveTo(dragName, i); setDragName(null); }}
              onDragEnd={() => setDragName(null)}
              onContextMenu={(e) => { e.preventDefault(); onSelect(c.name); onMenu(c.name, e.clientX, e.clientY); }}
              className={cn("bg-card", c.name === selectedColumn && "bg-primary/10")}
            >
              <td className="border border-border px-2 py-1">
                {editing === c.name ? (
                  <TextInput
                    autoFocus
                    value={draft}
                    aria-label={t("schema.rename")}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={() => { if (draft.trim() && draft !== c.name) onRename(c.name, draft.trim()); setEditing(null); }}
                    onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") setEditing(null); }}
                  />
                ) : (
                  <button type="button" className="text-left font-medium text-foreground" onClick={() => onSelect(c.name)} onDoubleClick={() => { setDraft(c.name); setEditing(c.name); }} title={t("schema.renameHint")}>{c.name}</button>
                )}
              </td>
              <td className="border border-border px-2 py-1">
                <span className="inline-flex items-center gap-1 text-foreground">
                  <TypeIcon type={c.type} decimal={c.decimal} hasTime={c.hasTime} />
                  <select aria-label={t("grid.changeType")} value={typeIdOf(c)} onChange={(e) => onChangeType(c.name, e.target.value)} className="h-6 rounded border border-border bg-background px-1 text-xs text-foreground">
                    {SCHEMA_TYPES.map((id) => <option key={id} value={id} disabled={id === "list"}>{t(`typeMenu.${id}`)}</option>)}
                  </select>
                </span>
              </td>
              <td className="w-40 border border-border px-2 py-1"><QualityBar profile={c} /></td>
              <td className="border border-border px-2 py-1 font-mono text-foreground">{c.distinct}</td>
              <td className="whitespace-nowrap border border-border px-1 py-0.5">
                <IconButton label={t("schema.moveLeft")} className="h-6 w-6" disabled={i === 0} onClick={() => onMove(c.name, "left")}><ArrowUp className="h-3 w-3" /></IconButton>
                <IconButton label={t("schema.moveRight")} className="h-6 w-6" disabled={i === profile.columns.length - 1} onClick={() => onMove(c.name, "right")}><ArrowDown className="h-3 w-3" /></IconButton>
                <IconButton label={t("schema.duplicate")} className="h-6 w-6" onClick={() => onDuplicate(c.name)}><Copy className="h-3 w-3" /></IconButton>
                <IconButton label={t("schema.remove")} className="h-6 w-6" danger onClick={() => onRemove(c.name)}><Trash2 className="h-3 w-3" /></IconButton>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
