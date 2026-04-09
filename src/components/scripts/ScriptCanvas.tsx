"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "@/components/providers/i18n-provider";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  type Connection,
  type Node,
  type Edge,
  type NodeTypes,
  BackgroundVariant,
  ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { GithubTriggerNode } from "./nodes/GithubTriggerNode";
import { ManualTriggerNode } from "./nodes/ManualTriggerNode";
import { WebhookTriggerNode } from "./nodes/WebhookTriggerNode";
import { RegexConditionNode } from "./nodes/RegexConditionNode";
import { FieldCompareNode } from "./nodes/FieldCompareNode";
import { JsonMapNode } from "./nodes/JsonMapNode";
import { JsonNormalizeNode } from "./nodes/JsonNormalizeNode";
import { RegexNode } from "./nodes/RegexNode";
import { JoinFieldsNode } from "./nodes/JoinFieldsNode";
import { HashJoinNode } from "./nodes/HashJoinNode";
import { TemplateNode } from "./nodes/TemplateNode";
import { IteratorNode } from "./nodes/IteratorNode";
import { TextSplitLinesNode } from "./nodes/TextSplitLinesNode";
import { ContextWindowNode } from "./nodes/ContextWindowNode";
import { HashComposeNode } from "./nodes/hash-compose-node";
import { CoalesceNode } from "./nodes/CoalesceNode";
import { ArrayCompactNode } from "./nodes/ArrayCompactNode";
import { IfElseNode } from "./nodes/IfElseNode";
import { DelayNode } from "./nodes/DelayNode";
import { CreateCardNode } from "./nodes/CreateCardNode";
import { UpdateCardNode } from "./nodes/UpdateCardNode";
import { MoveCardNode } from "./nodes/MoveCardNode";
import { AssignCardNode } from "./nodes/AssignCardNode";
import { AddBrickNode } from "./nodes/AddBrickNode";
import { DocumentCreateNode } from "./nodes/DocumentCreateNode";
import { TableReadNode } from "./nodes/TableReadNode";
import { TableWriteNode } from "./nodes/TableWriteNode";
import { SetFieldNode } from "./nodes/SetFieldNode";
import { DedupNode } from "./nodes/DedupNode";
import { FirstSeenNode } from "./nodes/FirstSeenNode";
import { SwitchNode } from "./nodes/SwitchNode";
import { HttpRequestNode } from "./nodes/HttpRequestNode";
import { JsCodeNode } from "./nodes/JsCodeNode";
import { NodePalette } from "@/components/scripts/NodePalette";
import { cn } from "@/lib/utils";

import { ScriptGraph, ScriptNodeData, ScriptEdgeData, NodeKind, ScriptRunLog, getLatestRunOutputs } from "@/lib/api/scripts";
import { Loader2, Save, Power, Play, Copy, Check, Maximize2, Minimize2, Eye } from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

const nodeTypes: NodeTypes = {
  "github.trigger.commit": GithubTriggerNode,
  "core.trigger.manual": ManualTriggerNode,
  "core.trigger.webhook": WebhookTriggerNode,
  "core.condition.regex_match": RegexConditionNode,
  "core.condition.field_compare": FieldCompareNode,
  "core.transform.json_map": JsonMapNode,
  "core.transform.json_normalize": JsonNormalizeNode,
  "core.transform.regex": RegexNode,
  "core.transform.join_fields": JoinFieldsNode,
  "core.transform.hash_join": HashJoinNode,
  "core.transform.template": TemplateNode,
  "core.transform.iterator": IteratorNode,
  "core.transform.text_split_lines": TextSplitLinesNode,
  "core.transform.context_window": ContextWindowNode,
  "core.transform.hash_compose": HashComposeNode,
  "core.transform.coalesce": CoalesceNode,
  "core.transform.array_compact": ArrayCompactNode,
  "core.logic.if_else": IfElseNode,
  "core.action.delay": DelayNode,
  "killio.action.create_card": CreateCardNode,
  "killio.action.update_card": UpdateCardNode,
  "killio.action.move_card": MoveCardNode,
  "killio.action.assign_card": AssignCardNode,
  "killio.action.add_brick": AddBrickNode,
  "killio.action.document.create": DocumentCreateNode,
  "killio.table.read": TableReadNode,
  "killio.table.write": TableWriteNode,
  "core.transform.set_field": SetFieldNode,
  "core.filter.dedup": DedupNode,
  "core.filter.first_seen": FirstSeenNode,
  "core.logic.switch": SwitchNode,
  "core.action.http_request": HttpRequestNode,
  "core.action.js_code": JsCodeNode,
};

type ConfigFieldType = "text" | "textarea" | "code" | "number" | "boolean" | "select";

interface ConfigFieldOption {
  value: string;
  labelKey: string;
}

interface ConfigField {
  key: string;
  type: ConfigFieldType;
  labelKey: string;
  placeholderKey?: string;
  options?: ConfigFieldOption[];
  /** Show this field only when another field's value matches */
  showWhen?: { key: string; isIn?: string[]; notIn?: string[] };
}

const NODE_CONFIG_FIELDS: Partial<Record<NodeKind, ConfigField[]>> = {
  "github.trigger.commit": [
    { key: "repoFullName", type: "text", labelKey: "canvas.fields.repoFullName", placeholderKey: "canvas.placeholders.repoFullName" },
    { key: "branch", type: "text", labelKey: "canvas.fields.branch", placeholderKey: "canvas.placeholders.branch" },
    { key: "filePathRegex", type: "text", labelKey: "canvas.fields.filePathRegex", placeholderKey: "canvas.placeholders.filePathRegex" },
  ],
  "core.condition.regex_match": [
    { key: "field", type: "text", labelKey: "canvas.fields.field", placeholderKey: "canvas.placeholders.field" },
    { key: "pattern", type: "text", labelKey: "canvas.fields.pattern", placeholderKey: "canvas.placeholders.pattern" },
    { key: "caseInsensitive", type: "boolean", labelKey: "canvas.fields.caseInsensitive" },
  ],
  "core.condition.field_compare": [
    { key: "field", type: "text", labelKey: "canvas.fields.field", placeholderKey: "canvas.placeholders.field" },
    {
      key: "operator",
      type: "select",
      labelKey: "nodes.common.operator",
      options: [
        { value: "contains", labelKey: "canvas.options.operator.contains" },
        { value: "equals", labelKey: "canvas.options.operator.equals" },
        { value: "not_equals", labelKey: "canvas.options.operator.notEquals" },
        { value: "starts_with", labelKey: "canvas.options.operator.startsWith" },
        { value: "ends_with", labelKey: "canvas.options.operator.endsWith" },
        { value: "regex", labelKey: "canvas.options.operator.regex" },
        { value: "gt", labelKey: "canvas.options.operator.gt" },
        { value: "gte", labelKey: "canvas.options.operator.gte" },
        { value: "lt", labelKey: "canvas.options.operator.lt" },
        { value: "lte", labelKey: "canvas.options.operator.lte" },
      ],
    },
    { key: "value", type: "text", labelKey: "nodes.common.value", placeholderKey: "canvas.placeholders.value" },
  ],
  "core.transform.template": [
    { key: "targetPath", type: "text", labelKey: "nodes.common.target", placeholderKey: "canvas.placeholders.targetPath" },
    { key: "template", type: "textarea", labelKey: "canvas.nodes.template", placeholderKey: "canvas.placeholders.template" },
  ],
  "core.transform.iterator": [
    { key: "arrayPath", type: "text", labelKey: "canvas.fields.arrayPath", placeholderKey: "canvas.placeholders.arrayPath" },
    { key: "itemOutputPath", type: "text", labelKey: "canvas.fields.itemOutputPath", placeholderKey: "canvas.placeholders.itemOutputPath" },
    { key: "includeIndex", type: "boolean", labelKey: "canvas.fields.includeIndex" },
    { key: "indexOutputPath", type: "text", labelKey: "canvas.fields.indexOutputPath", placeholderKey: "canvas.placeholders.indexOutputPath" },
  ],
  "core.transform.text_split_lines": [
    { key: "sourcePath", type: "text", labelKey: "canvas.fields.sourcePath", placeholderKey: "canvas.placeholders.sourcePath" },
    { key: "lineOutputPath", type: "text", labelKey: "canvas.fields.lineOutputPath", placeholderKey: "canvas.placeholders.lineOutputPath" },
    { key: "lineNumberOutputPath", type: "text", labelKey: "canvas.fields.lineNumberOutputPath", placeholderKey: "canvas.placeholders.lineNumberOutputPath" },
    { key: "lineIndexOutputPath", type: "text", labelKey: "canvas.fields.lineIndexOutputPath", placeholderKey: "canvas.placeholders.lineIndexOutputPath" },
    { key: "linesOutputPath", type: "text", labelKey: "canvas.fields.linesOutputPath", placeholderKey: "canvas.placeholders.linesOutputPath" },
    { key: "includeEmptyLines", type: "boolean", labelKey: "canvas.fields.includeEmptyLines" },
    { key: "trimLines", type: "boolean", labelKey: "canvas.fields.trimLines" },
    { key: "fanout", type: "boolean", labelKey: "canvas.fields.fanout" },
    { key: "maxLines", type: "number", labelKey: "canvas.fields.maxLines" },
  ],
  "core.transform.regex": [
    {
      key: "sourceMode",
      type: "select",
      labelKey: "canvas.fields.sourceMode",
      options: [
        { value: "inline", labelKey: "canvas.options.sourceMode.inline" },
        { value: "path", labelKey: "canvas.options.sourceMode.path" },
      ],
    },
    { key: "sourcePath", type: "text", labelKey: "canvas.fields.sourcePath", placeholderKey: "canvas.placeholders.sourcePath" },
    { key: "pattern", type: "text", labelKey: "canvas.fields.pattern", placeholderKey: "canvas.placeholders.pattern" },
    { key: "flags", type: "text", labelKey: "canvas.fields.flags", placeholderKey: "canvas.placeholders.flags" },
    {
      key: "outputMode",
      type: "select",
      labelKey: "canvas.fields.outputMode",
      options: [
        { value: "fanout", labelKey: "canvas.options.outputMode.fanout" },
        { value: "first", labelKey: "canvas.options.outputMode.first" },
        { value: "aggregate", labelKey: "canvas.options.outputMode.aggregate" },
      ],
    },
    // fanout / first fields (hidden in aggregate mode)
    { key: "scanByLine", type: "boolean", labelKey: "canvas.fields.scanByLine", showWhen: { key: "outputMode", notIn: ["aggregate"] } },
    { key: "includeNoMatches", type: "boolean", labelKey: "canvas.fields.includeNoMatches", showWhen: { key: "outputMode", notIn: ["aggregate"] } },
    { key: "matchOutputPath", type: "text", labelKey: "canvas.fields.matchOutputPath", placeholderKey: "canvas.placeholders.matchOutputPath", showWhen: { key: "outputMode", notIn: ["aggregate"] } },
    { key: "groupsOutputPath", type: "text", labelKey: "canvas.fields.groupsOutputPath", placeholderKey: "canvas.placeholders.groupsOutputPath", showWhen: { key: "outputMode", notIn: ["aggregate"] } },
    { key: "lineNumberOutputPath", type: "text", labelKey: "canvas.fields.lineNumberOutputPath", placeholderKey: "canvas.placeholders.lineNumberOutputPath", showWhen: { key: "outputMode", notIn: ["aggregate"] } },
    { key: "captureGroupMappings", type: "textarea", labelKey: "canvas.fields.captureGroupMappings", placeholderKey: "canvas.placeholders.captureGroupMappings", showWhen: { key: "outputMode", notIn: ["aggregate"] } },
    { key: "setExternalKeyFromMatch", type: "boolean", labelKey: "canvas.fields.setExternalKeyFromMatch", showWhen: { key: "outputMode", notIn: ["aggregate"] } },
    { key: "externalKeyOutputPath", type: "text", labelKey: "canvas.fields.externalKeyOutputPath", placeholderKey: "canvas.placeholders.externalKeyOutputPath", showWhen: { key: "outputMode", notIn: ["aggregate"] } },
    // aggregate-only fields
    { key: "aggregateOutputPath", type: "text", labelKey: "canvas.fields.aggregateOutputPath", placeholderKey: "canvas.placeholders.aggregateOutputPath", showWhen: { key: "outputMode", isIn: ["aggregate"] } },
    { key: "aggregateValueIndex", type: "number", labelKey: "canvas.fields.aggregateValueIndex", showWhen: { key: "outputMode", isIn: ["aggregate"] } },
    { key: "aggregateValueName", type: "text", labelKey: "canvas.fields.aggregateValueName", placeholderKey: "canvas.placeholders.aggregateValueName", showWhen: { key: "outputMode", isIn: ["aggregate"] } },
    { key: "aggregateUseFullMatch", type: "boolean", labelKey: "canvas.fields.aggregateUseFullMatch", showWhen: { key: "outputMode", isIn: ["aggregate"] } },
  ],

  "core.transform.context_window": [
    { key: "linesPath", type: "text", labelKey: "canvas.fields.linesPath", placeholderKey: "canvas.placeholders.linesPath" },
    { key: "sourcePath", type: "text", labelKey: "canvas.fields.sourcePath", placeholderKey: "canvas.placeholders.sourcePath" },
    { key: "lineNumberPath", type: "text", labelKey: "canvas.fields.lineNumberPath", placeholderKey: "canvas.placeholders.lineNumberPath" },
    { key: "beforeLines", type: "number", labelKey: "canvas.fields.beforeLines" },
    { key: "afterLines", type: "number", labelKey: "canvas.fields.afterLines" },
    { key: "outputPath", type: "text", labelKey: "canvas.fields.outputPath", placeholderKey: "canvas.placeholders.outputPath" },
  ],
  "core.transform.hash_compose": [
    { key: "sourcePaths", type: "textarea", labelKey: "canvas.fields.sourcePaths", placeholderKey: "canvas.placeholders.sourcePaths" },
    { key: "separator", type: "text", labelKey: "canvas.fields.separator", placeholderKey: "canvas.placeholders.separator" },
    {
      key: "algorithm",
      type: "select",
      labelKey: "canvas.fields.algorithm",
      options: [
        { value: "sha1", labelKey: "canvas.options.algorithm.sha1" },
        { value: "sha256", labelKey: "canvas.options.algorithm.sha256" },
        { value: "sha512", labelKey: "canvas.options.algorithm.sha512" },
        { value: "md5", labelKey: "canvas.options.algorithm.md5" },
      ],
    },
    { key: "truncate", type: "number", labelKey: "canvas.fields.truncate" },
    { key: "outputPath", type: "text", labelKey: "canvas.fields.outputPath", placeholderKey: "canvas.placeholders.outputPath" },
    { key: "setExternalKey", type: "boolean", labelKey: "canvas.fields.setExternalKey" },
  ],
  "core.transform.coalesce": [
    { key: "sourcePaths", type: "textarea", labelKey: "canvas.fields.sourcePaths", placeholderKey: "canvas.placeholders.sourcePaths" },
    { key: "outputPath", type: "text", labelKey: "canvas.fields.outputPath", placeholderKey: "canvas.placeholders.outputPath" },
    { key: "skipEmpty", type: "boolean", labelKey: "canvas.fields.skipEmpty" },
  ],
  "core.transform.array_compact": [
    { key: "sourcePath", type: "text", labelKey: "canvas.fields.sourcePath", placeholderKey: "canvas.placeholders.sourcePath" },
    { key: "outputPath", type: "text", labelKey: "canvas.fields.outputPath", placeholderKey: "canvas.placeholders.outputPath" },
    { key: "dedupe", type: "boolean", labelKey: "canvas.fields.dedupe" },
    { key: "trimStrings", type: "boolean", labelKey: "canvas.fields.trimStrings" },
    { key: "removeEmpty", type: "boolean", labelKey: "canvas.fields.removeEmpty" },
  ],
  "core.transform.json_normalize": [
    { key: "sourcePath", type: "text", labelKey: "canvas.fields.sourcePath", placeholderKey: "canvas.placeholders.sourcePath" },
    { key: "outputPath", type: "text", labelKey: "canvas.fields.outputPath", placeholderKey: "canvas.placeholders.outputPath" },
    { key: "mergeIntoRoot", type: "boolean", labelKey: "canvas.fields.mergeIntoRoot" },
  ],

  "core.transform.join_fields": [
    { key: "fields", type: "textarea", labelKey: "canvas.fields.fields", placeholderKey: "canvas.placeholders.fields" },
    { key: "separator", type: "text", labelKey: "canvas.fields.separator", placeholderKey: "canvas.placeholders.separator" },
    { key: "outputPath", type: "text", labelKey: "canvas.fields.outputPath", placeholderKey: "canvas.placeholders.outputPath" },
    { key: "skipEmpty", type: "boolean", labelKey: "canvas.fields.skipEmpty" },
  ],
  "core.transform.hash_join": [
    { key: "sourcePath", type: "text", labelKey: "canvas.fields.sourcePath", placeholderKey: "canvas.placeholders.sourcePath" },
    { key: "fields", type: "textarea", labelKey: "canvas.fields.fields", placeholderKey: "canvas.placeholders.fields" },
    { key: "separator", type: "text", labelKey: "canvas.fields.separator", placeholderKey: "canvas.placeholders.separator" },
    {
      key: "algorithm",
      type: "select",
      labelKey: "canvas.fields.algorithm",
      options: [
        { value: "sha1", labelKey: "canvas.options.algorithm.sha1" },
        { value: "sha256", labelKey: "canvas.options.algorithm.sha256" },
        { value: "sha512", labelKey: "canvas.options.algorithm.sha512" },
        { value: "md5", labelKey: "canvas.options.algorithm.md5" },
      ],
    },
    { key: "truncate", type: "number", labelKey: "canvas.fields.truncate" },
    { key: "outputPath", type: "text", labelKey: "canvas.fields.outputPath", placeholderKey: "canvas.placeholders.outputPath" },
    { key: "setExternalKey", type: "boolean", labelKey: "canvas.fields.setExternalKey" },
  ],
  "core.logic.if_else": [
    { key: "field", type: "text", labelKey: "canvas.fields.field", placeholderKey: "canvas.placeholders.field" },
    {
      key: "operator",
      type: "select",
      labelKey: "nodes.common.operator",
      options: [
        { value: "contains", labelKey: "canvas.options.operator.contains" },
        { value: "equals", labelKey: "canvas.options.operator.equals" },
        { value: "not_equals", labelKey: "canvas.options.operator.notEquals" },
        { value: "starts_with", labelKey: "canvas.options.operator.startsWith" },
        { value: "ends_with", labelKey: "canvas.options.operator.endsWith" },
        { value: "regex", labelKey: "canvas.options.operator.regex" },
      ],
    },
    { key: "value", type: "text", labelKey: "nodes.common.value", placeholderKey: "canvas.placeholders.value" },
  ],
  "core.action.delay": [
    { key: "delayMs", type: "number", labelKey: "canvas.placeholders.delayMs" },
  ],
  "killio.action.create_card": [
    { key: "boardId", type: "text", labelKey: "canvas.fields.boardId", placeholderKey: "canvas.placeholders.boardId" },
    { key: "listId", type: "text", labelKey: "canvas.fields.listId", placeholderKey: "canvas.placeholders.listId" },
    { key: "titleTemplate", type: "text", labelKey: "canvas.fields.titleTemplate", placeholderKey: "canvas.placeholders.titleTemplate" },
  ],
  "killio.action.add_brick": [
    {
      key: "brickType",
      type: "select",
      labelKey: "canvas.fields.brickType",
      options: [
        { value: "text", labelKey: "canvas.options.brickType.text" },
      ],
    },
    {
      key: "displayStyle",
      type: "select",
      labelKey: "canvas.fields.displayStyle",
      options: [
        { value: "paragraph", labelKey: "canvas.options.displayStyle.paragraph" },
        { value: "checklist", labelKey: "canvas.options.displayStyle.checklist" },
        { value: "quote", labelKey: "canvas.options.displayStyle.quote" },
        { value: "code", labelKey: "canvas.options.displayStyle.code" },
        { value: "callout", labelKey: "canvas.options.displayStyle.callout" },
      ],
    },
    { key: "contentTemplate", type: "textarea", labelKey: "canvas.fields.contentTemplate", placeholderKey: "canvas.placeholders.contentTemplate" },
    { key: "position", type: "number", labelKey: "canvas.fields.position" },
    { key: "parentBlockId", type: "text", labelKey: "canvas.fields.parentBlockId", placeholderKey: "canvas.placeholders.parentBlockId" },
  ],
  "killio.action.document.create": [
    { key: "titleTemplate", type: "text", labelKey: "canvas.fields.titleTemplate", placeholderKey: "canvas.placeholders.titleTemplate" },
    { key: "folderId", type: "text", labelKey: "canvas.fields.folderId", placeholderKey: "canvas.placeholders.folderId" },
  ],
  "killio.action.update_card": [
    { key: "titleTemplate", type: "text", labelKey: "canvas.fields.titleTemplate", placeholderKey: "canvas.placeholders.titleTemplate" },
  ],
  "killio.action.move_card": [
    { key: "targetListId", type: "text", labelKey: "canvas.fields.targetListId", placeholderKey: "canvas.placeholders.targetListId" },
    { key: "archiveOnMove", type: "boolean", labelKey: "canvas.fields.archiveOnMove" },
  ],
  "killio.action.assign_card": [
    { key: "mentionCandidatesPath", type: "text", labelKey: "canvas.fields.mentionCandidatesPath", placeholderKey: "canvas.placeholders.mentionCandidatesPath" },
    { key: "staticAssigneeIds", type: "textarea", labelKey: "canvas.fields.staticAssigneeIds", placeholderKey: "canvas.placeholders.staticAssigneeIds" },
  ],
  "killio.table.read": [
    { key: "tableId", type: "text", labelKey: "canvas.placeholders.tableId", placeholderKey: "canvas.placeholders.tableId" },
    { key: "keyPath", type: "text", labelKey: "canvas.placeholders.keyPath", placeholderKey: "canvas.placeholders.keyPath" },
    { key: "outputPath", type: "text", labelKey: "canvas.placeholders.outputPath", placeholderKey: "canvas.placeholders.outputPath" },
  ],
  "killio.table.write": [
    { key: "tableId", type: "text", labelKey: "canvas.placeholders.tableId", placeholderKey: "canvas.placeholders.tableId" },
    { key: "keyPath", type: "text", labelKey: "canvas.placeholders.keyPath", placeholderKey: "canvas.placeholders.keyPath" },
    { key: "valuesPath", type: "text", labelKey: "canvas.placeholders.valuesPath", placeholderKey: "canvas.placeholders.valuesPath" },
  ],
  "core.filter.dedup": [
    { key: "keyPath", type: "text", labelKey: "canvas.fields.keyPath", placeholderKey: "canvas.placeholders.keyPath" },
    { key: "keepFirst", type: "boolean", labelKey: "canvas.fields.keepFirst" },
  ],
  "core.filter.first_seen": [
    { key: "keyPath", type: "text", labelKey: "canvas.fields.keyPath", placeholderKey: "canvas.placeholders.keyPath" },
    { key: "fallbackToExternalKey", type: "boolean", labelKey: "canvas.fields.fallbackToExternalKey" },
    { key: "markOutputPath", type: "text", labelKey: "canvas.fields.markOutputPath", placeholderKey: "canvas.placeholders.markOutputPath" },
  ],
  "core.logic.switch": [
    { key: "field", type: "text", labelKey: "canvas.fields.field", placeholderKey: "canvas.placeholders.field" },
    { key: "routes", type: "textarea", labelKey: "canvas.fields.routes", placeholderKey: "canvas.placeholders.routes" },
  ],
  "core.action.http_request": [
    { key: "url", type: "text", labelKey: "canvas.fields.url", placeholderKey: "canvas.placeholders.url" },
    {
      key: "method",
      type: "select",
      labelKey: "canvas.fields.method",
      options: [
        { value: "GET", labelKey: "canvas.options.httpMethod.get" },
        { value: "POST", labelKey: "canvas.options.httpMethod.post" },
        { value: "PUT", labelKey: "canvas.options.httpMethod.put" },
        { value: "PATCH", labelKey: "canvas.options.httpMethod.patch" },
        { value: "DELETE", labelKey: "canvas.options.httpMethod.delete" },
      ],
    },
    { key: "bodyTemplate", type: "textarea", labelKey: "canvas.fields.bodyTemplate", placeholderKey: "canvas.placeholders.bodyTemplate" },
    { key: "outputPath", type: "text", labelKey: "canvas.fields.outputPath", placeholderKey: "canvas.placeholders.outputPath" },
    { key: "timeoutMs", type: "number", labelKey: "canvas.placeholders.delayMs" },
  ],
  "core.action.js_code": [
    { key: "code", type: "code", labelKey: "canvas.fields.code", placeholderKey: "canvas.placeholders.code" },
    { key: "timeoutMs", type: "number", labelKey: "canvas.placeholders.delayMs" },
  ],
};

interface ScriptCanvasProps {
  scriptId: string;
  graph: ScriptGraph | null;
  isActive: boolean;
  webhookUrl?: string | null;
  teamId?: string;
  accessToken?: string;
  onSave: (graph: ScriptGraph) => Promise<void>;
  onToggle: (isActive: boolean) => Promise<void>;
  canRunManually?: boolean;
  onRunManual?: () => Promise<void>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers: convert backend ScriptGraph into ReactFlow nodes/edges
// ─────────────────────────────────────────────────────────────────────────────

function toRfNodes(backendNodes: ScriptNodeData[]): Node[] {
  return backendNodes.map((n) => ({
    id: n.id,
    type: n.nodeKind,
    position: { x: n.positionX, y: n.positionY },
    data: { config: n.config, label: n.label ?? n.nodeKind },
  }));
}

function toRfEdges(backendEdges: ScriptEdgeData[]): Edge[] {
  return backendEdges.map((e) => ({
    id: e.id,
    source: e.sourceNodeId,
    target: e.targetNodeId,
    sourceHandle: e.sourceHandle ?? undefined,
    targetHandle: e.targetHandle ?? undefined,
  }));
}

function fromRfGraph(nodes: Node[], edges: Edge[], scriptId: string): ScriptGraph {
  const backendNodes: ScriptNodeData[] = nodes.map((n) => ({
    id: n.id,
    scriptId,
    nodeKind: n.type as NodeKind,
    label: (n.data?.label as string) ?? null,
    config: (n.data?.config as Record<string, any>) ?? {},
    positionX: n.position.x,
    positionY: n.position.y,
  }));

  const backendEdges: ScriptEdgeData[] = edges.map((e) => ({
    id: e.id,
    scriptId,
    sourceNodeId: e.source,
    targetNodeId: e.target,
    sourceHandle: e.sourceHandle ?? null,
    targetHandle: e.targetHandle ?? null,
  }));

  return { nodes: backendNodes, edges: backendEdges };
}

function buildNodePayloadPreview(node: Node | null): Record<string, unknown> | null {
  if (!node || node.type !== "github.trigger.commit") {
    return null;
  }

  const config = (node.data?.config as Record<string, any>) ?? {};
  const repoFullName = typeof config.repoFullName === "string" && config.repoFullName.trim().length > 0
    ? config.repoFullName.trim()
    : "owner/repo";
  const branch = typeof config.branch === "string" && config.branch.trim().length > 0
    ? config.branch.trim()
    : "main";

  return {
    externalKey: "8f3d2a4c6b9e1f0a7c5d4e2b1a098765",
    data: {
      repositoryFullName: repoFullName,
      repoFullName,
      commitSha: "abc123def4567890",
      commitMessage: "feat: update automation flow",
      authorName: "Jane Doe",
      authorEmail: "jane@example.com",
      authorUsername: "janedoe",
      branch,
      installationId: 123456,
      filesCount: 2,
      files: [
        {
          filePath: "src/example.ts",
          fileContent: "// TODO: improve this function",
          fileDiff: "@@ -10,0 +11,1 @@\n+// TODO: improve this function",
          fileStatus: "modified",
          commitSha: "abc123def4567890",
          removed: false,
        },
        {
          filePath: "src/legacy.ts",
          fileContent: null,
          fileDiff: "@@ -1,12 +0,0 @@\n- old file removed",
          fileStatus: "removed",
          commitSha: "abc123def4567890",
          removed: true,
        },
      ],
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function ScriptCanvas({ scriptId, graph, isActive, webhookUrl, teamId, accessToken, onSave, onToggle, canRunManually, onRunManual }: ScriptCanvasProps) {
  const t = useTranslations("integrations");
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(graph ? toRfNodes(graph.nodes) : []);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(graph ? toRfEdges(graph.edges) : []);
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [running, setRunning] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [rawConfigDraft, setRawConfigDraft] = useState("{}");
  const [rawConfigError, setRawConfigError] = useState<string | null>(null);
  const [previewRun, setPreviewRun] = useState<ScriptRunLog | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const rfInstanceRef = useRef<ReactFlowInstance | null>(null);

  const selectedNode = useMemo(
    () => (selectedNodeId ? nodes.find((node) => node.id === selectedNodeId) ?? null : null),
    [nodes, selectedNodeId],
  );

  const selectedNodeKind = selectedNode?.type as NodeKind | undefined;
  const selectedNodeFields = (selectedNodeKind ? NODE_CONFIG_FIELDS[selectedNodeKind] : undefined) ?? [];

  const selectedNodeOutputs = useMemo(() => {
    if (!previewRun || !selectedNodeId) return null;
    const outputs = previewRun.nodeOutputs as Record<string, unknown[]>;
    return outputs[selectedNodeId] ?? null;
  }, [previewRun, selectedNodeId]);

  const selectedNodePayloadPreview = useMemo(
    () => buildNodePayloadPreview(selectedNode),
    [selectedNode],
  );

  // Re-initialise when a new graph loads
  useEffect(() => {
    if (graph) {
      setNodes(toRfNodes(graph.nodes));
      setEdges(toRfEdges(graph.edges));
      setSelectedNodeId(null);
    }
  }, [graph, setNodes, setEdges]);

  useEffect(() => {
    if (!selectedNode) {
      setRawConfigDraft("{}");
      setRawConfigError(null);
      return;
    }

    setRawConfigDraft(JSON.stringify((selectedNode.data?.config as Record<string, any>) ?? {}, null, 2));
    setRawConfigError(null);
  }, [selectedNode]);

  const onConnect = useCallback(
    (connection: Connection) => setEdges((eds) => addEdge(connection, eds)),
    [setEdges],
  );

  // Drop a new node from the palette onto the canvas
  const onDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      const nodeKind = event.dataTransfer.getData("application/killio-node-kind") as NodeKind;
      if (!nodeKind || !rfInstanceRef.current) return;

      const position = rfInstanceRef.current.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const newNode: Node = {
        id: `node-${Date.now()}`,
        type: nodeKind,
        position,
        data: { config: {}, label: nodeKind },
      };

      setNodes((nds) => nds.concat(newNode));
    },
    [setNodes],
  );

  const onDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const updateSelectedNode = useCallback((updater: (node: Node) => Node) => {
    if (!selectedNodeId) return;
    setNodes((currentNodes) => currentNodes.map((node) => (
      node.id === selectedNodeId ? updater(node) : node
    )));
  }, [selectedNodeId, setNodes]);

  const handleConfigFieldChange = useCallback((field: ConfigField, value: string | boolean) => {
    updateSelectedNode((node) => {
      const currentConfig = (node.data?.config as Record<string, any>) ?? {};
      const nextConfig = { ...currentConfig };

      if (field.type === "boolean") {
        nextConfig[field.key] = Boolean(value);
      } else if (field.type === "number") {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) {
          nextConfig[field.key] = parsed;
        } else {
          delete nextConfig[field.key];
        }
      } else {
        const textValue = String(value);
        if (textValue.length === 0) {
          delete nextConfig[field.key];
        } else if (field.key === "fields" || field.key === "staticAssigneeIds" || field.key === "sourcePaths") {
          nextConfig[field.key] = textValue
            .split(/\r?\n|,/)
            .map((part) => part.trim())
            .filter(Boolean);
        } else if (field.key === "captureGroupMappings") {
          nextConfig[field.key] = textValue
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean)
            .map((line) => {
              const colonIndex = line.indexOf(":");
              if (colonIndex > 0) {
                const left = line.slice(0, colonIndex).trim();
                const right = line.slice(colonIndex + 1).trim();
                const numeric = Number(left);
                if (Number.isFinite(numeric)) {
                  return { index: numeric, outputPath: right };
                }
                return { name: left, outputPath: right };
              }

              const eqIndex = line.indexOf("=");
              if (eqIndex > 0) {
                const left = line.slice(0, eqIndex).trim();
                const right = line.slice(eqIndex + 1).trim();
                const numeric = Number(left);
                if (Number.isFinite(numeric)) {
                  return { index: numeric, outputPath: right };
                }
                return { name: left, outputPath: right };
              }

              return { index: 1, outputPath: line };
            });
        } else {
          nextConfig[field.key] = textValue;
        }
      }

      return {
        ...node,
        data: {
          ...node.data,
          config: nextConfig,
        },
      };
    });
  }, [updateSelectedNode]);

  const handleApplyRawConfig = useCallback(() => {
    try {
      const parsed = JSON.parse(rawConfigDraft) as Record<string, any>;
      updateSelectedNode((node) => ({
        ...node,
        data: {
          ...node.data,
          config: parsed,
        },
      }));
      setRawConfigError(null);
    } catch {
      setRawConfigError(t("canvas.invalidJson"));
    }
  }, [rawConfigDraft, t, updateSelectedNode]);

  const handleLabelChange = useCallback((value: string) => {
    updateSelectedNode((node) => ({
      ...node,
      data: {
        ...node.data,
        label: value,
      },
    }));
  }, [updateSelectedNode]);

  const handlePreviewOutput = useCallback(async () => {
    if (!teamId || !accessToken) return;
    setPreviewLoading(true);
    try {
      const run = await getLatestRunOutputs(scriptId, teamId, accessToken);
      setPreviewRun(run);
    } finally {
      setPreviewLoading(false);
    }
  }, [scriptId, teamId, accessToken]);

  useEffect(() => {
    if (!isFullscreen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsFullscreen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isFullscreen]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(fromRfGraph(nodes, edges, scriptId));
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async () => {
    setToggling(true);
    try {
      await onToggle(!isActive);
    } finally {
      setToggling(false);
    }
  };

  const handleRunManual = async () => {
    if (!onRunManual) return;
    setRunning(true);
    try {
      await onRunManual();
    } finally {
      setRunning(false);
    }
  };

  const handleCopyWebhookUrl = async () => {
    if (!webhookUrl) return;
    await navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div
      className={cn(
        "flex min-w-0 flex-1 flex-col bg-background",
        isFullscreen ? "fixed inset-0 z-[200] shadow-2xl" : "h-full",
      )}
    >
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-card/60 px-3 py-2 sm:px-4">
        <div className="min-w-0 flex-1">
          <span className="text-sm font-medium text-foreground">{t("canvas.editorTitle")}</span>
          {webhookUrl && (
            <div className="mt-1 flex items-center gap-2">
              <input
                readOnly
                value={webhookUrl}
                className="w-full max-w-[520px] truncate rounded border border-border bg-background px-2 py-1 text-[11px] text-muted-foreground"
              />
              <button
                type="button"
                onClick={handleCopyWebhookUrl}
                className="inline-flex items-center gap-1 rounded border border-border bg-background px-2 py-1 text-[11px] font-medium text-foreground hover:bg-accent/10"
              >
                {copied ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                {copied ? t("canvas.webhookCopied") : t("canvas.copyWebhook")}
              </button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsFullscreen((prev) => !prev)}
            className="flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent/10"
            title={isFullscreen ? t("canvas.exitFullscreen") : t("canvas.fullscreen")}
          >
            {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            {isFullscreen ? t("canvas.exitFullscreen") : t("canvas.fullscreen")}
          </button>
          {teamId && accessToken && (
            <button
              onClick={handlePreviewOutput}
              disabled={previewLoading}
              className="flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent/10 disabled:opacity-60"
              title={t("canvas.previewOutput")}
            >
              {previewLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
              {t("canvas.previewOutput")}
            </button>
          )}
          {canRunManually && (
            <button
              onClick={handleRunManual}
              disabled={running}
              className="flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
              {running ? t("canvas.running") : t("canvas.runManual")}
            </button>
          )}
          <button
            onClick={handleToggle}
            disabled={toggling}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              isActive
                ? "bg-green-100 text-green-700 hover:bg-green-200"
                : "bg-muted text-muted-foreground hover:bg-accent/20"
            }`}
          >
            {toggling ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Power className="h-3.5 w-3.5" />
            )}
            {isActive ? t("scripts.active") : t("scripts.inactive")}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            {saving ? t("canvas.saving") : t("canvas.save")}
          </button>
        </div>
      </div>

      {/* Canvas + Palette */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden md:flex-row">
        <NodePalette />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden xl:flex-row">
          <div
            className="min-h-0 min-w-0 flex-1"
            onDrop={onDrop}
            onDragOver={onDragOver}
          >
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              nodeTypes={nodeTypes}
              onNodeClick={(_, node) => setSelectedNodeId(node.id)}
              onPaneClick={() => setSelectedNodeId(null)}
              onInit={(instance) => { rfInstanceRef.current = instance; }}
              fitView
              className="killio-reactflow h-full w-full bg-background"
            >
              <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="var(--rf-dots-color)" />
              <Controls />
              <MiniMap nodeStrokeWidth={3} zoomable pannable />
            </ReactFlow>
          </div>

          <aside className="h-[300px] overflow-y-auto border-t border-border bg-card/40 p-3 xl:h-auto xl:w-80 xl:border-l xl:border-t-0">
            <div className="mb-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("canvas.nodeConfigTitle")}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">{t("canvas.nodeConfigHint")}</p>
            </div>

            {!selectedNode ? (
              <p className="rounded-md border border-dashed border-border px-3 py-3 text-xs text-muted-foreground">
                {t("canvas.noNodeSelected")}
              </p>
            ) : (
              <div className="space-y-3">
                <div className="rounded-md border border-border bg-background px-2.5 py-2 text-[11px] text-muted-foreground">
                  <p className="truncate"><span className="font-semibold text-foreground">{t("canvas.nodeType")}</span>: {selectedNode.type}</p>
                  <p className="truncate"><span className="font-semibold text-foreground">ID</span>: {selectedNode.id}</p>
                </div>

                <div>
                  <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                    {t("canvas.nodeLabel")}
                  </label>
                  <input
                    type="text"
                    value={String((selectedNode.data?.label as string) ?? "")}
                    onChange={(event) => handleLabelChange(event.target.value)}
                    className="w-full rounded-md border border-border bg-background px-2.5 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    placeholder={t("canvas.nodeLabelPlaceholder")}
                  />
                </div>

                {selectedNodeFields.map((field) => {
                  const config = (selectedNode.data?.config as Record<string, any>) ?? {};

                  if (field.showWhen) {
                    const condVal = String(config[field.showWhen.key] ?? "");
                    if (field.showWhen.isIn && !field.showWhen.isIn.includes(condVal)) return null;
                    if (field.showWhen.notIn && field.showWhen.notIn.includes(condVal)) return null;
                  }

                  const value = config[field.key];

                  if (field.type === "boolean") {
                    return (
                      <label key={field.key} className="flex items-center gap-2 text-xs text-foreground">
                        <input
                          type="checkbox"
                          checked={Boolean(value)}
                          onChange={(event) => handleConfigFieldChange(field, event.target.checked)}
                          className="h-4 w-4 rounded border-border"
                        />
                        {t(field.labelKey)}
                      </label>
                    );
                  }

                  if (field.type === "textarea") {
                    const textAreaValue = Array.isArray(value)
                      ? value.join("\n")
                      : typeof value === "string"
                        ? value
                        : "";

                    return (
                      <div key={field.key}>
                        <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                          {t(field.labelKey)}
                        </label>
                        <textarea
                          rows={3}
                          value={textAreaValue}
                          onChange={(event) => handleConfigFieldChange(field, event.target.value)}
                          placeholder={field.placeholderKey ? t(field.placeholderKey) : undefined}
                          className="w-full rounded-md border border-border bg-background px-2.5 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                      </div>
                    );
                  }

                  if (field.type === "select") {
                    const selectedValue = typeof value === "string" ? value : "";
                    return (
                      <div key={field.key}>
                        <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                          {t(field.labelKey)}
                        </label>
                        <select
                          value={selectedValue}
                          onChange={(event) => handleConfigFieldChange(field, event.target.value)}
                          className="w-full rounded-md border border-border bg-background px-2.5 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                        >
                          <option value="">{t("canvas.selectPlaceholder")}</option>
                          {(field.options ?? []).map((option) => (
                            <option key={option.value} value={option.value}>{t(option.labelKey)}</option>
                          ))}
                        </select>
                      </div>
                    );
                  }

                  if (field.type === "code") {
                    return (
                      <div key={field.key}>
                        <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                          {t(field.labelKey)}
                        </label>
                        <textarea
                          rows={12}
                          value={typeof value === "string" ? value : ""}
                          onChange={(event) => handleConfigFieldChange(field, event.target.value)}
                          placeholder={field.placeholderKey ? t(field.placeholderKey) : undefined}
                          spellCheck={false}
                          className="w-full rounded-md border border-border bg-background px-2.5 py-2 font-mono text-[11px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                      </div>
                    );
                  }

                  return (
                    <div key={field.key}>
                      <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                        {t(field.labelKey)}
                      </label>
                      <input
                        type={field.type === "number" ? "number" : "text"}
                        value={field.type === "number" ? (typeof value === "number" ? String(value) : "") : (typeof value === "string" ? value : "")}
                        onChange={(event) => handleConfigFieldChange(field, event.target.value)}
                        placeholder={field.placeholderKey ? t(field.placeholderKey) : undefined}
                        className="w-full rounded-md border border-border bg-background px-2.5 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                    </div>
                  );
                })}

                <div className="border-t border-border pt-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {t("canvas.previewOutput")}
                      </p>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {t("canvas.previewOutputHint")}
                      </p>
                    </div>
                    {teamId && accessToken && (
                      <button
                        type="button"
                        onClick={handlePreviewOutput}
                        disabled={previewLoading}
                        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-[11px] font-medium text-foreground hover:bg-accent/10 disabled:opacity-60"
                      >
                        {previewLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
                        {previewLoading ? t("canvas.refreshingPreview") : t("canvas.refreshPreview")}
                      </button>
                    )}
                  </div>

                  {selectedNodePayloadPreview && (
                    <div className="mb-3">
                      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {t("canvas.payloadPreview")}
                      </p>
                      <p className="mb-2 text-[11px] text-muted-foreground">
                        {t("canvas.githubPayloadHint")}
                      </p>
                      <pre className="max-h-48 overflow-auto rounded-md border border-border bg-background p-2 font-mono text-[10px] text-foreground">
                        {JSON.stringify(selectedNodePayloadPreview, null, 2)}
                      </pre>
                    </div>
                  )}

                  {previewRun ? (
                    <div>
                      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {t("canvas.lastRunOutput")}
                      </p>
                      {selectedNodeOutputs ? (
                        <pre className="max-h-48 overflow-auto rounded-md border border-border bg-background p-2 font-mono text-[10px] text-foreground">
                          {JSON.stringify(selectedNodeOutputs, null, 2)}
                        </pre>
                      ) : (
                        <p className="text-[11px] italic text-muted-foreground">{t("canvas.noOutputForNode")}</p>
                      )}
                    </div>
                  ) : (
                    <p className="text-[11px] italic text-muted-foreground">{t("canvas.noPreviewLoaded")}</p>
                  )}
                </div>

                {/* Raw config section */}
                <div className="border-t border-border pt-3">
                  <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                    {t("canvas.rawConfig")}
                  </label>
                  <textarea
                    rows={8}
                    value={rawConfigDraft}
                    onChange={(event) => setRawConfigDraft(event.target.value)}
                    className="w-full rounded-md border border-border bg-background px-2.5 py-2 font-mono text-[11px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  {rawConfigError && (
                    <p className="mt-2 text-[11px] text-destructive">{rawConfigError}</p>
                  )}
                  <button
                    type="button"
                    onClick={handleApplyRawConfig}
                    className="mt-2 rounded-md border border-border bg-background px-2.5 py-1.5 text-[11px] font-medium text-foreground hover:bg-accent/10"
                  >
                    {t("canvas.applyJson")}
                  </button>
                </div>
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
