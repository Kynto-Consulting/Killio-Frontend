/**
 * Pure helpers for the marketplace gallery, detail page and author editor.
 * No React, no icons and no DOM here, so everything runs under `node --experimental-strip-types --test`.
 */

export type PackLike = {
  id: string;
  slug?: string;
  title: string;
  summary?: string | null;
  updatedAt?: string;
  pricingType?: "free" | "paid";
  priceAmountMinor?: number | null;
  currency?: string | null;
  category?: string | null;
  tags?: string[] | null;
  authorName?: string | null;
};

/* ── categories ── */
export const KNOWN_CATEGORIES = ["finanzas", "comunidad", "organizacion", "desarrollo", "corporativo"] as const;
export type KnownCategory = (typeof KNOWN_CATEGORIES)[number];
export const CATEGORY_SLUG_RE = /^[a-z0-9-]{2,32}$/;
export const MAX_GALLERY = 8;
export const MAX_TAGS = 8;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const IMAGE_MIME_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;

export function isKnownCategory(slug: string | null | undefined): slug is KnownCategory {
  return !!slug && (KNOWN_CATEGORIES as readonly string[]).includes(slug);
}

/** Cover family for a category slug; anything unknown or empty uses the "other" composition. */
export function coverFamily(category: string | null | undefined): KnownCategory | "otra" {
  return isKnownCategory(category) ? category : "otra";
}

/** "mi-categoria" -> "Mi categoria" (label for categories without a translation). */
export function prettifyCategory(slug: string): string {
  const text = slug.replace(/-/g, " ").trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : slug;
}

/* ── deterministic generated cover ── */
/**
 * Colours are theme tokens, never fixed backgrounds: `COVER_TOKENS` is the single source of truth for the
 * `--cover-*` custom properties that live in globals.css (`:root` = light, `.dark` = dark); a test keeps both in
 * sync and checks WCAG AA contrast of every text/background pair in both modes.
 * Accent shapes (coral, mustard...) are decorative and identical in both modes; ink and sticker follow the theme.
 */
export const COVER_TOKENS = {
  light: {
    "--cover-ink": "#1B1B2F",
    "--cover-sticker": "#FFF4E0",
    "--cover-bg-finanzas": "#BDEFD8",
    "--cover-bg-comunidad": "#FFC9DC",
    "--cover-bg-organizacion": "#D3CAFF",
    "--cover-bg-desarrollo": "#B6ECE6",
    "--cover-bg-corporativo": "#FFE08A",
    "--cover-bg-otra": "#FFC2B8",
    "--cover-badge-free": "#8FE3BC",
    "--cover-badge-paid": "#F5B82E",
  },
  dark: {
    "--cover-ink": "#F8F3E6",
    "--cover-sticker": "#2A2640",
    "--cover-bg-finanzas": "#14473D",
    "--cover-bg-comunidad": "#5A1F3A",
    "--cover-bg-organizacion": "#2E2670",
    "--cover-bg-desarrollo": "#0F4A4A",
    "--cover-bg-corporativo": "#5C4306",
    "--cover-bg-otra": "#5E2A22",
    "--cover-badge-free": "#1F6B50",
    "--cover-badge-paid": "#7A5A06",
  },
} as const;

export const COVER_PALETTE = {
  coral: "#FF6B5B",
  mustard: "#F5B82E",
  turquoise: "#19B5A5",
  violet: "#7C5CFF",
  mint: "#8FE3BC",
  pink: "#FF8FB8",
  ink: "var(--cover-ink)",
  cream: "var(--cover-sticker)",
} as const;

/** CSS value for the flat background of a cover family (also used by category chips). */
export function coverBgVar(family: KnownCategory | "otra"): string {
  return `var(--cover-bg-${family})`;
}

/* ── WCAG contrast (pure) ── */
function channel(v: number): number {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}
export function relativeLuminance(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) throw new Error(`bad hex colour: ${hex}`);
  const n = parseInt(m[1], 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export type CoverShapeKind = "circle" | "ring" | "semicircle" | "triangle" | "squiggle" | "dots" | "moon" | "block";
export type CoverShape = { kind: CoverShapeKind; x: number; y: number; size: number; rotation: number; fill: string };
export type CoverSpec = { family: KnownCategory | "otra"; background: string; stroke: string; icon: string; shapes: CoverShape[] };

/** Cover canvas: 160 x 100 (16:10). */
export const COVER_W = 160;
export const COVER_H = 100;

export function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const P = COVER_PALETTE;
type Template = { background: string; icon: string; shapes: CoverShape[] };
const s = (kind: CoverShapeKind, x: number, y: number, size: number, rotation: number, fill: string): CoverShape => ({ kind, x, y, size, rotation, fill });

const TEMPLATES: Record<KnownCategory | "otra", Template> = {
  finanzas: {
    background: coverBgVar("finanzas"),
    icon: "Wallet",
    shapes: [
      s("circle", 28, 62, 34, 0, P.mustard), s("ring", 52, 36, 26, 0, P.ink), s("semicircle", 122, 80, 40, 0, P.turquoise),
      s("squiggle", 100, 28, 34, -8, P.ink), s("dots", 136, 26, 22, 0, P.ink), s("triangle", 14, 20, 16, 12, P.coral),
    ],
  },
  comunidad: {
    background: coverBgVar("comunidad"),
    icon: "Users",
    shapes: [
      s("circle", 36, 56, 36, 0, P.coral), s("circle", 64, 70, 28, 0, P.violet), s("moon", 120, 34, 32, 20, P.mustard),
      s("triangle", 132, 78, 20, -10, P.turquoise), s("squiggle", 84, 20, 30, 6, P.ink), s("dots", 14, 18, 20, 0, P.ink),
    ],
  },
  organizacion: {
    background: coverBgVar("organizacion"),
    icon: "LayoutGrid",
    shapes: [
      s("block", 30, 50, 34, 0, P.violet), s("block", 62, 64, 26, 0, P.mustard), s("block", 118, 32, 30, 8, P.mint),
      s("dots", 100, 76, 28, 0, P.ink), s("triangle", 140, 74, 20, 8, P.coral), s("squiggle", 18, 16, 30, -6, P.ink),
    ],
  },
  desarrollo: {
    background: coverBgVar("desarrollo"),
    icon: "Code",
    shapes: [
      s("ring", 32, 40, 30, 0, P.ink), s("triangle", 66, 70, 28, -6, P.violet), s("semicircle", 122, 30, 36, 180, P.coral),
      s("squiggle", 94, 78, 36, 4, P.ink), s("circle", 138, 78, 16, 0, P.mustard), s("dots", 16, 78, 20, 0, P.ink),
    ],
  },
  corporativo: {
    background: coverBgVar("corporativo"),
    icon: "Building2",
    shapes: [
      s("block", 34, 56, 30, 0, P.ink), s("block", 62, 62, 22, 0, P.coral), s("semicircle", 122, 82, 42, 0, P.violet),
      s("circle", 128, 28, 20, 0, P.turquoise), s("dots", 90, 24, 24, 0, P.ink), s("squiggle", 12, 18, 28, 8, P.ink),
    ],
  },
  otra: {
    background: coverBgVar("otra"),
    icon: "Sparkles",
    shapes: [
      s("moon", 34, 52, 34, -20, P.violet), s("circle", 70, 66, 24, 0, P.mustard), s("triangle", 120, 36, 28, 14, P.turquoise),
      s("ring", 134, 76, 22, 0, P.ink), s("squiggle", 82, 20, 32, -4, P.ink), s("dots", 14, 82, 20, 0, P.ink),
    ],
  },
};

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Same (seed, category) always returns the same composition; the seed only nudges positions and angles. */
export function generateCover(seed: string, category: string | null | undefined): CoverSpec {
  const family = coverFamily(category);
  const base = TEMPLATES[family];
  const h = hashString(`${seed}|${family}`);
  const shapes = base.shapes.map((shape, i) => {
    const r = hashString(`${h}:${i}`);
    const dx = ((r & 0xff) / 255 - 0.5) * 10;
    const dy = (((r >> 8) & 0xff) / 255 - 0.5) * 8;
    const dr = (((r >> 16) & 0xff) / 255 - 0.5) * 24;
    return { ...shape, x: Math.round(clamp(shape.x + dx, 6, COVER_W - 6)), y: Math.round(clamp(shape.y + dy, 6, COVER_H - 6)), rotation: Math.round(shape.rotation + dr) };
  });
  return { family, background: base.background, stroke: P.ink, icon: base.icon, shapes };
}

/* ── filtering and sorting ── */
export function normalizeText(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

export function filterPacks<T extends PackLike>(packs: T[], input: { category?: string | null; query?: string }): T[] {
  const category = input.category && input.category !== "all" ? input.category : null;
  const terms = normalizeText(input.query ?? "").split(/\s+/).filter(Boolean);
  return packs.filter((pack) => {
    if (category && (pack.category ?? null) !== category) return false;
    if (terms.length === 0) return true;
    const haystack = normalizeText([pack.title, pack.summary ?? "", pack.slug ?? "", pack.authorName ?? "", pack.category ?? "", ...(pack.tags ?? [])].join(" "));
    return terms.every((term) => haystack.includes(term));
  });
}

/** Distinct categories in the packs: known ones first (fixed order), then others alphabetically. */
export function categoriesFromPacks(packs: PackLike[]): Array<{ slug: string; count: number }> {
  const counts = new Map<string, number>();
  for (const pack of packs) {
    if (!pack.category) continue;
    counts.set(pack.category, (counts.get(pack.category) ?? 0) + 1);
  }
  const rank = (slug: string) => {
    const i = (KNOWN_CATEGORIES as readonly string[]).indexOf(slug);
    return i === -1 ? KNOWN_CATEGORIES.length : i;
  };
  return [...counts.entries()]
    .map(([slug, count]) => ({ slug, count }))
    .sort((a, b) => rank(a.slug) - rank(b.slug) || a.slug.localeCompare(b.slug));
}

export type SortMode = "recent" | "freeFirst" | "price";
export const SORT_MODES: SortMode[] = ["recent", "freeFirst", "price"];

function priceMinor(pack: PackLike): number {
  return pack.pricingType === "paid" && pack.priceAmountMinor && pack.currency ? pack.priceAmountMinor : 0;
}

/** recent: newest first. freeFirst: free packs first, newest first inside each group. price: cheapest first, newest breaks ties. */
export function sortPacks<T extends PackLike>(packs: T[], mode: SortMode): T[] {
  const recent = (a: T, b: T) => String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? ""));
  const out = [...packs];
  if (mode === "freeFirst") out.sort((a, b) => Number(priceMinor(a) > 0) - Number(priceMinor(b) > 0) || recent(a, b));
  else if (mode === "price") out.sort((a, b) => priceMinor(a) - priceMinor(b) || recent(a, b));
  else out.sort(recent);
  return out;
}

/** Packs of the same category, excluding the current one (most recent first). */
export function relatedPacks<T extends PackLike>(packs: T[], current: { id: string; category?: string | null }, limit = 3): T[] {
  if (!current.category) return [];
  return sortPacks(packs.filter((p) => p.id !== current.id && p.category === current.category), "recent").slice(0, limit);
}

/* ── assets ── */
export const ASSET_ORDER = ["document", "board", "mesh", "script"] as const;
export type AssetLike = { assetType: string; logicalKey: string; displayName: string | null; orderIndex: number };

export function groupAssets<T extends AssetLike>(assets: T[]): Array<{ type: string; count: number; items: Array<{ name: string; asset: T }> }> {
  const groups = new Map<string, T[]>();
  for (const asset of assets) groups.set(asset.assetType, [...(groups.get(asset.assetType) ?? []), asset]);
  const rank = (type: string) => {
    const i = (ASSET_ORDER as readonly string[]).indexOf(type);
    return i === -1 ? ASSET_ORDER.length : i;
  };
  return [...groups.entries()]
    .sort((a, b) => rank(a[0]) - rank(b[0]) || a[0].localeCompare(b[0]))
    .map(([type, list]) => ({
      type,
      count: list.length,
      items: [...list].sort((a, b) => a.orderIndex - b.orderIndex).map((asset) => ({ name: asset.displayName?.trim() || asset.logicalKey, asset })),
    }));
}

/* ── image validation (client side; the backend validates again) ── */
export type ImageUrlResult = { ok: true; url: string } | { ok: false; reason: "empty" | "invalid" | "protocol" | "tooLong" };

export function validateImageUrl(raw: string): ImageUrlResult {
  const url = raw.trim();
  if (!url) return { ok: false, reason: "empty" };
  if (url.length > 2048) return { ok: false, reason: "tooLong" };
  if (/^\/uploads\/[^\s]+$/.test(url)) return { ok: true, url };
  if (/^data:/i.test(url)) return /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(url) ? { ok: true, url } : { ok: false, reason: "protocol" };
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, reason: "invalid" };
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return { ok: false, reason: "protocol" };
  if (parsed.username || parsed.password) return { ok: false, reason: "invalid" };
  return { ok: true, url };
}

export type ImageFileResult = { ok: true } | { ok: false; reason: "type" | "size" | "empty" };
export function validateImageFile(file: { type: string; size: number }): ImageFileResult {
  if (!(IMAGE_MIME_TYPES as readonly string[]).includes(file.type)) return { ok: false, reason: "type" };
  if (file.size <= 0) return { ok: false, reason: "empty" };
  if (file.size > MAX_IMAGE_BYTES) return { ok: false, reason: "size" };
  return { ok: true };
}

/* ── presentation editor helpers ── */
export function normalizeTag(raw: string): string {
  return normalizeText(raw).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24);
}

export function addTag(tags: string[], raw: string): string[] {
  const tag = normalizeTag(raw);
  if (!tag || tags.includes(tag) || tags.length >= MAX_TAGS) return tags;
  return [...tags, tag];
}

export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/** Returns an error code, or null when the category is acceptable (empty means "no category"). */
export function validateCategory(slug: string): "invalid" | null {
  const value = slug.trim();
  return value === "" || CATEGORY_SLUG_RE.test(value) ? null : "invalid";
}

/** "Otra" text typed by the author -> a valid slug candidate. */
export function slugifyCategory(raw: string): string {
  return normalizeText(raw).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32);
}

/* ── ?install=<packId> ── */
export function parseInstallParam(search: string): string | null {
  const id = new URLSearchParams(search).get("install");
  return id && /^[0-9A-Za-z_-]{1,64}$/.test(id) ? id : null;
}
