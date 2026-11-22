"use client";

/**
 * Properties panel of the room / bot nodes: description and ports, every field of the node with its picker or editor, the payload
 * variables available at this node, and the problems of its configuration. Catalog and rules: lib/bots/room-nodes.ts.
 * The panel never writes a key the backend schema does not have (the schedule mode is derived from the config, not stored).
 */

import { useEffect, useMemo, useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine } from "lucide-react";

import { useTranslations } from "@/components/providers/i18n-provider";
import { cx } from "@/components/roles/ui";
import { listBots } from "@/lib/api/bots";
import { listTeamMembers } from "@/lib/api/contracts";
import { listTeamRolesLite, listTeamRooms, type Room, type TeamRoleLite } from "@/lib/api/rooms";
import type { Bot } from "@/lib/bots/model";
import { optionSummary, type CommandOption } from "@/lib/bots/options";
import {
  ROOM_NODE_SPECS, availableVariables, fallbackVariables, samplePayload, scheduleModeOf, subcommandNames, validateRoomNode, leafOptions,
  type GraphEdgeLike, type GraphNodeLike, type PayloadVar, type RoomField, type RoomNodeKind, type RoomTriggerKind, type VariableContext,
} from "@/lib/bots/room-nodes";
import { normalizeWorkspaceMembers } from "@/lib/workspace-members";
import { BlocksEditor } from "./blocks-editor";
import { ComponentsEditor } from "./components-editor";
import { ModalEditor } from "./modal-editor";
import { EmojiField, EntityField, FieldRow, TemplateField, WeekdaysField, fieldCls, variableText, type EntityOption, type MentionSource } from "./room-fields";

/* ───────────── data the pickers need ───────────── */

interface Sources {
  rooms: EntityOption[];
  users: EntityOption[];
  roles: EntityOption[];
  bots: Bot[];
  loading: boolean;
}

const EMPTY: Sources = { rooms: [], users: [], roles: [], bots: [], loading: false };
const cache = new Map<string, { at: number; data: Sources }>();
const TTL = 60_000;

/** Rooms, people, roles and bots of the workspace. Each list fails on its own (a missing one only means fewer choices). */
function useSources(teamId: string | undefined, accessToken: string | undefined): Sources {
  const [data, setData] = useState<Sources>(() => (teamId ? cache.get(teamId)?.data ?? { ...EMPTY, loading: true } : EMPTY));
  useEffect(() => {
    if (!teamId || !accessToken) return setData(EMPTY);
    const hit = cache.get(teamId);
    if (hit && Date.now() - hit.at < TTL) return setData(hit.data);
    let cancelled = false;
    setData((d) => ({ ...d, loading: true }));
    Promise.allSettled([listTeamRooms(teamId, accessToken), listTeamMembers(teamId, accessToken), listTeamRolesLite(teamId, accessToken), listBots(teamId, accessToken)]).then(([rooms, members, roles, bots]) => {
      if (cancelled) return;
      const rawMembers = members.status === "fulfilled" ? (members.value as unknown as any[]) : [];
      const botIds = new Set(rawMembers.filter((m) => m?.isBot === true || m?.is_bot === true).map((m) => String(m.id)));
      const next: Sources = {
        rooms: rooms.status === "fulfilled" ? (rooms.value as Room[]).filter((r) => r.type === "channel" && !r.linkedEntityType).map((r) => ({ id: r.id, label: `${r.emoji ?? "#"} ${r.name}` })) : [],
        users: normalizeWorkspaceMembers(rawMembers).filter((m) => !botIds.has(m.id)).map((m) => ({ id: m.id, label: m.name, hint: m.primaryEmail ?? undefined })),
        roles: roles.status === "fulfilled" ? (roles.value as TeamRoleLite[]).filter((r) => r.mentionable !== false).map((r) => ({ id: r.id, label: r.name })) : [],
        bots: bots.status === "fulfilled" ? bots.value.bots : [],
        loading: false,
      };
      cache.set(teamId, { at: Date.now(), data: next });
      setData(next);
    });
    return () => { cancelled = true; };
  }, [teamId, accessToken]);
  return data;
}

/* ───────────── component ───────────── */

interface Props {
  kind: RoomNodeKind;
  nodeId: string;
  scriptId: string;
  teamId?: string;
  accessToken?: string;
  config: Record<string, unknown>;
  nodes: readonly GraphNodeLike[];
  edges: readonly GraphEdgeLike[];
  /** Sets (or, with undefined / empty, removes) one config key of the selected node. */
  onChange: (key: string, value: unknown) => void;
  /** Replaces keys at once (a mode switch touches two). */
  onPatch: (patch: Record<string, unknown>) => void;
}

const isSet = (v: unknown) => v !== undefined && v !== null && String(v) !== "";

export function RoomNodeProperties({ kind, nodeId, scriptId, teamId, accessToken, config, nodes, edges, onChange, onPatch }: Props) {
  const t = useTranslations("integrations");
  const spec = ROOM_NODE_SPECS[kind];
  const src = useSources(teamId, accessToken);

  // The bot this script is bound to: its commands (and their options) feed the command trigger and `options.<name>`.
  const bot = useMemo(() => src.bots.find((b) => b.scriptId === scriptId) ?? null, [src.bots, scriptId]);
  const ctx = useMemo<VariableContext>(() => ({ commands: (bot?.commands ?? []).map((c) => ({ name: c.name, options: c.options })) }), [bot]);
  const variables = useMemo<PayloadVar[]>(() => {
    const own = availableVariables(nodeId, nodes, edges, ctx);
    return own.length > 0 || spec.role === "trigger" ? own : fallbackVariables(nodes, ctx);
  }, [nodeId, nodes, edges, ctx, spec.role]);

  const issues = validateRoomNode(kind, config);
  const issueFor = (key: string) => issues.find((i) => i.field === key);
  const sameKind = nodes.filter((n) => (n.nodeKind ?? n.type) === kind).length;
  const mentions: MentionSource = { users: src.users, roles: src.roles };

  const valueOf = (key: string): unknown => (key === "scheduleMode" ? scheduleModeOf(config) : config[key]);
  const set = (key: string, value: unknown) => {
    if (value === false || (Array.isArray(value) && value.length === 0)) return onChange(key, undefined);
    onChange(key, value);
  };
  const shown = (f: RoomField): boolean => {
    if (f.showWhen && !f.showWhen.isIn.includes(String(valueOf(f.showWhen.key) ?? ""))) return false;
    if (f.key === "expiresInMinutes" && spec.fields.some((x) => x.key === "components")) {
      const hasComponents = (Array.isArray(config.components) && config.components.length > 0) || isSet(config.componentsFrom);
      if (!hasComponents) return false;
    }
    return true;
  };

  const lbl = (key: string) => t(`canvas.room.fields.${key}.label`);
  const hint = (key: string) => {
    const k = `canvas.room.fields.${key}.hint`;
    const text = t(k);
    return text === k ? undefined : text;
  };
  const errorText = (key: string): string | null => {
    const i = issueFor(key);
    if (!i) return null;
    if (i.code === "blocks_invalid" || i.code === "components_invalid" || i.code === "modal_invalid") return null; // shown by their own editors
    return t(`canvas.room.issues.node.${i.code}`);
  };

  const commands = bot?.commands ?? [];
  const chosenCommand = commands.find((c) => c.name.toLowerCase() === String(config.command ?? "").trim().toLowerCase().replace(/^\//, ""));

  return (
    <div className="space-y-3" data-room-node={kind}>
      <div className="rounded-md border border-border bg-background px-2.5 py-2">
        <p className="text-[11px] leading-snug text-muted-foreground">{t(`canvas.room.nodes.${spec.labelKey}`)}</p>
        <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
          <span className="inline-flex items-center gap-1"><ArrowDownToLine className="h-3 w-3" aria-hidden />{spec.hasInput ? t("canvas.room.ports.in") : t("canvas.room.ports.noIn")}</span>
          <span className="inline-flex items-center gap-1"><ArrowUpFromLine className="h-3 w-3" aria-hidden />{t("canvas.room.ports.out")}</span>
        </p>
      </div>

      {spec.oncePerScript && sameKind > 1 && <p role="alert" className="rounded-md border border-amber-500/60 bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-foreground">{t("canvas.room.duplicateTrigger")}</p>}
      {kind === "killio.trigger.scheduled" && <p className="rounded-md border border-border bg-muted/40 px-2.5 py-1.5 text-[11px] text-muted-foreground">{t("canvas.room.scheduledNote")}</p>}
      {kind === "killio.trigger.command" && !bot && !src.loading && <p className="rounded-md border border-border bg-muted/40 px-2.5 py-1.5 text-[11px] text-muted-foreground">{t("canvas.room.commandNoBot")}</p>}

      {spec.fields.filter(shown).map((f) => {
        const id = `rn-${nodeId}-${f.key}`;
        const value = valueOf(f.key);
        const err = errorText(f.key);
        const describedBy = [hint(f.key) ? `${id}-hint` : "", err ? `${id}-err` : ""].filter(Boolean).join(" ") || undefined;
        const required = f.required || (f.key === "text" && issueFor("text")?.code === "content_required");

        switch (f.kind) {
          case "room":
            return (
              <FieldRow key={f.key} label={lbl("roomId")} hint={hint(f.required ? "roomIdRequired" : "roomId")} error={err} required={f.required} htmlFor={id} fieldId={f.key}>
                <EntityField id={id} value={String(value ?? "")} onChange={(v) => set(f.key, v)} options={src.rooms} loading={src.loading} emptyLabel={f.required ? t("canvas.room.pickRoom") : t("canvas.room.sameRoom")} customLabel={t("canvas.room.customValue")} listLabel={t("canvas.room.backToList")} placeholder="{{ roomId }}" ariaDescribedBy={describedBy} />
              </FieldRow>
            );
          case "user":
            return (
              <FieldRow key={f.key} label={lbl("userId")} hint={hint("userId")} error={err} htmlFor={id} fieldId={f.key}>
                <EntityField id={id} value={String(value ?? "")} onChange={(v) => set(f.key, v)} options={src.users} loading={src.loading} emptyLabel={t("canvas.room.invoker")} customLabel={t("canvas.room.customValue")} listLabel={t("canvas.room.backToList")} placeholder="{{ invokedBy }}" ariaDescribedBy={describedBy} />
              </FieldRow>
            );
          case "line":
            return (
              <FieldRow key={f.key} label={lbl(f.key)} hint={hint(f.key)} error={err} required={required} htmlFor={id} fieldId={f.key}>
                <TemplateField id={id} value={String(value ?? "")} onChange={(v) => set(f.key, v)} variables={spec.role === "trigger" && f.key !== "dailyAt" ? [] : variables} single placeholder={f.key === "dailyAt" ? "09:30" : f.key === "customId" ? "vote:*" : f.key === "commandPrefix" ? "/hola" : undefined} describedBy={describedBy} invalid={Boolean(err)} />
              </FieldRow>
            );
          case "template":
            return (
              <FieldRow key={f.key} label={lbl(f.key)} hint={t("canvas.room.templateHint", { field: "{campo}", expr: "{{ expresión }}" })} error={err} required={required} htmlFor={id} fieldId={f.key}>
                <TemplateField id={id} value={String(value ?? "")} onChange={(v) => set(f.key, v)} variables={variables} mentions={mentions} describedBy={describedBy} invalid={Boolean(err)} placeholder={t("canvas.room.textPlaceholder")} />
              </FieldRow>
            );
          case "boolean":
            return (
              <div key={f.key} data-field={f.key}>
                <label className="flex items-center gap-2 text-xs text-foreground">
                  <input type="checkbox" checked={value === true} onChange={(e) => set(f.key, e.target.checked)} className="h-4 w-4 rounded border-border" aria-describedby={describedBy} />
                  {lbl(f.key)}
                </label>
                {hint(f.key) && <p id={`${id}-hint`} className="ml-6 text-[10px] leading-snug text-muted-foreground">{hint(f.key)}</p>}
              </div>
            );
          case "number":
            return (
              <FieldRow key={f.key} label={lbl(f.key)} hint={hint(f.key)} error={err} htmlFor={id} fieldId={f.key}>
                <input id={id} type="number" value={typeof value === "number" ? String(value) : ""} onChange={(e) => set(f.key, e.target.value === "" ? undefined : Number(e.target.value))} aria-describedby={describedBy} aria-invalid={Boolean(err) || undefined} className={fieldCls} />
              </FieldRow>
            );
          case "select": {
            const current = String(value ?? f.options?.[0] ?? "");
            return (
              <FieldRow key={f.key} label={lbl(f.key)} hint={hint(f.key)} error={err} htmlFor={id} fieldId={f.key}>
                <select
                  id={id}
                  value={current}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (f.key === "scheduleMode") return onPatch(v === "daily" ? { everyMinutes: undefined, dailyAt: String(config.dailyAt ?? "09:00") } : { dailyAt: undefined, weekdays: undefined, everyMinutes: typeof config.everyMinutes === "number" ? config.everyMinutes : 60 });
                    set(f.key, v);
                  }}
                  className={fieldCls}
                >
                  {(f.options ?? []).map((o) => <option key={o} value={o}>{t(`canvas.room.fields.${f.key}.options.${o}`)}</option>)}
                </select>
              </FieldRow>
            );
          }
          case "emoji":
            return (
              <FieldRow key={f.key} label={lbl("emoji")} hint={hint("emoji")} error={err} required={f.required} htmlFor={id} fieldId={f.key}>
                <EmojiField id={id} value={String(value ?? "")} onChange={(v) => set(f.key, v)} placeholder="👍" ariaDescribedBy={describedBy} />
              </FieldRow>
            );
          case "lines":
            return (
              <FieldRow key={f.key} label={lbl(f.key)} hint={hint(f.key)} error={err} htmlFor={id} fieldId={f.key}>
                <LinesList id={id} value={Array.isArray(value) ? (value as unknown[]).map(String) : []} onChange={(v) => set(f.key, v)} />
              </FieldRow>
            );
          case "weekdays":
            return (
              <FieldRow key={f.key} label={lbl("weekdays")} hint={hint("weekdays")} error={err} fieldId={f.key}>
                <WeekdaysField value={Array.isArray(value) ? (value as number[]) : undefined} onChange={(v) => set(f.key, v)} legend={lbl("weekdays")} />
              </FieldRow>
            );
          case "command":
            return (
              <div key={f.key} className="space-y-2" data-field={f.key}>
                <FieldRow label={lbl("command")} hint={hint("command")} error={err} htmlFor={id}>
                  {commands.length > 0 ? (
                    <select id={id} value={chosenCommand ? chosenCommand.name : String(value ?? "")} onChange={(e) => onPatch({ command: e.target.value || undefined, subcommand: undefined })} className={fieldCls}>
                      <option value="">{t("canvas.room.anyCommand")}</option>
                      {commands.map((c) => <option key={c.name} value={c.name}>/{c.name}{c.options.length ? ` (${leafOptions(c.options).length})` : ""}</option>)}
                      {String(value ?? "") && !chosenCommand && <option value={String(value)}>{String(value)}</option>}
                    </select>
                  ) : (
                    <input id={id} type="text" value={String(value ?? "")} onChange={(e) => set("command", e.target.value)} placeholder="hola" spellCheck={false} className={cx(fieldCls, "font-mono")} aria-describedby={describedBy} aria-invalid={Boolean(err) || undefined} />
                  )}
                </FieldRow>
                {chosenCommand && <CommandOptionsList command={chosenCommand.name} options={chosenCommand.options} />}
              </div>
            );
          case "subcommand": {
            const names = chosenCommand ? subcommandNames(chosenCommand.options) : [];
            if (names.length === 0 && !isSet(value)) return null;
            return (
              <FieldRow key={f.key} label={lbl("subcommand")} hint={hint("subcommand")} htmlFor={id} fieldId={f.key}>
                {names.length > 0 ? (
                  <select id={id} value={String(value ?? "")} onChange={(e) => set(f.key, e.target.value)} className={fieldCls}>
                    <option value="">{t("canvas.room.anySubcommand")}</option>
                    {names.map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                ) : (
                  <input id={id} type="text" value={String(value ?? "")} onChange={(e) => set(f.key, e.target.value)} className={cx(fieldCls, "font-mono")} />
                )}
              </FieldRow>
            );
          }
          case "blocks":
            return (
              <div key={f.key} data-field={f.key}>
                <p id={`${id}-label`} className="mb-1 text-[11px] font-medium text-muted-foreground">{lbl("blocks")}</p>
                <BlocksEditor id={id} value={Array.isArray(value) ? value : undefined} onChange={(v) => set("blocks", v)} variables={variables} mentions={mentions} onApplyTemplate={spec.fields.some((x) => x.key === "components") ? (patch) => onPatch(patch) : undefined} />
                <p className="mt-1 text-[10px] leading-snug text-muted-foreground">{hint("blocks")}</p>
              </div>
            );
          case "modal":
            return (
              <div key={f.key} data-field={f.key}>
                <p id={`${id}-label`} className="mb-1 text-[11px] font-medium text-muted-foreground">{lbl("modal")}</p>
                <ModalEditor id={id} value={config.modal} onChange={(v) => set("modal", v)} variables={variables} />
                <p className="mt-1 text-[10px] leading-snug text-muted-foreground">{hint("modal")}</p>
              </div>
            );
          case "components": {
            const removing = f.clearable === true && Array.isArray(value) && value.length === 0;
            return (
              <div key={f.key} data-field={f.key}>
                <p id={`${id}-label`} className="mb-1 text-[11px] font-medium text-muted-foreground">{lbl("components")}</p>
                {f.clearable && (
                  <div className="mb-2">
                    <label className="flex items-center gap-2 text-xs text-foreground">
                      <input type="checkbox" checked={removing} onChange={(e) => onChange("components", e.target.checked ? [] : undefined)} className="h-4 w-4 rounded border-border" aria-describedby={`${id}-clear-hint`} />
                      {t("canvas.room.components.removeAll")}
                    </label>
                    <p id={`${id}-clear-hint`} className="ml-6 text-[10px] leading-snug text-muted-foreground">{t("canvas.room.components.removeAllHint")}</p>
                  </div>
                )}
                {!removing && <ComponentsEditor id={id} value={Array.isArray(value) ? value : undefined} expiresInMinutes={config.expiresInMinutes} onChange={(v) => set("components", v)} variables={variables} />}
                <p className="mt-1 text-[10px] leading-snug text-muted-foreground">{hint("components")}</p>
              </div>
            );
          }
          default:
            return null;
        }
      })}

      <VariablesList variables={variables} role={spec.role} />
      {spec.role === "trigger" && (
        <details className="rounded-md border border-border bg-background">
          <summary className="cursor-pointer px-2.5 py-1.5 text-[11px] font-semibold text-muted-foreground">{t("canvas.room.samplePayload")}</summary>
          <pre className="max-h-48 overflow-auto border-t border-border p-2 font-mono text-[10px] text-foreground">{JSON.stringify(samplePayload(kind as RoomTriggerKind, config, ctx).data, null, 2)}</pre>
        </details>
      )}
    </div>
  );
}

/** One text per line, stored as a list (committed on blur so a blank line is not swallowed while typing). */
function LinesList({ id, value, onChange }: { id: string; value: string[]; onChange: (v: string[]) => void }) {
  const joined = value.join("\n");
  const [draft, setDraft] = useState(joined);
  useEffect(() => setDraft(joined), [joined]);
  return (
    <textarea
      id={id}
      rows={4}
      value={draft}
      spellCheck={false}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => { if (draft !== joined) onChange(draft.split(/\r?\n/).map((x) => x.trim()).filter(Boolean)); }}
      className={cx(fieldCls, "font-mono")}
    />
  );
}

/** Read-only summary of the options of the chosen command, as the trigger will deliver them. */
function CommandOptionsList({ command, options }: { command: string; options: readonly CommandOption[] }) {
  const t = useTranslations("integrations");
  if (options.length === 0) return <p className="text-[11px] text-muted-foreground">{t("canvas.room.commandNoOptions", { command })}</p>;
  const rows = (list: readonly CommandOption[], depth = 0): React.ReactNode =>
    list.map((o) => (
      <li key={`${depth}-${o.name}`} className="rounded border border-border bg-background px-2 py-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-mono text-[11px] font-bold text-foreground">{o.name}</span>
          <span className="rounded bg-muted px-1 text-[9px] font-bold uppercase text-muted-foreground">{t(`canvas.room.optionTypes.${o.type}`)}</span>
          {o.required && <span className="text-[10px] font-semibold text-red-700 dark:text-red-300">{t("canvas.room.required")}</span>}
          {optionSummary(o) && <span className="truncate text-[10px] text-muted-foreground">{optionSummary(o)}</span>}
        </div>
        {o.description && <p className="text-[10px] text-muted-foreground">{o.description}</p>}
        {o.options && o.options.length > 0 && <ul className="mt-1 space-y-1 border-l border-border pl-2">{rows(o.options, depth + 1)}</ul>}
      </li>
    ));
  return (
    <div>
      <p className="mb-1 text-[11px] font-medium text-muted-foreground">{t("canvas.room.commandOptions", { command })}</p>
      <ul className="space-y-1">{rows(options)}</ul>
      <p className="mt-1 text-[10px] text-muted-foreground">{t("canvas.room.commandOptionsUse", { example: "{options.nombre}" })}</p>
    </div>
  );
}

function VariablesList({ variables, role }: { variables: readonly PayloadVar[]; role: "trigger" | "action" }) {
  const t = useTranslations("integrations");
  const [copied, setCopied] = useState<string | null>(null);
  if (variables.length === 0) return null;
  const copy = async (name: string) => {
    try {
      await navigator.clipboard.writeText(`{${name}}`);
      setCopied(name);
      setTimeout(() => setCopied((c) => (c === name ? null : c)), 1200);
    } catch {
      /* clipboard not available: the list is still readable */
    }
  };
  return (
    <details className="rounded-md border border-border bg-background">
      <summary className="cursor-pointer px-2.5 py-1.5 text-[11px] font-semibold text-muted-foreground">{t(role === "trigger" ? "canvas.room.variables.emitted" : "canvas.room.variables.title")} ({variables.length})</summary>
      <ul className="max-h-48 space-y-0.5 overflow-y-auto border-t border-border p-1.5">
        {variables.map((v) => (
          <li key={v.name}>
            <button type="button" onClick={() => void copy(v.name)} aria-label={t("canvas.room.variables.copy", { name: v.name })} className="flex w-full items-baseline gap-2 rounded px-1.5 py-0.5 text-left text-[11px] hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <span className="font-mono font-semibold text-foreground">{`{${v.name}}`}</span>
              <span className="truncate text-muted-foreground">{copied === v.name ? t("canvas.room.variables.copied") : variableText(t, v)}</span>
            </button>
          </li>
        ))}
      </ul>
    </details>
  );
}
