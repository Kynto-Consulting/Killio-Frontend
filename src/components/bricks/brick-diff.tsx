"use client";

import { useTranslations } from "@/components/providers/i18n-provider";
import * as jsdiff from "diff";
import { ReactNode } from "react";
import { Check, X } from "lucide-react";

export type BrickDiffProps = {
  kind: string;
  oldContent: any;
  newContent: any;
};

export function BrickDiff({ kind, oldContent, newContent }: BrickDiffProps) {
  const t = useTranslations("common");
  if (!oldContent && !newContent) {
    return (
      <div className="text-[10px] text-muted-foreground italic border border-dashed p-2 rounded">
        {t("brickDiff.noContent")}
      </div>
    );
  }

  if (!oldContent) {
    return <NewBrickContent kind={kind} content={newContent} />;
  }

  if (!newContent) {
    return <RemovedBrickContent kind={kind} content={oldContent} />;
  }

  const oldText = getTextValue(oldContent);
  const newText = getTextValue(newContent);
  const oldItems = getChecklistItems(oldContent);
  const newItems = getChecklistItems(newContent);
  const oldRows = getTableRows(oldContent);
  const newRows = getTableRows(newContent);

  switch (kind) {
    case 'text':
      return <TextDiff old={oldText} new={newText} />;
    case 'checklist':
      return <ChecklistDiff old={oldItems} new={newItems} />;
    case 'accordion':
      return <AccordionDiff old={oldContent || {}} new={newContent || {}} />;
    case 'table':
    case 'beautiful_table':
    case 'bountiful_table':
      return <TableDiff old={oldRows} new={newRows} />;
    default:
      return (
        <div className="text-[10px] text-muted-foreground italic border border-dashed p-2 rounded">
          Bloque tipo {kind} (sin vista previa de diff)
        </div>
      );
  }
}

function getTextValue(content: any): string {
  if (typeof content === "string") return content;
  if (!content || typeof content !== "object") return "";
  if (typeof content.markdown === "string") return content.markdown;
  if (typeof content.body === "string") return content.body;
  if (typeof content.title === "string" && !content.body && !content.markdown) return content.title;
  if (typeof content.content?.markdown === "string") return content.content.markdown;
  if (typeof content.content?.body === "string") return content.content.body;
  return "";
}

function getChecklistItems(content: any): any[] {
  if (!content) return [];

  const raw =
    (Array.isArray(content) ? content : null) ||
    (Array.isArray(content.items) ? content.items : null) ||
    (Array.isArray(content.tasks) ? content.tasks : null) ||
    (Array.isArray(content.content?.items) ? content.content.items : null) ||
    (Array.isArray(content.content?.tasks) ? content.content.tasks : null) ||
    [];

  return raw.map((item: any) => {
    if (typeof item === "string") return { label: item };
    if (!item || typeof item !== "object") return { label: "" };
    return {
      ...item,
      label: typeof item.label === "string" ? item.label : (typeof item.text === "string" ? item.text : ""),
    };
  });
}

function getTableRows(content: any): string[][] {
  if (!content) return [];
  const rows =
    (Array.isArray(content.rows) ? content.rows : null) ||
    (Array.isArray(content.content?.rows) ? content.content.rows : null) ||
    [];
  if (rows.length === 0) return [];

  if (Array.isArray(rows[0])) {
    return rows.map((row: any) => (Array.isArray(row) ? row.map((cell) => String(cell ?? "")) : []));
  }

  const source = content.content || content;
  const columns = Array.isArray(source?.columns) ? source.columns : [];
  const columnOrder = columns.length > 0
    ? columns.map((col: any, index: number) => ({
      id: String(col?.id ?? index),
      label: String(col?.name ?? col?.label ?? col?.title ?? `col ${index + 1}`),
    }))
    : Object.keys((rows[0] && typeof rows[0] === "object" ? rows[0].cells || rows[0] : {}) || {}).map((key) => ({ id: key, label: key }));

  const result: string[][] = [];
  if (columnOrder.length > 0) {
    result.push(columnOrder.map((entry: any) => entry.label));
  }

  for (const row of rows) {
    const rowCells = (row && typeof row === "object" ? (row.cells || row) : {}) as Record<string, any>;
    result.push(columnOrder.map((entry: any) => stringifyTableCell(rowCells?.[entry.id])));
  }

  return result;
}

function stringifyTableCell(value: any): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map((item) => stringifyTableCell(item)).join(", ");
  if (typeof value === "object") {
    if (typeof value.type === "string") {
      if (value.type === "checkbox") return value.checked ? "true" : "false";
      if (value.type === "number") return String(value.number ?? value.value ?? "").trim();
      if (value.type === "select") return String(value.name ?? value.text ?? value.value ?? "").trim();
      if (value.type === "multi_select") {
        return Array.isArray(value.items)
          ? value.items.map((item: any) => String(item?.name ?? item?.label ?? item ?? "").trim()).filter(Boolean).join(", ")
          : "";
      }
      if (value.type === "date") {
        const start = String(value.start ?? "").trim();
        const end = String(value.end ?? "").trim();
        return end ? `${start} -> ${end}` : start;
      }
      if (value.type === "user") {
        return Array.isArray(value.users)
          ? value.users.map((user: any) => String(user?.name ?? user?.email ?? user?.id ?? "").trim()).filter(Boolean).join(", ")
          : "";
      }
      if (value.type === "document") {
        return Array.isArray(value.documents)
          ? value.documents.map((doc: any) => String(doc?.name ?? doc?.title ?? doc?.id ?? "").trim()).filter(Boolean).join(", ")
          : "";
      }
      if (value.type === "board") {
        return Array.isArray(value.boards)
          ? value.boards.map((board: any) => String(board?.name ?? board?.title ?? board?.id ?? "").trim()).filter(Boolean).join(", ")
          : "";
      }
      if (value.type === "card") {
        return Array.isArray(value.cards)
          ? value.cards.map((card: any) => String(card?.name ?? card?.title ?? card?.id ?? "").trim()).filter(Boolean).join(", ")
          : "";
      }
      if (value.type === "url") return String(value.url ?? value.value ?? value.text ?? "").trim();
    }

    return String(value.text ?? value.markdown ?? value.value ?? value.name ?? "").trim() || JSON.stringify(value);
  }
  return String(value);
}

function TextDiff({ old, new: newValue }: { old: string; new: string }) {
  const diffs = jsdiff.diffWordsWithSpace(old, newValue);
  return (
    <div className="font-mono text-[11px] leading-relaxed whitespace-pre-wrap p-2 bg-background/20 rounded border border-border/30">
      {diffs.map((part, i) => (
        <span
          key={i}
          className={
            part.added
              ? "bg-emerald-500/20 text-emerald-400 font-bold px-0.5 rounded"
              : part.removed
              ? "bg-rose-500/20 text-rose-400/70 line-through px-0.5 rounded decoration-rose-500/50"
              : "text-foreground/80"
          }
        >
          {part.value}
        </span>
      ))}
    </div>
  );
}

function ChecklistDiff({ old, new: newValue }: { old: any[]; new: any[] }) {
  // Simple heuristic: match by id or position
  // For AI suggested diffs, they might not have IDs, so we compare by label
  const oldLabels = old.map(item => String(item?.label ?? ""));
  const newLabels = newValue.map(item => String(item?.label ?? ""));
  
  const diffs = jsdiff.diffArrays(oldLabels, newLabels);

  return (
    <div className="space-y-1 pl-2 border-l-2 border-accent/20 py-1">
      {diffs.map((part, i) => (
        part.value.map((label, j) => (
          <div 
            key={`${i}-${j}`} 
            className={`flex items-center gap-2 text-[10px] py-0.5 px-1.5 rounded ${
              part.added ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/10" :
              part.removed ? "bg-rose-500/10 text-rose-400 line-through border border-rose-500/10 opacity-60" :
              "text-foreground/70"
            }`}
          >
            {part.added ? <Check className="w-2.5 h-2.5" /> : part.removed ? <X className="w-2.5 h-2.5" /> : <div className="w-3 h-3 rounded border border-border shrink-0" />}
            <span className="truncate">{label}</span>
          </div>
        ))
      ))}
    </div>
  );
}

function AccordionDiff({ old, new: newValue }: { old: any; new: any }) {
  const t = useTranslations("common");
  const oldTitle = typeof old?.title === "string" ? old.title : (typeof old?.content?.title === "string" ? old.content.title : "");
  const newTitle = typeof newValue?.title === "string" ? newValue.title : (typeof newValue?.content?.title === "string" ? newValue.content.title : "");
  const oldBody = typeof old?.body === "string" ? old.body : (typeof old?.content?.body === "string" ? old.content.body : "");
  const newBody = typeof newValue?.body === "string" ? newValue.body : (typeof newValue?.content?.body === "string" ? newValue.content.body : "");

  return (
    <div className="space-y-2 border-l-2 border-accent/20 pl-2">
      <div className="text-[10px] font-bold text-muted-foreground uppercase flex items-center gap-1">
        <span>{t("brickDiff.title")}</span>
        <TextDiff old={oldTitle} new={newTitle} />
      </div>
      <div className="text-[10px] font-bold text-muted-foreground uppercase flex flex-col gap-1">
        <span>{t("brickDiff.content")}</span>
        <TextDiff old={oldBody} new={newBody} />
      </div>
    </div>
  );
}

function TableDiff({ old, new: newValue }: { old: string[][]; new: string[][] }) {
  return (
    <div className="overflow-x-auto border rounded-lg bg-background/20 mt-1">
      <table className="w-full text-left border-collapse">
        <tbody className="divide-y divide-border/30">
          {newValue.map((row, rIdx) => (
            <tr key={rIdx} className="divide-x divide-border/20">
              {row.map((cell, cIdx) => {
                const oldCell = old[rIdx]?.[cIdx] || "";
                return (
                  <td key={cIdx} className="p-2 text-[9px]">
                    <TextDiff old={oldCell} new={cell} />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function NewBrickContent({ kind, content }: { kind: string; content: any }) {
  const textValue = getTextValue(content);
  const items = getChecklistItems(content);

  return (
    <div className="border border-emerald-500/20 bg-emerald-500/5 p-2 rounded animate-pulse-subtle">
      <div className="text-[8px] font-bold text-emerald-500 uppercase tracking-widest mb-1 font-mono">NEW {kind}</div>
      {kind === 'text' && <div className="text-[10px] font-mono text-emerald-400/80">{textValue}</div>}
      {kind === 'checklist' && (
        <div className="space-y-1">
          {items.map((item: any, i: number) => (
            <div key={i} className="flex items-center gap-2 text-[10px] text-emerald-400/70">
              <Check className="w-2.5 h-2.5" />
              <span>{item.label}</span>
            </div>
          ))}
        </div>
      )}
      {/* Add more as needed */}
    </div>
  );
}

function RemovedBrickContent({ kind, content }: { kind: string; content: any }) {
  const textValue = getTextValue(content);
  const items = getChecklistItems(content);

  return (
    <div className="border border-rose-500/20 bg-rose-500/5 p-2 rounded">
      <div className="text-[8px] font-bold text-rose-500 uppercase tracking-widest mb-1 font-mono">REMOVED {kind}</div>
      {kind === 'text' && <div className="text-[10px] font-mono text-rose-300/80 line-through">{textValue}</div>}
      {kind === 'checklist' && (
        <div className="space-y-1">
          {items.map((item: any, i: number) => (
            <div key={i} className="flex items-center gap-2 text-[10px] text-rose-300/80 line-through">
              <X className="w-2.5 h-2.5" />
              <span>{item.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
