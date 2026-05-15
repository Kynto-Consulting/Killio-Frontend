"use client";

import { useRef, useEffect } from "react";
import { X, Loader2, FileText } from "lucide-react";
import { useTranslations } from "@/components/providers/i18n-provider";
import { useForm } from "@/hooks/ui";

interface CreateDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (title: string) => Promise<void> | void;
}

export function CreateDocumentModal({ isOpen, onClose, onSubmit }: CreateDocumentModalProps) {
  const t = useTranslations("documents");
  const tCommon = useTranslations("common");
  const inputRef = useRef<HTMLInputElement>(null);

  const form = useForm({
    fields: {
      title: { type: "text", transform: "trim", constraints: { required: true, minLength: 1 } },
    },
    submit: async ({ values, reset }) => {
      await onSubmit(values.title);
      reset();
      onClose();
    },
  });

  useEffect(() => {
    if (!isOpen) return;
    form.reset();
    const id = setTimeout(() => inputRef.current?.focus(), 100);
    return () => clearTimeout(id);
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl animate-in zoom-in-95 duration-200">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 z-10 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none"
        >
          <X className="h-5 w-5" />
          <span className="sr-only">{tCommon?.("actions.close") || "Cerrar"}</span>
        </button>

        <div className="mb-6 flex flex-col items-center justify-center gap-3">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <FileText className="h-6 w-6 text-primary" />
          </div>
          <h2 className="text-xl font-semibold">{t("newDocument")}</h2>
          <p className="text-sm text-muted-foreground text-center">
            {t("createPrompt")}
          </p>
        </div>

        <form onSubmit={form.submit} className="space-y-6">
          <div className="space-y-2">
            <input
              ref={inputRef}
              {...form.fields.title.inputProps}
              placeholder="Ej: Reporte Técnico, Notas de la Reunión..."
              disabled={form.isSubmitting}
              className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            />
            {(form.fields.title.error || form.formError) && (
              <p className="text-sm text-destructive font-medium">{form.fields.title.error || form.formError}</p>
            )}
          </div>

          <div className="flex w-full items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={form.isSubmitting}
              className="h-10 px-4 py-2 rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground text-sm font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!form.fields.title.inputProps.value?.toString().trim() || form.isSubmitting}
              className="h-10 px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-medium flex items-center justify-center transition-colors disabled:opacity-50"
            >
              {form.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("newDocument")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
