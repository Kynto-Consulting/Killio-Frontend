"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n, useTranslations } from "@/components/providers/i18n-provider";
import {
  SharedKillioTable,
  SharedKillioTableRow,
  createSharedTable,
  getSharedTableRows,
  listSharedTables,
} from "@/lib/api/scripts";
import { Loader2, Plus, RefreshCw } from "lucide-react";

interface KillioTableProps {
  teamId: string;
  accessToken: string;
}

function parseColumns(raw: string): Array<{ key: string; label: string; type?: string }> {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [keyPart, labelPart, typePart] = line.split(":").map((part) => part.trim());
      return {
        key: keyPart,
        label: labelPart || keyPart,
        type: typePart || "text",
      };
    })
    .filter((column) => column.key.length > 0);
}

function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) return "-";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return "[object]";
  }
}

export function KillioTable({ teamId, accessToken }: KillioTableProps) {
  const { locale } = useI18n();
  const t = useTranslations("integrations");

  const [tables, setTables] = useState<SharedKillioTable[]>([]);
  const [selectedTableId, setSelectedTableId] = useState("");
  const [rows, setRows] = useState<SharedKillioTableRow[]>([]);

  const [loadingTables, setLoadingTables] = useState(false);
  const [loadingRows, setLoadingRows] = useState(false);

  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [createColumns, setCreateColumns] = useState("externalKey:External Key:text\nstatus:Status:text");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedTable = useMemo(
    () => tables.find((table) => table.id === selectedTableId) ?? null,
    [tables, selectedTableId],
  );

  const loadTables = useCallback(async () => {
    setLoadingTables(true);
    setError(null);
    try {
      const data = await listSharedTables(teamId, accessToken);
      setTables(data);
      if (!selectedTableId && data[0]?.id) {
        setSelectedTableId(data[0].id);
      }
      if (selectedTableId && !data.some((table) => table.id === selectedTableId)) {
        setSelectedTableId(data[0]?.id ?? "");
      }
    } catch {
      setError(t("table.shared.loadError"));
    } finally {
      setLoadingTables(false);
    }
  }, [teamId, accessToken, selectedTableId, t]);

  const loadRows = useCallback(async (tableId: string) => {
    if (!tableId) {
      setRows([]);
      return;
    }

    setLoadingRows(true);
    setError(null);
    try {
      const data = await getSharedTableRows(tableId, teamId, accessToken);
      setRows(data);
    } catch {
      setRows([]);
      setError(t("table.shared.loadRowsError"));
    } finally {
      setLoadingRows(false);
    }
  }, [teamId, accessToken, t]);

  useEffect(() => {
    loadTables();
  }, [loadTables]);

  useEffect(() => {
    if (selectedTableId) {
      loadRows(selectedTableId);
    }
  }, [selectedTableId, loadRows]);

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!createName.trim()) return;

    setCreating(true);
    setError(null);
    try {
      const created = await createSharedTable(
        {
          teamId,
          name: createName.trim(),
          description: createDescription.trim() || undefined,
          columns: parseColumns(createColumns),
        },
        accessToken,
      );

      setShowCreate(false);
      setCreateName("");
      setCreateDescription("");
      setCreateColumns("externalKey:External Key:text\nstatus:Status:text");

      const nextTables = [created, ...tables];
      setTables(nextTables);
      setSelectedTableId(created.id);
      setRows([]);
    } catch {
      setError(t("table.shared.createError"));
    } finally {
      setCreating(false);
    }
  };

  const dateLocale = locale === "es" ? "es-ES" : "en-US";

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-card/60 px-3 py-3 sm:px-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground">{t("table.title")}</span>
          <select
            value={selectedTableId}
            onChange={(e) => setSelectedTableId(e.target.value)}
            className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
            disabled={loadingTables || tables.length === 0}
          >
            {tables.length === 0 ? (
              <option value="">{t("table.shared.noTables")}</option>
            ) : (
              tables.map((table) => (
                <option key={table.id} value={table.id}>
                  {table.name}
                </option>
              ))
            )}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadTables}
            disabled={loadingTables}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-accent/10 disabled:opacity-50"
          >
            {loadingTables ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            {t("actions.refresh")}
          </button>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
          >
            <Plus className="h-3.5 w-3.5" />
            {t("table.shared.create")}
          </button>
        </div>
      </div>

      {error && (
        <div className="border-b border-border bg-destructive/10 px-3 py-2 text-xs text-destructive sm:px-4">
          {error}
        </div>
      )}

      <div className="flex-1 overflow-auto">
        {!selectedTable ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
            <p className="text-sm font-medium text-foreground">{t("table.shared.emptyTablesTitle")}</p>
            <p className="text-xs text-muted-foreground">{t("table.shared.emptyTablesDescription")}</p>
          </div>
        ) : loadingRows ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : rows.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
            <p className="text-sm font-medium text-foreground">{t("table.empty")}</p>
            <p className="text-xs text-muted-foreground">{t("table.shared.emptyRowsDescription")}</p>
          </div>
        ) : (
          <table className="min-w-full divide-y divide-border text-xs">
            <thead className="sticky top-0 bg-muted/50">
              <tr>
                <th className="px-4 py-2 text-left font-semibold text-muted-foreground">{t("table.shared.columns.externalKey")}</th>
                {selectedTable.columns.map((column) => (
                  <th key={column.key} className="px-4 py-2 text-left font-semibold text-muted-foreground">
                    {column.label}
                  </th>
                ))}
                <th className="px-4 py-2 text-left font-semibold text-muted-foreground">{t("table.columns.updatedAt")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-accent/10">
                  <td className="max-w-[220px] truncate px-4 py-2 font-mono text-foreground">{row.externalKey}</td>
                  {selectedTable.columns.map((column) => (
                    <td key={`${row.id}-${column.key}`} className="max-w-[280px] truncate px-4 py-2 text-muted-foreground">
                      {formatCellValue(row.data?.[column.key])}
                    </td>
                  ))}
                  <td className="px-4 py-2 text-muted-foreground">
                    {new Date(row.updatedAt).toLocaleDateString(dateLocale)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-xl border border-border bg-card p-6 shadow-xl">
            <h2 className="mb-4 text-base font-semibold text-foreground">{t("table.shared.createTitle")}</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">{t("scripts.name")}</label>
                <input
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder={t("table.shared.namePlaceholder")}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">{t("scripts.description")}</label>
                <textarea
                  value={createDescription}
                  onChange={(e) => setCreateDescription(e.target.value)}
                  placeholder={t("table.shared.descriptionPlaceholder")}
                  rows={2}
                  className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">{t("table.shared.columnsLabel")}</label>
                <textarea
                  value={createColumns}
                  onChange={(e) => setCreateColumns(e.target.value)}
                  rows={4}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <p className="mt-1 text-[11px] text-muted-foreground">{t("table.shared.columnsHelp")}</p>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="rounded-lg px-4 py-2 text-sm text-muted-foreground hover:bg-accent/10"
                >
                  {t("actions.cancel")}
                </button>
                <button
                  type="submit"
                  disabled={creating || !createName.trim()}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  {creating && <Loader2 className="h-4 w-4 animate-spin" />}
                  {creating ? t("scripts.creating") : t("table.shared.create")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
