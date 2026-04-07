"use client";

import { useTranslations } from "@/components/providers/i18n-provider";
import { NodeKind } from "@/lib/api/scripts";
import {
  GitBranch, Filter, PlusSquare, Pencil, ArrowRight, UserPlus, Play,
  Scale, ArrowRightLeft, FileText, Split, Clock3, Webhook, Database,
  HardDriveUpload, Hash, SlidersHorizontal, Layers, GitFork, Globe, Code2, Repeat, Scissors, Braces,
} from "lucide-react";

interface PaletteItem {
  kind: NodeKind;
  labelKey: string;
  icon: React.ElementType;
  color: string;
  category: "triggers" | "conditions" | "transforms" | "logic" | "actions";
}

const PALETTE_ITEMS: PaletteItem[] = [
  // ── Triggers ────────────────────────────────────────────────────────────
  {
    kind: "github.trigger.commit",
    labelKey: "githubCommit",
    icon: GitBranch,
    color: "bg-slate-800 text-white",
    category: "triggers",
  },
  {
    kind: "core.trigger.manual",
    labelKey: "manualTrigger",
    icon: Play,
    color: "bg-emerald-600 text-white",
    category: "triggers",
  },
  {
    kind: "core.trigger.webhook",
    labelKey: "webhookTrigger",
    icon: Webhook,
    color: "bg-cyan-600 text-white",
    category: "triggers",
  },
  // ── Conditions ──────────────────────────────────────────────────────────
  {
    kind: "core.condition.regex_match",
    labelKey: "regexMatch",
    icon: Filter,
    color: "bg-yellow-400 text-yellow-900",
    category: "conditions",
  },
  {
    kind: "core.condition.field_compare",
    labelKey: "fieldCompare",
    icon: Scale,
    color: "bg-amber-500 text-amber-950",
    category: "conditions",
  },
  {
    kind: "core.filter.dedup",
    labelKey: "dedup",
    icon: Layers,
    color: "bg-teal-600 text-white",
    category: "conditions",
  },
  {
    kind: "core.filter.first_seen",
    labelKey: "firstSeen",
    icon: Layers,
    color: "bg-emerald-600 text-white",
    category: "conditions",
  },
  // ── Transforms ──────────────────────────────────────────────────────────
  {
    kind: "core.transform.json_map",
    labelKey: "jsonMap",
    icon: ArrowRightLeft,
    color: "bg-sky-500 text-white",
    category: "transforms",
  },
  {
    kind: "core.transform.json_normalize",
    labelKey: "jsonNormalize",
    icon: ArrowRightLeft,
    color: "bg-cyan-600 text-white",
    category: "transforms",
  },
  {
    kind: "core.transform.join_fields",
    labelKey: "joinFields",
    icon: ArrowRight,
    color: "bg-blue-600 text-white",
    category: "transforms",
  },
  {
    kind: "core.transform.template",
    labelKey: "template",
    icon: FileText,
    color: "bg-indigo-500 text-white",
    category: "transforms",
  },
  {
    kind: "core.transform.iterator",
    labelKey: "iterator",
    icon: Repeat,
    color: "bg-cyan-700 text-white",
    category: "transforms",
  },
  {
    kind: "core.transform.regex",
    labelKey: "regex",
    icon: Braces,
    color: "bg-emerald-700 text-white",
    category: "transforms",
  },
  {
    kind: "core.transform.text_split_lines",
    labelKey: "textSplitLines",
    icon: Scissors,
    color: "bg-emerald-600 text-white",
    category: "transforms",
  },
  {
    kind: "core.transform.context_window",
    labelKey: "contextWindow",
    icon: FileText,
    color: "bg-teal-700 text-white",
    category: "transforms",
  },
  {
    kind: "core.transform.hash_compose",
    labelKey: "hashCompose",
    icon: Hash,
    color: "bg-purple-700 text-white",
    category: "transforms",
  },
  {
    kind: "core.transform.coalesce",
    labelKey: "coalesce",
    icon: Layers,
    color: "bg-cyan-700 text-white",
    category: "transforms",
  },
  {
    kind: "core.transform.array_compact",
    labelKey: "arrayCompact",
    icon: Filter,
    color: "bg-teal-700 text-white",
    category: "transforms",
  },
  {
    kind: "core.transform.set_field",
    labelKey: "setField",
    icon: SlidersHorizontal,
    color: "bg-purple-600 text-white",
    category: "transforms",
  },
  // ── Logic ───────────────────────────────────────────────────────────────
  {
    kind: "core.logic.if_else",
    labelKey: "ifElse",
    icon: Split,
    color: "bg-fuchsia-500 text-white",
    category: "logic",
  },
  {
    kind: "core.logic.switch",
    labelKey: "switch",
    icon: GitFork,
    color: "bg-orange-500 text-white",
    category: "logic",
  },
  {
    kind: "core.action.delay",
    labelKey: "delay",
    icon: Clock3,
    color: "bg-cyan-500 text-white",
    category: "logic",
  },
  // ── Actions ─────────────────────────────────────────────────────────────
  {
    kind: "killio.action.create_card",
    labelKey: "createCard",
    icon: PlusSquare,
    color: "bg-blue-500 text-white",
    category: "actions",
  },
  {
    kind: "killio.action.update_card",
    labelKey: "updateCard",
    icon: Pencil,
    color: "bg-indigo-500 text-white",
    category: "actions",
  },
  {
    kind: "killio.action.move_card",
    labelKey: "moveCard",
    icon: ArrowRight,
    color: "bg-orange-500 text-white",
    category: "actions",
  },
  {
    kind: "killio.action.assign_card",
    labelKey: "assignCard",
    icon: UserPlus,
    color: "bg-teal-500 text-white",
    category: "actions",
  },
  {
    kind: "killio.table.read",
    labelKey: "tableRead",
    icon: Database,
    color: "bg-violet-600 text-white",
    category: "actions",
  },
  {
    kind: "killio.table.write",
    labelKey: "tableWrite",
    icon: HardDriveUpload,
    color: "bg-rose-600 text-white",
    category: "actions",
  },
  {
    kind: "core.action.http_request",
    labelKey: "httpRequest",
    icon: Globe,
    color: "bg-blue-700 text-white",
    category: "actions",
  },
  {
    kind: "core.action.js_code",
    labelKey: "jsCode",
    icon: Code2,
    color: "bg-zinc-800 text-white",
    category: "actions",
  },
];

export function NodePalette() {
  const t = useTranslations("integrations");

  const onDragStart = (event: React.DragEvent<HTMLDivElement>, kind: NodeKind) => {
    event.dataTransfer.setData("application/killio-node-kind", kind);
    event.dataTransfer.effectAllowed = "move";
  };

  const grouped = PALETTE_ITEMS.reduce<Record<string, PaletteItem[]>>((acc, item) => {
    (acc[item.category] ??= []).push(item);
    return acc;
  }, {});

  return (
    <div className="flex w-full flex-shrink-0 flex-col gap-3 overflow-y-auto border-b border-border bg-card/50 p-3 md:w-48 md:border-b-0 md:border-r">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {t("canvas.palette")}
      </span>
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
                  key={item.kind}
                  draggable
                  onDragStart={(e) => onDragStart(e, item.kind)}
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
    </div>
  );
}
