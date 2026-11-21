"use client";

import { useId, useState } from "react";
import { Settings2 } from "lucide-react";

import { useTranslations } from "@/components/providers/i18n-provider";
import { FileReadOptionsDialog } from "@/components/query-files";
import type { QueryFile, QueryTable } from "@/lib/api/query-files";
import { tableOptions, type TableOrigin, type TableRef } from "@/lib/query-flow/table-names";
import type { KqlTable } from "@/lib/query/kql";
import { SOURCE_KINDS } from "@/lib/query-flow/types";
import type { FlowQuery, SourceData, SourceKind } from "@/lib/query-flow/types";
import { FieldLabel, IconButton, SelectInput, TextInput } from "./fields";

/** The file a `rows of "<name>"` name points to (by file name or by its `file:<id>`), if any. */
export function findFile(files: QueryFile[], name: string): QueryFile | null {
  const wanted = name.trim().toLowerCase();
  if (!wanted) return null;
  const plain = files.find((f) => f.id === name.trim() || f.name.toLowerCase() === wanted);
  if (plain) return plain;
  // `doc:Informe / ventas.csv` / `card:Tarea / ventas.csv`: the file of that document / card
  const qualified = /^(doc|card):(.*) \/ (.+)$/i.exec(name.trim());
  if (!qualified) return null;
  const where = qualified[1].toLowerCase() === 'card' ? 'card' : 'document';
  return files.find((f) => f.where === where && (f.refTitle ?? '').toLowerCase() === qualified[2].trim().toLowerCase() && f.name.toLowerCase() === qualified[3].trim().toLowerCase()) ?? null;
}

export function SourceFields({
  value,
  onChange,
  tables,
  files,
  queryTables,
  origins,
  queries,
  currentQueryId,
  teamId,
}: {
  value: SourceData;
  onChange: (next: SourceData) => void;
  tables: KqlTable[];
  files: QueryFile[];
  /** Every table the team can read (shared, document, card, file); when given it feeds the picker. */
  queryTables?: QueryTable[];
  /** Only these kinds of table in the picker. */
  origins?: TableOrigin[];
  queries: FlowQuery[];
  currentQueryId?: string;
  teamId: string | null;
}) {
  const t = useTranslations("query-flow");
  const listId = useId();
  const [optionsOpen, setOptionsOpen] = useState(false);
  const file = value.kind === "rows" ? findFile(files, value.name) : null;
  const otherQueries = queries.filter((q) => q.id !== currentQueryId);

  return (
    <div className="space-y-2">
      <div>
        <FieldLabel>{t("source.kind")}</FieldLabel>
        <SelectInput
          ariaLabel={t("source.kind")}
          value={value.kind}
          onChange={(kind) => onChange({ kind: kind as SourceKind, name: kind === value.kind ? value.name : "" })}
          options={SOURCE_KINDS.map((k) => ({ value: k, label: t(`source.kinds.${k}`) }))}
        />
      </div>

      {value.kind === "rows" ? (
        <div>
          <FieldLabel>{t("source.table")}</FieldLabel>
          <div className="flex items-center gap-1">
            <input
              type="text"
              list={listId}
              value={value.name}
              placeholder={t("source.tablePlaceholder")}
              aria-label={t("source.table")}
              spellCheck={false}
              autoComplete="off"
              onChange={(e) => onChange({ kind: "rows", name: e.target.value })}
              className="h-8 w-full min-w-0 rounded-md border border-border bg-background px-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
            {file ? (
              <IconButton
                label={t("source.readOptions")}
                disabled={!teamId}
                title={teamId ? t("source.readOptions") : t("source.readOptionsNoTeam")}
                onClick={() => setOptionsOpen(true)}
                className="border-border"
              >
                <Settings2 className="h-4 w-4" />
              </IconButton>
            ) : null}
          </div>
          <datalist id={listId}>
            {queryTables && queryTables.length > 0
              ? tableOptions(
                  queryTables.filter((q) => !origins || origins.includes(q.origin)).map((q): TableRef => ({ id: q.id, name: q.name, origin: q.origin, refTitle: q.refTitle })),
                  Object.fromEntries(files.map((f) => [f.id, f.where])),
                ).map((o) => <option key={`${o.origin}:${o.id}`} value={o.value} label={`${t(`source.origins.${o.origin}`)} · ${o.label}`} />)
              : (
                <>
                  {tables.map((tb) => (
                    <option key={`t:${tb.id}`} value={tb.title} label={t("source.documentTable")} />
                  ))}
                  {files.map((f) => (
                    <option key={`f:${f.id}`} value={f.name} label={t("source.file")} />
                  ))}
                </>
              )}
          </datalist>
          <p className="mt-1 text-[10px] text-muted-foreground">
            {file ? t("source.fileHint", { kind: file.kind.toUpperCase() }) : t("source.tableHint")}
          </p>
          {file && teamId ? (
            <FileReadOptionsDialog open={optionsOpen} teamId={teamId} fileId={file.id} fileName={file.name} canEdit onClose={() => setOptionsOpen(false)} />
          ) : null}
        </div>
      ) : null}

      {value.kind === "name" ? (
        <div>
          <FieldLabel>{t("source.name")}</FieldLabel>
          <TextInput value={value.name} placeholder={t("source.namePlaceholder")} onChange={(e) => onChange({ kind: "name", name: e.target.value })} aria-label={t("source.name")} />
        </div>
      ) : null}

      {value.kind === "query" ? (
        <div>
          <FieldLabel>{t("source.query")}</FieldLabel>
          <SelectInput
            ariaLabel={t("source.query")}
            value={value.name}
            onChange={(name) => onChange({ kind: "query", name })}
            options={[{ value: "", label: t("source.chooseQuery") }, ...otherQueries.map((q) => ({ value: q.id, label: q.name }))]}
          />
        </div>
      ) : null}
    </div>
  );
}
