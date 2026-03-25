"use client";

import * as jsdiff from "diff";
import { ReactNode } from "react";
import { Check, X } from "lucide-react";

export type BrickDiffProps = {
  kind: string;
  oldContent: any;
  newContent: any;
};

export function BrickDiff({ kind, oldContent, newContent }: BrickDiffProps) {
  if (!oldContent) {
    return <NewBrickContent kind={kind} content={newContent} />;
  }

  switch (kind) {
    case 'text':
      return <TextDiff old={oldContent.markdown || ""} new={newContent.markdown || ""} />;
    case 'checklist':
      return <ChecklistDiff old={oldContent.items || []} new={newContent.items || []} />;
    case 'accordion':
      return <AccordionDiff old={oldContent} new={newContent} />;
    case 'table':
      return <TableDiff old={oldContent.rows || []} new={newContent.rows || []} />;
    default:
      return (
        <div className="text-[10px] text-muted-foreground italic border border-dashed p-2 rounded">
          Bloque tipo {kind} (sin vista previa de diff)
        </div>
      );
  }
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
  const oldLabels = old.map(item => item.label);
  const newLabels = newValue.map(item => item.label);
  
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
  return (
    <div className="space-y-2 border-l-2 border-accent/20 pl-2">
      <div className="text-[10px] font-bold text-muted-foreground uppercase flex items-center gap-1">
        <span>Título:</span>
        <TextDiff old={old.title || ""} new={newValue.title || ""} />
      </div>
      <div className="text-[10px] font-bold text-muted-foreground uppercase flex flex-col gap-1">
        <span>Contenido:</span>
        <TextDiff old={old.body || ""} new={newValue.body || ""} />
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
  return (
    <div className="border border-emerald-500/20 bg-emerald-500/5 p-2 rounded animate-pulse-subtle">
      <div className="text-[8px] font-bold text-emerald-500 uppercase tracking-widest mb-1 font-mono">NEW {kind}</div>
      {kind === 'text' && <div className="text-[10px] font-mono text-emerald-400/80">{content.markdown}</div>}
      {kind === 'checklist' && (
        <div className="space-y-1">
          {content.items?.map((item: any, i: number) => (
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
