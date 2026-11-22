"use client";

/**
 * Pickers of a bot message: user / role / channel / mentionable selects. The candidates come from the server
 * (`GET /rooms/:id/messages/:mid/select-options`), already limited to what the person may see; the client never builds the list itself.
 * Accessible combobox: trigger button (aria-haspopup="listbox"), search field, listbox with `aria-multiselectable`, arrow keys,
 * Enter / Space to pick, Escape to close and give the focus back.
 */

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { AtSign, Check, ChevronDown, Hash, Loader2, Shield, User } from "lucide-react";

import { useTranslations } from "@/components/providers/i18n-provider";
import { cx } from "@/components/roles/ui";
import { validPick, type PickerComponent, type PickerItem } from "@/lib/bots/components";
import { safeHttpsUrl } from "@/lib/bots/rich";

export type FetchPickerOptions = (customId: string, query: string) => Promise<PickerItem[]>;

const ICONS = { user_select: User, role_select: Shield, channel_select: Hash, mentionable_select: AtSign } as const;

function ItemGlyph({ item }: { item: PickerItem }) {
  if (item.kind === "channel") return <span aria-hidden className="grid h-5 w-5 shrink-0 place-items-center rounded bg-muted text-muted-foreground"><Hash className="h-3 w-3" /></span>;
  if (item.kind === "role") return <span aria-hidden className="h-3 w-3 shrink-0 rounded-full border border-border/50" style={{ backgroundColor: item.color ?? "hsl(var(--muted-foreground))" }} />;
  const url = safeHttpsUrl(item.avatarUrl);
  // eslint-disable-next-line @next/next/no-img-element
  if (url) return <img src={url} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-5 w-5 shrink-0 rounded-full border border-border/50 object-cover" />;
  return <span aria-hidden className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-muted text-[10px] font-bold text-muted-foreground">{item.name.slice(0, 1).toUpperCase()}</span>;
}

interface Props {
  c: PickerComponent;
  id: string;
  locked: boolean;
  busy: boolean;
  loading: boolean;
  preview: boolean;
  fetchOptions?: FetchPickerOptions;
  onSend: (customId: string, values?: string[]) => void;
}

export function PickerView({ c, id, locked, busy, loading, preview, fetchOptions, onSend }: Props) {
  const t = useTranslations("rooms");
  const uid = useId();
  const listId = `${id}-${uid}-list`;
  const multiple = c.maxValues > 1;
  const Icon = ICONS[c.type];
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [items, setItems] = useState<PickerItem[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [chosen, setChosen] = useState<PickerItem[]>([]);
  const [active, setActive] = useState(0);
  const seq = useRef(0);
  const disabled = Boolean(c.disabled) || (!preview && (locked || busy));
  const placeholder = c.placeholder || t(`bot.picker.placeholder.${c.type}`);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query), 250);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (!open || !fetchOptions || preview) return;
    const mine = ++seq.current;
    setStatus("loading");
    fetchOptions(c.customId, debounced)
      .then((list) => { if (mine === seq.current) { setItems(list); setStatus("idle"); setActive(0); } })
      .catch(() => { if (mine === seq.current) setStatus("error"); });
  }, [open, debounced, fetchOptions, c.customId, preview]);

  const close = useCallback((refocus: boolean) => {
    setOpen(false);
    setQuery("");
    setDebounced("");
    if (refocus) triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    searchRef.current?.focus();
    const onDown = (e: MouseEvent) => { if (rootRef.current && !rootRef.current.contains(e.target as Node)) close(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, close]);

  const isChosen = (item: PickerItem) => chosen.some((x) => x.id === item.id);
  const pick = (item: PickerItem) => {
    if (!multiple) {
      setChosen([item]);
      close(true);
      if (!preview) { const ok = validPick(c, [item.id]); if (ok) onSend(c.customId, ok); }
      return;
    }
    setChosen((cur) => (cur.some((x) => x.id === item.id) ? cur.filter((x) => x.id !== item.id) : cur.length < c.maxValues ? [...cur, item] : cur));
  };
  const ids = chosen.map((x) => x.id);
  const valid = validPick(c, ids);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); close(true); }
    else if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(items.length - 1, i + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
    else if (e.key === "Home") { setActive(0); }
    else if (e.key === "End") { setActive(Math.max(0, items.length - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); if (items[active]) pick(items[active]); }
  };

  const label = chosen.length > 0 ? chosen.map((x) => (x.kind === "channel" ? `#${x.name}` : x.name)).join(", ") : placeholder;

  return (
    <div ref={rootRef} className="relative w-full sm:w-72 sm:max-w-full">
      <button
        ref={triggerRef}
        id={id}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-busy={loading || undefined}
        disabled={preview ? false : disabled}
        aria-disabled={preview ? true : undefined}
        tabIndex={preview ? -1 : undefined}
        onClick={() => !preview && setOpen((o) => !o)}
        className="flex h-8 w-full items-center gap-2 rounded-md border border-border/60 bg-background px-2 text-left text-xs text-foreground transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none"
      >
        <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <span className={cx("min-w-0 flex-1 truncate", chosen.length === 0 && "text-muted-foreground")}>{label}</span>
        {loading ? <Loader2 className="h-3 w-3 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden /> : <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />}
      </button>

      {open && (
        <div className="absolute bottom-full left-0 z-30 mb-1 w-full min-w-[14rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-border/60 bg-popover text-popover-foreground shadow-lg">
          <div className="border-b border-border/50 p-1.5">
            <label htmlFor={`${id}-${uid}-q`} className="sr-only">{t("bot.picker.search")}</label>
            <input
              ref={searchRef}
              id={`${id}-${uid}-q`}
              role="combobox"
              aria-expanded="true"
              aria-controls={listId}
              aria-activedescendant={items[active] ? `${listId}-${active}` : undefined}
              aria-autocomplete="list"
              type="text"
              value={query}
              maxLength={100}
              placeholder={t("bot.picker.search")}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKey}
              className="h-7 w-full rounded-md border border-border/60 bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            />
          </div>
          <ul id={listId} role="listbox" aria-multiselectable={multiple || undefined} aria-label={placeholder} className="max-h-56 overflow-y-auto p-1">
            {items.map((item, i) => {
              const selected = isChosen(item);
              return (
                <li
                  key={`${item.kind}:${item.id}`}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={selected}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(item)}
                  className={cx("flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs", i === active && "bg-muted/70", selected && "font-semibold")}
                >
                  <ItemGlyph item={item} />
                  <span className="min-w-0 flex-1 truncate">{item.kind === "channel" ? `#${item.name}` : item.name}</span>
                  {c.type === "mentionable_select" && <span className="shrink-0 text-[10px] text-muted-foreground">{t(`bot.picker.kind.${item.kind}`)}</span>}
                  {selected && <Check className="h-3 w-3 shrink-0 text-primary" aria-hidden />}
                </li>
              );
            })}
          </ul>
          <div className="min-h-[1.25rem] px-2 pb-1 text-[11px] text-muted-foreground" aria-live="polite">
            {status === "loading" && <span className="inline-flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin motion-reduce:animate-none" aria-hidden />{t("bot.picker.loading")}</span>}
            {status === "error" && <span role="alert" className="text-red-700 dark:text-red-300">{t("bot.picker.error")}</span>}
            {status === "idle" && items.length === 0 && t("bot.picker.empty")}
          </div>
          {multiple && (
            <div className="flex items-center justify-between gap-2 border-t border-border/50 p-1.5">
              <span className="text-[10px] text-muted-foreground">{t("bot.components.pickRange", { min: c.minValues, max: c.maxValues })}</span>
              <button
                type="button"
                disabled={!valid}
                onClick={() => { if (valid) { onSend(c.customId, valid); close(true); } }}
                className="inline-flex h-7 items-center rounded-md bg-primary px-2.5 text-[11px] font-bold text-primary-foreground hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t("bot.components.confirm")}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
