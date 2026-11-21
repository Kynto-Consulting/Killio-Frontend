"use client";

/**
 * What a bot adds to a message: rich blocks (`metadata.rich`) and interactive components (`metadata.components`).
 * The same pieces draw the preview inside the script editor, so what the author sees is what the room shows.
 * Contract and limits: lib/bots/rich.ts and lib/bots/components.ts (Killio-Backend/src/modules/bots/bot-rich.ts).
 * Everything that reaches the DOM is text or an https URL: no HTML is ever interpreted.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, Loader2, SquareCheck, Square } from "lucide-react";

import { useTranslations } from "@/components/providers/i18n-provider";
import { cx } from "@/components/roles/ui";
import {
  interactErrorKey, isExpired, readComponentRows, validSelection, type ButtonComponent, type Component, type ComponentRow, type PressState, type SelectComponent,
} from "@/lib/bots/components";
import { safeHttpsUrl, type RichBlock } from "@/lib/bots/rich";

const HEX = /^#[0-9a-fA-F]{6}$/;
const str = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");

/* ───────────── rich blocks ───────────── */

function ExternalLinkText({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  const t = useTranslations("rooms");
  return (
    <a href={href} target="_blank" rel="noopener noreferrer nofollow" className={cx("inline-flex items-center gap-1 underline underline-offset-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--accent-ink))]", className)}>
      {children}
      <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
      <span className="sr-only">{t("bot.blocks.opensNewTab")}</span>
    </a>
  );
}

function Block({ block }: { block: RichBlock }) {
  const t = useTranslations("rooms");
  switch (block.type) {
    case "text":
      return <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{str(block.text)}</p>;
    case "heading": {
      const size = block.level === 1 ? "text-base" : block.level === 3 ? "text-[13px]" : "text-sm";
      return <p role="heading" aria-level={Math.min(6, Number(block.level ?? 2) + 2)} className={cx("break-words font-extrabold text-foreground", size)}>{str(block.text)}</p>;
    }
    case "list": {
      const items = (Array.isArray(block.items) ? block.items : []).map(str);
      const Tag = block.ordered ? "ol" : "ul";
      return (
        <Tag className={cx("space-y-0.5 pl-5 text-sm", block.ordered ? "list-decimal" : "list-disc")}>
          {items.map((it, i) => <li key={i} className="break-words">{it}</li>)}
        </Tag>
      );
    }
    case "checklist": {
      const items = Array.isArray(block.items) ? block.items : [];
      return (
        <ul className="space-y-0.5 text-sm">
          {items.map((it: any, i: number) => (
            <li key={i} className="flex items-start gap-1.5">
              {it?.checked ? <SquareCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden /> : <Square className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />}
              <span className="sr-only">{it?.checked ? t("bot.blocks.done") : t("bot.blocks.todo")}</span>
              <span className={cx("break-words", it?.checked && "text-muted-foreground line-through")}>{str(it?.text)}</span>
            </li>
          ))}
        </ul>
      );
    }
    case "table": {
      const cols = (Array.isArray(block.columns) ? block.columns : []).map(str);
      const rows: unknown[][] = Array.isArray(block.rows) ? block.rows : [];
      return (
        <div className="max-w-full overflow-x-auto rounded-lg border border-border">
          <table className="w-full border-collapse text-left text-xs">
            <thead className="bg-muted/60">
              <tr>{cols.map((c, i) => <th key={i} scope="col" className="border-b border-border px-2 py-1 font-bold">{c}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri} className="odd:bg-muted/20">
                  {cols.map((_, ci) => <td key={ci} className="border-t border-border/60 px-2 py-1 align-top">{str(Array.isArray(r) ? r[ci] : "")}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    case "image": {
      const url = safeHttpsUrl(block.url);
      if (!url) return null;
      return (
        <figure className="max-w-sm">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={str(block.alt)} loading="lazy" referrerPolicy="no-referrer" className="max-h-64 w-auto max-w-full rounded-lg border border-border object-contain" />
          {str(block.caption) && <figcaption className="mt-1 text-[11px] text-muted-foreground">{str(block.caption)}</figcaption>}
        </figure>
      );
    }
    case "link": {
      const url = safeHttpsUrl(block.url);
      if (!url) return null;
      return (
        <div className="max-w-md rounded-lg border border-border bg-muted/30 px-3 py-2">
          <ExternalLinkText href={url} className="text-sm font-bold text-[hsl(var(--accent-ink))]">{str(block.title) || url}</ExternalLinkText>
          {str(block.description) && <p className="mt-0.5 break-words text-xs text-muted-foreground">{str(block.description)}</p>}
        </div>
      );
    }
    case "code":
      return (
        <figure className="max-w-full">
          {str(block.language) && <figcaption className="rounded-t-lg border border-b-0 border-border bg-muted px-2 py-0.5 font-mono text-[10px] uppercase text-muted-foreground">{str(block.language)}</figcaption>}
          <pre className={cx("max-w-full overflow-x-auto border border-border bg-muted/50 p-2 font-mono text-xs", str(block.language) ? "rounded-b-lg" : "rounded-lg")}><code>{str(block.code)}</code></pre>
        </figure>
      );
    case "quote":
      return <blockquote className="whitespace-pre-wrap break-words border-l-4 border-[var(--memphis-line)] pl-3 text-sm italic text-muted-foreground">{str(block.text)}</blockquote>;
    case "divider":
      return <hr className="border-border" />;
    case "embed": {
      const color = HEX.test(str(block.color)) ? str(block.color) : null;
      const url = safeHttpsUrl(block.url);
      const thumb = safeHttpsUrl(block.thumbnailUrl);
      const image = safeHttpsUrl(block.imageUrl);
      const fields: Array<{ name: string; value: string; inline: boolean }> = (Array.isArray(block.fields) ? block.fields : []).map((f: any) => ({ name: str(f?.name), value: str(f?.value), inline: f?.inline === true }));
      const stamp = str(block.timestamp) ? new Date(str(block.timestamp)) : null;
      return (
        <section aria-label={str(block.title) || t("bot.blocks.card")} className="max-w-md overflow-hidden rounded-lg border border-border border-l-4 bg-muted/30 p-3" style={{ borderLeftColor: color ?? "var(--memphis-line)" }}>
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1 space-y-1">
              {str(block.title) && (url ? <ExternalLinkText href={url} className="text-sm font-extrabold text-[hsl(var(--accent-ink))]">{str(block.title)}</ExternalLinkText> : <p className="break-words text-sm font-extrabold">{str(block.title)}</p>)}
              {str(block.description) && <p className="whitespace-pre-wrap break-words text-xs">{str(block.description)}</p>}
              {fields.length > 0 && (
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 pt-1">
                  {fields.map((f, i) => (
                    <div key={i} className={f.inline ? "col-span-1" : "col-span-2"}>
                      <dt className="text-[11px] font-bold">{f.name}</dt>
                      <dd className="whitespace-pre-wrap break-words text-xs text-muted-foreground">{f.value}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
            {thumb && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={thumb} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-14 w-14 shrink-0 rounded-md border border-border object-cover" />
            )}
          </div>
          {image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image} alt="" loading="lazy" referrerPolicy="no-referrer" className="mt-2 max-h-56 w-auto max-w-full rounded-md border border-border object-contain" />
          )}
          {(str(block.footer) || (stamp && !Number.isNaN(stamp.getTime()))) && (
            <p className="mt-2 text-[10px] text-muted-foreground">
              {str(block.footer)}
              {str(block.footer) && stamp && !Number.isNaN(stamp.getTime()) ? " · " : ""}
              {stamp && !Number.isNaN(stamp.getTime()) ? <time dateTime={stamp.toISOString()}>{stamp.toLocaleString()}</time> : null}
            </p>
          )}
        </section>
      );
    }
    default:
      return null;
  }
}

export function RichBlocks({ blocks, className }: { blocks: readonly RichBlock[]; className?: string }) {
  if (blocks.length === 0) return null;
  return (
    <div className={cx("flex min-w-0 flex-col gap-1.5", className)}>
      {blocks.map((b, i) => <Block key={i} block={b} />)}
    </div>
  );
}

/* ───────────── interactive components ───────────── */

const BUTTON_TONE: Record<ButtonComponent["style"], string> = {
  primary: "border-transparent bg-[hsl(var(--accent-ink))] text-[hsl(var(--accent-ink-fg))] hover:opacity-90",
  secondary: "border-border bg-muted text-foreground hover:bg-muted/70",
  success: "border-transparent bg-emerald-700 text-white hover:bg-emerald-800",
  danger: "border-transparent bg-rose-700 text-white hover:bg-rose-800",
  link: "border-border bg-card text-foreground hover:bg-muted",
};
const BUTTON_BASE = "inline-flex min-h-8 max-w-full items-center gap-1.5 rounded-md border px-3 py-1 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--accent-ink))] disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-60 motion-reduce:transition-none";

export type InteractFn = (customId: string, values?: string[]) => Promise<unknown>;

interface InteractiveProps {
  /** Rows as stored in `metadata.components.rows` (or built by the editor). */
  rows: unknown;
  expiresAt?: string | null;
  /** Sends a press. Missing: the controls are drawn but inert (preview, ephemeral messages). */
  interact?: InteractFn;
  /** Draws the controls as live (editor preview) without sending anything. */
  preview?: boolean;
  /** Unique per message: ids of the labels. */
  idPrefix: string;
}

/** Buttons and selects of one message, with loading / error / expired states. One press at a time per message (the server keeps a cooldown). */
export function InteractiveComponents({ rows, expiresAt, interact, preview = false, idPrefix }: InteractiveProps) {
  const t = useTranslations("rooms");
  const parsed = useMemo<ComponentRow[]>(() => readComponentRows(rows), [rows]);
  const [press, setPress] = useState<PressState>({ status: "idle" });
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [expiredNow, setExpiredNow] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  if (parsed.length === 0) return null;
  const expired = expiredNow || isExpired(expiresAt);
  const inert = !interact && !preview;
  const busy = press.status === "loading";
  const locked = expired || inert;

  const send = async (customId: string, values?: string[]) => {
    if (!interact || busy || locked) return;
    setPress({ status: "loading" });
    setPendingId(customId);
    try {
      await interact(customId, values);
      setPress({ status: "sent" });
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setPress((p) => (p.status === "sent" ? { status: "idle" } : p)), 1800);
    } catch (e) {
      const status = (e as { status?: number })?.status;
      const key = interactErrorKey(status);
      if (key === "expired") setExpiredNow(true);
      setPress({ status: "error", key });
    } finally {
      setPendingId(null);
    }
  };

  return (
    <div className="mt-1 flex min-w-0 flex-col gap-1.5" data-testid="bot-components">
      {parsed.map((row, r) => (
        <div key={r} className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t("bot.components.group", { n: r + 1 })}>
          {row.components.map((c, i) => (
            <ComponentView key={`${r}-${i}`} c={c} id={`${idPrefix}-${r}-${i}`} locked={locked} busy={busy} loading={pendingId === (c as { customId?: string }).customId && busy} preview={preview} onSend={send} />
          ))}
        </div>
      ))}
      <div className="min-h-[1rem] text-[11px]" aria-live="polite">
        {busy && <span className="inline-flex items-center gap-1 text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin motion-reduce:animate-none" aria-hidden />{t("bot.interact.sending")}</span>}
        {press.status === "sent" && <span className="text-emerald-700 dark:text-emerald-300">{t("bot.interact.sent")}</span>}
        {expired && !busy && <span className="text-muted-foreground">{t("bot.interact.expired")}</span>}
        {inert && !expired && <span className="text-muted-foreground">{t("bot.interact.inert")}</span>}
      </div>
      {press.status === "error" && <p role="alert" className="text-[11px] font-medium text-red-700 dark:text-red-300">{t(`bot.interact.errors.${press.key}`)}</p>}
    </div>
  );
}

function ComponentView({ c, id, locked, busy, loading, preview, onSend }: { c: Component; id: string; locked: boolean; busy: boolean; loading: boolean; preview: boolean; onSend: (customId: string, values?: string[]) => void }) {
  if (c.type === "button") return <ButtonView b={c} locked={locked} busy={busy} loading={loading} preview={preview} onSend={onSend} />;
  return <SelectView s={c} id={id} locked={locked} busy={busy} loading={loading} preview={preview} onSend={onSend} />;
}

function ButtonView({ b, locked, busy, loading, preview, onSend }: { b: ButtonComponent; locked: boolean; busy: boolean; loading: boolean; preview: boolean; onSend: (customId: string, values?: string[]) => void }) {
  const t = useTranslations("rooms");
  const label = (
    <>
      {b.emoji && <span aria-hidden>{b.emoji}</span>}
      <span className="min-w-0 truncate">{b.label}</span>
      {loading && <Loader2 className="h-3 w-3 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden />}
    </>
  );
  if (b.style === "link") {
    const url = safeHttpsUrl(b.url);
    if (!url || b.disabled) return <span aria-disabled="true" className={cx(BUTTON_BASE, BUTTON_TONE.link)}>{label}</span>;
    if (preview) return <span role="link" aria-disabled="true" className={cx(BUTTON_BASE, BUTTON_TONE.link)}>{label}<ExternalLink className="h-3 w-3 shrink-0" aria-hidden /></span>;
    return (
      <a href={url} target="_blank" rel="noopener noreferrer nofollow" className={cx(BUTTON_BASE, BUTTON_TONE.link)}>
        {label}
        <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
        <span className="sr-only">{t("bot.blocks.opensNewTab")}</span>
      </a>
    );
  }
  const disabled = Boolean(b.disabled) || (!preview && (locked || busy));
  return (
    <button
      type="button"
      disabled={preview ? false : disabled}
      aria-disabled={preview ? true : disabled || undefined}
      tabIndex={preview ? -1 : undefined}
      aria-busy={loading || undefined}
      onClick={preview ? undefined : () => b.customId && onSend(b.customId)}
      className={cx(BUTTON_BASE, BUTTON_TONE[b.style])}
    >
      {label}
    </button>
  );
}

function SelectView({ s, id, locked, busy, loading, preview, onSend }: { s: SelectComponent; id: string; locked: boolean; busy: boolean; loading: boolean; preview: boolean; onSend: (customId: string, values?: string[]) => void }) {
  const t = useTranslations("rooms");
  const multiple = s.maxValues > 1;
  const initial = useMemo(() => s.options.filter((o) => o.default).map((o) => o.value).slice(0, s.maxValues), [s]);
  const [chosen, setChosen] = useState<string[]>(initial);
  const disabled = Boolean(s.disabled) || (!preview && (locked || busy));
  const placeholder = s.placeholder || t("bot.components.selectPlaceholder");
  const fieldCls = "h-8 max-w-full rounded-md border border-border bg-background px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--accent-ink))] disabled:cursor-not-allowed disabled:opacity-50";

  if (!multiple) {
    return (
      <span className="inline-flex max-w-full items-center gap-1.5">
        <label htmlFor={id} className="sr-only">{placeholder}</label>
        <select
          id={id}
          value={chosen[0] ?? ""}
          disabled={preview ? false : disabled}
          aria-disabled={preview ? true : undefined}
          tabIndex={preview ? -1 : undefined}
          aria-busy={loading || undefined}
          onChange={(e) => {
            const v = e.target.value;
            if (!v) return;
            setChosen([v]);
            if (preview) return;
            const ok = validSelection(s, [v]);
            if (ok) onSend(s.customId, ok);
          }}
          className={fieldCls}
        >
          <option value="">{placeholder}</option>
          {s.options.map((o) => <option key={o.value} value={o.value} title={o.description}>{o.label}</option>)}
        </select>
        {loading && <Loader2 className="h-3 w-3 animate-spin motion-reduce:animate-none" aria-hidden />}
      </span>
    );
  }

  const valid = validSelection(s, chosen);
  const toggle = (v: string) => setChosen((cur) => (cur.includes(v) ? cur.filter((x) => x !== v) : cur.length < s.maxValues ? [...cur, v] : cur));
  return (
    <fieldset className="min-w-[12rem] max-w-full rounded-md border border-border p-2" disabled={preview ? false : disabled}>
      <legend className="px-1 text-[11px] font-semibold text-muted-foreground">{placeholder}</legend>
      <ul className="space-y-1">
        {s.options.map((o) => (
          <li key={o.value}>
            <label className="flex items-start gap-1.5 text-xs">
              <input type="checkbox" className="mt-0.5" checked={chosen.includes(o.value)} onChange={() => toggle(o.value)} tabIndex={preview ? -1 : undefined} />
              <span><span className="font-semibold">{o.label}</span>{o.description && <span className="block text-[11px] text-muted-foreground">{o.description}</span>}</span>
            </label>
          </li>
        ))}
      </ul>
      <p className="mt-1 text-[10px] text-muted-foreground">{t("bot.components.pickRange", { min: s.minValues, max: s.maxValues })}</p>
      <button type="button" className={cx(BUTTON_BASE, BUTTON_TONE.primary, "mt-1.5")} disabled={preview ? false : !valid || disabled} tabIndex={preview ? -1 : undefined} onClick={preview ? undefined : () => valid && onSend(s.customId, valid)}>
        {loading && <Loader2 className="h-3 w-3 animate-spin motion-reduce:animate-none" aria-hidden />}
        {t("bot.components.confirm")}
      </button>
    </fieldset>
  );
}
