"use client";

/**
 * ToolCallChip — Claude-style compact tool-call display.
 *
 * Single line: [status icon] [action label]  [chevron]
 * Expand click shows human-readable key-value input and output summary.
 * Batch variant wraps multiple chips under a single toggle header.
 */

import { useState, useCallback } from "react";
import {
  CheckCircle2, XCircle, Loader2, ShieldAlert, ChevronDown,
  PlusCircle, ArrowRight, Edit2, Trash2, FileText, LayoutDashboard,
  Grid3X3, Play, Search, List, Code, Globe, Wrench, Terminal,
  Check, X, Zap, FolderOpen, GitBranch, Tag, Layers, Database,
  ScanSearch,
} from "lucide-react";

export type TFn = (key: string, params?: Record<string, string | number>) => string;

// ─── Action label ─────────────────────────────────────────────────────────────

function trunc(s: unknown, max = 30): string {
  if (typeof s !== "string" || !s) return "";
  return s.length > max ? s.slice(0, max) + "…" : s;
}

/** Returns a human-readable one-liner for a tool call. */
export function getToolActionLabel(
  t: TFn,
  toolName: string,
  input?: Record<string, unknown>,
): string {
  const n = toolName.toLowerCase();
  const title  = trunc(input?.title  ?? input?.name ?? input?.cardTitle);
  const query  = trunc(input?.query  ?? input?.q ?? input?.search);
  const file   = trunc(input?.path   ?? input?.filePath ?? input?.file);
  const list   = trunc(input?.listName ?? input?.toList ?? input?.listId);
  const names  = Array.isArray(input?.tool_names) ? (input.tool_names as string[]).join(", ") : "";

  // ── Git (specific) ─────────────────────────────────────────────────────────
  if (n.includes("git_")) {
    const branch  = trunc(input?.branch ?? input?.branchName ?? input?.ref ?? input?.from_branch);
    const msg     = trunc(input?.message ?? input?.commit_message ?? input?.commitMessage, 40);
    const remote  = trunc(input?.remote ?? input?.url ?? input?.repo, 35);
    if (n.includes("git_commit"))
      return msg ? `git commit: "${msg}"` : t("agent.toolAction.gitCommand");
    if (n.includes("git_push"))
      return branch ? `git push → ${branch}` : t("agent.toolAction.gitCommand");
    if (n.includes("git_pull"))
      return branch ? `git pull ← ${branch}` : t("agent.toolAction.gitCommand");
    if (n.includes("git_checkout") || n.includes("git_switch"))
      return branch ? `git checkout ${branch}` : t("agent.toolAction.gitCommand");
    if (n.includes("git_branch") && (n.includes("create") || n.includes("new")))
      return branch ? `git branch ${branch}` : t("agent.toolAction.gitCommand");
    if (n.includes("git_merge"))
      return branch ? `git merge ${branch}` : t("agent.toolAction.gitCommand");
    if (n.includes("git_rebase"))
      return branch ? `git rebase ${branch}` : t("agent.toolAction.gitCommand");
    if (n.includes("git_clone"))
      return remote ? `git clone ${remote}` : t("agent.toolAction.gitCommand");
    if (n.includes("git_add"))
      return file ? `git add ${file}` : "git add";
    if (n.includes("git_diff"))
      return file ? `git diff ${file}` : "git diff";
    if (n.includes("git_log"))
      return "git log";
    if (n.includes("git_status"))
      return "git status";
    if (n.includes("git_stash"))
      return "git stash";
    if (n.includes("git_tag"))
      return trunc(input?.tag ?? input?.tagName) ? `git tag ${trunc(input?.tag ?? input?.tagName)}` : "git tag";
    return t("agent.toolAction.gitCommand");
  }

  // ── OS / Shell (specific) ─────────────────────────────────────────────────
  if (n.includes("os_shell") || n.includes("shell_exec") || n.includes("run_command") || n.includes("execute_command") || n.includes("os_run")) {
    const cmd = trunc(
      input?.command ?? input?.cmd ?? input?.shell ?? input?.script ?? input?.args,
      50
    );
    return cmd ? `$ ${cmd}` : t("agent.toolAction.systemCommand");
  }

  // ── Files (specific) ──────────────────────────────────────────────────────
  if (n.includes("read_file")  || n.includes("os_read"))
    return t("agent.toolAction.fileRead", { file: file || "" });
  if (n.includes("write_file") || n.includes("os_write"))
    return t("agent.toolAction.fileWritten", { file: file || "" });
  if (n.includes("list_dir")   || n.includes("os_list"))
    return t("agent.toolAction.dirListed", { file: file || "" });
  if (n.includes("os_"))
    return t("agent.toolAction.systemCommand");

  // ── Cards ──────────────────────────────────────────────────────────────────
  if (n.includes("card_create") || n.includes("create_card"))
    return t("agent.toolAction.cardCreated", { title: title || "" });
  if (n.includes("card_move")   || n.includes("move_card"))
    return t("agent.toolAction.cardMoved", { list: list || "" });
  if (n.includes("card_update") || n.includes("update_card"))
    return t("agent.toolAction.cardUpdated", { title: title || "" });
  if (n.includes("card_delete") || n.includes("delete_card"))
    return t("agent.toolAction.cardDeleted");
  if ((n.includes("card_get") || n.includes("get_card")) && !n.includes("list"))
    return t("agent.toolAction.cardRead");
  if (n.includes("card_get_bricks") || n.includes("card_bricks"))
    return t("agent.toolAction.cardBricksRead");
  if (n.includes("card"))
    return t("agent.toolAction.card");

  // ── Boards ─────────────────────────────────────────────────────────────────
  if (n.includes("board_create") || n.includes("create_board"))
    return t("agent.toolAction.boardCreated", { name: title || "" });
  if (n.includes("board_list"))
    return t("agent.toolAction.boardListed");
  if (n.includes("board_get")   || n.includes("get_board"))
    return t("agent.toolAction.boardRead");
  if (n.includes("board"))
    return t("agent.toolAction.board");

  // ── Lists ──────────────────────────────────────────────────────────────────
  if (n.includes("list_create") || n.includes("create_list"))
    return t("agent.toolAction.listCreated", { name: title || "" });
  if (n.includes("list_update") || n.includes("update_list"))
    return t("agent.toolAction.listUpdated");
  if (n.includes("list_delete") || n.includes("delete_list"))
    return t("agent.toolAction.listDeleted");

  // ── Documents ──────────────────────────────────────────────────────────────
  if (n.includes("document_create") || n.includes("create_document"))
    return t("agent.toolAction.documentCreated", { title: title || "" });
  if (n.includes("document_get_bricks"))
    return t("agent.toolAction.documentBricksRead");
  if (n.includes("document_list"))
    return t("agent.toolAction.documentListed");
  if (n.includes("document_get")  || n.includes("get_document"))
    return t("agent.toolAction.documentRead");
  if (n.includes("document_update"))
    return t("agent.toolAction.documentUpdated", { title: title || "" });
  if (n.includes("document"))
    return t("agent.toolAction.document");

  // ── Mesh / Canvas ──────────────────────────────────────────────────────────
  if (n.includes("create_brick")   || n.includes("mesh_create_brick"))
    return t("agent.toolAction.brickCreated");
  if (n.includes("update_brick")   || n.includes("mesh_update_brick"))
    return t("agent.toolAction.brickUpdated");
  if (n.includes("move_brick")     || n.includes("mesh_move_brick"))
    return t("agent.toolAction.brickMoved");
  if (n.includes("delete_brick")   || n.includes("mesh_delete_brick"))
    return t("agent.toolAction.brickDeleted");
  if (n.includes("mesh_get_state") || n.includes("get_mesh"))
    return t("agent.toolAction.meshRead");
  if (n.includes("mesh_list"))
    return t("agent.toolAction.meshListed");
  if (n.includes("mesh"))
    return t("agent.toolAction.mesh");

  // ── Scripts ────────────────────────────────────────────────────────────────
  if (n.includes("script_create"))
    return t("agent.toolAction.scriptCreated", { name: title || "" });
  if (n.includes("script_run") || n.includes("run_script") || n.includes("execute_script"))
    return t("agent.toolAction.scriptExecuted", { name: title || "" });
  if (n.includes("script_add_node") || n.includes("add_node"))
    return t("agent.toolAction.nodeAdded");
  if (n.includes("script_connect"))
    return t("agent.toolAction.nodesConnected");
  if (n.includes("script_get") || n.includes("get_script"))
    return t("agent.toolAction.scriptRead");
  if (n.includes("script_list"))
    return t("agent.toolAction.scriptListed");
  if (n.includes("script"))
    return t("agent.toolAction.script");

  // ── Search ─────────────────────────────────────────────────────────────────
  if (n.includes("search_workspace") || n.includes("workspace_search"))
    return t("agent.toolAction.searched", { query: query || "" });
  if (n.includes("web_search")       || n.includes("search_web"))
    return t("agent.toolAction.webSearched", { query: query || "" });
  if (n.includes("tool_search"))
    return t("agent.toolAction.toolSearched", { query: query || "" });
  if (n.includes("search"))
    return t("agent.toolAction.searched", { query: query || "" });

  // ── Tool meta ──────────────────────────────────────────────────────────────
  if (n.includes("tool_load"))
    return t("agent.toolAction.toolLoaded", { names: trunc(names, 40) || "" });

  // ── Tags ───────────────────────────────────────────────────────────────────
  if (n.includes("tag_attach") || n.includes("card_tag"))
    return t("agent.toolAction.tagAttached", { title: title || "" });
  if (n.includes("tag_create"))
    return t("agent.toolAction.tagCreated", { title: title || "" });
  if (n.includes("tag"))
    return t("agent.toolAction.tag");

  // ── Integrations (specific per platform) ──────────────────────────────────
  if (n.includes("github") || n.includes("gh_"))
    return `GitHub: ${toolName.replace(/_/g, " ").split(" ").slice(1).join(" ") || "action"}`;
  if (n.includes("gitlab"))
    return `GitLab: ${toolName.replace(/_/g, " ").split(" ").slice(1).join(" ") || "action"}`;
  if (n.includes("jira"))
    return `Jira: ${title || toolName.replace(/_/g, " ")}`;
  if (n.includes("notion"))
    return `Notion: ${title || toolName.replace(/_/g, " ")}`;
  if (n.includes("slack"))
    return `Slack: ${title || toolName.replace(/_/g, " ")}`;
  if (n.includes("linear"))
    return `Linear: ${title || toolName.replace(/_/g, " ")}`;
  if (n.includes("trello"))
    return `Trello: ${title || toolName.replace(/_/g, " ")}`;
  if (n.includes("asana"))
    return `Asana: ${title || toolName.replace(/_/g, " ")}`;
  if (n.includes("integration"))
    return t("agent.toolAction.integration");

  // ── Data / Math ────────────────────────────────────────────────────────────
  if (n.includes("data_manipulate") || n.includes("math"))
    return t("agent.toolAction.computed");
  if (n.includes("chat_read_attachment"))
    return t("agent.toolAction.attachmentRead");

  // Fallback: humanise the snake_case name
  return toolName.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

// ─── Formatted key-value renderer ────────────────────────────────────────────

/** Keys that are internal IDs — skip them in human-readable display. */
const SKIP_KEYS = new Set([
  "teamId", "boardId", "listId", "cardId", "documentId", "meshId", "scriptId",
  "userId", "id", "assigneeId", "tagId", "brickId", "nodeId", "connectionId",
]);

function humanizeKey(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/_/g, " ")
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim();
}

function formatScalar(value: unknown, maxLen = 80): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean")  return value ? "✓" : "✗";
  if (typeof value === "number")   return String(value);
  if (typeof value === "string") {
    const s = value.trim();
    return s.length > maxLen ? s.slice(0, maxLen) + "…" : (s || "—");
  }
  return String(value);
}

function InputKV({ input }: { input: Record<string, unknown> }) {
  const entries = Object.entries(input).filter(([k, v]) => {
    if (SKIP_KEYS.has(k)) return false;
    if (v === null || v === undefined) return false;
    if (typeof v === "object" && !Array.isArray(v) && Object.keys(v as object).length === 0) return false;
    return true;
  });

  if (entries.length === 0) return null;

  return (
    <div className="flex flex-col gap-0.5">
      {entries.map(([key, val]) => (
        <div key={key} className="flex gap-2 min-w-0">
          <span className="text-neutral-400 dark:text-neutral-500 shrink-0 min-w-[80px] text-right font-sans text-[10px] leading-[1.6] capitalize">
            {humanizeKey(key)}
          </span>
          <span className="text-neutral-700 dark:text-neutral-200 break-all font-mono text-[10px] leading-[1.6]">
            {Array.isArray(val)
              ? (val as unknown[]).map(v => formatScalar(v)).join(", ") || "—"
              : typeof val === "object" && val !== null
              ? <span className="italic text-neutral-400">…</span>
              : formatScalar(val)}
          </span>
        </div>
      ))}
    </div>
  );
}

function OutputSummary({ output, isError }: { output: unknown; isError: boolean }) {
  if (output === null || output === undefined) return null;

  // Plain string — show as-is
  if (typeof output === "string") {
    const s = output.trim();
    if (!s) return null;
    return (
      <p className={`font-mono text-[10px] leading-relaxed break-all ${isError ? "text-red-300" : "text-neutral-600 dark:text-neutral-300"}`}>
        {s.length > 400 ? s.slice(0, 400) + "…" : s}
      </p>
    );
  }

  // Array — show count + brief preview
  if (Array.isArray(output)) {
    const arr = output as unknown[];
    const preview = arr
      .slice(0, 3)
      .map(item => (typeof item === "object" && item !== null
        ? formatScalar((item as Record<string, unknown>).title ?? (item as Record<string, unknown>).name ?? (item as Record<string, unknown>).id)
        : formatScalar(item)))
      .filter(Boolean)
      .join(", ");
    return (
      <p className="font-mono text-[10px] text-neutral-600 dark:text-neutral-300 leading-relaxed">
        {arr.length} item{arr.length !== 1 ? "s" : ""}
        {preview ? ` — ${preview}${arr.length > 3 ? "…" : ""}` : ""}
      </p>
    );
  }

  // Object — show key-value pairs, preferring common "result" fields first
  if (typeof output === "object") {
    const obj = output as Record<string, unknown>;
    // Error payload
    if (obj.error || obj.message && isError) {
      return (
        <p className="font-mono text-[10px] text-red-300 break-all leading-relaxed">
          {formatScalar(obj.error ?? obj.message)}
        </p>
      );
    }
    // Success pill + important fields
    const importantKeys = ["title", "name", "id", "status", "count", "message", "result", "output", "content"];
    const shownEntries: [string, unknown][] = [];
    for (const k of importantKeys) {
      if (k in obj && obj[k] !== null && obj[k] !== undefined) shownEntries.push([k, obj[k]]);
    }
    // Remaining non-id keys (up to 4 total)
    for (const [k, v] of Object.entries(obj)) {
      if (shownEntries.length >= 4) break;
      if (importantKeys.includes(k) || SKIP_KEYS.has(k)) continue;
      if (v === null || v === undefined) continue;
      if (typeof v === "object") continue;
      shownEntries.push([k, v]);
    }
    if (shownEntries.length === 0) return null;
    return (
      <div className="flex flex-col gap-0.5">
        {shownEntries.map(([k, v]) => (
          <div key={k} className="flex gap-2 min-w-0">
            <span className="text-neutral-400 dark:text-neutral-500 shrink-0 min-w-[64px] text-right font-sans text-[10px] leading-[1.6] capitalize">
              {humanizeKey(k)}
            </span>
            <span className={`break-all font-mono text-[10px] leading-[1.6] ${isError ? "text-red-300" : "text-neutral-700 dark:text-neutral-200"}`}>
              {formatScalar(v)}
            </span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <p className="font-mono text-[10px] text-neutral-600 dark:text-neutral-300 leading-relaxed">
      {formatScalar(output)}
    </p>
  );
}

// ─── Icon ─────────────────────────────────────────────────────────────────────

function getToolIcon(toolName: string) {
  const n = toolName.toLowerCase();
  if (n.includes("card_create") || n.includes("create_card"))
    return <PlusCircle className="w-3 h-3" />;
  if (n.includes("card_move")   || n.includes("move_card"))
    return <ArrowRight className="w-3 h-3" />;
  if (n.includes("card_update") || n.includes("update_card"))
    return <Edit2 className="w-3 h-3" />;
  if (n.includes("card_delete") || n.includes("delete_card"))
    return <Trash2 className="w-3 h-3" />;
  if (n.includes("card"))
    return <Layers className="w-3 h-3" />;
  if (n.includes("board_create") || n.includes("create_board"))
    return <LayoutDashboard className="w-3 h-3" />;
  if (n.includes("board"))
    return <LayoutDashboard className="w-3 h-3" />;
  if (n.includes("document_create"))
    return <FileText className="w-3 h-3" />;
  if (n.includes("document"))
    return <FileText className="w-3 h-3" />;
  if (n.includes("mesh") || n.includes("brick"))
    return <Grid3X3 className="w-3 h-3" />;
  if (n.includes("script_run") || n.includes("execute"))
    return <Play className="w-3 h-3" />;
  if (n.includes("script"))
    return <Code className="w-3 h-3" />;
  if (n.includes("search") || n.includes("find"))
    return <Search className="w-3 h-3" />;
  if (n.includes("tool_search"))
    return <ScanSearch className="w-3 h-3" />;
  if (n.includes("tool_load"))
    return <Zap className="w-3 h-3" />;
  if (n.includes("git"))
    return <GitBranch className="w-3 h-3" />;
  if (n.includes("os") || n.includes("file") || n.includes("read") || n.includes("write"))
    return <Terminal className="w-3 h-3" />;
  if (n.includes("tag"))
    return <Tag className="w-3 h-3" />;
  if (n.includes("web"))
    return <Globe className="w-3 h-3" />;
  if (n.includes("list"))
    return <List className="w-3 h-3" />;
  if (n.includes("data") || n.includes("math"))
    return <Database className="w-3 h-3" />;
  if (n.includes("integration"))
    return <FolderOpen className="w-3 h-3" />;
  return <Wrench className="w-3 h-3" />;
}

// ─── Single chip ─────────────────────────────────────────────────────────────

export interface ToolCallChipProps {
  t: TFn;
  toolName: string;
  input?: Record<string, unknown>;
  isDone: boolean;
  isRunning: boolean;
  isError: boolean;
  needsApproval: boolean;
  output?: unknown;
  onApprove?: () => void;
  onReject?: () => void;
  /** indent level — used by BatchToolChip for sub-items */
  indent?: boolean;
}

export function ToolCallChip({
  t,
  toolName,
  input,
  isDone,
  isRunning,
  isError,
  needsApproval,
  output,
  onApprove,
  onReject,
  indent = false,
}: ToolCallChipProps) {
  const [expanded, setExpanded] = useState(false);

  const label = getToolActionLabel(t, toolName, input);
  const canExpand = isDone && (!!input || output !== undefined);

  const toggle = useCallback(() => {
    if (canExpand) setExpanded(v => !v);
  }, [canExpand]);

  // ── Status icon ──────────────────────────────────────────────────────────
  const statusIcon = needsApproval ? (
    <ShieldAlert className="w-3 h-3 text-amber-400 shrink-0 animate-pulse" />
  ) : isError ? (
    <XCircle className="w-3 h-3 text-red-400 shrink-0" />
  ) : isDone ? (
    <CheckCircle2 className="w-3 h-3 text-emerald-500/80 shrink-0" />
  ) : (
    <Loader2 className="w-3 h-3 text-violet-400 shrink-0 animate-spin" />
  );

  const toolIcon = (
    <span className={`shrink-0 ${
      needsApproval ? "text-amber-400" :
      isError       ? "text-red-400"   :
      isDone        ? "text-neutral-400 dark:text-neutral-500" :
                      "text-violet-400"
    }`}>
      {getToolIcon(toolName)}
    </span>
  );

  return (
    <div className={indent ? "ml-4" : ""}>
      {/* ── Main row ──────────────────────────────────────────────────────── */}
      <button
        onClick={toggle}
        disabled={!canExpand && !needsApproval}
        className={`
          flex items-center gap-1.5 w-full text-left py-0.5 rounded
          text-[12px] transition-colors group/chip
          ${canExpand ? "cursor-pointer hover:bg-neutral-100 dark:hover:bg-neutral-800/60 px-1 -mx-1" : "cursor-default"}
          ${needsApproval
            ? "text-amber-600 dark:text-amber-400"
            : isError
            ? "text-red-500 dark:text-red-400"
            : isDone
            ? "text-neutral-500 dark:text-neutral-400"
            : "text-violet-500 dark:text-violet-400"
          }
        `}
      >
        {statusIcon}
        {toolIcon}

        <span className="flex-1 truncate leading-none">
          {label}
          {needsApproval && (
            <span className="ml-1.5 text-[10px] font-semibold text-amber-500 uppercase tracking-wide">
              · {t("agent.approval.requires")}
            </span>
          )}
        </span>

        {canExpand && (
          <ChevronDown
            className={`w-3 h-3 shrink-0 opacity-0 group-hover/chip:opacity-50 transition-all duration-150 ${expanded ? "rotate-180 opacity-50" : ""}`}
          />
        )}
      </button>

      {/* ── Approval buttons ──────────────────────────────────────────────── */}
      {needsApproval && onApprove && onReject && (
        <div className="flex gap-1.5 ml-6 mt-1">
          <button
            onClick={onApprove}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-500 hover:bg-emerald-600 text-white text-[11px] font-semibold transition-colors"
          >
            <Check className="w-2.5 h-2.5" />
            {t("agent.approval.approve")}
          </button>
          <button
            onClick={onReject}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md border border-neutral-300 dark:border-neutral-600 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700 text-[11px] font-semibold transition-colors"
          >
            <X className="w-2.5 h-2.5" />
            {t("agent.approval.reject")}
          </button>
        </div>
      )}

      {/* ── Expanded details ──────────────────────────────────────────────── */}
      {expanded && (
        <div className="ml-6 mt-1 mb-1 rounded-lg overflow-hidden border border-neutral-200 dark:border-neutral-700/60">
          {input && Object.keys(input).filter(k => !SKIP_KEYS.has(k)).length > 0 && (
            <div className="bg-neutral-50 dark:bg-neutral-800/80 px-3 py-2 border-b border-neutral-200 dark:border-neutral-700/60">
              <div className="text-[9px] uppercase tracking-widest text-neutral-400 dark:text-neutral-500 mb-1.5 font-sans font-semibold flex items-center gap-1">
                <Wrench className="w-2.5 h-2.5" /> Input
              </div>
              <InputKV input={input} />
            </div>
          )}
          {output !== undefined && output !== null && (
            <div className={`px-3 py-2 ${isError ? "bg-red-950/20" : "bg-neutral-50 dark:bg-neutral-800/60"}`}>
              <div className={`text-[9px] uppercase tracking-widest mb-1.5 font-sans font-semibold flex items-center gap-1 ${isError ? "text-red-400" : "text-neutral-400 dark:text-neutral-500"}`}>
                <Terminal className="w-2.5 h-2.5" /> Output
              </div>
              <OutputSummary output={output} isError={isError} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Batch wrapper ────────────────────────────────────────────────────────────

export interface BatchToolChipProps {
  t: TFn;
  count: number;
  children: React.ReactNode;
  /** pre-open (e.g. when running) */
  defaultOpen?: boolean;
}

export function BatchToolChip({ t, count, children, defaultOpen = false }: BatchToolChipProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div>
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 py-0.5 px-1 -mx-1 w-full text-left text-[12px] text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800/60 rounded transition-colors group/batch"
      >
        <Zap className="w-3 h-3 text-violet-400 shrink-0" />
        <span className="flex-1 font-medium">
          {t("agent.tools.batchExecution")}
          <span className="ml-1.5 text-[10px] text-neutral-400 dark:text-neutral-500 font-normal">
            · {count} {t("agent.tools.actions")}
          </span>
        </span>
        <ChevronDown
          className={`w-3 h-3 shrink-0 opacity-60 transition-transform duration-150 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="ml-4 mt-0.5 flex flex-col gap-0.5 border-l border-neutral-200 dark:border-neutral-700/50 pl-2.5">
          {children}
        </div>
      )}
    </div>
  );
}
