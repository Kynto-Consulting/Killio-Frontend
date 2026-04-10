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

import { ScriptGraph, ScriptNodeData, ScriptEdgeData, NodeKind, ScriptRunLog, getLatestRunOutputs, listSharedTables } from "@/lib/api/scripts";
import { getBoard, listTeamBoards, type BoardSummary, type ListView } from "@/lib/api/contracts";
import { listFolders, type Folder } from "@/lib/api/folders";
import {
  listGithubInstallations,
  listGithubInstallationRepositories,
  listGithubInstallationBranches,
  listWhatsappCredentials,
  listSlackWebhookCredentials,
  type GithubAppInstallation,
  type GithubInstallationRepository,
  type GithubInstallationBranch,
  type WhatsappManualCredential,
  type SlackWebhookManualCredential,
} from "@/lib/api/integrations";
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
  labelKey?: string;
  label?: string;
}

interface SelectOptionContext {
  config: Record<string, any>;
  boards: BoardSummary[];
  boardListsByBoardId: Record<string, ListView[]>;
  folders: Folder[];
  tables: Array<{ id: string; name: string }>;
  githubRepositories: GithubInstallationRepository[];
  githubBranchesByRepo: Record<string, GithubInstallationBranch[]>;
  whatsappCredentials: WhatsappManualCredential[];
  slackWebhookCredentials: SlackWebhookManualCredential[];
}

interface ConfigField {
  key: string;
  type: ConfigFieldType;
  labelKey: string;
  placeholderKey?: string;
  options?: ConfigFieldOption[];
  optionsResolver?: (context: SelectOptionContext) => ConfigFieldOption[];
  /** Show this field only when another field's value matches */
  showWhen?: { key: string; isIn?: string[]; notIn?: string[] };
}

const WHATSAPP_SEND_VARIANT = "whatsapp.send_message";

function isFieldVisible(field: ConfigField, config: Record<string, any>): boolean {
  if (!field.showWhen) return true;
  const condVal = String(config[field.showWhen.key] ?? "");
  if (field.showWhen.isIn && !field.showWhen.isIn.includes(condVal)) return false;
  if (field.showWhen.notIn && field.showWhen.notIn.includes(condVal)) return false;
  return true;
}

function buildFolderPath(folder: Folder, foldersById: Map<string, Folder>, cache: Map<string, string>): string {
  const cached = cache.get(folder.id);
  if (cached) return cached;

  const parentId = folder.parentFolderId ?? null;
  const path = parentId && foldersById.has(parentId)
    ? `${buildFolderPath(foldersById.get(parentId) as Folder, foldersById, cache)} / ${folder.name}`
    : folder.name;
  cache.set(folder.id, path);
  return path;
}

function flattenBoardLists(boards: BoardSummary[], boardListsByBoardId: Record<string, ListView[]>): ConfigFieldOption[] {
  return boards.flatMap((board) => {
    const lists = boardListsByBoardId[board.id] ?? [];
    return lists.map((list) => ({
      value: list.id,
      label: `${board.name} / ${list.name}`,
    }));
  });
}

function resolveWhatsappCredentialOptions(credentials: WhatsappManualCredential[]): ConfigFieldOption[] {
  return credentials
    .filter((credential) => credential.isActive)
    .map((credential) => ({
      value: credential.id,
      label: `${credential.name} · ${credential.phoneNumberId}`,
    }));
}

function resolveSlackWebhookCredentialOptions(credentials: SlackWebhookManualCredential[]): ConfigFieldOption[] {
  return credentials
    .filter((credential) => credential.isActive)
    .map((credential) => ({
      value: credential.id,
      label: credential.name,
    }));
}

function normalizeSwitchRoutes(raw: unknown): Array<{ value: string; handle: string }> {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return Object.entries(raw as Record<string, unknown>).map(([value, handle]) => ({
      value,
      handle: String(handle ?? ""),
    }));
  }

  if (Array.isArray(raw)) {
    return raw.flatMap((entry) => {
      if (!entry || typeof entry !== "object") return [];
      const parsed = entry as Record<string, unknown>;
      const value = String(parsed.value ?? parsed.key ?? "").trim();
      const handle = String(parsed.handle ?? parsed.output ?? "").trim();
      if (!value) return [];
      return [{ value, handle }];
    });
  }

  if (typeof raw === "string" && raw.trim()) {
    return raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const separatorIndex = line.indexOf(":");
        if (separatorIndex > 0) {
          return {
            value: line.slice(0, separatorIndex).trim(),
            handle: line.slice(separatorIndex + 1).trim(),
          };
        }
        const equalsIndex = line.indexOf("=");
        if (equalsIndex > 0) {
          return {
            value: line.slice(0, equalsIndex).trim(),
            handle: line.slice(equalsIndex + 1).trim(),
          };
        }
        return { value: line, handle: "default" };
      })
      .filter((entry) => entry.value.length > 0);
  }

  return [];
}

function normalizeJsonMappings(raw: unknown): Array<{ targetPath: string; sourcePath: string }> {
  if (Array.isArray(raw)) {
    return raw.flatMap((entry) => {
      if (!entry || typeof entry !== "object") return [];
      const parsed = entry as Record<string, unknown>;
      const targetPath = String(parsed.targetPath ?? "").trim();
      const sourcePath = String(parsed.sourcePath ?? parsed.value ?? "").trim();
      if (!targetPath && !sourcePath) return [];
      return [{ targetPath, sourcePath }];
    });
  }

  if (typeof raw === "string" && raw.trim()) {
    return raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const separatorIndex = line.indexOf(":");
        if (separatorIndex > 0) {
          return {
            targetPath: line.slice(0, separatorIndex).trim(),
            sourcePath: line.slice(separatorIndex + 1).trim(),
          };
        }
        const equalsIndex = line.indexOf("=");
        if (equalsIndex > 0) {
          return {
            targetPath: line.slice(0, equalsIndex).trim(),
            sourcePath: line.slice(equalsIndex + 1).trim(),
          };
        }
        return { targetPath: line, sourcePath: "" };
      })
      .filter((entry) => entry.targetPath.length > 0 || entry.sourcePath.length > 0);
  }

  return [];
}

function normalizeHttpHeaders(raw: unknown): Array<{ key: string; value: string }> {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return Object.entries(raw as Record<string, unknown>).map(([key, value]) => ({
      key,
      value: String(value ?? ""),
    }));
  }

  if (Array.isArray(raw)) {
    return raw.flatMap((entry) => {
      if (!entry || typeof entry !== "object") return [];
      const parsed = entry as Record<string, unknown>;
      const key = String(parsed.key ?? parsed.name ?? "").trim();
      const value = String(parsed.value ?? "").trim();
      if (!key) return [];
      return [{ key, value }];
    });
  }

  if (typeof raw === "string" && raw.trim()) {
    return raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const separatorIndex = line.indexOf(":");
        if (separatorIndex > 0) {
          return {
            key: line.slice(0, separatorIndex).trim(),
            value: line.slice(separatorIndex + 1).trim(),
          };
        }

        const equalsIndex = line.indexOf("=");
        if (equalsIndex > 0) {
          return {
            key: line.slice(0, equalsIndex).trim(),
            value: line.slice(equalsIndex + 1).trim(),
          };
        }

        return { key: line, value: "" };
      })
      .filter((entry) => entry.key.length > 0);
  }

  return [];
}

async function loadAllFolders(teamId: string, accessToken: string, parentFolderId?: string, collected: Folder[] = []): Promise<Folder[]> {
  const currentLevel = await listFolders(teamId, accessToken, parentFolderId);
  for (const folder of currentLevel) {
    collected.push(folder);
    await loadAllFolders(teamId, accessToken, folder.id, collected);
  }
  return collected;
}

const NODE_CONFIG_FIELDS: Partial<Record<NodeKind, ConfigField[]>> = {
  "github.trigger.commit": [
    {
      key: "repoFullName",
      type: "select",
      labelKey: "canvas.fields.repoFullName",
      placeholderKey: "canvas.placeholders.repoFullName",
      optionsResolver: ({ githubRepositories }) => githubRepositories.map((repo) => ({
        value: repo.fullName,
        label: repo.fullName,
      })),
    },
    {
      key: "branch",
      type: "select",
      labelKey: "canvas.fields.branch",
      placeholderKey: "canvas.placeholders.branch",
      showWhen: { key: "repoFullName", notIn: [""] },
      optionsResolver: ({ config, githubBranchesByRepo }) => {
        const repoFullName = String(config.repoFullName ?? "").trim();
        return (githubBranchesByRepo[repoFullName] ?? []).map((branch) => ({
          value: branch.name,
          label: branch.name,
        }));
      },
    },
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
    {
      key: "boardId",
      type: "select",
      labelKey: "canvas.fields.boardId",
      placeholderKey: "canvas.placeholders.boardId",
      optionsResolver: ({ boards }) => boards.map((board) => ({ value: board.id, label: board.name })),
    },
    {
      key: "listId",
      type: "select",
      labelKey: "canvas.fields.listId",
      placeholderKey: "canvas.placeholders.listId",
      showWhen: { key: "boardId", notIn: [""] },
      optionsResolver: ({ config, boardListsByBoardId }) => {
        const boardId = String(config.boardId ?? "").trim();
        return (boardListsByBoardId[boardId] ?? []).map((list) => ({ value: list.id, label: list.name }));
      },
    },
    { key: "titleTemplate", type: "text", labelKey: "canvas.fields.titleTemplate", placeholderKey: "canvas.placeholders.titleTemplate" },
  ],
  "killio.action.add_brick": [
    {
      key: "targetType",
      type: "select",
      labelKey: "canvas.fields.targetType",
      options: [
        { value: "card", labelKey: "canvas.options.targetType.card" },
        { value: "document", labelKey: "canvas.options.targetType.document" },
      ],
    },
    {
      key: "brickType",
      type: "select",
      labelKey: "canvas.fields.brickType",
      options: [
        { value: "text", labelKey: "canvas.options.brickType.text" },
        { value: "image", labelKey: "canvas.options.brickType.image" },
        { value: "file", labelKey: "canvas.options.brickType.file" },
        { value: "checklist", labelKey: "canvas.options.brickType.checklist" },
        { value: "code", labelKey: "canvas.options.brickType.code" },
        { value: "quote", labelKey: "canvas.options.brickType.quote" },
        { value: "callout", labelKey: "canvas.options.brickType.callout" },
        { value: "ai", labelKey: "canvas.options.brickType.ai" },
        { value: "table", labelKey: "canvas.options.brickType.table" },
        { value: "graph", labelKey: "canvas.options.brickType.graph" },
        { value: "accordion", labelKey: "canvas.options.brickType.accordion" },
        { value: "tabs", labelKey: "canvas.options.brickType.tabs" },
        { value: "columns", labelKey: "canvas.options.brickType.columns" },
      ],
    },
    { key: "cardIdPath", type: "text", labelKey: "canvas.fields.cardIdPath", placeholderKey: "canvas.placeholders.cardIdPath", showWhen: { key: "targetType", isIn: ["card", ""] } },
    { key: "documentIdPath", type: "text", labelKey: "canvas.fields.documentIdPath", placeholderKey: "canvas.placeholders.documentIdPath", showWhen: { key: "targetType", isIn: ["document"] } },
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
      showWhen: { key: "brickType", isIn: ["text"] },
    },
    { key: "contentTemplate", type: "textarea", labelKey: "canvas.fields.contentTemplate", placeholderKey: "canvas.placeholders.contentTemplate", showWhen: { key: "brickType", isIn: ["text", "code", "quote", "callout", "checklist"] } },
    {
      key: "mediaType",
      type: "select",
      labelKey: "canvas.fields.mediaType",
      options: [
        { value: "image", labelKey: "canvas.options.mediaType.image" },
        { value: "file", labelKey: "canvas.options.mediaType.file" },
        { value: "video", labelKey: "canvas.options.mediaType.video" },
        { value: "audio", labelKey: "canvas.options.mediaType.audio" },
        { value: "bookmark", labelKey: "canvas.options.mediaType.bookmark" },
      ],
      showWhen: { key: "brickType", isIn: ["image", "file"] },
    },
    { key: "titleTemplate", type: "text", labelKey: "canvas.fields.titleTemplate", placeholderKey: "canvas.placeholders.titleTemplate", showWhen: { key: "brickType", isIn: ["image", "file", "ai", "graph", "accordion"] } },
    { key: "bodyTemplate", type: "textarea", labelKey: "canvas.fields.bodyTemplate", placeholderKey: "canvas.placeholders.bodyTemplate", showWhen: { key: "brickType", isIn: ["accordion"] } },
    { key: "urlTemplate", type: "text", labelKey: "canvas.fields.urlTemplate", placeholderKey: "canvas.placeholders.urlTemplate", showWhen: { key: "brickType", isIn: ["image", "file"] } },
    { key: "captionTemplate", type: "text", labelKey: "canvas.fields.captionTemplate", placeholderKey: "canvas.placeholders.captionTemplate", showWhen: { key: "brickType", isIn: ["image", "file"] } },
    { key: "mimeTypeTemplate", type: "text", labelKey: "canvas.fields.mimeTypeTemplate", placeholderKey: "canvas.placeholders.mimeTypeTemplate", showWhen: { key: "brickType", isIn: ["image", "file"] } },
    { key: "sizeBytesTemplate", type: "text", labelKey: "canvas.fields.sizeBytesTemplate", placeholderKey: "canvas.placeholders.sizeBytesTemplate", showWhen: { key: "brickType", isIn: ["image", "file"] } },
    { key: "checklistItemsTemplate", type: "textarea", labelKey: "canvas.fields.checklistItemsTemplate", placeholderKey: "canvas.placeholders.checklistItemsTemplate", showWhen: { key: "brickType", isIn: ["checklist"] } },
    { key: "tableRowsTemplate", type: "textarea", labelKey: "canvas.fields.tableRowsTemplate", placeholderKey: "canvas.placeholders.tableRowsTemplate", showWhen: { key: "brickType", isIn: ["table"] } },
    {
      key: "graphType",
      type: "select",
      labelKey: "canvas.fields.graphType",
      options: [
        { value: "line", labelKey: "canvas.options.graphType.line" },
        { value: "bar", labelKey: "canvas.options.graphType.bar" },
        { value: "pie", labelKey: "canvas.options.graphType.pie" },
      ],
      showWhen: { key: "brickType", isIn: ["graph"] },
    },
    { key: "graphDataTemplate", type: "textarea", labelKey: "canvas.fields.graphDataTemplate", placeholderKey: "canvas.placeholders.graphDataTemplate", showWhen: { key: "brickType", isIn: ["graph"] } },
    {
      key: "aiStatus",
      type: "select",
      labelKey: "canvas.fields.aiStatus",
      options: [
        { value: "idle", labelKey: "canvas.options.aiStatus.idle" },
        { value: "running", labelKey: "canvas.options.aiStatus.running" },
        { value: "done", labelKey: "canvas.options.aiStatus.done" },
        { value: "error", labelKey: "canvas.options.aiStatus.error" },
      ],
      showWhen: { key: "brickType", isIn: ["ai"] },
    },
    { key: "promptTemplate", type: "textarea", labelKey: "canvas.fields.promptTemplate", placeholderKey: "canvas.placeholders.promptTemplate", showWhen: { key: "brickType", isIn: ["ai"] } },
    { key: "responseTemplate", type: "textarea", labelKey: "canvas.fields.responseTemplate", placeholderKey: "canvas.placeholders.responseTemplate", showWhen: { key: "brickType", isIn: ["ai"] } },
    { key: "modelTemplate", type: "text", labelKey: "canvas.fields.modelTemplate", placeholderKey: "canvas.placeholders.modelTemplate", showWhen: { key: "brickType", isIn: ["ai"] } },
    { key: "confidenceTemplate", type: "text", labelKey: "canvas.fields.confidenceTemplate", placeholderKey: "canvas.placeholders.confidenceTemplate", showWhen: { key: "brickType", isIn: ["ai"] } },
    { key: "accordionExpandedTemplate", type: "text", labelKey: "canvas.fields.accordionExpandedTemplate", placeholderKey: "canvas.placeholders.accordionExpandedTemplate", showWhen: { key: "brickType", isIn: ["accordion"] } },
    { key: "tabsTemplate", type: "textarea", labelKey: "canvas.fields.tabsTemplate", placeholderKey: "canvas.placeholders.tabsTemplate", showWhen: { key: "brickType", isIn: ["tabs"] } },
    { key: "columnsTemplate", type: "textarea", labelKey: "canvas.fields.columnsTemplate", placeholderKey: "canvas.placeholders.columnsTemplate", showWhen: { key: "brickType", isIn: ["columns"] } },
    { key: "position", type: "number", labelKey: "canvas.fields.position" },
    { key: "parentBlockId", type: "text", labelKey: "canvas.fields.parentBlockId", placeholderKey: "canvas.placeholders.parentBlockId", showWhen: { key: "targetType", isIn: ["card", ""] } },
  ],
  "killio.action.document.create": [
    { key: "titleTemplate", type: "text", labelKey: "canvas.fields.titleTemplate", placeholderKey: "canvas.placeholders.titleTemplate" },
    {
      key: "folderId",
      type: "select",
      labelKey: "canvas.fields.folderId",
      placeholderKey: "canvas.placeholders.folderId",
      optionsResolver: ({ folders }) => {
        const foldersById = new Map(folders.map((folder) => [folder.id, folder] as const));
        const cache = new Map<string, string>();
        return folders.map((folder) => ({
          value: folder.id,
          label: buildFolderPath(folder, foldersById, cache),
        }));
      },
    },
  ],
  "killio.action.update_card": [
    { key: "titleTemplate", type: "text", labelKey: "canvas.fields.titleTemplate", placeholderKey: "canvas.placeholders.titleTemplate" },
  ],
  "killio.action.move_card": [
    {
      key: "targetListId",
      type: "select",
      labelKey: "canvas.fields.targetListId",
      placeholderKey: "canvas.placeholders.targetListId",
      optionsResolver: ({ boards, boardListsByBoardId }) => flattenBoardLists(boards, boardListsByBoardId),
    },
    { key: "archiveOnMove", type: "boolean", labelKey: "canvas.fields.archiveOnMove" },
  ],
  "killio.action.assign_card": [
    { key: "mentionCandidatesPath", type: "text", labelKey: "canvas.fields.mentionCandidatesPath", placeholderKey: "canvas.placeholders.mentionCandidatesPath" },
    { key: "staticAssigneeIds", type: "textarea", labelKey: "canvas.fields.staticAssigneeIds", placeholderKey: "canvas.placeholders.staticAssigneeIds" },
  ],
  "killio.table.read": [
    {
      key: "tableId",
      type: "select",
      labelKey: "canvas.placeholders.tableId",
      placeholderKey: "canvas.placeholders.tableId",
      optionsResolver: ({ tables }) => tables.map((table) => ({ value: table.id, label: table.name })),
    },
    { key: "keyPath", type: "text", labelKey: "canvas.placeholders.keyPath", placeholderKey: "canvas.placeholders.keyPath" },
    { key: "outputPath", type: "text", labelKey: "canvas.placeholders.outputPath", placeholderKey: "canvas.placeholders.outputPath" },
  ],
  "killio.table.write": [
    {
      key: "tableId",
      type: "select",
      labelKey: "canvas.placeholders.tableId",
      placeholderKey: "canvas.placeholders.tableId",
      optionsResolver: ({ tables }) => tables.map((table) => ({ value: table.id, label: table.name })),
    },
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
    {
      key: "whatsappCredentialId",
      type: "select",
      labelKey: "canvas.fields.whatsappCredentialId",
      placeholderKey: "canvas.placeholders.whatsappCredentialId",
      optionsResolver: ({ whatsappCredentials }) => resolveWhatsappCredentialOptions(whatsappCredentials),
      showWhen: { key: "_nodeVariant", isIn: [WHATSAPP_SEND_VARIANT] },
    },
    {
      key: "messageText",
      type: "textarea",
      labelKey: "canvas.fields.messageText",
      placeholderKey: "canvas.placeholders.messageText",
      showWhen: { key: "_nodeVariant", isIn: [WHATSAPP_SEND_VARIANT] },
    },
    {
      key: "url",
      type: "text",
      labelKey: "canvas.fields.url",
      placeholderKey: "canvas.placeholders.url",
      showWhen: { key: "_nodeVariant", notIn: [WHATSAPP_SEND_VARIANT] },
    },
    {
      key: "method",
      type: "select",
      labelKey: "canvas.fields.method",
      showWhen: { key: "_nodeVariant", notIn: [WHATSAPP_SEND_VARIANT] },
      options: [
        { value: "GET", labelKey: "canvas.options.httpMethod.get" },
        { value: "POST", labelKey: "canvas.options.httpMethod.post" },
        { value: "PUT", labelKey: "canvas.options.httpMethod.put" },
        { value: "PATCH", labelKey: "canvas.options.httpMethod.patch" },
        { value: "DELETE", labelKey: "canvas.options.httpMethod.delete" },
      ],
    },
    {
      key: "slackWebhookCredentialId",
      type: "select",
      labelKey: "canvas.fields.slackWebhookCredentialId",
      placeholderKey: "canvas.placeholders.slackWebhookCredentialId",
      optionsResolver: ({ slackWebhookCredentials }) => resolveSlackWebhookCredentialOptions(slackWebhookCredentials),
      showWhen: { key: "_nodeVariant", notIn: [WHATSAPP_SEND_VARIANT] },
    },
    {
      key: "headers",
      type: "textarea",
      labelKey: "canvas.fields.headers",
      placeholderKey: "canvas.placeholders.headers",
      showWhen: { key: "_nodeVariant", notIn: [WHATSAPP_SEND_VARIANT] },
    },
    {
      key: "bodyTemplate",
      type: "textarea",
      labelKey: "canvas.fields.bodyTemplate",
      placeholderKey: "canvas.placeholders.bodyTemplate",
      showWhen: { key: "_nodeVariant", notIn: [WHATSAPP_SEND_VARIANT] },
    },
    {
      key: "outputPath",
      type: "text",
      labelKey: "canvas.fields.outputPath",
      placeholderKey: "canvas.placeholders.outputPath",
      showWhen: { key: "_nodeVariant", notIn: [WHATSAPP_SEND_VARIANT] },
    },
    {
      key: "timeoutMs",
      type: "number",
      labelKey: "canvas.placeholders.delayMs",
      showWhen: { key: "_nodeVariant", notIn: [WHATSAPP_SEND_VARIANT] },
    },
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
    data: { config: normalizeHttpRequestConfigForCanvas(n.nodeKind, n.config), label: n.label ?? n.nodeKind },
  }));
}

function extractWhatsappMessageTextFromBodyTemplate(bodyTemplate: string): string {
  const match = bodyTemplate.match(/"body"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/);
  if (!match || !match[1]) return "{messageText}";

  return match[1]
    .replace(/\\n/g, "\n")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\");
}

function isWhatsappSendHttpConfig(config: Record<string, any>): boolean {
  const url = String(config.url ?? "").toLowerCase();
  const bodyTemplate = String(config.bodyTemplate ?? "");
  return url.includes("graph.facebook.com")
    && bodyTemplate.includes("\"messaging_product\":\"whatsapp\"")
    && bodyTemplate.includes("\"text\":{")
    && bodyTemplate.includes("\"body\":");
}

function normalizeHttpRequestConfigForCanvas(nodeKind: NodeKind, config: Record<string, any>): Record<string, any> {
  if (nodeKind !== "core.action.http_request") return config;
  if (!isWhatsappSendHttpConfig(config)) return config;

  return {
    _nodeVariant: WHATSAPP_SEND_VARIANT,
    whatsappCredentialId: String(config.whatsappCredentialId ?? ""),
    messageText: extractWhatsappMessageTextFromBodyTemplate(String(config.bodyTemplate ?? "")),
  };
}

function buildWhatsappHttpRequestConfig(config: Record<string, any>): Record<string, any> {
  const messageTextRaw = String(config.messageText ?? "").trim();
  const messageText = messageTextRaw.length > 0 ? messageTextRaw : "{messageText}";
  const escapedMessageText = messageText
    .replace(/\\/g, "\\\\")
    .replace(/"/g, "\\\"")
    .replace(/\r?\n/g, "\\n");

  return {
    whatsappCredentialId: String(config.whatsappCredentialId ?? "").trim(),
    method: "POST",
    url: "https://graph.facebook.com/v22.0/{phoneNumberId}/messages",
    headers: {
      Authorization: "Bearer {whatsappAccessToken}",
    },
    bodyTemplate: `{"messaging_product":"whatsapp","to":"{recipientPhone}","type":"text","text":{"body":"${escapedMessageText}"}}`,
    outputPath: "whatsappSendResult",
  };
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
    ...(() => {
      const rawConfig = (n.data?.config as Record<string, any>) ?? {};
      if (n.type === "core.action.http_request" && String(rawConfig._nodeVariant ?? "") === WHATSAPP_SEND_VARIANT) {
        return { config: buildWhatsappHttpRequestConfig(rawConfig) };
      }
      return { config: rawConfig };
    })(),
    id: n.id,
    scriptId,
    nodeKind: n.type as NodeKind,
    label: (n.data?.label as string) ?? null,
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
  if (!node || !node.type || !node.type.includes("trigger")) {
    return null;
  }

  const config = (node.data?.config as Record<string, any>) ?? {};

  if (node.type === "core.trigger.webhook") {
    const webhookType = config._webhookType as string | undefined;

    if (webhookType === "whatsapp") {
      return {
        externalKey: "msg-123456",
        data: {
          whatsappEvent: "message",
          from: "1234567890",
          body: "Hello from WhatsApp",
          timestamp: new Date().toISOString(),
        },
      };
    }

    if (webhookType === "slack") {
      return {
        externalKey: "slk-123",
        data: {
          type: "event_callback",
          event: {
            type: "message",
            text: "Hello from Slack",
            user: "U123456",
          },
        },
      };
    }

    if (webhookType?.includes("killio.card")) {
      return {
        externalKey: "card-uuid",
        data: {
          event: "card.updated",
          cardId: "card-uuid",
          boardId: "board-uuid",
          title: "New Task Title",
          description: "Task description",
          status: "inProgress",
          updatedAt: new Date().toISOString(),
        },
      };
    }

    if (webhookType?.includes("killio.list")) {
      return {
        externalKey: "list-uuid",
        data: {
          event: "list.updated",
          listId: "list-uuid",
          title: "List Name",
          updatedAt: new Date().toISOString(),
        },
      };
    }

    if (webhookType?.includes("killio.document")) {
      return {
        externalKey: "doc-uuid",
        data: {
          event: "document.updated",
          documentId: "doc-uuid",
          title: "Document Name",
          content: "Body of the document",
          updatedAt: new Date().toISOString(),
        },
      };
    }

    if (webhookType?.includes("killio.board")) {
      return {
        externalKey: "board-uuid",
        data: {
          event: "board.updated",
          boardId: "board-uuid",
          title: "Board Name",
          updatedAt: new Date().toISOString(),
        },
      };
    }

    return {
      externalKey: "webhook-req-id",
      data: {
        body: {
          someField: "someValue",
          nested: {
            id: 123,
          },
        },
        headers: {
          "user-agent": "CustomApp/1.0",
        },
        query: {
          token: "abc",
        },
      },
    };
  }

  if (node.type === "core.trigger.manual") {
    return {
      externalKey: "manual-run-id",
      data: {
        triggeredBy: "user@example.com",
        timestamp: new Date().toISOString(),
      },
    };
  }

  if (node.type === "github.trigger.commit") {
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

  return null;
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
  const [boards, setBoards] = useState<BoardSummary[]>([]);
  const [boardListsByBoardId, setBoardListsByBoardId] = useState<Record<string, ListView[]>>({});
  const [folders, setFolders] = useState<Folder[]>([]);
  const [tables, setTables] = useState<Array<{ id: string; name: string }>>([]);
  const [githubRepositories, setGithubRepositories] = useState<GithubInstallationRepository[]>([]);
  const [githubBranchesByRepo, setGithubBranchesByRepo] = useState<Record<string, GithubInstallationBranch[]>>({});
  const [repoInstallationByFullName, setRepoInstallationByFullName] = useState<Record<string, number>>({});
  const [whatsappCredentials, setWhatsappCredentials] = useState<WhatsappManualCredential[]>([]);
  const [slackWebhookCredentials, setSlackWebhookCredentials] = useState<SlackWebhookManualCredential[]>([]);
  const [hasActiveGithubIntegration, setHasActiveGithubIntegration] = useState(false);
  const rfInstanceRef = useRef<ReactFlowInstance | null>(null);

  const selectedNode = useMemo(
    () => (selectedNodeId ? nodes.find((node) => node.id === selectedNodeId) ?? null : null),
    [nodes, selectedNodeId],
  );

  const selectedNodeKind = selectedNode?.type as NodeKind | undefined;
  const selectedNodeFields = (selectedNodeKind ? NODE_CONFIG_FIELDS[selectedNodeKind] : undefined) ?? [];
  const selectedNodeConfig = ((selectedNode?.data?.config as Record<string, any>) ?? {});
  const visibleSelectedNodeFields = useMemo(
    () => selectedNodeFields.filter((field) => isFieldVisible(field, selectedNodeConfig)),
    [selectedNodeFields, selectedNodeConfig],
  );

  const addBrickDslVariables = useMemo(() => {
    if (selectedNodeKind !== "killio.action.add_brick") return [] as string[];
    const brickType = String(selectedNodeConfig.brickType ?? "text");
    const base = ["{todoText}", "{canonicalTitle}", "{cardBodyText}", "{filePath}", "{lineNumber}", "{repoFullName}", "{branch}", "{commitSha}", "{authorName}"];
    if (brickType === "ai") return [...base, "{prompt}", "{response}"];
    if (brickType === "table" || brickType === "graph") return [...base, "{tableRowData}"];
    if (brickType === "image" || brickType === "file") return [...base, "{assetUrl}", "{mimeType}"];
    return base;
  }, [selectedNodeKind, selectedNodeConfig]);

  const switchRouteRows = useMemo(() => normalizeSwitchRoutes(selectedNodeConfig.routes), [selectedNodeConfig.routes]);
  const jsonMapRows = useMemo(() => normalizeJsonMappings(selectedNodeConfig.mappings), [selectedNodeConfig.mappings]);
  const httpHeaderRows = useMemo(() => normalizeHttpHeaders(selectedNodeConfig.headers), [selectedNodeConfig.headers]);

  const selectFieldContext = useMemo<SelectOptionContext>(() => ({
    config: selectedNodeConfig,
    boards,
    boardListsByBoardId,
    folders,
    tables,
    githubRepositories,
    githubBranchesByRepo,
    whatsappCredentials,
    slackWebhookCredentials,
  }), [selectedNodeConfig, boards, boardListsByBoardId, folders, tables, githubRepositories, githubBranchesByRepo, whatsappCredentials, slackWebhookCredentials]);

  const resolveSelectOptions = useCallback((field: ConfigField): ConfigFieldOption[] => {
    if (field.optionsResolver) {
      return field.optionsResolver(selectFieldContext);
    }
    return field.options ?? [];
  }, [selectFieldContext]);

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
    if (!teamId || !accessToken) {
      setBoards([]);
      setBoardListsByBoardId({});
      setFolders([]);
      setTables([]);
      setGithubRepositories([]);
      setGithubBranchesByRepo({});
      setRepoInstallationByFullName({});
      setWhatsappCredentials([]);
      setSlackWebhookCredentials([]);
      setHasActiveGithubIntegration(false);
      return;
    }

    let cancelled = false;

    const loadWorkspaceEntities = async () => {
      const [teamBoards, sharedTables, allFolders, installations, whatsappCredentialsData, slackWebhookCredentialsData] = await Promise.all([
        listTeamBoards(teamId, accessToken).catch(() => [] as BoardSummary[]),
        listSharedTables(teamId, accessToken).catch(() => []),
        loadAllFolders(teamId, accessToken).catch(() => [] as Folder[]),
        listGithubInstallations(teamId, accessToken).catch(() => [] as GithubAppInstallation[]),
        listWhatsappCredentials(teamId, accessToken).catch(() => [] as WhatsappManualCredential[]),
        listSlackWebhookCredentials(teamId, accessToken).catch(() => [] as SlackWebhookManualCredential[]),
      ]);

      const boardViews = await Promise.all(
        teamBoards.map(async (board) => {
          try {
            return await getBoard(board.id, accessToken);
          } catch {
            return null;
          }
        }),
      );

      const listMap: Record<string, ListView[]> = {};
      boardViews.forEach((boardView, index) => {
        if (!boardView) return;
        listMap[boardView.id] = boardView.lists ?? [];
      });

      const repoPairs = await Promise.all(
        installations.filter((installation) => installation.isActive).map(async (installation) => {
          try {
            const repositories = await listGithubInstallationRepositories(teamId, installation.installationId, accessToken);
            return { installationId: installation.installationId, repositories };
          } catch {
            return { installationId: installation.installationId, repositories: [] as GithubInstallationRepository[] };
          }
        }),
      );

      const nextRepositories: GithubInstallationRepository[] = [];
      const nextRepoInstallationByFullName: Record<string, number> = {};
      const seenRepoNames = new Set<string>();
      repoPairs.forEach(({ installationId, repositories }) => {
        repositories.forEach((repo) => {
          if (seenRepoNames.has(repo.fullName)) return;
          seenRepoNames.add(repo.fullName);
          nextRepositories.push(repo);
          nextRepoInstallationByFullName[repo.fullName] = installationId;
        });
      });

      if (cancelled) return;
      setBoards(teamBoards);
      setBoardListsByBoardId(listMap);
      setFolders(allFolders);
      setTables(sharedTables.map((table) => ({ id: table.id, name: table.name })));
      setGithubRepositories(nextRepositories);
      setRepoInstallationByFullName(nextRepoInstallationByFullName);
      setWhatsappCredentials(whatsappCredentialsData.filter((credential) => credential.isActive));
      setSlackWebhookCredentials(slackWebhookCredentialsData.filter((credential) => credential.isActive));
      setHasActiveGithubIntegration(installations.some((installation) => installation.isActive));
    };

    void loadWorkspaceEntities();

    return () => {
      cancelled = true;
    };
  }, [teamId, accessToken]);

  useEffect(() => {
    if (!teamId || !accessToken) return;
    const repoFullName = String(selectedNodeConfig.repoFullName ?? "").trim();
    if (selectedNodeKind !== "github.trigger.commit" || !repoFullName || githubBranchesByRepo[repoFullName]) return;

    const installationId = repoInstallationByFullName[repoFullName];
    if (!installationId) return;

    let cancelled = false;
    void listGithubInstallationBranches(teamId, installationId, repoFullName, accessToken)
      .then((branches) => {
        if (cancelled) return;
        setGithubBranchesByRepo((current) => ({
          ...current,
          [repoFullName]: branches,
        }));
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [teamId, accessToken, selectedNodeKind, selectedNodeConfig.repoFullName, githubBranchesByRepo, repoInstallationByFullName]);

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

      let templatePayload: { label?: string; config?: Record<string, unknown> } | null = null;
      const rawTemplatePayload = event.dataTransfer.getData("application/killio-node-template");
      if (rawTemplatePayload) {
        try {
          const parsed = JSON.parse(rawTemplatePayload) as Record<string, unknown>;
          templatePayload = {
            label: typeof parsed.label === "string" ? parsed.label : undefined,
            config: parsed.config && typeof parsed.config === "object" && !Array.isArray(parsed.config)
              ? (parsed.config as Record<string, unknown>)
              : undefined,
          };
        } catch {
          templatePayload = null;
        }
      }

      const position = rfInstanceRef.current.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const newNode: Node = {
        id: `node-${Date.now()}`,
        type: nodeKind,
        position,
        data: {
          config: (templatePayload?.config as Record<string, any> | undefined) ?? {},
          label: templatePayload?.label ?? nodeKind,
        },
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

      if (field.key === "boardId") {
        delete nextConfig.listId;
      }

      if (field.key === "repoFullName") {
        delete nextConfig.branch;
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

  const updateSelectedNodeConfigValue = useCallback((key: string, value: unknown) => {
    updateSelectedNode((node) => {
      const currentConfig = (node.data?.config as Record<string, any>) ?? {};
      const nextConfig = { ...currentConfig };
      if (value === undefined || value === null || value === "") {
        delete nextConfig[key];
      } else {
        nextConfig[key] = value;
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

  const updateSwitchRoute = useCallback((index: number, nextRoute: { value: string; handle: string }) => {
    updateSelectedNode((node) => {
      const currentConfig = (node.data?.config as Record<string, any>) ?? {};
      const nextRoutes = normalizeSwitchRoutes(currentConfig.routes);
      nextRoutes[index] = {
        value: nextRoute.value.trim(),
        handle: nextRoute.handle.trim(),
      };
      return {
        ...node,
        data: {
          ...node.data,
          config: {
            ...currentConfig,
            routes: nextRoutes.reduce<Record<string, string>>((accumulator, entry) => {
              if (entry.value.trim().length > 0) {
                accumulator[entry.value.trim()] = entry.handle.trim() || "default";
              }
              return accumulator;
            }, {}),
          },
        },
      };
    });
  }, [updateSelectedNode]);

  const removeSwitchRoute = useCallback((index: number) => {
    updateSelectedNode((node) => {
      const currentConfig = (node.data?.config as Record<string, any>) ?? {};
      const currentRoutes = normalizeSwitchRoutes(currentConfig.routes).filter((_, currentIndex) => currentIndex !== index);
      return {
        ...node,
        data: {
          ...node.data,
          config: {
            ...currentConfig,
            routes: currentRoutes.reduce<Record<string, string>>((accumulator, entry) => {
              if (entry.value.trim().length > 0) {
                accumulator[entry.value.trim()] = entry.handle.trim() || "default";
              }
              return accumulator;
            }, {}),
          },
        },
      };
    });
  }, [updateSelectedNode]);

  const updateJsonMapRow = useCallback((index: number, nextRow: { targetPath: string; sourcePath: string }) => {
    updateSelectedNode((node) => {
      const currentConfig = (node.data?.config as Record<string, any>) ?? {};
      const nextMappings = normalizeJsonMappings(currentConfig.mappings);
      nextMappings[index] = nextRow;
      return {
        ...node,
        data: {
          ...node.data,
          config: {
            ...currentConfig,
            mappings: nextMappings.filter((entry) => entry.targetPath.trim().length > 0 || entry.sourcePath.trim().length > 0),
          },
        },
      };
    });
  }, [updateSelectedNode]);

  const addJsonMapRow = useCallback(() => {
    updateSelectedNode((node) => {
      const currentConfig = (node.data?.config as Record<string, any>) ?? {};
      const nextMappings = normalizeJsonMappings(currentConfig.mappings);
      nextMappings.push({ targetPath: "", sourcePath: "" });
      return {
        ...node,
        data: {
          ...node.data,
          config: {
            ...currentConfig,
            mappings: nextMappings,
          },
        },
      };
    });
  }, [updateSelectedNode]);

  const removeJsonMapRow = useCallback((index: number) => {
    updateSelectedNode((node) => {
      const currentConfig = (node.data?.config as Record<string, any>) ?? {};
      const nextMappings = normalizeJsonMappings(currentConfig.mappings).filter((_, currentIndex) => currentIndex !== index);
      return {
        ...node,
        data: {
          ...node.data,
          config: {
            ...currentConfig,
            mappings: nextMappings,
          },
        },
      };
    });
  }, [updateSelectedNode]);

  const addHttpHeaderRow = useCallback(() => {
    updateSelectedNode((node) => {
      const currentConfig = (node.data?.config as Record<string, any>) ?? {};
      const nextHeaders = normalizeHttpHeaders(currentConfig.headers);
      nextHeaders.push({ key: "", value: "" });
      return {
        ...node,
        data: {
          ...node.data,
          config: {
            ...currentConfig,
            headers: nextHeaders,
          },
        },
      };
    });
  }, [updateSelectedNode]);

  const updateHttpHeaderRow = useCallback((index: number, nextHeader: { key: string; value: string }) => {
    updateSelectedNode((node) => {
      const currentConfig = (node.data?.config as Record<string, any>) ?? {};
      const nextHeaders = normalizeHttpHeaders(currentConfig.headers);
      nextHeaders[index] = nextHeader;
      const normalizedHeaders = nextHeaders
        .filter((entry) => entry.key.trim().length > 0)
        .reduce<Record<string, string>>((accumulator, entry) => {
          accumulator[entry.key.trim()] = entry.value;
          return accumulator;
        }, {});

      const nextConfig = { ...currentConfig };
      if (Object.keys(normalizedHeaders).length === 0) {
        delete nextConfig.headers;
      } else {
        nextConfig.headers = normalizedHeaders;
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

  const removeHttpHeaderRow = useCallback((index: number) => {
    updateSelectedNode((node) => {
      const currentConfig = (node.data?.config as Record<string, any>) ?? {};
      const nextHeaders = normalizeHttpHeaders(currentConfig.headers).filter((_, currentIndex) => currentIndex !== index);
      const normalizedHeaders = nextHeaders
        .filter((entry) => entry.key.trim().length > 0)
        .reduce<Record<string, string>>((accumulator, entry) => {
          accumulator[entry.key.trim()] = entry.value;
          return accumulator;
        }, {});

      const nextConfig = { ...currentConfig };
      if (Object.keys(normalizedHeaders).length === 0) {
        delete nextConfig.headers;
      } else {
        nextConfig.headers = normalizedHeaders;
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
        <NodePalette integrationAvailability={{ github: hasActiveGithubIntegration, whatsapp: true, slack: true }} />
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

                {visibleSelectedNodeFields.map((field) => {
                  const value = selectedNodeConfig[field.key];

                  if (selectedNodeKind === "core.logic.switch" && field.key === "routes") {
                    const routeValues = switchRouteRows;
                    const handleOptions = ["out_1", "out_2", "out_3", "default"];

                    return (
                      <div key={field.key}>
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <label className="block text-[11px] font-medium text-muted-foreground">
                            {t(field.labelKey)}
                          </label>
                          <button
                            type="button"
                            onClick={() => {
                              const nextIndex = routeValues.length;
                              updateSelectedNode((node) => {
                                const currentConfig = (node.data?.config as Record<string, any>) ?? {};
                                const nextRoutes = normalizeSwitchRoutes(currentConfig.routes);
                                nextRoutes.splice(nextIndex, 0, { value: `value_${routeValues.length + 1}`, handle: "default" });
                                return {
                                  ...node,
                                  data: {
                                    ...node.data,
                                    config: {
                                      ...currentConfig,
                                      routes: nextRoutes.reduce<Record<string, string>>((accumulator, entry) => {
                                        if (entry.value.trim().length > 0) {
                                          accumulator[entry.value.trim()] = entry.handle.trim() || "default";
                                        }
                                        return accumulator;
                                      }, {}),
                                    },
                                  },
                                };
                              });
                            }}
                            className="rounded-md border border-border bg-background px-2 py-1 text-[11px] font-medium text-foreground hover:bg-accent/10"
                          >
                            {t("canvas.addRow")}
                          </button>
                        </div>
                        <div className="space-y-2 rounded-md border border-border bg-background p-2.5">
                          {routeValues.length === 0 && (
                            <p className="text-[11px] italic text-muted-foreground">{t("canvas.noRoutes")}</p>
                          )}
                          {routeValues.map((route, index) => (
                            <div key={`${route.value}-${index}`} className="grid grid-cols-[1fr_120px_auto] gap-2">
                              <input
                                type="text"
                                value={route.value}
                                onChange={(event) => updateSwitchRoute(index, { ...route, value: event.target.value })}
                                placeholder="value"
                                className="w-full rounded-md border border-border bg-background px-2.5 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                              />
                              <select
                                value={route.handle}
                                onChange={(event) => updateSwitchRoute(index, { ...route, handle: event.target.value })}
                                className="w-full rounded-md border border-border bg-background px-2.5 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                              >
                                {handleOptions.map((option) => (
                                  <option key={option} value={option}>{option}</option>
                                ))}
                              </select>
                              <button
                                type="button"
                                onClick={() => removeSwitchRoute(index)}
                                className="rounded-md border border-border bg-background px-2 py-2 text-[11px] text-destructive hover:bg-destructive/10"
                              >
                                {t("canvas.remove")}
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  }

                  if (selectedNodeKind === "core.transform.json_map" && field.key === "mappings") {
                    return (
                      <div key={field.key}>
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <label className="block text-[11px] font-medium text-muted-foreground">
                            {t(field.labelKey)}
                          </label>
                          <button
                            type="button"
                            onClick={addJsonMapRow}
                            className="rounded-md border border-border bg-background px-2 py-1 text-[11px] font-medium text-foreground hover:bg-accent/10"
                          >
                            {t("canvas.addRow")}
                          </button>
                        </div>
                        <div className="space-y-2 rounded-md border border-border bg-background p-2.5">
                          {jsonMapRows.length === 0 && (
                            <p className="text-[11px] italic text-muted-foreground">{t("canvas.noMappings")}</p>
                          )}
                          {jsonMapRows.map((mapping, index) => (
                            <div key={`${mapping.targetPath}-${index}`} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                              <input
                                type="text"
                                value={mapping.targetPath}
                                onChange={(event) => updateJsonMapRow(index, { ...mapping, targetPath: event.target.value })}
                                placeholder={t("canvas.fields.targetPath")}
                                className="w-full rounded-md border border-border bg-background px-2.5 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                              />
                              <input
                                type="text"
                                value={mapping.sourcePath}
                                onChange={(event) => updateJsonMapRow(index, { ...mapping, sourcePath: event.target.value })}
                                placeholder={t("canvas.fields.sourcePath")}
                                className="w-full rounded-md border border-border bg-background px-2.5 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                              />
                              <button
                                type="button"
                                onClick={() => removeJsonMapRow(index)}
                                className="rounded-md border border-border bg-background px-2 py-2 text-[11px] text-destructive hover:bg-destructive/10"
                              >
                                {t("canvas.remove")}
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  }

                  if (selectedNodeKind === "core.action.http_request" && field.key === "headers") {
                    return (
                      <div key={field.key}>
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <label className="block text-[11px] font-medium text-muted-foreground">
                            {t(field.labelKey)}
                          </label>
                          <button
                            type="button"
                            onClick={addHttpHeaderRow}
                            className="rounded-md border border-border bg-background px-2 py-1 text-[11px] font-medium text-foreground hover:bg-accent/10"
                          >
                            {t("canvas.addRow")}
                          </button>
                        </div>
                        <div className="space-y-2 rounded-md border border-border bg-background p-2.5">
                          {httpHeaderRows.length === 0 && (
                            <p className="text-[11px] italic text-muted-foreground">{t("canvas.noHeaders")}</p>
                          )}
                          {httpHeaderRows.map((header, index) => (
                            <div key={`${header.key}-${index}`} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                              <input
                                type="text"
                                value={header.key}
                                onChange={(event) => updateHttpHeaderRow(index, { ...header, key: event.target.value })}
                                placeholder={t("canvas.placeholders.headerKey")}
                                className="w-full rounded-md border border-border bg-background px-2.5 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                              />
                              <input
                                type="text"
                                value={header.value}
                                onChange={(event) => updateHttpHeaderRow(index, { ...header, value: event.target.value })}
                                placeholder={t("canvas.placeholders.headerValue")}
                                className="w-full rounded-md border border-border bg-background px-2.5 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                              />
                              <button
                                type="button"
                                onClick={() => removeHttpHeaderRow(index)}
                                className="rounded-md border border-border bg-background px-2 py-2 text-[11px] text-destructive hover:bg-destructive/10"
                              >
                                {t("canvas.remove")}
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  }

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
                    const selectOptions = resolveSelectOptions(field);
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
                          <option value="">
                            {field.placeholderKey ? t(field.placeholderKey) : t("canvas.selectPlaceholder")}
                          </option>
                          {selectOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label ?? (option.labelKey ? t(option.labelKey) : option.value)}
                            </option>
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

                {selectedNodeKind === "killio.action.add_brick" && (
                  <div className="rounded-md border border-border bg-background px-2.5 py-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {t("canvas.addBrickGuide.title")}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {t("canvas.addBrickGuide.description")}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {visibleSelectedNodeFields.map((field) => (
                        <span
                          key={`guide-${field.key}`}
                          className="rounded bg-accent/20 px-1.5 py-0.5 text-[10px] text-foreground"
                        >
                          {t(field.labelKey)}
                        </span>
                      ))}
                    </div>
                    <p className="mt-3 text-[11px] font-medium text-muted-foreground">
                      {t("canvas.addBrickGuide.dslTitle")}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {t("canvas.addBrickGuide.dslBody")}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {addBrickDslVariables.map((variable) => (
                        <span
                          key={variable}
                          className="rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[10px] text-foreground"
                        >
                          {variable}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

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
                        {t("canvas.triggerPayloadHint")}
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
