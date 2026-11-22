"use client";

/**
 * What a bot adds to a message: rich blocks (`metadata.rich`) and interactive components (`metadata.components`).
 * The same pieces draw the preview inside the script editor, so what the author sees is what the room shows.
 * Contract and limits: lib/bots/rich.ts and lib/bots/components.ts (Killio-Backend/src/modules/bots/bot-rich.ts, docs/BOT-RICH-MESSAGES-V2.md).
 * Everything that reaches the DOM is text or an https URL: no HTML is ever interpreted. A block this client does not know is skipped.
 */

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, ExternalLink, ImageOff, Info, Loader2, Minus, OctagonAlert, Square, SquareCheck, TrendingDown, TrendingUp } from "lucide-react";

import { useTranslations } from "@/components/providers/i18n-provider";
import { cx } from "@/components/roles/ui";
import {
  interactErrorKey, isExpired, isSelectLike, readComponent, readComponentRows, toggleValues, validSelection,
  type ButtonComponent, type Component, type ComponentRow, type PressState, type SelectComponent, type ToggleComponent,
} from "@/lib/bots/components";
import { formatTimestamp, pollResults, progressFraction, safeHttpsUrl, type RichBlock } from "@/lib/bots/rich";
import { EmojiText } from "@/components/emoji";
import { PickerView, type FetchPickerOptions } from "./bot-pickers";

const HEX = /^#[0-9a-fA-F]{6}$/;
const str = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");
const list = (v: unknown): any[] => (Array.isArray(v) ? v : []);

/* ───────────── shared interaction context ───────────── */

export type InteractFn = (customId: string, values?: string[]) => Promise<unknown>;

interface BotCtx {
  interact?: InteractFn;
  /** Draws controls as live without sending anything (editor preview). */
  preview: boolean;
  expired: boolean;
  fetchOptions?: FetchPickerOptions;
  idPrefix: string;
}
const BotContext = createContext<BotCtx>({ preview: false, expired: false, idPrefix: "b" });

/* ───────────── small pieces ───────────── */

function ExternalLinkText({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  const t = useTranslations("rooms");
  return (
    <a href={href} target="_blank" rel="noopener noreferrer nofollow" className={cx("inline-flex items-center gap-1 underline underline-offset-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40", className)}>
      {children}
      <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
      <span className="sr-only">{t("bot.blocks.opensNewTab")}</span>
    </a>
  );
}

/** An https image with a skeleton while it loads and a quiet placeholder when it fails (the alt text stays readable). */
function SafeImg({ src, alt, className, boxClassName }: { src: string; alt: string; className?: string; boxClassName?: string }) {
  const t = useTranslations("rooms");
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  if (state === "error") {
    return (
      <span role="img" aria-label={alt || t("bot.blocks.imageFailed")} className={cx("inline-flex items-center justify-center gap-1 rounded-md border border-border/50 bg-muted/40 p-2 text-[11px] text-muted-foreground", boxClassName)}>
        <ImageOff className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span className="truncate">{alt || t("bot.blocks.imageFailed")}</span>
      </span>
    );
  }
  return (
    <span className={cx("relative inline-block max-w-full", state === "loading" && "animate-pulse rounded-md bg-muted/50 motion-reduce:animate-none", boxClassName)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} loading="lazy" referrerPolicy="no-referrer" onLoad={() => setState("ok")} onError={() => setState("error")} className={cx(className, state === "loading" && "opacity-0")} />
    </span>
  );
}

/** A date for the reader: relative ("in 3 hours") or absolute, always in THEIR time zone and language; relative ones tick along. */
function TimeText({ value, style, className }: { value: unknown; style?: unknown; className?: string }) {
  const [now, setNow] = useState<number | null>(null);
  const relative = style === "relative";
  useEffect(() => {
    setNow(Date.now());
    if (!relative) return;
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, [relative]);
  const d = new Date(str(value));
  if (Number.isNaN(d.getTime())) return null;
  const abs = formatTimestamp(value, "datetime", Date.now());
  return (
    <time dateTime={d.toISOString()} title={abs} suppressHydrationWarning className={className}>
      {now === null ? d.toISOString().slice(0, 16).replace("T", " ") : formatTimestamp(value, style, now)}
    </time>
  );
}

const CALLOUT = {
  info: { icon: Info, box: "border-sky-500/30 bg-sky-500/10", text: "text-sky-800 dark:text-sky-200" },
  success: { icon: CheckCircle2, box: "border-emerald-500/30 bg-emerald-500/10", text: "text-emerald-800 dark:text-emerald-200" },
  warning: { icon: AlertTriangle, box: "border-amber-500/35 bg-amber-500/10", text: "text-amber-900 dark:text-amber-200" },
  error: { icon: OctagonAlert, box: "border-red-500/30 bg-red-500/10", text: "text-red-800 dark:text-red-200" },
} as const;

const BADGE = {
  gray: "bg-muted text-foreground/80",
  blue: "bg-sky-500/15 text-sky-800 dark:text-sky-200",
  green: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200",
  yellow: "bg-amber-500/20 text-amber-900 dark:text-amber-200",
  red: "bg-red-500/15 text-red-800 dark:text-red-200",
  purple: "bg-violet-500/15 text-violet-800 dark:text-violet-200",
  pink: "bg-pink-500/15 text-pink-800 dark:text-pink-200",
} as const;

const TONE_BAR = { accent: "bg-primary", success: "bg-emerald-500", warning: "bg-amber-500", danger: "bg-red-500" } as const;
const SPACER = { sm: "h-1", md: "h-3", lg: "h-6" } as const;
const DIVIDER = { sm: "my-0.5", md: "my-1.5", lg: "my-3" } as const;
const THUMB = { sm: "h-12 w-12", md: "h-16 w-16", lg: "h-24 w-24" } as const;
const sizeOf = (v: unknown): "sm" | "md" | "lg" => (v === "sm" || v === "lg" ? v : "md");

/* ───────────── rich blocks ───────────── */

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
      const items = list(block.items).map(str);
      const Tag = block.ordered ? "ol" : "ul";
      return (
        <Tag className={cx("space-y-0.5 pl-5 text-sm", block.ordered ? "list-decimal" : "list-disc")}>
          {items.map((it, i) => <li key={i} className="break-words">{it}</li>)}
        </Tag>
      );
    }
    case "checklist":
      return (
        <ul className="space-y-0.5 text-sm">
          {list(block.items).map((it: any, i: number) => (
            <li key={i} className="flex items-start gap-1.5">
              {it?.checked ? <SquareCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden /> : <Square className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />}
              <span className="sr-only">{it?.checked ? t("bot.blocks.done") : t("bot.blocks.todo")}</span>
              <span className={cx("break-words", it?.checked && "text-muted-foreground line-through")}>{str(it?.text)}</span>
            </li>
          ))}
        </ul>
      );
    case "table": {
      const cols = list(block.columns).map(str);
      const rows: unknown[][] = list(block.rows);
      return (
        <div className="max-w-full overflow-x-auto rounded-lg border border-border/50">
          <table className="w-full border-collapse text-left text-xs">
            <thead className="bg-muted/50">
              <tr>{cols.map((c, i) => <th key={i} scope="col" className="border-b border-border/50 px-2 py-1 font-bold">{c}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri} className="odd:bg-muted/20">
                  {cols.map((_, ci) => <td key={ci} className="border-t border-border/40 px-2 py-1 align-top">{str(Array.isArray(r) ? r[ci] : "")}</td>)}
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
          <SafeImg src={url} alt={str(block.alt)} className="max-h-64 w-auto max-w-full rounded-lg border border-border/50 object-contain" boxClassName="min-h-[3rem] min-w-[3rem]" />
          {str(block.caption) && <figcaption className="mt-1 text-[11px] text-muted-foreground">{str(block.caption)}</figcaption>}
        </figure>
      );
    }
    case "link": {
      const url = safeHttpsUrl(block.url);
      if (!url) return null;
      return (
        <div className="max-w-md rounded-lg border border-border/50 bg-muted/30 px-3 py-2">
          <ExternalLinkText href={url} className="text-sm font-bold text-primary">{str(block.title) || url}</ExternalLinkText>
          {str(block.description) && <p className="mt-0.5 break-words text-xs text-muted-foreground">{str(block.description)}</p>}
        </div>
      );
    }
    case "code":
      return (
        <figure className="max-w-full">
          {str(block.language) && <figcaption className="rounded-t-lg border border-b-0 border-border/50 bg-muted px-2 py-0.5 font-mono text-[10px] uppercase text-muted-foreground">{str(block.language)}</figcaption>}
          <pre className={cx("max-w-full overflow-x-auto border border-border/50 bg-muted/50 p-2 font-mono text-xs", str(block.language) ? "rounded-b-lg" : "rounded-lg")}><code>{str(block.code)}</code></pre>
        </figure>
      );
    case "quote":
      return <blockquote className="whitespace-pre-wrap break-words border-l-4 border-border/60 pl-3 text-sm italic text-muted-foreground">{str(block.text)}</blockquote>;
    case "divider":
      return <hr className={cx("border-border/50", block.size ? DIVIDER[sizeOf(block.size)] : "")} />;
    case "embed":
      return <EmbedBlock block={block} />;
    case "section":
      return <SectionBlock block={block} />;
    case "thumbnail": {
      const url = safeHttpsUrl(block.url);
      if (!url) return null;
      return <SafeImg src={url} alt={str(block.alt)} className={cx("rounded-lg border border-border/50 object-cover", THUMB[sizeOf(block.size)])} boxClassName={THUMB[sizeOf(block.size)]} />;
    }
    case "media_gallery":
      return <GalleryBlock items={list(block.items)} />;
    case "container": {
      const accent = HEX.test(str(block.accentColor)) ? str(block.accentColor) : null;
      return (
        <section className="min-w-0 max-w-xl space-y-1.5 rounded-lg border border-l-4 border-border/50 bg-muted/20 p-3" style={accent ? { borderLeftColor: accent } : undefined}>
          {list(block.blocks).map((b, i) => <Block key={i} block={b} />)}
        </section>
      );
    }
    case "columns": {
      const cols = list(block.columns).slice(0, 3);
      return (
        <div className={cx("grid min-w-0 grid-cols-1 gap-3", cols.length === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
          {cols.map((c, i) => (
            <div key={i} className="min-w-0 space-y-1.5">
              {list(c?.blocks).map((b, k) => <Block key={k} block={b} />)}
            </div>
          ))}
        </div>
      );
    }
    case "fields": {
      const n = [1, 2, 3].includes(Number(block.columns)) ? Number(block.columns) : 1;
      const grid = n === 3 ? "sm:grid-cols-3" : n === 2 ? "sm:grid-cols-2" : "sm:grid-cols-1";
      return (
        <dl className={cx("grid grid-cols-1 gap-x-4 gap-y-2", grid)}>
          {list(block.fields).map((f: any, i: number) => (
            <div key={i} className={cx("min-w-0", f?.inline === true ? "" : "sm:col-span-full")}>
              <dt className="text-[11px] font-bold">{str(f?.name)}</dt>
              <dd className="whitespace-pre-wrap break-words text-xs text-muted-foreground">{str(f?.value)}</dd>
            </div>
          ))}
        </dl>
      );
    }
    case "author": {
      const icon = safeHttpsUrl(block.iconUrl);
      const url = safeHttpsUrl(block.url);
      const body = (
        <>
          {icon && <SafeImg src={icon} alt="" className="h-5 w-5 rounded-full border border-border/50 object-cover" boxClassName="h-5 w-5 rounded-full" />}
          <span className="min-w-0 truncate text-xs font-bold">{str(block.name)}</span>
        </>
      );
      return url ? <ExternalLinkText href={url} className="gap-1.5 no-underline">{body}</ExternalLinkText> : <p className="flex items-center gap-1.5">{body}</p>;
    }
    case "footer": {
      const icon = safeHttpsUrl(block.iconUrl);
      return (
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          {icon && <SafeImg src={icon} alt="" className="h-4 w-4 rounded-full border border-border/50 object-cover" boxClassName="h-4 w-4 rounded-full" />}
          <span className="min-w-0 break-words">{str(block.text)}</span>
        </p>
      );
    }
    case "timestamp":
      return (
        <p className="text-[11px] text-muted-foreground">
          {str(block.label) && <span>{str(block.label)} </span>}
          <TimeText value={block.value} style={block.style} />
        </p>
      );
    case "progress": {
      const max = block.max === undefined || block.max === "" ? 100 : Number(block.max);
      const value = Math.min(Math.max(Number(block.value) || 0, 0), Number.isFinite(max) && max > 0 ? max : 100);
      const frac = progressFraction(block.value, block.max);
      const tone = TONE_BAR[(block.tone as keyof typeof TONE_BAR) in TONE_BAR ? (block.tone as keyof typeof TONE_BAR) : "accent"];
      const label = str(block.label);
      const pct = Math.round(frac * 100);
      return (
        <div className="max-w-md space-y-1">
          {(label || block.showPercent === true) && (
            <div className="flex items-baseline justify-between gap-2 text-[11px]">
              <span className="min-w-0 truncate font-semibold">{label}</span>
              {block.showPercent === true && <span className="shrink-0 tabular-nums text-muted-foreground">{pct}%</span>}
            </div>
          )}
          <div role="progressbar" aria-label={label || t("bot.blocks.progress")} aria-valuemin={0} aria-valuemax={Number.isFinite(max) && max > 0 ? max : 100} aria-valuenow={value} aria-valuetext={`${pct}%`} className="h-2 overflow-hidden rounded-full bg-muted">
            <div className={cx("h-full rounded-full transition-[width] motion-reduce:transition-none", tone)} style={{ width: `${pct}%` }} />
          </div>
        </div>
      );
    }
    case "stats":
      return (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
          {list(block.items).map((it: any, i: number) => {
            const trend = it?.trend === "up" || it?.trend === "down" || it?.trend === "flat" ? it.trend : null;
            const TrendIcon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;
            return (
              <li key={i} className="min-w-0 rounded-lg border border-border/50 bg-muted/30 px-2.5 py-2">
                <p className="truncate text-[11px] text-muted-foreground">{str(it?.label)}</p>
                <p className="truncate text-lg font-extrabold leading-tight tabular-nums">{str(it?.value)}</p>
                {str(it?.delta) && (
                  <p className={cx("flex items-center gap-0.5 text-[11px] font-semibold", trend === "up" && "text-emerald-700 dark:text-emerald-300", trend === "down" && "text-red-700 dark:text-red-300", trend !== "up" && trend !== "down" && "text-muted-foreground")}>
                    {trend && <TrendIcon className="h-3 w-3" aria-hidden />}
                    {trend && <span className="sr-only">{t(`bot.blocks.trend.${trend}`)}</span>}
                    {str(it.delta)}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      );
    case "key_value":
      return (
        <dl className="max-w-md divide-y divide-border/40 rounded-lg border border-border/50 text-xs">
          {list(block.items).map((it: any, i: number) => (
            <div key={i} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-2 px-2.5 py-1.5">
              <dt className="break-words font-semibold text-muted-foreground">{str(it?.key)}</dt>
              <dd className="break-words">{str(it?.value)}</dd>
            </div>
          ))}
        </dl>
      );
    case "badges":
      return (
        <ul className="flex flex-wrap gap-1.5">
          {list(block.items).map((it: any, i: number) => (
            <li key={i} className={cx("rounded-full px-2 py-0.5 text-[11px] font-bold", BADGE[(it?.color as keyof typeof BADGE) in BADGE ? (it.color as keyof typeof BADGE) : "gray"])}>{str(it?.text)}</li>
          ))}
        </ul>
      );
    case "callout": {
      const v = (block.variant as keyof typeof CALLOUT) in CALLOUT ? (block.variant as keyof typeof CALLOUT) : "info";
      const c = CALLOUT[v];
      const Icon = c.icon;
      return (
        <div role={v === "error" || v === "warning" ? "note" : undefined} className={cx("flex max-w-xl gap-2 rounded-lg border px-3 py-2", c.box)}>
          <span className="mt-0.5 shrink-0" aria-hidden>{str(block.icon) ? <EmojiText text={str(block.icon)} /> : <Icon className={cx("h-4 w-4", c.text)} />}</span>
          <div className="min-w-0">
            <span className="sr-only">{t(`bot.blocks.callout.${v}`)}: </span>
            {str(block.title) && <p className={cx("break-words text-sm font-extrabold", c.text)}>{str(block.title)}</p>}
            <p className="whitespace-pre-wrap break-words text-xs">{str(block.text)}</p>
          </div>
        </div>
      );
    }
    case "spacer":
      return <div aria-hidden className={SPACER[sizeOf(block.size)]} />;
    case "poll":
      return <PollBlock block={block} />;
    default:
      return null;
  }
}

function EmbedBlock({ block }: { block: RichBlock }) {
  const t = useTranslations("rooms");
  const color = HEX.test(str(block.color)) ? str(block.color) : null;
  const url = safeHttpsUrl(block.url);
  const thumb = safeHttpsUrl(block.thumbnailUrl);
  const image = safeHttpsUrl(block.imageUrl);
  const authorIcon = safeHttpsUrl(block.authorIconUrl);
  const authorUrl = safeHttpsUrl(block.authorUrl);
  const footerIcon = safeHttpsUrl(block.footerIconUrl);
  const fields: Array<{ name: string; value: string; inline: boolean }> = list(block.fields).map((f: any) => ({ name: str(f?.name), value: str(f?.value), inline: f?.inline === true }));
  const hasStamp = !Number.isNaN(new Date(str(block.timestamp)).getTime()) && !!str(block.timestamp);
  const authorName = str(block.authorName);
  const author = authorName ? (
    <>
      {authorIcon && <SafeImg src={authorIcon} alt="" className="h-5 w-5 rounded-full border border-border/50 object-cover" boxClassName="h-5 w-5 rounded-full" />}
      <span className="truncate text-xs font-bold">{authorName}</span>
    </>
  ) : null;
  return (
    <section aria-label={str(block.title) || t("bot.blocks.card")} className="max-w-md overflow-hidden rounded-lg border border-l-4 border-border/50 bg-muted/30 p-3" style={{ borderLeftColor: color ?? "hsl(var(--border))" }}>
      {author && <div className="mb-1.5 flex items-center gap-1.5">{authorUrl ? <ExternalLinkText href={authorUrl} className="gap-1.5 no-underline">{author}</ExternalLinkText> : author}</div>}
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          {str(block.title) && (url ? <ExternalLinkText href={url} className="text-sm font-extrabold text-primary">{str(block.title)}</ExternalLinkText> : <p className="break-words text-sm font-extrabold">{str(block.title)}</p>)}
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
        {thumb && <SafeImg src={thumb} alt="" className="h-14 w-14 rounded-md border border-border/50 object-cover" boxClassName="h-14 w-14 shrink-0" />}
      </div>
      {image && <div className="mt-2"><SafeImg src={image} alt="" className="max-h-56 w-auto max-w-full rounded-md border border-border/50 object-contain" boxClassName="min-h-[3rem] min-w-[3rem]" /></div>}
      {(str(block.footer) || hasStamp) && (
        <p className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
          {footerIcon && <SafeImg src={footerIcon} alt="" className="h-4 w-4 rounded-full border border-border/50 object-cover" boxClassName="h-4 w-4 rounded-full" />}
          {str(block.footer)}
          {str(block.footer) && hasStamp ? " · " : ""}
          {hasStamp ? <TimeText value={block.timestamp} style="datetime" /> : null}
        </p>
      )}
    </section>
  );
}

function GalleryBlock({ items }: { items: any[] }) {
  const shown = items.map((it) => ({ url: safeHttpsUrl(it?.url), alt: str(it?.alt), caption: str(it?.caption) })).filter((x): x is { url: string; alt: string; caption: string } => !!x.url).slice(0, 6);
  if (shown.length === 0) return null;
  const cols = shown.length === 1 ? "grid-cols-1" : shown.length === 2 || shown.length === 4 ? "grid-cols-2" : "grid-cols-3";
  return (
    <ul className={cx("grid max-w-md gap-1.5", cols)}>
      {shown.map((it, i) => (
        <li key={i} className="min-w-0">
          <figure>
            <SafeImg src={it.url} alt={it.alt} className={cx("w-full rounded-lg border border-border/50 object-cover", shown.length === 1 ? "max-h-64" : "aspect-square")} boxClassName="w-full" />
            {it.caption && <figcaption className="mt-0.5 truncate text-[11px] text-muted-foreground">{it.caption}</figcaption>}
          </figure>
        </li>
      ))}
    </ul>
  );
}

function SectionBlock({ block }: { block: RichBlock }) {
  const a = block.accessory;
  let accessory: React.ReactNode = null;
  if (a?.type === "thumbnail") {
    const url = safeHttpsUrl(a.url);
    if (url) accessory = <SafeImg src={url} alt={str(a.alt)} className="h-16 w-16 rounded-lg border border-border/50 object-cover" boxClassName="h-16 w-16 shrink-0" />;
  } else if (a?.type === "button") {
    const b = readComponent(a);
    if (b && b.type === "button") accessory = <AccessoryButton b={b} />;
  }
  return (
    <div className="flex min-w-0 max-w-xl items-start gap-3">
      <p className="min-w-0 flex-1 whitespace-pre-wrap break-words text-sm leading-relaxed">{str(block.text)}</p>
      {accessory && <div className="shrink-0">{accessory}</div>}
    </div>
  );
}

function AccessoryButton({ b }: { b: ButtonComponent }) {
  const t = useTranslations("rooms");
  const ctx = useContext(BotContext);
  const [press, setPress] = useState<PressState>({ status: "idle" });
  const locked = ctx.expired || (!ctx.interact && !ctx.preview);
  const send = async (customId: string) => {
    if (!ctx.interact || press.status === "loading" || locked) return;
    setPress({ status: "loading" });
    try {
      await ctx.interact(customId);
      setPress({ status: "idle" });
    } catch (e) {
      setPress({ status: "error", key: interactErrorKey((e as { status?: number })?.status) });
    }
  };
  return (
    <div className="flex flex-col items-end gap-1">
      <ButtonView b={b} locked={locked} busy={press.status === "loading"} loading={press.status === "loading"} preview={ctx.preview} onSend={send} />
      {press.status === "error" && <p role="alert" className="max-w-[12rem] text-right text-[11px] font-medium text-red-700 dark:text-red-300">{t(`bot.interact.errors.${press.key}`)}</p>}
    </div>
  );
}

function PollBlock({ block }: { block: RichBlock }) {
  const t = useTranslations("rooms");
  const results = pollResults(block.options);
  const total = results.reduce((n, r) => n + r.votes, 0);
  const closed = block.closed === true;
  const top = Math.max(0, ...results.map((r) => r.votes));
  return (
    <section aria-label={t("bot.blocks.poll.label")} className="max-w-md space-y-2 rounded-lg border border-border/50 bg-muted/30 p-3">
      <div className="flex items-start gap-2">
        <p className="min-w-0 flex-1 break-words text-sm font-extrabold">{str(block.question)}</p>
        {closed && <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-tight text-muted-foreground">{t("bot.blocks.poll.closed")}</span>}
      </div>
      <ul className="space-y-1.5">
        {results.map((r, i) => (
          <li key={i} className="space-y-0.5">
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <span className={cx("min-w-0 break-words", closed && r.votes === top && top > 0 && "font-bold")}>{r.emoji && <EmojiText text={`${r.emoji} `} />}{r.label}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">{r.votes} · {r.percent}%</span>
            </div>
            <div role="progressbar" aria-label={r.label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={r.percent} className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div className={cx("h-full rounded-full motion-reduce:transition-none", closed && r.votes !== top ? "bg-muted-foreground/40" : "bg-primary")} style={{ width: `${r.percent}%` }} />
            </div>
          </li>
        ))}
      </ul>
      <p className="text-[11px] text-muted-foreground">
        {t("bot.blocks.poll.votes", { count: total })}
        {block.multiple === true ? ` · ${t("bot.blocks.poll.multiple")}` : ""}
        {!closed && str(block.closesAt) ? <> · {t("bot.blocks.poll.closes")} <TimeText value={block.closesAt} style="relative" /></> : null}
      </p>
    </section>
  );
}

interface RichBlocksProps {
  blocks: readonly RichBlock[];
  className?: string;
  /** Sends a press of a button that lives inside a block (section accessory). Missing: drawn inert. */
  interact?: InteractFn;
  /** Expiry of the message's components (accessory buttons stop working with them). */
  expiresAt?: string | null;
  /** Draws accessory buttons as live without sending anything (editor preview). */
  preview?: boolean;
  idPrefix?: string;
}

export function RichBlocks({ blocks, className, interact, expiresAt, preview = false, idPrefix = "b" }: RichBlocksProps) {
  const ctx = useMemo<BotCtx>(() => ({ interact, preview, expired: isExpired(expiresAt), idPrefix }), [interact, preview, expiresAt, idPrefix]);
  if (blocks.length === 0) return null;
  return (
    <BotContext.Provider value={ctx}>
      <div className={cx("flex min-w-0 flex-col gap-1.5", className)}>
        {blocks.map((b, i) => <Block key={i} block={b} />)}
      </div>
    </BotContext.Provider>
  );
}

/* ───────────── interactive components ───────────── */

const BUTTON_TONE: Record<ButtonComponent["style"], string> = {
  primary: "border-transparent bg-primary text-primary-foreground hover:opacity-90",
  secondary: "border-border/60 bg-muted text-foreground hover:bg-muted/70",
  success: "border-transparent bg-emerald-700 text-white hover:bg-emerald-800",
  danger: "border-transparent bg-rose-700 text-white hover:bg-rose-800",
  link: "border-border/60 bg-card text-foreground hover:bg-muted",
};
const BUTTON_BASE = "inline-flex min-h-8 max-w-full items-center gap-1.5 rounded-md border px-3 py-1 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-60 motion-reduce:transition-none";

interface InteractiveProps {
  /** Rows as stored in `metadata.components.rows` (or built by the editor). */
  rows: unknown;
  expiresAt?: string | null;
  /** Sends a press. Missing: the controls are drawn but inert (preview, ephemeral messages). */
  interact?: InteractFn;
  /** Candidates of user / role / channel / mentionable selects (from the server). */
  fetchOptions?: FetchPickerOptions;
  /** Draws the controls as live (editor preview) without sending anything. */
  preview?: boolean;
  /** Unique per message: ids of the labels. */
  idPrefix: string;
}

/** Buttons, toggles and selects of one message, with loading / error / expired states. One press at a time per message (the server keeps a cooldown). */
export function InteractiveComponents({ rows, expiresAt, interact, fetchOptions, preview = false, idPrefix }: InteractiveProps) {
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
      throw e;
    } finally {
      setPendingId(null);
    }
  };

  return (
    <div className="mt-1 flex min-w-0 flex-col gap-1.5" data-testid="bot-components">
      {parsed.map((row, r) => (
        <div key={r} className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t("bot.components.group", { n: r + 1 })}>
          {row.components.map((c, i) => (
            <ComponentView key={`${r}-${i}`} c={c} id={`${idPrefix}-${r}-${i}`} locked={locked} busy={busy} loading={pendingId === (c as { customId?: string }).customId && busy} preview={preview} fetchOptions={fetchOptions} onSend={(cid, v) => { void send(cid, v).catch(() => undefined); }} sendAsync={send} />
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

interface ViewProps { id: string; locked: boolean; busy: boolean; loading: boolean; preview: boolean; onSend: (customId: string, values?: string[]) => void }

function ComponentView({ c, id, locked, busy, loading, preview, fetchOptions, onSend, sendAsync }: ViewProps & { c: Component; fetchOptions?: FetchPickerOptions; sendAsync: (customId: string, values?: string[]) => Promise<void> }) {
  if (c.type === "button") return <ButtonView b={c} locked={locked} busy={busy} loading={loading} preview={preview} onSend={onSend} />;
  if (c.type === "toggle") return <ToggleView tg={c} id={id} locked={locked} busy={busy} loading={loading} preview={preview} sendAsync={sendAsync} />;
  if (isSelectLike(c) && c.type !== "select") return <PickerView c={c as Extract<Component, { type: "user_select" }>} id={id} locked={locked} busy={busy} loading={loading} preview={preview} fetchOptions={fetchOptions} onSend={onSend} />;
  return <SelectView s={c as SelectComponent} id={id} locked={locked} busy={busy} loading={loading} preview={preview} onSend={onSend} />;
}

function ButtonView({ b, locked, busy, loading, preview, onSend }: { b: ButtonComponent; locked: boolean; busy: boolean; loading: boolean; preview: boolean; onSend: (customId: string, values?: string[]) => void }) {
  const t = useTranslations("rooms");
  const label = (
    <>
      {b.emoji && <span aria-hidden><EmojiText text={b.emoji} /></span>}
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

/** A two-state switch. The press sends the NEW state; if it fails the switch goes back. The script persists it by updating the message. */
function ToggleView({ tg, id, locked, busy, loading, preview, sendAsync }: { tg: ToggleComponent; id: string; locked: boolean; busy: boolean; loading: boolean; preview: boolean; sendAsync: (customId: string, values?: string[]) => Promise<void> }) {
  const [checked, setChecked] = useState(tg.checked === true);
  useEffect(() => setChecked(tg.checked === true), [tg.checked]);
  const disabled = Boolean(tg.disabled) || (!preview && (locked || busy));
  const flip = () => {
    if (preview) return setChecked((c) => !c);
    const next = !checked;
    setChecked(next);
    void sendAsync(tg.customId, toggleValues(next)).catch(() => setChecked(!next));
  };
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-busy={loading || undefined}
      disabled={preview ? false : disabled}
      tabIndex={preview ? -1 : undefined}
      onClick={flip}
      className="inline-flex min-h-8 max-w-full items-center gap-2 rounded-md px-1.5 py-1 text-xs font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span aria-hidden className={cx("relative inline-block h-4 w-7 shrink-0 rounded-full border border-border/60 transition-colors motion-reduce:transition-none", checked ? "bg-primary" : "bg-muted")}>
        <span className={cx("absolute top-0.5 h-3 w-3 rounded-full bg-background shadow transition-all motion-reduce:transition-none", checked ? "left-3.5" : "left-0.5")} />
      </span>
      <span className="min-w-0 truncate">{tg.label}</span>
      {loading && <Loader2 className="h-3 w-3 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden />}
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
  const fieldCls = "h-8 w-full max-w-full rounded-md border border-border/60 bg-background px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-50 sm:w-72";

  if (!multiple) {
    return (
      <span className="inline-flex w-full max-w-full items-center gap-1.5 sm:w-auto">
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
    <fieldset className="w-full min-w-[12rem] max-w-full rounded-md border border-border/60 p-2 sm:w-72" disabled={preview ? false : disabled}>
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
