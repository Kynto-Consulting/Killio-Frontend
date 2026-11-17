// LaTeX → text-brick translator.
//
// The text brick keeps LaTeX as *source* inside its markdown. This module turns
// that source into (a) text where inline commands became the brick's own tokens
// (`**x**`, `[color:red]x[/color]`, …) and (b) a list of atomic blocks
// (equations, tables, lists, theorems, …) that the brick renders as HTML. Every
// block remembers its original source so editing round-trips losslessly.
//
// Pure: no DOM, no KaTeX. Rendering of math / inline text is injected via
// `LatexRenderEnv`, which keeps this file testable under `node --test`.

import { formatAngle, formatNumber, formatUnit } from "./siunitx.ts";

export type LatexMacros = Record<string, string>;
export type LatexLocale = "es" | "en";

export interface LatexOptions {
  locale?: string;
  /** Downloaded online packages, keyed by the reference used in the source. */
  remote?: Record<string, string>;
}

export interface LatexRenderEnv {
  /** Inline text (already LaTeX-converted, may contain `$math$`) → HTML. */
  inline: (s: string) => string;
  math: (formula: string, display: boolean) => string;
  escape: (s: string) => string;
  escapeAttr: (s: string) => string;
}

export interface PreparedLatex {
  /** Input with blocks swapped for `\x00LB<n>\x00` lines and inline commands converted. */
  text: string;
  blockCount: number;
  /** KaTeX macros collected from \newcommand / \def / \DeclareMathOperator. */
  macros: LatexMacros;
  /** Packages named in \usepackage{...}; the renderer maps them to KaTeX macro sets. */
  packages: string[];
  /** Online package references (\usepackage{https://…}, \input{/latex-packages/…}). */
  remoteUrls: string[];
  renderBlock: (index: number, env: LatexRenderEnv) => string;
}

export const LATEX_BLOCK_LINE = /^\x00LB(\d+)\x00$/;

// ───────────────────────── model ─────────────────────────

type LatexNode = { t: "text"; text: string } | { t: "block"; block: LatexBlock };

interface ColSpec { align: "left" | "center" | "right"; bl: boolean; br: boolean }
interface Cell { nodes: LatexNode[]; colspan: number; rowspan: number; align?: "left" | "center" | "right"; bg?: string; bl?: boolean; br?: boolean }
interface Row { cells: Cell[]; ruleAbove: number; ruleKind: "thin" | "thick"; bg?: string }
interface TableModel { cols: ColSpec[]; rows: Row[]; ruleBottom: boolean; bottomThick: boolean }
interface ListItem { label: string; nodes: LatexNode[] }
interface ListModel { kind: "itemize" | "enumerate" | "description" | "bibliography"; items: ListItem[] }
interface BoxModel {
  variant: string;
  title?: string;
  number?: string;
  nodes: LatexNode[];
  columns?: number;
  fontSize?: string;
  heading?: string;
  upright?: boolean;
}
interface FloatModel { floatKind: "figure" | "table" | "algorithm"; number: string; caption: string; nodes: LatexNode[] }
interface AlgoLine { indent: number; text: string; num?: number }

type LatexBlock =
  | { kind: "math"; src: string; formula: string }
  | { kind: "heading"; src: string; level: number; number: string; title: string }
  | { kind: "table"; src: string; table: TableModel }
  | { kind: "list"; src: string; list: ListModel }
  | { kind: "box"; src: string; box: BoxModel }
  | { kind: "float"; src: string; float: FloatModel }
  | { kind: "code"; src: string; code: string; lang: string }
  | { kind: "algo"; src: string; lines: AlgoLine[] }
  | { kind: "preamble"; src: string }
  | { kind: "embed"; src: string; docId: string; title: string };

interface Ctx {
  locale: LatexLocale;
  counters: Record<string, number>;
  sec: number[]; // chapter, section, subsection, subsubsection
  hasChapter: boolean;
  eqWithinSection: boolean;
  labels: Record<string, { num: string; kind: string }>;
  macros: LatexMacros;
  packages: string[];
  remoteUrls: string[];
  /** Source text removed from the body (preamble, comments…); kept so editing never deletes it. */
  hidden: string[];
  theorems: Record<string, { title: string; group: string; numbered: boolean; upright: boolean }>;
  enumDepth: number;
  itemDepth: number;
  footnotes: number;
  stack: Array<{ num: string; kind: string }>;
}

// ───────────────────────── i18n ─────────────────────────

const NAMES: Record<LatexLocale, Record<string, string>> = {
  en: {
    figure: "Figure", table: "Table", equation: "Equation", section: "Section", abstract: "Abstract", proof: "Proof",
    theorem: "Theorem", lemma: "Lemma", proposition: "Proposition", corollary: "Corollary", claim: "Claim",
    conjecture: "Conjecture", definition: "Definition", example: "Example", remark: "Remark", note: "Note",
    exercise: "Exercise", problem: "Problem", solution: "Solution", cite: "Reference", algorithm: "Algorithm", require: "Require", ensure: "Ensure",
  },
  es: {
    figure: "Figura", table: "Tabla", equation: "Ecuación", section: "Sección", abstract: "Resumen", proof: "Demostración",
    theorem: "Teorema", lemma: "Lema", proposition: "Proposición", corollary: "Corolario", claim: "Afirmación",
    conjecture: "Conjetura", definition: "Definición", example: "Ejemplo", remark: "Observación", note: "Nota",
    exercise: "Ejercicio", problem: "Problema", solution: "Solución", cite: "Referencia", algorithm: "Algoritmo", require: "Requiere", ensure: "Asegura",
  },
};

const THEOREM_GROUP: Record<string, string> = {
  theorem: "theorem", lemma: "theorem", proposition: "theorem", corollary: "theorem", claim: "theorem", conjecture: "theorem",
  definition: "definition", example: "example", remark: "remark", note: "note", exercise: "exercise", problem: "problem",
};
const UPRIGHT_THEOREMS = new Set(["definition", "example", "remark", "note", "exercise", "problem", "solution"]);

// ───────────────────────── string helpers ─────────────────────────

const NUL = "\x00";

/** Index of the `}` that closes the `{` at `open`, or -1. Skips escaped braces. */
function matchBrace(s: string, open: number): number {
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    const c = s[i];
    if (c === "\\") { i++; continue; }
    if (c === "{") depth++;
    else if (c === "}") { depth--; if (depth === 0) return i; }
  }
  return -1;
}

function matchBracket(s: string, open: number): number {
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    const c = s[i];
    if (c === "\\") { i++; continue; }
    if (c === "{") { const j = matchBrace(s, i); if (j === -1) return -1; i = j; continue; }
    if (c === "[") depth++;
    else if (c === "]") { depth--; if (depth === 0) return i; }
  }
  return -1;
}

function skipSpaces(s: string, i: number, newlines = false): number {
  while (i < s.length && (s[i] === " " || s[i] === "\t" || (newlines && (s[i] === "\n" || s[i] === "\r")))) i++;
  return i;
}

function readGroup(s: string, i: number, newlines = false): { content: string; end: number } | null {
  const k = skipSpaces(s, i, newlines);
  if (s[k] !== "{") return null;
  const j = matchBrace(s, k);
  if (j === -1) return null;
  return { content: s.slice(k + 1, j), end: j + 1 };
}

function readOptional(s: string, i: number, newlines = false): { content: string; end: number } | null {
  const k = skipSpaces(s, i, newlines);
  if (s[k] !== "[") return null;
  const j = matchBracket(s, k);
  if (j === -1) return null;
  return { content: s.slice(k + 1, j), end: j + 1 };
}

/** Reads args per spec: 'o' optional [..], 'm' mandatory {..}. Missing optionals → "". */
function readArgs(s: string, i: number, spec: string): { args: string[]; end: number } {
  const args: string[] = [];
  let pos = i;
  for (const ch of spec) {
    if (ch === "o") {
      const o = readOptional(s, pos, true);
      if (o) { args.push(o.content); pos = o.end; } else args.push("");
    } else {
      const m = readGroup(s, pos, true);
      if (m) { args.push(m.content); pos = m.end; } else args.push("");
    }
  }
  return { args, end: pos };
}

function findEnd(text: string, from: number, name: string): number {
  const open = `\\begin{${name}}`;
  const close = `\\end{${name}}`;
  let depth = 1;
  let i = from;
  while (i < text.length) {
    const o = text.indexOf(open, i);
    const c = text.indexOf(close, i);
    if (c === -1) return -1;
    if (o !== -1 && o < c) { depth++; i = o + open.length; continue; }
    depth--;
    if (depth === 0) return c;
    i = c + close.length;
  }
  return -1;
}

/**
 * Splits at top level (outside braces, nested environments and math) on `\\` rows,
 * `&` cells, or a token command such as `\item`.
 */
function splitTop(s: string, mode: "row" | "cell" | { token: string }): string[] {
  const parts: string[] = [];
  let last = 0;
  let brace = 0;
  let env = 0;
  let i = 0;
  const token = typeof mode === "object" ? mode.token : null;
  while (i < s.length) {
    const c = s[i];
    if (c === "$") {
      const dbl = s[i + 1] === "$";
      const close = dbl ? s.indexOf("$$", i + 2) : s.indexOf("$", i + 1);
      const nl = s.indexOf("\n", i + 1);
      if (close !== -1 && (dbl || nl === -1 || close < nl)) { i = close + (dbl ? 2 : 1); continue; }
      i++; continue;
    }
    if (c === "{") { brace++; i++; continue; }
    if (c === "}") { brace = Math.max(0, brace - 1); i++; continue; }
    if (c === "\\") {
      if (s.startsWith("\\begin{", i)) { env++; i += 7; continue; }
      if (s.startsWith("\\end{", i)) { env = Math.max(0, env - 1); i += 5; continue; }
      if (mode === "row" && s[i + 1] === "\\" && brace === 0 && env === 0) {
        parts.push(s.slice(last, i));
        i += 2;
        if (s[i] === "*") i++;
        const o = readOptional(s, i);
        if (o) i = o.end;
        last = i;
        continue;
      }
      if (token && brace === 0 && env === 0 && s.startsWith(token, i) && !/[A-Za-z]/.test(s[i + token.length] || "")) {
        parts.push(s.slice(last, i));
        i += token.length;
        last = i;
        continue;
      }
      // escape or control word: skip it whole so `\&` never reads as a cell break
      if (/[A-Za-z]/.test(s[i + 1] || "")) { i++; while (/[A-Za-z]/.test(s[i] || "")) i++; }
      else i += 2;
      continue;
    }
    if (mode === "cell" && c === "&" && brace === 0 && env === 0) {
      parts.push(s.slice(last, i));
      i++;
      last = i;
      continue;
    }
    i++;
  }
  parts.push(s.slice(last));
  return parts;
}

function mathSpans(text: string): Array<[number, number]> {
  const spans: Array<[number, number]> = [];
  const re = /\$\$[\s\S]*?\$\$|\$[^$\n]+?\$/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) spans.push([m.index, m.index + m[0].length]);
  return spans;
}

function toRoman(n: number): string {
  const map: Array<[number, string]> = [[1000, "m"], [900, "cm"], [500, "d"], [400, "cd"], [100, "c"], [90, "xc"], [50, "l"], [40, "xl"], [10, "x"], [9, "ix"], [5, "v"], [4, "iv"], [1, "i"]];
  let out = "";
  let rest = n;
  for (const [v, s] of map) while (rest >= v) { out += s; rest -= v; }
  return out || String(n);
}

function toAlpha(n: number): string {
  let out = "";
  let x = n;
  while (x > 0) { x--; out = String.fromCharCode(97 + (x % 26)) + out; x = Math.floor(x / 26); }
  return out || String(n);
}

function formatCounter(n: number, style: string): string {
  switch (style) {
    case "alph": return toAlpha(n);
    case "Alph": return toAlpha(n).toUpperCase();
    case "roman": return toRoman(n);
    case "Roman": return toRoman(n).toUpperCase();
    default: return String(n);
  }
}

const SUP: Record<string, string> = { "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹", "+": "⁺", "-": "⁻", "n": "ⁿ" };
const SUB: Record<string, string> = { "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄", "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉", "+": "₊", "-": "₋" };
const mapChars = (s: string, m: Record<string, string>): string | null => {
  let out = "";
  for (const ch of s) { if (!m[ch]) return null; out += m[ch]; }
  return out;
};

const ACCENTS: Record<string, string> = { "'": "́", "`": "̀", "^": "̂", '"': "̈", "~": "̃" };

// ───────────────────────── inline conversion ─────────────────────────

const WRAP1: Record<string, [string, string]> = {
  textbf: ["**", "**"], bfseries: ["**", "**"], mathbf: ["**", "**"],
  textit: ["*", "*"], emph: ["*", "*"], textsl: ["*", "*"], mathit: ["*", "*"],
  underline: ["__", "__"], uline: ["__", "__"], ul: ["__", "__"],
  sout: ["~~", "~~"], st: ["~~", "~~"], xout: ["~~", "~~"],
};
const PLAIN1 = new Set(["textsc", "textsf", "textrm", "textnormal", "textup", "textmd", "text", "mbox", "hbox", "mathrm", "texorpdfstring"]);
const DROP_ARG = new Set(["label", "index", "glossary", "thispagestyle", "pagestyle", "vspace", "hspace", "vskip", "hskip", "addcontentsline", "setlength", "bibliographystyle", "bibliography", "phantom", "hphantom", "vphantom", "enlargethispage"]);
const NOARG: Record<string, string> = {
  par: "\n\n", newline: "\n", linebreak: "\n", noindent: "", centering: "", raggedright: "", raggedleft: "", hfill: " ", vfill: "",
  quad: " ", qquad: "  ", enspace: " ", smallskip: "", medskip: "", bigskip: "", newpage: "", clearpage: "", pagebreak: "", nopagebreak: "",
  LaTeX: "LaTeX", TeX: "TeX", ldots: "…", dots: "…", textellipsis: "…", cdots: "⋯", textbackslash: "\\", textbar: "|",
  textasciitilde: "~", textasciicircum: "^", textquotedblleft: "“", textquotedblright: "”", textquoteleft: "‘", textquoteright: "’",
  copyright: "©", textcopyright: "©", S: "§", P: "¶", dag: "†", ddag: "‡", pounds: "£", textsterling: "£", euro: "€", texteuro: "€",
  textbullet: "•", textregistered: "®", texttrademark: "™", textdegree: "°", ss: "ß", ae: "æ", AE: "Æ", oe: "œ", OE: "Œ", aa: "å", AA: "Å",
  maketitle: "", tableofcontents: "", listoffigures: "", listoftables: "", appendix: "", frontmatter: "", mainmatter: "", backmatter: "",
  hline: "", toprule: "", midrule: "", bottomrule: "", normalfont: "", rmfamily: "", sffamily: "", upshape: "", mdseries: "", normalsize: "",
};
const SIZE: Record<string, string> = {
  tiny: "0.6rem", scriptsize: "0.7rem", footnotesize: "0.8rem", small: "0.9rem", large: "1.2rem", Large: "1.4rem", LARGE: "1.7rem", huge: "2rem", Huge: "2.4rem",
};
const STYLE_DECL: Record<string, [string, string]> = {
  bf: ["**", "**"], bfseries: ["**", "**"], it: ["*", "*"], itshape: ["*", "*"], em: ["*", "*"], sl: ["*", "*"], slshape: ["*", "*"],
};

const SAFE_COLOR = /^[#A-Za-z0-9(),.% ]+$/;

// dvips / xcolor names that CSS does not know.
const XCOLOR: Record<string, string> = {
  Apricot: "#FFAD7A", Aquamarine: "#00B5BE", Bittersweet: "#C04F17", BlueGreen: "#00B3B8", BlueViolet: "#473992", BrickRed: "#B6321C",
  Brown: "#792500", BurntOrange: "#F7921D", CadetBlue: "#74729A", CarnationPink: "#F282B4", Cerulean: "#00A2E3", CornflowerBlue: "#41B0E4",
  Dandelion: "#FDBC42", DarkOrchid: "#A4538A", Emerald: "#00A99D", ForestGreen: "#009B55", Fuchsia: "#8C368C", Goldenrod: "#FFDF42",
  GreenYellow: "#DFE674", JungleGreen: "#00A99A", Lavender: "#F49EC4", LimeGreen: "#8DC73E", Mahogany: "#A9341F", Maroon: "#AF3235",
  Melon: "#F89E7B", MidnightBlue: "#006795", Mulberry: "#A93C93", NavyBlue: "#006EB8", OliveGreen: "#3C8031", OrangeRed: "#ED135A",
  Orchid: "#AF72B0", Peach: "#F7965A", Periwinkle: "#7977B8", PineGreen: "#008B72", Plum: "#92268F", ProcessBlue: "#00B0F0",
  RawSienna: "#974006", RedOrange: "#F26035", RedViolet: "#A1246B", Rhodamine: "#EF559F", RoyalBlue: "#0071BC", RoyalPurple: "#613F99",
  RubineRed: "#ED017D", Salmon: "#F69289", SeaGreen: "#3FBC9D", Sepia: "#671800", SkyBlue: "#46C5DD", SpringGreen: "#C6DC67",
  TealBlue: "#00AEB3", Thistle: "#D883B7", Turquoise: "#00B4CE", VioletRed: "#EF58A0", WildStrawberry: "#EE2967", YellowGreen: "#98CC70",
  YellowOrange: "#FAA21A",
};
const DARK_NAMES = new Set(["black", "blue", "navy", "navyblue", "darkblue", "maroon", "purple", "brown", "darkgreen", "green", "teal", "midnightblue", "royalblue", "violet", "indigo", "darkred", "red"]);

function luminance(color: string): number | null {
  const m = color.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})/i);
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].split("").map((c) => c + c).join("") : m[1];
  const [r, g, b] = [0, 2, 4].map((k) => parseInt(h.slice(k, k + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Readable text colour on top of a background (LaTeX would print black). */
export function contrastText(bg: string): string {
  const lum = luminance(bg);
  if (lum !== null) return lum < 0.45 ? "#ffffff" : "#111111";
  return DARK_NAMES.has(bg.trim().toLowerCase()) ? "#ffffff" : "#111111";
}

function xcolorName(name: string): string | null {
  const n = name.trim();
  if (XCOLOR[n]) return XCOLOR[n];
  return /^[A-Za-z]+$/.test(n) ? n.toLowerCase() : null;
}
const SAFE_URL = /^(https?:|mailto:)/i;

function wrapLines(txt: string, open: string, close: string): string {
  return txt
    .split("\n")
    .map((line) => {
      if (!line.trim() || line.includes(NUL)) return line;
      const m = line.match(/^(\s*)([\s\S]*?)(\s*)$/);
      return m ? `${m[1]}${open}${m[2]}${close}${m[3]}` : line;
    })
    .join("\n");
}

function resolveColor(model: string, spec: string): string | null {
  const m = model.trim().toLowerCase();
  if (m === "html") return /^[0-9a-f]{3,8}$/i.test(spec.trim()) ? `#${spec.trim()}` : null;
  if (m === "rgb") {
    const p = spec.split(",").map((x) => Number(x.trim()));
    if (p.length !== 3 || p.some((x) => Number.isNaN(x))) return null;
    const mx = Math.max(...p) <= 1 ? 255 : 1;
    return `rgb(${p.map((x) => Math.round(x * mx)).join(",")})`;
  }
  // xcolor mixes: red!30  /  red!50!blue
  const mix = spec.trim().match(/^([A-Za-z]+)!(\d{1,3})(?:!([A-Za-z]+))?$/);
  if (mix) {
    const a = xcolorName(mix[1]);
    const b = mix[3] ? xcolorName(mix[3]) : "white";
    return a && b ? `color-mix(in srgb, ${a} ${Math.min(100, Number(mix[2]))}%, ${b})` : null;
  }
  if (!SAFE_COLOR.test(spec)) return null;
  return /^[A-Za-z]+$/.test(spec.trim()) ? xcolorName(spec) : spec.trim();
}

function refText(ctx: Ctx, key: string, mode: "ref" | "eqref" | "auto"): string {
  const l = ctx.labels[key.trim()];
  if (!l) return "??";
  if (mode === "eqref") return `(${l.num})`;
  if (mode === "auto") return `${NAMES[ctx.locale][l.kind] || ctx.theorems[l.kind]?.title || ""} ${l.num}`.trim();
  return l.num;
}

function convertInline(s: string, ctx: Ctx): string {
  if (!s.includes("\\")) return s;
  return conv(s, ctx);
}

function conv(s: string, ctx: Ctx): string {
  let out = "";
  let i = 0;
  const n = s.length;
  while (i < n) {
    const c = s[i];

    if (c === "$") {
      const dbl = s[i + 1] === "$";
      const close = dbl ? s.indexOf("$$", i + 2) : s.indexOf("$", i + 1);
      const nl = s.indexOf("\n", i + 1);
      if (close !== -1 && (dbl || nl === -1 || close < nl)) {
        const end = close + (dbl ? 2 : 1);
        out += s.slice(i, end);
        i = end;
        continue;
      }
      out += c; i++; continue;
    }

    if (c === "{") {
      const j = matchBrace(s, i);
      if (j !== -1) {
        const inner = s.slice(i + 1, j);
        if (inner.includes("\\")) { out += conv(inner, ctx); i = j + 1; continue; }
      }
      out += c; i++; continue;
    }

    if (c !== "\\") { out += c; i++; continue; }

    const next = s[i + 1];
    if (next === undefined) { out += "\\"; i++; continue; }

    if (!/[A-Za-z]/.test(next)) {
      switch (next) {
        case "\\": {
          i += 2;
          if (s[i] === "*") i++;
          const o = readOptional(s, i);
          if (o) i = o.end;
          out += "\n";
          continue;
        }
        case "%": case "&": case "#": case "_": case "{": case "}": out += next; i += 2; continue;
        case "$": out += "&#36;"; i += 2; continue;
        case " ": case "\n": out += " "; i += 2; continue;
        case ",": out += " "; i += 2; continue;
        case ";": case ":": case ">": out += " "; i += 2; continue;
        case "!": case "/": case "@": case "-": i += 2; continue;
        case "(": {
          const j = s.indexOf("\\)", i + 2);
          if (j === -1) { out += "\\("; i += 2; continue; }
          out += `$${s.slice(i + 2, j)}$`;
          i = j + 2;
          continue;
        }
        case "[": {
          const j = s.indexOf("\\]", i + 2);
          if (j === -1) { out += "\\["; i += 2; continue; }
          out += `$$${s.slice(i + 2, j)}$$`;
          i = j + 2;
          continue;
        }
        default: {
          if (ACCENTS[next]) {
            let k = i + 2;
            let letter = "";
            if (s[k] === "{") { const j = matchBrace(s, k); if (j !== -1) { letter = s.slice(k + 1, j); k = j + 1; } }
            else if (/[A-Za-z]/.test(s[k] || "")) { letter = s[k]; k++; }
            if (letter.length === 1) { out += (letter + ACCENTS[next]).normalize("NFC"); i = k; continue; }
          }
          out += "\\" + next; i += 2; continue;
        }
      }
    }

    // control word
    let j = i + 1;
    while (j < n && /[A-Za-z]/.test(s[j])) j++;
    const name = s.slice(i + 1, j);

    if (name === "verb") {
      const delim = s[j];
      const close = delim ? s.indexOf(delim, j + 1) : -1;
      if (close !== -1) { out += "`" + s.slice(j + 1, close) + "`"; i = close + 1; continue; }
    }

    if (WRAP1[name]) {
      const g = readGroup(s, j);
      if (g) { const [o, cl] = WRAP1[name]; out += wrapLines(conv(g.content, ctx), o, cl); i = g.end; continue; }
    }

    if (name === "texttt" || name === "lstinline") {
      const g = readGroup(s, j);
      if (g) { out += "`" + g.content.replace(/`/g, "'") + "`"; i = g.end; continue; }
    }

    if (PLAIN1.has(name)) {
      const g = readGroup(s, j);
      if (g) { out += conv(g.content, ctx); i = g.end; continue; }
    }

    if (name === "textsuperscript" || name === "textsubscript") {
      const g = readGroup(s, j);
      if (g) {
        const m = mapChars(g.content, name === "textsuperscript" ? SUP : SUB);
        out += m ?? (name === "textsuperscript" ? `^(${g.content})` : `_(${g.content})`);
        i = g.end;
        continue;
      }
    }

    if (name === "textcolor" || name === "colorbox" || name === "fcolorbox") {
      const o = readOptional(s, j);
      const startArgs = o ? o.end : j;
      const a = readArgs(s, startArgs, name === "fcolorbox" ? "mmm" : "mm");
      const colorSpec = name === "fcolorbox" ? a.args[1] : a.args[0];
      const body = name === "fcolorbox" ? a.args[2] : a.args[1];
      const color = resolveColor(o ? o.content : "", colorSpec);
      const inner = conv(body, ctx);
      if (color && name === "textcolor") out += wrapLines(inner, `[color:${color}]`, "[/color]");
      else if (color) out += wrapLines(inner, `[bg:${color}][color:${contrastText(color)}]`, "[/color][/bg]");
      else out += inner;
      i = a.end;
      continue;
    }

    if (name === "href") {
      const a = readArgs(s, j, "mm");
      const label = conv(a.args[1], ctx);
      out += SAFE_URL.test(a.args[0].trim()) ? wrapLines(label, `[link:${a.args[0].trim()}]`, "[/link]") : label;
      i = a.end;
      continue;
    }
    if (name === "url") {
      const g = readGroup(s, j);
      if (g) { out += SAFE_URL.test(g.content.trim()) ? g.content.trim() : g.content; i = g.end; continue; }
    }

    if (name === "footnote" || name === "footnotetext") {
      const g = readGroup(s, j);
      if (g) {
        const num = ++ctx.footnotes;
        out += ` [size:0.85em](${num}: ${conv(g.content, ctx).replace(/\n+/g, " ")})[/size]`;
        i = g.end;
        continue;
      }
    }

    if (name === "cite" || name === "citep" || name === "citet" || name === "nocite") {
      const o = readOptional(s, j);
      const g = readGroup(s, o ? o.end : j);
      if (g) {
        const shown = name === "nocite" ? "" : `[${g.content.split(",").map((k) => ctx.labels[k.trim()]?.num ?? k.trim()).join(", ")}]`;
        out += atom(s.slice(i, g.end), shown, name === "nocite");
        i = g.end;
        continue;
      }
    }

    if (name === "ref" || name === "eqref" || name === "autoref" || name === "cref" || name === "Cref" || name === "nameref" || name === "pageref") {
      const g = readGroup(s, j);
      if (g) {
        const shown = name === "pageref" ? "?" : refText(ctx, g.content, name === "eqref" ? "eqref" : name === "autoref" || name === "cref" || name === "Cref" ? "auto" : "ref");
        out += atom(s.slice(i, g.end), shown);
        i = g.end;
        continue;
      }
    }

    if (name === "includegraphics") {
      const o = readOptional(s, j);
      const g = readGroup(s, o ? o.end : j);
      if (g) {
        const path = g.content.trim();
        out += /^(https?:|data:image|asset:|\/)/i.test(path) ? `![](${path})` : `[img: ${path}]`;
        i = g.end;
        continue;
      }
    }

    if (name === "multicolumn") { const a = readArgs(s, j, "mmm"); out += conv(a.args[2], ctx); i = a.end; continue; }
    if (name === "multirow") {
      const o = readOptional(s, j);
      const a = readArgs(s, o ? o.end : j, "mm");
      const last = readGroup(s, a.end);
      if (last) { out += conv(last.content, ctx); i = last.end; continue; }
    }

    if (name === "num" || name === "SI" || name === "si" || name === "qty" || name === "unit" || name === "ang" || name === "numrange" || name === "SIrange") {
      const o = readOptional(s, j);
      const spec = name === "SIrange" ? "mmm" : name === "SI" || name === "qty" || name === "numrange" ? "mm" : "m";
      const a = readArgs(s, o ? o.end : j, spec);
      const nbsp = "\u00A0";
      let txt: string;
      if (name === "num") txt = formatNumber(a.args[0]);
      else if (name === "si" || name === "unit") txt = formatUnit(a.args[0]);
      else if (name === "ang") txt = formatAngle(a.args[0]);
      else if (name === "numrange") txt = `${formatNumber(a.args[0])} – ${formatNumber(a.args[1])}`;
      else if (name === "SIrange") txt = `${formatNumber(a.args[0])} – ${formatNumber(a.args[1])}${nbsp}${formatUnit(a.args[2])}`;
      else txt = `${formatNumber(a.args[0])}${nbsp}${formatUnit(a.args[1])}`;
      out += atom(s.slice(i, a.end), txt);
      i = a.end;
      continue;
    }

    if (name === "Return" || name === "True" || name === "False" || name === "And" || name === "Or" || name === "Not") {
      const word = name === "Return" ? "return " : name.toLowerCase() === "and" ? "and" : name.toLowerCase();
      out += `**${word.trim()}**${name === "Return" || name === "Not" ? " " : ""}`;
      i = skipSpaces(s, j);
      continue;
    }

    if (name === "Comment") {
      const g = readGroup(s, j);
      if (g) { out += ` ▷ ${conv(g.content, ctx)}`; i = g.end; continue; }
    }

    if (DROP_ARG.has(name)) {
      let k = j;
      if (s[k] === "*") k++;
      const g = readGroup(s, k);
      if (g) {
        // \label / \index / \vspace… draw nothing, but must survive an edit of the surrounding text
        out += name === "hspace" || name === "hskip" ? atom(s.slice(i, g.end), " ") : atom(s.slice(i, g.end), "", true);
        i = g.end;
        continue;
      }
    }

    if (name === "today") { out += atom("\\today", new Date().toLocaleDateString(ctx.locale === "es" ? "es-ES" : "en-US", { year: "numeric", month: "long", day: "numeric" })); i = j; continue; }
    if (name === "item") { out += "\n- "; i = skipSpaces(s, j); continue; }

    if (name === "color") {
      const o = readOptional(s, j);
      const a = readArgs(s, o ? o.end : j, "m");
      const color = resolveColor(o ? o.content : "", a.args[0]);
      const rest = conv(s.slice(a.end), ctx);
      out += color ? wrapLines(rest, `[color:${color}]`, "[/color]") : rest;
      i = n;
      continue;
    }
    // Declarations swallow the whitespace after the control word, like TeX does.
    if (SIZE[name]) { out += wrapLines(conv(s.slice(skipSpaces(s, j)), ctx), `[size:${SIZE[name]}]`, "[/size]"); i = n; continue; }
    if (STYLE_DECL[name]) { const [o, cl] = STYLE_DECL[name]; out += wrapLines(conv(s.slice(skipSpaces(s, j)), ctx), o, cl); i = n; continue; }

    if (name in NOARG) {
      out += NOARG[name];
      i = skipSpaces(s, j);
      if (s.startsWith("{}", i)) i += 2; // `\LaTeX{}` idiom
      continue;
    }

    out += "\\" + name;
    i = j;
  }
  return out;
}

// ───────────────────────── numbering ─────────────────────────

/** Takes `removed` out of the text but remembers it: the brick re-emits it verbatim when saving. */
function hide(ctx: Ctx, removed: string): string {
  ctx.hidden.push(removed);
  return `${NUL}LP${ctx.hidden.length - 1}${NUL}${removed.endsWith("\n") ? "\n" : ""}`;
}

const attrEscape = (v: string): string => v.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * A command whose rendering loses information (\ref → "1", \SI → "9.81 m"…). It is emitted
 * as an inline atom that remembers its source, so editing the text around it keeps the command.
 */
function atom(src: string, rendered: string, hiddenAtom = false): string {
  return `<span data-latex-inline="1" data-latex-src="${attrEscape(src)}" contenteditable="false"${hiddenAtom ? ' style="display:none"' : ""}>${attrEscape(rendered)}</span>`;
}

function bump(ctx: Ctx, key: string): number {
  ctx.counters[key] = (ctx.counters[key] || 0) + 1;
  return ctx.counters[key];
}

function nextEquation(ctx: Ctx): string {
  const n = bump(ctx, "equation");
  return ctx.eqWithinSection ? `${ctx.sec[1] || 0}.${n}` : String(n);
}

function headingNumber(ctx: Ctx, level: number): string {
  const start = ctx.hasChapter ? 0 : 1;
  return ctx.sec.slice(start, level + 1).join(".");
}

function registerLabels(text: string, ctx: Ctx): void {
  const top = ctx.stack[ctx.stack.length - 1];
  if (!top) return;
  const re = /\\label\{([^}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) ctx.labels[m[1].trim()] = { num: top.num, kind: top.kind };
}

// ───────────────────────── block building ─────────────────────────

const MATH_NUMBERED = new Set(["equation", "align", "alignat", "gather", "flalign", "multline", "eqnarray"]);
const MATH_PLAIN = new Set(["displaymath", "math", "split", "array", "matrix", "pmatrix", "bmatrix", "Bmatrix", "vmatrix", "Vmatrix", "smallmatrix", "cases", "aligned", "gathered", "alignedat", "CD"]);
const TABULAR = new Set(["tabular", "tabular*", "tabularx", "tabulary", "longtable"]);
const LISTS = new Set(["itemize", "enumerate", "description", "thebibliography"]);
const CODE_ENVS = new Set(["verbatim", "verbatim*", "Verbatim", "lstlisting", "minted"]);
const FLOATS = new Set(["figure", "figure*", "table", "table*", "wrapfigure", "wraptable", "sidewaysfigure", "sidewaystable", "algorithm", "algorithm*"]);
const ALGO_ENVS = new Set(["algorithmic"]);
const SIMPLE_BOXES = new Set(["quote", "quotation", "verse", "center", "flushleft", "flushright", "abstract", "proof", "solution", "minipage", "multicols", "multicols*", "framed", "mdframed", "tcolorbox", "tiny", "scriptsize", "footnotesize", "small", "large", "Large", "LARGE", "huge", "Huge"]);

function isKnownEnv(name: string, ctx: Ctx): boolean {
  const base = name.endsWith("*") ? name.slice(0, -1) : name;
  return (
    Boolean(ctx.theorems[base]) || ALGO_ENVS.has(name) ||
    MATH_NUMBERED.has(base) || MATH_PLAIN.has(base) || TABULAR.has(name) || LISTS.has(name) || CODE_ENVS.has(name) ||
    FLOATS.has(name) || SIMPLE_BOXES.has(name) || SIMPLE_BOXES.has(base) || Boolean(THEOREM_GROUP[base])
  );
}

function parseNodes(text: string, ctx: Ctx): LatexNode[] {
  const sink: LatexBlock[] = [];
  const replaced = scan(text, ctx, sink);
  const nodes: LatexNode[] = [];
  const re = /\x00LB(\d+)\x00/g;
  let last = 0;
  let m: RegExpExecArray | null;
  const pushText = (chunk: string) => {
    registerLabels(chunk, ctx);
    if (chunk.trim()) nodes.push({ t: "text", text: chunk.replace(/^\n+|\n+$/g, "") });
  };
  while ((m = re.exec(replaced))) {
    pushText(replaced.slice(last, m.index));
    nodes.push({ t: "block", block: sink[Number(m[1])] });
    last = m.index + m[0].length;
  }
  pushText(replaced.slice(last));
  return nodes;
}

function buildMath(env: string, body: string, src: string, ctx: Ctx): LatexBlock {
  const starred = env.endsWith("*");
  const base = starred ? env.slice(0, -1) : env;
  const numbered = !starred && MATH_NUMBERED.has(base);

  const numberRow = (row: string, allowNumber: boolean): string => {
    const labels = [...row.matchAll(/\\label\{([^}]*)\}/g)].map((m) => m[1].trim());
    let r = row.replace(/\\label\{[^}]*\}/g, "");
    const skip = /\\(nonumber|notag)\b/.test(r);
    r = r.replace(/\\(nonumber|notag)\b/g, "");
    if (!r.trim()) return r;
    const explicit = r.match(/\\tag\*?\{([^}]*)\}/);
    if (explicit) { for (const l of labels) ctx.labels[l] = { num: explicit[1], kind: "equation" }; return r; }
    if (!allowNumber || skip) return r;
    const num = nextEquation(ctx);
    for (const l of labels) ctx.labels[l] = { num, kind: "equation" };
    return `${r.trimEnd()}\\tag{${num}}`;
  };

  let formula: string;
  if (base === "equation" || base === "displaymath" || base === "math") {
    formula = numberRow(body, numbered).trim();
  } else if (base === "multline") {
    formula = `\\begin{gathered}${body.replace(/\\label\{[^}]*\}/g, "").replace(/\\(nonumber|notag)\b/g, "")}\\end{gathered}`;
    if (numbered) {
      const labels = [...body.matchAll(/\\label\{([^}]*)\}/g)].map((m) => m[1].trim());
      const num = nextEquation(ctx);
      for (const l of labels) ctx.labels[l] = { num, kind: "equation" };
      formula += `\\tag{${num}}`;
    }
  } else if (base === "align" || base === "alignat" || base === "gather" || base === "flalign" || base === "eqnarray") {
    const rows = splitTop(body, "row");
    const mapped = rows
      .map((r) => {
        let row = r;
        if (base === "eqnarray") row = row.replace(/&\s*([^&]*?)\s*&/, "&$1 ");
        return numberRow(row, numbered);
      })
      .filter((r, idx, all) => r.trim() || idx < all.length - 1);
    const kw = base === "gather" ? "gather*" : base === "alignat" ? "alignat*" : "align*";
    formula = `\\begin{${kw}}${mapped.join("\\\\")}\\end{${kw}}`;
  } else {
    // bare matrices / cases / split … written outside $$: show them as display math
    formula = `\\begin{${env}}${body.replace(/\\label\{[^}]*\}/g, "")}\\end{${env}}`;
  }
  return { kind: "math", src, formula };
}

const RULE_CMD = /^\s*\\(hline|toprule|midrule|bottomrule|cline|cmidrule|specialrule|hdashline|endhead|endfirsthead|endfoot|endlastfoot|rowcolor|noalign)\b/;

function parseColSpec(spec: string): ColSpec[] {
  const cols: ColSpec[] = [];
  let border = false;
  let i = 0;
  while (i < spec.length) {
    const c = spec[i];
    if (c === "|") { border = true; i++; continue; }
    if (c === " " || c === "\n") { i++; continue; }
    if (c === "l" || c === "c" || c === "r" || c === "X" || c === "S" || c === "p" || c === "m" || c === "b" || c === "L" || c === "C" || c === "R") {
      const align = c === "c" || c === "C" ? "center" : c === "r" || c === "R" || c === "S" ? "right" : "left";
      cols.push({ align, bl: border, br: false });
      border = false;
      i++;
      if ((c === "p" || c === "m" || c === "b") && spec[i] === "{") { const j = matchBrace(spec, i); i = j === -1 ? i + 1 : j + 1; }
      continue;
    }
    if (c === "*") {
      const a = readArgs(spec, i + 1, "mm");
      const times = Math.min(Number(a.args[0]) || 0, 50);
      const sub = parseColSpec(a.args[1]);
      for (let t = 0; t < times; t++) for (const sc of sub) cols.push({ ...sc, bl: sc.bl || (border && t === 0 && sc === sub[0]) });
      border = false;
      i = a.end;
      continue;
    }
    if (c === "@" || c === "!" || c === ">" || c === "<") {
      const g = readGroup(spec, i + 1);
      i = g ? g.end : i + 1;
      continue;
    }
    i++;
  }
  if (border && cols.length) cols[cols.length - 1].br = true;
  return cols;
}

function buildTable(body: string, specRaw: string, src: string, ctx: Ctx): LatexBlock {
  const cols = parseColSpec(specRaw);
  const rawRows = splitTop(body, "row");
  const rows: Row[] = [];
  let ruleBottom = false;
  let bottomThick = false;
  const occupied = new Set<string>();

  for (let rIdx = 0; rIdx < rawRows.length; rIdx++) {
    let r = rawRows[rIdx];
    let ruleAbove = 0;
    let thick = false;
    let bg: string | undefined;
    for (;;) {
      const m = r.match(RULE_CMD);
      if (!m) break;
      let k = m[0].length;
      const cmd = m[1];
      if (cmd === "cline" || cmd === "cmidrule") {
        const o1 = readOptional(r, k); if (o1) k = o1.end;
        const p = r.slice(k).match(/^\s*\([^)]*\)/); if (p) k += p[0].length;
        const g = readGroup(r, k); if (g) k = g.end;
      } else if (cmd === "specialrule") { k = readArgs(r, k, "mmm").end; }
      else if (cmd === "rowcolor") {
        const o = readOptional(r, k); if (o) k = o.end;
        const g = readGroup(r, k); if (g) { k = g.end; if (SAFE_COLOR.test(g.content)) bg = g.content; }
      } else if (cmd === "noalign") { const g = readGroup(r, k); if (g) k = g.end; }
      else if (cmd === "toprule" || cmd === "midrule" || cmd === "bottomrule" || cmd === "hline" || cmd === "hdashline") {
        const o = readOptional(r, k); if (o) k = o.end;
      }
      if (cmd === "hline" || cmd === "toprule" || cmd === "midrule" || cmd === "bottomrule" || cmd === "hdashline" || cmd === "cmidrule" || cmd === "cline" || cmd === "specialrule") {
        ruleAbove++;
        if (cmd === "toprule" || cmd === "bottomrule") thick = true;
      }
      r = r.slice(k);
    }
    const isLast = rIdx === rawRows.length - 1;
    if (!r.trim()) {
      if (isLast && ruleAbove > 0) { ruleBottom = true; bottomThick = thick; }
      continue;
    }
    const rowIndex = rows.length;
    const rawCells = splitTop(r, "cell");
    const cells: Cell[] = [];
    let col = 0;
    for (const rawCell of rawCells) {
      // A column covered by a rowspan from above still has an (empty) placeholder
      // cell in the LaTeX source; consume it without emitting a <td>.
      if (occupied.has(`${rowIndex}:${col}`)) { col++; continue; }
      let text = rawCell.trim();
      let colspan = 1;
      let rowspan = 1;
      let align: Cell["align"];
      let cellBg: string | undefined;
      let cellBl: boolean | undefined;
      let cellBr: boolean | undefined;

      const cc = text.match(/^\\cellcolor(?:\[[^\]]*\])?\{([^}]*)\}\s*/);
      if (cc) { if (SAFE_COLOR.test(cc[1])) cellBg = cc[1]; text = text.slice(cc[0].length); }

      if (text.startsWith("\\multicolumn")) {
        const a = readArgs(text, "\\multicolumn".length, "mmm");
        if (text.slice(a.end).trim() === "") {
          colspan = Math.max(1, Number(a.args[0]) || 1);
          const spec = parseColSpec(a.args[1])[0];
          if (spec) { align = spec.align; cellBl = spec.bl; cellBr = spec.br; }
          text = a.args[2];
        }
      }
      if (text.startsWith("\\multirow")) {
        const o = readOptional(text, "\\multirow".length);
        const a = readArgs(text, o ? o.end : "\\multirow".length, "mm");
        const g = readGroup(text, a.end);
        if (g && text.slice(g.end).trim() === "") {
          rowspan = Math.max(1, Number(a.args[0]) || 1);
          text = g.content;
        }
      }

      for (let dr = 0; dr < rowspan; dr++) for (let dc = 0; dc < colspan; dc++) if (dr || dc) occupied.add(`${rowIndex + dr}:${col + dc}`);
      cells.push({ nodes: parseNodes(text, ctx), colspan, rowspan, align, bg: cellBg, bl: cellBl, br: cellBr });
      col += colspan;
    }
    rows.push({ cells, ruleAbove, ruleKind: thick ? "thick" : "thin", bg });
  }
  return { kind: "table", src, table: { cols, rows, ruleBottom, bottomThick } };
}

function parseEnumOptions(opt: string, depth: number): { style: string; prefix: string; suffix: string; start: number } {
  const defaults = [["arabic", "", "."], ["alph", "(", ")"], ["roman", "", "."], ["Alph", "", "."]][Math.min(depth, 3)];
  let style = defaults[0];
  let prefix = defaults[1];
  let suffix = defaults[2];
  let start = 1;
  for (const part of splitCommas(opt)) {
    const kv = part.match(/^\s*([A-Za-z*]+)\s*=\s*([\s\S]*)$/);
    if (kv) {
      if (kv[1] === "start") start = Number(kv[2]) || 1;
      else if (kv[1] === "label" || kv[1] === "label*") {
        const m = kv[2].match(/^([\s\S]*?)\\(arabic|alph|Alph|roman|Roman)\*([\s\S]*)$/);
        if (m) { prefix = m[1].replace(/^\{|\}$/g, ""); style = m[2]; suffix = m[3].replace(/^\{|\}$/g, ""); }
      }
    } else if (/^[^A-Za-z]*[1aAiI][^A-Za-z]*$/.test(part.trim())) {
      const m = part.match(/^([\s\S]*?)([1aAiI])([\s\S]*)$/);
      if (m) { prefix = m[1].trim(); style = m[2] === "1" ? "arabic" : m[2] === "a" ? "alph" : m[2] === "A" ? "Alph" : m[2] === "i" ? "roman" : "Roman"; suffix = m[3].trim(); }
    }
  }
  return { style, prefix, suffix, start };
}

function splitCommas(s: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let last = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "{") depth++;
    else if (s[i] === "}") depth--;
    else if (s[i] === "," && depth === 0) { parts.push(s.slice(last, i)); last = i + 1; }
  }
  parts.push(s.slice(last));
  return parts;
}

const BULLETS = ["•", "–", "∗", "·"];

function buildList(name: string, optRaw: string, body: string, src: string, ctx: Ctx): LatexBlock {
  const items: ListItem[] = [];
  if (name === "thebibliography") {
    const segs = splitTop(body, { token: "\\bibitem" }).slice(1);
    segs.forEach((seg, idx) => {
      const o = readOptional(seg, 0);
      const g = readGroup(seg, o ? o.end : 0);
      const key = g ? g.content.trim() : "";
      const num = String(idx + 1);
      if (key) ctx.labels[key] = { num: o ? o.content : num, kind: "cite" };
      items.push({ label: `[${o ? o.content : num}]`, nodes: parseNodes(g ? seg.slice(g.end) : seg, ctx) });
    });
    return { kind: "list", src, list: { kind: "bibliography", items } };
  }

  const isEnum = name === "enumerate";
  const depth = isEnum ? ctx.enumDepth : ctx.itemDepth;
  const enumOpts = isEnum ? parseEnumOptions(optRaw, depth) : null;
  if (isEnum) ctx.enumDepth++; else if (name === "itemize") ctx.itemDepth++;
  const segs = splitTop(body, { token: "\\item" }).slice(1);
  let counter = enumOpts ? enumOpts.start : 1;
  for (const seg of segs) {
    const o = readOptional(seg, 0, true);
    let label: string;
    let rest = seg;
    if (o) { label = o.content; rest = seg.slice(o.end); }
    else if (isEnum && enumOpts) { label = `${enumOpts.prefix}${formatCounter(counter, enumOpts.style)}${enumOpts.suffix}`; }
    else label = name === "itemize" ? BULLETS[Math.min(depth, 3)] : "";
    if (isEnum && !o) counter++;
    else if (isEnum && o) { /* custom label does not advance the counter (matches LaTeX \item[x]) */ }
    items.push({ label, nodes: parseNodes(rest, ctx) });
  }
  if (isEnum) ctx.enumDepth--; else if (name === "itemize") ctx.itemDepth--;
  return { kind: "list", src, list: { kind: name as ListModel["kind"], items } };
}

const ALGO_BLOCK_OPEN = new Set(["If", "For", "ForAll", "While", "Repeat", "Loop", "Function", "Procedure"]);

function buildAlgo(body: string, numbered: boolean, src: string, ctx: Ctx): LatexBlock {
  const lines: AlgoLine[] = [];
  let indent = 0;
  let n = 0;
  const kw = (w: string) => `**${w}**`;
  const push = (text: string, opts: { count?: boolean; before?: number; after?: number } = {}) => {
    indent = Math.max(0, indent - (opts.before ?? 0));
    const line: AlgoLine = { indent, text };
    if (numbered && opts.count !== false) line.num = ++n;
    lines.push(line);
    indent += opts.after ?? 0;
  };
  for (const raw of body.split("\n")) {
    const t = raw.trim();
    if (!t) continue;
    const m = t.match(/^\\([A-Za-z]+)\*?\s*([\s\S]*)$/);
    const cmd = m ? m[1] : "";
    const rest = m ? m[2] : t;
    const one = () => readArgs(rest, 0, "m");
    switch (cmd) {
      case "State": push(rest); break;
      case "Statex": push(rest, { count: false }); break;
      case "Require": case "Input": push(`${kw(NAMES[ctx.locale].require + ":")} ${rest}`, { count: false }); break;
      case "Ensure": case "Output": push(`${kw(NAMES[ctx.locale].ensure + ":")} ${rest}`, { count: false }); break;
      case "Return": push(`${kw("return")} ${rest}`); break;
      case "If": { const a = one(); push(`${kw("if")} ${a.args[0]} ${kw("then")}${rest.slice(a.end)}`, { after: 1 }); break; }
      case "ElsIf": { const a = one(); push(`${kw("else if")} ${a.args[0]} ${kw("then")}${rest.slice(a.end)}`, { before: 1, after: 1 }); break; }
      case "Else": push(`${kw("else")} ${rest}`, { before: 1, after: 1 }); break;
      case "EndIf": push(kw("end if"), { before: 1 }); break;
      case "For": { const a = one(); push(`${kw("for")} ${a.args[0]} ${kw("do")}${rest.slice(a.end)}`, { after: 1 }); break; }
      case "ForAll": { const a = one(); push(`${kw("for all")} ${a.args[0]} ${kw("do")}${rest.slice(a.end)}`, { after: 1 }); break; }
      case "EndFor": push(kw("end for"), { before: 1 }); break;
      case "While": { const a = one(); push(`${kw("while")} ${a.args[0]} ${kw("do")}${rest.slice(a.end)}`, { after: 1 }); break; }
      case "EndWhile": push(kw("end while"), { before: 1 }); break;
      case "Repeat": push(kw("repeat"), { after: 1 }); break;
      case "Until": { const a = one(); push(`${kw("until")} ${a.args[0]}`, { before: 1 }); break; }
      case "Loop": push(kw("loop"), { after: 1 }); break;
      case "EndLoop": push(kw("end loop"), { before: 1 }); break;
      case "Function": case "Procedure": {
        const a = readArgs(rest, 0, "mm");
        push(`${kw(cmd === "Function" ? "function" : "procedure")} ${a.args[0].toUpperCase() === a.args[0] ? a.args[0] : `\\textsc{${a.args[0]}}`}(${a.args[1]})`, { after: 1 });
        break;
      }
      case "EndFunction": push(kw("end function"), { before: 1 }); break;
      case "EndProcedure": push(kw("end procedure"), { before: 1 }); break;
      default:
        if (lines.length && !m) lines[lines.length - 1].text += ` ${t}`;
        else push(t);
    }
  }
  return { kind: "algo", src, lines };
}

function extractCaption(body: string): { caption: string; rest: string } {
  const idx = body.indexOf("\\caption");
  if (idx === -1) return { caption: "", rest: body };
  let k = idx + "\\caption".length;
  if (body[k] === "*") k++;
  const o = readOptional(body, k, true); if (o) k = o.end;
  const g = readGroup(body, k, true);
  if (!g) return { caption: "", rest: body };
  return { caption: g.content, rest: body.slice(0, idx) + body.slice(g.end) };
}

function buildEnv(name: string, text: string, afterBegin: number, endIdx: number, src: string, ctx: Ctx): LatexBlock {
  const base = name.endsWith("*") ? name.slice(0, -1) : name;
  const rawBody = text.slice(afterBegin, endIdx);

  if (MATH_NUMBERED.has(base) || MATH_PLAIN.has(base)) return buildMath(name, rawBody, src, ctx);

  if (TABULAR.has(name)) {
    const spec = name === "tabular" || name === "longtable" ? "om" : "mm";
    const a = readArgs(text, afterBegin, spec);
    return buildTable(text.slice(a.end, endIdx), a.args[spec.length - 1], src, ctx);
  }

  if (LISTS.has(name)) {
    const a = readArgs(text, afterBegin, name === "thebibliography" ? "m" : "o");
    return buildList(name, name === "thebibliography" ? "" : a.args[0], text.slice(a.end, endIdx), src, ctx);
  }

  if (ALGO_ENVS.has(name)) {
    const o = readOptional(text, afterBegin, true);
    return buildAlgo(text.slice(o ? o.end : afterBegin, endIdx), Boolean(o && o.content.trim()), src, ctx);
  }

  if (CODE_ENVS.has(name)) {
    let lang = "";
    let from = afterBegin;
    if (name === "lstlisting") { const o = readOptional(text, afterBegin, true); if (o) { from = o.end; lang = (o.content.match(/language\s*=\s*([\w+#-]+)/) || [])[1] || ""; } }
    if (name === "minted") { const a = readArgs(text, afterBegin, "om"); from = a.end; lang = a.args[1]; }
    return { kind: "code", src, code: text.slice(from, endIdx).replace(/^\r?\n/, "").replace(/\r?\n$/, ""), lang };
  }

  if (FLOATS.has(name)) {
    const floatKind: "figure" | "table" | "algorithm" = base.endsWith("table") ? "table" : base === "algorithm" ? "algorithm" : "figure";
    const a = readArgs(text, afterBegin, base.startsWith("wrap") ? "omm" : "o");
    const { caption, rest } = extractCaption(text.slice(a.end, endIdx));
    const num = String(bump(ctx, floatKind));
    ctx.stack.push({ num, kind: floatKind });
    const nodes = parseNodes(rest, ctx);
    const capLabels = caption ? [...rawBody.matchAll(/\\label\{([^}]*)\}/g)] : [];
    for (const m of capLabels) ctx.labels[m[1].trim()] = { num, kind: floatKind };
    ctx.stack.pop();
    return { kind: "float", src, float: { floatKind, number: num, caption, nodes } };
  }

  // boxes
  const custom = ctx.theorems[base];
  const group = custom ? custom.group : THEOREM_GROUP[base];
  let number: string | undefined;
  let title: string | undefined;
  let bodyStart = afterBegin;
  let columns: number | undefined;
  let fontSize: string | undefined;

  if (group) {
    if (custom ? custom.numbered : !name.endsWith("*")) number = String(bump(ctx, group));
    const o = readOptional(text, afterBegin, true);
    if (o) { title = o.content; bodyStart = o.end; }
  } else if (base === "minipage") { bodyStart = readArgs(text, afterBegin, "om").end; }
  else if (base === "multicols") { const a = readArgs(text, afterBegin, "m"); columns = Math.max(1, Math.min(6, Number(a.args[0]) || 2)); bodyStart = a.end; }
  else if (base === "mdframed" || base === "tcolorbox") { bodyStart = readArgs(text, afterBegin, "o").end; }
  else if (base === "proof") { const o = readOptional(text, afterBegin, true); if (o) { title = o.content; bodyStart = o.end; } }
  else if (SIZE[base] || base === "tiny") fontSize = SIZE[base];

  if (number) ctx.stack.push({ num: number, kind: base });
  const nodes = parseNodes(text.slice(bodyStart, endIdx), ctx);
  if (number) ctx.stack.pop();
  return { kind: "box", src, box: { variant: group ? `theorem:${base}` : base, title, number, nodes, columns, fontSize, heading: custom?.title, upright: custom?.upright } };
}

// ───────────────────────── scanner ─────────────────────────

/**
 * `\input{doc:UUID}` · `\include{doc:UUID}` · `\input{@[doc:UUID:Title]}` — insert another Killio
 * document in place. (`\input{/latex-packages/x.sty}` / `\input{https://…}` are online packages.)
 */
export const EMBED_RE = /\\(?:input|include)\s*\{\s*(?:@\[)?doc:([0-9A-Za-z][0-9A-Za-z-]{5,})(?::([^\]}]*))?\]?\s*\}/g;

/** Document ids referenced by `\input{doc:…}` in a text (used to know what to fetch). */
export function findEmbeddedDocIds(input: string): string[] {
  const found: string[] = [];
  for (const m of input.matchAll(EMBED_RE)) if (!found.includes(m[1])) found.push(m[1]);
  return found;
}

const SECTION_RE = /\\(chapter|section|subsection|subsubsection|paragraph|subparagraph)(\*?)\s*(?:\[[^\]\n]*\])?\s*\{/g;
const LEVELS: Record<string, number> = { chapter: 0, section: 1, subsection: 2, subsubsection: 3, paragraph: 4, subparagraph: 5 };

function scan(text: string, ctx: Ctx, sink: LatexBlock[]): string {
  const spans = mathSpans(text);
  const spanAt = (p: number): [number, number] | undefined => spans.find(([a, b]) => p >= a && p < b);
  let out = "";
  let i = 0;
  let pendingNl = false;

  const append = (chunk: string) => {
    if (pendingNl) {
      if (chunk.length && !chunk.startsWith("\n")) out += "\n";
      pendingNl = false;
    }
    out += chunk;
  };
  const emit = (block: LatexBlock) => {
    sink.push(block);
    if (out && !out.endsWith("\n")) out += "\n";
    out += `${NUL}LB${sink.length - 1}${NUL}`;
    pendingNl = true;
  };

  const nextBegin = (from: number): { idx: number; name: string; after: number } | null => {
    let pos = from;
    for (;;) {
      const idx = text.indexOf("\\begin{", pos);
      if (idx === -1) return null;
      const sp = spanAt(idx);
      if (sp) { pos = sp[1]; continue; }
      const close = text.indexOf("}", idx + 7);
      if (close === -1) return null;
      const name = text.slice(idx + 7, close);
      if (isKnownEnv(name, ctx)) return { idx, name, after: close + 1 };
      pos = idx + 7;
    }
  };
  const nextDisplay = (from: number): number => {
    let pos = from;
    for (;;) {
      const idx = text.indexOf("\\[", pos);
      if (idx === -1) return -1;
      if (text[idx - 1] === "\\" || spanAt(idx)) { pos = idx + 2; continue; }
      if (text.indexOf("\\]", idx + 2) === -1) return -1;
      return idx;
    }
  };
  const nextEmbed = (from: number): RegExpExecArray | null => {
    EMBED_RE.lastIndex = from;
    for (;;) {
      const m = EMBED_RE.exec(text);
      if (!m) return null;
      if (spanAt(m.index)) { EMBED_RE.lastIndex = m.index + 1; continue; }
      return m;
    }
  };
  const nextSection = (from: number): RegExpExecArray | null => {
    SECTION_RE.lastIndex = from;
    for (;;) {
      const m = SECTION_RE.exec(text);
      if (!m) return null;
      if (spanAt(m.index)) { SECTION_RE.lastIndex = m.index + 1; continue; }
      return m;
    }
  };

  while (i < text.length) {
    const b = nextBegin(i);
    const d = nextDisplay(i);
    const s = nextSection(i);
    const em = nextEmbed(i);
    const bi = b ? b.idx : Infinity;
    const di = d === -1 ? Infinity : d;
    const si = s ? s.index : Infinity;
    const ei = em ? em.index : Infinity;
    const first = Math.min(bi, di, si, ei);
    if (first === Infinity) { append(text.slice(i)); break; }
    append(text.slice(i, first));

    if (first === ei && em) {
      emit({ kind: "embed", src: em[0], docId: em[1], title: (em[2] ?? "").trim() });
      i = first + em[0].length;
      continue;
    }

    if (first === bi && b) {
      const end = findEnd(text, b.after, b.name);
      if (end === -1) { append(text.slice(first, b.after)); i = b.after; continue; }
      const endLen = `\\end{${b.name}}`.length;
      emit(buildEnv(b.name, text, b.after, end, text.slice(first, end + endLen), ctx));
      i = end + endLen;
      continue;
    }

    if (first === di) {
      const close = text.indexOf("\\]", di + 2);
      emit({ kind: "math", src: text.slice(di, close + 2), formula: text.slice(di + 2, close).trim() });
      i = close + 2;
      continue;
    }

    if (s) {
      const open = s.index + s[0].length - 1;
      const close = matchBrace(text, open);
      if (close === -1) { append(text.slice(first, open + 1)); i = open + 1; continue; }
      const level = LEVELS[s[1]];
      const starred = s[2] === "*";
      let number = "";
      if (level <= 3 && !starred) {
        if (level === 0) ctx.hasChapter = true;
        ctx.sec[level] = (ctx.sec[level] || 0) + 1;
        for (let k = level + 1; k < ctx.sec.length; k++) ctx.sec[k] = 0;
        if (level <= 1 && ctx.eqWithinSection) ctx.counters.equation = 0;
        number = headingNumber(ctx, level);
      }
      let end = close + 1;
      const lab = text.slice(end).match(/^\s*\\label\{([^}]*)\}/);
      if (lab) {
        if (number) ctx.labels[lab[1].trim()] = { num: number, kind: "section" };
        end += lab[0].length;
      }
      emit({ kind: "heading", src: text.slice(first, end), level, number, title: text.slice(open + 1, close) });
      i = end;
      continue;
    }
    i = first + 1;
  }
  return out;
}

// ───────────────────────── preamble / macros ─────────────────────────

const PREAMBLE_LINE = /^[ \t]*\\(documentclass|usepackage|RequirePackage|pagestyle|thispagestyle|geometry|setlength|bibliographystyle|bibliography|graphicspath|hypersetup|maketitle|tableofcontents|newpage|clearpage|appendix|author|date|institute|pagenumbering)\b[^\n]*(?:\n|$)/gm;

function extractMacros(text: string, ctx: Ctx): string {
  let out = "";
  let i = 0;
  const re = /\\(?:renew|provide)?newcommand\*?|\\DeclareMathOperator\*?|\\DeclarePairedDelimiter\*?|\\def(?=\s*\\)/g;
  for (;;) {
    re.lastIndex = i;
    const m = re.exec(text);
    if (!m) { out += text.slice(i); break; }
    out += text.slice(i, m.index);
    let k = m.index + m[0].length;
    const isDef = m[0] === "\\def";
    const isOp = m[0].startsWith("\\DeclareMathOperator");
    const isPair = m[0].startsWith("\\DeclarePairedDelimiter");
    k = skipSpaces(text, k, true);
    let name = "";
    if (text[k] === "{") { const g = readGroup(text, k, true); if (!g) { out += m[0]; i = m.index + m[0].length; continue; } name = g.content.trim(); k = g.end; }
    else { const nm = text.slice(k).match(/^\\[A-Za-z]+/); if (!nm) { out += m[0]; i = m.index + m[0].length; continue; } name = nm[0]; k += nm[0].length; }
    if (!/^\\[A-Za-z]+$/.test(name)) { out += text.slice(m.index, k); i = k; continue; }

    let body: string;
    if (isPair) {
      // the macro name was already consumed above; two delimiter groups remain
      const a = readArgs(text, k, "mm");
      if (!a.args[0] || !a.args[1]) { out += text.slice(m.index, k); i = k; continue; }
      body = `\\left${a.args[0]}#1\\right${a.args[1]}`;
      k = a.end;
    } else if (isOp) {
      const g = readGroup(text, k, true);
      if (!g) { out += text.slice(m.index, k); i = k; continue; }
      body = `\\operatorname${m[0].endsWith("*") ? "*" : ""}{${g.content}}`;
      k = g.end;
    } else if (isDef) {
      const params = text.slice(k).match(/^(?:#\d)*/)?.[0] ?? "";
      k += params.length;
      const g = readGroup(text, k, true);
      if (!g) { out += text.slice(m.index, k); i = k; continue; }
      body = g.content;
      k = g.end;
    } else {
      const o1 = readOptional(text, k, true);
      if (o1) k = o1.end;
      const o2 = o1 ? readOptional(text, k, true) : null;
      if (o2) k = o2.end;
      const g = readGroup(text, k, true);
      if (!g) { out += text.slice(m.index, k); i = k; continue; }
      body = g.content;
      k = g.end;
    }
    ctx.macros[name] = body;
    if (text[k] === "\n") k++;
    out += hide(ctx, text.slice(m.index, k));
    i = k;
  }
  return out;
}

const REMOTE_REF = /\\(?:usepackage|RequirePackage|input)(?:\[[^\]]*\])?\{((?:https?:\/\/|\/)[^}\s]+)\}/g;

/** Online package references found in a text (used to know what to download). */
export function findRemoteUrls(input: string): string[] {
  const found: string[] = [];
  for (const m of input.matchAll(REMOTE_REF)) if (!found.includes(m[1])) found.push(m[1]);
  return found;
}

function extractPackages(text: string, ctx: Ctx): string {
  return text.replace(/\\(?:usepackage|RequirePackage)(?:\[[^\]]*\])?\{([^}]*)\}[ \t]*\n?|\\input\{((?:https?:\/\/|\/)[^}\s]+)\}[ \t]*\n?/g, (m: string, names: string | undefined, input: string | undefined) => {
    for (const raw of (names ?? input ?? "").split(",")) {
      const n = raw.trim();
      if (!n) continue;
      if (/^(https?:\/\/|\/)/.test(n)) { if (!ctx.remoteUrls.includes(n)) ctx.remoteUrls.push(n); }
      else if (!ctx.packages.includes(n)) ctx.packages.push(n);
    }
    return hide(ctx, m);
  });
}

function extractTheorems(text: string, ctx: Ctx): string {
  let style = "plain";
  return text.replace(/\\theoremstyle\{(\w+)\}[ \t]*\n?|\\newtheorem(\*?)\{(\w+)\}(?:\[(\w+)\])?\{([^}]*)\}(?:\[(\w+)\])?[ \t]*\n?/g, (m: string, st: string | undefined, star: string | undefined, name: string | undefined, shared: string | undefined, title: string | undefined) => {
    if (st) { style = st; return hide(ctx, m); }
    if (!name) return hide(ctx, m);
    const groupOf = (x: string) => ctx.theorems[x]?.group ?? THEOREM_GROUP[x] ?? x;
    ctx.theorems[name] = { title: title ?? name, group: shared ? groupOf(shared) : name, numbered: !star, upright: style !== "plain" };
    return hide(ctx, m);
  });
}

function applyCounters(text: string, ctx: Ctx): string {
  return text
    .replace(/\\setcounter\{(\w+)\}\{(-?\d+)\}[ \t]*\n?/g, (m: string, name: string, v: string) => {
      const value = Number(v);
      if (name === "equation") ctx.counters.equation = value;
      else if (name === "section") ctx.sec[1] = value;
      else if (name === "subsection") ctx.sec[2] = value;
      else if (name === "figure") ctx.counters.figure = value;
      else if (name === "table") ctx.counters.table = value;
      return hide(ctx, m);
    })
    .replace(/\\numberwithin\{equation\}\{section\}[ \t]*\n?/g, (m: string) => { ctx.eqWithinSection = true; return hide(ctx, m); })
    .replace(/\\(?:begin|end)\{document\}[ \t]*\n?/g, (m: string) => hide(ctx, m));
}

function titleBlock(text: string): string {
  // \title{X} → heading line; leaves the rest to the normal pipeline.
  return text.replace(/\\title\{([^{}]*)\}[ \t]*\n?/g, (_, t: string) => `# ${t}\n`);
}

// ───────────────────────── rendering ─────────────────────────

const HEADING_CLASS: Record<number, [string, string]> = {
  0: ["h1", "text-3xl font-extrabold mb-4 mt-6 border-b border-border/50 pb-2 text-foreground tracking-tight"],
  1: ["h2", "text-2xl font-bold mb-3 mt-5 text-foreground/90 tracking-tight"],
  2: ["h3", "text-xl font-semibold mb-2 mt-4 text-foreground/80"],
  3: ["h4", "text-lg font-semibold mb-2 mt-3 text-foreground/75"],
  4: ["h5", "text-base font-semibold mb-1 mt-3 text-foreground/70"],
  5: ["h6", "text-sm font-semibold mb-1 mt-3 uppercase tracking-wide text-muted-foreground"],
};
const RULE_COLOR = "rgba(128,128,128,0.75)";

function makeRenderer(ctx: Ctx, blocks: LatexBlock[]) {
  const convert = (s: string) => convertInline(s, ctx);

  const renderNodes = (nodes: LatexNode[], env: LatexRenderEnv, inlineOnly: boolean): string => {
    const parts: string[] = [];
    for (const node of nodes) {
      if (node.t === "block") { parts.push(renderBlock(node.block, env)); continue; }
      // an invisible atom (\label…) must not leave an empty line behind
      const converted = convert(node.text).replace(/(<span data-latex-inline="1"[^>]*display:none"><\/span>)\n/g, "$1");
      const paras = converted.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
      for (const p of paras) {
        const html = p.split("\n").map((line) => env.inline(line)).join("<br>");
        parts.push(inlineOnly ? html : `<div class="mb-1 leading-relaxed">${html}</div>`);
      }
    }
    return inlineOnly ? parts.join("<br>") : parts.join("");
  };

  const attrs = (block: LatexBlock, env: LatexRenderEnv) => `contenteditable="false" data-latex-src="${env.escapeAttr(block.src)}" data-latex-kind="${block.kind}"`;

  function renderBlock(block: LatexBlock, env: LatexRenderEnv): string {
    switch (block.kind) {
      case "math":
        return `<div ${attrs(block, env)} class="my-4 px-1 render-math math-block w-full overflow-x-auto text-center" style="overflow-y:hidden">${env.math(block.formula, true)}</div>`;

      case "heading": {
        const [tag, cls] = HEADING_CLASS[block.level] || HEADING_CLASS[5];
        const num = block.number ? `<span style="margin-right:0.5em;opacity:0.55">${env.escape(block.number)}</span>` : "";
        return `<${tag} ${attrs(block, env)} class="${cls}">${num}${env.inline(convert(block.title))}</${tag}>`;
      }

      case "embed": {
        const label = ctx.locale === "es" ? "Documento incrustado" : "Embedded document";
        const title = block.title ? env.escape(block.title) : env.escape(block.docId);
        // data-embed-mount is filled by the text brick with the live, read-only document
        return `<div ${attrs(block, env)} data-latex-embed="${env.escapeAttr(block.docId)}" class="my-3 overflow-hidden rounded-lg border border-border/60 bg-muted/10"><div class="flex items-center gap-2 border-b border-border/50 bg-muted/20 px-3 py-1.5 text-xs text-muted-foreground"><span class="font-semibold uppercase tracking-wide opacity-70">${label}</span><a href="/d/${env.escapeAttr(block.docId)}" target="_blank" rel="noopener noreferrer" class="truncate font-medium text-foreground/80 underline decoration-dotted underline-offset-2">${title}</a></div><div data-embed-mount class="px-3 py-2"></div></div>`;
      }

      case "preamble": {
        const pkgs = [...block.src.matchAll(/\\(?:usepackage|RequirePackage)(?:\[[^\]]*\])?\{([^}]*)\}/g)].flatMap((m) => m[1].split(",").map((x) => x.trim()).filter(Boolean));
        const defs = (block.src.match(/\\(?:renew|provide)?newcommand|\\DeclareMathOperator|\\DeclarePairedDelimiter|\\def\b|\\newtheorem/g) || []).length;
        if (!pkgs.length && !defs && !/\\(?:input|setcounter|numberwithin)/.test(block.src)) {
          return `<div ${attrs(block, env)} style="display:none"></div>`; // comments only
        }
        const chip = (t: string) => `<span class="rounded bg-muted/50 px-1.5 py-px font-mono">${env.escape(t)}</span>`;
        const label = ctx.locale === "es" ? "LaTeX · preámbulo" : "LaTeX · preamble";
        const extra = defs ? chip(`${defs} ${ctx.locale === "es" ? (defs === 1 ? "definición" : "definiciones") : defs === 1 ? "definition" : "definitions"}`) : "";
        return `<div ${attrs(block, env)} class="my-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground" title="${env.escapeAttr(block.src.trim())}"><span class="font-semibold uppercase tracking-wide opacity-70">${label}</span>${pkgs.map(chip).join("")}${extra}</div>`;
      }

      case "algo": {
        const rows = block.lines
          .map((l) => `<div style="display:flex;gap:0.6rem;margin:1px 0"><span style="flex:none;width:1.4rem;text-align:right;opacity:0.5">${l.num ?? ""}</span><span style="flex:1;min-width:0;padding-left:${(l.indent * 1.4).toFixed(1)}rem">${env.inline(convert(l.text))}</span></div>`)
          .join("");
        return `<div ${attrs(block, env)} class="my-2 rounded border border-border/60 bg-muted/20 px-3 py-2 text-sm" style="text-align:left">${rows}</div>`;
      }

      case "code": {
        const label = block.lang ? `<div class="text-xs text-muted-foreground/60 font-mono uppercase tracking-wider mb-2">${env.escape(block.lang)}</div>` : "";
        return `<pre ${attrs(block, env)} class="my-2 rounded-lg bg-muted/60 border border-border/60 p-3 overflow-x-auto">${label}<code class="text-xs font-mono text-foreground/80 whitespace-pre">${env.escape(block.code)}</code></pre>`;
      }

      case "list": {
        const { list } = block;
        const rows = list.items
          .map((item) => {
            const content = renderNodes(item.nodes, env, false);
            if (list.kind === "description") {
              return `<div style="margin:2px 0"><b>${env.inline(convert(item.label))}</b> ${content}</div>`;
            }
            const label = env.inline(convert(item.label));
            return `<div style="display:flex;gap:0.5rem;margin:2px 0"><span style="flex:none;min-width:1.5rem;text-align:right;opacity:${list.kind === "itemize" ? "0.8" : "1"}">${label}</span><div style="flex:1;min-width:0">${content}</div></div>`;
          })
          .join("");
        return `<div ${attrs(block, env)} class="my-2 text-sm leading-relaxed" style="margin-left:0.5rem">${rows}</div>`;
      }

      case "table": {
        const { table } = block;
        const trs = table.rows
          .map((row, rIdx) => {
            const lastRow = rIdx === table.rows.length - 1;
            let col = 0;
            const tds = row.cells
              .map((cell) => {
                const spec = table.cols[col];
                const align = cell.align || spec?.align || "left";
                const styles = ["padding:4px 10px", `text-align:${align}`, "vertical-align:top"];
                if (row.ruleAbove > 0) styles.push(`border-top:${row.ruleKind === "thick" ? 2 : 1}px ${row.ruleAbove > 1 ? "double" : "solid"} ${RULE_COLOR}`);
                if (lastRow && table.ruleBottom) styles.push(`border-bottom:${table.bottomThick ? 2 : 1}px solid ${RULE_COLOR}`);
                if (cell.bl ?? spec?.bl) styles.push(`border-left:1px solid ${RULE_COLOR}`);
                if (cell.br ?? table.cols[col + cell.colspan - 1]?.br) styles.push(`border-right:1px solid ${RULE_COLOR}`);
                const bg = cell.bg || row.bg;
                if (bg) styles.push(`background:${env.escapeAttr(bg)}`, `color:${contrastText(bg)}`);
                col += cell.colspan;
                const span = `${cell.colspan > 1 ? ` colspan="${cell.colspan}"` : ""}${cell.rowspan > 1 ? ` rowspan="${cell.rowspan}"` : ""}`;
                return `<td${span} style="${styles.join(";")}">${renderNodes(cell.nodes, env, true)}</td>`;
              })
              .join("");
            return `<tr>${tds}</tr>`;
          })
          .join("");
        return `<div ${attrs(block, env)} class="my-3 overflow-x-auto"><table class="text-sm" style="border-collapse:collapse;display:inline-table;text-align:left"><tbody>${trs}</tbody></table></div>`;
      }

      case "float": {
        const f = block.float;
        const names = NAMES[ctx.locale];
        const cap = f.caption
          ? `<div class="text-xs text-muted-foreground text-center" style="margin:4px 0"><b>${names[f.floatKind]} ${env.escape(f.number)}.</b> ${env.inline(convert(f.caption))}</div>`
          : "";
        const body = `<div style="text-align:center">${renderNodes(f.nodes, env, false)}</div>`;
        return `<div ${attrs(block, env)} class="my-3">${f.floatKind === "figure" ? body + cap : cap + body}</div>`;
      }

      case "box": {
        const b = block.box;
        const names = NAMES[ctx.locale];
        const content = renderNodes(b.nodes, env, false);
        const base = b.variant.startsWith("theorem:") ? b.variant.slice(8) : b.variant;
        if (b.variant.startsWith("theorem:")) {
          const head = `${b.heading ?? names[base] ?? base}${b.number ? ` ${b.number}` : ""}`;
          const named = b.title ? ` (${env.inline(convert(b.title))})` : "";
          const italic = (b.upright ?? UPRIGHT_THEOREMS.has(base)) ? "" : "font-style:italic;";
          return `<div ${attrs(block, env)} class="my-3 rounded-lg border-l-4 border-sky-500/60 bg-sky-500/5 px-3 py-2"><div class="text-xs font-bold uppercase tracking-wide text-sky-400 mb-1">${env.escape(head)}${named}</div><div class="text-sm leading-relaxed" style="${italic}">${content}</div></div>`;
        }
        switch (base) {
          case "quote": case "quotation": case "verse":
            return `<blockquote ${attrs(block, env)} class="my-2 border-l-4 border-border/50 pl-3 text-muted-foreground italic">${content}</blockquote>`;
          case "center": return `<div ${attrs(block, env)} style="text-align:center">${content}</div>`;
          case "flushright": return `<div ${attrs(block, env)} style="text-align:right">${content}</div>`;
          case "flushleft": return `<div ${attrs(block, env)} style="text-align:left">${content}</div>`;
          case "abstract":
            return `<div ${attrs(block, env)} class="my-3 text-sm" style="margin:0.75rem 2rem"><div class="text-center text-xs font-bold uppercase tracking-wide mb-1">${env.escape(names.abstract)}</div>${content}</div>`;
          case "proof": case "solution": {
            const title = b.title ? env.inline(convert(b.title)) : env.escape(names[base]);
            const qed = base === "proof" ? `<span style="flex:none;margin-left:0.75rem;align-self:flex-end">${env.math("\\blacksquare", false)}</span>` : "";
            return `<div ${attrs(block, env)} class="my-2 text-sm leading-relaxed" style="display:flex;justify-content:space-between"><div style="flex:1;min-width:0"><i>${title}.</i> ${content}</div>${qed}</div>`;
          }
          case "multicols": case "multicols*":
            return `<div ${attrs(block, env)} class="my-2" style="column-count:${b.columns || 2};column-gap:1.5rem">${content}</div>`;
          case "minipage":
            return `<div ${attrs(block, env)} class="my-2" style="display:inline-block;vertical-align:top;max-width:100%">${content}</div>`;
          case "framed": case "mdframed": case "tcolorbox":
            return `<div ${attrs(block, env)} class="my-2 rounded border border-border px-3 py-2">${content}</div>`;
          default:
            return `<div ${attrs(block, env)}${b.fontSize ? ` style="font-size:${b.fontSize}"` : ""}>${content}</div>`;
        }
      }
    }
  }

  return { renderBlock: (index: number, env: LatexRenderEnv) => (blocks[index] ? renderBlock(blocks[index], env) : "") };
}

// ───────────────────────── public API ─────────────────────────

export function createLatexContext(opts: LatexOptions = {}): Ctx {
  return {
    locale: opts.locale && opts.locale.toLowerCase().startsWith("es") ? "es" : "en",
    counters: {},
    sec: [0, 0, 0, 0, 0, 0],
    hasChapter: false,
    eqWithinSection: false,
    labels: {},
    macros: {},
    packages: [],
    remoteUrls: [],
    hidden: [],
    theorems: {},
    enumDepth: 0,
    itemDepth: 0,
    footnotes: 0,
    stack: [],
  };
}

/** Fast pre-check so plain markdown never pays for (or is altered by) the parser. */
export function looksLikeLatex(input: string): boolean {
  return input.includes("\\");
}

export function prepareLatex(input: string, opts: LatexOptions = {}): PreparedLatex {
  if (!looksLikeLatex(input)) return { text: input, blockCount: 0, macros: {}, packages: [], remoteUrls: [], renderBlock: () => "" };

  const ctx = createLatexContext(opts);
  // Pasted Windows text arrives as CRLF; every line-oriented rule below assumes LF.
  input = input.replace(/\r\n?/g, "\n");
  const stripComments = (t: string) => t.replace(/^[ \t]*%[^\n]*(?:\n|$)/gm, "");
  let text = input.replace(/^[ \t]*%[^\n]*(?:\n|$)/gm, (m) => hide(ctx, m));
  text = applyCounters(text, ctx);
  text = extractPackages(text, ctx);
  // Online packages contribute declarative definitions only; the rest of the
  // downloaded file is discarded (never executed or rendered).
  for (const ref of ctx.remoteUrls) {
    const remote = opts.remote?.[ref];
    if (remote) extractMacros(extractTheorems(stripComments(remote), ctx), ctx);
  }
  text = extractTheorems(text, ctx);
  text = extractMacros(text, ctx);
  text = text.replace(PREAMBLE_LINE, (m: string) => hide(ctx, m));
  text = titleBlock(text);

  const blocks: LatexBlock[] = [];
  const scanned = scan(text, ctx, blocks);
  let converted = convertInline(scanned, ctx);

  // Removed preamble/comment text comes back as (merged) atomic blocks, so nothing is lost on save.
  const outLines: string[] = [];
  let run: string[] = [];
  const flushRun = () => {
    if (!run.length) return;
    blocks.push({ kind: "preamble", src: run.join("") });
    outLines.push(`${NUL}LB${blocks.length - 1}${NUL}`);
    run = [];
  };
  for (const line of converted.split("\n")) {
    const m = line.match(/^\x00LP(\d+)\x00$/);
    if (m) run.push(ctx.hidden[Number(m[1])]);
    else { flushRun(); outLines.push(line); }
  }
  flushRun();
  converted = outLines.join("\n").replace(/\x00LP(\d+)\x00/g, (_m, k: string) => atom(ctx.hidden[Number(k)], "", true));

  const renderer = makeRenderer(ctx, blocks);
  return { text: converted, blockCount: blocks.length, macros: ctx.macros, packages: ctx.packages, remoteUrls: ctx.remoteUrls, renderBlock: renderer.renderBlock };
}
