"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ChevronLeft, ChevronRight, Loader2, Plus, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/lib/toast";
import { useTranslations } from "@/components/providers/i18n-provider";
import { useSession } from "@/components/providers/session-provider";
import { listScripts, type ScriptSummary } from "@/lib/api/scripts";
import { resolveNestedBricks } from "@/lib/bricks/nesting";
import { UnifiedBrickList } from "./unified-brick-list";
import {
  createDefaultFormFieldConfig,
  FormFieldRuntimeProvider,
  type FormFieldType,
  normalizeFormFieldConfig,
} from "./unified-form-field-brick.web";
import { WorkspaceMemberLike } from "@/lib/workspace-members";

type LegacyFormField = {
  id: string;
  label: string;
  type: FormFieldType;
  placeholder?: string;
  required?: boolean;
  options?: string[];
};

type FormPage = {
  id: string;
  label: string;
};

type FormBrickContent = {
  title?: string;
  description?: string;
  submitLabel?: string;
  webhookUrl?: string;
  scriptId?: string;
  successMessage?: string;
  pages?: FormPage[];
  childrenByContainer?: Record<string, string[]>;
  fields?: LegacyFormField[];
};

interface UnifiedFormBrickProps {
  id: string;
  content: FormBrickContent;
  canEdit: boolean;
  onUpdate: (content: FormBrickContent) => void;
  activeBricks?: any[];
  onAddBrick?: (kind: string, afterBrickId?: string, parentProps?: { parentId: string; containerId: string }, initialContent?: any) => void;
  onDeleteBrick?: (id: string) => void;
  onUpdateBrick?: (id: string, content: any) => void;
  onReorderBricks?: (ids: string[]) => void;
  onCrossContainerDrop?: (
    activeId: string,
    overId: string,
    options?: { intent?: "move" | "merge-text"; sourceContainerToken?: string; targetContainerToken?: string },
  ) => void;
  documents?: any[];
  boards?: any[];
  users?: WorkspaceMemberLike[];
}

const DEFAULT_PAGE_ID = "page-1";
const DEFAULT_PAGE_LABEL = "Paso 1";

const createPage = (index: number): FormPage => ({
  id: `page-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  label: `Paso ${index}`,
});

const isRequiredFieldMissing = (type: FormFieldType, required: boolean | undefined, value: string | boolean | undefined) => {
  if (!required) return false;
  if (type === "checkbox") return value !== true;
  return typeof value !== "string" || value.trim().length === 0;
};

const normalizeConditionText = (value: string | boolean | undefined): string => {
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") return value.trim().toLowerCase();
  return "";
};

const evaluateFieldCondition = (
  condition: {
    enabled?: boolean;
    sourceFieldId?: string;
    operator?: string;
    value?: string;
  } | undefined,
  sourceValue: string | boolean | undefined,
): boolean => {
  if (!condition?.enabled) return true;
  const sourceFieldId = String(condition.sourceFieldId || "").trim();
  if (sourceFieldId.length === 0) return true;

  const operator = String(condition.operator || "equals");
  const current = normalizeConditionText(sourceValue);
  const expected = normalizeConditionText(condition.value || "");

  if (operator === "equals") return current === expected;
  if (operator === "not_equals") return current !== expected;
  if (operator === "contains") return current.includes(expected);
  if (operator === "not_contains") return !current.includes(expected);
  if (operator === "is_empty") return current.length === 0;
  if (operator === "is_not_empty") return current.length > 0;
  if (operator === "is_true") return current === "true" || current === "1" || current === "si" || current === "yes";
  if (operator === "is_false") return current === "false" || current === "0" || current === "no";

  return true;
};

export function UnifiedFormBrick({
  id,
  content,
  canEdit,
  onUpdate,
  activeBricks = [],
  onAddBrick,
  onDeleteBrick,
  onUpdateBrick,
  onReorderBricks,
  onCrossContainerDrop,
  documents,
  boards,
  users,
}: UnifiedFormBrickProps) {
  const t = useTranslations("document-detail");
  const { accessToken, activeTeamId } = useSession();

  const safePages = useMemo(() => {
    const pages = Array.isArray(content.pages)
      ? content.pages
          .filter((page): page is FormPage => Boolean(page && typeof page.id === "string" && page.id.length > 0))
          .map((page, index) => ({
            id: page.id,
            label: typeof page.label === "string" && page.label.trim().length > 0 ? page.label : `Paso ${index + 1}`,
          }))
      : [];

    if (pages.length > 0) return pages;
    return [{ id: DEFAULT_PAGE_ID, label: DEFAULT_PAGE_LABEL }];
  }, [content.pages]);

  const [activePage, setActivePage] = useState(safePages[0]?.id || DEFAULT_PAGE_ID);
  const [values, setValues] = useState<Record<string, string | boolean>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitState, setSubmitState] = useState<"idle" | "success" | "error">("idle");
  const [teamScripts, setTeamScripts] = useState<ScriptSummary[]>([]);
  const [isLoadingScripts, setIsLoadingScripts] = useState(false);
  const [scriptsLoadError, setScriptsLoadError] = useState<string | null>(null);

  const childrenByContainer = useMemo(() => {
    const raw = content.childrenByContainer;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {} as Record<string, string[]>;
    return raw as Record<string, string[]>;
  }, [content.childrenByContainer]);

  const pageBricksById = useMemo(() => {
    const map: Record<string, any[]> = {};
    for (const page of safePages) {
      map[page.id] = resolveNestedBricks({ childrenByContainer }, page.id, activeBricks as any[]) as any[];
    }
    return map;
  }, [safePages, childrenByContainer, activeBricks]);

  const pseudoFieldEntries = useMemo(() => {
    const entries: Array<{ brickId: string; pageId: string; config: ReturnType<typeof createDefaultFormFieldConfig> }> = [];
    for (const page of safePages) {
      const pageBricks = pageBricksById[page.id] || [];
      for (const brick of pageBricks) {
        const config = normalizeFormFieldConfig(brick?.content?.formField);
        if (!config) continue;
        entries.push({ brickId: brick.id, pageId: page.id, config });
      }
    }
    return entries;
  }, [safePages, pageBricksById]);

  const fieldIdToBrickId = useMemo(() => {
    const mapping: Record<string, string> = {};
    for (const entry of pseudoFieldEntries) {
      const fieldId = entry.config.fieldId;
      if (!fieldId || mapping[fieldId]) continue;
      mapping[fieldId] = entry.brickId;
    }
    return mapping;
  }, [pseudoFieldEntries]);

  const visiblePseudoFieldEntries = useMemo(() => {
    return pseudoFieldEntries.filter((entry) => {
      const condition = entry.config.condition;
      if (!condition?.enabled) return true;

      const sourceBrickId = fieldIdToBrickId[condition.sourceFieldId];
      const sourceValue = sourceBrickId ? values[sourceBrickId] : undefined;
      return evaluateFieldCondition(condition, sourceValue);
    });
  }, [pseudoFieldEntries, fieldIdToBrickId, values]);

  const visiblePseudoFieldIds = useMemo(() => {
    return new Set(visiblePseudoFieldEntries.map((entry) => entry.brickId));
  }, [visiblePseudoFieldEntries]);

  const hasPseudoFields = pseudoFieldEntries.length > 0;
  const legacyFields = Array.isArray(content.fields) ? content.fields : [];
  const hasLegacyFields = !hasPseudoFields && legacyFields.length > 0;

  const viewerPageBricksById = useMemo(() => {
    const map: Record<string, any[]> = {};
    for (const page of safePages) {
      const pageBricks = pageBricksById[page.id] || [];
      map[page.id] = pageBricks.filter((brick) => {
        const config = normalizeFormFieldConfig(brick?.content?.formField);
        if (!config) return true;
        return visiblePseudoFieldIds.has(brick.id);
      });
    }
    return map;
  }, [safePages, pageBricksById, visiblePseudoFieldIds]);

  const navigablePages = useMemo(() => {
    if (canEdit || !hasPseudoFields) return safePages;
    const filtered = safePages.filter((page) => {
      const bricks = viewerPageBricksById[page.id] || [];
      return bricks.length > 0;
    });
    return filtered.length > 0 ? filtered : [safePages[0]];
  }, [canEdit, hasPseudoFields, safePages, viewerPageBricksById]);

  const activePageBricks = (canEdit ? pageBricksById[activePage] : viewerPageBricksById[activePage]) || [];

  const webhookBase = useMemo(
    () =>
      (
        process.env.NEXT_PUBLIC_API_BASE_URL ??
        process.env.NEXT_PUBLIC_KILLIO_API_URL ??
        process.env.NEXT_PUBLIC_API_URL ??
        "http://localhost:4000"
      ).replace(/\/+$/, ""),
    [],
  );

  const webhookScripts = useMemo(() => {
    return teamScripts.filter((script) => {
      const publicToken = script.triggerConfig?.publicToken;
      return script.triggerType === "webhook" && script.isActive && typeof publicToken === "string" && publicToken.length > 0;
    });
  }, [teamScripts]);

  const endpoint = String(content.webhookUrl ?? "").trim();
  const submitLabel = (content.submitLabel || t("form.submitButton") || "Enviar").trim();
  const successMessage = (content.successMessage || t("form.successMessage") || "Enviado correctamente.").trim();

  const isConfigured = endpoint.length > 0 && (hasPseudoFields || hasLegacyFields);

  useEffect(() => {
    if (navigablePages.some((page) => page.id === activePage)) return;
    setActivePage(navigablePages[0]?.id || DEFAULT_PAGE_ID);
  }, [navigablePages, activePage]);

  const updateContent = (patch: Partial<FormBrickContent>) => {
    onUpdate({ ...content, ...patch });
  };

  const updatePages = (nextPages: FormPage[]) => {
    const nextChildrenByContainer: Record<string, string[]> = {};
    for (const page of nextPages) {
      nextChildrenByContainer[page.id] = Array.isArray(childrenByContainer[page.id]) ? childrenByContainer[page.id] : [];
    }

    updateContent({
      pages: nextPages,
      childrenByContainer: nextChildrenByContainer,
    });
  };

  const addPage = () => {
    const nextPage = createPage(safePages.length + 1);
    const nextPages = [...safePages, nextPage];
    updatePages(nextPages);
    setActivePage(nextPage.id);
  };

  const removePage = (pageId: string) => {
    if (safePages.length <= 1) return;
    const nextPages = safePages.filter((page) => page.id !== pageId);
    updatePages(nextPages);
    if (activePage === pageId) {
      setActivePage(nextPages[0].id);
    }
  };

  const renamePage = (pageId: string, label: string) => {
    updatePages(safePages.map((page) => (page.id === pageId ? { ...page, label } : page)));
  };

  const addFieldBrick = () => {
    if (!canEdit || !onAddBrick) return;

    const afterBrickId = activePageBricks.length > 0 ? activePageBricks[activePageBricks.length - 1].id : undefined;
    onAddBrick(
      "text",
      afterBrickId,
      { parentId: id, containerId: activePage },
      {
        text: "",
        markdown: "",
        displayStyle: "paragraph",
        formField: createDefaultFormFieldConfig(),
      },
    );
  };

  const reorderActivePageBricks = (orderedIds: string[]) => {
    if (!canEdit) return;
    const nextChildrenByContainer = {
      ...childrenByContainer,
      [activePage]: orderedIds,
    };
    updateContent({ childrenByContainer: nextChildrenByContainer });
  };

  const getWebhookUrlForScript = (script: ScriptSummary): string | null => {
    const publicToken = script.triggerConfig?.publicToken;
    if (!activeTeamId || typeof publicToken !== "string" || publicToken.length === 0) {
      return null;
    }
    return `${webhookBase}/w/${activeTeamId}/webhook/${script.id}/${publicToken}`;
  };

  const refreshScripts = async () => {
    if (!activeTeamId || !accessToken) return;
    setIsLoadingScripts(true);
    setScriptsLoadError(null);
    try {
      const scripts = await listScripts(activeTeamId, accessToken);
      setTeamScripts(scripts);
    } catch (error) {
      console.error("Failed to load webhook scripts for form brick", error);
      setScriptsLoadError("No se pudieron cargar los scripts.");
    } finally {
      setIsLoadingScripts(false);
    }
  };

  const handleScriptSelection = (scriptId: string) => {
    if (!scriptId) {
      updateContent({ scriptId: undefined });
      return;
    }

    const script = webhookScripts.find((item) => item.id === scriptId);
    if (!script) {
      toast("Script no valido para webhook.", "error");
      return;
    }

    const webhookUrl = getWebhookUrlForScript(script);
    if (!webhookUrl) {
      toast("No se pudo construir la URL del webhook.", "error");
      return;
    }

    updateContent({
      scriptId: script.id,
      webhookUrl,
    });
  };

  useEffect(() => {
    if (!canEdit || !activeTeamId || !accessToken) return;

    let cancelled = false;
    const loadScripts = async () => {
      setIsLoadingScripts(true);
      setScriptsLoadError(null);
      try {
        const scripts = await listScripts(activeTeamId, accessToken);
        if (cancelled) return;
        setTeamScripts(scripts);
      } catch (error) {
        if (cancelled) return;
        console.error("Failed to load webhook scripts for form brick", error);
        setScriptsLoadError("No se pudieron cargar los scripts.");
      } finally {
        if (!cancelled) setIsLoadingScripts(false);
      }
    };

    loadScripts();
    return () => {
      cancelled = true;
    };
  }, [canEdit, activeTeamId, accessToken]);

  useEffect(() => {
    if (!canEdit || !content.scriptId) return;
    const selectedScript = webhookScripts.find((script) => script.id === content.scriptId);
    if (!selectedScript) return;

    const webhookUrl = getWebhookUrlForScript(selectedScript);
    if (!webhookUrl) return;

    if (webhookUrl !== (content.webhookUrl ?? "")) {
      updateContent({ scriptId: selectedScript.id, webhookUrl });
    }
  }, [canEdit, content.scriptId, content.webhookUrl, webhookScripts]);

  const setFieldValue = (brickId: string, value: string | boolean) => {
    setValues((current) => ({ ...current, [brickId]: value }));
  };

  const activePageIndex = navigablePages.findIndex((page) => page.id === activePage);
  const isLastPage = activePageIndex >= navigablePages.length - 1;

  const goToNextPage = () => {
    if (activePageIndex < 0 || isLastPage) return;

    const currentRequiredMissing = visiblePseudoFieldEntries.find((entry) => {
      return entry.pageId === activePage && isRequiredFieldMissing(entry.config.type, entry.config.required, values[entry.brickId]);
    });

    if (currentRequiredMissing) {
      toast("Completa los campos obligatorios de este paso.", "error");
      return;
    }

    setActivePage(navigablePages[activePageIndex + 1].id);
  };

  const goToPreviousPage = () => {
    if (activePageIndex <= 0) return;
    setActivePage(safePages[activePageIndex - 1].id);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (hasPseudoFields && !isLastPage) {
      goToNextPage();
      return;
    }

    if (!isConfigured) {
      toast(t("form.missingEndpoint") || "Configura la URL del webhook antes de enviar.", "error");
      return;
    }

    if (hasPseudoFields) {
      const missingEntry = visiblePseudoFieldEntries.find((entry) => {
        return isRequiredFieldMissing(entry.config.type, entry.config.required, values[entry.brickId]);
      });

      if (missingEntry) {
        setActivePage(missingEntry.pageId);
        toast("Completa los campos obligatorios antes de enviar.", "error");
        return;
      }
    }

    if (hasLegacyFields) {
      const missingLegacy = legacyFields.find((field) => {
        return isRequiredFieldMissing(field.type, field.required, values[field.id]);
      });

      if (missingLegacy) {
        toast("Completa los campos obligatorios antes de enviar.", "error");
        return;
      }
    }

    setIsSubmitting(true);
    setSubmitState("idle");
    try {
      const normalizedValues = hasPseudoFields
        ? visiblePseudoFieldEntries.reduce<Record<string, string | boolean>>((acc, entry) => {
            const value = values[entry.brickId];
            if (typeof value === "undefined") return acc;
            const key = entry.config.fieldId || entry.brickId;
            acc[key] = value;
            return acc;
          }, {})
        : legacyFields.reduce<Record<string, string | boolean>>((acc, field) => {
            const value = values[field.id];
            if (typeof value === "undefined") return acc;
            acc[field.id] = value;
            return acc;
          }, {});

      const payload = {
        formId: id,
        title: content.title || "",
        scriptId: content.scriptId || null,
        submittedAt: new Date().toISOString(),
        values: normalizedValues,
        fields: hasPseudoFields
          ? visiblePseudoFieldEntries.map((entry) => ({
              brickId: entry.brickId,
              pageId: entry.pageId,
              ...entry.config,
            }))
          : legacyFields,
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
      setValues({});
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

  const renderLegacyField = (field: LegacyFormField) => {
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
            onChange={(event) => setFieldValue(field.id, event.target.value)}
          />
        ) : field.type === "select" ? (
          <select
            id={field.id}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-accent/30"
            required={field.required}
            value={(value as string) || ""}
            onChange={(event) => setFieldValue(field.id, event.target.value)}
          >
            <option value="" disabled>{field.placeholder || "Selecciona una opcion"}</option>
            {(field.options || []).map((option, index) => (
              <option key={index} value={option}>{option}</option>
            ))}
          </select>
        ) : field.type === "radio" ? (
          <div className="space-y-2 mt-2">
            {(field.options || []).map((option, index) => (
              <label key={index} className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                <input
                  type="radio"
                  name={field.id}
                  value={option}
                  required={field.required}
                  checked={value === option}
                  onChange={(event) => setFieldValue(field.id, event.target.value)}
                  className="h-4 w-4 text-accent border-input focus:ring-accent"
                />
                {option}
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
              onChange={(event) => setFieldValue(field.id, event.target.checked)}
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
            onChange={(event) => setFieldValue(field.id, event.target.value)}
            className="w-full"
          />
        )}
      </div>
    );
  };

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
            placeholder={t("form.titlePlaceholder") || "Titulo del formulario"}
          />
          <Input
            value={content.description || ""}
            onChange={(event) => updateContent({ description: event.target.value })}
            placeholder={t("form.descriptionPlaceholder") || "Descripcion opcional"}
          />

          <div className="rounded-md border border-border/60 bg-muted/20 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Conectar script</p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={refreshScripts}
                disabled={isLoadingScripts || !activeTeamId || !accessToken}
              >
                {isLoadingScripts ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Refrescar"}
              </Button>
            </div>

            <select
              value={content.scriptId || ""}
              onChange={(event) => handleScriptSelection(event.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none"
              disabled={!activeTeamId || !accessToken || isLoadingScripts}
            >
              <option value="">Ninguno (usar URL manual)</option>
              {webhookScripts.map((script) => (
                <option key={script.id} value={script.id}>
                  {script.name}
                </option>
              ))}
            </select>

            {scriptsLoadError ? <p className="text-xs text-destructive">{scriptsLoadError}</p> : null}
            {!isLoadingScripts && webhookScripts.length === 0 ? (
              <p className="text-xs text-muted-foreground">No hay scripts webhook activos en este workspace.</p>
            ) : null}
            {content.scriptId ? (
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">Webhook conectado automaticamente desde el script seleccionado.</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => updateContent({ scriptId: undefined })}
                >
                  Desconectar
                </Button>
              </div>
            ) : null}
          </div>

          <Input
            value={content.webhookUrl || ""}
            onChange={(event) => updateContent({ webhookUrl: event.target.value, scriptId: undefined })}
            placeholder={t("form.webhookPlaceholder") || "URL del webhook publico"}
            disabled={!!content.scriptId}
          />

          <div className="grid grid-cols-2 gap-2">
            <Input
              value={content.submitLabel || ""}
              onChange={(event) => updateContent({ submitLabel: event.target.value })}
              placeholder={t("form.submitLabelPlaceholder") || "Etiqueta del boton"}
            />
            <Input
              value={content.successMessage || ""}
              onChange={(event) => updateContent({ successMessage: event.target.value })}
              placeholder={t("form.successPlaceholder") || "Mensaje al enviar"}
            />
          </div>
        </div>

        <div className="rounded-lg border border-border/60">
          <div className="flex bg-muted/20 border-b border-border/50 px-1 pt-1 overflow-x-auto overflow-y-hidden">
            {safePages.map((page) => (
              <div
                key={page.id}
                className={`group/tab flex items-center px-4 py-2 border-b-2 text-sm font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  activePage === page.id
                    ? "border-primary text-foreground bg-background"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/10"
                }`}
                onClick={() => setActivePage(page.id)}
              >
                <input
                  value={page.label}
                  onChange={(event) => renamePage(page.id, event.target.value)}
                  className="bg-transparent outline-none border-none min-w-[70px] focus:ring-1 ring-border/50 rounded px-1"
                  onClick={(event) => {
                    event.stopPropagation();
                  }}
                />
                {safePages.length > 1 && (
                  <button
                    type="button"
                    className="ml-2 opacity-0 group-hover/tab:opacity-100 hover:text-destructive transition-opacity"
                    onClick={(event) => {
                      event.stopPropagation();
                      removePage(page.id);
                    }}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}

            <button
              type="button"
              onClick={addPage}
              className="px-3 py-2 text-muted-foreground hover:text-foreground flex items-center justify-center transition-colors"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          <div className="p-3 space-y-3 bg-background">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-foreground">{safePages.find((page) => page.id === activePage)?.label || "Paso"}</p>
              <Button type="button" variant="outline" size="sm" onClick={addFieldBrick} className="h-8 gap-2">
                <Plus className="h-3.5 w-3.5" />
                Field brick
              </Button>
            </div>

            <UnifiedBrickList
              hasExternalDndContext={true}
              showDragOverlay={false}
              dropContainerToken={`${id}:${activePage}`}
              bricks={activePageBricks}
              activeBricks={activeBricks}
              canEdit={canEdit}
              emptyPlaceholder="Paso vacio. Agrega un field brick o cualquier bloque."
              onUpdateBrick={(brickId, nextContent) => onUpdateBrick?.(brickId, nextContent)}
              onDeleteBrick={(brickId) => onDeleteBrick?.(brickId)}
              onReorderBricks={reorderActivePageBricks}
              onAddBrick={(kind, afterBrickId, parentProps, initialContent) =>
                onAddBrick?.(kind, afterBrickId, parentProps || { parentId: id, containerId: activePage }, initialContent)
              }
              onCrossContainerDrop={onCrossContainerDrop}
              documents={documents}
              boards={boards}
              users={users}
              addableKinds={[
                "text",
                "table",
                "database",
                "graph",
                "form",
                "checklist",
                "accordion",
                "tabs",
                "columns",
                "image",
                "video",
                "audio",
                "file",
                "code",
                "bookmark",
                "math",
              ]}
            />
          </div>
        </div>
      </div>
    );
  }

  if (!isConfigured) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
        {t("form.notConfigured") || "Este formulario todavia no esta configurado."}
      </div>
    );
  }

  if (hasLegacyFields) {
    return (
      <div className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-5">
        <div className="space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-widest text-accent">{t("form.viewerTitle") || "Formulario"}</p>
          <h3 className="text-xl font-semibold tracking-tight text-foreground">{content.title || t("form.defaultTitle") || "Formulario"}</h3>
          {content.description ? <p className="text-sm text-muted-foreground">{content.description}</p> : null}
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          {legacyFields.map((field) => renderLegacyField(field))}

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

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-5">
      <div className="space-y-1.5">
        <p className="text-xs font-semibold uppercase tracking-widest text-accent">{t("form.viewerTitle") || "Formulario"}</p>
        <h3 className="text-xl font-semibold tracking-tight text-foreground">{content.title || t("form.defaultTitle") || "Formulario"}</h3>
        {content.description ? <p className="text-sm text-muted-foreground">{content.description}</p> : null}
      </div>

      <FormFieldRuntimeProvider
        value={{
          interactive: true,
          values,
          setValue: setFieldValue,
        }}
      >
        <form className="space-y-4" onSubmit={handleSubmit}>
          {navigablePages.length > 1 && (
            <div className="flex flex-wrap gap-2">
              {navigablePages.map((page, index) => (
                <button
                  key={page.id}
                  type="button"
                  onClick={() => setActivePage(page.id)}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                    activePage === page.id
                      ? "bg-accent text-accent-foreground"
                      : "bg-muted/40 text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {index + 1}. {page.label}
                </button>
              ))}
            </div>
          )}

          <div className="rounded-lg border border-border/60 bg-background p-3">
            <UnifiedBrickList
              hasExternalDndContext={true}
              dropContainerToken={`${id}:${activePage}`}
              bricks={activePageBricks}
              activeBricks={activeBricks}
              canEdit={false}
              emptyPlaceholder="Paso sin contenido"
              onUpdateBrick={() => undefined}
              onDeleteBrick={() => undefined}
              onReorderBricks={() => undefined}
              onAddBrick={() => undefined}
              documents={documents}
              boards={boards}
              users={users}
            />
          </div>

          <div className="flex items-center justify-between gap-2 pt-1">
            <Button type="button" variant="outline" onClick={goToPreviousPage} disabled={activePageIndex <= 0} className="gap-2">
              <ChevronLeft className="h-4 w-4" />
              Anterior
            </Button>

            {!isLastPage ? (
              <Button type="button" onClick={goToNextPage} className="gap-2">
                Siguiente
                <ChevronRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button type="submit" className="gap-2" disabled={isSubmitting}>
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {submitLabel}
              </Button>
            )}
          </div>
        </form>
      </FormFieldRuntimeProvider>

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
