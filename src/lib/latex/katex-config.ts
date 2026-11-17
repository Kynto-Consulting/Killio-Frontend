// Single entry point for rendering math with KaTeX. Every text/table/rich-text
// surface should go through here so extensions (mhchem), public-package macro
// sets (physics …) and per-brick macros behave the same everywhere.
import katex from "katex";
// @ts-ignore — side-effect import: registers \ce{} and \pu{} on the KaTeX singleton.
import "katex/contrib/mhchem";
// @ts-ignore
import "katex/dist/katex.min.css";

export type MacroValue = string | ((ctx: any) => any);
export type LatexMacros = Record<string, MacroValue>;

export interface RenderMathOptions {
  display?: boolean;
  /** Macros collected from \newcommand / online packages. They win over package sets. */
  macros?: LatexMacros;
  /** Names from \usepackage{…}; known ones switch on their macro set. */
  packages?: string[];
}

// KaTeX hands function macros a stream of reversed tokens.
const tokText = (arg: Array<{ text: string }>): string => arg.slice().reverse().map((t) => t.text).join("");
const hasNextGroup = (ctx: any): boolean => { ctx.consumeSpaces(); return ctx.future().text === "{"; };

// `physics` package (the parts KaTeX does not ship; \bra \ket \braket are native).
const PHYSICS: LatexMacros = {
  "\\abs": "\\left\\lvert#1\\right\\rvert",
  "\\norm": "\\left\\lVert#1\\right\\rVert",
  "\\comm": "\\left[#1,#2\\right]",
  "\\acomm": "\\left\\{#1,#2\\right\\}",
  "\\pqty": "\\left(#1\\right)",
  "\\bqty": "\\left[#1\\right]",
  "\\Bqty": "\\left\\{#1\\right\\}",
  "\\vqty": "\\left\\lvert#1\\right\\rvert",
  "\\grad": "\\nabla",
  "\\curl": "\\nabla\\times",
  "\\laplacian": "\\nabla^{2}",
  "\\vb": "\\mathbf{#1}",
  "\\va": "\\vec{\\mathbf{#1}}",
  "\\vu": "\\hat{\\mathbf{#1}}",
  "\\dd": "\\mathrm{d}",
  "\\tr": "\\operatorname{tr}",
  "\\Tr": "\\operatorname{Tr}",
  "\\rank": "\\operatorname{rank}",
  "\\order": "\\mathcal{O}\\left(#1\\right)",
  "\\mel": "\\left\\langle#1\\middle\\vert#2\\middle\\vert#3\\right\\rangle",
  "\\ketbra": "\\left\\lvert#1\\middle\\rangle\\!\\middle\\langle#2\\right\\rvert",
  "\\expval": "\\left\\langle#1\\right\\rangle",
  "\\ev": (ctx: any) => {
    const [a] = ctx.consumeArgs(1);
    if (hasNextGroup(ctx)) {
      const [b] = ctx.consumeArgs(1);
      const A = tokText(a), B = tokText(b);
      return `\\left\\langle ${B}\\middle\\vert ${A}\\middle\\vert ${B}\\right\\rangle`;
    }
    return `\\left\\langle ${tokText(a)}\\right\\rangle`;
  },
  "\\dv": (ctx: any) => {
    const [a] = ctx.consumeArgs(1);
    if (hasNextGroup(ctx)) {
      const [b] = ctx.consumeArgs(1);
      return `\\frac{\\mathrm{d}${tokText(a)}}{\\mathrm{d}${tokText(b)}}`;
    }
    return `\\frac{\\mathrm{d}}{\\mathrm{d}${tokText(a)}}`;
  },
  "\\pdv": (ctx: any) => {
    const [a] = ctx.consumeArgs(1);
    if (!hasNextGroup(ctx)) return `\\frac{\\partial}{\\partial ${tokText(a)}}`;
    const [b] = ctx.consumeArgs(1);
    if (hasNextGroup(ctx)) {
      const [c] = ctx.consumeArgs(1);
      return `\\frac{\\partial^{2}${tokText(a)}}{\\partial ${tokText(b)}\\,\\partial ${tokText(c)}}`;
    }
    return `\\frac{\\partial ${tokText(a)}}{\\partial ${tokText(b)}}`;
  },
};

/** Public packages that map onto KaTeX macro sets (the rest is native KaTeX or text-level). */
export const PACKAGE_MACROS: Record<string, LatexMacros> = {
  physics: PHYSICS,
};

/** Packages KaTeX already provides, listed so the UI can say "supported". */
export const NATIVE_PACKAGES = ["amsmath", "amssymb", "amsfonts", "amsthm", "bm", "cancel", "mathtools", "mhchem", "braket", "xcolor", "color", "mathrsfs", "stmaryrd", "textcomp"];

export function renderMath(formula: string, opts: RenderMathOptions = {}): string {
  const macros: LatexMacros = {};
  for (const pkg of opts.packages ?? []) Object.assign(macros, PACKAGE_MACROS[pkg]);
  Object.assign(macros, opts.macros);
  return katex.renderToString(formula, {
    displayMode: Boolean(opts.display),
    throwOnError: false,
    // `trust` stays off: the output is injected as HTML, so \href / \includegraphics
    // with arbitrary protocols must not be reachable from user text.
    trust: false,
    maxExpand: 1000,
    macros,
  });
}
