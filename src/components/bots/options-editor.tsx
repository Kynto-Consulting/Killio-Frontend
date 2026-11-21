"use client";

/**
 * Editor of the typed arguments (options) of a bot slash command: add / remove / reorder, type, required, choices, limits and
 * subcommands (group > subcommand, one level). Validated with the backend's own rules (lib/bots/options.ts), so the PUT that registers
 * the commands is not rejected for something visible here. Includes the preview of the command as people see it when they type "/".
 */

import { useId } from "react";
import { ArrowDown, ArrowUp, Plus, Slash, Trash2 } from "lucide-react";

import { useTranslations } from "@/components/providers/i18n-provider";
import { cx, btn } from "@/components/roles/ui";
import {
  COMMAND_LIMITS, VALUE_OPTION_TYPES, appendAt, blankOption, changeOptionType, isChoiceType, issuesAt, moveAt, previewLines, updateAt,
  type CommandOption, type CommandOptionType, type OptionIssue,
} from "@/lib/bots/options";

const mini = "inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40";
const small = "h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60";

interface Props {
  value: CommandOption[];
  onChange: (next: CommandOption[]) => void;
  issues: readonly OptionIssue[];
  /** Name of the command, for the labels and the preview. */
  commandName: string;
}

export function OptionsEditor({ value, onChange, issues, commandName }: Props) {
  const t = useTranslations("bots");
  const hasSubs = value.some((o) => o.type === "subcommand" || o.type === "subcommand_group");
  const hasPlain = value.some((o) => o.type !== "subcommand" && o.type !== "subcommand_group");
  const top = issuesAt(issues, []);
  const topFull = value.length >= COMMAND_LIMITS.maxOptionsPerLevel;

  return (
    <div className="space-y-2">
      {top.map((i) => <p key={i.code} role="alert" className="text-[11px] font-medium text-red-700 dark:text-red-300">{t(`options.issues.${i.code}`, { max: COMMAND_LIMITS.maxOptionsPerLevel })}</p>)}
      {value.length === 0 && <p className="rounded-lg border border-dashed border-border px-3 py-2 text-[11px] text-muted-foreground">{t("options.empty")}</p>}
      <OptionList list={value} at={[]} root={value} onChange={onChange} issues={issues} depth={0} />
      <div className="flex flex-wrap gap-1.5">
        <button type="button" className={btn} disabled={topFull || hasSubs} title={hasSubs ? t("options.noMixPlain") : undefined} onClick={() => onChange(appendAt(value, [], blankOption("string", value.length)))}>
          <Plus className="h-3.5 w-3.5" aria-hidden /> {t("options.addArgument")}
        </button>
        <button type="button" className={btn} disabled={topFull || hasPlain} title={hasPlain ? t("options.noMixSub") : undefined} onClick={() => onChange(appendAt(value, [], { ...blankOption("subcommand", value.length), options: [] }))}>
          <Plus className="h-3.5 w-3.5" aria-hidden /> {t("options.addSubcommand")}
        </button>
        <button type="button" className={btn} disabled={topFull || hasPlain} title={hasPlain ? t("options.noMixSub") : undefined} onClick={() => onChange(appendAt(value, [], { ...blankOption("subcommand_group", value.length), options: [blankOption("subcommand", 0)] }))}>
          <Plus className="h-3.5 w-3.5" aria-hidden /> {t("options.addGroup")}
        </button>
      </div>
      <CommandPreview name={commandName} options={value} />
    </div>
  );
}

function OptionList({ list, at, root, onChange, issues, depth }: { list: readonly CommandOption[]; at: number[]; root: CommandOption[]; onChange: (next: CommandOption[]) => void; issues: readonly OptionIssue[]; depth: 0 | 1 | 2 }) {
  if (list.length === 0) return null;
  return (
    <ol className={cx("space-y-2", depth > 0 && "border-l-2 border-border pl-2")}>
      {list.map((opt, i) => (
        <OptionRow key={i} opt={opt} at={[...at, i]} index={i} count={list.length} root={root} onChange={onChange} issues={issues} depth={depth} />
      ))}
    </ol>
  );
}

function OptionRow({ opt, at, index, count, root, onChange, issues, depth }: { opt: CommandOption; at: number[]; index: number; count: number; root: CommandOption[]; onChange: (next: CommandOption[]) => void; issues: readonly OptionIssue[]; depth: 0 | 1 | 2 }) {
  const t = useTranslations("bots");
  const uid = useId();
  const mine = issuesAt(issues, at);
  const patch = (p: Partial<CommandOption>) => onChange(updateAt(root, at, (o) => ({ ...o, ...p })));
  const isSub = opt.type === "subcommand";
  const isGroup = opt.type === "subcommand_group";
  const container = isSub || isGroup;
  const children = opt.options ?? [];
  const full = children.length >= COMMAND_LIMITS.maxOptionsPerLevel;
  const f = (k: string) => `${uid}-${k}`;
  const bad = mine.some((i) => i.code === "name_invalid" || i.code === "name_duplicate");

  return (
    <li className="rounded-lg border border-border bg-card p-2" data-option-row={at.join(".")}>
      <div className="flex flex-wrap items-center gap-1.5">
        <label className="sr-only" htmlFor={f("name")}>{t("options.name")}</label>
        <input id={f("name")} className={cx(small, "w-32 font-mono")} value={opt.name} maxLength={COMMAND_LIMITS.maxNameLength + 8} placeholder={t("options.namePlaceholder")} aria-invalid={bad || undefined} onChange={(e) => patch({ name: e.target.value })} />
        <label className="sr-only" htmlFor={f("type")}>{t("options.type")}</label>
        <select id={f("type")} className={cx(small, "w-36")} value={opt.type} onChange={(e) => onChange(updateAt(root, at, (o) => changeOptionType(o, e.target.value as CommandOptionType)))}>
          {depth === 0 && <option value="subcommand">{t("options.types.subcommand")}</option>}
          {depth === 0 && <option value="subcommand_group">{t("options.types.subcommand_group")}</option>}
          {depth === 1 && <option value="subcommand">{t("options.types.subcommand")}</option>}
          {depth !== 1 && VALUE_OPTION_TYPES.map((ty) => <option key={ty} value={ty}>{t(`options.types.${ty}`)}</option>)}
        </select>
        {!container && (
          <label className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-foreground">
            <input type="checkbox" checked={opt.required === true} onChange={(e) => patch({ required: e.target.checked || undefined })} className="h-3.5 w-3.5 rounded border-border" />
            {t("options.required")}
          </label>
        )}
        <span className="ml-auto inline-flex gap-1">
          <button type="button" className={mini} disabled={index === 0} aria-label={t("options.moveUp", { name: opt.name })} onClick={() => onChange(moveAt(root, at, -1))}><ArrowUp className="h-3.5 w-3.5" aria-hidden /></button>
          <button type="button" className={mini} disabled={index === count - 1} aria-label={t("options.moveDown", { name: opt.name })} onClick={() => onChange(moveAt(root, at, 1))}><ArrowDown className="h-3.5 w-3.5" aria-hidden /></button>
          <button type="button" className={mini} aria-label={t("options.remove", { name: opt.name })} onClick={() => onChange(updateAt(root, at, () => null))}><Trash2 className="h-3.5 w-3.5" aria-hidden /></button>
        </span>
      </div>
      <label className="sr-only" htmlFor={f("desc")}>{t("options.description")}</label>
      <input id={f("desc")} className={cx(small, "mt-1.5 w-full")} value={opt.description} maxLength={COMMAND_LIMITS.maxDescriptionLength + 20} placeholder={t("options.descriptionPlaceholder")} onChange={(e) => patch({ description: e.target.value })} />

      {!container && <Constraints opt={opt} idBase={uid} onPatch={patch} issues={mine} />}
      {mine.filter((i) => i.choice === undefined).map((i, k) => (
        <p key={k} role="alert" className="mt-1 text-[11px] font-medium text-red-700 dark:text-red-300">{t(`options.issues.${i.code}`, { max: COMMAND_LIMITS.maxOptionsPerLevel, desc: COMMAND_LIMITS.maxDescriptionLength, len: COMMAND_LIMITS.maxStringValueLength })}</p>
      ))}

      {container && (
        <div className="mt-2 space-y-2">
          <OptionList list={children} at={at} root={root} onChange={onChange} issues={issues} depth={isGroup ? 1 : 2} />
          <div className="flex flex-wrap gap-1.5">
            {isGroup ? (
              <button type="button" className={btn} disabled={full} onClick={() => onChange(appendAt(root, at, blankOption("subcommand", children.length)))}>
                <Plus className="h-3.5 w-3.5" aria-hidden /> {t("options.addSubcommand")}
              </button>
            ) : (
              <button type="button" className={btn} disabled={full} onClick={() => onChange(appendAt(root, at, blankOption("string", children.length)))}>
                <Plus className="h-3.5 w-3.5" aria-hidden /> {t("options.addArgument")}
              </button>
            )}
          </div>
        </div>
      )}
    </li>
  );
}

function Constraints({ opt, idBase, onPatch, issues }: { opt: CommandOption; idBase: string; onPatch: (p: Partial<CommandOption>) => void; issues: readonly OptionIssue[] }) {
  const t = useTranslations("bots");
  const num = (v: number | undefined) => (typeof v === "number" && Number.isFinite(v) ? String(v) : "");
  const parse = (s: string) => (s === "" ? undefined : Number(s));
  const hasChoices = opt.choices !== undefined;
  const numeric = opt.type === "integer" || opt.type === "number";
  const text = opt.type === "string";
  const choiceCapable = isChoiceType(opt.type);

  return (
    <div className="mt-1.5 space-y-1.5">
      {choiceCapable && (
        <label className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-foreground">
          <input
            type="checkbox"
            checked={hasChoices}
            onChange={(e) => onPatch(e.target.checked ? { choices: [{ name: "", value: text ? "" : (undefined as unknown as number) }], min: undefined, max: undefined, minLength: undefined, maxLength: undefined } : { choices: undefined })}
            className="h-3.5 w-3.5 rounded border-border"
          />
          {t("options.fixedChoices")}
        </label>
      )}
      {!hasChoices && numeric && (
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          <label className="inline-flex items-center gap-1">{t("options.min")}<input type="number" className={cx(small, "w-24")} value={num(opt.min)} step={opt.type === "integer" ? 1 : "any"} onChange={(e) => onPatch({ min: parse(e.target.value) })} /></label>
          <label className="inline-flex items-center gap-1">{t("options.max")}<input type="number" className={cx(small, "w-24")} value={num(opt.max)} step={opt.type === "integer" ? 1 : "any"} onChange={(e) => onPatch({ max: parse(e.target.value) })} /></label>
        </div>
      )}
      {!hasChoices && text && (
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          <label className="inline-flex items-center gap-1">{t("options.minLength")}<input type="number" min={0} className={cx(small, "w-24")} value={num(opt.minLength)} onChange={(e) => onPatch({ minLength: parse(e.target.value) })} /></label>
          <label className="inline-flex items-center gap-1">{t("options.maxLength")}<input type="number" min={1} className={cx(small, "w-24")} value={num(opt.maxLength)} onChange={(e) => onPatch({ maxLength: parse(e.target.value) })} /></label>
        </div>
      )}
      {hasChoices && opt.choices && (
        <ul className="space-y-1" aria-label={t("options.choices")}>
          {opt.choices.map((c, k) => (
            <li key={k} className="flex flex-wrap items-center gap-1.5">
              <label className="sr-only" htmlFor={`${idBase}-cn-${k}`}>{t("options.choiceName")}</label>
              <input id={`${idBase}-cn-${k}`} className={cx(small, "min-w-[7rem] flex-1")} value={c.name} placeholder={t("options.choiceName")} maxLength={COMMAND_LIMITS.maxChoiceNameLength + 10} onChange={(e) => onPatch({ choices: opt.choices!.map((x, j) => (j === k ? { ...x, name: e.target.value } : x)) })} />
              <label className="sr-only" htmlFor={`${idBase}-cv-${k}`}>{t("options.choiceValue")}</label>
              <input
                id={`${idBase}-cv-${k}`}
                className={cx(small, "w-28 font-mono")}
                type={text ? "text" : "number"}
                step={opt.type === "integer" ? 1 : "any"}
                value={typeof c.value === "number" ? (Number.isFinite(c.value) ? String(c.value) : "") : c.value ?? ""}
                placeholder={t("options.choiceValue")}
                onChange={(e) => onPatch({ choices: opt.choices!.map((x, j) => (j === k ? { ...x, value: text ? e.target.value : (e.target.value === "" ? (undefined as unknown as number) : Number(e.target.value)) } : x)) })}
              />
              <button type="button" className={mini} aria-label={t("options.removeChoice", { name: c.name || String(k + 1) })} onClick={() => onPatch({ choices: opt.choices!.length <= 1 ? undefined : opt.choices!.filter((_, j) => j !== k) })}><Trash2 className="h-3.5 w-3.5" aria-hidden /></button>
              {issues.filter((i) => i.choice === k).map((i) => <p key={i.code} role="alert" className="basis-full text-[11px] font-medium text-red-700 dark:text-red-300">{t(`options.issues.${i.code}`)}</p>)}
            </li>
          ))}
          <li>
            <button type="button" className={btn} disabled={opt.choices.length >= COMMAND_LIMITS.maxChoices} onClick={() => onPatch({ choices: [...opt.choices!, { name: "", value: text ? "" : (undefined as unknown as number) }] })}>
              <Plus className="h-3.5 w-3.5" aria-hidden /> {t("options.addChoice")}
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}

/** The command as it shows in the composer's autocomplete: name, bot, description and, per invocable form, its arguments. */
export function CommandPreview({ name, options, description, botName }: { name: string; options: readonly CommandOption[]; description?: string; botName?: string }) {
  const t = useTranslations("bots");
  const cmd = name.trim().replace(/^\//, "").toLowerCase() || t("options.previewName");
  const lines = previewLines(cmd, options);
  return (
    <section aria-label={t("options.previewTitle")} className="rounded-lg border border-dashed border-border bg-muted/30 p-2.5">
      <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{t("options.previewTitle")}</p>
      <ul className="space-y-2">
        {lines.map((line) => (
          <li key={line.path} className="rounded-md border border-border bg-popover px-2.5 py-1.5">
            <div className="flex items-center gap-1.5 text-xs">
              <Slash className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
              <span className="font-semibold">{line.path.slice(1)}</span>
              {line.args.map((a) => (
                <span key={a.name} className={cx("rounded px-1 font-mono text-[11px]", a.required ? "bg-primary/15 text-foreground" : "bg-muted text-muted-foreground")}>
                  {a.required ? `<${a.name}>` : `[${a.name}]`}
                </span>
              ))}
              {botName && <span className="ml-auto rounded bg-violet-500/15 px-1 text-[9px] font-bold uppercase text-violet-700 dark:text-violet-300">{botName}</span>}
            </div>
            {description && <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{description}</p>}
            {line.args.length > 0 && (
              <dl className="mt-1 grid gap-0.5 text-[11px]">
                {line.args.map((a) => (
                  <div key={a.name} className="flex flex-wrap items-baseline gap-x-1.5">
                    <dt className="font-mono font-semibold">{a.name}</dt>
                    <dd className="text-muted-foreground">
                      {t(`options.types.${a.type}`)}{a.required ? ` · ${t("options.required")}` : ""}{a.summary ? ` · ${a.summary}` : ""}{a.description ? ` — ${a.description}` : ""}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
