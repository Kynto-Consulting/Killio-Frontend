"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FileSpreadsheet, Loader2, Sparkles, UploadCloud, X } from "lucide-react";

import { useSession } from "@/components/providers/session-provider";
import { useTranslations } from "@/components/providers/i18n-provider";
import { createBoard, createCardsBatch, createList, createTag, getTagsByScope, listTeamMembers, type BrickMutationInput } from "@/lib/api/contracts";
import { createDocument, createDocumentBrick } from "@/lib/api/documents";
import { applyImport, type ImportApi, type ImportReport } from "@/lib/import/apply-import";
import { analyzeTableFile, type ImportAnalysis, type ImportEntity, type ImportPlan, type ImportSheet, type MemberLike } from "@/lib/import/table-import";

type Role = "detail" | "ignore" | "title" | "description" | "list" | "checklist" | "assignee" | "dueDate" | "priority" | "tags" | "email";
const ROLES: Role[] = ["detail", "ignore", "title", "description", "list", "checklist", "assignee", "dueDate", "priority", "tags", "email"];
const SINGLE: Role[] = ["title", "list", "checklist", "assignee", "dueDate", "priority", "tags", "email"];
const ENTITIES: ImportEntity[] = ["cards", "boards", "documents", "people", "skip"];
const ACCEPT = ".csv,.tsv,.txt,.xlsx,.xlsm,.xls,.ods";

function rolesFromPlan(plan: ImportPlan, width: number): Role[] {
  const roles: Role[] = Array.from({ length: width }, () => "detail");
  plan.ignore.forEach((i) => { roles[i] = "ignore"; });
  plan.description.forEach((i) => { roles[i] = "description"; });
  for (const key of SINGLE) {
    const index = plan[key as keyof ImportPlan] as number | null;
    if (index !== null && index !== undefined) roles[index] = key;
  }
  return roles;
}

function planFromRoles(entity: ImportEntity, roles: Role[], source: ImportPlan["source"]): ImportPlan {
  const first = (role: Role) => { const i = roles.indexOf(role); return i >= 0 ? i : null; };
  const all = (role: Role) => roles.map((r, i) => (r === role ? i : -1)).filter((i) => i >= 0);
  return {
    entity, source,
    title: first("title"), list: first("list"), checklist: first("checklist"), assignee: first("assignee"),
    dueDate: first("dueDate"), priority: first("priority"), tags: first("tags"), email: first("email"),
    description: all("description"), ignore: all("ignore"),
  };
}

interface SheetState { sheet: ImportSheet; entity: ImportEntity; roles: Role[]; enabled: boolean; edited: boolean }

interface Props {
  teamId: string | null;
  defaultBoardId?: string;
  defaultLists?: Array<{ id: string; name: string }>;
  onClose: () => void;
  onDone?: () => void;
}

export function TableImportDialog({ teamId, defaultBoardId, defaultLists = [], onClose, onDone }: Props) {
  const t = useTranslations("common") as (key: string, params?: Record<string, string | number>) => string;
  const { accessToken } = useSession();
  const inputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<"pick" | "analyzing" | "review" | "applying" | "done">("pick");
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<ImportAnalysis | null>(null);
  const [sheets, setSheets] = useState<SheetState[]>([]);
  const [progress, setProgress] = useState({ message: "", done: 0, total: 1 });
  const [report, setReport] = useState<ImportReport | null>(null);
  const [dragActive, setDragActive] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && step !== "applying") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, step]);

  const handleFile = useCallback(async (file: File | undefined) => {
    if (!file || !accessToken || !teamId) return;
    setError(null);
    setStep("analyzing");
    try {
      const result = await analyzeTableFile(file, { scope: "team", scopeId: teamId }, accessToken);
      setAnalysis(result);
      setSheets(result.sheets.map((sheet) => ({
        sheet, entity: sheet.plan.entity, roles: rolesFromPlan(sheet.plan, sheet.headers.length), enabled: sheet.plan.entity !== "skip", edited: false,
      })));
      setStep("review");
    } catch (e: any) {
      setError(e?.message || t("aiPanel.import.error"));
      setStep("pick");
    }
  }, [accessToken, teamId, t]);

  const update = (index: number, patch: Partial<SheetState>) =>
    setSheets((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch, edited: true } : s)));

  const setRole = (sheetIndex: number, column: number, role: Role) =>
    setSheets((prev) => prev.map((s, i) => {
      if (i !== sheetIndex) return s;
      const roles = s.roles.map((r, c) => (SINGLE.includes(role) && c !== column && r === role ? "detail" : r));
      roles[column] = role;
      return { ...s, roles, edited: true };
    }));

  const run = async () => {
    if (!accessToken || !teamId) return;
    setStep("applying");
    setError(null);
    try {
      const [members, tags] = await Promise.all([
        listTeamMembers(teamId, accessToken) as Promise<MemberLike[]>,
        getTagsByScope("team", teamId, accessToken).catch(() => []),
      ]);
      const api: ImportApi = {
        createBoard: (p) => createBoard({ name: p.name, slug: p.slug, boardType: "kanban" }, teamId, accessToken),
        createList: (boardId, p) => createList(boardId, p, accessToken),
        createCardsBatch: (cards) => createCardsBatch(cards.map((c) => ({ ...c, blocks: c.blocks as BrickMutationInput[] | undefined })), accessToken),
        createDocument: (p) => createDocument({ teamId, title: p.title }, accessToken),
        createDocumentBrick: (documentId, p) => createDocumentBrick(documentId, p as any, accessToken),
        createTag: (p) => createTag({ scopeType: "team", scopeId: teamId, name: p.name, color: p.color, tagKind: p.tagKind }, accessToken),
      };
      const result = await applyImport(
        sheets.map((s) => ({ sheet: s.sheet, enabled: s.enabled, plan: planFromRoles(s.entity, s.roles, s.edited ? "heuristic" : s.sheet.plan.source) })),
        {
          members,
          existingTags: tags,
          defaultBoard: defaultBoardId ? { id: defaultBoardId, lists: defaultLists } : undefined,
        },
        api,
        (message, done, total) => setProgress({ message, done, total }),
      );
      setReport(result);
      setStep("done");
      onDone?.();
    } catch (e: any) {
      setError(e?.message || t("aiPanel.import.error"));
      setStep("review");
    }
  };

  const selectClass = "h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring";
  const enabledCount = sheets.filter((s) => s.enabled && s.entity !== "skip").length;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget && step !== "applying") onClose(); }}>
      <div className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-border bg-card text-foreground shadow-2xl" role="dialog" aria-modal="true" aria-label={t("aiPanel.import.title")}>
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <h2 className="flex items-center gap-2 text-base font-bold"><FileSpreadsheet className="h-4 w-4 text-accent" />{t("aiPanel.import.title")}</h2>
            <p className="mt-1 text-xs text-muted-foreground">{t("aiPanel.import.subtitle")}</p>
          </div>
          <button type="button" onClick={onClose} disabled={step === "applying"} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted disabled:opacity-40" aria-label={t("aiPanel.import.close")}><X className="h-4 w-4" /></button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {error && <div className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-300">{error}</div>}
          {!teamId && <p className="text-sm text-muted-foreground">{t("aiPanel.import.needsTeam")}</p>}

          {teamId && step === "pick" && (
            <div
              onDragEnter={(e) => { e.preventDefault(); setDragActive(true); }}
              onDragOver={(e) => e.preventDefault()}
              onDragLeave={() => setDragActive(false)}
              onDrop={(e) => { e.preventDefault(); setDragActive(false); void handleFile(e.dataTransfer.files?.[0]); }}
              className={`flex flex-col items-center gap-3 rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors ${dragActive ? "border-accent bg-accent/5" : "border-border"}`}
            >
              <UploadCloud className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm font-medium">{t("aiPanel.import.pick")}</p>
              <p className="text-xs text-muted-foreground">CSV • TSV • XLSX • XLS • ODS · {t("aiPanel.import.limit")}</p>
              <button type="button" onClick={() => inputRef.current?.click()} className="mt-1 inline-flex h-9 items-center rounded-lg bg-accent px-4 text-sm font-medium text-accent-foreground hover:bg-accent/90">{t("aiPanel.import.choose")}</button>
              <input ref={inputRef} type="file" accept={ACCEPT} className="hidden" onChange={(e) => { void handleFile(e.target.files?.[0]); e.target.value = ""; }} />
            </div>
          )}

          {step === "analyzing" && (
            <div className="flex flex-col items-center gap-3 py-14 text-sm text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin" />{t("aiPanel.import.analyzing")}</div>
          )}

          {step === "review" && analysis && (
            <div className="space-y-4">
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5" />{analysis.aiUsed ? t("aiPanel.import.aiUsed") : t("aiPanel.import.autoUsed")}
              </p>
              {sheets.map((s, si) => (
                <section key={si} className={`rounded-xl border border-border ${s.enabled ? "" : "opacity-60"}`}>
                  <header className="flex flex-wrap items-center gap-3 border-b border-border px-3 py-2.5">
                    <label className="flex items-center gap-2 text-sm font-semibold">
                      <input type="checkbox" checked={s.enabled} onChange={(e) => update(si, { enabled: e.target.checked })} />
                      {s.sheet.name}
                    </label>
                    <span className="text-xs text-muted-foreground">
                      {t("aiPanel.import.rows", { count: s.sheet.totalRows })}{s.sheet.truncated ? ` · ${t("aiPanel.import.truncated")}` : ""}
                    </span>
                    <select className={`${selectClass} ml-auto`} value={s.entity} onChange={(e) => update(si, { entity: e.target.value as ImportEntity })} aria-label={t("aiPanel.import.entity")}>
                      {ENTITIES.map((en) => <option key={en} value={en}>{t(`aiPanel.import.entities.${en}`)}</option>)}
                    </select>
                  </header>
                  {s.enabled && s.entity !== "skip" && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="text-muted-foreground">
                          <tr><th className="px-3 py-1.5 font-medium">{t("aiPanel.import.column")}</th><th className="px-3 py-1.5 font-medium">{t("aiPanel.import.example")}</th><th className="px-3 py-1.5 font-medium">{t("aiPanel.import.role")}</th></tr>
                        </thead>
                        <tbody>
                          {s.sheet.headers.map((h, ci) => (
                            <tr key={ci} className="border-t border-border/60">
                              <td className="px-3 py-1.5 font-medium">{h}</td>
                              <td className="max-w-[16rem] truncate px-3 py-1.5 text-muted-foreground">{s.sheet.rows.slice(0, 3).map((r) => r[ci]).filter(Boolean).join(" · ")}</td>
                              <td className="px-3 py-1.5">
                                <select className={selectClass} value={s.roles[ci]} onChange={(e) => setRole(si, ci, e.target.value as Role)}>
                                  {ROLES.map((r) => <option key={r} value={r}>{t(`aiPanel.import.roles.${r}`)}</option>)}
                                </select>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              ))}
            </div>
          )}

          {step === "applying" && (
            <div className="space-y-3 py-10">
              <div className="flex justify-between text-xs font-medium text-muted-foreground"><span className="flex items-center"><Loader2 className="mr-1.5 h-3 w-3 animate-spin" />{progress.message || t("aiPanel.import.applying")}</span><span>{Math.round((progress.done / Math.max(1, progress.total)) * 100)}%</span></div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-secondary"><div className="h-full bg-accent transition-all duration-200" style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }} /></div>
            </div>
          )}

          {step === "done" && report && (
            <div className="space-y-3 text-sm">
              <p className="font-semibold">{t("aiPanel.import.done")}</p>
              <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                {report.boards > 0 && <li>{t("aiPanel.import.summary.boards", { count: report.boards })}</li>}
                {report.lists > 0 && <li>{t("aiPanel.import.summary.lists", { count: report.lists })}</li>}
                {report.cards > 0 && <li>{t("aiPanel.import.summary.cards", { count: report.cards })}</li>}
                {report.documents > 0 && <li>{t("aiPanel.import.summary.documents", { count: report.documents })}</li>}
                {report.tags > 0 && <li>{t("aiPanel.import.summary.tags", { count: report.tags })}</li>}
              </ul>
              {(report.unmatchedAssignees.length > 0 || report.badDates > 0 || report.skippedRows > 0 || report.peopleMissing.length > 0 || report.peopleInTeam.length > 0) && (
                <div className="space-y-1.5 rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                  {report.unmatchedAssignees.length > 0 && <p>{t("aiPanel.import.notes.unmatched", { names: report.unmatchedAssignees.slice(0, 8).join(", ") })}</p>}
                  {report.badDates > 0 && <p>{t("aiPanel.import.notes.badDates", { count: report.badDates })}</p>}
                  {report.skippedRows > 0 && <p>{t("aiPanel.import.notes.skipped", { count: report.skippedRows })}</p>}
                  {report.peopleInTeam.length > 0 && <p>{t("aiPanel.import.notes.peopleIn", { count: report.peopleInTeam.length })}</p>}
                  {report.peopleMissing.length > 0 && <p>{t("aiPanel.import.notes.peopleMissing", { names: report.peopleMissing.slice(0, 8).join(", ") })}</p>}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          {step === "review" && <button type="button" onClick={() => { setStep("pick"); setAnalysis(null); }} className="h-9 rounded-lg border border-border px-4 text-sm hover:bg-muted">{t("aiPanel.import.back")}</button>}
          {step === "review" && <button type="button" onClick={run} disabled={enabledCount === 0} className="h-9 rounded-lg bg-accent px-4 text-sm font-medium text-accent-foreground hover:bg-accent/90 disabled:opacity-50">{t("aiPanel.import.run", { count: enabledCount })}</button>}
          {step === "done" && <button type="button" onClick={onClose} className="h-9 rounded-lg bg-accent px-4 text-sm font-medium text-accent-foreground hover:bg-accent/90">{t("aiPanel.import.close")}</button>}
        </div>
      </div>
    </div>
  );
}
