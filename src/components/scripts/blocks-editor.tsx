"use client";

/**
 * Editor of the rich content (`blocks`) of a bot message node. The message editor of the app (document bricks) models a different
 * thing (bricks of a document, with their own storage), so this is a structured editor of the SAFE subset the backend accepts for
 * messages (text, heading, list, checklist, table, image, link, code, quote, divider, embed), validated with the backend's limits and
 * previewed with the same renderer the room uses. A JSON view covers anything the form does not show.
 * Rules: lib/bots/rich.ts.
 */

import { useEffect, useId, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";

import { useTranslations } from "@/components/providers/i18n-provider";
import { RichBlocks } from "@/components/rooms/bot-message-parts";
import { cx } from "@/components/roles/ui";
import {
  BLOCK_TYPES, RICH_LIMITS, blankBlock, blockIssuesAt, blocksBytes, checklistToLines, fieldsToLines, linesToChecklist, linesToFields, linesToList, linesToRows, rowsToLines, validateBlocks,
  type BlockType, type RichBlock,
} from "@/lib/bots/rich";
import { moveItem } from "@/lib/bots/options";
import type { PayloadVar } from "@/lib/bots/room-nodes";
import { FieldRow, TemplateField, fieldCls, miniBtn, type MentionSource } from "./room-fields";

interface Props {
  id: string;
  value: unknown[] | undefined;
  onChange: (next: RichBlock[] | undefined) => void;
  variables: readonly PayloadVar[];
  mentions?: MentionSource;
}

const s = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");

export function BlocksEditor({ id, value, onChange, variables, mentions }: Props) {
  const t = useTranslations("integrations");
  const blocks = (Array.isArray(value) ? value : []) as RichBlock[];
  const issues = validateBlocks(blocks);
  const [view, setView] = useState<"form" | "json">("form");
  const [adding, setAdding] = useState<BlockType | "">("");
  const bytes = blocksBytes(blocks);

  const commit = (next: RichBlock[]) => onChange(next.length ? next : undefined);
  const patch = (i: number, p: Record<string, unknown>) => commit(blocks.map((b, k) => (k === i ? ({ ...b, ...p } as RichBlock) : b)));

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
        <span className={cx("text-[10px]", bytes > RICH_LIMITS.maxTotalBytes ? "font-semibold text-red-700 dark:text-red-300" : "text-muted-foreground")}>
          {t("canvas.room.blocks.size", { count: blocks.length, max: RICH_LIMITS.maxBlocks, kb: (bytes / 1024).toFixed(1), maxKb: RICH_LIMITS.maxTotalBytes / 1024 })}
        </span>
      </div>

      {issues.filter((i) => i.at.length === 0).map((i) => <p key={i.code} role="alert" className="text-[11px] font-medium text-red-700 dark:text-red-300">{t(`canvas.room.issues.blocks.${i.code}`, { max: RICH_LIMITS.maxBlocks, kb: RICH_LIMITS.maxTotalBytes / 1024 })}</p>)}

      {view === "json" ? (
        <JsonView id={id} blocks={blocks} onApply={commit} />
      ) : (
        <>
          {blocks.length === 0 && <p className="rounded-md border border-dashed border-border px-2.5 py-2 text-[11px] text-muted-foreground">{t("canvas.room.blocks.empty")}</p>}
          <ol className="space-y-2">
            {blocks.map((b, i) => (
              <li key={i} className="rounded-md border border-border bg-background/60 p-2">
                <div className="mb-1.5 flex items-center gap-1">
                  <span className="text-[11px] font-bold text-foreground">{t(`canvas.room.blocks.types.${b.type}`)}</span>
                  <span className="text-[10px] text-muted-foreground">#{i + 1}</span>
                  <span className="ml-auto inline-flex gap-0.5">
                    <button type="button" className={miniBtn} disabled={i === 0} aria-label={t("canvas.room.moveUp")} onClick={() => commit(moveItem(blocks, i, i - 1) as RichBlock[])}><ArrowUp className="h-3 w-3" aria-hidden /></button>
                    <button type="button" className={miniBtn} disabled={i === blocks.length - 1} aria-label={t("canvas.room.moveDown")} onClick={() => commit(moveItem(blocks, i, i + 1) as RichBlock[])}><ArrowDown className="h-3 w-3" aria-hidden /></button>
                    <button type="button" className={miniBtn} aria-label={t("canvas.room.remove")} onClick={() => commit(blocks.filter((_, k) => k !== i))}><Trash2 className="h-3 w-3" aria-hidden /></button>
                  </span>
                </div>
                <BlockFields id={`${id}-${i}`} block={b} onPatch={(p) => patch(i, p)} variables={variables} mentions={mentions} />
                {blockIssuesAt(issues, i).map((x, k) => (
                  <p key={k} role="alert" className="mt-1 text-[11px] font-medium text-red-700 dark:text-red-300">
                    {t(`canvas.room.issues.blocks.${x.code}`, { max: RICH_LIMITS.maxTextLength })}{x.at.length > 1 ? ` (${x.at[1] + 1})` : ""}
                  </p>
                ))}
              </li>
            ))}
          </ol>
          <div className="flex items-center gap-1.5">
            <label className="sr-only" htmlFor={`${id}-add`}>{t("canvas.room.blocks.add")}</label>
            <select id={`${id}-add`} value={adding} disabled={blocks.length >= RICH_LIMITS.maxBlocks} onChange={(e) => setAdding(e.target.value as BlockType | "")} className={cx(fieldCls, "flex-1")}>
              <option value="">{t("canvas.room.blocks.add")}</option>
              {BLOCK_TYPES.map((bt) => <option key={bt} value={bt}>{t(`canvas.room.blocks.types.${bt}`)}</option>)}
            </select>
            <button type="button" className={miniBtn} disabled={!adding || blocks.length >= RICH_LIMITS.maxBlocks} onClick={() => { if (adding) { commit([...blocks, blankBlock(adding)]); setAdding(""); } }}>
              <Plus className="h-3 w-3" aria-hidden /> {t("canvas.room.add")}
            </button>
          </div>
        </>
      )}

      {blocks.length > 0 && (
        <details className="rounded-md border border-border">
          <summary className="cursor-pointer px-2 py-1.5 text-[11px] font-semibold text-muted-foreground">{t("canvas.room.preview")}</summary>
          <div className="border-t border-border p-2">
            <p className="mb-1.5 text-[10px] text-muted-foreground">{t("canvas.room.blocks.previewNote")}</p>
            <RichBlocks blocks={blocks} />
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

function BlockFields({ id, block, onPatch, variables, mentions }: { id: string; block: RichBlock; onPatch: (p: Record<string, unknown>) => void; variables: readonly PayloadVar[]; mentions?: MentionSource }) {
  const t = useTranslations("integrations");
  const uid = useId();
  const lbl = (key: string) => t(`canvas.room.blocks.fields.${key}`);
  const line = (key: string, opts: { rows?: number; single?: boolean; mention?: boolean; required?: boolean } = {}) => (
    <FieldRow label={lbl(key)} required={opts.required} htmlFor={`${id}-${uid}-${key}`}>
      <TemplateField id={`${id}-${uid}-${key}`} value={s(block[key])} onChange={(v) => onPatch({ [key]: v })} variables={variables} single={opts.single ?? true} rows={opts.rows ?? 3} mentions={opts.mention ? mentions : undefined} />
    </FieldRow>
  );
  const lines = (key: string, toText: (v: unknown) => string, fromText: (t: string) => unknown, hintKey: string) => (
    <FieldRow label={lbl(key)} hint={t(`canvas.room.blocks.hints.${hintKey}`)} htmlFor={`${id}-${uid}-${key}`}>
      <LinesField id={`${id}-${uid}-${key}`} value={toText(block[key])} onCommit={(text) => onPatch({ [key]: fromText(text) })} variables={variables} />
    </FieldRow>
  );

  switch (block.type) {
    case "text":
    case "quote":
      return line("text", { single: false, rows: 3, mention: false, required: true });
    case "heading":
      return (
        <div className="space-y-1.5">
          <FieldRow label={lbl("level")} htmlFor={`${id}-${uid}-level`}>
            <select id={`${id}-${uid}-level`} value={String(block.level ?? 2)} onChange={(e) => onPatch({ level: Number(e.target.value) })} className={fieldCls}>
              {[1, 2, 3].map((n) => <option key={n} value={n}>{t("canvas.room.blocks.headingLevel", { n })}</option>)}
            </select>
          </FieldRow>
          {line("text", { required: true })}
        </div>
      );
    case "list":
      return (
        <div className="space-y-1.5">
          <label className="flex items-center gap-2 text-[11px] text-foreground">
            <input type="checkbox" checked={block.ordered === true} onChange={(e) => onPatch({ ordered: e.target.checked })} className="h-3.5 w-3.5 rounded border-border" />
            {lbl("ordered")}
          </label>
          {lines("items", (v) => (Array.isArray(v) ? v.map(s).join("\n") : ""), linesToList, "lines")}
        </div>
      );
    case "checklist":
      return lines("items", checklistToLines, linesToChecklist, "checklist");
    case "table":
      return (
        <div className="space-y-1.5">
          <FieldRow label={lbl("columns")} hint={t("canvas.room.blocks.hints.columns")} htmlFor={`${id}-${uid}-columns`}>
            <LinesField id={`${id}-${uid}-columns`} value={(Array.isArray(block.columns) ? block.columns : []).map(s).join(" | ")} onCommit={(text) => onPatch({ columns: text.split("|").map((c) => c.trim()).filter((c, _i, a) => c || a.length === 1) })} variables={variables} single />
          </FieldRow>
          {lines("rows", rowsToLines, linesToRows, "rows")}
        </div>
      );
    case "image":
      return (
        <div className="space-y-1.5">
          {line("url", { required: true })}
          {line("alt")}
          {line("caption")}
          <p className="text-[10px] text-muted-foreground">{t("canvas.room.blocks.hints.embedsPerm")}</p>
        </div>
      );
    case "link":
      return (
        <div className="space-y-1.5">
          {line("url", { required: true })}
          {line("title")}
          {line("description")}
          <p className="text-[10px] text-muted-foreground">{t("canvas.room.blocks.hints.embedsPerm")}</p>
        </div>
      );
    case "code":
      return (
        <div className="space-y-1.5">
          {line("language")}
          {line("code", { single: false, rows: 4, required: true })}
        </div>
      );
    case "divider":
      return <p className="text-[11px] text-muted-foreground">{t("canvas.room.blocks.hints.divider")}</p>;
    case "embed": {
      const color = s(block.color);
      return (
        <div className="space-y-1.5">
          {line("title")}
          {line("description", { single: false, rows: 3 })}
          {line("url")}
          <FieldRow label={lbl("color")} htmlFor={`${id}-${uid}-color`}>
            <div className="flex items-center gap-1.5">
              <input type="color" aria-label={lbl("color")} value={/^#[0-9a-f]{6}$/i.test(color) ? color : "#3b82f6"} onChange={(e) => onPatch({ color: e.target.value })} className="h-8 w-9 cursor-pointer rounded border border-border bg-background p-0.5" />
              <input id={`${id}-${uid}-color`} type="text" value={color} onChange={(e) => onPatch({ color: e.target.value })} placeholder="#3b82f6" spellCheck={false} className={cx(fieldCls, "font-mono")} />
            </div>
          </FieldRow>
          {lines("fields", fieldsToLines, linesToFields, "fields")}
          {line("footer")}
          {line("imageUrl")}
          {line("thumbnailUrl")}
          {line("timestamp")}
          <p className="text-[10px] text-muted-foreground">{t("canvas.room.blocks.hints.embedsPerm")}</p>
        </div>
      );
    }
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
