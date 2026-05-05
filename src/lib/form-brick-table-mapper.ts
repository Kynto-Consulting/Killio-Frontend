/**
 * Utilities for mapping bountiful table columns to form brick fields
 */

import type { FormFieldType } from "@/components/bricks/unified-form-field-brick.web";
import type { BountifulColumn } from "@/components/bricks/unified-bountiful-table";

/**
 * Maps a bountiful table column type to a form field type
 */
export function mapColumnTypeToFieldType(columnType: string): FormFieldType {
  const typeMap: Record<string, FormFieldType> = {
    // Text fields
    title: "text",
    rich_text: "textarea",
    email: "email",
    phone_number: "tel",
    url: "url",

    // Numeric
    number: "number",

    // Selection
    select: "select",
    status: "select",
    multi_select: "checkbox",

    // Temporal
    date: "date",
    created_time: "date",
    last_edited_time: "date",

    // Boolean
    checkbox: "checkbox",

    // Relations and complex types (display-only or placeholder)
    people: "text",
    created_by: "text",
    last_edited_by: "text",
    document: "text",
    board: "text",
    card: "text",
    relation: "text",

    // Computed (readonly)
    formula: "text",
    rollup: "text",
  };

  return typeMap[columnType.toLowerCase()] || "text";
}

/**
 * Generates select options from a column's options
 */
export function extractSelectOptions(
  column: BountifulColumn
): string[] {
  if (column.type === "select" || column.type === "status" || column.type === "multi_select") {
    const options = Array.isArray(column.options) ? column.options : [];
    return options.map((opt: any) => opt.name || String(opt));
  }
  return [];
}

/**
 * Generates a LegacyFormField from a BountifulColumn
 */
export function columnToFormField(column: BountifulColumn): any {
  const fieldType = mapColumnTypeToFieldType(column.type);
  const options = extractSelectOptions(column);

  const field: any = {
    id: `field_${column.id}`,
    label: column.name || `Field ${column.id}`,
    type: fieldType,
    placeholder: `Enter ${column.name}`,
    required: false, // Default to optional, user can change
  };

  // Add options for select/checkbox fields
  if ((fieldType === "select" || fieldType === "checkbox") && options.length > 0) {
    field.options = options;
  }

  return field;
}

/**
 * Generates all form fields from table columns
 */
export function generateFormFieldsFromColumns(
  columns: BountifulColumn[]
): any[] {
  return columns
    .filter((col) => !col.hidden) // Skip hidden columns
    .map((col) => columnToFormField(col));
}

/**
 * Checks if a column type is readonly/computed
 */
export function isColumnReadonly(columnType: string): boolean {
  const readonlyTypes = ["formula", "rollup", "created_time", "last_edited_time", "created_by", "last_edited_by"];
  return readonlyTypes.includes(columnType.toLowerCase());
}

/**
 * Gets a display-friendly column type label
 */
export function getColumnTypeLabel(columnType: string): string {
  const labels: Record<string, string> = {
    title: "Título",
    rich_text: "Texto Enriquecido",
    email: "Email",
    phone_number: "Teléfono",
    url: "URL",
    number: "Número",
    select: "Selección",
    status: "Estado",
    multi_select: "Selección Múltiple",
    date: "Fecha",
    created_time: "Fecha Creación",
    last_edited_time: "Última Edición",
    checkbox: "Checkbox",
    people: "Personas",
    created_by: "Creado Por",
    last_edited_by: "Editado Por",
    document: "Documento",
    board: "Tablero",
    card: "Tarjeta",
    relation: "Relación",
    formula: "Fórmula",
    rollup: "Rollup",
  };

  return labels[columnType.toLowerCase()] || columnType;
}

/**
 * Generates the standard form fields for a Kanban card intake form.
 * When a form is connected to a board list, submissions create new cards.
 * If boardTags are provided, a multi_select field is added so users can tag the card.
 */
export function generateCardFormFields(boardTags?: { id: string; name: string; color?: string }[]): any[] {
  const fields: any[] = [
    {
      id: "field_title",
      label: "Título",
      type: "text" as const,
      placeholder: "Título de la tarjeta",
      required: true,
    },
    {
      id: "field_description",
      label: "Descripción",
      type: "textarea" as const,
      placeholder: "Describe el contenido de la tarjeta (opcional)",
      required: false,
    },
    {
      id: "field_dueAt",
      label: "Fecha de vencimiento",
      type: "date" as const,
      placeholder: "",
      required: false,
    },
  ];

  if (boardTags && boardTags.length > 0) {
    fields.push({
      id: "field_tags",
      label: "Etiquetas",
      type: "select" as const, // multi_select renders as select for now; backend accepts comma-separated
      placeholder: "Seleccionar etiqueta(s)",
      required: false,
      options: boardTags.map((t) => t.name),
    });
  }

  return fields;
}
