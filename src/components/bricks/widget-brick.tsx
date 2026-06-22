"use client";

import React from "react";
import { Code2, Play, Pencil, AlertTriangle, Settings2 } from "lucide-react";
import { useLocalWorkspace } from "@/components/providers/local-workspace-provider";
import { assetNameFromRef, readAssetFile } from "@/lib/local-workspace/assets";
import {
  buildWidgetSrcdoc,
  widgetLangFrom,
  widgetStarter,
  collectWidgetAssetNames,
  type WidgetLang,
} from "@/lib/widget-sandbox";

const LANGS: WidgetLang[] = ["html", "js", "ts", "jsx", "tsx"];

/**
 * Code-widget asset: HTML/JS/TS/TSX that renders inside a **sandboxed iframe**
 * (`allow-scripts`, no `allow-same-origin`) so it can never touch Killio's
 * session. Source lives inline in `content.code` (authored here) OR in an
 * uploaded `.html/.js/.ts/.tsx` asset (`content.url`, read as text). Works the
 * same online and in a local workspace.
 */
export function WidgetBrick({
  content,
  canEdit,
  onUpdate,
  layout,
}: {
  content: Record<string, any>;
  canEdit: boolean;
  onUpdate: (next: Record<string, any>) => void;
  layout?: string;
}) {
  const { getDir } = useLocalWorkspace();
  const url: string | undefined = typeof content.url === "string" ? content.url : undefined;

  // Resolve the source: inline code wins; otherwise read the linked asset/file.
  const [fileCode, setFileCode] = React.useState<string | null>(null);
  React.useEffect(() => {
    let cancelled = false;
    const inline = typeof content.code === "string" ? content.code : "";
    if (inline || !url) { setFileCode(null); return; }
    (async () => {
      try {
        if (url.startsWith("asset:")) {
          const dir = getDir();
          if (!dir) return;
          const file = await readAssetFile(dir, assetNameFromRef(url));
          const text = await file.text();
          if (!cancelled) setFileCode(text);
        } else {
          const res = await fetch(url.startsWith("/uploads/")
            ? `${process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000"}${url}`
            : url);
          const text = await res.text();
          if (!cancelled) setFileCode(text);
        }
      } catch { if (!cancelled) setFileCode(null); }
    })();
    return () => { cancelled = true; };
  }, [content.code, url, getDir]);

  const lang: WidgetLang =
    (content.widgetLang as WidgetLang) || widgetLangFrom(null, url, content.mimeType) || "html";
  const code = (typeof content.code === "string" && content.code) || fileCode || "";
  const args: Record<string, unknown> =
    content.widgetArgs && typeof content.widgetArgs === "object" ? content.widgetArgs : {};

  const isEmpty = !code.trim();
  const [editing, setEditing] = React.useState(false);
  const [draftLang, setDraftLang] = React.useState<WidgetLang>(lang);
  const [draftCode, setDraftCode] = React.useState(code);
  const [draftArgs, setDraftArgs] = React.useState(JSON.stringify(args, null, 2));
  const [argsError, setArgsError] = React.useState<string | null>(null);

  const openEditor = () => {
    setDraftLang(lang);
    setDraftCode(code || widgetStarter(lang));
    setDraftArgs(JSON.stringify(args, null, 2));
    setArgsError(null);
    setEditing(true);
  };

  const save = () => {
    let parsedArgs: Record<string, unknown> = {};
    if (draftArgs.trim()) {
      try { parsedArgs = JSON.parse(draftArgs); }
      catch (e) { setArgsError("Args must be valid JSON: " + String((e as Error).message)); return; }
    }
    onUpdate({
      ...content,
      kind: "widget",
      mediaType: "widget",
      // Inline code authored here; drop the file link so inline wins on reload.
      url: typeof content.code === "string" || !url ? "" : url,
      code: draftCode,
      widgetLang: draftLang,
      widgetArgs: parsedArgs,
      title: content.title || "Widget",
    });
    setEditing(false);
  };

  // Resolve local-workspace asset references (`asset:hola.png` or a bare
  // `hola.png`) to inline data: URIs so textures load inside the null-origin
  // sandbox. Cloud (/uploads, absolute) URLs are left as-is (they load over the
  // network). Async (reads files), so the srcdoc lands via state.
  const [srcdoc, setSrcdoc] = React.useState("");
  React.useEffect(() => {
    let cancelled = false;
    if (!code) { setSrcdoc(""); return; }
    (async () => {
      const argsStr = JSON.stringify(args);
      const names = collectWidgetAssetNames(code + " " + argsStr);
      const dir = names.length ? getDir() : null;
      const map: Record<string, string> = {};
      if (dir) {
        await Promise.all(names.map(async (name) => {
          try {
            const file = await readAssetFile(dir, name);
            const data: string = await new Promise((res, rej) => {
              const r = new FileReader();
              r.onload = () => res(String(r.result));
              r.onerror = () => rej(r.error);
              r.readAsDataURL(file);
            });
            map[name] = data;
          } catch { /* leave unresolved */ }
        }));
      }
      // Pass the asset map into the sandbox; it resolves `asset:` refs AFTER the
      // widget runs (args evaluated, dynamic markup produced) + on DOM mutations.
      const doc = buildWidgetSrcdoc({ lang, code, args, assets: map });
      if (!cancelled) setSrcdoc(doc);
    })();
    return () => { cancelled = true; };
  }, [lang, code, args, getDir]);

  // ── Editor ──────────────────────────────────────────────────────────────
  if (editing) {
    return (
      <div className="my-4 w-full max-w-3xl mx-auto rounded-xl border border-border bg-card overflow-hidden">
        <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2">
          <Code2 className="h-4 w-4 text-accent" />
          <span className="text-sm font-semibold">Widget</span>
          <select
            value={draftLang}
            onChange={(e) => {
              const nl = e.target.value as WidgetLang;
              setDraftLang(nl);
              if (!draftCode.trim()) setDraftCode(widgetStarter(nl));
            }}
            className="ml-2 h-7 rounded-md border border-border bg-background px-2 text-xs"
          >
            {LANGS.map((l) => <option key={l} value={l}>{l.toUpperCase()}</option>)}
          </select>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={() => setEditing(false)} className="h-7 rounded-md px-3 text-xs font-semibold text-muted-foreground hover:bg-muted/60">Cancel</button>
            <button onClick={save} className="inline-flex h-7 items-center gap-1.5 rounded-md bg-accent px-3 text-xs font-semibold text-accent-foreground hover:bg-accent/90"><Play className="h-3 w-3" /> Run & save</button>
          </div>
        </div>
        <textarea
          value={draftCode}
          onChange={(e) => setDraftCode(e.target.value)}
          spellCheck={false}
          className="block w-full resize-y bg-background px-3 py-2 font-mono text-[13px] leading-relaxed outline-none min-h-[220px]"
          placeholder={widgetStarter(draftLang)}
        />
        <div className="border-t border-border/60 px-3 py-2">
          <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground"><Settings2 className="h-3 w-3" /> Args (JSON passed to your function)</div>
          <textarea
            value={draftArgs}
            onChange={(e) => { setDraftArgs(e.target.value); setArgsError(null); }}
            spellCheck={false}
            className="block w-full resize-y bg-background font-mono text-[12px] outline-none min-h-[60px] rounded-md border border-border/50 px-2 py-1.5"
            placeholder='{ "name": "Killio" }'
          />
          {argsError && <p className="mt-1 text-[11px] text-red-500">{argsError}</p>}
        </div>
      </div>
    );
  }

  // ── Empty state ─────────────────────────────────────────────────────────
  if (isEmpty) {
    return (
      <div className="my-3 w-full max-w-3xl mx-auto">
        <button
          onClick={canEdit ? openEditor : undefined}
          className="flex w-full items-center gap-3 rounded-lg border border-dashed border-border/50 bg-muted/10 px-3 py-2.5 text-sm text-muted-foreground hover:border-accent/40 hover:bg-muted/20 transition-colors"
        >
          <Code2 className="h-[18px] w-[18px]" />
          <span>{canEdit ? "Create a widget (HTML / JS / TS / TSX)" : "Empty widget"}</span>
        </button>
      </div>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className={`group relative my-4 ${layout === "full" ? "w-full" : "w-full max-w-3xl mx-auto"}`}>
      <iframe
        title={content.title || "Widget"}
        sandbox="allow-scripts allow-popups allow-forms"
        srcDoc={srcdoc}
        className="w-full rounded-xl border border-border/40 bg-transparent"
        style={{ height: layout === "full" ? "70vh" : 420 }}
      />
      {canEdit && (
        <button
          onClick={openEditor}
          className="absolute right-2 top-2 hidden items-center gap-1 rounded-md border border-border bg-card/90 px-2 py-1 text-[11px] font-semibold shadow-sm backdrop-blur group-hover:inline-flex"
        >
          <Pencil className="h-3 w-3" /> Edit
        </button>
      )}
      {lang !== "html" && (
        <div className="pointer-events-none absolute left-2 top-2 hidden items-center gap-1 rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 group-hover:flex">
          <AlertTriangle className="h-2.5 w-2.5" /> sandboxed
        </div>
      )}
    </div>
  );
}
