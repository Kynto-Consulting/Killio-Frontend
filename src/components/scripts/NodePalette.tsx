"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "@/components/providers/i18n-provider";
import { NodeKind } from "@/lib/api/scripts";
import {
  GitBranch, Filter, PlusSquare, Pencil, ArrowRight, UserPlus, Play,
  Scale, ArrowRightLeft, FileText, Split, Clock3, Webhook, Database,
  HardDriveUpload, Hash, SlidersHorizontal, Layers, GitFork, Globe, Code2, Repeat, Scissors, Braces, FilePlus2, MessageCircle, Send,
} from "lucide-react";

export type PaletteIntegrationKey = "core" | "github" | "whatsapp" | "slack";

interface PaletteTemplatePayload {
  label?: string;
  config?: Record<string, unknown>;
}

interface IntegrationAvailability {
  core?: boolean;
  github?: boolean;
  whatsapp?: boolean;
  slack?: boolean;
}

interface NodePaletteProps {
  integrationAvailability?: IntegrationAvailability;
}

interface PaletteItem {
  id: string;
  kind: NodeKind;
  labelKey: string;
  icon: React.ElementType;
  color: string;
  category: "triggers" | "conditions" | "transforms" | "logic" | "actions";
  integration: PaletteIntegrationKey;
  searchTerms?: string[];
  template?: PaletteTemplatePayload;
}

const PALETTE_ITEMS: PaletteItem[] = [
  // ── Triggers ────────────────────────────────────────────────────────────
  {
    id: "github.commit.trigger",
    kind: "github.trigger.commit",
    labelKey: "githubCommit",
    icon: GitBranch,
    color: "bg-slate-800 text-white",
    category: "triggers",
    integration: "github",
    searchTerms: ["github", "commit", "repo"],
  },
  {
    id: "core.manual.trigger",
    kind: "core.trigger.manual",
    labelKey: "manualTrigger",
    icon: Play,
    color: "bg-emerald-600 text-white",
    category: "triggers",
    integration: "core",
    searchTerms: ["manual", "trigger"],
  },
  {
    id: "core.webhook.trigger",
    kind: "core.trigger.webhook",
    labelKey: "webhookTrigger",
    icon: Webhook,
    color: "bg-cyan-600 text-white",
    category: "triggers",
    integration: "core",
    searchTerms: ["webhook", "trigger", "http"],
  },
  {
    id: "killio.card.updated.trigger",
    kind: "core.trigger.webhook",
    labelKey: "cardUpdatedTrigger",
    icon: Pencil,
    color: "bg-indigo-600 text-white",
    category: "triggers",
    integration: "core",
    searchTerms: ["card", "updated", "trigger", "webhook"],
    template: {
      label: "Card Updated Trigger",
      config: {},
    },
  },
  {
    id: "killio.list.updated.trigger",
    kind: "core.trigger.webhook",
    labelKey: "listUpdatedTrigger",
    icon: Layers,
    color: "bg-teal-700 text-white",
    category: "triggers",
    integration: "core",
    searchTerms: ["list", "updated", "trigger", "webhook"],
    template: {
      label: "List Updated Trigger",
      config: {},
    },
  },
  {
    id: "killio.document.updated.trigger",
    kind: "core.trigger.webhook",
    labelKey: "documentUpdatedTrigger",
    icon: FileText,
    color: "bg-emerald-700 text-white",
    category: "triggers",
    integration: "core",
    searchTerms: ["document", "updated", "trigger", "webhook"],
    template: {
      label: "Document Updated Trigger",
      config: {},
    },
  },
  {
    id: "killio.board.updated.trigger",
    kind: "core.trigger.webhook",
    labelKey: "boardUpdatedTrigger",
    icon: SlidersHorizontal,
    color: "bg-slate-700 text-white",
    category: "triggers",
    integration: "core",
    searchTerms: ["board", "updated", "trigger", "webhook"],
    template: {
      label: "Board Updated Trigger",
      config: {},
    },
  },
  {
    id: "whatsapp.webhook.trigger",
    kind: "core.trigger.webhook",
    labelKey: "whatsappWebhookTrigger",
    icon: MessageCircle,
    color: "bg-emerald-700 text-white",
    category: "triggers",
    integration: "whatsapp",
    searchTerms: ["whatsapp", "webhook", "meta", "message"],
    template: {
      label: "WhatsApp Webhook Trigger",
      config: {},
    },
  },
  // ── Conditions ──────────────────────────────────────────────────────────
  {
    id: "core.regex.match",
    kind: "core.condition.regex_match",
    labelKey: "regexMatch",
    icon: Filter,
    color: "bg-yellow-400 text-yellow-900",
    category: "conditions",
    integration: "core",
  },
  {
    id: "core.field.compare",
    kind: "core.condition.field_compare",
    labelKey: "fieldCompare",
    icon: Scale,
    color: "bg-amber-500 text-amber-950",
    category: "conditions",
    integration: "core",
  },
  {
    id: "core.dedup.filter",
    kind: "core.filter.dedup",
    labelKey: "dedup",
    icon: Layers,
    color: "bg-teal-600 text-white",
    category: "conditions",
    integration: "core",
  },
  {
    id: "core.firstSeen.filter",
    kind: "core.filter.first_seen",
    labelKey: "firstSeen",
    icon: Layers,
    color: "bg-emerald-600 text-white",
    category: "conditions",
    integration: "core",
  },
  // ── Transforms ──────────────────────────────────────────────────────────
  {
    id: "core.json.map",
    kind: "core.transform.json_map",
    labelKey: "jsonMap",
    icon: ArrowRightLeft,
    color: "bg-sky-500 text-white",
    category: "transforms",
    integration: "core",
  },
  {
    id: "core.json.normalize",
    kind: "core.transform.json_normalize",
    labelKey: "jsonNormalize",
    icon: ArrowRightLeft,
    color: "bg-cyan-600 text-white",
    category: "transforms",
    integration: "core",
  },
  {
    id: "core.join.fields",
    kind: "core.transform.join_fields",
    labelKey: "joinFields",
    icon: ArrowRight,
    color: "bg-blue-600 text-white",
    category: "transforms",
    integration: "core",
  },
  {
    id: "core.template.transform",
    kind: "core.transform.template",
    labelKey: "template",
    icon: FileText,
    color: "bg-indigo-500 text-white",
    category: "transforms",
    integration: "core",
  },
  {
    id: "core.iterator.transform",
    kind: "core.transform.iterator",
    labelKey: "iterator",
    icon: Repeat,
    color: "bg-cyan-700 text-white",
    category: "transforms",
    integration: "core",
  },
  {
    id: "core.regex.transform",
    kind: "core.transform.regex",
    labelKey: "regex",
    icon: Braces,
    color: "bg-emerald-700 text-white",
    category: "transforms",
    integration: "core",
  },
  {
    id: "core.text.split.lines",
    kind: "core.transform.text_split_lines",
    labelKey: "textSplitLines",
    icon: Scissors,
    color: "bg-emerald-600 text-white",
    category: "transforms",
    integration: "core",
  },
  {
    id: "core.context.window",
    kind: "core.transform.context_window",
    labelKey: "contextWindow",
    icon: FileText,
    color: "bg-teal-700 text-white",
    category: "transforms",
    integration: "core",
  },
  {
    id: "core.hash.compose",
    kind: "core.transform.hash_compose",
    labelKey: "hashCompose",
    icon: Hash,
    color: "bg-purple-700 text-white",
    category: "transforms",
    integration: "core",
  },
  {
    id: "core.coalesce.transform",
    kind: "core.transform.coalesce",
    labelKey: "coalesce",
    icon: Layers,
    color: "bg-cyan-700 text-white",
    category: "transforms",
    integration: "core",
  },
  {
    id: "core.array.compact",
    kind: "core.transform.array_compact",
    labelKey: "arrayCompact",
    icon: Filter,
    color: "bg-teal-700 text-white",
    category: "transforms",
    integration: "core",
  },
  {
    id: "core.set.field",
    kind: "core.transform.set_field",
    labelKey: "setField",
    icon: SlidersHorizontal,
    color: "bg-purple-600 text-white",
    category: "transforms",
    integration: "core",
  },
  // ── Logic ───────────────────────────────────────────────────────────────
  {
    id: "core.if.else",
    kind: "core.logic.if_else",
    labelKey: "ifElse",
    icon: Split,
    color: "bg-fuchsia-500 text-white",
    category: "logic",
    integration: "core",
  },
  {
    id: "core.switch.logic",
    kind: "core.logic.switch",
    labelKey: "switch",
    icon: GitFork,
    color: "bg-orange-500 text-white",
    category: "logic",
    integration: "core",
  },
  {
    id: "core.delay.action",
    kind: "core.action.delay",
    labelKey: "delay",
    icon: Clock3,
    color: "bg-cyan-500 text-white",
    category: "logic",
    integration: "core",
  },
  // ── Actions ─────────────────────────────────────────────────────────────
  {
    id: "killio.create.card",
    kind: "killio.action.create_card",
    labelKey: "createCard",
    icon: PlusSquare,
    color: "bg-blue-500 text-white",
    category: "actions",
    integration: "core",
  },
  {
    id: "killio.add.brick",
    kind: "killio.action.add_brick",
    labelKey: "addBrick",
    icon: FileText,
    color: "bg-fuchsia-500 text-white",
    category: "actions",
    integration: "core",
  },
  {
    id: "killio.update.card",
    kind: "killio.action.update_card",
    labelKey: "updateCard",
    icon: Pencil,
    color: "bg-indigo-500 text-white",
    category: "actions",
    integration: "core",
  },
  {
    id: "killio.move.card",
    kind: "killio.action.move_card",
    labelKey: "moveCard",
    icon: ArrowRight,
    color: "bg-orange-500 text-white",
    category: "actions",
    integration: "core",
  },
  {
    id: "killio.assign.card",
    kind: "killio.action.assign_card",
    labelKey: "assignCard",
    icon: UserPlus,
    color: "bg-teal-500 text-white",
    category: "actions",
    integration: "core",
  },
  {
    id: "killio.document.create",
    kind: "killio.action.document.create",
    labelKey: "documentCreate",
    icon: FilePlus2,
    color: "bg-emerald-600 text-white",
    category: "actions",
    integration: "core",
  },
  {
    id: "killio.table.read",
    kind: "killio.table.read",
    labelKey: "tableRead",
    icon: Database,
    color: "bg-violet-600 text-white",
    category: "actions",
    integration: "core",
  },
  {
    id: "killio.table.write",
    kind: "killio.table.write",
    labelKey: "tableWrite",
    icon: HardDriveUpload,
    color: "bg-rose-600 text-white",
    category: "actions",
    integration: "core",
  },
  {
    id: "core.http.request",
    kind: "core.action.http_request",
    labelKey: "httpRequest",
    icon: Globe,
    color: "bg-blue-700 text-white",
    category: "actions",
    integration: "core",
    searchTerms: ["http", "request", "api"],
  },
  {
    id: "whatsapp.send.message",
    kind: "core.action.http_request",
    labelKey: "whatsappSendMessage",
    icon: MessageCircle,
    color: "bg-emerald-700 text-white",
    category: "actions",
    integration: "whatsapp",
    searchTerms: ["whatsapp", "send", "message", "meta"],
    template: {
      label: "WhatsApp Send Message",
      config: {
        whatsappCredentialId: "",
        method: "POST",
        url: "https://graph.facebook.com/v22.0/{phoneNumberId}/messages",
        headers: {
          Authorization: "Bearer {whatsappAccessToken}",
        },
        bodyTemplate: "{\"messaging_product\":\"whatsapp\",\"to\":\"{recipientPhone}\",\"type\":\"text\",\"text\":{\"body\":\"{messageText}\"}}",
        outputPath: "whatsappResponse",
      },
    },
  },
  {
    id: "slack.send.message",
    kind: "core.action.http_request",
    labelKey: "slackSendMessage",
    icon: Send,
    color: "bg-sky-700 text-white",
    category: "actions",
    integration: "slack",
    searchTerms: ["slack", "webhook", "send", "message"],
    template: {
      label: "Slack Send Message",
      config: {
        slackWebhookCredentialId: "",
        method: "POST",
        url: "{slackWebhookUrl}",
        headers: {
          "Content-Type": "application/json",
        },
        bodyTemplate: "{\"text\":\"{messageText}\"}",
        outputPath: "slackResponse",
      },
    },
  },
  {
    id: "core.js.code",
    kind: "core.action.js_code",
    labelKey: "jsCode",
    icon: Code2,
    color: "bg-zinc-800 text-white",
    category: "actions",
    integration: "core",
  },
];

const INTEGRATION_ORDER: PaletteIntegrationKey[] = ["core", "github", "whatsapp", "slack"];

export function NodePalette({ integrationAvailability }: NodePaletteProps) {
  const t = useTranslations("integrations");
  const [integrationFilter, setIntegrationFilter] = useState<"all" | PaletteIntegrationKey>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const availability: Record<PaletteIntegrationKey, boolean> = {
    core: true,
    github: false,
    whatsapp: true,
    slack: true,
    ...integrationAvailability,
  };

  const onDragStart = (event: React.DragEvent<HTMLDivElement>, item: PaletteItem) => {
    event.dataTransfer.setData("application/killio-node-kind", item.kind);
    if (item.template) {
      event.dataTransfer.setData("application/killio-node-template", JSON.stringify(item.template));
    } else {
      event.dataTransfer.clearData("application/killio-node-template");
    }
    event.dataTransfer.effectAllowed = "move";
  };

  const selectableFilters = useMemo(() => {
    const options: Array<{ value: "all" | PaletteIntegrationKey; label: string }> = [
      { value: "all", label: t("canvas.integrationFilter.all") },
    ];

    INTEGRATION_ORDER.forEach((key) => {
      if (!availability[key]) return;
      options.push({ value: key, label: t(`canvas.integrationFilter.${key}`) });
    });

    return options;
  }, [availability, t]);

  const normalizedSearch = searchQuery.trim().toLowerCase();

  const visibleItems = useMemo(() => {
    return PALETTE_ITEMS.filter((item) => {
      if (!availability[item.integration]) return false;

      if (integrationFilter !== "all" && item.integration !== integrationFilter) {
        return false;
      }

      if (!normalizedSearch) return true;

      const translatedLabel = t(`canvas.nodes.${item.labelKey}`).toLowerCase();
      if (translatedLabel.includes(normalizedSearch)) return true;

      return (item.searchTerms ?? []).some((term) => term.toLowerCase().includes(normalizedSearch));
    });
  }, [availability, integrationFilter, normalizedSearch, t]);

  const grouped = visibleItems.reduce<Record<string, PaletteItem[]>>((acc, item) => {
    (acc[item.category] ??= []).push(item);
    return acc;
  }, {});

  return (
    <div className="flex w-full flex-shrink-0 flex-col gap-3 overflow-y-auto border-b border-border bg-card/50 p-3 md:w-48 md:border-b-0 md:border-r">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {t("canvas.palette")}
      </span>
      <div className="space-y-2">
        <label className="block text-[10px] font-semibold uppercase text-muted-foreground">
          {t("canvas.integrationFilterLabel")}
        </label>
        <select
          value={integrationFilter}
          onChange={(event) => setIntegrationFilter(event.target.value as "all" | PaletteIntegrationKey)}
          className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        >
          {selectableFilters.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        <input
          type="search"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder={t("canvas.paletteSearchPlaceholder")}
          className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>
      {(["triggers", "conditions", "transforms", "logic", "actions"] as const).map((cat) => (
        <div key={cat}>
          <span className="mb-1 block text-[10px] font-semibold uppercase text-muted-foreground">
            {t(`canvas.categories.${cat}`)}
          </span>
          <div className="space-y-1.5">
            {grouped[cat]?.map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.id}
                  draggable
                  onDragStart={(event) => onDragStart(event, item)}
                  className="flex cursor-grab items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5 text-xs font-medium text-foreground shadow-sm transition-shadow hover:shadow-md active:cursor-grabbing"
                >
                  <span className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded ${item.color}`}>
                    <Icon className="h-3 w-3" />
                  </span>
                  <span className="truncate">{t(`canvas.nodes.${item.labelKey}`)}</span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
      {visibleItems.length === 0 && (
        <p className="rounded-md border border-dashed border-border px-2.5 py-2 text-[11px] text-muted-foreground">
          {t("canvas.noPaletteMatches")}
        </p>
      )}
    </div>
  );
}
