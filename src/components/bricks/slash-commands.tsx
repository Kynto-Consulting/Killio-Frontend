import React from "react";
import { Type, Heading1, Heading2, Heading3, Heading4, List, ListOrdered, CheckSquare, ChevronDown, Image as ImageIcon, Table, BarChart2, Quote, Minus, Lightbulb } from "lucide-react";

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

export const getSlashCommands = (t: (key: string) => string): SlashCommand[] => [
  { id: "text", label: t("slashCommands.textLabel"), description: t("slashCommands.textDesc"), search: t("slashCommands.textSearch"), kind: "inline", insertText: "", shortcut: "", icon: <Type className="w-5 h-5 text-muted-foreground" /> },
  { id: "heading-1", label: t("slashCommands.h1Label"), description: t("slashCommands.h1Desc"), search: t("slashCommands.h1Search"), kind: "inline", insertText: "# ", shortcut: "#", icon: <Heading1 className="w-5 h-5 text-muted-foreground" /> },
  { id: "heading-2", label: t("slashCommands.h2Label"), description: t("slashCommands.h2Desc"), search: t("slashCommands.h2Search"), kind: "inline", insertText: "## ", shortcut: "##", icon: <Heading2 className="w-5 h-5 text-muted-foreground" /> },
  { id: "heading-3", label: t("slashCommands.h3Label"), description: t("slashCommands.h3Desc"), search: t("slashCommands.h3Search"), kind: "inline", insertText: "### ", shortcut: "###", icon: <Heading3 className="w-5 h-5 text-muted-foreground" /> },
  { id: "heading-4", label: t("slashCommands.h4Label"), description: t("slashCommands.h4Desc"), search: t("slashCommands.h4Search"), kind: "inline", insertText: "#### ", shortcut: "####", icon: <Heading4 className="w-5 h-5 text-muted-foreground" /> },
  { id: "bulleted-list", label: t("slashCommands.bulletLabel"), description: t("slashCommands.bulletDesc"), search: t("slashCommands.bulletSearch"), kind: "inline", insertText: "- ", shortcut: "-", icon: <List className="w-5 h-5 text-muted-foreground" /> },
  { id: "numbered-list", label: t("slashCommands.numLabel"), description: t("slashCommands.numDesc"), search: t("slashCommands.numSearch"), kind: "inline", insertText: "1. ", shortcut: "1.", icon: <ListOrdered className="w-5 h-5 text-muted-foreground" /> },
  { id: "checklist", label: t("slashCommands.checkLabel"), description: t("slashCommands.checkDesc"), search: t("slashCommands.checkSearch"), kind: "block", blockKind: "checklist", shortcut: "[]", icon: <CheckSquare className="w-5 h-5 text-muted-foreground" /> },
  { id: "accordion", label: t("slashCommands.accLabel"), description: t("slashCommands.accDesc"), search: t("slashCommands.accSearch"), kind: "block", blockKind: "accordion", icon: <ChevronDown className="w-5 h-5 text-muted-foreground" /> },
  { id: "image", label: t("slashCommands.imgLabel"), description: t("slashCommands.imgDesc"), search: t("slashCommands.imgSrc"), kind: "block", blockKind: "image", icon: <ImageIcon className="w-5 h-5 text-muted-foreground" /> },
  { id: "table", label: t("slashCommands.tabLabel"), description: t("slashCommands.tabDesc"), search: t("slashCommands.tabSearch"), kind: "block", blockKind: "table", icon: <Table className="w-5 h-5 text-muted-foreground" /> },
  { id: "graph", label: t("slashCommands.graphLabel"), description: t("slashCommands.graphDesc"), search: t("slashCommands.graphSearch"), kind: "block", blockKind: "graph", icon: <BarChart2 className="w-5 h-5 text-muted-foreground" /> },
  { id: "quote", label: t("slashCommands.quoteLabel"), description: t("slashCommands.quoteDesc"), search: t("slashCommands.quoteSearch"), kind: "block", blockKind: "quote", shortcut: ">", icon: <Quote className="w-5 h-5 text-muted-foreground" /> },
  { id: "divider", label: t("slashCommands.divLabel"), description: t("slashCommands.divDesc"), search: t("slashCommands.divSearch"), kind: "block", blockKind: "divider", shortcut: "---", icon: <Minus className="w-5 h-5 text-muted-foreground" /> },
  { id: "callout", label: t("slashCommands.callLabel"), description: t("slashCommands.callDesc"), search: t("slashCommands.callSearch"), kind: "block", blockKind: "callout", icon: <Lightbulb className="w-5 h-5 text-muted-foreground" /> },
];
