"use client";

import { useMemo, useState, type FormEvent } from "react";
import { Loader2, Plus, Send, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/lib/toast";
import { useTranslations } from "@/components/providers/i18n-provider";

type FormFieldType = 
  | "text" 
  | "email" 
  | "textarea" 
  | "number" 
  | "date" 
  | "tel" 
  | "url" 
  | "checkbox" 
  | "radio" 
  | "select";

type FormField = {
  id: string;
  label: string;
  type: FormFieldType;
  placeholder?: string;
  required?: boolean;
  options?: string[]; // Usado para 'radio' y 'select'
};

type FormBrickContent = {
  title?: string;
  description?: string;
  submitLabel?: string;
  webhookUrl?: string;
  successMessage?: string;
  fields?: FormField[];
};

interface UnifiedFormBrickProps {
  id: string;
  content: FormBrickContent;
  canEdit: boolean;
  onUpdate: (content: FormBrickContent) => void;
}

const createField = (): FormField => ({
  id: `field-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  label: "Nuevo Campo",
  type: "text",
  placeholder: "",
  required: false,
});

export function UnifiedFormBrick({ id, content, canEdit, onUpdate }: UnifiedFormBrickProps) {
  const t = useTranslations("document-detail");
  const fields = content.fields && content.fields.length > 0 ? content.fields : [createField()];
  
  // Usamos 'any' o un tipo unión para soportar valores booleanos de checkboxes
  const [values, setValues] = useState<Record<string, string | boolean>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitState, setSubmitState] = useState<"idle" | "success" | "error">("idle");

  const endpoint = String(content.webhookUrl ?? "").trim();
  const submitLabel = (content.submitLabel || t("form.submitButton") || "Enviar").trim();
  const successMessage = (content.successMessage || t("form.successMessage") || "Enviado correctamente.").trim();

  const isConfigured = endpoint.length > 0 && fields.length > 0;

  const updateContent = (patch: Partial<FormBrickContent>) => {
    onUpdate({
      ...content,
      ...patch,
      fields: patch.fields ?? content.fields ?? [createField()],
    });
  };

  const updateField = (fieldId: string, patch: Partial<FormField>) => {
    updateContent({
      ...content,
      fields: fields.map((field) => (field.id === fieldId ? { ...field, ...patch } : field)),
    });
  };

  const addField = () => {
    updateContent({
      ...content,
      fields: [...fields, createField()],
    });
  };

  const removeField = (fieldId: string) => {
    updateContent({
      ...content,
      fields: fields.filter((field) => field.id !== fieldId),
    });
  };

  const moveField = (index: number, direction: -1 | 1) => {
    const newFields = [...fields];
    if (direction === -1 && index > 0) {
      [newFields[index - 1], newFields[index]] = [newFields[index], newFields[index - 1]];
    } else if (direction === 1 && index < newFields.length - 1) {
      [newFields[index + 1], newFields[index]] = [newFields[index], newFields[index + 1]];
    }
    updateContent({ ...content, fields: newFields });
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!isConfigured) {
      toast(t("form.missingEndpoint") || "Configura la URL del webhook antes de enviar.", "error");
      return;
    }

    setIsSubmitting(true);
    setSubmitState("idle");
    try {
      const payload = {
        formId: id,
        title: content.title || "",
        submittedAt: new Date().toISOString(),
        values,
      };

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error("Webhook rejected the submission.");
      }

      setSubmitState("success");
      toast(successMessage, "success");
      setValues({}); // Limpiar formulario tras éxito
    } catch (error) {
      console.error("Failed to submit form brick", error);
      setSubmitState("error");
      toast(t("form.submitError") || "No se pudo enviar el formulario.", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const previewLabel = useMemo(() => {
    return content.title || t("form.defaultTitle") || "Formulario";
  }, [content.title, t]);

  if (canEdit) {
    return (
      <div className="rounded-xl border border-border bg-card p-4 shadow-sm space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{t("form.editorTitle") || "Formulario"}</p>
              <p className="text-sm font-medium text-foreground">{previewLabel}</p>
            </div>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{t("form.webhookHint") || "Webhook"}</span>
          </div>
          <Input
            value={content.title || ""}
            onChange={(event) => updateContent({ title: event.target.value })}
            placeholder={t("form.titlePlaceholder") || "Título del formulario"}
          />
          <Input
            value={content.description || ""}
            onChange={(event) => updateContent({ description: event.target.value })}
            placeholder={t("form.descriptionPlaceholder") || "Descripción opcional"}
          />
          <Input
            value={content.webhookUrl || ""}
            onChange={(event) => updateContent({ webhookUrl: event.target.value })}
            placeholder={t("form.webhookPlaceholder") || "URL del webhook público"}
          />
          <div className="grid grid-cols-2 gap-2">
            <Input
              value={content.submitLabel || ""}
              onChange={(event) => updateContent({ submitLabel: event.target.value })}
              placeholder={t("form.submitLabelPlaceholder") || "Etiqueta del botón"}
            />
            <Input
              value={content.successMessage || ""}
              onChange={(event) => updateContent({ successMessage: event.target.value })}
              placeholder={t("form.successPlaceholder") || "Mensaje al enviar"}
            />
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-foreground">{t("form.fieldsTitle") || "Campos"}</p>
            <Button type="button" variant="outline" size="sm" onClick={addField} className="h-8 gap-2">
              <Plus className="h-3.5 w-3.5" />
              {t("form.addField") || "Añadir campo"}
            </Button>
          </div>

          <div className="space-y-3">
            {fields.map((field, index) => (
              <div key={field.id} className="rounded-lg border border-border/70 bg-muted/20 p-3 space-y-3 transition-all hover:border-border">
                <div className="flex items-center justify-between gap-2">
                  <Input
                    value={field.label}
                    onChange={(event) => updateField(field.id, { label: event.target.value })}
                    placeholder={t("form.fieldLabelPlaceholder") || "Etiqueta del campo"}
                    className="h-9 font-medium"
                  />
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => moveField(index, -1)}
                      disabled={index === 0}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background text-muted-foreground hover:bg-muted disabled:opacity-50"
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveField(index, 1)}
                      disabled={index === fields.length - 1}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background text-muted-foreground hover:bg-muted disabled:opacity-50"
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeField(field.id)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background text-muted-foreground hover:text-destructive hover:bg-destructive/10 ml-1"
                      aria-label={t("form.removeField") || "Eliminar campo"}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="grid gap-2 md:grid-cols-3">
                  <select
                    value={field.type}
                    onChange={(event) => updateField(field.id, { type: event.target.value as FormFieldType })}
                    className="h-9 rounded-md border border-input bg-background px-3 text-sm outline-none"
                  >
                    <optgroup label="Texto">
                      <option value="text">Texto corto</option>
                      <option value="textarea">Área de texto</option>
                      <option value="email">Email</option>
                      <option value="url">URL / Enlace</option>
                      <option value="tel">Teléfono</option>
                    </optgroup>
                    <optgroup label="Números & Fecha">
                      <option value="number">Número</option>
                      <option value="date">Fecha</option>
                    </optgroup>
                    <optgroup label="Opciones">
                      <option value="select">Desplegable (Select)</option>
                      <option value="radio">Selección única (Radio)</option>
                      <option value="checkbox">Casilla (Checkbox)</option>
                    </optgroup>
                  </select>

                  <Input
                    value={field.placeholder || ""}
                    onChange={(event) => updateField(field.id, { placeholder: event.target.value })}
                    placeholder={t("form.placeholderPlaceholder") || "Placeholder / Texto guía"}
                    disabled={field.type === "checkbox" || field.type === "radio"}
                    className="disabled:opacity-50"
                  />
                  
                  <label className="flex items-center gap-2 rounded-md border border-border bg-background px-3 text-sm text-muted-foreground cursor-pointer hover:bg-muted/50">
                    <input
                      type="checkbox"
                      checked={!!field.required}
                      onChange={(event) => updateField(field.id, { required: event.target.checked })}
                      className="rounded border-input text-accent focus:ring-accent"
                    />
                    {t("form.required") || "Obligatorio"}
                  </label>
                </div>

                {(field.type === "select" || field.type === "radio") && (
                  <div className="pt-1">
                    <Input
                      value={field.options?.join(", ") || ""}
                      onChange={(event) => updateField(field.id, { 
                        options: event.target.value.split(",").map(s => s.trim()).filter(Boolean) 
                      })}
                      placeholder="Opciones (separadas por coma: Opción 1, Opción 2)"
                      className="h-9 bg-background"
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!isConfigured) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
        {t("form.notConfigured") || "Este formulario todavía no está configurado."}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-5">
      <div className="space-y-1.5">
        <p className="text-xs font-semibold uppercase tracking-widest text-accent">{t("form.viewerTitle") || "Formulario"}</p>
        <h3 className="text-xl font-semibold tracking-tight text-foreground">{content.title || t("form.defaultTitle") || "Formulario"}</h3>
        {content.description ? <p className="text-sm text-muted-foreground">{content.description}</p> : null}
      </div>

      <form className="space-y-4" onSubmit={handleSubmit}>
        {fields.map((field) => {
          const isCheckbox = field.type === "checkbox";
          const value = values[field.id];

          return (
            <div key={field.id} className="block space-y-1.5">
              {!isCheckbox && (
                <label htmlFor={field.id} className="text-sm font-medium text-foreground block">
                  {field.label}
                  {field.required ? <span className="ml-1 text-destructive">*</span> : null}
                </label>
              )}

              {field.type === "textarea" ? (
                <textarea
                  id={field.id}
                  className="min-h-[96px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/30"
                  placeholder={field.placeholder || ""}
                  required={field.required}
                  value={(value as string) || ""}
                  onChange={(event) => setValues((current) => ({ ...current, [field.id]: event.target.value }))}
                />
              ) : field.type === "select" ? (
                <select
                  id={field.id}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-accent/30"
                  required={field.required}
                  value={(value as string) || ""}
                  onChange={(event) => setValues((current) => ({ ...current, [field.id]: event.target.value }))}
                >
                  <option value="" disabled>{field.placeholder || "Selecciona una opción"}</option>
                  {field.options?.map((opt, i) => (
                    <option key={i} value={opt}>{opt}</option>
                  ))}
                </select>
              ) : field.type === "radio" ? (
                <div className="space-y-2 mt-2">
                  {field.options?.map((opt, i) => (
                    <label key={i} className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                      <input
                        type="radio"
                        name={field.id}
                        value={opt}
                        required={field.required}
                        checked={value === opt}
                        onChange={(event) => setValues((current) => ({ ...current, [field.id]: event.target.value }))}
                        className="h-4 w-4 text-accent border-input focus:ring-accent"
                      />
                      {opt}
                    </label>
                  ))}
                </div>
              ) : field.type === "checkbox" ? (
                <label className="flex items-start gap-2 text-sm font-medium text-foreground cursor-pointer mt-2">
                  <input
                    type="checkbox"
                    id={field.id}
                    required={field.required}
                    checked={!!value}
                    onChange={(event) => setValues((current) => ({ ...current, [field.id]: event.target.checked }))}
                    className="mt-1 h-4 w-4 rounded border-input text-accent focus:ring-accent"
                  />
                  <span className="leading-tight">
                    {field.label}
                    {field.required ? <span className="ml-1 text-destructive">*</span> : null}
                  </span>
                </label>
              ) : (
                <Input
                  id={field.id}
                  type={field.type}
                  placeholder={field.placeholder || ""}
                  required={field.required}
                  value={(value as string) || ""}
                  onChange={(event) => setValues((current) => ({ ...current, [field.id]: event.target.value }))}
                  className="w-full"
                />
              )}
            </div>
          );
        })}

        <Button type="submit" className="w-full gap-2 mt-6" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {submitLabel}
        </Button>
      </form>

      {submitState === "success" ? (
        <div className="rounded-md bg-emerald-50 dark:bg-emerald-500/10 p-3 border border-emerald-200 dark:border-emerald-500/20">
          <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">{successMessage}</p>
        </div>
      ) : null}
      {submitState === "error" ? (
        <div className="rounded-md bg-destructive/10 p-3 border border-destructive/20">
          <p className="text-sm font-medium text-destructive">{t("form.submitError") || "No se pudo enviar el formulario."}</p>
        </div>
      ) : null}
    </div>
  );
}