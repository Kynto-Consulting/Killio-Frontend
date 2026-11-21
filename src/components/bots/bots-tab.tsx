"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Bot as BotIcon, ChevronDown, ChevronUp, Lock, Plus, Sparkles } from "lucide-react";

import { useTranslations } from "@/components/providers/i18n-provider";
import { useSettings } from "@/components/roles/settings-context";
import { EmptyState, btn, btnPrimary, card, cx } from "@/components/roles/ui";
import { createBot, deleteBot, listBots, updateBot } from "@/lib/api/bots";
import { createScript, saveScriptGraph, toggleScript } from "@/lib/api/scripts";
import { buildHelloCommand, buildHelloScriptGraph, canManageBots, HELLO_COMMAND, botStatus, type Bot, type BotList } from "@/lib/bots/model";
import { toast } from "@/lib/toast";
import { setBotCommands } from "@/lib/api/bots";
import { BotAvatar, StatusChip } from "./bot-parts";
import { BotDetail } from "./bot-detail";
import { BotFormDialog } from "./bot-form-dialog";

/** "Bots" tab of /teams: list, create, edit, commands, scripts and per-room permissions. Needs `bots.manage` (the server enforces it). */
export function BotsTab() {
  const t = useTranslations("bots");
  const s = useSettings();
  const allowed = canManageBots(s.perms.can, s.perms.isOwner);
  const [data, setData] = useState<BotList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [busyExample, setBusyExample] = useState(false);

  const reload = useCallback(async () => {
    try {
      const list = await listBots(s.teamId, s.accessToken);
      setData(list);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("toast.error"));
    }
  }, [s.teamId, s.accessToken, t]);

  useEffect(() => {
    if (allowed) void reload();
  }, [allowed, reload]);

  const bots = data?.bots ?? [];
  useEffect(() => {
    if (selected && !bots.some((b) => b.id === selected)) setSelected(null);
  }, [bots, selected]);
  const current = bots.find((b) => b.id === selected) ?? null;
  const atCap = data ? bots.length >= data.limits.maxBotsPerTeam : false;

  const replaceBot = (bot: Bot) => setData((d) => (d ? { ...d, bots: d.bots.map((b) => (b.id === bot.id ? bot : b)) } : d));

  /** One click: bot "Hola" + script (/hola trigger -> reply) + command, bound and active. Each step reports its own failure. */
  const createExample = async () => {
    if (busyExample) return;
    setBusyExample(true);
    let step = "bot";
    try {
      const name = uniqueName(t("example.botName"), bots);
      const bot = await createBot(s.teamId, { name, description: t("example.botDescription") }, s.accessToken);
      step = "script";
      const script = await createScript({ teamId: s.teamId, name: t("example.scriptName", { name }), description: t("example.scriptDescription") }, s.accessToken);
      await saveScriptGraph(script.id, s.teamId, buildHelloScriptGraph(script.id, () => crypto.randomUUID(), t("example.reply")) as any, s.accessToken);
      step = "bind";
      await updateBot(s.teamId, bot.id, { scriptId: script.id }, s.accessToken);
      await toggleScript(script.id, s.teamId, true, s.accessToken);
      step = "commands";
      await setBotCommands(s.teamId, bot.id, [buildHelloCommand({ description: t("example.commandDescription"), name: t("example.options.name"), tone: t("example.options.tone"), formal: t("example.options.formal"), casual: t("example.options.casual") })], s.accessToken);
      toast(t("example.created"), "success");
      setHelpOpen(false);
      await reload();
      setSelected(bot.id);
    } catch (e) {
      toast(`${t(`example.failedAt.${step}`)} ${e instanceof Error ? e.message : ""}`.trim(), "error");
      await reload();
    } finally {
      setBusyExample(false);
    }
  };

  if (!allowed) {
    return <EmptyState icon={<Lock className="h-5 w-5" aria-hidden />} title={t("noAccess.title")} body={t("noAccess.body")} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <section className={cx(card, "flex flex-wrap items-center justify-between gap-3 p-3")}>
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-sm font-bold text-foreground">
            <BotIcon className="h-4 w-4" aria-hidden /> {t("title")}
            {data && <span className="rounded-full border border-border bg-muted px-1.5 text-[10px] font-bold">{bots.length}/{data.limits.maxBotsPerTeam}</span>}
          </h2>
          <p className="text-xs text-muted-foreground">{t("subtitle")}</p>
          {data?.quota && <QuotaLine quota={data.quota} />}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={btn} aria-expanded={helpOpen} onClick={() => setHelpOpen((v) => !v)}>
            <Sparkles className="h-3.5 w-3.5" aria-hidden /> {t("help.toggle")} {helpOpen ? <ChevronUp className="h-3 w-3" aria-hidden /> : <ChevronDown className="h-3 w-3" aria-hidden />}
          </button>
          <button type="button" className={btnPrimary} disabled={atCap} title={atCap ? t("limitReached", { max: data?.limits.maxBotsPerTeam ?? 0 }) : undefined} onClick={() => setCreating(true)}>
            <Plus className="h-3.5 w-3.5" aria-hidden /> {t("create")}
          </button>
        </div>
      </section>

      {helpOpen && <HelpCard onExample={createExample} busy={busyExample} disabled={atCap} depth={data?.limits.maxChainDepth ?? 3} />}

      {error && (
        <div role="alert" className="rounded-xl border border-amber-500/50 bg-amber-500/10 px-4 py-3 text-xs text-foreground">
          <strong className="font-bold">{t("loadError")}</strong> <span className="text-muted-foreground">{error}</span>
        </div>
      )}

      {!data && !error ? (
        <div className="text-center text-sm text-muted-foreground">{t("loading")}</div>
      ) : bots.length === 0 && data ? (
        <EmptyState icon={<BotIcon className="h-5 w-5" aria-hidden />} title={t("empty.title")} body={t("empty.body")} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(240px,320px)_1fr]">
          <ul className="flex flex-col gap-2 self-start" aria-label={t("title")}>
            {bots.map((b) => {
              const on = b.id === selected;
              return (
                <li key={b.id}>
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => setSelected(on ? null : b.id)}
                    className={cx(card, "flex w-full items-start gap-3 p-3 text-left transition-colors hover:bg-accent/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", on && "border-primary bg-primary/5 ring-1 ring-primary/30")}
                  >
                    <BotAvatar name={b.name} url={b.avatarUrl} size={36} />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="truncate text-sm font-bold text-foreground">{b.name}</span>
                        <StatusChip status={botStatus(b)} />
                      </span>
                      {b.description && <span className="line-clamp-2 text-[11px] text-muted-foreground">{b.description}</span>}
                      <span className="mt-1.5 flex flex-wrap gap-1">
                        {b.commands.length === 0 ? (
                          <span className="text-[11px] italic text-muted-foreground">{t("noCommands")}</span>
                        ) : (
                          b.commands.slice(0, 6).map((c) => (
                            <code key={c.name} className="rounded border border-border bg-muted px-1 text-[11px] font-semibold text-foreground">/{c.name}</code>
                          ))
                        )}
                        {b.commands.length > 6 && <span className="text-[11px] text-muted-foreground">+{b.commands.length - 6}</span>}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {current ? (
            <BotDetail
              key={current.id}
              bot={current}
              limits={data!.limits}
              onChanged={replaceBot}
              onReload={reload}
              onDeleted={async () => {
                try {
                  await deleteBot(s.teamId, current.id, s.accessToken);
                  toast(t("toast.deleted"), "success");
                  setSelected(null);
                  await reload();
                } catch (e) {
                  toast(e instanceof Error ? e.message : t("toast.error"), "error");
                  throw e;
                }
              }}
            />
          ) : (
            <div className="hidden self-start rounded-xl border border-dashed border-border px-6 py-10 text-center text-xs text-muted-foreground lg:block">{t("pickOne")}</div>
          )}
        </div>
      )}

      {creating && (
        <BotFormDialog
          onClose={() => setCreating(false)}
          onSaved={async (bot) => {
            setCreating(false);
            await reload();
            setSelected(bot.id);
          }}
        />
      )}
    </div>
  );
}

function uniqueName(base: string, bots: readonly Bot[]): string {
  const taken = new Set(bots.map((b) => b.name.toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  for (let i = 2; i < 100; i++) if (!taken.has(`${base} ${i}`.toLowerCase())) return `${base} ${i}`;
  return `${base} ${Date.now() % 1000}`;
}

function QuotaLine({ quota }: { quota: NonNullable<BotList["quota"]> }) {
  const t = useTranslations("bots");
  return (
    <p className={cx("mt-1 text-[11px]", quota.exhausted ? "font-semibold text-red-700 dark:text-red-300" : "text-muted-foreground")}>
      {quota.exhausted ? t("quota.exhausted") : quota.limit === null ? t("quota.unlimited", { used: quota.executed }) : t("quota.used", { used: quota.executed, limit: quota.limit })}
    </p>
  );
}

function HelpCard({ onExample, busy, disabled, depth }: { onExample: () => void; busy: boolean; disabled: boolean; depth: number }) {
  const t = useTranslations("bots");
  const steps = useMemo(() => [1, 2, 3, 4, 5].map((n) => t(`help.step${n}`)), [t]);
  return (
    <section className={cx(card, "grid gap-3 p-4 md:grid-cols-2")} aria-label={t("help.title")}>
      <div>
        <h3 className="text-sm font-bold text-foreground">{t("help.title")}</h3>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs text-foreground">
          {steps.map((x, i) => (
            <li key={i}>{x}</li>
          ))}
        </ol>
        <p className="mt-2 text-[11px] text-muted-foreground">{t("help.limits", { depth })}</p>
        <button type="button" className={cx(btnPrimary, "mt-3")} disabled={busy || disabled} onClick={onExample}>
          <Sparkles className="h-3.5 w-3.5" aria-hidden /> {busy ? t("example.creating") : t("example.button")}
        </button>
      </div>
      <div className="min-w-0">
        <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{t("help.exampleTitle", { command: `/${HELLO_COMMAND}` })}</div>
        <pre className="mt-1 overflow-x-auto rounded-lg border border-border bg-muted/50 p-3 text-[11px] leading-relaxed text-foreground">{t("help.exampleScript", { command: `/${HELLO_COMMAND}` })}</pre>
      </div>
    </section>
  );
}
