import assert from "node:assert/strict";
import test from "node:test";

import { prepareLatex, findEmbeddedDocIds, LATEX_BLOCK_LINE, type LatexRenderEnv } from "./latex-text.ts";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const env: LatexRenderEnv = {
  inline: (s) => s,
  math: (f) => `[M:${f}]`,
  escape: esc,
  escapeAttr: esc,
};

/** Text as a reader sees it: inline atoms collapsed to what they display, block placeholders dropped. */
const plain = (t: string) => t.replace(/<[^>]+>/g, "").replace(/\x00LB\d+\x00\n?/g, "");

function render(input: string, locale = "en") {
  const p = prepareLatex(input, { locale });
  const html = p.text
    .split("\n")
    .map((line) => {
      const m = line.trim().match(LATEX_BLOCK_LINE);
      return m ? p.renderBlock(Number(m[1]), env) : line;
    })
    .join("\n");
  return { p, html };
}

test("plain markdown passes through untouched", () => {
  const src = "# Title\n\nSome **bold** text with $x^2$ and 50% off.\n- a\n- b";
  const p = prepareLatex(src);
  assert.equal(p.text, src);
  assert.equal(p.blockCount, 0);
});

test("CRLF input behaves like LF (no stray blank lines from removed preamble)", () => {
  const p = prepareLatex("\\usepackage{physics}\r\n\\newtheorem{thm}{Theorem}\r\n\\begin{thm}x\\end{thm}\r\ndone");
  assert.equal(p.text.replace(/\x00LB\d+\x00/g, "B"), "B\nB\ndone");
  assert.deepEqual(p.packages, ["physics"]);
  // the preamble is kept (merged into one atomic block) so an edit never deletes it
  assert.equal(p.blockCount, 2);
  assert.ok(p.renderBlock(Number(p.text.match(/\x00LB(\d+)\x00/)![1]), env).includes("\\usepackage{physics}\n\\newtheorem{thm}{Theorem}\n"));
});

test("online packages: only definitions are lifted, refs are reported", () => {
  const remote = "\\ProvidesPackage{x}\n\\newcommand{\\RR}{\\mathbb{R}}\n\\newtheorem{axiom}{Axiom}\n\\write18{rm -rf /}\n\\def\\a{b}\nplain text must vanish";
  const p = prepareLatex("\\usepackage{/latex-packages/x.sty}\n\\usepackage{https://evil.example/e.sty}\n\\begin{axiom}A\\end{axiom} $\\RR$", { remote: { "/latex-packages/x.sty": remote } });
  assert.deepEqual(p.remoteUrls, ["/latex-packages/x.sty", "https://evil.example/e.sty"]);
  assert.equal(p.macros["\\RR"], "\\mathbb{R}");
  assert.ok(!p.text.includes("plain text must vanish"));
  assert.ok(!p.text.includes("write18"));
  assert.equal(p.blockCount, 2); // preamble + the axiom box
  assert.ok(p.renderBlock(Number(p.text.match(/\x00LB(\d+)\x00/)![1]), env).includes("usepackage{/latex-packages/x.sty}"));
});

test("\\newtheorem: shared counters, starred, theoremstyle", () => {
  const { html } = render("\\newtheorem{thm}{Teorema}\n\\newtheorem{cor}[thm]{Corolario}\n\\theoremstyle{definition}\n\\newtheorem*{nota}{Nota}\n\\begin{thm}a\\end{thm}\n\\begin{cor}b\\end{cor}\n\\begin{nota}c\\end{nota}");
  assert.match(html, /Teorema 1/);
  assert.match(html, /Corolario 2/);
  assert.match(html, />Nota</);
});

test("DeclarePairedDelimiter becomes a KaTeX macro", () => {
  const p = prepareLatex("\\DeclarePairedDelimiter{\\abs}{\\lvert}{\\rvert}\n$\\abs{x}$");
  assert.equal(p.macros["\\abs"], "\\left\\lvert#1\\right\\rvert");
});

test("algorithmic: numbering, indentation and keywords", () => {
  const { html } = render("\\begin{algorithmic}[1]\n\\Require $x$\n\\State $a \\gets 1$\n\\If{$a>0$}\n\\State \\Return $a$\n\\EndIf\n\\end{algorithmic}");
  assert.match(html, /\*\*Require:\*\*/);
  assert.match(html, /\*\*if\*\* \$a&gt;0\$ \*\*then\*\*|\*\*if\*\* \$a>0\$ \*\*then\*\*/);
  assert.match(html, /padding-left:1\.4rem/);
  assert.match(html, />1</);
});

test("\\input / \\include of another Killio document becomes an embed block", () => {
  const id = "3f2c9a10-aaaa-bbbb-cccc-1234567890ab";
  const { html, p } = render(`Antes\n\\input{doc:${id}}\nentre\n\\include{ doc:${id} }\n\\input{@[doc:abc12345:Mi documento]}\nDespués`);
  assert.equal(p.blockCount, 3);
  assert.equal((html.match(/data-latex-embed=/g) || []).length, 3);
  assert.match(html, new RegExp(`data-latex-embed="${id}"`));
  assert.match(html, />Mi documento</); // title from @[doc:id:Title]
  assert.match(html, /<div data-embed-mount/);
  assert.ok(html.includes('data-latex-src="\\input{doc:3f2c9a10')); // source kept for round-tripping
  assert.deepEqual(findEmbeddedDocIds(`\\input{doc:${id}} \\include{doc:${id}} \\input{doc:abc12345}`), [id, "abc12345"]);
});

test("embed syntax does not collide with online packages or math", () => {
  const p = prepareLatex("\\usepackage{/latex-packages/x.sty}\n\\input{/latex-packages/y.sty}\n$\\input{doc:abc12345}$");
  assert.deepEqual(p.remoteUrls, ["/latex-packages/x.sty", "/latex-packages/y.sty"]);
  assert.equal(p.text.includes("doc:abc12345"), true); // inside $…$ → untouched
  assert.deepEqual(findEmbeddedDocIds("\\input{/latex-packages/y.sty}"), []);
});

test("siunitx text commands", () => {
  const p = prepareLatex("\\SI{9.81}{\\meter\\per\\second\\squared} \\num{1.2e3} \\ang{30} \\SI{25}{\\celsius}");
  assert.equal(plain(p.text), "9.81\u00A0m·s⁻² 1.2 × 10³ 30° 25\u00A0°C");
  // the command itself is remembered by the atom, so editing text next to it keeps \\SI
  assert.ok(p.text.includes('data-latex-src="\\SI{9.81}{\\meter\\per\\second\\squared}"'));
});

test("xcolor names and mixes resolve; colorbox picks a readable text colour", () => {
  assert.equal(prepareLatex("\\textcolor{Maroon}{x}").text, "[color:#AF3235]x[/color]");
  assert.match(prepareLatex("\\textcolor{red!60!blue}{x}").text, /color-mix\(in srgb, red 60%, blue\)/);
  assert.match(prepareLatex("\\colorbox{yellow}{x}").text, /\[bg:yellow\]\[color:#111111\]x/);
});

test("escaped dollar and empty group idiom", () => {
  assert.equal(prepareLatex("cost \\$5 and \\LaTeX{} rocks").text, "cost &#36;5 and LaTeX rocks");
});

test("inline text commands become Killio tokens", () => {
  const { p } = render("A \\textbf{bold \\textit{and italic}} and \\underline{u} and \\textcolor{red}{red} and \\texttt{code}.");
  assert.equal(p.text, "A **bold *and italic*** and __u__ and [color:red]red[/color] and `code`.");
});

test("declarations apply to the rest of the group", () => {
  assert.equal(prepareLatex("{\\bfseries heavy} light").text, "**heavy** light");
  assert.equal(prepareLatex("{\\large big}").text, "[size:1.2rem]big[/size]");
});

test("unsafe urls and colors are dropped", () => {
  assert.equal(prepareLatex("\\href{javascript:alert(1)}{x}").text, "x");
  assert.equal(prepareLatex("\\textcolor{red;background:url(x)}{x}").text, "x");
  assert.equal(prepareLatex("\\href{https://a.com}{site}").text, "[link:https://a.com]site[/link]");
});

test("math spans are never rewritten", () => {
  const src = "Inline $\\textbf{x} \\frac{a}{b}$ stays and \\textbf{this} changes";
  assert.equal(prepareLatex(src).text, "Inline $\\textbf{x} \\frac{a}{b}$ stays and **this** changes");
});

test("environments inside $$ are not extracted as blocks", () => {
  const src = "$$\n\\begin{aligned}a&=b\\end{aligned}\n$$";
  const p = prepareLatex(src);
  assert.equal(p.blockCount, 0);
  assert.equal(p.text, src);
});

test("align numbers every row, honours \\nonumber and \\tag", () => {
  const { html } = render("\\begin{align}\na &= b \\label{eq:one}\\\\\nc &= d \\nonumber\\\\\ne &= f \\tag{*}\\\\\ng &= h\n\\end{align}");
  assert.match(html, /a &= b\\tag\{1\}/);
  assert.doesNotMatch(html, /c &= d\s*\\tag/);
  assert.match(html, /e &= f \\tag\{\*\}/);
  assert.match(html, /g &= h\\tag\{2\}/);
  assert.match(html, /align\*/);
  // the KaTeX input must not contain \label (KaTeX rejects it); the saved source keeps it
  const formula = html.slice(html.indexOf("[M:"));
  assert.doesNotMatch(formula, /\\label/);
  assert.match(html, /data-latex-src="[^"]*\\label\{eq:one\}/);
});

test("starred equations are not numbered", () => {
  const { html } = render("\\begin{equation*}x=1\\end{equation*}\n\\begin{equation}y=2\\end{equation}");
  assert.doesNotMatch(html, /x=1\\tag/);
  assert.match(html, /y=2\\tag\{1\}/);
});

test("labels and references resolve, including forward references", () => {
  const { p } = render("See \\eqref{eq:a} and \\ref{sec:x}.\n\\section{Intro}\\label{sec:x}\n\\begin{equation}\\label{eq:a}a=1\\end{equation}");
  assert.match(plain(p.text), /See \(1\) and 1\./);
  assert.ok(p.text.includes('data-latex-src="\\eqref{eq:a}"'));
});

test("sections number hierarchically and reset children", () => {
  const { html } = render("\\section{A}\n\\subsection{B}\n\\subsection{C}\n\\section{D}\n\\subsection{E}\n\\section*{F}");
  const nums = [...html.matchAll(/opacity:0\.55">([^<]*)</g)].map((m) => m[1]);
  assert.deepEqual(nums, ["1", "1.1", "1.2", "2", "2.1"]);
});

test("equation numbers can follow sections", () => {
  const { html } = render("\\numberwithin{equation}{section}\n\\section{A}\n\\begin{equation}a\\end{equation}\n\\begin{equation}b\\end{equation}\n\\section{B}\n\\begin{equation}c\\end{equation}");
  assert.match(html, /a\\tag\{1\.1\}/);
  assert.match(html, /b\\tag\{1\.2\}/);
  assert.match(html, /c\\tag\{2\.1\}/);
});

test("enumerate: default nested styles, custom label, start, \\item[x]", () => {
  const { html } = render("\\begin{enumerate}\n\\item one\n\\item two\n\\begin{enumerate}\n\\item inner\n\\end{enumerate}\n\\end{enumerate}");
  assert.match(html, />1\.</);
  assert.match(html, />2\.</);
  assert.match(html, />\(a\)</);

  const custom = render("\\begin{enumerate}[label=(\\roman*), start=3]\n\\item x\n\\item y\n\\end{enumerate}").html;
  assert.match(custom, />\(iii\)</);
  assert.match(custom, />\(iv\)</);

  const short = render("\\begin{enumerate}[A)]\n\\item x\n\\item y\n\\end{enumerate}").html;
  assert.match(short, />A\)</);
  assert.match(short, />B\)</);

  const item = render("\\begin{itemize}\n\\item[$\\star$] special\n\\item plain\n\\end{itemize}").html;
  assert.match(item, /\$\\star\$/);
  assert.match(item, />•</);
});

test("noitemsep style options do not hijack the numbering style", () => {
  const { html } = render("\\begin{enumerate}[noitemsep]\n\\item x\n\\end{enumerate}");
  assert.match(html, />1\.</);
});

test("description lists bold the term", () => {
  const { html } = render("\\begin{description}\n\\item[Term] meaning\n\\end{description}");
  assert.match(html, /<b>Term<\/b>/);
});

test("tabular: rules, alignment, multicolumn and multirow", () => {
  const src = [
    "\\begin{tabular}{|l|c|r|}",
    "\\hline",
    "\\multicolumn{2}{|c|}{Head} & R \\\\",
    "\\hline",
    "\\multirow{2}{*}{span} & b & c \\\\",
    " & d & e \\\\",
    "\\hline",
    "\\end{tabular}",
  ].join("\n");
  const { html } = render(src);
  assert.match(html, /colspan="2"/);
  assert.match(html, /rowspan="2"/);
  assert.match(html, /text-align:right/);
  assert.match(html, /border-top:1px solid/);
  assert.match(html, /border-bottom:1px solid/);
  // 3 rows; the placeholder cell under the multirow must be dropped
  const rows = html.match(/<tr>/g) || [];
  assert.equal(rows.length, 3);
  const lastRow = html.split("<tr>")[3];
  assert.equal((lastRow.match(/<td/g) || []).length, 2);
});

test("tabular with booktabs and math cells", () => {
  const { html } = render("\\begin{tabular}{lc}\n\\toprule\nA & $x^2$ \\\\\n\\midrule\nB & 2 \\\\\n\\bottomrule\n\\end{tabular}");
  assert.match(html, /\$x\^2\$/);
  assert.match(html, /border-top:2px solid/);
  assert.match(html, /border-bottom:2px solid/);
});

test("table float numbers captions and resolves refs", () => {
  const { html, p } = render("As \\ref{tab:a} shows.\n\\begin{table}\n\\caption{Results}\\label{tab:a}\n\\begin{tabular}{c}\n1\n\\end{tabular}\n\\end{table}", "es");
  assert.match(html, /Tabla 1\./);
  assert.match(plain(p.text), /As 1 shows\./);
});

test("theorem-like environments share counters and localise", () => {
  const { html } = render("\\begin{theorem}[Pythagoras]\na\n\\end{theorem}\n\\begin{lemma}\\label{l}b\\end{lemma}\n\\begin{definition}c\\end{definition}\n\\begin{proof}d\\end{proof}", "es");
  assert.match(html, /Teorema 1/);
  assert.match(html, /Pythagoras/);
  assert.match(html, /Lema 2/);
  assert.match(html, /Definición 1/);
  assert.match(html, /Demostración\./);
});

test("macros are collected and removed from the text", () => {
  const { p } = render("\\newcommand{\\R}{\\mathbb{R}}\n\\newcommand{\\norm}[1]{\\left\\lVert #1\\right\\rVert}\n\\DeclareMathOperator{\\sgn}{sgn}\nLet $x\\in\\R$.");
  assert.equal(p.macros["\\R"], "\\mathbb{R}");
  assert.equal(p.macros["\\norm"], "\\left\\lVert #1\\right\\rVert");
  assert.equal(p.macros["\\sgn"], "\\operatorname{sgn}");
  assert.equal(plain(p.text).trim(), "Let $x\\in\\R$.");
  assert.ok(p.renderBlock(0, env).includes("\\newcommand{\\R}{\\mathbb{R}}")); // …but the definitions stay in the source
});

test("display math and delimiters", () => {
  const { html, p } = render("a \\(x+1\\) b\n\\[ y = 2 \\]");
  assert.match(p.text, /\$x\+1\$/);
  assert.match(html, /\[M:y = 2\]/);
});

test("every block keeps its original source for round-tripping", () => {
  const src = "\\begin{align}\na&=b\n\\end{align}";
  const { html } = render(src);
  assert.ok(html.includes(`data-latex-src="${esc(src)}"`));
});

test("verbatim content is escaped and untouched", () => {
  const { html } = render("\\begin{verbatim}\n<b>\\textbf{x}</b>\n\\end{verbatim}");
  assert.match(html, /&lt;b&gt;\\textbf\{x\}&lt;\/b&gt;/);
});

test("unknown commands and environments survive verbatim", () => {
  const { p } = render("\\foo{bar} and \\begin{weird}x\\end{weird}");
  assert.equal(p.text, "\\foo{bar} and \\begin{weird}x\\end{weird}");
});

test("bibliography entries resolve \\cite", () => {
  const { p, html } = render("See \\cite{k2}.\n\\begin{thebibliography}{9}\n\\bibitem{k1} First.\n\\bibitem{k2} Second.\n\\end{thebibliography}");
  assert.match(plain(p.text), /See \[2\]\./);
  assert.match(html, />\[1\]</);
});

test("nested environments render inside list items", () => {
  const { html } = render("\\begin{itemize}\n\\item eq:\n\\begin{equation}z\\end{equation}\n\\item \\begin{itemize}\\item deep\\end{itemize}\n\\end{itemize}");
  assert.match(html, /z\\tag\{1\}/);
  assert.match(html, />–</);
});

test("nothing is dropped from the source: preamble, comments and inline commands are all re-emitted", () => {
  const src = "% a comment\n\\usepackage{physics}\n\\newcommand{\\RR}{\\mathbb{R}}\nSee \\ref{x} and \\label{y}\\SI{1}{\\meter}.\n\\section{S}\\label{x}";
  const p = prepareLatex(src);
  const rebuilt = p.text
    .split("\n")
    .map((line) => {
      const m = line.trim().match(LATEX_BLOCK_LINE);
      if (!m) return line;
      const html = p.renderBlock(Number(m[1]), env);
      return decodeURIComponent(escape(html.match(/data-latex-src="([^"]*)"/)![1])).replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
    })
    .join("\n")
    .replace(/<span data-latex-inline="1" data-latex-src="([^"]*)"[^>]*>[^<]*<\/span>/g, (_m, v: string) => v.replace(/&quot;/g, '"').replace(/&amp;/g, "&"));
  for (const piece of ["% a comment", "\\usepackage{physics}", "\\newcommand{\\RR}{\\mathbb{R}}", "\\ref{x}", "\\label{y}", "\\SI{1}{\\meter}", "\\section{S}\\label{x}"]) {
    assert.ok(rebuilt.includes(piece), `lost: ${piece}\n---\n${rebuilt}`);
  }
});
