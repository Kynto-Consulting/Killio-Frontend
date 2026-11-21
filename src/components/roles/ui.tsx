"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

import { useTranslations } from "@/components/providers/i18n-provider";
import { getUserAvatarUrl } from "@/lib/gravatar";
import { ROLE_COLOR_PRESETS, isHexColor, triStateVisual, type TriState } from "@/lib/roles/model";

export const cx = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(" ");

/** Sober Corporate Memphis: hard soft-line border and a small offset shadow, both from theme tokens. */
export const card = "rounded-xl border border-[var(--memphis-line)] bg-card shadow-[2px_2px_0_var(--memphis-shadow)]";
export const inputCls =
  "h-9 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60";
export const btn =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-[var(--memphis-line)] bg-card px-3 text-xs font-semibold text-foreground transition-colors hover:bg-accent/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";
export const btnPrimary =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-[var(--memphis-line)] bg-primary px-3 text-xs font-bold text-primary-foreground shadow-[2px_2px_0_var(--memphis-shadow)] transition-transform hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none motion-reduce:transition-none motion-reduce:hover:translate-y-0";
export const btnDanger =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-red-500/60 bg-red-500/10 px-3 text-xs font-bold text-red-700 transition-colors hover:bg-red-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:cursor-not-allowed disabled:opacity-50 dark:text-red-300";

export function RoleChip({ name, color, onRemove, removeLabel, title, muted }: { name: string; color: string | null; onRemove?: () => void; removeLabel?: string; title?: string; muted?: boolean }) {
  return (
    <span
      title={title}
      className={cx("inline-flex max-w-full items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold text-foreground", muted ? "border-dashed border-border opacity-80" : "border-[var(--memphis-line)]")}
    >
      <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full border border-black/20" style={{ background: color ?? "hsl(var(--muted-foreground))" }} />
      <span className="truncate">{name}</span>
      {onRemove && (
        <button type="button" onClick={onRemove} aria-label={removeLabel} className="-mr-1 rounded-full p-0.5 text-muted-foreground hover:bg-accent/20 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <X className="h-3 w-3" />
        </button>
      )}
    </span>
  );
}

export function Avatar({ name, email, url, size = 32 }: { name: string; email?: string; url?: string | null; size?: number }) {
  return (
    <span className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-muted text-[11px] font-bold text-foreground" style={{ width: size, height: size }}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={getUserAvatarUrl(url, email ?? "", size * 2)} alt="" className="h-full w-full object-cover" />
      ) : (
        (name || "?").slice(0, 1).toUpperCase()
      )}
    </span>
  );
}

/** ✓ allow / – inherit / ✗ deny. A radio group: arrow keys move, each option has a text label for screen readers. */
export function TriStateControl({ value, onChange, disabled, label, reason }: { value: TriState; onChange: (v: TriState) => void; disabled?: boolean; label: string; reason?: string | null }) {
  const t = useTranslations("roles");
  const opts: TriState[] = ["allow", "inherit", "deny"];
  const tone = (s: TriState, active: boolean) => {
    if (!active) return "text-muted-foreground hover:bg-accent/10";
    if (s === "allow") return "bg-emerald-500/20 text-emerald-800 dark:text-emerald-300";
    if (s === "deny") return "bg-red-500/20 text-red-800 dark:text-red-300";
    return "bg-muted text-foreground";
  };
  return (
    <div
      role="radiogroup"
      aria-label={label}
      aria-disabled={disabled || undefined}
      title={reason ?? undefined}
      className={cx("inline-flex shrink-0 overflow-hidden rounded-lg border border-[var(--memphis-line)]", disabled && "opacity-50")}
    >
      {opts.map((s) => {
        const v = triStateVisual(s);
        const active = value === s;
        return (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={t(`tri.${v.labelKey}`)}
            title={t(`tri.${v.labelKey}Hint`)}
            tabIndex={active ? 0 : -1}
            disabled={disabled}
            onClick={() => onChange(s)}
            onKeyDown={(e) => {
              const i = opts.indexOf(value);
              if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                e.preventDefault();
                onChange(opts[Math.min(opts.length - 1, i + 1)]);
              } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                e.preventDefault();
                onChange(opts[Math.max(0, i - 1)]);
              }
            }}
            className={cx("flex h-7 w-8 items-center justify-center text-sm font-bold transition-colors focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed motion-reduce:transition-none", tone(s, active), s !== "allow" && "border-l border-[var(--memphis-line)]")}
          >
            {v.glyph}
          </button>
        );
      })}
    </div>
  );
}

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx("relative h-5 w-9 shrink-0 rounded-full border border-[var(--memphis-line)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 motion-reduce:transition-none", checked ? "bg-emerald-500/60" : "bg-muted")}
    >
      <span className={cx("absolute top-0.5 h-3.5 w-3.5 rounded-full bg-foreground transition-all motion-reduce:transition-none", checked ? "left-[18px]" : "left-0.5")} />
    </button>
  );
}

export function ColorField({ value, onChange, label, disabled }: { value: string | null; onChange: (v: string | null) => void; label: string; disabled?: boolean }) {
  const t = useTranslations("roles");
  const id = useId();
  return (
    <div>
      <span id={id} className="mb-1 block text-xs font-semibold text-foreground">{label}</span>
      <div role="group" aria-labelledby={id} className="flex flex-wrap items-center gap-1.5">
        <button type="button" disabled={disabled} onClick={() => onChange(null)} aria-label={t("color.none")} title={t("color.none")} className={cx("flex h-6 w-6 items-center justify-center rounded-full border text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", value === null ? "border-foreground ring-2 ring-ring" : "border-border")}>
          <X className="h-3 w-3" />
        </button>
        {ROLE_COLOR_PRESETS.map((c) => (
          <button key={c} type="button" disabled={disabled} aria-label={c} aria-pressed={value?.toLowerCase() === c.toLowerCase()} onClick={() => onChange(c)} className={cx("h-6 w-6 rounded-full border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", value?.toLowerCase() === c.toLowerCase() ? "border-foreground ring-2 ring-ring" : "border-border")} style={{ background: c }} />
        ))}
        <label className="ml-1 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
          <input type="color" disabled={disabled} value={isHexColor(value) ? value : "#2F6FED"} onChange={(e) => onChange(e.target.value.toUpperCase())} aria-label={t("color.custom")} className="h-6 w-8 cursor-pointer rounded border border-border bg-transparent p-0" />
          {t("color.custom")}
        </label>
      </div>
    </div>
  );
}

/** Accessible modal: Esc closes, focus moves in and returns to the opener, Tab stays inside. */
export function Dialog({ title, onClose, children, footer, busy, wide }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; busy?: boolean; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>("[data-autofocus], input, select, textarea, button:not([data-close])");
    first?.focus();
    return () => opener?.focus?.();
  }, []);
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape" && !busy) {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== "Tab" || !ref.current) return;
    const items = Array.from(ref.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])"));
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };
  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-background/80 p-0 backdrop-blur-sm sm:items-center sm:p-4" onKeyDown={onKeyDown}>
      <div className="fixed inset-0" aria-hidden onClick={() => !busy && onClose()} />
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} className={cx(card, "relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-b-none sm:rounded-b-xl", wide ? "sm:max-w-2xl" : "sm:max-w-md")}>
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <h2 id={titleId} className="min-w-0 truncate text-sm font-bold text-foreground">{title}</h2>
          <button type="button" data-close disabled={busy} onClick={onClose} aria-label="Close" className="rounded-md p-1 text-muted-foreground hover:bg-accent/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-3 overflow-y-auto px-4 py-3">{children}</div>
        {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-4 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export interface TabDef {
  id: string;
  label: string;
  icon?: ReactNode;
  badge?: string | number | null;
}

/** Top tab bar. Scrolls sideways on narrow screens (the bar, not the page); arrow keys / Home / End move between tabs. */
export function TabBar({ tabs, active, onChange, label, idPrefix = "settings" }: { tabs: TabDef[]; active: string; onChange: (id: string) => void; label: string; idPrefix?: string }) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  useEffect(() => {
    refs.current[active]?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [active]);
  const focusTab = (id: string) => {
    onChange(id);
    refs.current[id]?.focus();
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    const i = tabs.findIndex((t) => t.id === active);
    if (e.key === "ArrowRight") focusTab(tabs[(i + 1) % tabs.length].id);
    else if (e.key === "ArrowLeft") focusTab(tabs[(i - 1 + tabs.length) % tabs.length].id);
    else if (e.key === "Home") focusTab(tabs[0].id);
    else if (e.key === "End") focusTab(tabs[tabs.length - 1].id);
    else return;
    e.preventDefault();
  };
  return (
    <div role="tablist" aria-label={label} onKeyDown={onKeyDown} className="-mx-1 flex max-w-full shrink-0 gap-1 overflow-x-auto overflow-y-hidden border-b border-border px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {tabs.map((tab) => {
        const on = tab.id === active;
        return (
          <button
            key={tab.id}
            ref={(el) => {
              refs.current[tab.id] = el;
            }}
            id={`${idPrefix}-tab-${tab.id}`}
            role="tab"
            type="button"
            aria-selected={on}
            aria-controls={`${idPrefix}-panel-${tab.id}`}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(tab.id)}
            className={cx("-mb-px flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none", on ? "border-[var(--memphis-line)] text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}
          >
            {tab.icon}
            {tab.label}
            {tab.badge != null && tab.badge !== "" && <span className="rounded-full border border-border bg-muted px-1.5 text-[10px] font-bold">{tab.badge}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function EmptyState({ title, body, icon }: { title: string; body?: string; icon?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-border px-6 py-8 text-center">
      {icon && <div className="mx-auto mb-2 flex justify-center text-muted-foreground">{icon}</div>}
      <div className="text-sm font-semibold text-foreground">{title}</div>
      {body && <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">{body}</p>}
    </div>
  );
}

/** Shown when the roles API is unreachable (older server): says so instead of showing an empty editor. */
export function ApiNotice({ message }: { message: string }) {
  const t = useTranslations("roles");
  return (
    <div role="status" className="rounded-xl border border-amber-500/50 bg-amber-500/10 px-4 py-3 text-xs text-foreground">
      <strong className="font-bold">{t("apiUnavailable.title")}</strong> {t("apiUnavailable.body")}
      <span className="mt-1 block text-[11px] text-muted-foreground">{message}</span>
    </div>
  );
}

export function formatDate(iso: string | null | undefined, locale?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString(locale, { year: "numeric", month: "short", day: "numeric" });
}
