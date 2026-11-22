"use client";

import { useState } from "react";
import { Copy, Lock, LockOpen } from "lucide-react";

import { AuthorshipBlock, LockNotice, lockAwareMessage } from "@/components/bots/lock-parts";
import { useTranslations } from "@/components/providers/i18n-provider";
import { duplicateScript, setScriptLock, type ScriptSummary } from "@/lib/api/scripts";
import { normalizeAuthorship, scriptLockUi } from "@/lib/bots/locks";
import { toast } from "@/lib/toast";

/** Authorship of a script as the read-only block shows it (scripts carry it flat; see ScriptSummary). */
export function scriptAuthorship(s: ScriptSummary) {
  return normalizeAuthorship({
    originalAuthorName: s.originalAuthorName,
    source: s.sourcePackId ? { packId: s.sourcePackId, packTitle: s.sourcePackTitle, packVersion: s.sourcePackVersion, publisherName: s.sourcePublisherName } : null,
    forkedFrom: s.forkedFromId ? { id: s.forkedFromId, name: s.forkedFromName } : null,
  });
}

const btnCls = "inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-[11px] font-semibold text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50";

/**
 * Bar under the header of the script editor: the CODE lock state with its controls, "Duplicate" (never offered while locked) and the
 * read-only authorship. The server decides everything (SCRIPT_LOCKED / UNLOCK_FORBIDDEN); this only reflects it.
 */
export function ScriptLockBar({
  script,
  teamId,
  accessToken,
  onChanged,
  onDuplicated,
}: {
  script: ScriptSummary;
  teamId: string;
  accessToken: string;
  /** After a lock change: `locked` tells which way; the caller refreshes the script (an unlocked one has to be fetched again). */
  onChanged: (locked: boolean) => Promise<void> | void;
  onDuplicated: (copy: ScriptSummary) => void;
}) {
  const t = useTranslations("bots");
  const [busy, setBusy] = useState(false);
  const ui = scriptLockUi(script);
  const author = scriptAuthorship(script);
  const hasAuthor = author.originalAuthorName || author.source || author.forkedFrom;

  const change = async (locked: boolean) => {
    if (locked && !window.confirm(t("locks.confirmLockCode"))) return;
    setBusy(true);
    try {
      await setScriptLock(script.id, teamId, locked, accessToken);
      await onChanged(locked);
      toast(t(locked ? "locks.toast.codeLocked" : "locks.toast.codeUnlocked"), "success");
    } catch (e) {
      toast(lockAwareMessage(t, e, t("toast.error")), "error");
    } finally {
      setBusy(false);
    }
  };
  const copy = async () => {
    setBusy(true);
    try {
      onDuplicated(await duplicateScript(script.id, teamId, accessToken));
    } catch (e) {
      toast(lockAwareMessage(t, e, t("toast.error")), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2 border-b border-foreground/10 px-3 py-2 dark:border-white/10">
      <div className="flex flex-wrap items-center gap-2">
        {ui.codeLocked && (
          <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/60 bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:text-amber-300" title={t("locks.codeLockedHint")}>
            <Lock className="h-2.5 w-2.5" aria-hidden /> {t("locks.codeLocked")}
          </span>
        )}
        <span className="ml-auto flex flex-wrap items-center gap-2">
          {ui.canDuplicate && (
            <button type="button" className={btnCls} disabled={busy} onClick={() => void copy()}>
              <Copy className="h-3.5 w-3.5" aria-hidden /> {t("locks.duplicateScript")}
            </button>
          )}
          {ui.canLock && (
            <button type="button" className={btnCls} disabled={busy} title={t("locks.lockCodeHelp")} onClick={() => void change(true)}>
              <Lock className="h-3.5 w-3.5" aria-hidden /> {t("locks.lockCode")}
            </button>
          )}
          {ui.canUnlock && (
            <button type="button" className={btnCls} disabled={busy} onClick={() => void change(false)}>
              <LockOpen className="h-3.5 w-3.5" aria-hidden /> {t("locks.unlockCode")}
            </button>
          )}
        </span>
      </div>
      {hasAuthor ? <AuthorshipBlock authorship={author} /> : null}
    </div>
  );
}

/** What the editor shows INSTEAD of the canvas and the run logs of a script whose code is locked (it never asks for the graph). */
export function LockedScriptPanel({ script }: { script: ScriptSummary }) {
  const t = useTranslations("bots");
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-8 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300">
        <Lock className="h-6 w-6" aria-hidden />
      </span>
      <div className="max-w-md">
        <LockNotice title={t("locks.scriptPane.title")} body={script.lockSource === "pack" ? `${t("locks.scriptPane.body")} ${t("locks.byPublisher")}` : t("locks.scriptPane.bodyWorkspace")} />
      </div>
    </div>
  );
}
