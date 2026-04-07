"use client";

import { useTranslations } from "@/components/providers/i18n-provider";
import { ScriptGraph } from "@/lib/api/scripts";
import { ArrowRightLeft, FileText, Filter, GitBranch, Zap } from "lucide-react";

interface ScriptLogicGuideProps {
  graph: ScriptGraph | null;
}

function hasNode(graph: ScriptLogicGuideProps["graph"], kind: string) {
  return !!graph?.nodes.some((node) => node.nodeKind === kind);
}

export function ScriptLogicGuide({ graph }: ScriptLogicGuideProps) {
  const t = useTranslations("integrations");
  const hasRegex = hasNode(graph, "core.condition.regex_match");
  const hasJsonMap = hasNode(graph, "core.transform.json_map");
  const hasTemplate = hasNode(graph, "core.transform.template");

  return (
    <aside className="hidden w-[280px] flex-shrink-0 border-l border-border bg-card/40 xl:flex xl:flex-col">
      <div className="border-b border-border bg-card px-4 py-3">
        <p className="text-sm font-semibold text-foreground">{t("guide.title")}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("guide.description")}
        </p>
      </div>

      <div className="space-y-5 overflow-y-auto p-4 text-xs text-muted-foreground">
        <section className="rounded-xl border border-border bg-background p-4 shadow-sm">
          <div className="flex items-center gap-2 text-foreground">
            <GitBranch className="h-4 w-4 text-violet-600" />
            <span className="font-semibold">{t("guide.steps.trigger.title")}</span>
          </div>
          <p className="mt-2 leading-5">
            {t("guide.steps.trigger.body")}
          </p>
        </section>

        <section className="rounded-xl border border-border bg-background p-4 shadow-sm">
          <div className="flex items-center gap-2 text-foreground">
            <Filter className="h-4 w-4 text-yellow-600" />
            <span className="font-semibold">{t("guide.steps.regex.title")}</span>
          </div>
          <p className="mt-2 leading-5">
            {t("guide.steps.regex.body")}
          </p>
          <div className="mt-3 rounded-lg bg-foreground p-3 font-mono text-[11px] text-background">
            {t("guide.steps.regex.exampleField")}
            <br />
            {t("guide.steps.regex.examplePattern")}
            <br />
            {t("guide.steps.regex.exampleOutput")}
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            {t("guide.steps.regex.footer")}
          </p>
        </section>

        <section className="rounded-xl border border-border bg-background p-4 shadow-sm">
          <div className="flex items-center gap-2 text-foreground">
            <ArrowRightLeft className="h-4 w-4 text-sky-600" />
            <span className="font-semibold">{t("guide.steps.map.title")}</span>
          </div>
          <p className="mt-2 leading-5">
            {t("guide.steps.map.body")}
          </p>
          <div className="mt-3 rounded-lg border border-dashed border-sky-300/50 bg-sky-500/10 p-3 text-[11px] text-sky-700 dark:text-sky-300">
            {t("guide.steps.map.exampleTarget")}
            <br />
            {t("guide.steps.map.exampleSource")}
          </div>
        </section>

        <section className="rounded-xl border border-border bg-background p-4 shadow-sm">
          <div className="flex items-center gap-2 text-foreground">
            <FileText className="h-4 w-4 text-indigo-600" />
            <span className="font-semibold">{t("guide.steps.template.title")}</span>
          </div>
          <p className="mt-2 leading-5">
            {t("guide.steps.template.body")}
          </p>
          <div className="mt-3 rounded-lg bg-indigo-500/10 p-3 text-[11px] text-indigo-700 dark:text-indigo-300">
            {t("guide.steps.template.exampleTemplate")}
            <br />
            {t("guide.steps.template.exampleTarget")}
          </div>
        </section>

        <section className="rounded-xl border border-border bg-background p-4 shadow-sm">
          <div className="flex items-center gap-2 text-foreground">
            <Zap className="h-4 w-4 text-emerald-600" />
            <span className="font-semibold">{t("guide.steps.action.title")}</span>
          </div>
          <p className="mt-2 leading-5">
            {t("guide.steps.action.body")}
          </p>
        </section>

        <section className="rounded-xl border border-border bg-background p-4 shadow-sm">
          <p className="font-semibold text-foreground">{t("guide.summary.title")}</p>
          <ul className="mt-2 space-y-1.5 text-[11px] text-muted-foreground">
            <li>{t("guide.summary.regex", { value: hasRegex ? t("guide.yes") : t("guide.no") })}</li>
            <li>{t("guide.summary.jsonMap", { value: hasJsonMap ? t("guide.yes") : t("guide.no") })}</li>
            <li>{t("guide.summary.template", { value: hasTemplate ? t("guide.yes") : t("guide.no") })}</li>
            <li>{t("guide.summary.nodes", { count: graph?.nodes.length ?? 0 })}</li>
            <li>{t("guide.summary.edges", { count: graph?.edges.length ?? 0 })}</li>
          </ul>
        </section>
      </div>
    </aside>
  );
}
