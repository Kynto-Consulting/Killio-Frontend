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
  // OS / file tools
  FilePen, FileSearch, FilePlus2, FileDown, FileUp,
  FolderPlus, FolderSymlink, FolderMinus,
  // Git tools
  GitCommit, GitMerge, GitPullRequestArrow, History, Archive, Activity,
  ArrowUpFromLine, ArrowDownToLine, Copy, Plus, FileCode,
  // Room / Chat tools
  MessageSquare, Hash, Send,
  // Sub-agent
  Bot,
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

  // ── Sub-agent ───────────────────────────────────────────────────────────────
  if (n === "sub_agent") {
    const label = trunc(input?.label ?? input?.prompt, 40);
    return label ? `${t("agent.toolAction.subAgent")}: ${label}` : t("agent.toolAction.subAgent");
  }

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
  if (n.includes("os_shell") || n.includes("os_execute") || n.includes("shell_exec") || n.includes("run_command") || n.includes("execute_command") || n.includes("os_run")) {
    const cmd = trunc(
      input?.command ?? input?.cmd ?? input?.shell ?? input?.script ?? input?.args,
      50
    );
    return cmd ? `$ ${cmd}` : t("agent.toolAction.systemCommand");
  }

  // ── Files (specific) ──────────────────────────────────────────────────────
  if (n.includes("edit_file")     || n.includes("os_edit"))
    return t("agent.toolAction.fileEdited", { file: file || "" });
  if (n.includes("read_file")     || n.includes("os_read"))
    return t("agent.toolAction.fileRead", { file: file || "" });
  if (n.includes("write_file")    || n.includes("os_write"))
    return t("agent.toolAction.fileWritten", { file: file || "" });
  if (n.includes("download_file") || n.includes("os_download"))
    return t("agent.toolAction.fileDownloaded", { file: file || "" });
  if (n.includes("upload_file")   || n.includes("os_upload"))
    return t("agent.toolAction.fileUploaded", { file: file || "" });
  if (n.includes("os_mkdir")      || n.includes("make_dir") || n.includes("create_dir"))
    return t("agent.toolAction.dirCreated", { file: file || "" });
  if (n.includes("os_delete")     || n.includes("delete_file") || n.includes("remove_file"))
    return t("agent.toolAction.fileDeleted", { file: file || "" });
  if (n.includes("os_move")       || n.includes("move_file") || n.includes("rename_file"))
    return t("agent.toolAction.fileMoved", { file: file || "" });
  if (n.includes("list_dir")      || n.includes("os_list"))
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

  // ── Rooms / Chat ────────────────────────────────────────────────────────────
  if (n.includes("room_create"))
    return t("agent.toolAction.roomCreated", { name: title || (input?.name as string) || "" });
  if (n.includes("room_list"))
    return t("agent.toolAction.roomListed");
  if (n.includes("room_send_message") || n.includes("room_send"))
    return t("agent.toolAction.messageSent");
  if (n.includes("room_"))
    return t("agent.toolAction.room");

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
  if (n.includes("mesh_board_create") || n.includes("create_mesh_board"))
    return t("agent.toolAction.meshBoardCreated", { name: title || (input?.name as string) || "" });
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

// ─── File diff renderer (edit_file output) ───────────────────────────────────

type DiffLine = { type: 'removed' | 'added' | 'context'; content: string };

function FileDiffOutput({ path, operation, diff }: { path?: string; operation?: string; diff: DiffLine[] }) {
  const removedCount = diff.filter(l => l.type === 'removed').length;
  const addedCount   = diff.filter(l => l.type === 'added').length;

  return (
    <div className="rounded-md overflow-hidden border border-neutral-200 dark:border-neutral-700 text-[10px] font-mono">
      {/* Header bar */}
      <div className="flex items-center justify-between gap-2 bg-neutral-100 dark:bg-neutral-800/80 px-2 py-1 font-sans">
        <span className="text-neutral-500 dark:text-neutral-400 truncate">{path ?? "file"}</span>
        <div className="flex items-center gap-1.5 shrink-0">
          {operation && (
            <span className="text-[9px] font-bold uppercase tracking-widest text-neutral-400 dark:text-neutral-500">
              {operation.replace(/_/g, " ")}
            </span>
          )}
          {removedCount > 0 && (
            <span className="text-red-500 font-bold">−{removedCount}</span>
          )}
          {addedCount > 0 && (
            <span className="text-emerald-500 font-bold">+{addedCount}</span>
          )}
        </div>
      </div>
      {/* Diff lines */}
      <div className="max-h-48 overflow-y-auto">
        {diff.map((line, i) => (
          <div
            key={i}
            className={`flex gap-1 px-2 py-[1px] whitespace-pre-wrap break-all leading-[1.5] ${
              line.type === 'removed' ? 'bg-red-500/10 text-red-400' :
              line.type === 'added'   ? 'bg-emerald-500/10 text-emerald-400' :
                                        'text-neutral-400 dark:text-neutral-500'
            }`}
          >
            <span className="shrink-0 w-3 select-none opacity-70">
              {line.type === 'removed' ? '−' : line.type === 'added' ? '+' : ' '}
            </span>
            <span>{line.content}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Generic output summary ───────────────────────────────────────────────────

function OutputSummary({ output, isError }: { output: unknown; isError: boolean }) {
  if (output === null || output === undefined) return null;

  // edit_file diff output — render dedicated diff view
  if (
    typeof output === 'object' &&
    output !== null &&
    'diff' in output &&
    Array.isArray((output as any).diff) &&
    (output as any).diff.length > 0
  ) {
    const o = output as { path?: string; operation?: string; diff: DiffLine[] };
    return <FileDiffOutput path={o.path} operation={o.operation} diff={o.diff} />;
  }

  const formatPreviewItem = (item: unknown): string => {
    if (item === null || item === undefined) return "—";
    if (typeof item === "string" || typeof item === "number" || typeof item === "boolean") {
      return formatScalar(item, 80);
    }
    if (Array.isArray(item)) {
      return `${item.length} item${item.length !== 1 ? "s" : ""}`;
    }
    if (typeof item === "object") {
      const obj = item as Record<string, unknown>;
      const primary = formatScalar(obj.title ?? obj.name ?? obj.label ?? obj.id, 80);
      const details = [
        obj.boardType ? formatScalar(obj.boardType, 40) : "",
        obj.visibility ? formatScalar(obj.visibility, 40) : "",
        obj.status ? formatScalar(obj.status, 40) : "",
        obj.updatedAt ? formatScalar(obj.updatedAt, 40) : "",
      ].filter(Boolean);
      return details.length > 0 ? `${primary} · ${details.join(" · ")}` : primary;
    }
    return formatScalar(item, 80);
  };

  const renderArrayPreview = (arr: unknown[], showCount = true) => {
    const previewItems = arr.slice(0, 3).map(formatPreviewItem).filter(Boolean);
    return (
      <div className="flex flex-col gap-1">
        {showCount && (
          <div className="text-[10px] uppercase tracking-widest text-neutral-400 dark:text-neutral-500 font-semibold">
            {arr.length} item{arr.length !== 1 ? "s" : ""}
          </div>
        )}
        {previewItems.length > 0 && (
          <div className="flex flex-col gap-1 rounded-md border border-black/5 dark:border-white/5 bg-black/5 dark:bg-white/5 px-2 py-1">
            {previewItems.map((item, index) => (
              <div key={index} className="font-mono text-[10px] leading-relaxed break-words text-neutral-700 dark:text-neutral-200">
                {index + 1}. {item}
              </div>
            ))}
            {arr.length > 3 && (
              <div className="font-mono text-[10px] text-neutral-500 dark:text-neutral-400">
                …
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderObjectPreview = (value: Record<string, unknown>) => {
    if (Array.isArray(value.preview) && typeof value.items === "number") {
      return renderArrayPreview(value.preview, false);
    }

    if (Array.isArray(value.preview)) {
      return renderArrayPreview(value.preview);
    }

    return null;
  };

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
    return renderArrayPreview(output as unknown[]);
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
      if (Array.isArray(v)) {
        shownEntries.push([k, { items: v.length, preview: v.slice(0, 3) }]);
        continue;
      }
      if (typeof v === "object") {
        const nested = Object.entries(v as Record<string, unknown>)
          .filter(([, nestedValue]) => nestedValue !== null && nestedValue !== undefined)
          .slice(0, 2)
          .map(([nestedKey, nestedValue]) => `${humanizeKey(nestedKey)}: ${formatScalar(nestedValue, 40)}`)
          .join(" · ");
        if (nested) shownEntries.push([k, nested]);
        continue;
      }
      shownEntries.push([k, v]);
    }
    if (shownEntries.length === 0) {
      return (
        <pre className={`mt-1 whitespace-pre-wrap break-words rounded-lg bg-black/5 dark:bg-white/5 px-2 py-1 text-[10px] font-mono ${isError ? "text-red-300" : "text-neutral-700 dark:text-neutral-200"}`}>
          {JSON.stringify(obj, null, 2)}
        </pre>
      );
    }
    return (
      <div className="flex flex-col gap-0.5">
        {shownEntries.map(([k, v]) => (
          <div key={k} className="flex flex-col gap-1 min-w-0">
            <span className="text-neutral-400 dark:text-neutral-500 shrink-0 min-w-[64px] text-right font-sans text-[10px] leading-[1.6] capitalize">
              {humanizeKey(k)}
            </span>
            {typeof v === "object" && v !== null && !Array.isArray(v) ? (
              renderObjectPreview(v as Record<string, unknown>) ?? (
                <pre className={`whitespace-pre-wrap break-words rounded-lg bg-black/5 dark:bg-white/5 px-2 py-1 text-[10px] font-mono ${isError ? "text-red-300" : "text-neutral-700 dark:text-neutral-200"}`}>
                  {JSON.stringify(v, null, 2)}
                </pre>
              )
            ) : Array.isArray(v) ? (
              renderArrayPreview(v)
            ) : (
              <span className={`break-all font-mono text-[10px] leading-[1.6] ${isError ? "text-red-300" : "text-neutral-700 dark:text-neutral-200"}`}>
                {formatScalar(v)}
              </span>
            )}
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

  // ── Sub-agent ──────────────────────────────────────────────────────────────
  if (n === "sub_agent")
    return <Bot className="w-3 h-3" />;

  // ── Cards ────────────────────────────────────────────────────────────────
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

  // ── Boards ───────────────────────────────────────────────────────────────
  if (n.includes("board_create") || n.includes("create_board"))
    return <LayoutDashboard className="w-3 h-3" />;
  if (n.includes("board"))
    return <LayoutDashboard className="w-3 h-3" />;

  // ── Rooms / Chat ──────────────────────────────────────────────────────────
  if (n.includes("room_send_message") || n.includes("room_send"))
    return <Send className="w-3 h-3" />;
  if (n.includes("room_create"))
    return <Hash className="w-3 h-3" />;
  if (n.includes("room_"))
    return <MessageSquare className="w-3 h-3" />;

  // ── Documents ────────────────────────────────────────────────────────────
  if (n.includes("document_create"))
    return <FileText className="w-3 h-3" />;
  if (n.includes("document"))
    return <FileText className="w-3 h-3" />;

  // ── Mesh / Canvas ─────────────────────────────────────────────────────────
  if (n.includes("mesh_board_create") || n.includes("create_mesh_board"))
    return <Grid3X3 className="w-3 h-3" />;
  if (n.includes("mesh") || n.includes("brick"))
    return <Grid3X3 className="w-3 h-3" />;

  // ── Scripts ───────────────────────────────────────────────────────────────
  if (n.includes("script_run") || n.includes("run_script") || n.includes("execute_script"))
    return <Play className="w-3 h-3" />;
  if (n.includes("script"))
    return <Code className="w-3 h-3" />;

  // ── Search / Tool meta ────────────────────────────────────────────────────
  if (n.includes("tool_search"))
    return <ScanSearch className="w-3 h-3" />;
  if (n.includes("tool_load"))
    return <Zap className="w-3 h-3" />;
  if (n.includes("web_search") || n.includes("search_web"))
    return <Globe className="w-3 h-3" />;
  if (n.includes("search") || n.includes("find"))
    return <Search className="w-3 h-3" />;

  // ── Git (granular) ────────────────────────────────────────────────────────
  if (n.includes("git_commit"))
    return <GitCommit className="w-3 h-3" />;
  if (n.includes("git_push"))
    return <ArrowUpFromLine className="w-3 h-3" />;
  if (n.includes("git_pull"))
    return <ArrowDownToLine className="w-3 h-3" />;
  if (n.includes("git_merge") || n.includes("git_rebase"))
    return <GitMerge className="w-3 h-3" />;
  if (n.includes("git_clone"))
    return <Copy className="w-3 h-3" />;
  if (n.includes("git_checkout") || n.includes("git_switch") || n.includes("git_branch"))
    return <GitBranch className="w-3 h-3" />;
  if (n.includes("git_status"))
    return <Activity className="w-3 h-3" />;
  if (n.includes("git_log"))
    return <History className="w-3 h-3" />;
  if (n.includes("git_stash"))
    return <Archive className="w-3 h-3" />;
  if (n.includes("git_diff"))
    return <FileCode className="w-3 h-3" />;
  if (n.includes("git_add"))
    return <Plus className="w-3 h-3" />;
  if (n.includes("git_tag"))
    return <Tag className="w-3 h-3" />;
  if (n.includes("git_pr") || n.includes("pull_request"))
    return <GitPullRequestArrow className="w-3 h-3" />;
  if (n.includes("git"))
    return <GitBranch className="w-3 h-3" />;

  // ── OS / File system (granular) ───────────────────────────────────────────
  if (n.includes("edit_file") || n.includes("os_edit"))
    return <FilePen className="w-3 h-3" />;
  if (n.includes("read_file") || n.includes("os_read"))
    return <FileSearch className="w-3 h-3" />;
  if (n.includes("write_file") || n.includes("os_write"))
    return <FilePlus2 className="w-3 h-3" />;
  if (n.includes("download_file") || n.includes("os_download"))
    return <FileDown className="w-3 h-3" />;
  if (n.includes("upload_file") || n.includes("os_upload"))
    return <FileUp className="w-3 h-3" />;
  if (n.includes("os_mkdir") || n.includes("make_dir") || n.includes("create_dir"))
    return <FolderPlus className="w-3 h-3" />;
  if (n.includes("os_delete") || n.includes("delete_file") || n.includes("remove_file"))
    return <FolderMinus className="w-3 h-3" />;
  if (n.includes("os_move") || n.includes("move_file") || n.includes("rename_file"))
    return <FolderSymlink className="w-3 h-3" />;
  if (n.includes("list_dir") || n.includes("os_list"))
    return <FolderOpen className="w-3 h-3" />;
  if (n.includes("os_shell") || n.includes("os_execute") || n.includes("os_run") || n.includes("shell_exec") || n.includes("run_command"))
    return <Terminal className="w-3 h-3" />;
  if (n.includes("os_"))
    return <Terminal className="w-3 h-3" />;

  // ── Misc ──────────────────────────────────────────────────────────────────
  if (n.includes("tag"))
    return <Tag className="w-3 h-3" />;
  if (n.includes("web"))
    return <Globe className="w-3 h-3" />;
  if (n.includes("list"))
    return <List className="w-3 h-3" />;
  if (n.includes("data") || n.includes("math"))
    return <Database className="w-3 h-3" />;
  if (n.includes("integration"))
    return <Zap className="w-3 h-3" />;
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

// ─── Building tool call placeholder ──────────────────────────────────────────

/**
 * Shown during AI streaming when a partial `<tool_call` or `<batch_tool` opening
 * tag is detected in text content — before the model has finished emitting the tag.
 */
export function BuildingToolCallChip({ t }: { t: TFn }) {
  return (
    <div className="flex items-center gap-1.5 py-0.5 text-[12px] text-violet-500 dark:text-violet-400">
      <Loader2 className="w-3 h-3 shrink-0 animate-spin" />
      <Wrench className="w-3 h-3 shrink-0 opacity-70" />
      <span className="font-medium italic opacity-80">
        {t("agent.tools.buildingToolCall") || "Building tool call…"}
      </span>
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
