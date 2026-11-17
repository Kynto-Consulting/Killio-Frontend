/**
 * Board theme tokens, shared by Kanban boards and mesh boards.
 *
 * The default preset used to be dark only (near-black surface, near-white text), no matter
 * what background the board had or whether the app itself was light. On a white board that
 * left a dark header and white-on-white controls ("Add another list"). The tokens now follow
 * the real background (and the app's theme when the board has none), so a white board gets
 * dark text, dark borders and a readable accent.
 */

export type BoardAppearanceLike = {
  backgroundKind?: "none" | "preset" | "image" | "color" | "gradient";
  backgroundValue?: string | null;
  backgroundImageUrl?: string | null;
  backgroundGradient?: string | null;
  themeKind?: "preset" | "custom";
  themePreset?: string | null;
  themeCustom?: Record<string, unknown>;
};

export type BoardThemeTokens = {
  accent: string;
  accentForeground: string;
  surface: string;
  surfaceStrong: string;
  text: string;
  border: string;
  panel: string;
  panelStrong: string;
  buttonGhost: string;
};

export type BoardThemeContext = {
  /** The app itself is rendered with a light theme (e.g. a white-label tenant). */
  appIsLight?: boolean;
  /** Accent used by the automatic light theme. Defaults to blue. */
  lightAccent?: string;
};

export const DEFAULT_LIGHT_ACCENT = "#2563eb";

export const THEME_PRESET_COLORS: Record<string, { accent: string; surface: string }> = {
  "killio-default": { accent: "#d8ff72", surface: "#0b0f14" },
  "killio-light": { accent: DEFAULT_LIGHT_ACCENT, surface: "#ffffff" },
  "trello-ocean": { accent: "#67e8f9", surface: "#0c2233" },
  "trello-forest": { accent: "#86efac", surface: "#10251f" },
  "trello-sunrise": { accent: "#fcd34d", surface: "#3b1f10" },
};

export function normalizeHexColor(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (!/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(trimmed)) return fallback;
  if (trimmed.length === 7) return trimmed.toLowerCase();
  const r = trimmed[1];
  const g = trimmed[2];
  const b = trimmed[3];
  return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const normalized = normalizeHexColor(hex, "#000000");
  return {
    r: parseInt(normalized.slice(1, 3), 16),
    g: parseInt(normalized.slice(3, 5), 16),
    b: parseInt(normalized.slice(5, 7), 16),
  };
}

export function rgbaFromHex(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function mixHex(base: string, target: string, ratio: number): string {
  const clamped = Math.max(0, Math.min(1, ratio));
  const a = hexToRgb(base);
  const b = hexToRgb(target);
  const r = Math.round(a.r + (b.r - a.r) * clamped);
  const g = Math.round(a.g + (b.g - a.g) * clamped);
  const bValue = Math.round(a.b + (b.b - a.b) * clamped);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${bValue.toString(16).padStart(2, "0")}`;
}

export function isLightColor(hex: string): boolean {
  const { r, g, b } = hexToRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62;
}

/** "210 100% 50%" (the CSS-variable format used by the tenant palette) -> "#0080ff". */
export function hslTripletToHex(triplet: string | null | undefined, fallback = DEFAULT_LIGHT_ACCENT): string {
  const match = typeof triplet === "string" ? triplet.trim().match(/^(\d+(?:\.\d+)?) (\d+(?:\.\d+)?)% (\d+(?:\.\d+)?)%$/) : null;
  if (!match) return fallback;
  const h = Number(match[1]) % 360;
  const s = Math.min(100, Number(match[2])) / 100;
  const l = Math.min(100, Number(match[3])) / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const to = (v: number) => Math.round(v * 255).toString(16).padStart(2, "0");
  return `#${to(f(0))}${to(f(8))}${to(f(4))}`;
}

function colorFromCss(value: string): string | null {
  const hex = value.match(/#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/);
  if (hex) return normalizeHexColor(hex[0], "#000000");
  const rgb = value.match(/rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})/);
  if (rgb) {
    const to = (n: string) => Math.max(0, Math.min(255, Number(n))).toString(16).padStart(2, "0");
    return `#${to(rgb[1])}${to(rgb[2])}${to(rgb[3])}`;
  }
  return null;
}

const LIGHT_TAILWIND_BG = /^bg-(?:white|(?:slate|gray|zinc|neutral|stone)-(?:50|100|200))$/;

/**
 * What the board background looks like. "app" = no background chosen, so it follows the app theme;
 * "unknown" (images, odd values) is treated as dark.
 */
export function backgroundTone(appearance: BoardAppearanceLike): "light" | "dark" | "app" {
  const kind = appearance.backgroundKind;
  if (kind === "image" && appearance.backgroundImageUrl) return "dark";

  if (kind === "gradient" && appearance.backgroundGradient) {
    const colors = [...appearance.backgroundGradient.matchAll(/#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b|rgba?\([^)]*\)/g)]
      .map((m) => colorFromCss(m[0]))
      .filter((c): c is string => Boolean(c));
    if (colors.length > 0) return colors.every(isLightColor) ? "light" : "dark";
    return LIGHT_TAILWIND_BG.test(appearance.backgroundGradient) ? "light" : "dark";
  }

  if ((kind === "color" || kind === "preset") && appearance.backgroundValue) {
    const color = colorFromCss(appearance.backgroundValue);
    if (color) return isLightColor(color) ? "light" : "dark";
    return LIGHT_TAILWIND_BG.test(appearance.backgroundValue) ? "light" : "dark";
  }

  return "app";
}

export function resolveThemeTokens(appearance: BoardAppearanceLike, context: BoardThemeContext = {}): BoardThemeTokens {
  const presetKey = appearance.themePreset && THEME_PRESET_COLORS[appearance.themePreset] ? appearance.themePreset : "killio-default";
  const isCustom = appearance.themeKind === "custom";
  const custom = isCustom ? appearance.themeCustom : undefined;
  const lightAccent = normalizeHexColor(context.lightAccent, DEFAULT_LIGHT_ACCENT);

  // The default preset adapts to its surroundings; a preset or custom colours the user picked are kept as chosen.
  const tone = backgroundTone(appearance);
  const adaptToLight = !isCustom && presetKey === "killio-default" && (tone === "light" || (tone === "app" && Boolean(context.appIsLight)));
  const preset = adaptToLight ? { accent: lightAccent, surface: "#ffffff" } : THEME_PRESET_COLORS[presetKey];
  const usesLightPreset = presetKey === "killio-light";

  const accent = normalizeHexColor(custom?.accent, usesLightPreset && !adaptToLight ? lightAccent : preset.accent);
  const surface = normalizeHexColor(custom?.surface, preset.surface);
  const light = isLightColor(surface);
  const isClassicPreset = !isCustom && (presetKey === "killio-default" || usesLightPreset);

  return {
    accent,
    accentForeground: isLightColor(accent) ? "#0f172a" : "#f8fafc",
    surface,
    surfaceStrong: light ? mixHex(surface, "#000000", 0.04) : mixHex(surface, "#ffffff", 0.04),
    text: light ? "#111827" : "#f8fafc",
    border: isClassicPreset ? (light ? mixHex(surface, "#000000", 0.14) : mixHex(surface, "#ffffff", 0.1)) : rgbaFromHex(accent, 0.35),
    panel: rgbaFromHex(surface, light ? 0.85 : 0.68),
    panelStrong: rgbaFromHex(surface, light ? 0.94 : 0.84),
    buttonGhost: rgbaFromHex(accent, light ? 0.12 : 0.14),
  };
}
