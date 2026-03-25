"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Table as TableIcon, Plus, Trash2, Calculator, Settings2, Columns, Rows, X } from "lucide-react";
import { sheetEngine } from "@/lib/sheetEngine";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ReferenceResolver } from "@/lib/reference-resolver";

interface TableBrickProps {
  id: string;
  data: string[][];
  onUpdate: (newData: string[][]) => void;
  readonly?: boolean;
  documents?: any[];
  boards?: any[];
  users?: any[];
}

export const UnifiedTableBrick: React.FC<TableBrickProps> = ({ id, data, onUpdate, readonly, documents = [], boards = [], users = [] }) => {
  const renderCellWithMentions = (content: string, _context: any) => {
    if (!content) return null;
    const docIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-file-text"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/></svg>`;
    const boardIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-layout-dashboard"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>`;

    const richParts = ReferenceResolver.renderRich(content, { documents, boards, users } as any);
    return richParts.map((part, i) => {
      if (typeof part === 'string') return part;

      const isUser = part.mentionType === 'user';
      if (part.type === 'mention') {
        return (
          <span key={i} className={`inline-flex items-center gap-1 px-1 py-0.5 rounded text-[9px] font-medium border ${isUser ? 'bg-primary/10 border-primary/20 text-primary' : 'bg-accent/10 border-accent/20 text-accent'
            }`}>
            {part.mentionType === 'doc' && <span dangerouslySetInnerHTML={{ __html: docIcon }} />}
            {part.mentionType === 'board' && <span dangerouslySetInnerHTML={{ __html: boardIcon }} />}
            {isUser && "@"}
            {part.name}
          </span>
        );
      }

      if (part.type === 'deep') {
        return (
          <span key={i} className="inline-flex items-center gap-1 px-1 py-0.5 rounded text-[9px] font-medium border bg-amber-500/10 border-amber-500/20 text-amber-600">
            <Calculator className="w-2 h-2" /> {part.label}
          </span>
        );
      }
      return null;
    });
  };

  const [editingCell, setEditingCell] = useState<{ r: number; c: number } | null>(null);
  const [computedData, setComputedData] = useState<string[][]>([]);

  // Initialize engine with data
  useEffect(() => {
    sheetEngine.updateSheet(id, data);
    const rows = data.length || 1;
    const cols = data[0]?.length || 1;
    setComputedData(sheetEngine.getComputedData(id, rows, cols));
  }, [data, id]);

  const handleCellChange = (r: number, c: number, value: string) => {
    const newData = data.map((row, ri) =>
      ri === r ? row.map((cell, ci) => (ci === c ? value : cell)) : row
    );
    onUpdate(newData);
  };

  const addRow = () => {
    const newRow = new Array(data[0]?.length || 1).fill("");
    onUpdate([...data, newRow]);
  };

  const addColumn = () => {
    onUpdate(data.map(row => [...row, ""]));
  };

  const removeRow = (idx: number) => {
    if (data.length <= 1) return;
    onUpdate(data.filter((_, i) => i !== idx));
  };

  const removeColumn = (idx: number) => {
    if (data[0]?.length <= 1) return;
    onUpdate(data.map(row => row.filter((_, i) => i !== idx)));
  };

  const getCellLabel = (c: number) => String.fromCharCode(65 + c);

  return (
    <div className="w-full bg-card border border-border rounded-xl overflow-hidden shadow-sm group/table">
      <div className="bg-muted/30 p-2 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2 px-1">
          <TableIcon className="w-4 h-4 text-accent" />
          <span className="text-xs font-semibold opacity-70 tracking-wide uppercase">Datagrid Engine v2</span>
        </div>
        {!readonly && (
          <div className="flex gap-2 opacity-0 group-hover/table:opacity-100 transition-opacity">
            <Button variant="ghost" size="sm" onClick={addColumn} className="h-7 px-2 text-[10px] gap-1">
              <Columns className="w-3 h-3" /> + Col
            </Button>
            <Button variant="ghost" size="sm" onClick={addRow} className="h-7 px-2 text-[10px] gap-1">
              <Rows className="w-3 h-3" /> + Row
            </Button>
          </div>
        )}
      </div>

      <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-accent/20">
        <table className="w-full border-collapse table-fixed min-w-[600px]">
          <thead>
            <tr className="bg-muted/10">
              <th className="w-10 border-b border-r border-border bg-muted/20 text-[10px] font-bold text-center text-muted-foreground">#</th>
              {data[0]?.map((_, ci) => (
                <th key={ci} className="border-b border-r border-border p-1 bg-muted/5 group/colHeader">
                  <div className="flex items-center justify-between px-1">
                    <span className="text-[10px] font-bold text-muted-foreground">{getCellLabel(ci)}</span>
                    {!readonly && (
                      <button onClick={() => removeColumn(ci)} className="opacity-0 group-hover/colHeader:opacity-100 text-destructive/50 hover:text-destructive">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, ri) => (
              <tr key={ri} className="hover:bg-accent/5 transition-colors group/row">
                <td className="border-b border-r border-border bg-muted/10 text-[10px] font-bold text-center text-muted-foreground p-1 relative">
                  {ri + 1}
                  {!readonly && (
                    <button
                      onClick={() => removeRow(ri)}
                      className="absolute left-0 top-0 w-full h-full bg-destructive/10 text-destructive opacity-0 group-hover/row:opacity-100 flex items-center justify-center transition-opacity"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </td>
                {row.map((cell, ci) => {
                  const isEditing = editingCell?.r === ri && editingCell?.c === ci;
                  const computed = computedData[ri]?.[ci] || "";
                  const isFormula = cell.startsWith("=");

                  return (
                    <td key={ci} className="border-b border-r border-border p-0 relative h-10 group/cell">
                      {isEditing ? (
                        <input
                          autoFocus
                          className="w-full h-full px-2 py-1 text-sm bg-accent/10 border-none outline-none focus:ring-1 focus:ring-accent font-mono"
                          value={cell}
                          onChange={(e) => handleCellChange(ri, ci, e.target.value)}
                          onBlur={() => setEditingCell(null)}
                          onKeyDown={(e) => e.key === "Enter" && setEditingCell(null)}
                        />
                      ) : (
                        <div
                          className={cn(
                            "w-full h-full px-2 py-1 flex items-center text-sm cursor-pointer select-none transition-all",
                            isFormula && "text-accent font-medium bg-accent/5"
                          )}
                          onClick={() => !readonly && setEditingCell({ r: ri, c: ci })}
                        >
                          <div className="truncate w-full">
                            {renderCellWithMentions(computed, { documents, boards, users })}
                          </div>
                          {isFormula && !isEditing && (
                            <Calculator className="w-3 h-3 opacity-0 group-hover/cell:opacity-40 animate-pulse ml-auto" />
                          )}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="p-2 border-t border-border bg-muted/5 flex items-center gap-4">
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground uppercase tracking-widest px-2 py-1 rounded bg-muted/20">
          <Settings2 className="w-3 h-3" /> Double click cell to edit formula
        </div>
        {editingCell && (
          <div className="flex-1 flex items-center gap-2 bg-accent/10 px-2 py-1 rounded-md border border-accent/20 animate-in slide-in-from-left-2 duration-300">
            <span className="text-[10px] font-bold text-accent">{getCellLabel(editingCell.c)}{editingCell.r + 1}:</span>
            <span className="text-[10px] font-mono text-accent/80 truncate">{data[editingCell.r][editingCell.c]}</span>
          </div>
        )}
      </div>
    </div>
  );
};
