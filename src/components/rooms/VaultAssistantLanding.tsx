"use client";

import { useState, useRef, type KeyboardEvent } from "react";
import { Sparkles, Send, Loader2 } from "lucide-react";

type TFn = (key: string, params?: Record<string, string | number>) => string;

interface VaultAssistantLandingProps {
  /** Display name of the current user, used in the welcome greeting. */
  userName?: string;
  /** Fired when the user submits their first message. */
  onSend: (message: string) => void;
  /** True while the room is being created / navigation is in flight. */
  isSubmitting?: boolean;
  t: TFn;
}

/**
 * VaultAssistantLanding — the empty/initial state for `/rooms/vault`.
 *
 * Imitates the Vault app's assistant home and the room chat look: a Killio
 * welcome header, a few suggestion chips and a composer. It does NOT stream a
 * conversation itself — on the first send it hands the message up so the page
 * can create a real room and let the existing room AI flow take over.
 */
export function VaultAssistantLanding({
  userName,
  onSend,
  isSubmitting = false,
  t,
}: VaultAssistantLandingProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const suggestions = [
    t("vaultLanding.suggestions.0"),
    t("vaultLanding.suggestions.1"),
    t("vaultLanding.suggestions.2"),
    t("vaultLanding.suggestions.3"),
  ];

  const submit = (text?: string) => {
    const finalText = (typeof text === "string" ? text : value).trim();
    if (!finalText || isSubmitting) return;
    onSend(finalText);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-white dark:bg-neutral-900">
      {/* Welcome + suggestions */}
      <div className="flex flex-1 min-h-0 flex-col items-center justify-center overflow-y-auto px-6 py-10 text-center">
        <div className="flex w-full max-w-xl flex-col items-center gap-5">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500/20 to-violet-500/20 text-cyan-500">
            <Sparkles className="h-7 w-7" />
          </div>

          <div className="space-y-1.5">
            <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
              {userName
                ? t("vaultLanding.greeting", { name: userName })
                : t("vaultLanding.greetingGeneric")}
            </h1>
            <p className="mx-auto max-w-md text-sm text-muted-foreground">
              {t("vaultLanding.subtitle")}
            </p>
          </div>

          <div className="flex w-full flex-wrap items-stretch justify-center gap-2 pt-2">
            {suggestions.map((tip) => (
              <button
                key={tip}
                type="button"
                disabled={isSubmitting}
                onClick={() => submit(tip)}
                className="rounded-xl border border-border/70 bg-card/40 px-3.5 py-2.5 text-left text-sm text-muted-foreground transition-colors hover:border-cyan-500/40 hover:bg-cyan-500/5 hover:text-foreground disabled:opacity-50"
              >
                {tip}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Composer — mirrors the agent/room chat input */}
      <div className="shrink-0 border-t border-neutral-200 px-3 py-3 dark:border-neutral-700">
        <div className="mx-auto flex w-full max-w-2xl items-end gap-2">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            disabled={isSubmitting}
            placeholder={t("vaultLanding.inputPlaceholder")}
            className="min-h-[42px] max-h-40 flex-1 resize-none rounded-xl border border-neutral-200 bg-neutral-50 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50 disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-800"
            autoFocus
          />
          <button
            type="button"
            onClick={() => submit()}
            disabled={!value.trim() || isSubmitting}
            className="shrink-0 rounded-xl bg-cyan-600 p-2.5 text-white transition-colors hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-40"
            title={t("vaultLanding.send")}
          >
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </button>
        </div>
        <p className="mt-1 text-center text-[10px] text-neutral-400">
          {t("vaultLanding.hint")}
        </p>
      </div>
    </div>
  );
}
