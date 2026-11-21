"use client";

import { useEffect, useId, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { registerPopup } from "@/lib/query-flow/escape";
import { cn } from "@/lib/utils";

export const inputCls =
  "h-8 w-full min-w-0 rounded-md border border-border bg-background px-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary";

export function FieldLabel({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1 block text-[11px] font-semibold text-muted-foreground">
      {children}
    </label>
  );
}

export function TextInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input type="text" spellCheck={false} autoComplete="off" {...props} className={cn(inputCls, className)} />;
}

export function SelectInput({
  value,
  onChange,
  options,
  ariaLabel,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string; disabled?: boolean }>;
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <select
      value={value}
      aria-label={ariaLabel}
      onChange={(e) => onChange(e.target.value)}
      className={cn(inputCls, "pr-1", className)}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value} disabled={o.disabled}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** Free text with the known column names as suggestions (a column can also be typed: [Name], a function call...). */
export function ColumnInput({
  value,
  onChange,
  columns,
  placeholder,
  ariaLabel,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  columns: string[];
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
}) {
  const id = useId();
  return (
    <>
      <input
        type="text"
        list={columns.length > 0 ? id : undefined}
        value={value}
        placeholder={placeholder}
        aria-label={ariaLabel}
        spellCheck={false}
        autoComplete="off"
        onChange={(e) => onChange(e.target.value)}
        className={cn(inputCls, className)}
      />
      {columns.length > 0 ? (
        <datalist id={id}>
          {columns.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      ) : null}
    </>
  );
}

export function IconButton({
  label,
  children,
  danger,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; danger?: boolean }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      {...props}
      className={cn(
        "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-transparent text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40",
        danger && "hover:bg-destructive/10 hover:text-destructive",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function SmallButton({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        "inline-flex h-7 items-center gap-1 rounded-md border border-border bg-card px-2 text-[11px] font-medium text-foreground transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-40",
        className,
      )}
    />
  );
}

export interface MenuItem {
  key: string;
  label: string;
  onSelect?: () => void;
  disabled?: boolean;
  /** Tooltip (also explains why an item is disabled). */
  hint?: string;
  separator?: boolean;
  heading?: boolean;
}

/** A menu floating at a screen position; closes on outside click, Escape and after a choice. */
export function FloatingMenu({ x, y, items, onClose }: { x: number; y: number; items: MenuItem[]; onClose: () => void }) {
  const ref = useRef<HTMLUListElement>(null);
  useEffect(() => registerPopup(), []);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDown, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);
  if (typeof document === "undefined") return null;
  const left = Math.max(8, Math.min(x, window.innerWidth - 232));
  const top = Math.max(8, Math.min(y, window.innerHeight - 24 - Math.min(items.length * 30, 360)));
  return createPortal(
    <ul
      ref={ref}
      role="menu"
      style={{ position: "fixed", left, top, zIndex: 2000, maxHeight: 360 }}
      className="w-56 overflow-y-auto rounded-lg border border-border bg-popover p-1 text-xs text-popover-foreground shadow-xl"
    >
      {items.map((item) =>
        item.separator ? (
          <li key={item.key} role="separator" className="my-1 h-px bg-border" />
        ) : item.heading ? (
          <li key={item.key} className="px-2 pb-0.5 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {item.label}
          </li>
        ) : (
          <li key={item.key} role="none">
            <button
              type="button"
              role="menuitem"
              disabled={item.disabled}
              title={item.hint}
              onClick={() => {
                onClose();
                item.onSelect?.();
              }}
              className="flex w-full items-center rounded-md px-2 py-1.5 text-left text-foreground hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:text-muted-foreground disabled:opacity-60 disabled:hover:bg-transparent"
            >
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
            </button>
          </li>
        ),
      )}
    </ul>,
    document.body,
  );
}
