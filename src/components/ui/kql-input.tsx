"use client";

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Info } from "lucide-react";

import { useTranslations } from "@/components/providers/i18n-provider";
import { applySuggestion, findHints, suggest, type Hint, type KqlSchema, type Suggestion, type SuggestionKind } from "@/lib/query/kql-complete";

interface KqlInputProps {
  value: string;
  onChange: (value: string) => void;
  /** What can be completed (tags, lists, people, columns...). See `buildKqlSchema`. */
  schema: KqlSchema;
  /** The parser's error for `value`, if any: it is used to suggest the right name for an unknown field. */
  error?: { message: string; position: number } | null;
  multiline?: boolean;
  rows?: number;
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
  autoFocus?: boolean;
  /** Enter in a single-line input (when no suggestion is open). */
  onSubmit?: () => void;
}

const KIND_BADGE: Record<SuggestionKind, { letter: string; cls: string }> = {
  field: { letter: "f", cls: "bg-sky-500/15 text-sky-700 dark:text-sky-300" },
  flag: { letter: "⚑", cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
  function: { letter: "ƒ", cls: "bg-violet-500/15 text-violet-700 dark:text-violet-300" },
  keyword: { letter: "k", cls: "bg-muted text-muted-foreground" },
  operator: { letter: "=", cls: "bg-muted text-muted-foreground" },
  value: { letter: "v", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  date: { letter: "d", cls: "bg-rose-500/15 text-rose-700 dark:text-rose-300" },
  table: { letter: "t", cls: "bg-teal-500/15 text-teal-700 dark:text-teal-300" },
  source: { letter: "s", cls: "bg-teal-500/15 text-teal-700 dark:text-teal-300" },
};

/**
 * Text box for KQL with completion and hints: suggestions come from the language (fields, flags, functions, keywords)
 * and from the data (tags, lists, people, columns). Tab / Enter accept the highlighted one, arrows move, Esc closes,
 * Ctrl+Space opens. Typos and values that match nothing are pointed out under the box, with a one-click fix.
 */
export function KqlInput({ value, onChange, schema, error, multiline = false, rows = 4, placeholder, className = "", ariaLabel, autoFocus, onSubmit }: KqlInputProps) {
  const t = useTranslations("kql");
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const listId = useId();
  const [caret, setCaret] = useState(value.length);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const pendingCaret = useRef<number | null>(null);
  const [popStyle, setPopStyle] = useState<CSSProperties | null>(null);

  const completion = useMemo(() => suggest(value, Math.min(caret, value.length), schema), [value, caret, schema]);
  const items = completion.items;
  const showList = open && items.length > 0;
  const hints = useMemo<Hint[]>(() => (value.trim() ? findHints(value, schema, error ?? null) : []), [value, schema, error]);

  // Position of the list: under the box, or above it when the space below is short. Fixed + portal, so a modal's footer
  // or an overflow-hidden card never covers it.
  useLayoutEffect(() => {
    if (!showList || !ref.current) { setPopStyle(null); return; }
    const place = () => {
      const r = ref.current!.getBoundingClientRect();
      const below = window.innerHeight - r.bottom;
      const above = r.top;
      const openUp = below < 220 && above > below;
      setPopStyle({
        position: "fixed",
        left: r.left,
        width: r.width,
        zIndex: 1000,
        maxHeight: Math.max(120, Math.min(260, (openUp ? above : below) - 12)),
        ...(openUp ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }),
      });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [showList, value]);

  useEffect(() => setActive(0), [value, caret]);
  // keep the highlighted option visible while moving with the arrows
  useEffect(() => {
    if (!showList) return;
    document.getElementById(listId)?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [active, showList, listId]);
  useEffect(() => {
    if (pendingCaret.current !== null && ref.current) {
      const pos = pendingCaret.current;
      pendingCaret.current = null;
      ref.current.setSelectionRange(pos, pos);
      setCaret(pos);
    }
  }, [value]);

  const apply = (item: Suggestion) => {
    const r = applySuggestion(value, completion, item);
    pendingCaret.current = r.caret;
    onChange(r.text);
    setOpen(item.insert.endsWith("(") || item.kind === "operator" || item.kind === "keyword");
    ref.current?.focus();
  };

  const applyHint = (hint: Hint) => {
    if (!hint.fix) return;
    const next = value.slice(0, hint.fix.from) + hint.fix.replacement + value.slice(hint.fix.to);
    pendingCaret.current = hint.fix.from + hint.fix.replacement.length;
    onChange(next);
    ref.current?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (e.key === " " && e.ctrlKey) {
      e.preventDefault();
      setOpen(true);
      return;
    }
    if (showList) {
      if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => (i + 1) % items.length); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => (i - 1 + items.length) % items.length); return; }
      if (e.key === "Tab" || e.key === "Enter") { e.preventDefault(); apply(items[Math.min(active, items.length - 1)]); return; }
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setOpen(false); return; }
    }
    if (e.key === "Enter" && !multiline && onSubmit) { e.preventDefault(); onSubmit(); }
  };

  const fieldCls = `w-full rounded-md border bg-background px-2.5 font-mono text-sm text-foreground placeholder:text-muted-foreground ${error ? "border-red-500" : "border-border"} ${multiline ? "py-2" : "h-9"} ${className}`;
  const common = {
    ref,
    value,
    placeholder,
    autoFocus,
    spellCheck: false,
    autoComplete: "off",
    "aria-label": ariaLabel,
    "aria-autocomplete": "list" as const,
    "aria-expanded": showList,
    "aria-controls": showList ? listId : undefined,
    "aria-invalid": !!error,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      onChange(e.target.value);
      setCaret(e.target.selectionStart ?? e.target.value.length);
      setOpen(true);
    },
    onKeyDown,
    onKeyUp: (e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) setCaret(e.currentTarget.selectionStart ?? 0);
    },
    onClick: (e: React.MouseEvent<HTMLInputElement | HTMLTextAreaElement>) => setCaret(e.currentTarget.selectionStart ?? 0),
    onBlur: () => window.setTimeout(() => setOpen(false), 120),
  };

  return (
    <div className="relative">
      {multiline ? <textarea {...common} rows={rows} className={`${fieldCls} resize-y`} /> : <input {...common} type="text" className={fieldCls} />}

      {showList && popStyle && typeof document !== "undefined" ? createPortal(
        <ul id={listId} role="listbox" style={popStyle} className="overflow-y-auto rounded-lg border border-border bg-popover p-1 text-sm shadow-xl">
          {items.map((item, i) => {
            const badge = KIND_BADGE[item.kind];
            return (
              <li
                key={`${item.kind}:${item.insert}`}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => { e.preventDefault(); apply(item); }}
                onMouseEnter={() => setActive(i)}
                className={`flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 ${i === active ? "bg-accent text-accent-foreground" : "text-foreground"}`}
              >
                <span className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] font-semibold ${badge.cls}`}>{badge.letter}</span>
                <span className="min-w-0 flex-1 truncate font-mono text-[13px]">{item.label}</span>
                {item.detail ? <span className="shrink-0 text-[11px] text-muted-foreground">{item.detail}</span> : null}
              </li>
            );
          })}
          <li className="sticky bottom-0 bg-popover px-2 pt-1 text-[10px] text-muted-foreground" aria-hidden>{t("input.accept")}</li>
        </ul>,
        document.body,
      ) : null}

      {hints.length > 0 ? (
        <ul className="mt-1.5 space-y-1">
          {hints.map((h, i) => (
            <li key={i} className={`flex items-start gap-1.5 text-xs ${h.level === "warn" ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground"}`}>
              {h.level === "warn" ? <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /> : <Info className="mt-0.5 h-3 w-3 shrink-0" />}
              <span className="min-w-0 flex-1">{h.message}</span>
              {h.fix ? (
                <button type="button" onClick={() => applyHint(h)} className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[11px] font-medium text-foreground hover:bg-muted">
                  {t("input.fix", { value: h.fix.label })}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
