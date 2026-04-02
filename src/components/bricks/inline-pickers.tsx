"use client";

import React, { useEffect, useMemo, useState } from "react";
import EmojiPicker from "emoji-picker-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import katex from "katex";
import { useTranslations } from "@/components/providers/i18n-provider";
// @ts-ignore
import "katex/dist/katex.min.css";

// Basic input components so we don't have to import the heavy ones if they aren't standard
export function DatePickerPopover({ onSelect, onClose, top, left }: { onSelect: (ts: string) => void, onClose: () => void, top: number, left: number }) {
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");

  const handleApply = () => {
    if (!date) return;
    const dt = new Date(`${date}T${time || "00:00"}`);
    const unix = Math.floor(dt.getTime() / 1000);
    onSelect(`<t:${unix}:F>`);
  };

  return (
    <div className="fixed z-[150] p-4 flex flex-col gap-3 rounded-xl border border-border bg-card shadow-2xl w-[260px]" style={{ top, left }}>
      <div className="text-sm font-medium">Seleccionar Fecha/Hora</div>
      <input type="date" className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50" value={date} onChange={e => setDate(e.target.value)} />
      <input type="time" className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50" value={time} onChange={e => setTime(e.target.value)} />
      <div className="flex gap-2 justify-end mt-2">
        <Button size="sm" variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button size="sm" onClick={handleApply}>Insertar</Button>
      </div>
    </div>
  );
}

export function EmojiPickerPopover({ onSelect, top, left }: { onSelect: (emoji: string) => void, top: number, left: number }) {
  return (
    <div className="fixed z-[150] shadow-2xl rounded-xl" style={{ top, left }}>
      <EmojiPicker onEmojiClick={(e) => onSelect(e.emoji)} theme={'auto' as any} />
    </div>
  );
}


import "mathlive";

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "math-field": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & { class?: string };
    }
  }
}

type MathMode = "block" | "inline";

type MathPickerSelection = {
  formula: string;
  mode: MathMode;
  markdown: string;
};

// Render Katex quickly for buttons
function StaticMath({ latex }: { latex: string }) {
  const html = useMemo(() => {
    try {
      return katex.renderToString(latex, { throwOnError: false, displayMode: false });
    } catch {
      return latex;
    }
  }, [latex]);
  return <span dangerouslySetInnerHTML={{ __html: html }} className="pointer-events-none select-none text-[1.1em]" />;
}

const MATH_CATEGORIES = {
  basic: [
    { latex: "\\pm", insert: "\\pm " },
    { latex: "\\frac{x}{y}", insert: "\\frac{x}{y}" },
    { latex: "\\sqrt{x}", insert: "\\sqrt{x}" },
    { latex: "\\sqrt[n]{x}", insert: "\\sqrt[n]{x}" },
    { latex: "x^2", insert: "^{2}" },
    { latex: "x_2", insert: "_{2}" },
    { latex: "|x|", insert: "|x|" },
  ],
  algebra: [
    { latex: "\\approx", insert: "\\approx " },
    { latex: "\\sim", insert: "\\sim " },
    { latex: "\\propto", insert: "\\propto " },
    { latex: "\\neq", insert: "\\neq " },
    { latex: "\\leq", insert: "\\leq " },
    { latex: "\\geq", insert: "\\geq " },
    { latex: "\\times", insert: "\\times " },
    { latex: "\\div", insert: "\\div " },
    { latex: "\\in", insert: "\\in " },
    { latex: "\\notin", insert: "\\notin " },
    { latex: "\\subset", insert: "\\subset " },
  ],
  calculus: [
    { latex: "\\sum_{i=1}^{n}", insert: "\\sum_{i=1}^{n} " },
    { latex: "\\prod_{i=1}^{n}", insert: "\\prod_{i=1}^{n} " },
    { latex: "\\int", insert: "\\int " },
    { latex: "\\iint", insert: "\\iint " },
    { latex: "\\oint", insert: "\\oint " },
    { latex: "\\lim_{x\\to\\infty}", insert: "\\lim_{x\\to\\infty} " },
    { latex: "\\frac{d}{dx}", insert: "\\frac{d}{dx} " },
    { latex: "\\partial", insert: "\\partial " },
    { latex: "\\nabla", insert: "\\nabla " },
    { latex: "\\infty", insert: "\\infty " },
  ],
  greek: [
    "\\alpha", "\\beta", "\\gamma", "\\delta", "\\epsilon", "\\zeta", "\\eta",
    "\\theta", "\\kappa", "\\lambda", "\\mu", "\\nu", "\\xi", "\\pi", "\\rho",
    "\\sigma", "\\tau", "\\phi", "\\chi", "\\psi", "\\omega", "\\Delta", "\\Gamma",
    "\\Theta", "\\Lambda", "\\Xi", "\\Pi", "\\Sigma", "\\Phi", "\\Psi", "\\Omega"
  ].map(g => ({ latex: g, insert: g + " " })),
  matrices: [
    { latex: "\\begin{pmatrix} a \\\\ c \\end{pmatrix}", insert: "\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}" },
    { latex: "\\begin{bmatrix} a \\\\ c \\end{bmatrix}", insert: "\\begin{bmatrix} a & b \\\\ c & d \\end{bmatrix}" },
    { latex: "\\begin{cases} x \\\\ y \\end{cases}", insert: "\\begin{cases} x = 1 \\\\ y = 2 \\end{cases}" },
    { latex: "\\begin{aligned} a \\\\ c \\end{aligned}", insert: "\\begin{aligned} a &= b \\\\ c &= d \\end{aligned}" },
  ],
  logic: [
    { latex: "\\forall", insert: "\\forall " },
    { latex: "\\exists", insert: "\\exists " },
    { latex: "\\nexists", insert: "\\nexists " },
    { latex: "\\land", insert: "\\land " },
    { latex: "\\lor", insert: "\\lor " },
    { latex: "\\neg", insert: "\\neg " },
    { latex: "\\implies", insert: "\\implies " },
    { latex: "\\iff", insert: "\\iff " },
    { latex: "\\equiv", insert: "\\equiv " },
    { latex: "\\therefore", insert: "\\therefore " },
  ]
};

const toMathMarkdown = (formula: string, mode: MathMode): string => {
  const clean = formula.trim();
  if (!clean) return "";
  return mode === "block" ? `$$\n${clean}\n$$` : `$${clean}$`;
};

export function MathPickerPopover({
  onSelect,
  onClose,
  top,
  left,
  initialFormula = "",
  initialMode = "block",
}: {
  onSelect: (selection: MathPickerSelection) => void;
  onClose: () => void;
  top: number;
  left: number;
  initialFormula?: string;
  initialMode?: MathMode;
}) {
  const t = useTranslations("document-detail");
  const [formula, setFormula] = useState(initialFormula);
  const [mode, setMode] = useState<MathMode>(initialMode);
  const [isMobileLayout, setIsMobileLayout] = useState(false);
  const [showManualEditor, setShowManualEditor] = useState(false);
  const [currentTab, setCurrentTab] = useState<keyof typeof MATH_CATEGORIES>("basic");
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const mfRef = React.useRef<HTMLElement>(null);

  useEffect(() => {
    setFormula(initialFormula);
  }, [initialFormula]);

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  useEffect(() => {
    setShowManualEditor(false);
  }, [initialFormula, initialMode]);

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.body.style.setProperty("--keyboard-zindex", "9999");
    }
  }, []);

  useEffect(() => {
    const syncLayout = () => {
      if (typeof window === "undefined") return;
      setIsMobileLayout(window.innerWidth < 768);
    };

    syncLayout();
    window.addEventListener("resize", syncLayout);
    return () => window.removeEventListener("resize", syncLayout);
  }, []);

  useEffect(() => {
    if (!mfRef.current) return;
    const mf = mfRef.current as any;
    
    const handleInput = (e: Event) => {
      const v = (e.target as any).value;
      if (v !== formula) {
        setFormula(v);
      }
    };
    
    mf.addEventListener("input", handleInput);
    return () => mf.removeEventListener("input", handleInput);
  }, [formula]);

  useEffect(() => {
    if (mfRef.current) {
      const mf = mfRef.current as any;
      // Prevent cursor jump if it's already matching
      if (mf.value !== formula) {
        mf.value = formula;
      }
    }
  }, [formula]);

  const insert = () => {
    const clean = formula.trim();
    if (!clean) return;
    onSelect({
      formula: clean,
      mode,
      markdown: toMathMarkdown(clean, mode),
    });
  };

  const handleSnippetClick = (insertStr: string) => {
    if (showManualEditor && textareaRef.current) {
      // Insert in text area
      const el = textareaRef.current;
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const newForm = formula.substring(0, start) + insertStr + formula.substring(end);
      setFormula(newForm);
      setTimeout(() => {
        el.focus();
        el.setSelectionRange(start + insertStr.length, start + insertStr.length);
      }, 10);
    } else {
      // Insert in math field
      if (mfRef.current) {
        const mf = mfRef.current as any;
        mf.executeCommand(['insert', insertStr]);
        setFormula(mf.value);
        mf.focus();
      } else {
        setFormula((prev) => prev + insertStr);
      }
    }
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      const isSubmit = (event.ctrlKey || event.metaKey) && event.key === "Enter";
      if (isSubmit) {
        event.preventDefault();
        insert();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, formula, mode]);

  const CategoryTabs = Object.keys(MATH_CATEGORIES) as (keyof typeof MATH_CATEGORIES)[];

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-3 sm:p-6">
      <button
        type="button"
        aria-label={t("mathEditor.cancel")}
        className="absolute inset-0 cursor-default bg-black/55 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className={cn(
          "relative w-full max-w-[920px] overflow-hidden rounded-2xl border border-border bg-card shadow-2xl flex flex-col",
          isMobileLayout ? "max-h-[92vh]" : "max-h-[88vh]"
        )}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0">
             <p className="text-base font-semibold">{t("mathEditor.title")}</p>
             <p className="text-xs text-muted-foreground">{t("mathEditor.subtitle")}</p>
          </div>
          <div className="flex shrink-0 items-center justify-end gap-2 flex-wrap">
            <div className="inline-flex rounded-md border border-border bg-muted/30 p-0.5">
               <button
                  type="button"
                  className={cn(
                    "rounded px-2 py-1 text-xs font-medium",
                    mode === "inline" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
                  )}
                  onClick={() => setMode("inline")}
                >
                  {t("mathEditor.inline")}
               </button>
               <button
                  type="button"
                  className={cn(
                    "rounded px-2 py-1 text-xs font-medium",
                    mode === "block" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
                  )}
                  onClick={() => setMode("block")}
               >
                  {t("mathEditor.block")}
               </button>
            </div>
            <Button size="sm" variant="outline" onClick={() => setShowManualEditor((current) => !current)}>
              {showManualEditor ? t("mathEditor.hideLatex") : t("mathEditor.showLatex")}
            </Button>
          </div>
        </div>

        <div className="border-b border-border shrink-0 bg-muted/20 flex flex-col items-center">
          <div className="flex w-full overflow-x-auto border-b border-border scrollbar-thin px-4 pt-2 gap-2">
            {CategoryTabs.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setCurrentTab(key)}
                className={cn(
                  "px-3 py-1.5 text-sm rounded-t-md whitespace-nowrap transition-colors border-b-2 border-transparent",
                  currentTab === key ? "text-foreground font-semibold border-primary" : "text-muted-foreground hover:bg-muted"
                )}
              >
                {t(`mathEditor.categories.${key}` as any)}
              </button>
            ))}
          </div>
          <div className="w-full flex-1 p-3 overflow-y-auto max-h-[160px] md:max-h-[140px] flex content-start gap-2 flex-wrap">
            {MATH_CATEGORIES[currentTab].map((item, i) => (
              <button
                key={i}
                type="button"
                onClick={() => handleSnippetClick(item.insert)}
                title={item.insert}
                className="flex items-center justify-center min-w-10 min-h-10 p-2 rounded-md border border-border bg-background hover:border-primary/50 hover:bg-accent transition-colors shadow-sm"
              >
                <StaticMath latex={item.latex} />
              </button>
            ))}
          </div>
        </div>

        <div className={cn("grid flex-1 gap-4 overflow-visible p-4", showManualEditor ? "md:grid-cols-2" : "grid-cols-1") }>
            {showManualEditor && (
              <div className="flex flex-col gap-2 relative">
                <label className="text-xs font-medium text-muted-foreground">{t("mathEditor.manualLatex")}</label>
                <textarea
                  ref={textareaRef}
                  className="flex-1 w-full min-h-[140px] resize-y rounded-md border border-input bg-background p-3 font-mono text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                  value={formula}
                  onChange={(e) => setFormula(e.target.value)}
                  placeholder="\\int_0^T f(t)\\,dt"
                  autoFocus
                />
                <p className="text-xs text-muted-foreground truncate opacity-80 pb-1">
                  {t("mathEditor.hints")} <span className="font-mono bg-muted px-1 rounded">/</span>, <span className="font-mono bg-muted px-1 rounded">^</span>, <span className="font-mono bg-muted px-1 rounded">_</span>
                </p>
              </div>
            )}

            <div className="flex flex-col gap-2 relative">
              <label className="text-xs font-medium text-muted-foreground">{t("mathEditor.preview")}</label>
              <div className="flex-1 rounded-md border border-border bg-card p-2 flex flex-col overflow-visible min-h-[140px] focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
                <math-field
                  ref={mfRef as any}
                  className={cn(
                    "outline-none border-none min-h-12 w-full",
                    mode === "block" ? "text-center text-lg" : "text-base"
                  )}
                  style={{
                    backgroundColor: "transparent",
                    color: "inherit",
                    fontFamily: "inherit",
                    '--hue': '220', // mathlive accent color
                    '--keyboard-zindex': '9999', // ensure the virtual keyboard sits above the modal
                  } as any}
                >
                  {initialFormula}
                </math-field>
              </div>
            </div>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border px-4 py-3">
            <Button size="sm" variant="ghost" onClick={onClose}>{t("mathEditor.cancel")}</Button>
            <Button size="sm" onClick={insert}>{t("mathEditor.insert")}</Button>
        </div>
      </div>
    </div>
  );
}
