"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Lock, Sparkles, Check } from "lucide-react";
import Link from "next/link";
import { useSession } from "@/components/providers/session-provider";
import { useTranslations } from "@/components/providers/i18n-provider";
import { getAgentModels, type AgentModelOption, type AgentModelOptions } from "@/lib/api/agent";

type TFn = (key: string, params?: Record<string, string | number>) => string;

interface ModelSelectorProps {
  teamId: string;
  /** When set, reflects the conversation's pinned model + once-only lock. */
  conversationId?: string;
  /** Currently selected model id (controlled). */
  value?: string | null;
  /** Fired when the user picks an allowed model. */
  onChange: (modelId: string) => void;
  /** "compact" → composer chip · "full" → settings row (full width). */
  variant?: "compact" | "full";
  className?: string;
}

const UPGRADE_HREF = "/pricing";

/**
 * Model picker shared by the rooms composer and user settings.
 * - Locked (allowed:false) models show a 🔒 and an Upgrade link.
 * - When the conversation already spent its once-only change, the whole
 *   selector is disabled with an explanatory tooltip.
 */
export function ModelSelector({
  teamId,
  conversationId,
  value,
  onChange,
  variant = "compact",
  className = "",
}: ModelSelectorProps) {
  const { accessToken } = useSession();
  const t = useTranslations("common") as TFn;

  const [data, setData] = useState<AgentModelOptions | null>(null);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!teamId || !accessToken) return;
    let cancelled = false;
    getAgentModels({ teamId, conversationId }, accessToken)
      .then((res) => { if (!cancelled) setData(res); })
      .catch(() => { if (!cancelled) setData(null); });
    return () => { cancelled = true; };
  }, [teamId, conversationId, accessToken]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const locked = data?.conversation?.locked ?? false;
  const models = data?.models ?? [];

  // Effective selection: explicit value → conversation pin → default → first allowed.
  const selectedId = useMemo(() => {
    if (value) return value;
    if (data?.conversation?.model) return data.conversation.model;
    if (data?.defaultModel) return data.defaultModel;
    return models.find((m) => m.allowed)?.id ?? null;
  }, [value, data, models]);

  const selected = models.find((m) => m.id === selectedId) ?? null;

  if (!data || models.length === 0) return null;

  const pick = (m: AgentModelOption) => {
    if (!m.allowed || locked) return;
    onChange(m.id);
    setOpen(false);
  };

  const triggerLabel = selected?.label ?? t("agent.model.select");
  const isFull = variant === "full";

  return (
    <div ref={wrapRef} className={`relative ${isFull ? "w-full" : ""} ${className}`}>
      <button
        type="button"
        onClick={() => !locked && setOpen((o) => !o)}
        disabled={locked}
        title={locked ? t("agent.model.locked") : t("agent.model.select")}
        className={
          isFull
            ? "flex w-full items-center justify-between gap-2 rounded-lg border border-input bg-background px-3 h-9 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors"
            : "flex items-center gap-1 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 px-2 h-7 text-[11px] font-medium text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        }
      >
        {locked ? <Lock className={isFull ? "h-3.5 w-3.5 shrink-0" : "h-3 w-3 shrink-0"} /> : <Sparkles className={isFull ? "h-3.5 w-3.5 shrink-0 text-violet-500" : "h-3 w-3 shrink-0 text-violet-500"} />}
        <span className="truncate">{triggerLabel}</span>
        <ChevronDown className={isFull ? "h-4 w-4 shrink-0 text-muted-foreground" : "h-3 w-3 shrink-0 text-neutral-400"} />
      </button>

      {locked && (
        <p className={isFull ? "mt-1 text-xs text-muted-foreground" : "sr-only"}>{t("agent.model.locked")}</p>
      )}

      {open && !locked && (
        <div
          className={`absolute z-50 ${isFull ? "left-0 right-0 mt-1" : "right-0 bottom-full mb-1 w-64"} rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-lg p-1 max-h-72 overflow-y-auto`}
        >
          {models.map((m) => {
            const isSelected = m.id === selectedId;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => pick(m)}
                disabled={!m.allowed}
                className={`w-full text-left rounded-lg px-2.5 py-2 transition-colors ${
                  m.allowed
                    ? "hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer"
                    : "opacity-70 cursor-not-allowed"
                } ${isSelected ? "bg-violet-50 dark:bg-violet-900/20" : ""}`}
              >
                <div className="flex items-center gap-1.5">
                  {!m.allowed && <Lock className="h-3 w-3 shrink-0 text-amber-500" />}
                  <span className="text-xs font-semibold text-neutral-800 dark:text-neutral-200 truncate">{m.label}</span>
                  {isSelected && m.allowed && <Check className="h-3 w-3 ml-auto shrink-0 text-violet-500" />}
                </div>
                {m.description && (
                  <p className="text-[10px] text-neutral-400 mt-0.5 leading-snug">{m.description}</p>
                )}
                {!m.allowed && (
                  <Link
                    href={UPGRADE_HREF}
                    onClick={(e) => e.stopPropagation()}
                    className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold text-violet-600 dark:text-violet-400 hover:underline"
                  >
                    <Sparkles className="h-2.5 w-2.5" />
                    {t("agent.model.upgrade")}
                  </Link>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
