import React from "react";
import { Type, Heading1, Heading2, Heading3, Heading4, List, ListOrdered, CheckSquare, ChevronDown, Image as ImageIcon, Table, BarChart2 } from "lucide-react";

export type SlashCommand = {
  id: string;
  label: string;
  description: string;
  search: string;
  kind: "inline" | "block";
  insertText?: string;
  blockKind?: string;
  shortcut?: string;
  icon?: React.ReactNode;
};

export const slashCommands: SlashCommand[] = [
  { id: "text", label: "Texto", description: "Párrafo", search: "texto parrafo", kind: "inline", insertText: "", shortcut: "", icon: <Type className="w-5 h-5 text-muted-foreground" /> },
  { id: "heading-1", label: "Encabezado 1", description: "Título grande", search: "h1 heading encabezado", kind: "inline", insertText: "# ", shortcut: "#", icon: <Heading1 className="w-5 h-5 text-muted-foreground" /> },
  { id: "heading-2", label: "Encabezado 2", description: "Título mediano", search: "h2 heading encabezado", kind: "inline", insertText: "## ", shortcut: "##", icon: <Heading2 className="w-5 h-5 text-muted-foreground" /> },
  { id: "heading-3", label: "Encabezado 3", description: "Título pequeño", search: "h3 heading encabezado", kind: "inline", insertText: "### ", shortcut: "###", icon: <Heading3 className="w-5 h-5 text-muted-foreground" /> },
  { id: "heading-4", label: "Encabezado 4", description: "Subtítulo", search: "h4 heading encabezado", kind: "inline", insertText: "#### ", shortcut: "####", icon: <Heading4 className="w-5 h-5 text-muted-foreground" /> },
  { id: "bulleted-list", label: "Lista con viñetas", description: "Crear lista", search: "lista viñetas bullets", kind: "inline", insertText: "- ", shortcut: "-", icon: <List className="w-5 h-5 text-muted-foreground" /> },
  { id: "numbered-list", label: "Lista numerada", description: "Crear lista", search: "lista numerada numbers", kind: "inline", insertText: "1. ", shortcut: "1.", icon: <ListOrdered className="w-5 h-5 text-muted-foreground" /> },
  { id: "checklist", label: "Lista de tareas", description: "Bloque checklist", search: "checklist tareas to-do", kind: "block", blockKind: "checklist", shortcut: "[]", icon: <CheckSquare className="w-5 h-5 text-muted-foreground" /> },
  { id: "accordion", label: "Desplegable", description: "Bloque acordeón", search: "desplegable acordeon toggle", kind: "block", blockKind: "accordion", icon: <ChevronDown className="w-5 h-5 text-muted-foreground" /> },
  { id: "image", label: "Imagen", description: "Bloque multimedia", search: "imagen media", kind: "block", blockKind: "image", icon: <ImageIcon className="w-5 h-5 text-muted-foreground" /> },
  { id: "table", label: "Tabla", description: "Bloque tabla", search: "tabla table", kind: "block", blockKind: "table", icon: <Table className="w-5 h-5 text-muted-foreground" /> },
  { id: "graph", label: "Gráfico", description: "Bloque gráfico", search: "grafico chart", kind: "block", blockKind: "graph", icon: <BarChart2 className="w-5 h-5 text-muted-foreground" /> },
];
