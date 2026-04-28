/**
 * Contexto extendido de bricks para AI Draft Studio y generación de scripts.
 * Incluye inventario de bricks disponibles, métodos y capacidades.
 */

export interface BrickTypeInfo {
  kind: string;
  displayName: string;
  description: string;
  methods: BrickMethod[];
  properties: BrickProperty[];
}

export interface BrickMethod {
  name: string;
  description: string;
  parameters: Record<string, { type: string; required: boolean; description: string }>;
  returns: string;
}

export interface BrickProperty {
  name: string;
  type: string;
  description: string;
}

export const BRICK_TYPE_DEFINITIONS: Record<string, BrickTypeInfo> = {
  text: {
    kind: "text",
    displayName: "Texto",
    description: "Bloque de texto enriquecido con markdown, títulos, quotes",
    methods: [],
    properties: [
      { name: "markdown", type: "string", description: "Contenido markdown del bloque" },
      { name: "displayStyle", type: "paragraph | h1 | h2 | h3 | quote | callout", description: "Estilo de visualización" },
    ],
  },
  table: {
    kind: "table",
    displayName: "Tabla simple",
    description: "Tabla con filas y columnas de datos simples",
    methods: [
      {
        name: "query",
        description: "Consultar filas de la tabla",
        parameters: {
          where: { type: "Record<string, any>", required: false, description: "Filtro de búsqueda" },
          limit: { type: "number", required: false, description: "Límite de filas" },
        },
        returns: "ExecutionItem[]",
      },
    ],
    properties: [
      { name: "rows", type: "any[][]", description: "Filas de datos" },
      { name: "columns", type: "number", description: "Cantidad de columnas" },
    ],
  },
  database: {
    kind: "database",
    displayName: "Base de datos (Database Brick)",
    description: "Base de datos estructurada con columnas, tipos y relaciones",
    methods: [
      {
        name: "query",
        description: "Consultar registros con filtros",
        parameters: {
          where: { type: "Record<string, any>", required: false, description: "Condiciones de filtro (ej: {name: 'Juan', status: 'activo'})" },
          select: { type: "string[]", required: false, description: "Columnas a recuperar" },
          orderBy: { type: "string", required: false, description: "Ordenamiento (ej: 'name ASC')" },
          limit: { type: "number", required: false, description: "Máximo de registros" },
          offset: { type: "number", required: false, description: "Salto de registros" },
        },
        returns: "ExecutionItem[] con data como registros",
      },
      {
        name: "insert",
        description: "Insertar nuevos registros",
        parameters: {
          records: { type: "Record<string, any>[]", required: true, description: "Arreglo de registros a insertar" },
        },
        returns: "{ insertedCount: number, insertedIds: string[] }",
      },
      {
        name: "upsert",
        description: "Insertar o actualizar registros",
        parameters: {
          records: { type: "Record<string, any>[]", required: true, description: "Arreglo de registros" },
          matchOn: { type: "string[]", required: true, description: "Campos para hacer match (ej: ['email', 'id'])" },
        },
        returns: "{ upsertedCount: number, createdCount: number, updatedCount: number }",
      },
      {
        name: "update",
        description: "Actualizar registros existentes",
        parameters: {
          where: { type: "Record<string, any>", required: true, description: "Filtro para encontrar registros" },
          data: { type: "Record<string, any>", required: true, description: "Datos a actualizar" },
        },
        returns: "{ updatedCount: number }",
      },
      {
        name: "delete",
        description: "Eliminar registros",
        parameters: {
          where: { type: "Record<string, any>", required: true, description: "Filtro para registros a eliminar" },
        },
        returns: "{ deletedCount: number }",
      },
      {
        name: "count",
        description: "Contar registros que coinciden con filtro",
        parameters: {
          where: { type: "Record<string, any>", required: false, description: "Filtro de búsqueda" },
        },
        returns: "{ count: number }",
      },
    ],
    properties: [
      { name: "id", type: "string", description: "ID único del brick database" },
      { name: "title", type: "string", description: "Nombre de la base de datos" },
      { name: "columns", type: "ColumnDef[]", description: "Definición de columnas" },
      { name: "rows", type: "any[]", description: "Registros almacenados" },
      { name: "rowCount", type: "number", description: "Cantidad de registros" },
    ],
  },
  beautiful_table: {
    kind: "beautiful_table",
    displayName: "Bountiful Table",
    description: "Alias moderno del database brick con columnas tipadas, filas estructuradas y soporte para filtros/relaciones",
    methods: [
      {
        name: "query",
        description: "Consultar registros con filtros",
        parameters: {
          where: { type: "Record<string, any>", required: false, description: "Condiciones de filtro" },
          select: { type: "string[]", required: false, description: "Columnas a recuperar" },
          orderBy: { type: "string", required: false, description: "Ordenamiento" },
          limit: { type: "number", required: false, description: "Máximo de registros" },
        },
        returns: "ExecutionItem[] con data como registros",
      },
      {
        name: "insert",
        description: "Insertar nuevos registros",
        parameters: {
          records: { type: "Record<string, any>[]", required: true, description: "Arreglo de registros a insertar" },
        },
        returns: "{ insertedCount: number, insertedIds: string[] }",
      },
      {
        name: "update",
        description: "Actualizar registros existentes",
        parameters: {
          where: { type: "Record<string, any>", required: true, description: "Filtro para encontrar registros" },
          data: { type: "Record<string, any>", required: true, description: "Datos a actualizar" },
        },
        returns: "{ updatedCount: number }",
      },
    ],
    properties: [
      { name: "id", type: "string", description: "ID único del brick" },
      { name: "title", type: "string", description: "Nombre de la tabla" },
      { name: "columns", type: "ColumnDef[]", description: "Definición de columnas" },
      { name: "rows", type: "BountifulRow[]", description: "Filas con celdas tipadas" },
      { name: "rowCount", type: "number", description: "Cantidad de registros" },
    ],
  },
  bountiful_table: {
    kind: "bountiful_table",
    displayName: "Bountiful Table",
    description: "Alias legacy de beautiful_table/database brick",
    methods: [],
    properties: [
      { name: "columns", type: "ColumnDef[]", description: "Definición de columnas" },
      { name: "rows", type: "BountifulRow[]", description: "Filas con celdas tipadas" },
    ],
  },
  form: {
    kind: "form",
    displayName: "Formulario",
    description: "Formulario multi-step con validación y condiciones",
    methods: [
      {
        name: "onSubmit",
        description: "Webhook o script que se ejecuta al enviar el formulario",
        parameters: {
          formId: { type: "string", required: true, description: "ID del formulario" },
          values: { type: "Record<string, string | boolean>", required: true, description: "Valores completados" },
          fields: { type: "FormFieldConfig[]", required: true, description: "Definición de campos" },
        },
        returns: "Promise<void>",
      },
    ],
    properties: [
      { name: "title", type: "string", description: "Título del formulario" },
      { name: "pages", type: "FormPage[]", description: "Páginas del formulario" },
      { name: "fields", type: "FormFieldConfig[]", description: "Campos del formulario" },
      { name: "webhookUrl", type: "string", description: "URL webhook para envíos" },
      { name: "submitLabel", type: "string", description: "Texto del botón enviar" },
    ],
  },
  checklist: {
    kind: "checklist",
    displayName: "Checklist",
    description: "Lista de tareas con estado de completitud",
    methods: [],
    properties: [
      { name: "items", type: "ChecklistItem[]", description: "Items del checklist" },
      { name: "completedCount", type: "number", description: "Items completados" },
      { name: "totalCount", type: "number", description: "Total de items" },
    ],
  },
  accordion: {
    kind: "accordion",
    displayName: "Acordeón",
    description: "Secciones colapsables con contenido",
    methods: [],
    properties: [
      { name: "sections", type: "AccordionSection[]", description: "Secciones del acordeón" },
    ],
  },
  graph: {
    kind: "graph",
    displayName: "Gráfico/Diagrama",
    description: "Visualización de datos como gráfico (bar, line, pie, etc.)",
    methods: [],
    properties: [
      { name: "type", type: "string", description: "Tipo de gráfico (bar, line, pie, area)" },
      { name: "data", type: "any", description: "Datos del gráfico" },
      { name: "title", type: "string", description: "Título del gráfico" },
    ],
  },
  tabs: {
    kind: "tabs",
    displayName: "Tabs",
    description: "Pestañas con contenido independiente",
    methods: [],
    properties: [
      { name: "tabs", type: "TabDef[]", description: "Definición de pestañas" },
      { name: "activeTab", type: "string", description: "Pestaña activa" },
    ],
  },
  columns: {
    kind: "columns",
    displayName: "Columnas",
    description: "Layout de múltiples columnas lado a lado",
    methods: [],
    properties: [
      { name: "columnCount", type: "number", description: "Número de columnas" },
      { name: "children", type: "string[]", description: "IDs de bricks hijo" },
    ],
  },
  image: {
    kind: "image",
    displayName: "Imagen",
    description: "Imagen embebida con caption opcional",
    methods: [],
    properties: [
      { name: "url", type: "string", description: "URL de la imagen" },
      { name: "caption", type: "string", description: "Caption descriptivo" },
      { name: "width", type: "number", description: "Ancho en píxeles" },
      { name: "height", type: "number", description: "Alto en píxeles" },
    ],
  },
  video: {
    kind: "video",
    displayName: "Video",
    description: "Video embebido (YouTube, Vimeo, etc.)",
    methods: [],
    properties: [
      { name: "url", type: "string", description: "URL del video" },
      { name: "platform", type: "youtube | vimeo | other", description: "Plataforma de video" },
    ],
  },
  code: {
    kind: "code",
    displayName: "Código",
    description: "Bloque de código con resaltado de sintaxis",
    methods: [],
    properties: [
      { name: "code", type: "string", description: "Contenido del código" },
      { name: "language", type: "string", description: "Lenguaje de programación (js, python, sql, etc.)" },
    ],
  },
};

/**
 * Construir contexto AI completo incluyendo información de todos los brick types
 * disponibles en el sistema y sus capacidades.
 */
export function buildAiBrickSystemContext(
  localBricks?: any[],
  maxLength = 12000,
): string {
  const parts: string[] = [];

  // Encabezado del contexto
  parts.push(
    "=== BRICK TYPES Y CAPACIDADES DEL SISTEMA ===",
    "",
    "Sistema de bricks para documentos y tarjetas. Cada brick tiene tipo, propiedades y métodos.",
  );

  // Listado de tipos
  const typesSummary = Object.values(BRICK_TYPE_DEFINITIONS)
    .map(
      (def) =>
        `- ${def.displayName} (${def.kind}): ${def.description}${
          def.methods.length > 0 ? ` • Métodos: ${def.methods.map((m) => m.name).join(", ")}` : ""
        }`,
    )
    .join("\n");

  parts.push("", "TIPOS DISPONIBLES:", typesSummary);

  // Database brick methods en detalle
  const dbDef = BRICK_TYPE_DEFINITIONS.database;
  if (dbDef) {
    parts.push("", "=== DATABASE BRICK METHODS ===", "");
    for (const method of dbDef.methods) {
      const paramStr = Object.entries(method.parameters)
        .map(([key, val]) => `${key}${val.required ? "*" : "?"}: ${val.type}`)
        .join(", ");
      parts.push(`• ${method.name}(${paramStr}) => ${method.returns}`, `  ${method.description}`);
    }
  }

  // Inventario de bricks locales si se proporciona
  if (Array.isArray(localBricks) && localBricks.length > 0) {
    parts.push("", "=== BRICKS DISPONIBLES EN DOCUMENTO ACTUAL ===", "");
    const inventory = buildLocalBrickInventory(localBricks, 2000);
    if (inventory) parts.push(inventory);
  }

  parts.push("", "=== FIN CONTEXTO BRICKS ===");

  const result = parts.join("\n");
  return result.length > maxLength ? result.slice(0, maxLength) + "\n..." : result;
}

function buildLocalBrickInventory(bricks: any[], maxLength: number): string {
  const lines: string[] = [];
  const capped = bricks.slice(0, 50);

  for (let idx = 0; idx < capped.length; idx += 1) {
    const brick = capped[idx] || {};
    const brickId = String(brick.id || "").trim();
    const kind = String(brick.kind || "unknown").trim();
    if (!brickId) continue;

    const def = BRICK_TYPE_DEFINITIONS[kind];
    let summary = `${idx + 1}. [${kind}] id=${brickId}`;

    // Información específica por tipo
    if (kind === "database" || kind === "beautiful_table" || kind === "bountiful_table" || kind === "table") {
      const rows = Array.isArray(brick.content?.rows) ? brick.content.rows : [];
      const columns = Array.isArray(brick.content?.columns) ? brick.content.columns : [];
      summary += ` rows=${rows.length} cols=${columns.length}`;
    } else if (kind === "form") {
      const pages = Array.isArray(brick.content?.pages) ? brick.content.pages : [];
      summary += ` pages=${pages.length}`;
    } else if (kind === "checklist") {
      const items = Array.isArray(brick.content?.items) ? brick.content.items : [];
      summary += ` items=${items.length}`;
    } else if (brick.content?.title || brick.content?.name) {
      summary += ` title="${String(brick.content.title || brick.content.name).slice(0, 40)}"`;
    }

    lines.push(summary);
  }

  if (bricks.length > capped.length) {
    lines.push(`... ${bricks.length - capped.length} bricks más`);
  }

  return lines.join("\n").slice(0, maxLength);
}

/**
 * Contexto específico para scripts con información de nodos disponibles
 */
export function buildScriptGenerationContext(): string {
  return `
=== GENERADOR DE SCRIPTS ===

Nodos disponibles para construir workflows:

TRIGGERS:
- manual: Ejecución manual del script
- webhook: Activación por URL webhook
- github.commit: Trigger de commits en GitHub

DATABASE BRICK OPERATIONS:
- killio.database.query: Consultar registros con filtros
- killio.database.insert: Insertar nuevos registros
- killio.database.upsert: Insertar o actualizar
- killio.database.update: Actualizar registros
- killio.database.delete: Eliminar registros
- killio.database.count: Contar registros

TRANSFORMS:
- json.map: Mapear y transformar datos JSON
- json.normalize: Normalizar estructura JSON
- regex: Procesar con expresiones regulares
- template: Interpolar templates con datos
- iterator: Iterar sobre arreglos
- text.split: Dividir texto en líneas
- set.field: Establecer campo específico

CONDITIONS:
- regex.match: Filtrar por patrón regex
- field.compare: Comparar campos

ACTIONS:
- killio.card.create: Crear tarjeta
- killio.card.update: Actualizar tarjeta
- killio.card.move: Mover tarjeta entre boards
- killio.document.create: Crear documento
- http.request: Hacer request HTTP
- delay: Esperar tiempo

LOGIC:
- if.else: Rama condicional
- switch: Múltiples casos
- loop: Iterar items

Para consultar database bricks, especifica:
- sourceBrickId: ID del database brick a consultar
- operation: query | insert | upsert | update | delete | count
- params: parámetros específicos de la operación

Ejemplo query:
{
  sourceBrickId: "brick_123",
  operation: "query",
  where: { status: "active" },
  limit: 100
}

Ejemplo insert:
{
  sourceBrickId: "brick_123",
  operation: "insert",
  records: [
    { name: "Item 1", value: 100 },
    { name: "Item 2", value: 200 }
  ]
}
  `.trim();
}
