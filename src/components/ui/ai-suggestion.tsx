"use client";

import React from "react";
import { Check, X, Info, PlusCircle, Loader2, AlertCircle } from "lucide-react";
import { patchBrickCell, updateDocumentBrick } from "@/lib/api/documents";
import { createCard, updateCardBrick } from "@/lib/api/contracts";
import { useSession } from "../providers/session-provider";
import { BrickDiff } from "../bricks/brick-diff";

export type SuggestionType = "BRICK_UPDATE" | "TABLE_CELL_UPDATE" | "NEW_CARD" | "TASK_COMPLETE";

interface AiSuggestionProps {
  type: SuggestionType;
  docId?: string;
  id?: string; // brickId, boardId, cardId etc
  currentBrick?: any;
  payload: any;
  explanation?: string;
  onApply: () => void;
  onReject: () => void;
}

export function AiSuggestion({
  type,
  docId,
  id,
  currentBrick,
  payload,
  explanation,
  onApply,
  onReject,
}: AiSuggestionProps) {
  const { accessToken } = useSession();
  const [isApplying, setIsApplying] = React.useState(false);
  const [dismissed, setDismissed] = React.useState(false);
  const [applyError, setApplyError] = React.useState<string | null>(null);
  const [applyStatus, setApplyStatus] = React.useState<"idle" | "applying" | "success" | "error">("idle");

  const suggestionType = React.useMemo(() => String(type || "").trim().toUpperCase() as SuggestionType, [type]);

  const normalized = React.useMemo(() => normalizeSuggestion(type, payload, id, docId, currentBrick), [type, payload, id, docId, currentBrick]);

  if (dismissed) return null;

  const handleApply = async () => {
    if (!accessToken) return;
    setApplyError(null);
    setApplyStatus("applying");
    setIsApplying(true);
    try {
      if (suggestionType === "TABLE_CELL_UPDATE" || normalized.tableCellPatch) {
        if (!normalized.targetDocId || !normalized.targetBrickId || !normalized.tableCellPatch) {
          throw new Error("TABLE_CELL_UPDATE requiere docId, brickId y patch de celda");
        }

        await patchBrickCell(
          normalized.targetDocId,
          normalized.targetBrickId,
          normalized.tableCellPatch,
          accessToken,
        );
      } else if (suggestionType === "BRICK_UPDATE") {
        if (!normalized.targetBrickId) {
          throw new Error("BRICK_UPDATE requiere brickId para aplicar el cambio");
        }

        if (normalized.contentKind === "table" && normalized.targetDocId) {
          throw new Error("Para tablas en documentos usa TABLE_CELL_UPDATE con patch de celda, no reemplazo completo.");
        }

        if (normalized.targetDocId) {
          await updateDocumentBrick(
            normalized.targetDocId,
            normalized.targetBrickId,
            normalized.documentContent,
            accessToken,
          );
        } else if (normalized.targetCardId && normalized.cardPayload) {
          await updateCardBrick(normalized.targetCardId, normalized.targetBrickId, normalized.cardPayload, accessToken);
        } else {
          throw new Error("BRICK_UPDATE requiere docId o cardId para aplicar el cambio");
        }
      } else if (suggestionType === "NEW_CARD" && payload.listId) {
        await createCard({
            title: payload.title,
            listId: payload.listId,
        }, accessToken);
      } else {
        throw new Error(`Tipo de sugerencia no soportado: ${suggestionType || "UNKNOWN"}`);
      }
      setApplyStatus("success");
      onApply();
    } catch (e) {
      console.error("Failed to apply suggestion", e);
      const message = e instanceof Error ? e.message : "No se pudo aplicar la sugerencia.";
      setApplyError(message);
      setApplyStatus("error");
    } finally {
      setIsApplying(false);
    }
  };

  const Icon = suggestionType === "NEW_CARD" ? PlusCircle : Info;
  const title = suggestionType === "NEW_CARD" ? "Sugerencia: Nueva Card" : "Sugerencia de Mejora";
  const accentColor = suggestionType === "NEW_CARD" ? "text-emerald-500" : "text-accent";
  const bgColor = suggestionType === "NEW_CARD" ? "bg-emerald-500/5 border-emerald-500/30" : "bg-accent/5 border-accent/30";
  const headerBg = suggestionType === "NEW_CARD" ? "bg-emerald-500/10 border-emerald-500/20" : "bg-accent/10 border-accent/20";
  const applyButtonClassName =
    applyStatus === "success"
      ? "bg-emerald-700 text-white"
      : applyStatus === "error"
      ? "bg-rose-600 text-white"
      : "bg-emerald-600 text-white hover:bg-emerald-500";
  const applyStatusMessage =
    applyStatus === "success"
      ? suggestionType === "NEW_CARD"
        ? "Card creada correctamente."
        : "Cambio aplicado correctamente."
      : applyStatus === "error"
      ? (applyError || "No se pudo aplicar la sugerencia.")
      : null;

  return (
    <div className={`my-4 rounded-xl border ${bgColor} overflow-hidden shadow-sm animate-in fade-in zoom-in-95 duration-200`}>
      <div className={`${headerBg} px-3 py-2 border-b flex items-center justify-between`}>
        <div className="flex items-center gap-2">
          <Icon className={`h-4 w-4 ${accentColor}`} />
          <span className={`text-xs font-bold uppercase tracking-wider ${accentColor}`}>{title}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => {
              setDismissed(true);
              onReject();
            }}
            disabled={isApplying}
            className="p-1 px-2 rounded-md hover:bg-rose-500/10 text-rose-500 transition-colors flex items-center gap-1 text-[10px] font-bold uppercase"
          >
            <X className="h-3 w-3" /> Rechazar
          </button>
          <button
            onClick={handleApply}
            disabled={isApplying || applyStatus === "success"}
            className={`p-1 px-2 rounded-md transition-colors disabled:opacity-70 disabled:cursor-not-allowed flex items-center gap-1 text-[10px] font-bold uppercase shadow-sm ${applyButtonClassName}`}
          >
            {applyStatus === "applying" ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : applyStatus === "error" ? (
              <AlertCircle className="h-3 w-3" />
            ) : (
              <Check className="h-3 w-3" />
            )}
            {applyStatus === "applying"
              ? (suggestionType === "NEW_CARD" ? "Creando" : "Aplicando")
              : applyStatus === "success"
              ? (suggestionType === "NEW_CARD" ? "Creada" : "Aplicado")
              : applyStatus === "error"
              ? "Reintentar"
              : (suggestionType === "NEW_CARD" ? "Crear" : "Aplicar")}
          </button>
        </div>
      </div>
      {applyStatusMessage && (
        <div className={`px-3 py-1.5 text-[10px] font-semibold border-b ${applyStatus === "success" ? "text-emerald-300 bg-emerald-500/10 border-emerald-500/20" : "text-rose-400 bg-rose-500/10 border-rose-500/20"}`}>
          {applyStatusMessage}
        </div>
      )}
      
      <div className="p-3 space-y-3">
        {explanation && (
          <p className="text-xs text-muted-foreground italic leading-relaxed">
            "{explanation}"
          </p>
        )}
        
        <div className="grid grid-cols-1 gap-2">
          <div className="rounded-lg border border-border/50 bg-background/50 p-2.5">
            <p className="text-[9px] uppercase font-bold text-muted-foreground mb-1.5 flex items-center gap-1">
              <span className={`w-1.5 h-1.5 rounded-full ${type === "NEW_CARD" ? "bg-emerald-500" : "bg-accent"}`} /> 
              {suggestionType === "NEW_CARD" ? "Detalles de la Card" : "Nuevo Contenido Sugerido"}
            </p>
            <div className="text-sm font-medium leading-relaxed">
              {suggestionType === "NEW_CARD" ? (
                <div className="space-y-1">
                  <div className="text-foreground font-bold">{payload.title}</div>
                  <div className="text-muted-foreground text-[10px]">Lista ID: {payload.listId}</div>
                </div>
              ) : (
                <SuggestionPayloadPreview normalized={normalized} />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

type NormalizedSuggestion = {
  targetBrickId?: string;
  targetDocId?: string;
  targetCardId?: string;
  contentKind: string;
  documentContent: Record<string, any>;
  cardPayload: any | null;
  tableCellPatch?: {
    kind:
      | "bountiful_table_cell"
      | "table_cell"
      | "bountiful_table_column"
      | "bountiful_table_add_column"
      | "bountiful_table_remove_column"
      | "table_add_row"
      | "table_remove_row"
      | "table_add_col"
      | "table_remove_col";
    rowId?: string;
    rowIndex?: number;
    colId?: string;
    colIndex?: number;
    cell?: Record<string, any>;
    value?: string;
    rowMeta?: { _lastEditedAt: string; _lastEditedBy: string };
    updates?: Record<string, any>;
    column?: Record<string, any>;
    atIndex?: number;
    index?: number;
  };
  diff?: {
    before?: string;
    after?: string;
    strategy?: string;
  };
  currentBrick?: any;
  currentTableCell?: any;
  currentTableColumn?: any;
};

function normalizeSuggestion(type: SuggestionType, payload: any, id?: string, docId?: string, currentBrick?: any): NormalizedSuggestion {
  const raw = payload && typeof payload === "object" ? payload : {};
  const scopeDocId = asString(raw.scope) === "document" ? asString(raw.scopeId) : undefined;
  const targetBrickId =
    asString(id)
    || asString(raw.id)
    || asString(raw.targetId)
    || asString(raw.brickId)
    || asString(raw.targetBrickId)
    || asString(raw.brick?.id)
    || asString(raw.payload?.brickId);
  const targetDocId =
    asString(raw.docId)
    || asString(raw.targetDocId)
    || asString(raw.documentId)
    || asString(raw.payload?.docId)
    || asString(raw.payload?.documentId)
    || scopeDocId
    || docId;
  const targetCardId = asString(raw.cardId) || asString(raw.targetCardId);

  const explicitKind = asString(raw.kind) || asString(raw.content?.kind) || asString(currentBrick?.kind);
  const contentCandidate = normalizeDocumentContent(raw);
  const inferredKind = explicitKind || inferBrickKind(contentCandidate);
  const documentContent = stripKindField(contentCandidate);

  const diff = normalizeDiff(raw);
  if ((!documentContent.markdown || typeof documentContent.markdown !== "string") && diff?.after) {
    documentContent.markdown = diff.after;
  }

  const tableContext = getCurrentTableContext(currentBrick, raw);
  const tableCellPatch = normalizeTableCellPatch(type, raw, tableContext.currentCell, tableContext.currentColumn);

  return {
    targetBrickId,
    targetDocId,
    targetCardId,
    contentKind: inferredKind,
    documentContent,
    cardPayload: toCardMutationPayload(inferredKind, documentContent),
    tableCellPatch,
    diff,
    currentBrick,
    currentTableCell: tableContext.currentCell,
    currentTableColumn: tableContext.currentColumn,
  };
}

function getCurrentTableContext(currentBrick: any, raw: any) {
  const brickContent = currentBrick?.content && typeof currentBrick.content === "object" ? currentBrick.content : currentBrick;
  const rows = Array.isArray(brickContent?.rows) ? brickContent.rows : [];
  const columns = Array.isArray(brickContent?.columns) ? brickContent.columns : [];
  const rowId = asString(raw?.rowId);
  const colId = asString(raw?.colId);
  const currentRow = rowId ? rows.find((row: any) => String(row?.id || "") === rowId) : undefined;
  const currentColumn = colId ? columns.find((column: any) => String(column?.id || "") === colId) : undefined;
  const currentCell = currentRow?.cells && colId ? currentRow.cells[colId] : undefined;

  return {
    currentRow,
    currentColumn,
    currentCell,
  };
}

function asString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeDocumentContent(raw: any): Record<string, any> {
  if (!raw || typeof raw !== "object") return {};

  const nested = raw.content;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    return { ...nested };
  }

  const clone = { ...raw };
  delete clone.id;
  delete clone.brickId;
  delete clone.docId;
  delete clone.cardId;
  delete clone.targetDocId;
  delete clone.targetCardId;
  delete clone.targetBrickId;
  delete clone.explanation;
  delete clone.payload;
  delete clone.diff;
  return clone;
}

function stripKindField(content: Record<string, any>): Record<string, any> {
  if (!content || typeof content !== "object") return {};
  const cleaned = { ...content };
  delete cleaned.kind;
  return cleaned;
}

function inferBrickKind(content: Record<string, any>): string {
  if (!content || typeof content !== "object") return "text";
  if (Array.isArray(content.rows)) return "table";
  if (Array.isArray(content.items) || Array.isArray(content.tasks)) return "checklist";
  if (typeof content.body === "string" && typeof content.title === "string") return "accordion";
  if (typeof content.markdown === "string" || typeof content.text === "string") return "text";
  return "text";
}

function normalizeDiff(raw: any): { before?: string; after?: string; strategy?: string } | undefined {
  if (!raw || typeof raw !== "object" || typeof raw.diff !== "object" || !raw.diff) return undefined;
  const diff = raw.diff as Record<string, unknown>;
  return {
    before: asString(diff.before),
    after: asString(diff.after),
    strategy: asString(diff.strategy),
  };
}

function normalizeTableCellPatch(type: SuggestionType, raw: any, currentCell?: any, currentColumn?: any) {
  if (!raw || typeof raw !== "object") return undefined;

  const kind = asString(raw.kind);
  if (type === "TABLE_CELL_UPDATE" || kind === "table_cell" || kind === "bountiful_table_cell") {
    if (kind === "bountiful_table_cell" || (asString(raw.rowId) && asString(raw.colId))) {
      const inferredCellType = asString(raw?.cell?.type) || asString(raw?.type) || asString(currentCell?.type) || inferCellTypeFromColumn(currentColumn?.type);
      const incomingCell = raw.cell && typeof raw.cell === "object"
        ? raw.cell
        : buildCellFromRawValue(raw, inferredCellType);
      const mergedCell = {
        ...(currentCell && typeof currentCell === "object" ? currentCell : {}),
        ...(incomingCell && typeof incomingCell === "object" ? incomingCell : {}),
      } as Record<string, any>;
      if (inferredCellType && !mergedCell.type) mergedCell.type = inferredCellType;

      return {
        kind: "bountiful_table_cell" as const,
        rowId: asString(raw.rowId),
        colId: asString(raw.colId),
        cell: mergedCell,
        rowMeta: raw.rowMeta,
      };
    }

    if (Number.isInteger(raw.rowIndex) && Number.isInteger(raw.colIndex)) {
      return {
        kind: "table_cell" as const,
        rowIndex: Number(raw.rowIndex),
        colIndex: Number(raw.colIndex),
        value: asString(raw.value) || "",
      };
    }
  }

  return undefined;
}

function inferCellTypeFromColumn(columnType?: string) {
  const normalized = String(columnType || "").trim().toLowerCase();
  if (!normalized) return "text";
  if (normalized === "number") return "number";
  if (normalized === "select" || normalized === "status") return "select";
  if (normalized === "multi_select") return "multi_select";
  if (normalized === "checkbox") return "checkbox";
  if (normalized === "date" || normalized === "created_time" || normalized === "last_edited_time") return "date";
  if (normalized === "people" || normalized === "created_by" || normalized === "last_edited_by") return "user";
  if (normalized === "document" || normalized === "relation") return "document";
  if (normalized === "board") return "board";
  if (normalized === "card") return "card";
  if (normalized === "url") return "url";
  return "text";
}

function buildCellFromRawValue(raw: any, cellType?: string) {
  const normalizedCellType = String(cellType || "text").trim().toLowerCase();
  const rawValue = raw?.value ?? raw?.text ?? raw?.name ?? "";

  if (normalizedCellType === "number") {
    const numberValue = typeof raw?.number === "number"
      ? raw.number
      : Number.parseFloat(String(rawValue).replace(/[^0-9.-]+/g, ""));
    return { type: "number", number: Number.isFinite(numberValue) ? numberValue : undefined, value: String(rawValue || "") };
  }
  if (normalizedCellType === "checkbox") {
    return { type: "checkbox", checked: typeof raw?.checked === "boolean" ? raw.checked : String(rawValue).trim().toLowerCase() === "true" };
  }
  if (normalizedCellType === "select") {
    return { type: "select", name: String(raw?.name || rawValue || "").trim(), color: String(raw?.color || "default") };
  }
  if (normalizedCellType === "multi_select") {
    const source = Array.isArray(raw?.items) ? raw.items : String(rawValue || "").split(",").map((entry) => entry.trim()).filter(Boolean);
    return { type: "multi_select", items: source.map((entry: any) => typeof entry === "string" ? { name: entry, color: "default" } : entry) };
  }
  if (normalizedCellType === "date") {
    return { type: "date", start: String(raw?.start || rawValue || "").trim(), end: asString(raw?.end) };
  }
  if (normalizedCellType === "url") {
    return { type: "url", url: String(raw?.url || rawValue || "").trim() };
  }
  return { type: normalizedCellType || "text", text: String(rawValue || "").trim(), value: String(rawValue || "").trim() };
}

function toCardMutationPayload(kind: string, content: Record<string, any>): any | null {
  if (kind === "table" && Array.isArray(content.rows)) {
    return { kind: "table", rows: content.rows };
  }
  if (kind === "checklist" && Array.isArray(content.items)) {
    return {
      kind: "checklist",
      items: content.items,
    };
  }
  if (kind === "accordion") {
    return {
      kind: "accordion",
      title: asString(content.title) || "",
      body: asString(content.body) || "",
      isExpanded: typeof content.isExpanded === "boolean" ? content.isExpanded : true,
    };
  }
  return {
    kind: "text",
    displayStyle: "paragraph",
    markdown: asString(content.markdown) || asString(content.text) || "",
  };
}

function SuggestionPayloadPreview({ normalized }: { normalized: NormalizedSuggestion }) {
  if (normalized.tableCellPatch) {
    const patch = normalized.tableCellPatch;
    const label = patch.kind === "table_cell"
      ? `Celda [fila ${Number(patch.rowIndex) + 1}, col ${Number(patch.colIndex) + 1}]`
      : `Celda [rowId ${patch.rowId || "?"}, colId ${patch.colId || "?"}]`;
    const previousValue = patch.kind === "table_cell"
      ? ""
      : stringifyCell(normalized.currentTableCell);
    const nextValue = patch.kind === "table_cell"
      ? patch.value || ""
      : stringifyCell(patch.cell || {});
    return (
      <div className="space-y-1">
        <div className="text-[11px] font-semibold text-foreground">{label}</div>
        {normalized.currentTableColumn ? (
          <div className="text-[10px] text-muted-foreground">
            Columna: <span className="font-semibold text-foreground">{String(normalized.currentTableColumn?.name || normalized.currentTableColumn?.label || normalized.currentTableColumn?.id || "-")}</span>
            {normalized.currentTableColumn?.type ? <span> · tipo {String(normalized.currentTableColumn.type)}</span> : null}
          </div>
        ) : null}
        <BrickDiff
          kind="text"
          oldContent={{ markdown: previousValue || "" }}
          newContent={{ markdown: nextValue || "" }}
        />
        <pre className="overflow-x-auto rounded-md border border-border/60 bg-black/30 p-2 text-[10px] text-foreground/80 whitespace-pre-wrap">{JSON.stringify(patch.cell || patch.value || {}, null, 2)}</pre>
      </div>
    );
  }

  if (normalized.contentKind === "table") {
    const rows = extractRows(normalized.documentContent);
    if (rows.length === 0) {
      return <pre className="overflow-x-auto text-[11px]">{JSON.stringify(normalized.documentContent, null, 2)}</pre>;
    }
    return <TablePreview rows={rows} />;
  }

  if (normalized.contentKind === "checklist") {
    const items = Array.isArray(normalized.documentContent.items) ? normalized.documentContent.items : [];
    return (
      <div className="space-y-1">
        {items.map((item: any, index: number) => (
          <div key={index} className="text-[12px] text-foreground/90">
            {item?.checked ? "[x]" : "[ ]"} {String(item?.label || item?.text || "").trim()}
          </div>
        ))}
      </div>
    );
  }

  if (normalized.contentKind === "text" && normalized.diff?.before && normalized.diff?.after) {
    return (
      <BrickDiff
        kind="text"
        oldContent={{ markdown: normalized.diff.before }}
        newContent={{ markdown: normalized.diff.after }}
      />
    );
  }

  if (normalized.contentKind === "accordion") {
    return (
      <BrickDiff
        kind="accordion"
        oldContent={{ title: "", body: "" }}
        newContent={{
          title: normalized.documentContent.title || "",
          body: normalized.documentContent.body || "",
        }}
      />
    );
  }

  const textValue = asString(normalized.documentContent.markdown)
    || asString(normalized.documentContent.text)
    || asString(normalized.documentContent.body)
    || JSON.stringify(normalized.documentContent, null, 2);

  return <pre className="overflow-x-auto text-[11px] whitespace-pre-wrap">{textValue}</pre>;
}

function extractRows(content: Record<string, any>): string[][] {
  const rows = Array.isArray(content.rows) ? content.rows : [];
  if (rows.length === 0) return [];

  if (Array.isArray(rows[0])) {
    return rows.map((row: any[]) => row.map((cell) => String(cell ?? "")));
  }

  const columns = Array.isArray(content.columns) ? content.columns : [];
  const orderedColumns = columns.length > 0
    ? columns.map((column: any, index: number) => ({
      id: String(column?.id ?? index),
      label: asString(column?.name) || asString(column?.label) || `col_${index + 1}`,
    }))
    : Object.keys((rows[0] && typeof rows[0] === "object" ? rows[0].cells || rows[0] : {}) || {}).map((key) => ({ id: key, label: key }));

  const tableRows: string[][] = [];
  tableRows.push(orderedColumns.map((col) => col.label));

  for (const row of rows) {
    const cells = (row && typeof row === "object" ? (row.cells || row) : {}) as Record<string, any>;
    tableRows.push(orderedColumns.map((col) => stringifyCell(cells[col.id])));
  }

  return tableRows;
}

function stringifyCell(value: any): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map((entry) => stringifyCell(entry)).join(", ");
  if (typeof value === "object") {
    return asString(value.text)
      || asString(value.markdown)
      || asString(value.value)
      || asString(value.name)
      || JSON.stringify(value);
  }
  return String(value);
}

function TablePreview({ rows }: { rows: string[][] }) {
  return (
    <div className="overflow-x-auto rounded-md border border-border/60">
      <table className="w-full border-collapse text-[11px]">
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="border-b border-border/50 last:border-b-0">
              {row.map((cell, cellIndex) => (
                <td
                  key={`${rowIndex}-${cellIndex}`}
                  className={`px-2 py-1.5 align-top ${rowIndex === 0 ? "bg-muted/40 font-semibold" : "bg-transparent"}`}
                >
                  {cell || "-"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
