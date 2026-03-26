"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Table as TableIcon, Trash2, Plus, Rows, Columns, Calculator } from "lucide-react";
import { sheetEngine } from "@/lib/sheetEngine";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ReferenceResolver } from "@/lib/reference-resolver";
import { Portal } from "../ui/portal";
import { ReferencePicker, ReferencePickerSelection } from "@/components/documents/reference-picker";
import { DocumentBrick } from "@/lib/api/documents";

type FunctionMeta = { name: string; description: string; parameters: string[] };

interface TableBrickProps {
  id: string;
  data: string[][];
  onUpdate: (newData: string[][]) => void;
  readonly?: boolean;
  documents?: any[];
  boards?: any[];
  users?: any[];
  activeBricks?: DocumentBrick[];
}

export const UnifiedTableBrick: React.FC<TableBrickProps> = ({
  id,
  data,
  onUpdate,
  readonly,
  documents = [],
  boards = [],
  users = [],
  activeBricks = [],
}) => {
  const normalizedData = useMemo(() => {
    if (Array.isArray(data) && data.length > 0) return data;
    return [["Columna A", "Columna B"], ["", ""]];
  }, [data]);

  const [editingCell, setEditingCell] = useState<{ r: number; c: number } | null>(null);
  const [editingValue, setEditingValue] = useState<string>("");
  const [computedData, setComputedData] = useState<string[][]>([]);

  const [isDraggingRange, setIsDraggingRange] = useState(false);
  const [selectionStart, setSelectionStart] = useState<{ r: number; c: number } | null>(null);
  const selectionRefIndex = useRef<number | null>(null);

  const [functions, setFunctions] = useState<FunctionMeta[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<FunctionMeta[]>([]);
  const [selectedSuggestion, setSelectedSuggestion] = useState(0);
  const [filterText, setFilterText] = useState("");
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number } | null>(null);
  const [isReferencePickerOpen, setIsReferencePickerOpen] = useState(false);
  const [pickerRange, setPickerRange] = useState<{ trigger: number; cursor: number } | null>(null);

  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    setFunctions(sheetEngine.getFunctionsWithMetadata() as FunctionMeta[]);
  }, []);

  useEffect(() => {
    sheetEngine.updateSheet(id, normalizedData);
    const rows = normalizedData.length;
    const cols = normalizedData[0]?.length || 1;
    setComputedData(sheetEngine.getComputedData(id, rows, cols));
  }, [id, normalizedData]);

  useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (!isDraggingRange) return;
      setIsDraggingRange(false);
      setSelectionStart(null);
      selectionRefIndex.current = null;
      if (editingCell) {
        const key = `${editingCell.r}-${editingCell.c}`;
        inputRefs.current[key]?.focus();
      }
    };
    window.addEventListener("mouseup", handleGlobalMouseUp);
    return () => window.removeEventListener("mouseup", handleGlobalMouseUp);
  }, [isDraggingRange, editingCell]);

  const updatePopoverPosition = (r: number, c: number) => {
    const target = inputRefs.current[`${r}-${c}`];
    if (!target) return;
    const rect = target.getBoundingClientRect();
    setPopoverPos({ top: rect.bottom + 6, left: rect.left });
  };

  const closeReferencePickers = () => {
    setIsReferencePickerOpen(false);
    setPickerRange(null);
  };

  const findTrigger = (value: string, cursor: number, triggerChar: "@") => {
    const trigger = value.lastIndexOf(triggerChar, Math.max(0, cursor - 1));
    if (trigger === -1) return null;
    if (trigger > 0 && !/\s/.test(value[trigger - 1])) return null;
    const fragment = value.slice(trigger + 1, cursor);
    if (/\s/.test(fragment)) return null;
    return { trigger, cursor, fragment };
  };

  const updateReferenceSuggestions = (value: string, cursor: number) => {
    const mention = findTrigger(value, cursor, "@");

    if (!mention) {
      closeReferencePickers();
      return;
    }

    setPickerRange({ trigger: mention.trigger, cursor: mention.cursor });
    setIsReferencePickerOpen(true);
  };

  const commitEdit = () => {
    if (!editingCell) return;
    const { r, c } = editingCell;
    const next = normalizedData.map((row) => [...row]);
    next[r][c] = editingValue;
    onUpdate(next);
  };

  const stopEditing = () => {
    setShowSuggestions(false);
    closeReferencePickers();
    setEditingCell(null);
    setEditingValue("");
  };

  const focusCell = (r: number, c: number) => {
    const maxRow = normalizedData.length - 1;
    const maxCol = (normalizedData[0]?.length || 1) - 1;
    const rr = Math.max(0, Math.min(r, maxRow));
    const cc = Math.max(0, Math.min(c, maxCol));
    const key = `${rr}-${cc}`;
    inputRefs.current[key]?.focus();
    setEditingCell({ r: rr, c: cc });
    setEditingValue(normalizedData[rr][cc] || "");
    setShowSuggestions(false);
    closeReferencePickers();
  };

  const addRow = () => {
    const cols = normalizedData[0]?.length || 1;
    onUpdate([...normalizedData, new Array(cols).fill("")]);
  };

  const addColumn = () => {
    onUpdate(normalizedData.map((row) => [...row, ""]));
  };

  const removeRow = (idx: number) => {
    if (readonly || normalizedData.length <= 1) return;
    onUpdate(normalizedData.filter((_, i) => i !== idx));
  };

  const removeColumn = (idx: number) => {
    if (readonly || (normalizedData[0]?.length || 0) <= 1) return;
    onUpdate(normalizedData.map((row) => row.filter((_, i) => i !== idx)));
  };

  const coordsToAddress = (r: number, c: number) => {
    const col = String.fromCharCode(65 + c);
    return `${col}${r + 1}`;
  };

  const getRangeString = (start: { r: number; c: number }, end: { r: number; c: number }) => {
    const startAddr = coordsToAddress(start.r, start.c);
    if (start.r === end.r && start.c === end.c) return startAddr;
    const endAddr = coordsToAddress(end.r, end.c);
    return `${startAddr}:${endAddr}`;
  };

  const handleMouseDownCell = (e: React.MouseEvent, r: number, c: number) => {
    if (!editingCell) return;
    if (editingCell.r === r && editingCell.c === c) return;

    if (!editingValue.startsWith("=")) return;

    e.preventDefault();
    setIsDraggingRange(true);
    setSelectionStart({ r, c });
    selectionRefIndex.current = editingValue.length;
    setEditingValue((prev) => `${prev}${coordsToAddress(r, c)}`);

    const activeKey = `${editingCell.r}-${editingCell.c}`;
    setTimeout(() => inputRefs.current[activeKey]?.focus(), 0);
  };

  const handleMouseEnterCell = (r: number, c: number) => {
    if (!isDraggingRange || !selectionStart || selectionRefIndex.current === null) return;
    const prefix = editingValue.slice(0, selectionRefIndex.current);
    const range = getRangeString(selectionStart, { r, c });
    setEditingValue(`${prefix}${range}`);
  };

  const applySuggestion = (fn: string) => {
    if (!editingCell) return;
    const nextValue = `${editingValue.slice(0, editingValue.length - filterText.length)}${fn}(`;
    setEditingValue(nextValue);
    setShowSuggestions(false);
    const key = `${editingCell.r}-${editingCell.c}`;
    setTimeout(() => inputRefs.current[key]?.focus(), 0);
  };

  const updateSuggestions = (value: string, r: number, c: number) => {
    if (!value.startsWith("=")) {
      setShowSuggestions(false);
      return false;
    }

    const match = value.match(/([A-Z]+)$/i);
    if (!match) {
      setShowSuggestions(false);
      return false;
    }

    const token = match[1].toUpperCase();
    const filtered = functions.filter((fn) => fn.name.startsWith(token));
    if (filtered.length === 0) {
      setShowSuggestions(false);
      return false;
    }

    setFilterText(token);
    setSuggestions(filtered);
    setSelectedSuggestion(0);
    setShowSuggestions(true);
    updatePopoverPosition(r, c);
    return true;
  };

  const applyPickedToken = (item: ReferencePickerSelection) => {
    if (!editingCell) return;
    const current = editingValue;
    const cursor = pickerRange?.cursor ?? current.length;
    const trigger = pickerRange?.trigger ?? Math.max(current.lastIndexOf("@", Math.max(0, cursor - 1)), 0);
    const next = `${current.slice(0, trigger)}${item.token} ${current.slice(cursor)}`;
    setEditingValue(next);
    setIsReferencePickerOpen(false);
    setPickerRange(null);
    const key = `${editingCell.r}-${editingCell.c}`;
    setTimeout(() => inputRefs.current[key]?.focus(), 0);
  };

  const renderCellRich = (content: string) => {
    if (!content) return null;
    const parts = ReferenceResolver.renderRich(content, { documents, boards, users } as any);
    return parts.map((part, index) => {
      if (typeof part === "string") return <React.Fragment key={index}>{part}</React.Fragment>;
      if (part.type === "mention") {
        const isUser = part.mentionType === "user";
        return (
          <span
            key={index}
            className={cn(
              "inline-flex items-center gap-1 rounded border px-1 py-0.5 text-[10px] font-medium",
              isUser ? "border-primary/20 bg-primary/10 text-primary" : "border-accent/20 bg-accent/10 text-accent"
            )}
          >
            {isUser ? "@" : ""}
            {part.name}
          </span>
        );
      }
      if (part.type === "deep") {
        return (
          <span key={index} className="inline-flex items-center gap-1 rounded border border-amber-500/20 bg-amber-500/10 px-1 py-0.5 text-[10px] font-medium text-amber-600">
            <Calculator className="h-2.5 w-2.5" />
            {part.label}
          </span>
        );
      }
      return null;
    });
  };

  const getDisplayValue = (r: number, c: number) => {
    if (editingCell?.r === r && editingCell?.c === c) return editingValue;
    return computedData[r]?.[c] ?? normalizedData[r]?.[c] ?? "";
  };

  const colCount = normalizedData[0]?.length || 1;

  return (
    <div className="w-full rounded-xl border border-border bg-card/70 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between border-b border-border bg-muted/25 p-2">
        <div className="flex items-center gap-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <TableIcon className="h-4 w-4 text-accent" />
          Sheet
        </div>
        {!readonly && (
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-[10px]" onClick={addColumn}>
              <Columns className="h-3 w-3" /> + Col
            </Button>
            <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-[10px]" onClick={addRow}>
              <Rows className="h-3 w-3" /> + Row
            </Button>
          </div>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-[620px] w-full border-collapse table-fixed">
          <thead>
            <tr className="bg-muted/10">
              <th className="w-10 border-b border-r border-border/70 p-1 text-[10px] font-bold text-muted-foreground">#</th>
              {Array.from({ length: colCount }).map((_, c) => (
                <th key={`h-${c}`} className="group/col border-b border-r border-border/70 bg-muted/5 p-1">
                  <div className="flex items-center justify-between px-1">
                    <span className="text-[10px] font-bold text-muted-foreground">{String.fromCharCode(65 + c)}</span>
                    {!readonly && (
                      <button onClick={() => removeColumn(c)} className="opacity-0 transition-opacity group-hover/col:opacity-100 text-destructive/60 hover:text-destructive">
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {normalizedData.map((row, r) => (
              <tr key={`r-${r}`} className="group/row hover:bg-accent/5 transition-colors">
                <td className="relative border-b border-r border-border/70 bg-muted/10 p-1 text-center text-[10px] font-bold text-muted-foreground">
                  {r + 1}
                  {!readonly && (
                    <button
                      onClick={() => removeRow(r)}
                      className="absolute inset-0 hidden items-center justify-center bg-destructive/15 text-destructive group-hover/row:flex"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </td>
                {Array.from({ length: colCount }).map((_, c) => {
                  const rawCell = row[c] ?? "";
                  const isEditing = editingCell?.r === r && editingCell?.c === c;
                  const isFormula = rawCell.startsWith("=");
                  return (
                    <td
                      key={`c-${r}-${c}`}
                      className="group/cell relative h-10 border-b border-r border-border/70 p-0"
                      onMouseDown={(e) => handleMouseDownCell(e, r, c)}
                      onMouseEnter={() => handleMouseEnterCell(r, c)}
                    >
                      <input
                        ref={(el) => {
                          inputRefs.current[`${r}-${c}`] = el;
                        }}
                        value={getDisplayValue(r, c)}
                        readOnly={readonly}
                        onFocus={() => {
                          if (readonly) return;
                          setEditingCell({ r, c });
                          setEditingValue(rawCell);
                          setShowSuggestions(false);
                          closeReferencePickers();
                        }}
                        onBlur={() => {
                          if (readonly) return;
                          if (isReferencePickerOpen) {
                            return;
                          }
                          if (editingCell?.r === r && editingCell?.c === c) {
                            commitEdit();
                            stopEditing();
                          }
                        }}
                        onChange={(e) => {
                          if (readonly) return;
                          const value = e.target.value;
                          const cursor = e.target.selectionStart ?? value.length;
                          setEditingValue(value);
                          const formulaActive = updateSuggestions(value, r, c);
                          if (formulaActive) {
                            closeReferencePickers();
                            return;
                          }
                          updateReferenceSuggestions(value, cursor);
                        }}
                        onKeyDown={(e) => {
                          e.stopPropagation();

                          if (showSuggestions && suggestions.length > 0) {
                            if (e.key === "ArrowDown") {
                              e.preventDefault();
                              setSelectedSuggestion((prev) => (prev + 1) % suggestions.length);
                              return;
                            }
                            if (e.key === "ArrowUp") {
                              e.preventDefault();
                              setSelectedSuggestion((prev) => (prev - 1 + suggestions.length) % suggestions.length);
                              return;
                            }
                            if (e.key === "Enter" || e.key === "Tab") {
                              e.preventDefault();
                              applySuggestion(suggestions[selectedSuggestion].name);
                              return;
                            }
                            if (e.key === "Escape") {
                              e.preventDefault();
                              setShowSuggestions(false);
                              return;
                            }
                          }

                          if (e.key === "Enter") {
                            e.preventDefault();
                            commitEdit();
                            focusCell(r + 1, c);
                            return;
                          }
                          if (e.key === "Tab") {
                            e.preventDefault();
                            commitEdit();
                            focusCell(r, c + 1);
                            return;
                          }
                          if (e.key === "ArrowDown") {
                            e.preventDefault();
                            commitEdit();
                            focusCell(r + 1, c);
                            return;
                          }
                          if (e.key === "ArrowUp") {
                            e.preventDefault();
                            commitEdit();
                            focusCell(r - 1, c);
                            return;
                          }
                          if (e.key === "Escape") {
                            e.preventDefault();
                            commitEdit();
                            stopEditing();
                            inputRefs.current[`${r}-${c}`]?.blur();
                            return;
                          }
                        }}
                        className={cn(
                          "h-full w-full bg-transparent px-2 py-1 text-sm outline-none transition-colors",
                          !readonly && "focus:bg-transparent focus:ring-1 focus:ring-inset focus:ring-accent/40",
                          // Color logic: explicit to avoid Tailwind conflicts
                          isEditing && isFormula ? "text-accent font-medium caret-foreground" :
                          isEditing && !isFormula ? "text-foreground caret-foreground" :
                          !isEditing && isFormula ? "text-accent font-medium text-transparent caret-transparent" :
                          "text-foreground text-transparent caret-transparent"
                        )}
                      />
                      {!isEditing && (
                        <div className="pointer-events-none absolute inset-0 flex items-center px-2 py-1 text-sm">
                          <div className="truncate w-full">{renderCellRich(getDisplayValue(r, c))}</div>
                        </div>
                      )}
                      {isFormula && !isEditing && (
                        <Calculator className="pointer-events-none absolute right-1 top-1 h-3 w-3 text-accent/50" />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showSuggestions && popoverPos && !readonly && suggestions.length > 0 && createPortal(
        <div
          className="fixed z-[9999] w-64 max-h-52 overflow-y-auto rounded-md border border-border bg-card shadow-xl"
          style={{ top: popoverPos.top, left: popoverPos.left }}
        >
          {suggestions.map((fn, idx) => (
            <button
              key={fn.name}
              className={cn(
                "w-full border-b border-border/40 px-3 py-2 text-left last:border-b-0",
                idx === selectedSuggestion ? "bg-accent text-accent-foreground" : "hover:bg-muted"
              )}
              onMouseDown={(e) => {
                e.preventDefault();
                applySuggestion(fn.name);
              }}
            >
              <div className="flex items-center gap-2 text-xs font-bold">
                <span>{fn.name}</span>
                {fn.parameters.length > 0 && <span className="font-mono opacity-70">({fn.parameters.join(", ")})</span>}
              </div>
              {fn.description && <p className="mt-0.5 text-[11px] opacity-80">{fn.description}</p>}
            </button>
          ))}
        </div>,
        document.body
      )}

      {isReferencePickerOpen && !readonly && (
        <Portal>
          <ReferencePicker
            boards={boards as any[]}
            documents={documents as any[]}
            users={users as any[]}
            activeBricks={activeBricks as any[]}
            onClose={() => {
              setIsReferencePickerOpen(false);
              setPickerRange(null);
            }}
            onSelect={(item: ReferencePickerSelection) => {
              applyPickedToken(item);
            }}
          />
        </Portal>
      )}

      {!readonly && (
        <div className="flex items-center justify-end gap-2 border-t border-border bg-muted/5 p-2">
          <Button variant="outline" size="sm" className="h-7 gap-1 text-[11px]" onClick={addRow}>
            <Plus className="h-3 w-3" /> Fila
          </Button>
          <Button variant="outline" size="sm" className="h-7 gap-1 text-[11px]" onClick={addColumn}>
            <Plus className="h-3 w-3" /> Columna
          </Button>
        </div>
      )}
    </div>
  );
};
