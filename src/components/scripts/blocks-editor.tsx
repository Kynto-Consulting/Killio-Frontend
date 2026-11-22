"use client";

/**
 * Editor of the rich content (`blocks`) of a bot message node. The message editor of the app (document bricks) models a different
 * thing (bricks of a document, with their own storage), so this is a structured editor of the SAFE set the backend accepts for
 * messages (v1: text, heading, list, checklist, table, image, link, code, quote, divider, embed; v2: section, thumbnail, media_gallery,
 * container, fields, author, footer, timestamp, progress, stats, key_value, badges, callout, columns, spacer, poll), validated with the
 * backend's limits and previewed with the same renderer the room uses. Containers and columns edit their children in place (nested
 * lists with the same add / remove / reorder controls). A JSON view covers anything the form does not show.
 * Rules: lib/bots/rich.ts. Templates to start from: lib/bots/rich-templates.ts.
 */

import { useEffect, useId, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";

import { useTranslations } from "@/components/providers/i18n-provider";
import { RichBlocks } from "@/components/rooms/bot-message-parts";
import { cx } from "@/components/roles/ui";
import {
  BADGE_COLORS, BLOCK_TYPES, CALLOUT_VARIANTS, LAYOUT_BLOCK_TYPES, PROGRESS_TONES, RICH_LIMITS, SIZES, TIMESTAMP_STYLES, V1_BLOCK_TYPES, V2_BLOCK_TYPES,
  badgesToLines, blankBlock, blockIssuesAt, blocksBytes, checklistToLines, countBlocks, fieldsToLines, galleryToLines, linesToBadges, linesToChecklist, linesToFields, linesToGallery,
  linesToList, linesToPairs, linesToPollOptions, linesToRows, linesToStats, pairsToLines, pollOptionsToLines, rowsToLines, statsToLines, validateBlocks,
  type BlockType, type RichBlock,
} from "@/lib/bots/rich";
import { BUTTON_STYLES } from "@/lib/bots/components";
import { moveItem } from "@/lib/bots/options";
import { TEMPLATE_IDS, richTemplate, type TemplateId } from "@/lib/bots/rich-templates";
import type { PayloadVar } from "@/lib/bots/room-nodes";
import { FieldRow, TemplateField, fieldCls, miniBtn, type MentionSource } from "./room-fields";

interface Props {
  id: string;
  value: unknown[] | undefined;
  onChange: (next: RichBlock[] | undefined) => void;
  variables: readonly PayloadVar[];
  mentions?: MentionSource;
  /** A template that carries buttons / selects hands them over here (the node's `components` field). */
  onApplyTemplate?: (patch: Record<string, unknown>) => void;
}

const s = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");
const LEAF_TYPES = BLOCK_TYPES.filter((b) => !(LAYOUT_BLOCK_TYPES as readonly string[]).includes(b));
const CONTAINER_CHILD_TYPES = BLOCK_TYPES.filter((b) => b !== "container");

export function BlocksEditor({ id, value, onChange, variables, mentions, onApplyTemplate }: Props) {
  const t = useTranslations("integrations");
  const blocks = (Array.isArray(value) ? value : []) as RichBlock[];
  const issues = validateBlocks(blocks);
  const [view, setView] = useState<"form" | "json">("form");
  const bytes = blocksBytes(blocks);
  const total = countBlocks(blocks);
  const [template, setTemplate] = useState<TemplateId | "">("");

  const commit = (next: RichBlock[]) => onChange(next.length ? next : undefined);

  return (
    <div className="space-y-2" role="group" aria-labelledby={`${id}-label`}>
      <div className="flex items-center justify-between gap-2">
        <div role="tablist" aria-label={t("canvas.room.blocks.viewLabel")} className="inline-flex rounded-md bg-muted/60 p-0.5">
          {(["form", "json"] as const).map((v) => (
            <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => setView(v)} className={cx("rounded px-2 py-1 text-[11px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", view === v ? "bg-background shadow-sm" : "text-muted-foreground")}>
              {t(`canvas.room.blocks.view.${v}`)}
            </button>
          ))}
        </div>
        <span className={cx("text-[10px]", bytes > RICH_LIMITS.maxTotalBytes || total > RICH_LIMITS.maxTotalBlocks ? "font-semibold text-red-700 dark:text-red-300" : "text-muted-foreground")}>
          {t("canvas.room.blocks.size", { count: blocks.length, max: RICH_LIMITS.maxBlocks, kb: (bytes / 1024).toFixed(1), maxKb: RICH_LIMITS.maxTotalBytes / 1024 })}
        </span>
      </div>

      {issues.filter((i) => i.at.length === 0).map((i) => <p key={i.code} role="alert" className="text-[11px] font-medium text-red-700 dark:text-red-300">{t(`canvas.room.issues.blocks.${i.code}`, { max: RICH_LIMITS.maxBlocks, kb: RICH_LIMITS.maxTotalBytes / 1024, total: RICH_LIMITS.maxTotalBlocks, images: RICH_LIMITS.maxImagesTotal })}</p>)}

      {view === "json" ? (
        <JsonView id={id} blocks={blocks} onApply={commit} />
      ) : (
        <BlockList id={id} blocks={blocks} onChange={commit} variables={variables} mentions={mentions} allowed={BLOCK_TYPES} max={RICH_LIMITS.maxBlocks} issues={issues} root />
      )}

      {view === "form" && (
        <div className="flex items-center gap-1.5">
          <label className="sr-only" htmlFor={`${id}-tpl`}>{t("canvas.room.templates.label")}</label>
          <select id={`${id}-tpl`} value={template} onChange={(e) => setTemplate(e.target.value as TemplateId | "")} className={cx(fieldCls, "flex-1")}>
            <option value="">{t("canvas.room.templates.label")}</option>
            {TEMPLATE_IDS.map((tid) => <option key={tid} value={tid}>{t(`canvas.room.templates.${tid}.name`)}</option>)}
          </select>
          <button
            type="button"
            className={miniBtn}
            disabled={!template}
            onClick={() => {
              if (!template) return;
              const tpl = richTemplate(template, (key) => t(key));
              if (tpl.components && onApplyTemplate) onApplyTemplate({ blocks: tpl.blocks, components: tpl.components, ...(tpl.expiresInMinutes ? { expiresInMinutes: tpl.expiresInMinutes } : {}) });
              else commit(tpl.blocks);
              setTemplate("");
            }}
          >
            {t("canvas.room.templates.use")}
          </button>
        </div>
      )}
      {view === "form" && template && <p className="text-[10px] text-muted-foreground">{t("canvas.room.templates.replaces")}</p>}

      {blocks.length > 0 && (
        <details className="rounded-md border border-border/60">
          <summary className="cursor-pointer px-2 py-1.5 text-[11px] font-semibold text-muted-foreground">{t("canvas.room.preview")}</summary>
          <div className="border-t border-border/60 p-2">
            <p className="mb-1.5 text-[10px] text-muted-foreground">{t("canvas.room.blocks.previewNote")}</p>
            <RichBlocks blocks={blocks} preview idPrefix={`${id}-preview`} />
          </div>
        </details>
      )}
    </div>
  );
}

function JsonView({ id, blocks, onApply }: { id: string; blocks: RichBlock[]; onApply: (b: RichBlock[]) => void }) {
  const t = useTranslations("integrations");
  const text = JSON.stringify(blocks, null, 2);
  const [draft, setDraft] = useState(text);
  const [err, setErr] = useState<"syntax" | "list" | null>(null);
  useEffect(() => setDraft(text), [text]);
  const apply = () => {
    try {
      const parsed = JSON.parse(draft || "[]");
      if (!Array.isArray(parsed)) return setErr("list");
      setErr(null);
      onApply(parsed as RichBlock[]);
    } catch {
      setErr("syntax");
    }
  };
  return (
    <div className="space-y-1.5">
      <label htmlFor={`${id}-json`} className="sr-only">{t("canvas.room.blocks.view.json")}</label>
      <textarea id={`${id}-json`} rows={10} value={draft} spellCheck={false} onChange={(e) => setDraft(e.target.value)} aria-invalid={err ? true : undefined} className={cx(fieldCls, "font-mono text-[11px]")} />
      {err && <p role="alert" className="text-[11px] font-medium text-red-700 dark:text-red-300">{t(`canvas.room.blocks.json.${err}`)}</p>}
      <div className="flex items-center gap-2">
        <button type="button" className={miniBtn} onClick={apply} disabled={draft === text}>{t("canvas.applyJson")}</button>
        <span className="text-[10px] text-muted-foreground">{t("canvas.room.blocks.json.hint")}</span>
      </div>
    </div>
  );
}

interface ListProps {
  id: string;
  blocks: RichBlock[];
  onChange: (next: RichBlock[]) => void;
  variables: readonly PayloadVar[];
  mentions?: MentionSource;
  /** Types this list may hold (a container holds no container; columns hold no layout blocks). */
  allowed: readonly BlockType[];
  max: number;
  issues?: ReturnType<typeof validateBlocks>;
  /** Top level only: issues are matched by the root index. */
  root?: boolean;
}

/** An ordered list of blocks with add / remove / reorder. Used for the message itself and, recursively, for container and column children. */
function BlockList({ id, blocks, onChange, variables, mentions, allowed, max, issues = [], root = false }: ListProps) {
  const t = useTranslations("integrations");
  const [adding, setAdding] = useState<BlockType | "">("");
  const patch = (i: number, p: Record<string, unknown>) => onChange(blocks.map((b, k) => (k === i ? ({ ...b, ...p } as RichBlock) : b)));
  const full = blocks.length >= max;

  return (
    <div className="space-y-2">
      {blocks.length === 0 && root && <p className="rounded-md border border-dashed border-border/60 px-2.5 py-2 text-[11px] text-muted-foreground">{t("canvas.room.blocks.empty")}</p>}
      <ol className="space-y-2">
        {blocks.map((b, i) => (
          <li key={i} className="rounded-md border border-border/60 bg-background/60 p-2">
            <div className="mb-1.5 flex items-center gap-1">
              <span className="text-[11px] font-bold text-foreground">{t(`canvas.room.blocks.types.${b.type}`)}</span>
              <span className="text-[10px] text-muted-foreground">#{i + 1}</span>
              <span className="ml-auto inline-flex gap-0.5">
                <button type="button" className={miniBtn} disabled={i === 0} aria-label={t("canvas.room.moveUp")} onClick={() => onChange(moveItem(blocks, i, i - 1) as RichBlock[])}><ArrowUp className="h-3 w-3" aria-hidden /></button>
                <button type="button" className={miniBtn} disabled={i === blocks.length - 1} aria-label={t("canvas.room.moveDown")} onClick={() => onChange(moveItem(blocks, i, i + 1) as RichBlock[])}><ArrowDown className="h-3 w-3" aria-hidden /></button>
                <button type="button" className={miniBtn} aria-label={t("canvas.room.remove")} onClick={() => onChange(blocks.filter((_, k) => k !== i))}><Trash2 className="h-3 w-3" aria-hidden /></button>
              </span>
            </div>
            <BlockFields id={`${id}-${i}`} block={b} onPatch={(p) => patch(i, p)} variables={variables} mentions={mentions} />
            {root && blockIssuesAt(issues, i).map((x, k) => (
              <p key={k} role="alert" className="mt-1 text-[11px] font-medium text-red-700 dark:text-red-300">
                {t(`canvas.room.issues.blocks.${x.code}`, { max: RICH_LIMITS.maxTextLength, total: RICH_LIMITS.maxTotalBlocks, images: RICH_LIMITS.maxImagesTotal })}{x.at.length > 1 ? ` (${x.at[1] + 1})` : ""}
              </p>
            ))}
          </li>
        ))}
      </ol>
      <div className="flex items-center gap-1.5">
        <label className="sr-only" htmlFor={`${id}-add`}>{t("canvas.room.blocks.add")}</label>
        <select id={`${id}-add`} value={adding} disabled={full} onChange={(e) => setAdding(e.target.value as BlockType | "")} className={cx(fieldCls, "flex-1")}>
          <option value="">{t("canvas.room.blocks.add")}</option>
          <optgroup label={t("canvas.room.blocks.groups.basic")}>
            {V1_BLOCK_TYPES.filter((bt) => allowed.includes(bt)).map((bt) => <option key={bt} value={bt}>{t(`canvas.room.blocks.types.${bt}`)}</option>)}
          </optgroup>
          <optgroup label={t("canvas.room.blocks.groups.rich")}>
            {V2_BLOCK_TYPES.filter((bt) => allowed.includes(bt)).map((bt) => <option key={bt} value={bt}>{t(`canvas.room.blocks.types.${bt}`)}</option>)}
          </optgroup>
        </select>
        <button type="button" className={miniBtn} disabled={!adding || full} onClick={() => { if (adding) { onChange([...blocks, blankBlock(adding)]); setAdding(""); } }}>
          <Plus className="h-3 w-3" aria-hidden /> {t("canvas.room.add")}
        </button>
      </div>
    </div>
  );
}

function BlockFields({ id, block, onPatch, variables, mentions }: { id: string; block: RichBlock; onPatch: (p: Record<string, unknown>) => void; variables: readonly PayloadVar[]; mentions?: MentionSource }) {
  const t = useTranslations("integrations");
  const uid = useId();
  const lbl = (key: string) => t(`canvas.room.blocks.fields.${key}`);
  const fid = (key: string) => `${id}-${uid}-${key}`;
  const line = (key: string, opts: { rows?: number; single?: boolean; mention?: boolean; required?: boolean; patchKey?: string; source?: Record<string, any> } = {}) => {
    const src = opts.source ?? block;
    const target = opts.patchKey ?? key;
    return (
      <FieldRow label={lbl(key)} required={opts.required} htmlFor={fid(key)}>
        <TemplateField id={fid(key)} value={s(src[key])} onChange={(v) => onPatch({ [target]: v })} variables={variables} single={opts.single ?? true} rows={opts.rows ?? 3} mentions={opts.mention ? mentions : undefined} />
      </FieldRow>
    );
  };
  const lines = (key: string, toText: (v: unknown) => string, fromText: (t: string) => unknown, hintKey: string) => (
    <FieldRow label={lbl(key)} hint={t(`canvas.room.blocks.hints.${hintKey}`)} htmlFor={fid(key)}>
      <LinesField id={fid(key)} value={toText(block[key])} onCommit={(text) => onPatch({ [key]: fromText(text) })} variables={variables} />
    </FieldRow>
  );
  const choice = (key: string, options: readonly string[], i18nGroup: string, opts: { empty?: boolean; fallback?: string } = {}) => (
    <FieldRow label={lbl(key)} htmlFor={fid(key)}>
      <select id={fid(key)} value={s(block[key]) || opts.fallback || ""} onChange={(e) => onPatch({ [key]: e.target.value === "" ? undefined : e.target.value })} className={fieldCls}>
        {opts.empty && <option value="">{t("canvas.room.blocks.none")}</option>}
        {options.map((o) => <option key={o} value={o}>{t(`canvas.room.blocks.${i18nGroup}.${o}`)}</option>)}
      </select>
    </FieldRow>
  );
  const check = (key: string) => (
    <label className="flex items-center gap-2 text-[11px] text-foreground">
      <input type="checkbox" checked={block[key] === true} onChange={(e) => onPatch({ [key]: e.target.checked })} className="h-3.5 w-3.5 rounded border-border" />
      {lbl(key)}
    </label>
  );
  const colorField = (key: string) => {
    const color = s(block[key]);
    return (
      <FieldRow label={lbl(key)} htmlFor={fid(key)}>
        <div className="flex items-center gap-1.5">
          <input type="color" aria-label={lbl(key)} value={/^#[0-9a-f]{6}$/i.test(color) ? color : "#3b82f6"} onChange={(e) => onPatch({ [key]: e.target.value })} className="h-8 w-9 cursor-pointer rounded border border-border bg-background p-0.5" />
          <input id={fid(key)} type="text" value={color} onChange={(e) => onPatch({ [key]: e.target.value })} placeholder="#3b82f6" spellCheck={false} className={cx(fieldCls, "font-mono")} />
        </div>
      </FieldRow>
    );
  };
  const perm = <p className="text-[10px] text-muted-foreground">{t("canvas.room.blocks.hints.embedsPerm")}</p>;

  switch (block.type) {
    case "text":
    case "quote":
      return line("text", { single: false, rows: 3, mention: false, required: true });
    case "heading":
      return (
        <div className="space-y-1.5">
          <FieldRow label={lbl("level")} htmlFor={fid("level")}>
            <select id={fid("level")} value={String(block.level ?? 2)} onChange={(e) => onPatch({ level: Number(e.target.value) })} className={fieldCls}>
              {[1, 2, 3].map((n) => <option key={n} value={n}>{t("canvas.room.blocks.headingLevel", { n })}</option>)}
            </select>
          </FieldRow>
          {line("text", { required: true })}
        </div>
      );
    case "list":
      return (
        <div className="space-y-1.5">
          {check("ordered")}
          {lines("items", (v) => (Array.isArray(v) ? v.map(s).join("\n") : ""), linesToList, "lines")}
        </div>
      );
    case "checklist":
      return lines("items", checklistToLines, linesToChecklist, "checklist");
    case "table":
      return (
        <div className="space-y-1.5">
          <FieldRow label={lbl("columns")} hint={t("canvas.room.blocks.hints.columns")} htmlFor={fid("columns")}>
            <LinesField id={fid("columns")} value={(Array.isArray(block.columns) ? block.columns : []).map(s).join(" | ")} onCommit={(text) => onPatch({ columns: text.split("|").map((c) => c.trim()).filter((c, _i, a) => c || a.length === 1) })} variables={variables} single />
          </FieldRow>
          {lines("rows", rowsToLines, linesToRows, "rows")}
        </div>
      );
    case "image":
      return <div className="space-y-1.5">{line("url", { required: true })}{line("alt")}{line("caption")}{perm}</div>;
    case "link":
      return <div className="space-y-1.5">{line("url", { required: true })}{line("title")}{line("description")}{perm}</div>;
    case "code":
      return <div className="space-y-1.5">{line("language")}{line("code", { single: false, rows: 4, required: true })}</div>;
    case "divider":
      return <div className="space-y-1.5">{choice("size", SIZES, "sizes", { empty: true })}<p className="text-[11px] text-muted-foreground">{t("canvas.room.blocks.hints.divider")}</p></div>;
    case "embed":
      return (
        <div className="space-y-1.5">
          {line("title")}
          {line("description", { single: false, rows: 3 })}
          {line("url")}
          {colorField("color")}
          {lines("fields", fieldsToLines, linesToFields, "fields")}
          {line("authorName")}
          {line("authorUrl")}
          {line("authorIconUrl")}
          {line("footer")}
          {line("footerIconUrl")}
          {line("imageUrl")}
          {line("thumbnailUrl")}
          {line("timestamp")}
          {perm}
        </div>
      );
    case "section": {
      const acc = block.accessory as Record<string, any> | undefined;
      const kind = acc?.type === "thumbnail" || acc?.type === "button" ? acc.type : "none";
      const setAcc = (next: Record<string, any> | undefined) => onPatch({ accessory: next });
      const accLine = (key: string, required = false) => (
        <FieldRow label={lbl(key)} required={required} htmlFor={fid(`acc-${key}`)}>
          <TemplateField id={fid(`acc-${key}`)} value={s(acc?.[key])} onChange={(v) => setAcc({ ...acc, [key]: v })} variables={variables} single />
        </FieldRow>
      );
      return (
        <div className="space-y-1.5">
          {line("text", { single: false, rows: 3, required: true })}
          <FieldRow label={lbl("accessory")} htmlFor={fid("accessory")}>
            <select
              id={fid("accessory")}
              value={kind}
              onChange={(e) => {
                const v = e.target.value;
                setAcc(v === "thumbnail" ? { type: "thumbnail", url: "", alt: "" } : v === "button" ? { type: "button", label: "", style: "secondary", customId: "section_btn" } : undefined);
              }}
              className={fieldCls}
            >
              {["none", "thumbnail", "button"].map((k) => <option key={k} value={k}>{t(`canvas.room.blocks.accessory.${k}`)}</option>)}
            </select>
          </FieldRow>
          {kind === "thumbnail" && <>{accLine("url", true)}{accLine("alt")}{perm}</>}
          {kind === "button" && (
            <>
              {accLine("label", true)}
              <FieldRow label={lbl("style")} htmlFor={fid("acc-style")}>
                <select
                  id={fid("acc-style")}
                  value={s(acc?.style) || "secondary"}
                  onChange={(e) => { const style = e.target.value; setAcc(style === "link" ? { type: "button", label: acc?.label ?? "", style, url: acc?.url ?? "" } : { type: "button", label: acc?.label ?? "", style, customId: acc?.customId || "section_btn" }); }}
                  className={fieldCls}
                >
                  {BUTTON_STYLES.map((st) => <option key={st} value={st}>{t(`canvas.room.components.styles.${st}`)}</option>)}
                </select>
              </FieldRow>
              {acc?.style === "link" ? accLine("url", true) : accLine("customId", true)}
            </>
          )}
        </div>
      );
    }
    case "thumbnail":
      return <div className="space-y-1.5">{line("url", { required: true })}{line("alt")}{choice("size", SIZES, "sizes", { fallback: "md" })}{perm}</div>;
    case "media_gallery":
      return <div className="space-y-1.5">{lines("items", galleryToLines, linesToGallery, "gallery")}{perm}</div>;
    case "container":
      return (
        <div className="space-y-1.5">
          {colorField("accentColor")}
          <p className="text-[11px] font-semibold text-muted-foreground">{lbl("children")}</p>
          <div className="border-l-2 border-border/60 pl-2">
            <BlockList id={fid("kids")} blocks={Array.isArray(block.blocks) ? block.blocks : []} onChange={(next) => onPatch({ blocks: next })} variables={variables} mentions={mentions} allowed={CONTAINER_CHILD_TYPES} max={RICH_LIMITS.maxContainerChildren} />
          </div>
        </div>
      );
    case "columns": {
      const cols: Array<{ blocks: RichBlock[] }> = Array.isArray(block.columns) ? block.columns : [];
      const setCol = (ci: number, next: RichBlock[]) => onPatch({ columns: cols.map((c, k) => (k === ci ? { blocks: next } : c)) });
      return (
        <div className="space-y-1.5">
          {cols.map((c, ci) => (
            <div key={ci} className="rounded border border-dashed border-border/60 p-2">
              <div className="mb-1 flex items-center gap-1">
                <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{t("canvas.room.blocks.column", { n: ci + 1 })}</span>
                <span className="ml-auto inline-flex gap-0.5">
                  <button type="button" className={miniBtn} disabled={ci === 0} aria-label={t("canvas.room.moveUp")} onClick={() => onPatch({ columns: moveItem(cols, ci, ci - 1) })}><ArrowUp className="h-3 w-3" aria-hidden /></button>
                  <button type="button" className={miniBtn} disabled={ci === cols.length - 1} aria-label={t("canvas.room.moveDown")} onClick={() => onPatch({ columns: moveItem(cols, ci, ci + 1) })}><ArrowDown className="h-3 w-3" aria-hidden /></button>
                  <button type="button" className={miniBtn} disabled={cols.length <= 2} aria-label={t("canvas.room.remove")} onClick={() => onPatch({ columns: cols.filter((_, k) => k !== ci) })}><Trash2 className="h-3 w-3" aria-hidden /></button>
                </span>
              </div>
              <BlockList id={fid(`col${ci}`)} blocks={c?.blocks ?? []} onChange={(next) => setCol(ci, next)} variables={variables} mentions={mentions} allowed={LEAF_TYPES} max={RICH_LIMITS.maxColumnBlocks} />
            </div>
          ))}
          <button type="button" className={miniBtn} disabled={cols.length >= 3} onClick={() => onPatch({ columns: [...cols, { blocks: [{ type: "text", text: "" }] }] })}>
            <Plus className="h-3 w-3" aria-hidden /> {t("canvas.room.blocks.addColumn")}
          </button>
        </div>
      );
    }
    case "fields":
      return (
        <div className="space-y-1.5">
          <FieldRow label={lbl("columnsCount")} htmlFor={fid("columnsCount")}>
            <select id={fid("columnsCount")} value={String(block.columns ?? 1)} onChange={(e) => onPatch({ columns: Number(e.target.value) })} className={fieldCls}>
              {[1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </FieldRow>
          {lines("fields", fieldsToLines, linesToFields, "fields")}
        </div>
      );
    case "author":
      return <div className="space-y-1.5">{line("name", { required: true })}{line("iconUrl")}{line("url")}{perm}</div>;
    case "footer":
      return <div className="space-y-1.5">{line("text", { required: true })}{line("iconUrl")}{perm}</div>;
    case "timestamp":
      return <div className="space-y-1.5">{line("value", { required: true })}{choice("style", TIMESTAMP_STYLES, "timestampStyles", { fallback: "datetime" })}{line("label")}<p className="text-[10px] text-muted-foreground">{t("canvas.room.blocks.hints.timestamp")}</p></div>;
    case "progress":
      return (
        <div className="space-y-1.5">
          <div className="grid grid-cols-2 gap-1.5">
            {line("value", { required: true })}
            {line("max")}
          </div>
          {line("label")}
          {choice("tone", PROGRESS_TONES, "tones", { fallback: "accent" })}
          {check("showPercent")}
        </div>
      );
    case "stats":
      return lines("items", statsToLines, linesToStats, "stats");
    case "key_value":
      return lines("items", pairsToLines, linesToPairs, "pairs");
    case "badges":
      return (
        <div className="space-y-1.5">
          {lines("items", (v) => (Array.isArray(v) ? v.map((i: any) => [s(i?.text), s(i?.color)].join(" | ").replace(/ \| $/, "")).join("\n") : ""), (txt) => linesToList(txt).map((l) => { const [text = "", color = ""] = l.split("|").map((c) => c.trim()); return { text, ...((BADGE_COLORS as readonly string[]).includes(color) ? { color } : {}) }; }), "badges")}
        </div>
      );
    case "callout":
      return (
        <div className="space-y-1.5">
          {choice("variant", CALLOUT_VARIANTS, "variants", { fallback: "info" })}
          {line("title")}
          {line("text", { single: false, rows: 3, required: true })}
          {line("icon")}
        </div>
      );
    case "spacer":
      return choice("size", SIZES, "sizes", { fallback: "md" });
    case "poll":
      return (
        <div className="space-y-1.5">
          {line("question", { required: true })}
          {lines("options", pollOptionsToLines, linesToPollOptions, "pollOptions")}
          {check("multiple")}
          {check("closed")}
          {line("closesAt")}
          <p className="text-[10px] text-muted-foreground">{t("canvas.room.blocks.hints.poll")}</p>
        </div>
      );
    default:
      return null;
  }
}

/**
 * One value per line that is turned into a list on blur, so typing a line break is never swallowed by a re-render of the parsed
 * list (blank lines would vanish while the person is still typing).
 */
function LinesField({ id, value, onCommit, variables, single = false }: { id: string; value: string; onCommit: (text: string) => void; variables: readonly PayloadVar[]; single?: boolean }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <div onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null) && draft !== value) onCommit(draft); }}>
      <TemplateField id={id} value={draft} onChange={setDraft} variables={variables} single={single} rows={4} />
    </div>
  );
}
