"use client";

import React, { createContext, useContext } from "react";
import { Input } from "@/components/ui/input";

export type FormFieldType =
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

export type FormFieldConditionOperator =
  | "equals"
  | "not_equals"
  | "contains"
  | "not_contains"
  | "is_empty"
  | "is_not_empty"
  | "is_true"
  | "is_false";

export type FormFieldCondition = {
  enabled: boolean;
  sourceFieldId: string;
  operator: FormFieldConditionOperator;
  value?: string;
};

export type FormFieldConfig = {
  fieldId: string;
  type: FormFieldType;
  placeholder?: string;
  required?: boolean;
  options?: string[];
  condition?: FormFieldCondition;
};

type FormFieldRuntimeContextValue = {
  interactive: boolean;
  values: Record<string, string | boolean>;
  setValue: (brickId: string, value: string | boolean) => void;
};

const FormFieldRuntimeContext = createContext<FormFieldRuntimeContextValue | null>(null);

export function FormFieldRuntimeProvider({
  value,
  children,
}: {
  value: FormFieldRuntimeContextValue;
  children: React.ReactNode;
}) {
  return <FormFieldRuntimeContext.Provider value={value}>{children}</FormFieldRuntimeContext.Provider>;
}

export function useFormFieldRuntime() {
  return useContext(FormFieldRuntimeContext);
}

const slugifyFieldId = (input: string): string => {
  const value = input.trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
  return value.length > 0 ? value : "field";
};

export function createDefaultFormFieldConfig(overrides?: Partial<FormFieldConfig>): FormFieldConfig {
  const seed = Math.random().toString(36).slice(2, 7);
  return {
    fieldId: `field_${seed}`,
    type: "text",
    placeholder: "",
    required: false,
    options: [],
    ...overrides,
  };
}

export function normalizeFormFieldConfig(raw: unknown): FormFieldConfig | null {
  if (!raw || typeof raw !== "object") return null;

  const input = raw as Record<string, unknown>;
  const rawFieldId =
    typeof input.fieldId === "string" && input.fieldId.trim().length > 0
      ? input.fieldId
      : typeof input.label === "string" && input.label.trim().length > 0
        ? input.label
        : "field";

  const type = (typeof input.type === "string" ? input.type : "text") as FormFieldType;
  const allowedTypes: FormFieldType[] = ["text", "email", "textarea", "number", "date", "tel", "url", "checkbox", "radio", "select"];
  const safeType = allowedTypes.includes(type) ? type : "text";

  const placeholder = typeof input.placeholder === "string" ? input.placeholder : "";
  const required = Boolean(input.required);
  const options = Array.isArray(input.options)
    ? input.options.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];

  const allowedConditionOperators: FormFieldConditionOperator[] = [
    "equals",
    "not_equals",
    "contains",
    "not_contains",
    "is_empty",
    "is_not_empty",
    "is_true",
    "is_false",
  ];

  let condition: FormFieldCondition | undefined;
  if (input.condition && typeof input.condition === "object") {
    const rawCondition = input.condition as Record<string, unknown>;
    const sourceFieldId = typeof rawCondition.sourceFieldId === "string" ? slugifyFieldId(rawCondition.sourceFieldId) : "";
    const operator =
      typeof rawCondition.operator === "string" && allowedConditionOperators.includes(rawCondition.operator as FormFieldConditionOperator)
        ? (rawCondition.operator as FormFieldConditionOperator)
        : "equals";

    if (sourceFieldId.length > 0) {
      condition = {
        enabled: Boolean(rawCondition.enabled),
        sourceFieldId,
        operator,
        value: typeof rawCondition.value === "string" ? rawCondition.value : "",
      };
    }
  }

  return {
    fieldId: slugifyFieldId(rawFieldId),
    type: safeType,
    placeholder,
    required,
    options,
    condition,
  };
}

const operatorNeedsValue = (operator: FormFieldConditionOperator): boolean => {
  return (
    operator === "equals" ||
    operator === "not_equals" ||
    operator === "contains" ||
    operator === "not_contains"
  );
};

interface UnifiedFormFieldBrickProps {
  id: string;
  config: FormFieldConfig;
  readonly: boolean;
  onUpdate: (config: FormFieldConfig) => void;
  runtimeValue?: string | boolean;
  onRuntimeValueChange?: (value: string | boolean) => void;
  interactive?: boolean;
}

export function UnifiedFormFieldBrick({
  id,
  config,
  readonly,
  onUpdate,
  runtimeValue,
  onRuntimeValueChange,
  interactive = false,
}: UnifiedFormFieldBrickProps) {
  if (!readonly) {
    return (
      <div className="rounded-lg border border-border/70 bg-muted/20 p-3 space-y-3 transition-all hover:border-border">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Field Brick</p>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{config.type}</span>
        </div>

        <div className="grid gap-2 md:grid-cols-3">
          <Input
            value={config.fieldId}
            onChange={(event) => onUpdate({ ...config, fieldId: slugifyFieldId(event.target.value) })}
            placeholder="field_id"
            className="h-9 font-mono"
          />

          <select
            value={config.type}
            onChange={(event) => onUpdate({ ...config, type: event.target.value as FormFieldType })}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm outline-none"
          >
            <optgroup label="Texto">
              <option value="text">Texto corto</option>
              <option value="textarea">Area de texto</option>
              <option value="email">Email</option>
              <option value="url">URL / Enlace</option>
              <option value="tel">Telefono</option>
            </optgroup>
            <optgroup label="Numeros y fecha">
              <option value="number">Numero</option>
              <option value="date">Fecha</option>
            </optgroup>
            <optgroup label="Opciones">
              <option value="select">Desplegable</option>
              <option value="radio">Seleccion unica</option>
              <option value="checkbox">Casilla</option>
            </optgroup>
          </select>

          <Input
            value={config.placeholder || ""}
            onChange={(event) => onUpdate({ ...config, placeholder: event.target.value })}
            placeholder="Placeholder"
            disabled={config.type === "checkbox" || config.type === "radio"}
            className="h-9 disabled:opacity-50"
          />
        </div>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm text-muted-foreground cursor-pointer hover:bg-muted/50">
            <input
              type="checkbox"
              checked={!!config.required}
              onChange={(event) => onUpdate({ ...config, required: event.target.checked })}
              className="rounded border-input text-accent focus:ring-accent"
            />
            Obligatorio
          </label>
        </div>

        {(config.type === "select" || config.type === "radio") && (
          <Input
            value={config.options?.join(", ") || ""}
            onChange={(event) =>
              onUpdate({
                ...config,
                options: event.target.value
                  .split(",")
                  .map((entry) => entry.trim())
                  .filter(Boolean),
              })
            }
            placeholder="Opciones separadas por coma"
            className="h-9 bg-background"
          />
        )}

        <div className="rounded-md border border-border/70 bg-background p-3 space-y-2">
          <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={Boolean(config.condition?.enabled)}
              onChange={(event) =>
                onUpdate({
                  ...config,
                  condition: {
                    enabled: event.target.checked,
                    sourceFieldId: config.condition?.sourceFieldId || "",
                    operator: config.condition?.operator || "equals",
                    value: config.condition?.value || "",
                  },
                })
              }
              className="rounded border-input text-accent focus:ring-accent"
            />
            Mostrar este campo solo si se cumple una condicion
          </label>

          {config.condition?.enabled ? (
            <div className="grid gap-2 md:grid-cols-3">
              <Input
                value={config.condition?.sourceFieldId || ""}
                onChange={(event) =>
                  onUpdate({
                    ...config,
                    condition: {
                      enabled: true,
                      sourceFieldId: slugifyFieldId(event.target.value),
                      operator: config.condition?.operator || "equals",
                      value: config.condition?.value || "",
                    },
                  })
                }
                placeholder="field_id origen"
                className="h-9 font-mono"
              />

              <select
                value={config.condition?.operator || "equals"}
                onChange={(event) =>
                  onUpdate({
                    ...config,
                    condition: {
                      enabled: true,
                      sourceFieldId: config.condition?.sourceFieldId || "",
                      operator: event.target.value as FormFieldConditionOperator,
                      value: config.condition?.value || "",
                    },
                  })
                }
                className="h-9 rounded-md border border-input bg-background px-3 text-sm outline-none"
              >
                <option value="equals">igual a</option>
                <option value="not_equals">distinto de</option>
                <option value="contains">contiene</option>
                <option value="not_contains">no contiene</option>
                <option value="is_empty">esta vacio</option>
                <option value="is_not_empty">no esta vacio</option>
                <option value="is_true">es verdadero</option>
                <option value="is_false">es falso</option>
              </select>

              {operatorNeedsValue(config.condition?.operator || "equals") ? (
                <Input
                  value={config.condition?.value || ""}
                  onChange={(event) =>
                    onUpdate({
                      ...config,
                      condition: {
                        enabled: true,
                        sourceFieldId: config.condition?.sourceFieldId || "",
                        operator: config.condition?.operator || "equals",
                        value: event.target.value,
                      },
                    })
                  }
                  placeholder="Valor esperado"
                  className="h-9"
                />
              ) : (
                <div className="h-9 rounded-md border border-dashed border-border/60 px-3 text-xs text-muted-foreground flex items-center">
                  Este operador no requiere valor
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  const value = runtimeValue;
  if (!interactive || !onRuntimeValueChange) {
    return (
      <div className="rounded-md border border-dashed border-border/70 bg-muted/10 p-3 space-y-1">
        <p className="text-xs text-muted-foreground">Field Brick ({config.type})</p>
      </div>
    );
  }

  if (config.type === "textarea") {
    return (
      <div className="block space-y-1.5">
        <textarea
          id={id}
          className="min-h-[96px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/30"
          placeholder={config.placeholder || ""}
          required={config.required}
          value={(value as string) || ""}
          onChange={(event) => onRuntimeValueChange(event.target.value)}
        />
      </div>
    );
  }

  if (config.type === "select") {
    return (
      <div className="block space-y-1.5">
        <select
          id={id}
          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-accent/30"
          required={config.required}
          value={(value as string) || ""}
          onChange={(event) => onRuntimeValueChange(event.target.value)}
        >
          <option value="" disabled>
            {config.placeholder || "Selecciona una opcion"}
          </option>
          {(config.options || []).map((option, index) => (
            <option key={index} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>
    );
  }

  if (config.type === "radio") {
    return (
      <div className="block space-y-1.5">
        <div className="space-y-2 mt-1">
          {(config.options || []).map((option, index) => (
            <label key={index} className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
              <input
                type="radio"
                name={id}
                value={option}
                required={config.required}
                checked={value === option}
                onChange={(event) => onRuntimeValueChange(event.target.value)}
                className="h-4 w-4 text-accent border-input focus:ring-accent"
              />
              {option}
            </label>
          ))}
        </div>
      </div>
    );
  }

  if (config.type === "checkbox") {
    return (
      <label className="flex items-start gap-2 text-sm text-foreground cursor-pointer">
        <input
          type="checkbox"
          id={id}
          required={config.required}
          checked={!!value}
          onChange={(event) => onRuntimeValueChange(event.target.checked)}
          className="mt-1 h-4 w-4 rounded border-input text-accent focus:ring-accent"
        />
        <span className="leading-tight font-mono text-xs text-muted-foreground">{config.fieldId}</span>
      </label>
    );
  } 
  return (
    <div className="block space-y-1.5">
      <Input
        id={id}
        type={config.type}
        placeholder={config.placeholder || ""}
        required={config.required}
        value={(value as string) || ""}
        onChange={(event) => onRuntimeValueChange(event.target.value)}
        className="w-full"
      />
    </div>
  );
}
