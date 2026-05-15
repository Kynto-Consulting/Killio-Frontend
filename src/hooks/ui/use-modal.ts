"use client";

import {
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type MouseEvent,
} from "react";
import type { ModalSchema, ModalReturn, ModalSize } from "./dsl.types";

// ─── Size → max-width mapping (Tailwind class) ────────────────────────────────

export const MODAL_SIZE_CLASS: Record<ModalSize, string> = {
  xs:   "max-w-xs",
  sm:   "max-w-sm",
  md:   "max-w-md",
  lg:   "max-w-lg",
  xl:   "max-w-2xl",
  full: "max-w-full",
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * useModal — lifecycle state machine for any modal or dialog.
 *
 * The hook manages open/close, data payload, async confirm action,
 * ESC + backdrop dismissal, and onOpen/onClose callbacks.
 * It is intentionally UI-agnostic — wire the returned state to whatever
 * overlay markup you prefer.
 *
 * @example
 * const modal = useModal({
 *   title: (data) => `Edit "${data.name}"`,
 *   size: 'md',
 *   confirm: {
 *     label: 'Save',
 *     action: async (data, close) => {
 *       await updateBoard(data.id, formValues)
 *       close()
 *     }
 *   }
 * })
 *
 * // Open with a payload:
 * modal.open({ id: board.id, name: board.name })
 *
 * // In JSX:
 * {modal.isOpen && (
 *   <div className="fixed inset-0 z-50 ..." {...modal.overlayProps}>
 *     <div className={`... ${MODAL_SIZE_CLASS[modal.size]} ...`}>
 *       <h2>{modal.title}</h2>
 *       <button onClick={modal.confirm} disabled={modal.isSubmitting}>Save</button>
 *       <button onClick={modal.close}>Cancel</button>
 *     </div>
 *   </div>
 * )}
 */
export function useModal<TData = void>(
  schema: ModalSchema<TData>
): ModalReturn<TData> & { size: ModalSize } {
  const [isOpen, setIsOpen] = useState(false);
  const [data, setData] = useState<TData | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const schemaRef = useRef(schema);
  schemaRef.current = schema;

  const closeable = schema.closeable !== false;
  const closeOnBackdrop = schema.closeOnBackdrop !== false;
  const closeOnEsc = schema.closeOnEsc !== false;
  const size = schema.size ?? "md";

  // ── Close ────────────────────────────────────────────────────────────────

  const close = useCallback(
    (reason: "confirm" | "cancel" | "backdrop" | "esc" | "programmatic" = "programmatic") => {
      if (!closeable && reason !== "programmatic" && reason !== "confirm") return;
      setIsOpen(false);
      setIsSubmitting(false);
      schemaRef.current.onClose?.(reason);
    },
    [closeable]
  );

  // ── Open ─────────────────────────────────────────────────────────────────

  const open = useCallback(
    (payload?: TData) => {
      const d = payload ?? null;
      setData(d as TData | null);
      if (schemaRef.current.resetOnOpen !== false) {
        setError(null);
        setIsSubmitting(false);
      }
      setIsOpen(true);
      // onOpen is called after state settles
      if (schemaRef.current.onOpen) {
        queueMicrotask(() => schemaRef.current.onOpen!(d as TData));
      }
    },
    []
  );

  // ── Confirm action ───────────────────────────────────────────────────────

  const confirm = useCallback(async () => {
    const s = schemaRef.current;
    if (!s.confirm) {
      close("confirm");
      return;
    }
    if (s.confirm.disabled?.(data as TData)) return;

    setIsSubmitting(true);
    setError(null);
    try {
      await s.confirm.action(data as TData, () => close("confirm"));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  }, [data, close]);

  // ── ESC key ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!isOpen || !closeOnEsc) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isSubmitting) close("esc");
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [isOpen, closeOnEsc, isSubmitting, close]);

  // ── Backdrop click ───────────────────────────────────────────────────────

  const overlayProps = useMemo(
    () => ({
      onClick: (e: MouseEvent) => {
        // Only close when clicking the backdrop itself, not children
        if (e.target === e.currentTarget && closeOnBackdrop && !isSubmitting) {
          close("backdrop");
        }
      },
      "aria-hidden": true as const,
    }),
    [closeOnBackdrop, isSubmitting, close]
  );

  // ── Derived title ────────────────────────────────────────────────────────

  const title = useMemo(() => {
    const raw = schemaRef.current.title;
    return typeof raw === "function" ? raw(data as TData) : raw;
  }, [data]);

  const clearError = useCallback(() => setError(null), []);

  return {
    isOpen,
    open,
    close,
    confirm,
    data,
    isSubmitting,
    error,
    clearError,
    title,
    size,
    overlayProps,
  };
}
