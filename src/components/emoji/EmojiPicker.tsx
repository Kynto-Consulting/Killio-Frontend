"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import {
  Clock, Flag, Gamepad2, Lightbulb, Loader2, Leaf, Plane, Search, Server, Shapes, Smile, Utensils, X,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "@/components/providers/i18n-provider";
import { Emoji } from "./Emoji";
import { useCustomEmojis } from "./emoji-context";
import { useEmojiDataset } from "./use-emoji-dataset";
import { searchCustomEmojis, searchEmojis } from "@/lib/emoji/search";
import { glyphForTone, hasSkinTones, loadSkinTone, saveSkinTone, SKIN_TONES, type SkinTone } from "@/lib/emoji/skin";
import { customUsageKey, loadUsage, topUsed, trackEmojiUse } from "@/lib/emoji/usage";
import type { CustomEmoji, EmojiCategoryId, EmojiEntry } from "@/lib/emoji/types";

export type EmojiSelection =
  | { type: "unicode"; emoji: string; shortcode: string; name: string }
  | { type: "custom"; custom: CustomEmoji; token: string };

export interface EmojiPickerProps {
  /** Receives the glyph (or `:name:` for a custom emoji) and the full selection. */
  onSelect: (value: string, selection: EmojiSelection) => void;
  onClose?: () => void;
  /** Custom emojis of the space; defaults to those of the nearest <EmojiProvider>. */
  customEmojis?: CustomEmoji[];
  /** "sheet": category strip on top and full width (bottom sheet on phones). */
  layout?: "popover" | "sheet";
  autoFocus?: boolean;
  className?: string;
}

const ICONS: Record<EmojiCategoryId, LucideIcon> = {
  frequent: Clock, people: Smile, nature: Leaf, foods: Utensils, activity: Gamepad2,
  places: Plane, objects: Lightbulb, symbols: Shapes, flags: Flag, custom: Server,
};

interface Cell {
  key: string;
  glyph?: string;
  custom?: CustomEmoji;
  name: string;
  shortcode: string;
}
interface Section { id: EmojiCategoryId | "search"; cells: Cell[] }

const FREQUENT_LIMIT = 24;
const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

function cellOfEntry(e: EmojiEntry, tone: SkinTone): Cell {
  const glyph = hasSkinTones(e) ? glyphForTone(e, tone) : e.skins[0];
  return { key: `u:${e.id}`, glyph, name: cap(e.name), shortcode: e.id };
}
const cellOfCustom = (c: CustomEmoji): Cell => ({ key: `c:${c.id}`, custom: c, name: c.name, shortcode: c.name });

/**
 * Discord-style emoji picker: search, category rail, sticky section headers, dense grid, live preview, skin tones,
 * recents, custom emojis of the space. All colours come from the theme tokens (card, border, muted, primary, ring),
 * so it follows light/dark and the tenant's branding without any picker-specific setting.
 */
export function EmojiPicker({ onSelect, onClose, customEmojis, layout = "popover", autoFocus = true, className = "" }: EmojiPickerProps) {
  const t = useTranslations("emoji");
  const ctx = useCustomEmojis();
  const custom = customEmojis ?? ctx.customEmojis;
  const { dataset, status, retry } = useEmojiDataset();
  const [query, setQuery] = useState("");
  const [tone, setTone] = useState<SkinTone>(0);
  const [tonesOpen, setTonesOpen] = useState(false);
  const [usage, setUsage] = useState<string[]>([]);
  const [preview, setPreview] = useState<Cell | null>(null);
  const [activeNav, setActiveNav] = useState<string>("");
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  useEffect(() => {
    setTone(loadSkinTone());
    setUsage(topUsed(loadUsage(), FREQUENT_LIMIT, Date.now()));
  }, []);
  useEffect(() => {
    if (autoFocus && !window.matchMedia("(pointer: coarse)").matches) searchRef.current?.focus();
  }, [autoFocus, status]);

  const q = query.trim();

  const sections = useMemo<Section[]>(() => {
    if (!dataset) return [];
    if (q) {
      const cells = [
        ...searchCustomEmojis(custom, q).map(cellOfCustom),
        ...searchEmojis(dataset, q, { limit: 160 }).map((e) => cellOfEntry(e, tone)),
      ];
      return [{ id: "search", cells }];
    }
    const out: Section[] = [];
    const frequent: Cell[] = [];
    for (const key of usage) {
      if (key.startsWith("custom:")) {
        const c = custom.find((x) => customUsageKey(x.id) === key);
        if (c) frequent.push(cellOfCustom(c));
      } else {
        const e = dataset.byNative.get(key.replace(/️/g, ""));
        if (e) frequent.push({ key: `f:${key}`, glyph: key, name: cap(e.name), shortcode: e.id });
      }
    }
    if (frequent.length) out.push({ id: "frequent", cells: frequent });
    if (custom.length) out.push({ id: "custom", cells: custom.map(cellOfCustom) });
    for (const cat of dataset.categories) {
      out.push({ id: cat.id, cells: cat.ids.map((id) => cellOfEntry(dataset.byId.get(id)!, tone)) });
    }
    return out;
  }, [dataset, q, custom, tone, usage]);

  const navIds = useMemo(() => sections.filter((s) => s.id !== "search").map((s) => s.id), [sections]);
  const firstKey = sections[0]?.cells[0]?.key ?? null;

  const pick = useCallback((cell: Cell) => {
    if (cell.custom) {
      trackEmojiUse(customUsageKey(cell.custom.id));
      onSelect(`:${cell.custom.name}:`, { type: "custom", custom: cell.custom, token: `:${cell.custom.name}:` });
    } else if (cell.glyph) {
      trackEmojiUse(cell.glyph);
      onSelect(cell.glyph, { type: "unicode", emoji: cell.glyph, shortcode: cell.shortcode, name: cell.name });
    }
  }, [onSelect]);

  const onScroll = useCallback(() => {
    const box = scrollRef.current;
    if (!box || q) return;
    let current = navIds[0] ?? "";
    for (const id of navIds) {
      const el = sectionRefs.current[id];
      if (el && el.offsetTop - box.offsetTop <= box.scrollTop + 12) current = id;
    }
    setActiveNav(current);
  }, [navIds, q]);

  const goTo = (id: string) => {
    const box = scrollRef.current;
    const el = sectionRefs.current[id];
    if (!box || !el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    box.scrollTo({ top: el.offsetTop - box.offsetTop, behavior: reduce ? "auto" : "smooth" });
    setActiveNav(id);
  };

  const cells = () => Array.from(scrollRef.current?.querySelectorAll<HTMLButtonElement>("[data-emoji-cell]") ?? []);

  const moveFocus = (from: HTMLElement, dir: "left" | "right" | "up" | "down") => {
    const all = cells();
    const i = all.indexOf(from as HTMLButtonElement);
    if (i < 0) return;
    let target: HTMLButtonElement | undefined;
    if (dir === "left") target = all[i - 1];
    else if (dir === "right") target = all[i + 1];
    else {
      const rect = from.getBoundingClientRect();
      const rows = all.filter((c) => (dir === "down" ? c.getBoundingClientRect().top > rect.top + 4 : c.getBoundingClientRect().top < rect.top - 4));
      if (rows.length) {
        const rowTop = dir === "down"
          ? Math.min(...rows.map((c) => c.getBoundingClientRect().top))
          : Math.max(...rows.map((c) => c.getBoundingClientRect().top));
        target = rows
          .filter((c) => Math.abs(c.getBoundingClientRect().top - rowTop) < 4)
          .sort((a, b) => Math.abs(a.getBoundingClientRect().left - rect.left) - Math.abs(b.getBoundingClientRect().left - rect.left))[0];
      }
    }
    if (target) { target.focus(); target.scrollIntoView({ block: "nearest" }); }
  };

  const onGridKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-emoji-cell]");
    if (!el) return;
    const map = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down" } as const;
    const dir = map[e.key as keyof typeof map];
    if (dir) { e.preventDefault(); moveFocus(el, dir); }
    else if (e.key === "Home") { e.preventDefault(); cells()[0]?.focus(); }
    else if (e.key === "End") { e.preventDefault(); cells().at(-1)?.focus(); }
  };

  const onRootKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose?.(); }
  };

  const onSearchKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") { e.preventDefault(); cells()[0]?.focus(); }
    else if (e.key === "Enter") {
      const first = sections[0]?.cells[0];
      if (first) { e.preventDefault(); pick(first); }
    }
  };

  const setToneAndSave = (n: SkinTone) => { setTone(n); saveSkinTone(n); setTonesOpen(false); };
  const sheet = layout === "sheet";
  const waveEntry = dataset?.byId.get("wave");
  const toneGlyph = waveEntry ? glyphForTone(waveEntry, tone) : "👋";

  return (
    <div
      role="dialog"
      aria-label={t("picker.label")}
      onKeyDown={onRootKey}
      className={`flex flex-col overflow-hidden border border-border bg-card text-card-foreground shadow-xl ${sheet ? "h-full w-full rounded-t-2xl" : "h-[420px] w-[352px] max-w-[calc(100vw-16px)] rounded-2xl"} ${className}`}
    >
      {/* search + skin tone */}
      <div className="flex items-center gap-2 border-b border-border p-2">
        <label className="relative flex min-w-0 flex-1 items-center">
          <span className="sr-only">{t("picker.search")}</span>
          <Search className="pointer-events-none absolute left-2.5 h-4 w-4 text-muted-foreground" aria-hidden />
          <input
            ref={searchRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onSearchKey}
            placeholder={t("picker.searchPlaceholder")}
            autoComplete="off"
            spellCheck={false}
            className="h-9 w-full rounded-xl border border-border bg-muted/50 pl-8 pr-8 text-sm text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          />
          {query && (
            <button
              type="button"
              onClick={() => { setQuery(""); searchRef.current?.focus(); }}
              aria-label={t("picker.clear")}
              className="absolute right-1.5 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          )}
        </label>
        <button
          type="button"
          onClick={() => setTonesOpen((v) => !v)}
          aria-label={`${t("picker.skinTone")}: ${t(`tones.${tone}`)}`}
          aria-expanded={tonesOpen}
          title={t("picker.skinTone")}
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none ${tonesOpen ? "bg-primary/15" : ""}`}
        >
          <Emoji value={toneGlyph} size={20} label="" />
        </button>
      </div>
      {tonesOpen && (
        <div role="radiogroup" aria-label={t("picker.skinTone")} className="flex items-center justify-between gap-1 border-b border-border px-2 py-1.5">
          {SKIN_TONES.map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={tone === n}
              aria-label={t(`tones.${n}`)}
              title={t(`tones.${n}`)}
              onClick={() => setToneAndSave(n)}
              className={`flex h-8 flex-1 items-center justify-center rounded-lg transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none ${tone === n ? "bg-primary/15 ring-1 ring-primary/40" : ""}`}
            >
              <Emoji value={waveEntry ? glyphForTone(waveEntry, n) : "👋"} size={20} label="" />
            </button>
          ))}
        </div>
      )}

      <div className={`flex min-h-0 flex-1 ${sheet ? "flex-col" : "flex-row"}`}>
        {/* category rail */}
        {!q && status === "ready" && (
          <nav
            aria-label={t("picker.categoriesNav")}
            className={`flex shrink-0 gap-0.5 border-border p-1 ${sheet ? "flex-row overflow-x-auto border-b" : "w-11 flex-col items-center overflow-y-auto border-r"}`}
          >
            {navIds.map((id) => {
              const Icon = ICONS[id as EmojiCategoryId];
              const active = (activeNav || navIds[0]) === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => goTo(id)}
                  aria-label={t(`categories.${id}`)}
                  aria-current={active ? "true" : undefined}
                  title={t(`categories.${id}`)}
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none ${active ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                >
                  <Icon className="h-[18px] w-[18px]" aria-hidden />
                </button>
              );
            })}
          </nav>
        )}

        {/* grid */}
        <div
          ref={scrollRef}
          onScroll={onScroll}
          onKeyDown={onGridKey}
          className="relative min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain px-1 pb-1"
        >
          {status === "loading" && (
            <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground" role="status">
              <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> {t("picker.loading")}
            </div>
          )}
          {status === "error" && (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center text-sm text-muted-foreground" role="alert">
              {t("picker.loadError")}
              <button type="button" onClick={retry} className="rounded-lg border border-border px-3 py-1 text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                {t("picker.retry")}
              </button>
            </div>
          )}
          {status === "ready" && q && sections[0]?.cells.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center gap-1 p-4 text-center">
              <Emoji value="🔍" size={32} label="" />
              <p className="text-sm font-medium">{t("picker.noResults")}</p>
              <p className="text-xs text-muted-foreground">{t("picker.noResultsHint")}</p>
            </div>
          )}
          {status === "ready" && sections.map((section) => (
            section.cells.length === 0 ? null : (
              <section
                key={section.id}
                ref={(el) => { sectionRefs.current[section.id] = el; }}
                aria-label={section.id === "search" ? t("picker.results") : t(`categories.${section.id}`)}
                className="[contain-intrinsic-size:auto_300px] [content-visibility:auto]"
              >
                <h3 className="sticky top-0 z-10 bg-card/95 px-1.5 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur-sm">
                  {section.id === "search" ? t("picker.results") : t(`categories.${section.id}`)}
                </h3>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(36px,1fr))]">
                  {section.cells.map((cell) => (
                    <button
                      key={cell.key}
                      type="button"
                      data-emoji-cell
                      tabIndex={(focusKey ?? firstKey) === cell.key ? 0 : -1}
                      aria-label={cell.name}
                      title={`:${cell.shortcode}:`}
                      onClick={() => pick(cell)}
                      onMouseEnter={() => setPreview(cell)}
                      onFocus={() => { setPreview(cell); setFocusKey(cell.key); }}
                      className="flex h-9 w-full items-center justify-center rounded-lg transition-colors hover:bg-primary/10 focus-visible:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
                    >
                      {cell.custom ? (
                        // eslint-disable-next-line @next/next/no-img-element -- custom emoji of the space
                        <img src={cell.custom.url} alt="" loading="lazy" draggable={false} className="h-6 w-6 object-contain" />
                      ) : (
                        <Emoji value={cell.glyph!} size={24} label="" />
                      )}
                    </button>
                  ))}
                </div>
              </section>
            )
          ))}
        </div>
      </div>

      {/* preview */}
      <div className="flex h-12 shrink-0 items-center gap-3 border-t border-border px-3" aria-live="polite">
        {preview ? (
          <>
            {preview.custom
              // eslint-disable-next-line @next/next/no-img-element -- custom emoji of the space
              ? <img src={preview.custom.url} alt="" className="h-8 w-8 object-contain" />
              : <Emoji value={preview.glyph!} size={32} label="" />}
            <div className="min-w-0 leading-tight">
              <p className="truncate text-sm font-medium">{preview.name}</p>
              <p className="truncate text-xs text-muted-foreground">:{preview.shortcode}:</p>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">{t("picker.previewEmpty")}</p>
        )}
      </div>
    </div>
  );
}
