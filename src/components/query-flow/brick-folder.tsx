"use client";

import { useEffect, useState } from "react";
import { CheckSquare, ChevronDown, ChevronRight, Code2, FileText, Image as ImageIcon, LayoutList, ListChecks, Table2, Type, type LucideIcon } from "lucide-react";

import { useTranslations } from "@/components/providers/i18n-provider";
import { runKqlQuery } from "@/lib/api/groups";
import type { SourceData } from "@/lib/query-flow/types";

interface BrickRow { id: string; kind: string; title: string; position: number }

const KIND_ICONS: Record<string, LucideIcon> = { text: Type, checklist: ListChecks, table: Table2, beautiful_table: Table2, bountiful_table: Table2, database: Table2, code: Code2, image: ImageIcon, media: ImageIcon, accordion: LayoutList, tabs: LayoutList, columns: LayoutList, callout: FileText, todo: CheckSquare };
const TABLE_KINDS = new Set(["table", "beautiful_table", "bountiful_table", "database"]);

export interface BrickFolderProps {
  /** Title of the document the bricks belong to. */
  document: string;
  teamId: string | null;
  accessToken: string | null;
  nonce: number;
  /** Start a query: the whole `bricks` of the document, the items of one checklist, or the rows of a table brick. */
  onUse: (source: SourceData, where?: { field: string; value: string }) => void;
}

/** The "Bricks" entry of a document: opens (the > chevron) into every block by name and type. Checklists give their own items. */
export function BrickFolder({ document, teamId, accessToken, nonce, onUse }: BrickFolderProps) {
  const t = useTranslations("query-flow");
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<BrickRow[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!open || !teamId || !accessToken) return;
    if (document.includes('"')) { setRows([]); setFailed(true); return; }
    let cancelled = false;
    setFailed(false);
    runKqlQuery(teamId, `bricks where document = "${document}" select position, kind, title, id order by position limit 500`, accessToken)
      .then((res) => {
        if (cancelled) return;
        const result = (res.outputs[res.outputs.length - 1] as unknown as { result: { columns: Array<{ key: string }>; rows: Array<{ cells: string[] }> } } | undefined)?.result;
        const idx = (k: string) => result?.columns.findIndex((c) => c.key === k) ?? -1;
        const [p, k, ti, i] = [idx("position"), idx("kind"), idx("title"), idx("id")];
        setRows((result?.rows ?? []).map((r) => ({ position: Number(r.cells[p]) || 0, kind: r.cells[k] ?? "", title: r.cells[ti] ?? "", id: r.cells[i] ?? "" })));
      })
      .catch(() => { if (!cancelled) { setRows([]); setFailed(true); } });
    return () => { cancelled = true; };
  }, [open, teamId, accessToken, document, nonce]);

  return (
    <div className="col-span-full rounded-lg border border-border bg-card">
      <div className="flex items-center gap-2 px-2.5 py-2">
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-label={open ? t("sources.bricksClose") : t("sources.bricksOpen")} className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground">
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        <button type="button" onClick={() => setOpen((v) => !v)} className="min-w-0 flex-1 text-left">
          <span className="block text-sm font-medium text-foreground">{t("sources.items.folderBricks.name")}</span>
          <span className="block text-[11px] leading-snug text-muted-foreground">{t("sources.items.folderBricks.about")}</span>
        </button>
        <button type="button" onClick={() => onUse({ kind: "bricks", name: "" }, { field: "document", value: document })} className="rounded-md border border-border px-2 py-1 text-[11px] text-foreground hover:bg-muted">{t("sources.bricksAll")}</button>
      </div>
      {open ? (
        <div className="border-t border-border px-2.5 py-1.5">
          {rows === null ? <p className="py-1 text-xs text-muted-foreground">{t("sources.bricksLoading")}</p> : null}
          {failed ? <p className="py-1 text-xs text-destructive">{t("sources.bricksFailed")}</p> : null}
          {rows && !failed && rows.length === 0 ? <p className="py-1 text-xs text-muted-foreground">{t("sources.bricksEmpty")}</p> : null}
          <ul className="divide-y divide-border">
            {(rows ?? []).map((b) => {
              const Icon = KIND_ICONS[b.kind] ?? FileText;
              const checklist = b.kind === "checklist";
              const usable = checklist && b.id;
              return (
                <li key={b.id || b.position} className="flex items-center gap-2 py-1">
                  <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-xs text-foreground">{b.title || t("sources.untitled")}</span>
                  <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{b.kind}</span>
                  {usable ? (
                    <button type="button" onClick={() => onUse({ kind: "items", name: "" }, { field: "brick", value: b.id })} className="shrink-0 rounded-md border border-border px-1.5 py-0.5 text-[11px] text-foreground hover:bg-muted">{t("sources.checklistItems")}</button>
                  ) : TABLE_KINDS.has(b.kind) ? (
                    <span className="shrink-0 text-[10px] text-muted-foreground">{t("sources.items.folderBricks.tableHint")}</span>
                  ) : (
                    <span className="w-0 shrink-0" title={t("sources.bricksNotUsable")} />
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
