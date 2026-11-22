"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Wand2 } from "lucide-react";
import { useTranslations } from "@/components/providers/i18n-provider";
import { getScriptNodeDefinitionKinds } from "./dsl-node-kinds";
import {
  attachDslSource, compileDslText, DslApiError, DslLang, DslSourceResult, DslTemplate, getDslSource, getDslTemplates, toScriptGraph, translateDslText,
} from "@/lib/api/scripts-dsl";
import { conversionOffer, readKeywordLang, writeKeywordLang, type TextKeywordLanguage } from "@/lib/scripts-dsl/prefs";
import type { ScriptGraph } from "@/lib/api/scripts";
import {
  Completion, completionsAt, DslDiagnosticLike, diagnosticsByLine, formatSource, highlightLine, HighlightToken,
} from "@/lib/scripts-dsl/editor-utils";

interface Props {
  scriptId: string;
  teamId: string;
  accessToken: string;
  /** Saves the compiled graph through the same path as the block editor. */
  onSave: (graph: ScriptGraph) => Promise<void>;
  onBackToBlocks: () => void;
  /** When given, the Save button is NOT drawn here: the single top bar of the editor drives saving through this api. */
  onApi?: (api: TextEditorApi) => void;
}

export interface TextEditorApi {
  save: () => Promise<void>;
  dirty: boolean;
  saving: boolean;
  errorCount: number;
  /** Text could not be loaded or the script has no text form: there is nothing to save. */
  ready: boolean;
}

const CLS: Record<HighlightToken["cls"], string> = {
  comment: "text-foreground/40 italic",
  string: "text-emerald-600 dark:text-emerald-400",
  number: "text-amber-600 dark:text-amber-400",
  keyword: "text-violet-600 dark:text-violet-400 font-medium",
  action: "text-sky-600 dark:text-sky-400",
  trigger: "text-rose-600 dark:text-rose-400",
  operator: "text-fuchsia-600 dark:text-fuchsia-400",
  punct: "text-foreground/50",
  text: "",
};

/** Splits a line's tokens at diagnostic boundaries so the covered characters can be underlined. */
function withSquiggles(tokens: HighlightToken[], diags: DslDiagnosticLike[]): Array<{ text: string; cls: string; bad: boolean; title?: string }> {
  const out: Array<{ text: string; cls: string; bad: boolean; title?: string }> = [];
  let col = 1;
  for (const t of tokens) {
    for (const ch of t.text) {
      const d = diags.find((x) => col >= x.col && col < x.endCol);
      const last = out[out.length - 1];
      const bad = !!d;
      if (last && last.cls === CLS[t.cls] && last.bad === bad && last.title === d?.message) last.text += ch;
      else out.push({ text: ch, cls: CLS[t.cls], bad, title: d?.message });
      col++;
    }
  }
  return out;
}

export default function ScriptTextEditor({ scriptId, teamId, accessToken, onSave, onBackToBlocks, onApi }: Props) {
  const t = useTranslations("integrations");
  const tt = (k: string, vars?: Record<string, string | number>) => {
    let s = t(`scripts.dsl.${k}`);
    if (vars) for (const [a, b] of Object.entries(vars)) s = s.replace(`{${a}}`, String(b));
    return s;
  };
  // Keyword language: English is the base; the choice is remembered by this browser. It never affects what the compiler accepts.
  const [lang, setLang] = useState<DslLang>(() => {
    try { return readKeywordLang(window.localStorage); } catch { return "en"; }
  });
  const [textLang, setTextLang] = useState<TextKeywordLanguage | undefined>(undefined);
  const [converting, setConverting] = useState(false);
  const [loaded, setLoaded] = useState<DslSourceResult | null>(null);
  const [source, setSource] = useState("");
  const [saved, setSaved] = useState("");
  const [diags, setDiags] = useState<DslDiagnosticLike[]>([]);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [templates, setTemplates] = useState<DslTemplate[]>([]);
  const [nodeKinds, setNodeKinds] = useState<string[]>([]);
  const [popup, setPopup] = useState<{ from: number; items: Completion[]; index: number } | null>(null);
  const [caret, setCaret] = useState({ line: 1, col: 1 });
  const taRef = useRef<HTMLTextAreaElement>(null);
  const preRef = useRef<HTMLDivElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const seq = useRef(0);

  // initial load
  useEffect(() => {
    let alive = true;
    getDslSource(scriptId, teamId, lang, accessToken)
      .then((r) => { if (alive) { setLoaded(r); setSource(r.source ?? ""); setSaved(r.source ?? ""); setTextLang(r.keywordLanguage?.lang); } })
      .catch((e) => { if (alive) setError(e instanceof DslApiError && e.code === "SCRIPT_LOCKED" ? tt("locked") : tt("loadError")); });
    getDslTemplates(accessToken).then((x) => alive && setTemplates(x)).catch(() => undefined);
    getScriptNodeDefinitionKinds(teamId, accessToken).then((k) => alive && setNodeKinds(k)).catch(() => undefined);
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scriptId, teamId, accessToken]);

  // live diagnostics (debounced; the backend compiler is the single source of truth)
  useEffect(() => {
    if (!loaded || loaded.origin === "unrepresentable") return;
    const mine = ++seq.current;
    const h = setTimeout(() => {
      compileDslText(teamId, source, accessToken, scriptId)
        .then((r) => { if (mine === seq.current) { setDiags(r.diagnostics); setTextLang(r.keywordLanguage?.lang); } })
        .catch(() => undefined);
    }, 350);
    return () => clearTimeout(h);
  }, [source, loaded, teamId, accessToken, scriptId]);

  const lines = useMemo(() => source.split("\n"), [source]);
  // Only errors are underlined; warnings (e.g. a comment that cannot be stored on a node) are listed below.
  const byLine = useMemo(() => diagnosticsByLine(diags.filter((d) => d.severity === "error")), [diags]);
  const errorCount = diags.filter((d) => d.severity === "error").length;
  const dirty = source !== saved;

  const syncScroll = () => {
    const ta = taRef.current;
    if (!ta) return;
    if (preRef.current) { preRef.current.scrollTop = ta.scrollTop; preRef.current.scrollLeft = ta.scrollLeft; }
    if (gutterRef.current) gutterRef.current.scrollTop = ta.scrollTop;
  };

  const updateCaret = useCallback((ta: HTMLTextAreaElement) => {
    const before = ta.value.slice(0, ta.selectionStart);
    const ls = before.split("\n");
    setCaret({ line: ls.length, col: ls[ls.length - 1].length + 1 });
  }, []);

  const openSuggestions = useCallback((ta: HTMLTextAreaElement, force = false) => {
    const r = completionsAt(ta.value, ta.selectionStart, { lang, nodeKinds });
    const typed = ta.value.slice(r.from, ta.selectionStart);
    setPopup(r.items.length && (force || typed.length > 0 || r.from === ta.selectionStart) ? { from: r.from, items: r.items, index: 0 } : null);
  }, [lang, nodeKinds]);

  const accept = (c: Completion) => {
    const ta = taRef.current;
    if (!ta || !popup) return;
    const next = source.slice(0, popup.from) + c.insert + source.slice(ta.selectionStart);
    setSource(next);
    setPopup(null);
    requestAnimationFrame(() => { ta.focus(); const p = popup.from + c.insert.length; ta.setSelectionRange(p, p); updateCaret(ta); });
  };

  const save = async () => {
    if (errorCount > 0) { setError(tt("fixFirst")); return; }
    setStatus("saving"); setError(null);
    try {
      const compiled = await compileDslText(teamId, source, accessToken, scriptId);
      setDiags(compiled.diagnostics);
      if (!compiled.ok || !compiled.graph) { setStatus("error"); setError(tt("fixFirst")); return; }
      await onSave(toScriptGraph(scriptId, compiled.graph));
      await attachDslSource(scriptId, teamId, source, accessToken);
      setSaved(source); setStatus("saved");
    } catch (e) {
      setStatus("error"); setError(e instanceof Error && e.message ? e.message : tt("saveError"));
    }
  };

  const format = () => setSource((s) => formatSource(s));

  const offer = conversionOffer(textLang, lang);
  const convert = async () => {
    if (!offer) return;
    setConverting(true); setError(null);
    try {
      const r = await translateDslText(teamId, source, offer, accessToken);
      setSource(r.source); setTextLang(r.keywordLanguage.lang); setStatus("idle");
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : tt("saveError"));
    } finally {
      setConverting(false);
    }
  };

  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    onApi?.({ save: () => saveRef.current(), dirty, saving: status === "saving", errorCount, ready: !!loaded && loaded.origin !== "unrepresentable" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, status, errorCount, loaded]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const ta = e.currentTarget;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); void save(); return; }
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "f") { e.preventDefault(); format(); return; }
    if ((e.ctrlKey || e.metaKey) && e.code === "Space") { e.preventDefault(); openSuggestions(ta, true); return; }
    if (popup) {
      if (e.key === "ArrowDown") { e.preventDefault(); setPopup({ ...popup, index: (popup.index + 1) % popup.items.length }); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setPopup({ ...popup, index: (popup.index - 1 + popup.items.length) % popup.items.length }); return; }
      if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); accept(popup.items[popup.index]); return; }
      if (e.key === "Escape") { e.preventDefault(); setPopup(null); return; }
    }
    if (e.key === "Tab" && !e.shiftKey) {
      // Tab inserts indentation (Esc then Tab leaves the field, so keyboard users are not trapped).
      e.preventDefault();
      const s = ta.selectionStart;
      setSource(source.slice(0, s) + "  " + source.slice(ta.selectionEnd));
      requestAnimationFrame(() => ta.setSelectionRange(s + 2, s + 2));
    }
    if (e.key === "Enter") {
      const ls = source.slice(0, ta.selectionStart).split("\n");
      const cur = ls[ls.length - 1];
      const indent = cur.match(/^ */)![0] + (cur.trimEnd().endsWith(":") ? "  " : "");
      e.preventDefault();
      const s = ta.selectionStart;
      setSource(source.slice(0, s) + "\n" + indent + source.slice(ta.selectionEnd));
      requestAnimationFrame(() => { const p = s + 1 + indent.length; ta.setSelectionRange(p, p); updateCaret(ta); });
    }
  };

  if (error && !loaded) {
    return <div role="alert" className="m-4 rounded-xl bg-red-500/10 p-4 text-sm text-red-700 dark:text-red-300">{error}</div>;
  }
  if (!loaded) {
    return <div className="flex flex-1 items-center justify-center gap-2 p-8 text-sm text-foreground/60"><Loader2 className="h-5 w-5 animate-spin" />{tt("loading")}</div>;
  }
  if (loaded.origin === "unrepresentable") {
    return (
      <div className="m-4 flex max-w-xl flex-col gap-3 rounded-2xl bg-foreground/5 p-5">
        <div className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-5 w-5 text-amber-500" />{tt("unrepresentableTitle")}</div>
        <p className="text-sm text-foreground/70">{tt("unrepresentableBody", { reason: loaded.reason ?? "" })}</p>
        <button type="button" onClick={onBackToBlocks} className="self-start rounded-lg bg-foreground/10 px-3 py-1.5 text-sm font-medium hover:bg-foreground/15">{tt("backToBlocks")}</button>
      </div>
    );
  }

  const LINE_H = 20;
  const font = "13px/20px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 p-3" aria-label={tt("editorLabel")}>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {!onApi && (
          <button type="button" onClick={() => void save()} disabled={status === "saving" || !dirty} className="rounded-lg bg-foreground px-3 py-1.5 font-semibold text-background disabled:opacity-40">
            {status === "saving" ? tt("saving") : tt("save")}
          </button>
        )}
        <button type="button" onClick={format} className="inline-flex items-center gap-1 rounded-lg bg-foreground/10 px-3 py-1.5 font-medium hover:bg-foreground/15"><Wand2 className="h-3.5 w-3.5" />{tt("format")}</button>
        <label className="flex items-center gap-1 text-foreground/70">
          <span className="sr-only">{tt("templates")}</span>
          <select
            aria-label={tt("chooseTemplate")}
            className="rounded-lg bg-foreground/10 px-2 py-1.5"
            value=""
            onChange={(e) => { const tpl = templates.find((x) => x.id === e.target.value); if (tpl) setSource(tpl.source[lang]); }}
          >
            <option value="">{tt("templates")}…</option>
            {templates.map((x) => <option key={x.id} value={x.id} title={x.description[lang]}>{x.title[lang]}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-1 text-foreground/70">
          {tt("language")}
          <select
            value={lang}
            onChange={(e) => {
              const next = e.target.value as DslLang;
              setLang(next);
              try { writeKeywordLang(window.localStorage, next); } catch { /* not remembered */ }
            }}
            className="rounded-lg bg-foreground/10 px-2 py-1.5"
          >
            <option value="en">{tt("langEn")}</option>
            <option value="es">{tt("langEs")}</option>
          </select>
        </label>
        {offer && (
          <button type="button" onClick={() => void convert()} disabled={converting} className="inline-flex items-center gap-1 rounded-lg bg-foreground/10 px-3 py-1.5 font-medium hover:bg-foreground/15 disabled:opacity-50" title={tt("convertHelp")}>
            {converting ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
            {offer === "en" ? tt("convertToEnglish") : tt("convertToSpanish")}
          </button>
        )}
        <span aria-live="polite" className={`ml-auto inline-flex items-center gap-1 ${errorCount ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}>
          {errorCount ? <AlertTriangle className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
          {errorCount ? tt("errorsCount", { count: errorCount }) : status === "saved" && !dirty ? tt("saved") : tt("noErrors")}
        </span>
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden rounded-xl bg-foreground/[0.04] ring-1 ring-foreground/10 focus-within:ring-foreground/25">
        <div ref={gutterRef} aria-hidden className="absolute inset-y-0 left-0 hidden w-10 select-none overflow-hidden py-2 pr-2 text-right text-foreground/35 sm:block" style={{ font }}>
          {lines.map((_, i) => <div key={i} style={{ height: LINE_H }} className={byLine.has(i + 1) ? "text-red-500" : ""}>{i + 1}</div>)}
        </div>
        <div ref={preRef} aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden whitespace-pre py-2 pl-3 pr-3 sm:pl-12" style={{ font }}>
          {lines.map((l, i) => (
            <div key={i} style={{ height: LINE_H }}>
              {withSquiggles(highlightLine(l), byLine.get(i + 1) ?? []).map((p, k) => (
                <span key={k} className={`${p.cls} ${p.bad ? "underline decoration-red-500 decoration-wavy underline-offset-2" : ""}`} title={p.title}>{p.text}</span>
              ))}
              {l === "" ? "​" : null}
            </div>
          ))}
        </div>
        <textarea
          ref={taRef}
          value={source}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          aria-label={tt("editorLabel")}
          aria-describedby="dsl-shortcuts"
          className="absolute inset-0 h-full w-full resize-none overflow-auto whitespace-pre bg-transparent py-2 pl-3 pr-3 text-transparent caret-foreground outline-none selection:bg-sky-500/30 sm:pl-12"
          style={{ font, tabSize: 2 }}
          onChange={(e) => { setSource(e.target.value); setStatus("idle"); updateCaret(e.target); openSuggestions(e.target); }}
          onKeyDown={onKeyDown}
          onKeyUp={(e) => updateCaret(e.currentTarget)}
          onClick={(e) => { updateCaret(e.currentTarget); setPopup(null); }}
          onScroll={syncScroll}
          onBlur={() => setTimeout(() => setPopup(null), 120)}
        />
        {popup ? (
          <ul
            role="listbox"
            aria-label={tt("suggestions")}
            className="absolute z-10 max-h-52 w-64 overflow-auto rounded-xl bg-background p-1 text-xs shadow-xl ring-1 ring-foreground/10"
            style={{
              top: Math.min(caret.line * LINE_H + 12, 9999) - (taRef.current?.scrollTop ?? 0),
              left: Math.min(48 + (popup.from - source.lastIndexOf("\n", popup.from - 1) - 1) * 7.8, 260),
            }}
          >
            {popup.items.map((c, i) => (
              <li
                key={c.kind + c.label}
                role="option"
                aria-selected={i === popup.index}
                onMouseDown={(e) => { e.preventDefault(); accept(c); }}
                className={`flex cursor-pointer items-center justify-between rounded-lg px-2 py-1 ${i === popup.index ? "bg-foreground/10" : ""}`}
              >
                <span className="font-mono">{c.label}</span>
                <span className="ml-2 text-foreground/45">{c.detail ?? c.kind}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="flex flex-col gap-1 text-xs">
        {diags.slice(0, 4).map((d, i) => (
          <button
            key={i}
            type="button"
            className={`flex items-start gap-2 rounded-lg px-2 py-1 text-left ${d.severity === "warning" ? "bg-amber-500/10 text-amber-800 hover:bg-amber-500/15 dark:text-amber-300" : "bg-red-500/10 text-red-700 hover:bg-red-500/15 dark:text-red-300"}`}
            onClick={() => {
              const ta = taRef.current; if (!ta) return;
              const off = lines.slice(0, d.line - 1).reduce((n, l) => n + l.length + 1, 0) + d.col - 1;
              ta.focus(); ta.setSelectionRange(off, off + Math.max(1, d.endCol - d.col)); updateCaret(ta);
            }}
          >
            <span className="shrink-0 font-mono">{d.line}:{d.col}</span><span>{d.message}</span>
          </button>
        ))}
        {error ? <div role="alert" className="rounded-lg bg-red-500/10 px-2 py-1 text-red-700 dark:text-red-300">{error}</div> : null}
        <div id="dsl-shortcuts" className="flex flex-wrap items-center gap-x-3 text-foreground/50">
          <span>{tt("origin_" + loaded.origin)}</span>
          <span>{tt("line", { line: caret.line, col: caret.col })}</span>
          <span className="hidden sm:inline">{tt("shortcuts")}</span>
          <span className="sm:hidden">{tt("mobileNote")}</span>
          <span>{tt("dryRunNote")}</span>
        </div>
      </div>
    </div>
  );
}
