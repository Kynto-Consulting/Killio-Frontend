"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Copy, ExternalLink, Lock, LockOpen, Plus, Trash2 } from "lucide-react";

import { useTranslations } from "@/components/providers/i18n-provider";
import { useSettings } from "@/components/roles/settings-context";
import { EmptyState, RoleChip, Switch, TabBar, TriStateControl, btn, btnDanger, btnPrimary, card, cx, inputCls } from "@/components/roles/ui";
import { ConfirmDeleteModal } from "@/components/ui/confirm-delete-modal";
import { activateBot, duplicateBot, pauseBot, setBotCommands, setBotLock, updateBot } from "@/lib/api/bots";
import { getRoomOverrides, listTeamRooms, setRoomOverrides, type Room, type RoomOverrideDto } from "@/lib/api/rooms";
import { createScript, listScripts, saveScriptGraph, setScriptLock, toggleScript, type ScriptSummary } from "@/lib/api/scripts";
import { botLockUi, botPatch } from "@/lib/bots/locks";
import {
  BOT_LIMITS, BOT_ROOM_KEYS, HELLO_COMMAND, applyBotRoomStates, botBody, botRoomStates, botStatus, buildHelloCommand, buildHelloScriptGraph, commandOptionIssues,
  isBotScriptTriggerType, readOverrides, sameStates, scriptEditorHref, validateBotForm, validateCommands, type Bot, type BotLimits, type BotRoomKey, type CommandDraft,
  type RawOverride, type TriState,
} from "@/lib/bots/model";
import { usageOf } from "@/lib/bots/options";
import { sortRoles } from "@/lib/roles/model";
import { toast } from "@/lib/toast";
import { BotAvatar, StatusChip } from "./bot-parts";
import { AuthorshipBlock, LockChips, LockNotice, lockAwareMessage } from "./lock-parts";
import { OptionsEditor } from "./options-editor";
import { EmojiText } from "@/components/emoji";

type Sub = "general" | "commands" | "script" | "rooms";

export function BotDetail({ bot, limits, onChanged, onReload, onDeleted }: { bot: Bot; limits: BotLimits; onChanged: (b: Bot) => void; onReload: () => Promise<void>; onDeleted: () => Promise<void> }) {
  const t = useTranslations("bots");
  const [sub, setSub] = useState<Sub>("general");
  const [deleting, setDeleting] = useState(false);
  const tabs = [
    { id: "general", label: t("tabs.general") },
    { id: "commands", label: t("tabs.commands"), badge: bot.commands.length || null },
    { id: "script", label: t("tabs.script") },
    { id: "rooms", label: t("tabs.rooms") },
  ];
  return (
    <section className={cx(card, "min-w-0 p-4")} aria-label={bot.name}>
      <header className="mb-3 flex items-center gap-3">
        <BotAvatar name={bot.name} url={bot.avatarUrl} size={40} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-base font-extrabold text-foreground">{bot.name}</h3>
            <StatusChip status={botStatus(bot)} />
            <LockChips botLocked={bot.locked} codeLocked={bot.codeLocked} />
          </div>
          <p className="text-[11px] text-muted-foreground">{t("detail.hint")}</p>
        </div>
      </header>
      <TabBar tabs={tabs} active={sub} onChange={(id) => setSub(id as Sub)} label={t("tabs.label")} idPrefix="bot" />
      <div role="tabpanel" id={`bot-panel-${sub}`} aria-labelledby={`bot-tab-${sub}`} className="pt-4">
        {sub === "general" && <GeneralPane bot={bot} limits={limits} onChanged={onChanged} onReload={onReload} onDelete={() => setDeleting(true)} />}
        {sub === "commands" && <CommandsPane bot={bot} onChanged={onReload} />}
        {sub === "script" && <ScriptPane bot={bot} onChanged={onReload} />}
        {sub === "rooms" && <RoomsPane bot={bot} />}
      </div>
      <ConfirmDeleteModal isOpen={deleting} onClose={() => setDeleting(false)} onConfirm={onDeleted} title={t("delete.title")} description={t("delete.description")} itemName={bot.name} />
    </section>
  );
}

/* ───────────── General ───────────── */

function GeneralPane({ bot, limits, onChanged, onReload, onDelete }: { bot: Bot; limits: BotLimits; onChanged: (b: Bot) => void; onReload: () => Promise<void>; onDelete: () => void }) {
  const t = useTranslations("bots");
  const s = useSettings();
  const [name, setName] = useState(bot.name);
  const [description, setDescription] = useState(bot.description ?? "");
  const [avatarUrl, setAvatarUrl] = useState(bot.avatarUrl ?? "");
  const [allowBots, setAllowBots] = useState(bot.allowBotTriggers);
  const [roleIds, setRoleIds] = useState<string[]>(bot.roleIds);
  const [saving, setSaving] = useState(false);
  const ui = botLockUi(bot);
  const issues = validateBotForm({ name, description, avatarUrl });
  // Only what changed AND may change is sent: the server refuses a PATCH that merely names a frozen field.
  const patch = botPatch(bot, { name, description, avatarUrl, allowBotTriggers: allowBots, roleIds }, ui);
  const dirty = Object.keys(patch).length > 0;
  const assignable = useMemo(() => sortRoles(s.roles).filter((r) => r.systemKey !== "owner"), [s.roles]);

  const run = async (patch: Parameters<typeof updateBot>[2], okKey: string) => {
    setSaving(true);
    try {
      onChanged(await updateBot(s.teamId, bot.id, patch, s.accessToken));
      toast(t(okKey), "success");
    } catch (e) {
      toast(lockAwareMessage(t, e, t("toast.error")), "error");
    } finally {
      setSaving(false);
    }
  };
  const save = () => issues.length === 0 && dirty && run(patch, "toast.saved");
  const changeLock = async (locked: boolean) => {
    if (locked && !window.confirm(t("locks.confirmLockBot"))) return;
    setSaving(true);
    try {
      onChanged(await setBotLock(s.teamId, bot.id, locked, s.accessToken));
      toast(t(locked ? "locks.toast.botLocked" : "locks.toast.botUnlocked"), "success");
    } catch (e) {
      toast(lockAwareMessage(t, e, t("toast.error")), "error");
    } finally {
      setSaving(false);
    }
  };
  const copy = async () => {
    setSaving(true);
    try {
      await duplicateBot(s.teamId, bot.id, undefined, s.accessToken);
      toast(t("locks.toast.duplicated"), "success");
      await onReload();
    } catch (e) {
      toast(lockAwareMessage(t, e, t("toast.error")), "error");
    } finally {
      setSaving(false);
    }
  };
  const toggleRole = (id: string) => setRoleIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  return (
    <div className="space-y-3">
      <AuthorshipBlock authorship={bot.authorship} />
      {ui.botLocked && <LockNotice title={t("locks.botLocked")} body={`${t("locks.botLockedHint")} ${bot.lockSource === "pack" ? t("locks.byPublisher") : t("locks.byWorkspace")}`} />}
      {!ui.botLocked && ui.descriptionFixed && <p className="text-[11px] text-muted-foreground">{t("locks.descriptionFixed")}</p>}
      <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
        <div className="min-w-0">
          <div className="text-xs font-bold text-foreground">{t("general.active")}</div>
          <p className="text-[11px] text-muted-foreground">{t("general.activeHint")}</p>
        </div>
        <button
          type="button"
          className={bot.isActive ? btn : btnPrimary}
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            try {
              onChanged(await (bot.isActive ? pauseBot : activateBot)(s.teamId, bot.id, s.accessToken));
              toast(t(bot.isActive ? "toast.paused" : "toast.activated"), "success");
            } catch (e) {
              toast(e instanceof Error ? e.message : t("toast.error"), "error");
            } finally {
              setSaving(false);
            }
          }}
        >
          {bot.isActive ? t("general.pauseAction") : t("general.activateAction")}
        </button>
      </div>
      <label className="block text-xs font-semibold text-foreground">
        {t("form.name")}
        <input className={`${inputCls} mt-1`} value={name} disabled={!ui.canEditSettings} onChange={(e) => setName(e.target.value)} />
        {issues.some((i) => i.startsWith("name")) && <p role="alert" className="mt-1 text-[11px] text-red-700 dark:text-red-300">{t(`form.errors.${issues.find((i) => i.startsWith("name"))}`)}</p>}
      </label>
      <label className="block text-xs font-semibold text-foreground">
        {t("form.avatarUrl")}
        <input className={`${inputCls} mt-1`} value={avatarUrl} disabled={!ui.canEditSettings} onChange={(e) => setAvatarUrl(e.target.value)} placeholder="https://" inputMode="url" />
        {issues.includes("avatar_invalid") && <p role="alert" className="mt-1 text-[11px] text-red-700 dark:text-red-300">{t("form.errors.avatar_invalid")}</p>}
      </label>
      <label className="block text-xs font-semibold text-foreground">
        {t("form.description")}
        <textarea className={`${inputCls} mt-1 h-16 py-2`} value={description} disabled={!ui.canEditSettings || ui.descriptionFixed} onChange={(e) => setDescription(e.target.value)} />
        {issues.includes("description_long") && <p role="alert" className="mt-1 text-[11px] text-red-700 dark:text-red-300">{t("form.errors.description_long")}</p>}
      </label>
      <div>
        <div className="text-xs font-semibold text-foreground">{t("general.roles")}</div>
        <p className="mb-1.5 text-[11px] text-muted-foreground">{t("general.rolesHint")}</p>
        <div className="flex flex-wrap gap-1.5">
          {assignable.map((r) => {
            const on = roleIds.includes(r.id);
            return (
              <button key={r.id} type="button" aria-pressed={on} onClick={() => toggleRole(r.id)} className={cx("rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", !on && "opacity-50")}>
                <RoleChip name={r.name} color={r.color ?? null} muted={!on} />
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
        <div className="min-w-0">
          <div className="text-xs font-bold text-foreground">{t("general.allowBots")}</div>
          <p className="text-[11px] text-muted-foreground">{t("general.allowBotsHint", { depth: limits.maxChainDepth })}</p>
        </div>
        <Switch checked={allowBots} label={t("general.allowBots")} disabled={!ui.canEditSettings} onChange={setAllowBots} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
        <div className="min-w-0">
          <div className="text-xs font-bold text-foreground">{ui.botLocked ? t("locks.botLocked") : t("locks.lockBot")}</div>
          <p className="text-[11px] text-muted-foreground">{ui.botLocked ? (bot.lockSource === "pack" ? t("locks.byPublisher") : t("locks.byWorkspace")) : t("locks.lockBotHelp")}</p>
        </div>
        {ui.canLockBot && (
          <button type="button" className={btn} disabled={saving} onClick={() => void changeLock(true)}>
            <Lock className="h-3.5 w-3.5" aria-hidden /> {t("locks.lockBot")}
          </button>
        )}
        {ui.canUnlockBot && (
          <button type="button" className={btn} disabled={saving} onClick={() => void changeLock(false)}>
            <LockOpen className="h-3.5 w-3.5" aria-hidden /> {t("locks.unlockBot")}
          </button>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={btnDanger} onClick={onDelete}>
            <Trash2 className="h-3.5 w-3.5" aria-hidden /> {t("delete.button")}
          </button>
          {ui.canDuplicate && (
            <button type="button" className={btn} disabled={saving} onClick={() => void copy()}>
              <Copy className="h-3.5 w-3.5" aria-hidden /> {t("locks.duplicate")}
            </button>
          )}
        </div>
        <button type="button" className={btnPrimary} disabled={!dirty || issues.length > 0 || saving} onClick={save}>
          {saving ? t("common.saving") : t("common.save")}
        </button>
      </div>
    </div>
  );
}

/* ───────────── Commands ───────────── */

function CommandsPane({ bot, onChanged }: { bot: Bot; onChanged: () => Promise<void> }) {
  const t = useTranslations("bots");
  const s = useSettings();
  const initial = useMemo<CommandDraft[]>(() => bot.commands.map((c) => ({ ...c })), [bot.commands]);
  const [rows, setRows] = useState<CommandDraft[]>(initial);
  const [saving, setSaving] = useState(false);
  useEffect(() => setRows(initial), [initial]);
  const ui = botLockUi(bot);
  const issues = validateCommands(rows);
  const optionIssues = commandOptionIssues(rows);
  const dirty = JSON.stringify(rows) !== JSON.stringify(initial);
  const patch = (i: number, p: Partial<CommandDraft>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...p } : x)));

  const save = async () => {
    if (issues.size > 0 || optionIssues.size > 0 || saving) return;
    setSaving(true);
    try {
      await setBotCommands(s.teamId, bot.id, rows, s.accessToken);
      toast(t("commands.saved"), "success");
      await onChanged();
    } catch (e) {
      toast(lockAwareMessage(t, e, t("toast.error")), "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    // a locked bot freezes its commands: the fieldset disables every control inside (the server refuses the write anyway, BOT_LOCKED)
    <fieldset disabled={!ui.canEditCommands} className="min-w-0 space-y-3 border-0 p-0">
      {ui.botLocked && <LockNotice title={t("locks.botLocked")} body={t("locks.botLockedHint")} />}
      <p className="text-xs text-muted-foreground">{t("commands.intro")}</p>
      {!bot.scriptId && <p className="rounded-lg border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-[11px] text-foreground">{t("commands.noScript")}</p>}
      {rows.length === 0 ? (
        <EmptyState title={t("commands.empty")} />
      ) : (
        <ul className="space-y-2">
          {rows.map((c, i) => {
            const issue = issues.get(i);
            return (
              <li key={i} className="rounded-lg border border-border p-2.5">
                <div className="grid gap-2 sm:grid-cols-[minmax(120px,180px)_1fr_auto]">
                  <div className="flex items-center gap-1">
                    <span className="text-sm font-bold text-muted-foreground" aria-hidden>/</span>
                    <input aria-label={t("commands.name")} className={inputCls} value={c.name} maxLength={BOT_LIMITS.commandName + 1} placeholder={t("commands.namePlaceholder")} onChange={(e) => patch(i, { name: e.target.value })} aria-invalid={!!issue} />
                  </div>
                  <input aria-label={t("commands.description")} className={inputCls} value={c.description} maxLength={BOT_LIMITS.commandDescription} placeholder={t("commands.descriptionPlaceholder")} onChange={(e) => patch(i, { description: e.target.value })} />
                  <button type="button" className={btn} aria-label={t("commands.remove")} onClick={() => setRows((r) => r.filter((_, j) => j !== i))}>
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </div>
                <input aria-label={t("commands.usage")} className={cx(inputCls, "mt-2 h-8 text-xs")} value={c.usage ?? ""} maxLength={BOT_LIMITS.usage} placeholder={(c.options?.length ?? 0) > 0 ? usageOf(c.name.trim().replace(/^\//, "").toLowerCase() || t("commands.namePlaceholder"), c.options ?? []) : t("commands.usagePlaceholder")} onChange={(e) => patch(i, { usage: e.target.value })} />
                {issue && <p role="alert" className="mt-1 text-[11px] text-red-700 dark:text-red-300">{t(`commands.errors.${issue}`)}</p>}
                <details className="mt-2 rounded-lg border border-border" open={(c.options?.length ?? 0) > 0 && optionIssues.has(i) ? true : undefined}>
                  <summary className="flex cursor-pointer flex-wrap items-center gap-2 px-2.5 py-1.5 text-xs font-bold text-foreground">
                    {t("options.title")}
                    <span className="rounded-full bg-muted px-1.5 text-[10px] font-bold text-muted-foreground">{c.options?.length ?? 0}</span>
                    {optionIssues.has(i) && <span className="rounded-full border border-red-500/60 bg-red-500/10 px-1.5 text-[10px] font-bold text-red-700 dark:text-red-300">{t("options.problems", { count: optionIssues.get(i)?.length ?? 0 })}</span>}
                  </summary>
                  <div className="border-t border-border p-2.5">
                    <p className="mb-2 text-[11px] text-muted-foreground">{t("options.intro")}</p>
                    <OptionsEditor value={c.options ?? []} onChange={(options) => patch(i, { options })} issues={optionIssues.get(i) ?? []} commandName={c.name} />
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" className={btn} disabled={rows.length >= BOT_LIMITS.commandsPerBot} onClick={() => setRows((r) => [...r, { name: "", description: "", usage: "", options: [] }])}>
          <Plus className="h-3.5 w-3.5" aria-hidden /> {t("commands.add")}
        </button>
        <button type="button" className={btnPrimary} disabled={!dirty || issues.size > 0 || optionIssues.size > 0 || saving} onClick={save}>
          {saving ? t("common.saving") : t("common.save")}
        </button>
      </div>
      {optionIssues.size > 0 && <p role="alert" className="text-[11px] font-medium text-red-700 dark:text-red-300">{t("options.blockSave")}</p>}
      <p className="text-[11px] text-muted-foreground">{t("commands.scriptNote")}</p>
    </fieldset>
  );
}

/* ───────────── Script ───────────── */

function ScriptPane({ bot, onChanged }: { bot: Bot; onChanged: () => Promise<void> }) {
  const t = useTranslations("bots");
  const s = useSettings();
  const canScripts = s.perms.can("scripts.manage");
  const ui = botLockUi(bot);
  const [scripts, setScripts] = useState<ScriptSummary[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [pick, setPick] = useState("");

  const load = async () => {
    try {
      setScripts(await listScripts(s.teamId, s.accessToken));
    } catch {
      setScripts([]);
    }
  };
  useEffect(() => {
    if (canScripts) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.teamId, s.accessToken, canScripts, bot.scriptId]);

  const mine = bot.scriptId ? scripts?.find((x) => x.id === bot.scriptId) ?? null : null;
  const bindable = (scripts ?? []).filter((x) => x.id !== bot.scriptId && isBotScriptTriggerType(x.triggerType));

  const act = async (fn: () => Promise<void>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast(t(ok), "success");
      await onChanged();
      await load();
    } catch (e) {
      toast(lockAwareMessage(t, e, t("toast.error")), "error");
    } finally {
      setBusy(false);
    }
  };
  const changeCodeLock = (locked: boolean) => {
    if (locked && !window.confirm(t("locks.confirmLockCode"))) return;
    return act(async () => void (await setScriptLock(bot.scriptId!, s.teamId, locked, s.accessToken)), locked ? "locks.toast.codeLocked" : "locks.toast.codeUnlocked");
  };

  const createFromTemplate = () =>
    act(async () => {
      const script = await createScript({ teamId: s.teamId, name: t("example.scriptName", { name: bot.name }), description: t("example.scriptDescription") }, s.accessToken);
      await saveScriptGraph(script.id, s.teamId, buildHelloScriptGraph(script.id, () => crypto.randomUUID(), t("example.reply")) as any, s.accessToken);
      await updateBot(s.teamId, bot.id, { scriptId: script.id }, s.accessToken);
      await toggleScript(script.id, s.teamId, true, s.accessToken);
      // The command carries the example options (nombre, tono) the template's reply uses. An existing /hola without options is upgraded.
      const hello = buildHelloCommand({ description: t("example.commandDescription"), name: t("example.options.name"), tone: t("example.options.tone"), formal: t("example.options.formal"), casual: t("example.options.casual") });
      const existing = bot.commands.find((c) => c.name === HELLO_COMMAND);
      if (!existing || existing.options.length === 0) {
        await setBotCommands(s.teamId, bot.id, [...bot.commands.filter((c) => c.name !== HELLO_COMMAND), hello], s.accessToken);
      }
    }, "script.created");

  if (!canScripts) {
    return <EmptyState title={t("script.noPermission")} body={t("script.noPermissionBody")} />;
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">{t("script.intro")}</p>
      {bot.scriptId ? (
        <div className="rounded-lg border border-border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-sm font-bold text-foreground">{mine?.name ?? t("script.unknown")}</div>
              {!ui.codeLocked && (
                <div className="text-[11px] text-muted-foreground">
                  {t("script.trigger")}: <code className="font-semibold">{mine?.triggerType ?? "-"}</code>
                  {mine?.lastRunAt ? ` · ${t("script.lastRun", { status: mine.lastRunStatus ?? "-" })}` : ""}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold text-muted-foreground">{t("script.active")}</span>
              <Switch
                checked={bot.scriptActive === true}
                disabled={busy}
                label={t("script.active")}
                onChange={(v) => void act(async () => void (await toggleScript(bot.scriptId!, s.teamId, v, s.accessToken)), v ? "script.activated" : "script.paused")}
              />
            </div>
          </div>
          {ui.codeLocked && (
            <div className="mt-3">
              <LockNotice title={t("locks.scriptPane.title")} body={bot.codeLockSource === "pack" ? `${t("locks.scriptPane.body")} ${t("locks.byPublisher")}` : t("locks.scriptPane.bodyWorkspace")} />
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {ui.canOpenScript && (
              <Link href={scriptEditorHref(bot.scriptId)} className={btnPrimary}>
                <ExternalLink className="h-3.5 w-3.5" aria-hidden /> {t("script.open")}
              </Link>
            )}
            {ui.canBindScript && (
              <button type="button" className={btn} disabled={busy} onClick={() => void act(async () => void (await updateBot(s.teamId, bot.id, { scriptId: null }, s.accessToken)), "script.unbound")}>
                {t("script.unbind")}
              </button>
            )}
            {ui.canLockCode && (
              <button type="button" className={btn} disabled={busy} title={t("locks.lockCodeHelp")} onClick={() => void changeCodeLock(true)}>
                <Lock className="h-3.5 w-3.5" aria-hidden /> {t("locks.lockCode")}
              </button>
            )}
            {ui.canUnlockCode && (
              <button type="button" className={btn} disabled={busy} onClick={() => void changeCodeLock(false)}>
                <LockOpen className="h-3.5 w-3.5" aria-hidden /> {t("locks.unlockCode")}
              </button>
            )}
          </div>
          {!ui.codeLocked && <p className="mt-2 text-[11px] text-muted-foreground">{t("script.editorNote")}</p>}
        </div>
      ) : (
        <div className="space-y-3">
          <EmptyState title={t("script.none")} body={t("script.noneBody")} />
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={btnPrimary} disabled={busy || !ui.canBindScript} onClick={() => void createFromTemplate()}>
              {t("script.fromTemplate")}
            </button>
            {bindable.length > 0 && (
              <>
                <select className={cx(inputCls, "w-auto min-w-[10rem]")} value={pick} aria-label={t("script.pick")} onChange={(e) => setPick(e.target.value)}>
                  <option value="">{t("script.pick")}</option>
                  {bindable.map((x) => (
                    <option key={x.id} value={x.id}>{x.name}</option>
                  ))}
                </select>
                <button type="button" className={btn} disabled={busy || !pick || !ui.canBindScript} onClick={() => void act(async () => void (await updateBot(s.teamId, bot.id, { scriptId: pick }, s.accessToken)), "script.bound")}>
                  {t("script.bind")}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ───────────── Rooms ───────────── */

type RoomRow = { room: Room; overrides: RawOverride[] | null; saved: Record<BotRoomKey, TriState>; draft: Record<BotRoomKey, TriState>; saving?: boolean; error?: string };

function RoomsPane({ bot }: { bot: Bot }) {
  const t = useTranslations("bots");
  const s = useSettings();
  const [rows, setRows] = useState<RoomRow[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rooms = (await listTeamRooms(s.teamId, s.accessToken)).filter((r) => r.type === "channel" && !r.linkedEntityType);
        const loaded = await Promise.all(
          rooms.map(async (room): Promise<RoomRow> => {
            const empty = botRoomStates([], bot.userId);
            try {
              const overrides = readOverrides(await getRoomOverrides(room.id, s.accessToken));
              const states = botRoomStates(overrides, bot.userId);
              return { room, overrides, saved: states, draft: states };
            } catch (e) {
              return { room, overrides: null, saved: empty, draft: empty, error: e instanceof Error ? e.message : "error" };
            }
          }),
        );
        if (!cancelled) setRows(loaded);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [s.teamId, s.accessToken, bot.userId]);

  const patchRow = (id: string, p: Partial<RoomRow>) => setRows((r) => r?.map((x) => (x.room.id === id ? { ...x, ...p } : x)) ?? r);

  const save = async (row: RoomRow) => {
    if (!row.overrides) return;
    patchRow(row.room.id, { saving: true });
    try {
      const next = applyBotRoomStates(row.overrides, bot.userId, row.draft);
      await setRoomOverrides(row.room.id, next as unknown as RoomOverrideDto[], s.accessToken);
      patchRow(row.room.id, { saving: false, overrides: next, saved: row.draft });
      toast(t("rooms.saved", { room: row.room.name }), "success");
    } catch (e) {
      patchRow(row.room.id, { saving: false });
      toast(e instanceof Error ? e.message : t("toast.error"), "error");
    }
  };

  if (failed) return <EmptyState title={t("rooms.loadError")} />;
  if (!rows) return <div className="text-center text-xs text-muted-foreground">{t("loading")}</div>;
  if (rows.length === 0) return <EmptyState title={t("rooms.empty")} />;

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">{t("rooms.intro")}</p>
      <div className="hidden grid-cols-[1fr_repeat(3,7rem)_auto] items-end gap-2 px-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground sm:grid">
        <span>{t("rooms.room")}</span>
        {BOT_ROOM_KEYS.map((k) => (
          <span key={k} className="text-center">{t(`rooms.keys.${k}`)}</span>
        ))}
        <span className="w-16" />
      </div>
      <ul className="space-y-1.5">
        {sortRooms(rows).map((row) => {
          const dirty = !sameStates(row.saved, row.draft);
          return (
            <li key={row.room.id} className="rounded-lg border border-border px-2 py-2">
              <div className="grid items-center gap-2 sm:grid-cols-[1fr_repeat(3,7rem)_auto]">
                <div className="min-w-0 truncate text-sm font-semibold text-foreground">
                  <span aria-hidden>{row.room.emoji ? <EmojiText text={row.room.emoji} /> : "#"}</span> {row.room.name}
                  {row.error && <span className="ml-2 text-[10px] font-normal text-amber-700 dark:text-amber-300">{t("rooms.noAccess")}</span>}
                </div>
                {BOT_ROOM_KEYS.map((k) => (
                  <div key={k} className="flex items-center justify-between gap-2 sm:justify-center">
                    <span className="text-[11px] font-semibold text-muted-foreground sm:hidden">{t(`rooms.keys.${k}`)}</span>
                    <TriStateControl value={row.draft[k]} disabled={!row.overrides || row.saving} label={`${row.room.name}: ${t(`rooms.keys.${k}`)}`} onChange={(v) => patchRow(row.room.id, { draft: { ...row.draft, [k]: v } })} />
                  </div>
                ))}
                <button type="button" className={cx(btn, "h-8 w-full sm:w-16")} disabled={!dirty || row.saving || !row.overrides} onClick={() => void save(row)}>
                  {row.saving ? "…" : t("common.save")}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="text-[11px] text-muted-foreground">{t("rooms.inheritNote")}</p>
    </div>
  );
}

function sortRooms(rows: RoomRow[]): RoomRow[] {
  return [...rows].sort((a, b) => (a.room.sortOrder ?? 0) - (b.room.sortOrder ?? 0) || a.room.name.localeCompare(b.room.name));
}
