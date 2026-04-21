"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { X, AlertTriangle } from "lucide-react";

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  description?: string;
  /** If set, user must type this string to enable the confirm button */
  confirmText?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "warning" | "default";
  children?: React.ReactNode;
}

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmText,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  variant = "default",
  children,
}: ConfirmDialogProps) {
  const [typed, setTyped] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTyped("");
      setIsLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const canConfirm = confirmText ? typed === confirmText : true;

  const handleConfirm = useCallback(async () => {
    if (!canConfirm || isLoading) return;
    setIsLoading(true);
    try {
      await onConfirm();
      onClose();
    } catch {
      // keep dialog open on error
    } finally {
      setIsLoading(false);
    }
  }, [canConfirm, isLoading, onConfirm, onClose]);

  if (!isOpen) return null;

  const variantStyles = {
    danger: {
      icon: "text-destructive bg-destructive/10",
      button: "bg-destructive hover:bg-destructive/90 text-destructive-foreground",
    },
    warning: {
      icon: "text-amber-500 bg-amber-500/10",
      button: "bg-amber-500 hover:bg-amber-600 text-white",
    },
    default: {
      icon: "text-primary bg-primary/10",
      button: "bg-primary hover:bg-primary/90 text-primary-foreground",
    },
  }[variant];

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      {/* backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* dialog */}
      <div className="relative mx-4 w-full max-w-md rounded-xl border border-border bg-card shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-start gap-4 p-6 pb-2">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${variantStyles.icon}`}>
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold text-foreground">{title}</h3>
            {description && <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{description}</p>}
          </div>
          <button onClick={onClose} className="shrink-0 p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {children && <div className="px-6 py-2">{children}</div>}

        {confirmText && (
          <div className="px-6 py-2">
            <label className="block text-sm text-muted-foreground mb-1.5">
              Escribe <strong className="text-foreground">{confirmText}</strong> para confirmar:
            </label>
            <input
              ref={inputRef}
              type="text"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleConfirm()}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
              placeholder={confirmText}
            />
          </div>
        )}

        <div className="flex items-center justify-end gap-2 p-6 pt-4">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="inline-flex items-center justify-center rounded-md text-sm font-medium h-9 px-4 border border-border bg-background hover:bg-muted transition-colors disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            onClick={handleConfirm}
            disabled={!canConfirm || isLoading}
            className={`inline-flex items-center justify-center rounded-md text-sm font-medium h-9 px-4 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${variantStyles.button}`}
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <span className="h-3.5 w-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                Procesando...
              </span>
            ) : (
              confirmLabel
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
