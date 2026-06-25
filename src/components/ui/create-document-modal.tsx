"use client";

import { useRef, useEffect, useState } from "react";
import { X, Loader2, FileText, Users, Lock, Check } from "lucide-react";
import { useTranslations } from "@/components/providers/i18n-provider";
import { useForm } from "@/hooks/ui";

type DocVisibility = "team" | "private";

interface CreateDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (title: string, visibility: DocVisibility) => Promise<void> | void;
}

export function CreateDocumentModal({ isOpen, onClose, onSubmit }: CreateDocumentModalProps) {
  const t = useTranslations("documents");
  const tCommon = useTranslations("common");
  const inputRef = useRef<HTMLInputElement>(null);
  const [visibility, setVisibility] = useState<DocVisibility>("team");

  const form = useForm({
    fields: {
      title: { type: "text", transform: "trim", constraints: { required: true, minLength: 1 } },
    },
    submit: async ({ values, reset }) => {
      await onSubmit(values.title, visibility);
      reset();
      onClose();
    },
  });

  useEffect(() => {
    if (!isOpen) return;
    form.reset();
    setVisibility("team");
    const id = setTimeout(() => inputRef.current?.focus(), 100);
    return () => clearTimeout(id);
  }, [isOpen]);

  if (!isOpen) return null;

  const titleValue = form.fields.title.inputProps.value?.toString() ?? "";

  const VisCard = ({ value, icon: Icon, title, hint }: { value: DocVisibility; icon: typeof Users; title: string; hint: string }) => {
    const active = visibility === value;
    return (
      <button
        type="button"
        onClick={() => setVisibility(value)}
        className={`relative flex flex-col gap-1.5 rounded-xl border p-3.5 text-left transition-all ${active ? "border-primary bg-primary/5 ring-1 ring-primary/30" : "border-border hover:border-border/80 hover:bg-accent/40"}`}
      >
        <span className="flex items-center justify-between">
          <Icon className={`h-4 w-4 ${active ? "text-primary" : "text-muted-foreground"}`} />
          {active && (
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Check className="h-3 w-3" />
            </span>
          )}
        </span>
        <span className="text-sm font-semibold leading-none">{title}</span>
        <span className="text-xs text-muted-foreground leading-snug">{hint}</span>
      </button>
    );
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-sm animate-in fade-in duration-200 p-4">
      <div className="relative w-full max-w-md rounded-2xl border border-border bg-card shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-start gap-3 border-b border-border/60 p-5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
            <FileText className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold leading-tight">{t("newDocument")}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{t("createPrompt")}</p>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 rounded-md p-1 text-muted-foreground opacity-70 transition-opacity hover:opacity-100 hover:bg-accent"
          >
            <X className="h-4 w-4" />
            <span className="sr-only">{tCommon?.("actions.close") || "Cerrar"}</span>
          </button>
        </div>

        <form onSubmit={form.submit} className="p-5 space-y-5">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">{t("documentTitle")}</label>
            <input
              ref={inputRef}
              {...form.fields.title.inputProps}
              placeholder={t("titlePlaceholder") || "Ej: Reporte técnico, Notas de la reunión…"}
              disabled={form.isSubmitting}
              className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:border-primary disabled:cursor-not-allowed disabled:opacity-50"
            />
            {(form.fields.title.error || form.formError) && (
              <p className="text-xs text-destructive font-medium">{form.fields.title.error || form.formError}</p>
            )}
          </div>

          {/* Visibility */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">{t("visibilityLabel") || "Acceso"}</label>
            <div className="grid grid-cols-2 gap-2">
              <VisCard value="team" icon={Users} title={t("visibilityTeam") || "Workspace"} hint={t("visibilityTeamHint") || "Todos los miembros"} />
              <VisCard value="private" icon={Lock} title={t("visibilityPrivate") || "Privado"} hint={t("visibilityPrivateHint") || "Solo tú"} />
            </div>
          </div>

          <div className="flex w-full items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={form.isSubmitting}
              className="h-9 px-4 rounded-lg border border-input bg-background hover:bg-accent text-sm font-medium transition-colors"
            >
              {tCommon?.("actions.cancel") || "Cancelar"}
            </button>
            <button
              type="submit"
              disabled={!titleValue.trim() || form.isSubmitting}
              className="h-9 px-5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
            >
              {form.isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("create") || t("newDocument")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
