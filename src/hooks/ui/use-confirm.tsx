"use client";

import { useState, useCallback, useRef, type FC } from "react";
import { Loader2, AlertTriangle, AlertCircle, Info } from "lucide-react";
import type { ConfirmOptions, ConfirmReturn, ConfirmVariant } from "./dsl.types";

// ─── Internal state ───────────────────────────────────────────────────────────

interface ConfirmState {
  isOpen: boolean;
  opts: ConfirmOptions | null;
  resolve: ((ok: boolean) => void) | null;
  typingValue: string;
  isRunning: boolean;
  error: string | null;
}

const INITIAL_STATE: ConfirmState = {
  isOpen: false,
  opts: null,
  resolve: null,
  typingValue: "",
  isRunning: false,
  error: null,
};

// ─── Variant styling ──────────────────────────────────────────────────────────

const VARIANT_STYLES: Record<
  ConfirmVariant,
  { btn: string; icon: FC<{ className?: string }> | null; iconClass: string }
> = {
  default: {
    btn: "bg-primary text-primary-foreground hover:bg-primary/90",
    icon: Info,
    iconClass: "text-primary",
  },
  destructive: {
    btn: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
    icon: AlertCircle,
    iconClass: "text-destructive",
  },
  warning: {
    btn: "bg-amber-500 text-white hover:bg-amber-600",
    icon: AlertTriangle,
    iconClass: "text-amber-500",
  },
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * useConfirm — imperative confirmation dialog.
 *
 * Returns a promise-based `ask()` function and a `ConfirmDialog` component
 * that must be rendered once anywhere in the component tree.
 *
 * @example
 * const { ask, ConfirmDialog } = useConfirm()
 *
 * const handleDelete = async () => {
 *   const ok = await ask({
 *     title: 'Delete board?',
 *     description: 'This action cannot be undone.',
 *     confirmLabel: 'Delete',
 *     variant: 'destructive',
 *   })
 *   if (ok) await deleteBoard(id)
 * }
 *
 * return <>
 *   <button onClick={handleDelete}>Delete</button>
 *   <ConfirmDialog />
 * </>
 */
export function useConfirm(): ConfirmReturn {
  const [state, setState] = useState<ConfirmState>(INITIAL_STATE);
  // Keep latest state accessible in callbacks without stale closures
  const stateRef = useRef(state);
  stateRef.current = state;

  // ── ask ──────────────────────────────────────────────────────────────────

  const ask = useCallback((opts: ConfirmOptions): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      setState({
        isOpen: true,
        opts,
        resolve,
        typingValue: "",
        isRunning: false,
        error: null,
      });
    });
  }, []);

  // ── Confirm ──────────────────────────────────────────────────────────────

  const handleConfirm = useCallback(async () => {
    const s = stateRef.current;
    if (!s.opts || !s.resolve) return;

    // requireTyping check
    if (
      s.opts.requireTyping &&
      s.typingValue !== s.opts.requireTyping
    ) {
      return;
    }

    setState((prev) => ({ ...prev, isRunning: true, error: null }));

    try {
      if (s.opts.onConfirm) await s.opts.onConfirm();
      s.resolve(true);
      setState(INITIAL_STATE);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setState((prev) => ({ ...prev, isRunning: false, error: msg }));
    }
  }, []);

  // ── Cancel ───────────────────────────────────────────────────────────────

  const handleCancel = useCallback(() => {
    stateRef.current.resolve?.(false);
    setState(INITIAL_STATE);
  }, []);

  // ── ESC on the document (when dialog is open) ────────────────────────────

  // (handled inline in the dialog via onKeyDown on the overlay)

  // ── Dialog component ─────────────────────────────────────────────────────

  const ConfirmDialog: FC = useCallback(() => {
    const s = stateRef.current;
    if (!s.isOpen || !s.opts) return null;

    const {
      title,
      description,
      confirmLabel = "Confirm",
      cancelLabel = "Cancel",
      variant = "default",
      requireTyping,
    } = s.opts;

    const { btn, icon: Icon, iconClass } = VARIANT_STYLES[variant];

    const typingOk = !requireTyping || s.typingValue === requireTyping;
    const confirmDisabled = s.isRunning || !typingOk;

    return (
      <div
        className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="killio-confirm-title"
        onKeyDown={(e) => {
          if (e.key === "Escape" && !s.isRunning) handleCancel();
        }}
        tabIndex={-1}
      >
        {/* Backdrop */}
        <div
          className="fixed inset-0"
          onClick={() => !s.isRunning && handleCancel()}
          aria-hidden="true"
        />

        {/* Panel */}
        <div className="relative bg-card border border-border rounded-xl shadow-xl w-full max-w-sm p-6 animate-in fade-in zoom-in-95 duration-150">
          {/* Header */}
          <div className="flex items-start gap-3 mb-3">
            {Icon && (
              <Icon className={`h-5 w-5 mt-0.5 shrink-0 ${iconClass}`} />
            )}
            <div className="flex-1">
              <h2
                id="killio-confirm-title"
                className="text-base font-semibold text-foreground leading-snug"
              >
                {title}
              </h2>
              {description && (
                <p className="mt-1 text-sm text-muted-foreground">
                  {description}
                </p>
              )}
            </div>
          </div>

          {/* requireTyping input */}
          {requireTyping && (
            <div className="mb-4">
              <p className="text-xs text-muted-foreground mb-1.5">
                Type{" "}
                <span className="font-mono font-semibold text-foreground">
                  {requireTyping}
                </span>{" "}
                to confirm.
              </p>
              <input
                type="text"
                autoFocus
                className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
                value={s.typingValue}
                onChange={(e) =>
                  setState((prev) => ({
                    ...prev,
                    typingValue: e.target.value,
                  }))
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !confirmDisabled) handleConfirm();
                }}
                placeholder={requireTyping}
              />
            </div>
          )}

          {/* Error */}
          {s.error && (
            <p className="mb-3 text-sm text-destructive">{s.error}</p>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 mt-4">
            <button
              type="button"
              onClick={handleCancel}
              disabled={s.isRunning}
              className="px-4 py-2 text-sm font-medium rounded-md hover:bg-accent/10 transition-colors disabled:opacity-50"
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={confirmDisabled}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors disabled:opacity-50 flex items-center gap-1.5 ${btn}`}
            >
              {s.isRunning && (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              )}
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    );
  // The component uses stateRef, so it always sees latest state
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handleConfirm, handleCancel]) as FC;

  return { ask, ConfirmDialog };
}
