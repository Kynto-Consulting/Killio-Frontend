/**
 * Brick Schema Registry
 * This file centralizes the definitions and schemas for all bricks in the Kynto/Killio system.
 * It is used to provide context to the AI Agent about how to create or modify bricks.
 */

export type BrickKind = 
  | "text" 
  | "table" 
  | "beautiful_table" 
  | "graph" 
  | "checklist" 
  | "accordion" 
  | "tabs" 
  | "columns" 
  | "media" 
  | "image" 
  | "video" 
  | "audio" 
  | "bookmark" 
  | "file" 
  | "form" 
  | "callout" 
  | "quote" 
  | "divider";

export interface BrickSchema {
  kind: BrickKind;
  description: string;
  contentStructure: Record<string, any>;
  metadata?: Record<string, any>;
}

export const BRICK_SCHEMAS: Record<string, BrickSchema> = {
  text: {
    kind: "text",
    description: "Standard text block supporting markdown and various display styles. Can also function as a form field when nested in a form brick.",
    contentStructure: {
      markdown: "string (Required content or label)",
      displayStyle: "paragraph | h1 | h2 | h3 | checklist | quote | code | callout (Default: paragraph)",
      formField: "{ fieldId: string, type: 'text'|'textarea'|'number'|'email'|'select'|'checkbox'|'date', label: string, required: boolean, placeholder?: string, options?: Array<{label: string, value: string}>, condition?: {enabled: boolean, sourceFieldId: string, operator: string, value: string} } (Optional: used only inside form bricks)"
    }
  },
  table: {
    kind: "table",
    description: "Simple markdown-style table.",
    contentStructure: {
      rows: "string[][] (2D array of strings where first row is header)",
      title: "string (Optional)"
    }
  },
  beautiful_table: {
    kind: "beautiful_table",
    description: "Advanced database-like table with typed columns (Bountiful Table).",
    contentStructure: {
      title: "string (Optional)",
      columns: "Array<{ id: string, name: string, type: 'text'|'number'|'select'|'multi_select'|'date'|'checkbox'|'user'|'doc'|'board'|'card'|'phone'|'formula' }>",
      rows: "Array<{ id: string, cells: Record<columnId, any>, meta?: { _lastEditedAt: string, _lastEditedBy: string } }>"
    }
  },
  graph: {
    kind: "graph",
    description: "Visual data representation.",
    contentStructure: {
      title: "string (Optional)",
      type: "line | bar | pie | area | scatter",
      data: "Array<Record<string, any>> (e.g. [{ name: 'Jan', value: 100 }])",
      config: "{ xKey: string, yKeys: string[], colors?: string[] }"
    }
  },
  checklist: {
    kind: "checklist",
    description: "Interactive list of tasks.",
    contentStructure: {
      items: "Array<{ id: string, label: string, checked: boolean }>"
    }
  },
  accordion: {
    kind: "accordion",
    description: "Collapsible container for content.",
    contentStructure: {
      title: "string (Header visible when collapsed)",
      body: "string (Markdown content - legacy, prefer nesting)",
      isExpanded: "boolean",
      childrenByContainer: "{ body: string[] } (Brick IDs for content inside)"
    }
  },
  tabs: {
    kind: "tabs",
    description: "Tabbed container for organizing content.",
    contentStructure: {
      tabs: "Array<{ id: string, label: string }>",
      childrenByContainer: "Record<tabId, string[]> (Brick IDs per tab)"
    }
  },
  columns: {
    kind: "columns",
    description: "Multi-column layout container.",
    contentStructure: {
      columns: "Array<{ id: string }>",
      childrenByContainer: "Record<columnId, string[]> (Brick IDs per column)"
    }
  },
  media: {
    kind: "media",
    description: "Rich media block for images, videos, files, etc.",
    contentStructure: {
      url: "string (Required)",
      title: "string (Optional)",
      caption: "string (Optional)",
      mediaType: "image | video | audio | bookmark | file"
    }
  },
  form: {
    kind: "form",
    description: "Intake form that can send data to webhooks or other bricks.",
    contentStructure: {
      title: "string",
      description: "string",
      submitLabel: "string",
      webhookUrl: "string",
      pages: "Array<{ id: string, label: string }>",
      childrenByContainer: "Record<pageId, string[]> (Contains form field bricks)"
    }
  },
  callout: {
    kind: "callout",
    description: "Highlighted box for important info.",
    contentStructure: {
      markdown: "string",
      icon: "string (Emoji or Lucide icon name)"
    }
  },
  quote: {
    kind: "quote",
    description: "Stylized blockquote.",
    contentStructure: {
      markdown: "string",
      author: "string (Optional)"
    }
  },
  divider: {
    kind: "divider",
    description: "Horizontal line to separate content.",
    contentStructure: {}
  }
};

/**
 * RICH TEXT FORMATTING
 * These features apply to any markdown-enabled field (like text.markdown).
 */
export const RICH_TEXT_FEATURES = {
  basic: {
    bold: "**text**",
    italic: "*text*",
    underline: "__text__",
    strikethrough: "~~text~~",
    inlineCode: "`text`",
    link: "[link:url]label[/link]"
  },
  blocks: {
    code: "```lang\\ncode\\n```",
    latexInline: "$formula$",
    latexBlock: "$$formula$$",
    image: "![alt](url)"
  },
  styling: {
    color: "[color:hex_or_name]text[/color]",
    background: "[bg:hex_or_name]text[/bg]",
    fontSize: "[size:1.2rem]text[/size]"
  },
  references: {
    mention: "@[type:id:label] (type: user | doc | board | card)",
    deepValue: "$[path] - Resolves to the actual data (e.g. value of a cell). Path syntax: [entityType:scopeId:]brickId:selector[:args]",
    deepReference: "#[path] - Visual pill that previews the property. Same path syntax as deepValue.",
    pathDetails: {
      entityType: "doc | board | card | mesh (Optional if in the same document)",
      scopeId: "ID of the Document, Board or Card (Required if entityType is present)",
      brickId: "ID of the target brick, or alias (1 for first brick, 2 for second, etc.)",
      selector: "Property to extract: text | title | body | cell | row | col | range | kind | json | raw",
      args: "Optional. For 'cell' use 'A1', for 'row' use '1', for 'range' use 'A1:B10'"
    },
    examples: [
      "$[doc:uuid:brick1:title] (Title of first brick in doc uuid)",
      "#[brick2:cell:B2] (Visual pill for cell B2 in second local brick)"
    ]
  }
};

export const MESH_BRICK_SCHEMAS: Record<string, any> = {
  board_empty: { description: "Base brick for boards" },
  text: { description: "Mesh-native text block with fixed position" },
  frame: { description: "Container for grouping mesh elements" },
  script: { description: "Visual script node for automation" },
  mirror: { description: "Live reference to another brick's content" },
  portal: { description: "Interactive window into another board or document" },
  decision: { description: "Branching logic node" },
  draw: { description: "Handwritten or sketched content" }
};

/**
 * TOON (Token-Oriented Object Notation) simplified stringifier.
 * Optimized for LLM context.
 */
function toTOON(obj: any, indent = 0): string {
  const spaces = "  ".repeat(indent);
  if (obj === null) return "null";
  if (typeof obj !== "object") return String(obj);

  if (Array.isArray(obj)) {
    if (obj.length === 0) return "[]";
    const first = obj[0];
    if (typeof first === "object" && first !== null && !Array.isArray(first)) {
      const keys = Object.keys(first);
      let res = `[${obj.length}]{${keys.join(",")}}:\n`;
      for (const item of obj) {
        res += `${spaces}  ${keys.map(k => String(item[k] ?? "")).join(",")}\n`;
      }
      return res.trim();
    }
    return `[${obj.length}]: ${obj.map(v => String(v)).join(",")}`;
  }

  let res = "";
  const entries = Object.entries(obj);
  for (let i = 0; i < entries.length; i++) {
    const [k, v] = entries[i];
    const valStr = typeof v === "object" && v !== null ? `\n${spaces}  ${toTOON(v, indent + 1)}` : ` ${toTOON(v, indent + 1)}`;
    res += `${k}:${valStr}${i < entries.length - 1 ? "\n" + spaces : ""}`;
  }
  return res;
}

export function getFullBrickSchemaContext(): string {
  let context = "=== REGISTRO DE ESQUEMAS DE BRICKS (Formato TOON) ===\n";
  context += "Usa estas estructuras exactas al generar o editar bricks.\n\n";

  for (const [kind, schema] of Object.entries(BRICK_SCHEMAS)) {
    context += `${kind}:\n`;
    context += `  description: ${schema.description}\n`;
    context += `  contentStructure:\n    ${toTOON(schema.contentStructure, 2)}\n\n`;
  }

  context += "### MESH BRICKS\n";
  for (const [kind, schema] of Object.entries(MESH_BRICK_SCHEMAS)) {
    context += `- ${kind}: ${schema.description}\n`;
  }

  context += "\n### RICH TEXT FORMATTING (Available in all markdown fields)\n";
  context += "- Basic: **Bold**, *Italic*, __Underline__, ~~Strike~~, `Code`, [link:url]label[/link]\n";
  context += "- Style: [color:#hex]...[/color], [bg:#hex]...[/bg], [size:14px]...[/size]\n";
  context += "- LaTeX: $E=mc^2$ (inline) or $$formula$$ (block)\n";
  context += "- Mentions: @[user:id:Name], @[doc:id:Title], @[board:id:Title], @[card:id:Title]\n";
  context += "- Deep Links: $[path] (gets value), #[path] (creates interactive pill)\n";
  context += "  Path Syntax: [entityType:scopeId:]brickId:selector[:args]\n";
  context += "  Selectors: text, title, cell (arg: A1), row (arg: 1), col (arg: A), range (arg: A1:B2), json, kind\n";
  context += "  Brick Aliases: 'brick1', 'brick2', etc. refer to the Nth brick in the scope.\n";
  
  return context;
}
