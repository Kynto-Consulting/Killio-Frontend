"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { getUserAvatarUrl } from "@/lib/gravatar";

interface ProfileHoverProps {
  name: string;
  email?: string | null;
  avatarUrl?: string | null;
  children: ReactNode;
  className?: string;
}

/** Placeholder addresses (`@pendiente.invalid`, RFC 2606 `.invalid`) are not real mailboxes: never show them as contact data. */
const isRealEmail = (email?: string | null): email is string => !!email && !/\.invalid$/i.test(email.trim());

/**
 * Small profile card that opens when the pointer rests on (or keyboard focus reaches) the wrapped avatar.
 * Rendered in a portal above everything else so tables, modals and sticky headers never cover it.
 */
export function ProfileHover({ name, email, avatarUrl, children, className }: ProfileHoverProps) {
  const anchor = useRef<HTMLSpanElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  const open = useCallback(() => {
    clear();
    timer.current = setTimeout(() => {
      const r = anchor.current?.getBoundingClientRect();
      if (!r) return;
      const width = 256;
      setPos({ left: Math.max(8, Math.min(r.left + r.width / 2 - width / 2, window.innerWidth - width - 8)), top: r.bottom + 8 });
    }, 180);
  }, []);
  const close = useCallback(() => {
    clear();
    timer.current = setTimeout(() => setPos(null), 80);
  }, []);

  useEffect(() => {
    if (!pos) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPos(null);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [pos]);
  useEffect(() => clear, []);

  const showEmail = isRealEmail(email);
  return (
    <span ref={anchor} className={className ?? "inline-flex"} onMouseEnter={open} onMouseLeave={close} onFocus={open} onBlur={close}>
      {children}
      {pos && typeof document !== "undefined"
        ? createPortal(
            <div
              role="tooltip"
              onMouseEnter={() => clear()}
              onMouseLeave={close}
              className="fixed z-[300] flex w-64 items-center gap-3 rounded-xl border border-border bg-card p-3 shadow-xl"
              style={{ left: pos.left, top: pos.top }}
            >
              <img src={getUserAvatarUrl(avatarUrl ?? null, email ?? null, 96)} alt="" className="h-12 w-12 shrink-0 rounded-full border border-border object-cover" />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">{name}</p>
                {showEmail ? <p className="truncate text-xs text-muted-foreground">{email}</p> : null}
              </div>
            </div>,
            document.body,
          )
        : null}
    </span>
  );
}
