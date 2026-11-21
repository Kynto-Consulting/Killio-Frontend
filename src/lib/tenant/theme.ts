import { PURPLE_CLASSES } from "./purple-classes.ts";
import type { PublicTenantConfig } from "./types";

// The backend already validates these, but the string ends up inside a <style>
// tag, so it is checked again here: only known-safe shapes are ever emitted.
const VAR_NAME = /^[a-z][a-z-]*$/;
const VAR_NAME_FREE = /^[a-z][a-z0-9-]{0,40}$/;
const HSL_TRIPLET = /^\d{1,3}(\.\d+)? \d{1,3}(\.\d+)?% \d{1,3}(\.\d+)?%$/;
const RADIUS = /^\d+(\.\d+)?(rem|px)$/;
const FONT_FAMILY = /^[A-Za-z0-9][A-Za-z0-9 -]{0,39}$/;
const FONT_URL = /^(https:\/\/|\/(?!\/))[A-Za-z0-9._~:/?#@!$&*+,;=%-]+\.(woff2|woff|ttf|otf)(\?[A-Za-z0-9._~:/@!$&*+,;=%-]*)?$/i;
const FONT_FORMAT: Record<string, string> = { woff2: "woff2", woff: "woff", ttf: "truetype", otf: "opentype" };

function fontCss(theme: PublicTenantConfig["theme"]): string {
  if (!theme.fontFamily || !FONT_FAMILY.test(theme.fontFamily)) return "";
  const family = theme.fontFamily;
  const faces = theme.fonts
    .filter((f) => Number.isInteger(f.weight) && f.weight >= 100 && f.weight <= 900 && FONT_URL.test(f.url))
    .map((f) => {
      const ext = f.url.split("?")[0].split(".").pop()!.toLowerCase();
      return `@font-face{font-family:"${family}";font-weight:${f.weight};font-style:normal;font-display:swap;src:url("${f.url}") format("${FONT_FORMAT[ext]}");}`;
    })
    .join("");
  const stack = `"${family}",ui-sans-serif,system-ui,sans-serif`;
  return `${faces}body,button,input,textarea,select{font-family:${stack};}`;
}

const FREE_VAR_VALUE = /^[A-Za-z0-9#%.,()/ +*-]{1,80}$/;

function freeDeclarations(vars: Record<string, string> | undefined): string {
  return Object.entries(vars ?? {})
    .filter(([name, value]) => VAR_NAME_FREE.test(name) && FREE_VAR_VALUE.test(value) && !/url\(|expression|javascript:/i.test(value))
    .map(([name, value]) => `--${name}:${value};`)
    .join("");
}

/** The stylesheet is injected into a <style> tag, so anything that could escape it or load code is dropped. */
function safeCustomCss(css: string | undefined): string {
  if (!css || css.length > 20000) return "";
  if (css.includes("<") || css.includes("\\")) return "";
  if (/@import|@charset|@namespace|javascript:|expression\s*\(|behavior\s*:|-moz-binding/i.test(css)) return "";
  const urlCalls = [...css.matchAll(/url\(/gi)].length;
  const urls = [...css.matchAll(/url\(\s*(['"]?)([^)'"\s]*)\1\s*\)/gi)];
  if (urls.length !== urlCalls) return "";
  if (!urls.every((m) => /^(https:\/\/|\/(?!\/))/.test(m[2]))) return "";
  return css;
}

/**
 * Font files to preload. Without it the browser only finds the font after it has parsed the CSS and met the
 * first text that uses it, so the page paints in the fallback font first and then jumps (a visible
 * "micro-shift"). At most three files, regular weights first.
 */
export function tenantFontPreloads(config: PublicTenantConfig): Array<{ href: string; type: string }> {
  if (config.mode !== "tenant" || !config.theme.fontFamily || !FONT_FAMILY.test(config.theme.fontFamily)) return [];
  const TYPE: Record<string, string> = { woff2: "font/woff2", woff: "font/woff", ttf: "font/ttf", otf: "font/otf" };
  return config.theme.fonts
    .filter((f) => Number.isInteger(f.weight) && f.weight >= 100 && f.weight <= 900 && FONT_URL.test(f.url))
    .sort((a, b) => Math.abs(a.weight - 500) - Math.abs(b.weight - 500))
    .slice(0, 3)
    .map((f) => ({ href: f.url, type: TYPE[f.url.split("?")[0].split(".").pop()!.toLowerCase()] }));
}

function declarations(vars: Record<string, string>): string {
  return Object.entries(vars)
    .filter(([name, value]) => VAR_NAME.test(name) && HSL_TRIPLET.test(value))
    .map(([name, value]) => `--${name}:${value};`)
    .join("");
}

// ── violet / purple / indigo / fuchsia follow the brand ──────────────────────────────────────────────────────────────
// Many components were written with a fixed purple palette. In tenant mode every one of those classes is redrawn with the
// brand's primary colour (lighter shades mix it with white, darker ones with black), so no purple survives next to a blue brand.
// The class list comes from the source (see purple-classes.ts and its test), so nothing here guesses.

/** How much of the brand colour each shade keeps, and what it is mixed with (white for light shades, black for dark ones). */
const SHADE_MIX: Record<number, { pct: number; with: "white" | "black" }> = {
  50: { pct: 8, with: "white" },
  100: { pct: 15, with: "white" },
  200: { pct: 30, with: "white" },
  300: { pct: 50, with: "white" },
  400: { pct: 75, with: "white" },
  500: { pct: 92, with: "white" },
  600: { pct: 100, with: "white" },
  700: { pct: 84, with: "black" },
  800: { pct: 68, with: "black" },
  900: { pct: 52, with: "black" },
  950: { pct: 38, with: "black" },
};

const PURPLE_CLASS = /^((?:[a-z0-9-]+:)*)(bg|text|border|ring|from|via|to|fill|stroke|shadow|outline|decoration|accent|caret)-(violet|purple|indigo|fuchsia)-(\d{2,3})(?:\/(\d{1,3}))?$/;
const VARIANT_SELECTOR: Record<string, (cls: string) => string> = {
  "": (c) => `html .${c}`,
  hover: (c) => `html .${c}:hover`,
  focus: (c) => `html .${c}:focus`,
  "focus-visible": (c) => `html .${c}:focus-visible`,
  dark: (c) => `html.dark .${c}`,
  "dark:hover": (c) => `html.dark .${c}:hover`,
  selection: (c) => `html .${c} ::selection,html .${c}::selection`,
};

const cssEscape = (cls: string): string => cls.replace(/[:/]/g, (ch) => `\\${ch}`);

function brandShade(shade: number, opacity: number | null): string {
  const mix = SHADE_MIX[shade] ?? SHADE_MIX[500];
  const base = mix.pct >= 100 ? "hsl(var(--primary))" : `color-mix(in srgb, hsl(var(--primary)) ${mix.pct}%, ${mix.with})`;
  return opacity === null ? base : `color-mix(in srgb, ${base} ${opacity}%, transparent)`;
}

function declarationFor(utility: string, color: string): string {
  switch (utility) {
    case "bg": return `background-color:${color};`;
    case "text": return `color:${color};`;
    case "border": return `border-color:${color};`;
    case "ring": return `--tw-ring-color:${color};`;
    case "fill": return `fill:${color};`;
    case "stroke": return `stroke:${color};`;
    case "outline": return `outline-color:${color};`;
    case "decoration": return `text-decoration-color:${color};`;
    case "accent": return `accent-color:${color};`;
    case "caret": return `caret-color:${color};`;
    case "shadow": return `--tw-shadow-color:${color};--tw-shadow:var(--tw-shadow-colored);`;
    case "from": return `--tw-gradient-from:${color} var(--tw-gradient-from-position);--tw-gradient-to:transparent var(--tw-gradient-to-position);--tw-gradient-stops:var(--tw-gradient-from),var(--tw-gradient-to);`;
    case "via": return `--tw-gradient-stops:var(--tw-gradient-from),${color} var(--tw-gradient-via-position),var(--tw-gradient-to);`;
    case "to": return `--tw-gradient-to:${color} var(--tw-gradient-to-position);`;
    default: return "";
  }
}

/** One rule per purple class the app uses, redrawn in the brand colour. Exported for tests. */
export function purpleOverrideCss(classes: readonly string[] = PURPLE_CLASSES): string {
  const rules: string[] = [];
  for (const cls of classes) {
    const m = PURPLE_CLASS.exec(cls);
    if (!m) continue;
    const variant = m[1].replace(/:$/, "");
    const selector = VARIANT_SELECTOR[variant];
    if (!selector) continue;
    const decl = declarationFor(m[2], brandShade(Number(m[4]), m[5] === undefined ? null : Number(m[5])));
    if (decl) rules.push(`${selector(cssEscape(cls))}{${decl}}`);
  }
  return rules.join("");
}

/** CSS that re-paints the app. Empty in public mode, so killio.dev is untouched. */
export function buildTenantThemeCss(config: PublicTenantConfig): string {
  if (config.mode !== "tenant") return "";
  const light = declarations(config.theme.light) + freeDeclarations(config.theme.vars?.light);
  const dark = declarations(config.theme.dark) + freeDeclarations(config.theme.vars?.dark);
  const radius = config.theme.radius && RADIUS.test(config.theme.radius) ? `--radius:${config.theme.radius};` : "";
  const parts: string[] = [];
  if (light || radius) parts.push(`:root{${light}${radius}}`);
  if (dark) parts.push(`.dark{${dark}}`);
  // Killio uses `text-accent` for links and highlighted text. In most brand palettes `accent` is a soft
  // background tint, so as a text colour it can be unreadable. In tenant mode that text follows --link,
  // falling back to the brand's primary colour.
  // Tokens for colours written inline in components (see globals.css) follow the tenant palette.
  parts.push(":root:root{--ink:var(--foreground);--surface-deep:var(--background);--accent-ink:var(--link,var(--primary));--accent-ink-fg:var(--primary-foreground);}");
  const linkColor = "hsl(var(--link,var(--primary)))";
  parts.push(`html .text-accent,html .hover\\:text-accent:hover,html .group:hover .group-hover\\:text-accent{color:${linkColor};}`);
  for (const alpha of [40, 50, 70, 80, 90]) {
    parts.push(`html .text-accent\\/${alpha}{color:hsl(var(--link,var(--primary)) / ${alpha / 100});}`);
  }
  parts.push(purpleOverrideCss());
  const font = fontCss(config.theme);
  if (font) parts.push(font);
  const custom = safeCustomCss(config.theme.customCss);
  if (custom) parts.push(custom);
  return parts.join("");
}

/** Does the document start in dark mode? "system" is resolved in the browser by an inline script. */
export function initialHtmlClass(config: PublicTenantConfig): string {
  if (config.mode !== "tenant") return "dark";
  return config.theme.defaultMode === "light" ? "" : "dark";
}

export const SYSTEM_THEME_SCRIPT =
  "document.documentElement.classList.toggle('dark',window.matchMedia('(prefers-color-scheme: dark)').matches)";
