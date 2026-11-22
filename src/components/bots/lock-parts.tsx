"use client";

import { Lock } from "lucide-react";

import { useTranslations } from "@/components/providers/i18n-provider";
import { cx } from "@/components/roles/ui";
import { authorLines, lockedErrorKind, type Authorship } from "@/lib/bots/locks";

type T = (key: string, values?: Record<string, string | number>) => string;

/** The two independent locks as badges. Nothing renders when neither applies. */
export function LockChips({ botLocked, codeLocked, className }: { botLocked: boolean; codeLocked: boolean; className?: string }) {
  const t = useTranslations("bots");
  if (!botLocked && !codeLocked) return null;
  const chip = "inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-500/60 bg-amber-500/15 px-1.5 py-px text-[10px] font-bold text-amber-800 dark:text-amber-300";
  return (
    <span className={cx("inline-flex flex-wrap items-center gap-1", className)}>
      {botLocked && (
        <span className={chip} title={t("locks.botLockedHint")}>
          <Lock className="h-2.5 w-2.5" aria-hidden /> {t("locks.botLocked")}
        </span>
      )}
      {codeLocked && (
        <span className={chip} title={t("locks.codeLockedHint")}>
          <Lock className="h-2.5 w-2.5" aria-hidden /> {t("locks.codeLocked")}
        </span>
      )}
    </span>
  );
}

/** Original author, pack of origin and fork reference. Always read-only (the server never lets them change). */
export function AuthorshipBlock({ authorship }: { authorship: Authorship }) {
  const t = useTranslations("bots");
  const lines = authorLines(authorship);
  if (lines.length === 0) return null;
  const text = (line: (typeof lines)[number]): string => {
    if (line.kind === "originalAuthor") return t("locks.author.originalAuthor", line.values);
    if (line.kind === "forkedFrom") return t("locks.author.forkedFrom", line.values);
    const base = line.values.publisher ? t("locks.author.importedFrom", line.values) : t("locks.author.importedFromNoPublisher", line.values);
    return line.values.version ? `${base} · ${t("locks.author.version", { version: line.values.version })}` : base;
  };
  return (
    <div className="rounded-lg border border-border bg-muted/40 px-3 py-2" aria-label={t("locks.author.title")}>
      <ul className="space-y-0.5 text-[11px] text-muted-foreground">
        {lines.map((l) => (
          <li key={l.kind}>{text(l)}</li>
        ))}
      </ul>
    </div>
  );
}

export function LockNotice({ title, body }: { title: string; body: string }) {
  return (
    <div role="note" className="flex items-start gap-2 rounded-lg border border-amber-500/50 bg-amber-500/10 px-3 py-2">
      <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-700 dark:text-amber-300" aria-hidden />
      <div className="min-w-0">
        <div className="text-xs font-bold text-foreground">{title}</div>
        <p className="text-[11px] text-muted-foreground">{body}</p>
      </div>
    </div>
  );
}

/** A readable message for an error from the API: a lock refusal gets its own text, anything else keeps the server's message. */
export function lockAwareMessage(t: T, error: unknown, fallback: string): string {
  const kind = lockedErrorKind(error);
  if (kind) return t(`locks.errors.${kind}`);
  return error instanceof Error && error.message ? error.message : fallback;
}
