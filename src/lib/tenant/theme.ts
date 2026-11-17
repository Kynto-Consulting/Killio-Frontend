import type { PublicTenantConfig } from "./types";

// The backend already validates these, but the string ends up inside a <style>
// tag, so it is checked again here: only known-safe shapes are ever emitted.
const VAR_NAME = /^[a-z][a-z-]*$/;
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

function declarations(vars: Record<string, string>): string {
  return Object.entries(vars)
    .filter(([name, value]) => VAR_NAME.test(name) && HSL_TRIPLET.test(value))
    .map(([name, value]) => `--${name}:${value};`)
    .join("");
}

/** CSS that re-paints the app. Empty in public mode, so killio.dev is untouched. */
export function buildTenantThemeCss(config: PublicTenantConfig): string {
  if (config.mode !== "tenant") return "";
  const light = declarations(config.theme.light);
  const dark = declarations(config.theme.dark);
  const radius = config.theme.radius && RADIUS.test(config.theme.radius) ? `--radius:${config.theme.radius};` : "";
  const parts: string[] = [];
  if (light || radius) parts.push(`:root{${light}${radius}}`);
  if (dark) parts.push(`.dark{${dark}}`);
  // Killio uses `text-accent` for links and highlighted text. In most brand palettes `accent` is a soft
  // background tint, so as a text colour it can be unreadable. In tenant mode that text follows --link,
  // falling back to the brand's primary colour.
  const linkColor = "hsl(var(--link,var(--primary)))";
  parts.push(`html .text-accent,html .hover\\:text-accent:hover,html .group:hover .group-hover\\:text-accent{color:${linkColor};}`);
  for (const alpha of [40, 50, 70, 80, 90]) {
    parts.push(`html .text-accent\\/${alpha}{color:hsl(var(--link,var(--primary)) / ${alpha / 100});}`);
  }
  const font = fontCss(config.theme);
  if (font) parts.push(font);
  return parts.join("");
}

/** Does the document start in dark mode? "system" is resolved in the browser by an inline script. */
export function initialHtmlClass(config: PublicTenantConfig): string {
  if (config.mode !== "tenant") return "dark";
  return config.theme.defaultMode === "light" ? "" : "dark";
}

export const SYSTEM_THEME_SCRIPT =
  "document.documentElement.classList.toggle('dark',window.matchMedia('(prefers-color-scheme: dark)').matches)";
