"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, Copy, Eye, LayoutGrid, Loader2, Lock, LockOpen, Maximize2, Minimize2, MoreHorizontal, Pencil, PanelLeft, PanelRight, Play, Save, Trash2 } from "lucide-react";

import { AuthorshipBlock, lockAwareMessage } from "@/components/bots/lock-parts";
import { useTranslations } from "@/components/providers/i18n-provider";
import { duplicateScript, setScriptLock, updateScript, type ScriptSummary } from "@/lib/api/scripts";
import { authorLines } from "@/lib/bots/locks";
import { menuItems, primaryActions, workbenchTabs, type WorkbenchTab } from "@/lib/scripts-ui/workbench";
import { toast } from "@/lib/toast";
import { scriptAuthorship } from "./script-lock";
import type { CanvasChromeApi } from "./ScriptCanvas";
import type { TextEditorApi } from "./ScriptTextEditor";

export interface ScriptTopbarProps {
  script: ScriptSummary;
  teamId: string;
  accessToken: string;
  tab: WorkbenchTab;
  onTab: (tab: WorkbenchTab) => void;
  /** Present while the blocks tab is mounted. */
  canvas: CanvasChromeApi | null;
  /** Present while the text tab is mounted. */
  text: TextEditorApi | null;
  canRunManually: boolean;
  webhookUrl: string | null;
  onToggleActive: (isActive: boolean) => Promise<void>;
  onDelete: () => Promise<void>;
  onLockChanged: (locked: boolean) => Promise<void> | void;
  onDuplicated: (copy: ScriptSummary) => void;
  onRenamed: (updated: ScriptSummary) => void;
  listCollapsed?: boolean;
  onToggleList?: () => void;
}

const iconBtn =
  "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-foreground/70 transition-colors hover:bg-foreground/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";
const textBtn =
  "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-foreground/80 transition-colors hover:bg-foreground/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

/** THE single top bar of the script editor (~48px): title, state, tabs, primary actions and the "…" menu. */
export function ScriptTopbar(props: ScriptTopbarProps) {
  const { script, teamId, accessToken, tab, onTab, canvas, text, canRunManually, webhookUrl } = props;
  const t = useTranslations("integrations");
  const tb = useTranslations("bots");
  const locked = script.locked === true;
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState(script.name);
  const [copied, setCopied] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  const author = scriptAuthorship(script);
  const hasAuthorship = authorLines(author).length > 0;
  const tabs = workbenchTabs({ locked });
  const primary = primaryActions({ tab, locked, canRunManually, canPreview: !!canvas?.canPreview });
  const items = menuItems({ locked, lockSource: script.lockSource ?? null, hasWebhook: !!webhookUrl, hasAuthorship });

  useEffect(() => setDraftName(script.name), [script.name, script.id]);
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node) && !menuBtnRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setMenuOpen(false); menuBtnRef.current?.focus(); }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [menuOpen]);
  useEffect(() => {
    if (menuOpen) menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [menuOpen]);

  const tooltip = useMemo(() => {
    const parts: string[] = [];
    if (script.description) parts.push(script.description);
    if (author.originalAuthorName) parts.push(tb("locks.author.originalAuthor", { name: author.originalAuthorName }));
    if (script.sourcePackTitle) parts.push(tb("locks.author.importedFromNoPublisher", { pack: script.sourcePackTitle }));
    return parts.join(" · ");
  }, [script.description, script.sourcePackTitle, author.originalAuthorName, tb]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try { await fn(); } catch (e) { toast(lockAwareMessage(tb, e, tb("toast.error")), "error"); } finally { setBusy(false); }
  };
  const changeLock = (lock: boolean) => {
    if (lock && !window.confirm(tb("locks.confirmLockCode"))) return;
    setMenuOpen(false);
    void run(async () => {
      await setScriptLock(script.id, teamId, lock, accessToken);
      await props.onLockChanged(lock);
      toast(tb(lock ? "locks.toast.codeLocked" : "locks.toast.codeUnlocked"), "success");
    });
  };
  const duplicate = () => { setMenuOpen(false); void run(async () => props.onDuplicated(await duplicateScript(script.id, teamId, accessToken))); };
  const remove = () => {
    setMenuOpen(false);
    if (!window.confirm(t("scripts.deleteConfirm"))) return;
    void run(() => props.onDelete());
  };
  const copyUrl = async () => {
    if (!webhookUrl) return;
    try { await navigator.clipboard.writeText(webhookUrl); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { /* clipboard blocked */ }
  };
  const commitRename = () => {
    const name = draftName.trim();
    setRenaming(false);
    if (!name || name === script.name) { setDraftName(script.name); return; }
    void run(async () => props.onRenamed(await updateScript(script.id, { teamId, name }, accessToken)));
  };
  const onMenuKeys = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const els = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    const i = els.indexOf(document.activeElement as HTMLElement);
    els[(i + (e.key === "ArrowDown" ? 1 : -1) + els.length) % els.length]?.focus();
  };
  const onTabKeys = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const i = tabs.indexOf(tab);
    onTab(tabs[(i + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length]);
  };

  const saveBusy = tab === "blocks" ? !!canvas?.saving : !!text?.saving;
  const canSave = tab === "blocks" ? !!canvas : !!text?.ready && text.dirty && text.errorCount === 0;
  const doSave = () => void (tab === "blocks" ? canvas?.save() : text?.save());

  const menuItemCls = "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-foreground hover:bg-foreground/10 focus-visible:bg-foreground/10 focus-visible:outline-none disabled:opacity-50";

  return (
    <div className="flex h-12 shrink-0 items-center gap-1.5 border-b border-border/50 bg-card/70 px-2 backdrop-blur sm:gap-2 sm:px-3" role="toolbar" aria-label={t("scripts.topbar.label")}>
      {props.onToggleList && (
        <button type="button" className={iconBtn} onClick={props.onToggleList} aria-pressed={!props.listCollapsed} aria-label={t("scripts.topbar.toggleList")} title={t("scripts.topbar.toggleList")}>
          <PanelLeft className="h-4 w-4" aria-hidden />
        </button>
      )}

      {/* title */}
      <div className="flex min-w-0 flex-1 items-center gap-1.5 sm:flex-none sm:basis-[260px]">
        {locked && <Lock className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" aria-label={tb("locks.codeLocked")} />}
        {renaming ? (
          <input
            autoFocus
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") { setRenaming(false); setDraftName(script.name); } }}
            aria-label={t("scripts.topbar.rename")}
            maxLength={120}
            className="h-8 min-w-0 flex-1 rounded-lg border border-border/50 bg-background px-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-ring"
          />
        ) : (
          <>
            <span className="min-w-0 truncate text-sm font-semibold text-foreground" title={tooltip || script.name} onDoubleClick={() => !locked && setRenaming(true)}>
              {script.name}
            </span>
            {!locked && (
              <button type="button" className={`${iconBtn} hidden h-7 w-7 sm:inline-flex`} onClick={() => setRenaming(true)} aria-label={t("scripts.topbar.rename")} title={t("scripts.topbar.rename")}>
                <Pencil className="h-3 w-3" aria-hidden />
              </button>
            )}
          </>
        )}
      </div>

      {/* active switch */}
      <button
        type="button"
        role="switch"
        aria-checked={script.isActive}
        disabled={busy}
        onClick={() => void run(() => props.onToggleActive(!script.isActive))}
        title={script.isActive ? t("scripts.active") : t("scripts.inactive")}
        className="hidden h-8 shrink-0 items-center gap-1.5 rounded-full px-2 text-[11px] font-medium text-foreground/80 hover:bg-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:inline-flex"
      >
        <span className={`relative h-4 w-7 rounded-full transition-colors ${script.isActive ? "bg-emerald-500" : "bg-foreground/25"}`}>
          <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-all ${script.isActive ? "left-3.5" : "left-0.5"}`} />
        </span>
        {script.isActive ? t("scripts.active") : t("scripts.inactive")}
      </button>

      {/* segmented tabs */}
      {tabs.length > 0 && (
        <div role="tablist" aria-label={t("scripts.topbar.views")} onKeyDown={onTabKeys} className="inline-flex shrink-0 rounded-lg bg-foreground/[0.06] p-0.5">
          {tabs.map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              tabIndex={tab === id ? 0 : -1}
              onClick={() => onTab(id)}
              className={`rounded-md px-2 py-1 text-[11px] font-semibold transition sm:px-3 sm:text-xs ${tab === id ? "bg-background text-foreground shadow-sm" : "text-foreground/60 hover:text-foreground"}`}
            >
              {t(`scripts.topbar.tabs.${id}`)}
            </button>
          ))}
        </div>
      )}

      <span className="hidden flex-1 sm:block" />

      {/* canvas panel toggles */}
      {tab === "blocks" && canvas && !locked && (
        <>
          <button type="button" className={iconBtn} onClick={() => canvas.togglePanel("palette")} aria-pressed={canvas.panels.palette} aria-label={t("scripts.topbar.togglePalette")} title={t("scripts.topbar.togglePalette")}>
            <LayoutGrid className="h-4 w-4" aria-hidden />
          </button>
          <button type="button" className={iconBtn} onClick={() => canvas.togglePanel("config")} aria-pressed={canvas.panels.config} aria-label={t("scripts.topbar.toggleConfig")} title={t("scripts.topbar.toggleConfig")}>
            <PanelRight className="h-4 w-4" aria-hidden />
          </button>
        </>
      )}

      {/* primary actions (preview/fullscreen/run fold into the menu on phones) */}
      {primary.includes("run") && canvas && (
        <button type="button" className={`${textBtn} hidden bg-emerald-600 text-white hover:bg-emerald-700 hover:text-white sm:inline-flex`} onClick={() => void canvas.runManual()} disabled={canvas.running}>
          {canvas.running ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Play className="h-3.5 w-3.5" aria-hidden />}
          {canvas.running ? t("canvas.running") : t("canvas.runManual")}
        </button>
      )}
      {primary.includes("preview") && canvas && (
        <button type="button" className={`${textBtn} hidden sm:inline-flex`} onClick={() => void canvas.preview()} disabled={canvas.previewLoading} title={t("canvas.previewOutput")}>
          {canvas.previewLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Eye className="h-3.5 w-3.5" aria-hidden />}
          <span className="hidden 2xl:inline">{t("canvas.previewOutput")}</span>
        </button>
      )}
      {primary.includes("fullscreen") && canvas && (
        <button type="button" className={`${iconBtn} hidden sm:inline-flex`} onClick={canvas.toggleFullscreen} aria-label={canvas.isFullscreen ? t("canvas.exitFullscreen") : t("canvas.fullscreen")} title={`${canvas.isFullscreen ? t("canvas.exitFullscreen") : t("canvas.fullscreen")} (Esc)`}>
          {canvas.isFullscreen ? <Minimize2 className="h-4 w-4" aria-hidden /> : <Maximize2 className="h-4 w-4" aria-hidden />}
        </button>
      )}
      {primary.includes("save") && (
        <button
          type="button"
          onClick={doSave}
          disabled={!canSave || saveBusy}
          title={`${t("canvas.save")} (Ctrl+S)`}
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        >
          {saveBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Save className="h-3.5 w-3.5" aria-hidden />}
          <span className="hidden sm:inline">{saveBusy ? t("canvas.saving") : t("canvas.save")}</span>
        </button>
      )}

      {/* "…" menu */}
      <div className="relative shrink-0">
        <button
          ref={menuBtnRef}
          type="button"
          className={iconBtn}
          onClick={() => setMenuOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-controls={menuOpen ? menuId : undefined}
          aria-label={t("scripts.topbar.more")}
          title={t("scripts.topbar.more")}
        >
          <MoreHorizontal className="h-4 w-4" aria-hidden />
        </button>
        {menuOpen && (
          <div
            ref={menuRef}
            id={menuId}
            role="menu"
            aria-label={t("scripts.topbar.more")}
            onKeyDown={onMenuKeys}
            className="absolute right-0 top-full z-50 mt-1 w-72 max-w-[calc(100vw-1rem)] rounded-xl border border-border/50 bg-popover p-1.5 text-popover-foreground shadow-xl"
          >
            {/* phone-only: what the bar hides at that width */}
            <div className="sm:hidden">
              <button type="button" role="menuitem" className={menuItemCls} onClick={() => { setMenuOpen(false); void run(() => props.onToggleActive(!script.isActive)); }}>
                <span className={`h-2 w-2 rounded-full ${script.isActive ? "bg-emerald-500" : "bg-foreground/30"}`} aria-hidden />
                {script.isActive ? t("scripts.active") : t("scripts.inactive")}
              </button>
              {primary.includes("run") && canvas && (
                <button type="button" role="menuitem" className={menuItemCls} onClick={() => { setMenuOpen(false); void canvas.runManual(); }}><Play className="h-3.5 w-3.5" aria-hidden />{t("canvas.runManual")}</button>
              )}
              {primary.includes("preview") && canvas && (
                <button type="button" role="menuitem" className={menuItemCls} onClick={() => { setMenuOpen(false); void canvas.preview(); }}><Eye className="h-3.5 w-3.5" aria-hidden />{t("canvas.previewOutput")}</button>
              )}
              {primary.includes("fullscreen") && canvas && (
                <button type="button" role="menuitem" className={menuItemCls} onClick={() => { setMenuOpen(false); canvas.toggleFullscreen(); }}><Maximize2 className="h-3.5 w-3.5" aria-hidden />{t("canvas.fullscreen")}</button>
              )}
              <div className="my-1 h-px bg-border/50" />
            </div>

            {items.map((it) => (
              <div key={it.id}>
                {it.divider && <div className="my-1 h-px bg-border/50" />}
                {it.id === "duplicate" && (
                  <button type="button" role="menuitem" className={menuItemCls} disabled={busy} onClick={duplicate}><Copy className="h-3.5 w-3.5" aria-hidden />{tb("locks.duplicateScript")}</button>
                )}
                {it.id === "lock" && (
                  <button type="button" role="menuitem" className={menuItemCls} disabled={busy} title={tb("locks.lockCodeHelp")} onClick={() => changeLock(true)}><Lock className="h-3.5 w-3.5" aria-hidden />{tb("locks.lockCode")}</button>
                )}
                {it.id === "unlock" && (
                  <button type="button" role="menuitem" className={menuItemCls} disabled={busy} onClick={() => changeLock(false)}><LockOpen className="h-3.5 w-3.5" aria-hidden />{tb("locks.unlockCode")}</button>
                )}
                {it.id === "copyWebhook" && webhookUrl && (
                  <div className="px-2.5 py-1.5">
                    <p className="mb-1 text-[11px] font-medium text-muted-foreground">{t("scripts.topbar.webhookUrl")}</p>
                    <div className="flex items-center gap-1.5">
                      <input readOnly value={webhookUrl} onFocus={(e) => e.currentTarget.select()} aria-label={t("scripts.topbar.webhookUrl")} className="h-7 min-w-0 flex-1 truncate rounded-md border border-border/50 bg-background px-2 text-[11px] text-muted-foreground" />
                      <button type="button" role="menuitem" className={`${textBtn} h-7 px-2`} onClick={() => void copyUrl()}>
                        {copied ? <Check className="h-3 w-3 text-emerald-600" aria-hidden /> : <Copy className="h-3 w-3" aria-hidden />}
                        {copied ? t("canvas.webhookCopied") : t("canvas.copyWebhook")}
                      </button>
                    </div>
                  </div>
                )}
                {it.id === "authorship" && (
                  <div className="px-1.5 py-1"><AuthorshipBlock authorship={author} /></div>
                )}
                {it.id === "delete" && (
                  <button type="button" role="menuitem" className={`${menuItemCls} text-red-600 hover:bg-red-500/10 dark:text-red-400`} disabled={busy} onClick={remove}><Trash2 className="h-3.5 w-3.5" aria-hidden />{t("scripts.delete")}</button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
