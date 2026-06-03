"use client";

import React, { useState, useEffect, useRef } from "react";
import { FileText, LayoutDashboard, CreditCard, ExternalLink, User as UserIcon, Type, Heading1, Heading2, Heading3, Heading4, List, ListOrdered, CheckSquare, ChevronDown, Image as ImageIcon, Table, BarChart2, Link2 as LinkIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { ReferencePicker, ReferencePickerSelection } from "@/components/documents/reference-picker";
import { DocumentSummary, DocumentBrick } from "@/lib/api/documents";
import { BoardSummary } from "@/lib/api/contracts";
import { ReferenceResolver } from "@/lib/reference-resolver";
import { cn } from "@/lib/utils";
import { Portal } from "../ui/portal";
import { RichText, DiagramBlock } from "../ui/rich-text";
import { createRoot, type Root } from "react-dom/client";
import { resolveLucide, LUCIDE_REGISTRY } from "@/lib/lucide-icon-registry";
import { type SlashCommand, getSlashCommands } from "./slash-commands";
import { InlineFormatToolbar } from "./inline-format-toolbar";
import { useI18n, useTranslations } from "@/components/providers/i18n-provider";
import { getExperimentalEditorMode } from "@/hooks/use-experimental-editor-mode";
import { DatePickerPopover, EmojiPickerPopover, MathPickerPopover, formatDateToken, type DateTokenFormat } from "./inline-pickers";
import katex from "katex";
// @ts-ignore
import "katex/dist/katex.min.css";
import { WorkspaceMemberLike } from "@/lib/workspace-members";

interface TextBrickProps {
  id: string;
  text: string;
  onUpdate: (text: string) => void;
  onAddBrick?: (kind: string, afterBrickId?: string, parentProps?: any, initialContent?: any) => void;
  readonly?: boolean;
  documents: DocumentSummary[];
  boards: BoardSummary[];
  folders?: any[];
  activeBricks: DocumentBrick[];
  users?: WorkspaceMemberLike[];
  onPasteImage?: (payload: { file: File; cursorOffset: number; markdown: string }) => Promise<string | void> | string | void;
  onAiAction?: (action: string, contextText: string) => void;
  /** Opens the brick-comment composer for this brick (wired by brick-renderer).
   *  When absent the Comment action in the format toolbar is hidden. */
  onComment?: () => void;
  /** Style features to disable (hidden in the toolbar + not rendered). e.g. a
   *  database cell passes ["heading","size"] — no #/## and no [size:…]. */
  disabledStyles?: string[];
}

// Render a fenced diagram/preview block found in display HTML. `html` / `html[preview]`
// → sandboxed iframe; mermaid / grarkdown / erDiagram → real meshboard canvas.
function FencedRender({ lang, code }: { lang: string; code: string }) {
  if (/^html(\[preview\])?$/i.test(lang)) {
    return (
      <iframe
        srcDoc={code}
        sandbox="allow-scripts allow-popups"
        className="my-2 w-full rounded-lg border border-border/60 bg-white"
        style={{ height: 360 }}
        title="HTML preview"
      />
    );
  }
  return <DiagramBlock lang={lang} code={code} />;
}

// Strip diacritics + lowercase so "casa" / "Cásá" match each other.
const normForSearch = (s: string) =>
  (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

// Floating lucide-icon picker. Uses the same positioning algorithm as the
// inline format toolbar (place above selection, fall back below, clamp to
// viewport) and matches its visual style. Search filters by icon name AND
// by i18n synonyms (mesh.iconPicker.synonyms) so "casa" finds "home".
function LucideIconPicker({
  anchor, query, setQuery, onPick, onClose,
}: {
  anchor: { top: number; left: number; bottom?: number };
  query: string; setQuery: (v: string) => void;
  onPick: (name: string) => void;
  onClose: () => void;
}) {
  const ref = React.useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = React.useState({ top: anchor.top, left: anchor.left });
  const { messages } = useI18n();
  const t = useTranslations("mesh");
  // Read the synonyms map straight from i18n messages so it can be edited from
  // the locale files (es/en mesh.json → iconPicker.synonyms).
  const synonyms = React.useMemo(() => {
    const m = messages?.mesh as Record<string, unknown> | undefined;
    const ip = (m?.iconPicker as Record<string, unknown> | undefined) ?? {};
    return (ip.synonyms as Record<string, string>) ?? {};
  }, [messages]);

  React.useLayoutEffect(() => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const sw = window.innerWidth, sh = window.innerHeight;
    const margin = 12, gap = 10;
    let left = anchor.left - rect.width / 2;
    let top = anchor.top - rect.height - gap;
    const bottom = anchor.bottom ?? anchor.top;
    if (top < margin) top = bottom + gap;
    left = Math.max(margin, Math.min(sw - rect.width - margin, left));
    top = Math.max(margin, Math.min(sh - rect.height - margin, top));
    setPos({ top, left });
  }, [anchor.top, anchor.left, anchor.bottom, query]);

  const q = normForSearch(query);
  const filtered = React.useMemo(() => {
    const entries = Object.entries(LUCIDE_REGISTRY);
    if (!q) return entries.slice(0, 200);
    return entries.filter(([name]) => {
      if (normForSearch(name).includes(q)) return true;
      const syn = synonyms[name];
      if (syn && normForSearch(syn).includes(q)) return true;
      return false;
    }).slice(0, 200);
  }, [q, synonyms]);

  return (
    <div ref={ref}
      data-editor-floating-ui="true"
      data-lucide-icon-picker="true"
      className="fixed z-[1000] flex w-[320px] max-h-[360px] flex-col gap-2 rounded-xl border border-border bg-popover/95 p-2 shadow-xl backdrop-blur-md animate-in fade-in zoom-in-95 duration-100"
      style={{ top: pos.top, left: pos.left }}
      onMouseDown={(e) => e.preventDefault()}
    >
      <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)}
        placeholder={t("iconPicker.placeholder")}
        className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs text-foreground outline-none focus:border-accent/50"
        onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); onClose(); } }}
      />
      <div className="grid grid-cols-8 gap-1 overflow-y-auto">
        {filtered.map(([name, Icon]) => (
          <button key={name} type="button" title={name}
            onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
            onClick={() => onPick(name)}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent/15 hover:text-foreground">
            <Icon size={16} strokeWidth={2} />
          </button>
        ))}
        {filtered.length === 0 && <p className="col-span-8 text-center text-[10px] text-muted-foreground">—</p>}
      </div>
      <p className="text-[9px] text-center text-muted-foreground">{t("iconPicker.hint")}</p>
    </div>
  );
}

const DEFAULT_PASTED_IMAGE_NAME = "pasted-image.png";
const TEXT_SPLIT_DRAG_MIME = "application/x-killio-text-split";

type MathMode = "block" | "inline";

type DragSelectionPayload = {
  startOffset: number;
  endOffset: number;
  selectedMarkdown: string;
  sourceMarkdown: string;
};

const extractSingleBlockMath = (markdown: string): string | null => {
  const match = markdown.match(/^\s*\$\$\s*\n?([\s\S]*?)\n?\s*\$\$\s*$/);
  if (!match) return null;
  const formula = match[1].trim();
  return formula.length > 0 ? formula : null;
};

const toMathMarkdown = (formula: string, mode: MathMode): string => {
  const clean = formula.trim();
  if (!clean) return "";
  return mode === "block" ? `$$\n${clean}\n$$` : `$${clean}$`;
};



const logPasteDebug = (..._args: unknown[]) => { /* removed debug logging */ };

export const UnifiedTextBrick: React.FC<TextBrickProps> = ({
  id,
  text,
  onUpdate,
  onAddBrick,
  readonly,
  documents,
  boards,
  folders = [],
  activeBricks,
  users = [],
  onPasteImage,
  onAiAction,
  onComment,
  disabledStyles = [],
}) => {
  const noHeadingStyle = disabledStyles.includes("heading");
  const noSizeStyle = disabledStyles.includes("size");
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [pickerFilter, setPickerFilter] = useState<any[] | undefined>(undefined);
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [isLinkInputOpen, setIsLinkInputOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [isMathPickerOpen, setIsMathPickerOpen] = useState(false);
  const [mathPickerInitialFormula, setMathPickerInitialFormula] = useState("");
  const [mathPickerInitialMode, setMathPickerInitialMode] = useState<MathMode>("block");
  const [mathInsertMode, setMathInsertMode] = useState<"insert" | "replace-all">("insert");
  const [pickerCursorOffset, setPickerCursorOffset] = useState<number | null>(null);
  const [isSlashOpen, setIsSlashOpen] = useState(false);
  const [slashQuery, setSlashQuery] = useState("");
  const [slashMenuPosition, setSlashMenuPosition] = useState({ top: 0, left: 0 });
  const [slashRange, setSlashRange] = useState<{ from: number; to: number } | null>(null);
  const [slashActiveIndex, setSlashActiveIndex] = useState(0);
  const [isFormatToolbarOpen, setIsFormatToolbarOpen] = useState(false);
  const [isIconPickerOpen, setIsIconPickerOpen] = useState(false);
  const [iconPickerQuery, setIconPickerQuery] = useState("");
  // Tracks the text of the last selection the user dismissed (via Esc on the
  // format toolbar) so a stray keyup/mouseup doesn't reopen the toolbar on
  // the same selection.
  const dismissedSelectionRef = useRef<string>("");
  const [formatToolbarPosition, setFormatToolbarPosition] = useState({ top: 0, left: 0, bottom: 0 });
  const contentRef = useRef<HTMLDivElement>(null);
  const readonlyRef = useRef<HTMLDivElement>(null);
  // Diagram (mermaid / grarkdown / erDiagram / html-preview) fenced blocks found
  // during the last display render — mounted as real React canvases by an effect.
  const diagramBlocksRef = useRef<Array<{ lang: string; code: string }>>([]);
  const diagramRootsRef = useRef<Root[]>([]);
  // Last display HTML written to contentRef — guards the sync effect from
  // re-writing (and remounting diagrams) after React injects canvas DOM.
  const lastDisplayHtmlRef = useRef<string | null>(null);
  // textContent treats SVG / placeholder spans as empty. A brick that only
  // contains a lucide icon, a diagram block, or an inline image should NOT
  // show the "empty" placeholder. Check for any rendered atomic node too.
  const isBrickEmpty = (el: HTMLElement | null) => {
    if (!el) return true;
    if ((el.textContent || "").trim().length > 0) return false;
    return !el.querySelector("[data-lu-icon],[data-diagram-idx],img,svg,canvas,[data-math],[data-math-block],pre");
  };
  const savedRangeRef = useRef<Range | null>(null);
  const pasteInFlightRef = useRef(false);
  const dragSelectionRef = useRef<DragSelectionPayload | null>(null);
  const router = useRouter();
  const { locale } = useI18n();
  const tDetail = useTranslations("document-detail");
  const tBoardDetail = useTranslations("board-detail");
  const slashCommands = React.useMemo(() => getSlashCommands(tDetail as any), [tDetail]);

  // Unmount any mounted fenced-diagram roots (deferred so we never unmount
  // synchronously during React's commit phase).
  const unmountDiagrams = React.useCallback(() => {
    const roots = diagramRootsRef.current;
    diagramRootsRef.current = [];
    roots.forEach((r) => setTimeout(() => { try { r.unmount(); } catch { /* noop */ } }, 0));
  }, []);

  // Mount each fenced diagram/preview placeholder (collected in diagramBlocksRef
  // during the last forDisplay render) into `host` as a real React canvas/iframe.
  const mountDiagramsIn = React.useCallback((host: HTMLElement | null) => {
    if (!host) return;
    const blocks = diagramBlocksRef.current;
    const roots: Root[] = [];
    // Fenced diagram blocks (mermaid / grarkdown / erDiagram / html preview).
    const diagPlaceholders = Array.from(host.querySelectorAll<HTMLElement>("[data-diagram-idx]"));
    diagPlaceholders.forEach((el) => {
      const idx = parseInt(el.getAttribute("data-diagram-idx") || "", 10);
      const block = blocks[idx];
      if (!block) return;
      const root = createRoot(el);
      root.render(<FencedRender lang={block.lang} code={block.code} />);
      roots.push(root);
    });
    // [lu:NAME:SW] icon tokens → real lucide-react icon. Inherits color (via
    // currentColor) and size (1em) from the surrounding text so headings /
    // colored spans scale automatically.
    const iconEls = Array.from(host.querySelectorAll<HTMLElement>("[data-lu-icon]"));
    iconEls.forEach((el) => {
      if (el.dataset.luMounted === "1") return;
      const name = el.getAttribute("data-lu-icon") || "";
      const sw = parseFloat(el.getAttribute("data-lu-sw") || "2") || 2;
      const Icon = resolveLucide(name);
      if (!Icon) return;
      // Mount into the inner [data-lu-mount] span so we don't wipe the
      // sibling sr-only token text used for copy.
      const mountEl = el.querySelector<HTMLElement>("[data-lu-mount]");
      if (!mountEl) return;
      el.dataset.luMounted = "1";
      const root = createRoot(mountEl);
      root.render(<Icon size="1em" color="currentColor" strokeWidth={sw} />);
      roots.push(root);
    });
    if (roots.length) diagramRootsRef.current = roots;
  }, []);

  // Read-only display HTML is painted by JSX (dangerouslySetInnerHTML), which
  // also fills diagramBlocksRef. Mount the diagrams after commit. Editable mode
  // mounts inline where it sets innerHTML (sync effect / blur).
  useEffect(() => {
    if (!readonly) return;
    unmountDiagrams();
    mountDiagramsIn(readonlyRef.current);
    return () => unmountDiagrams();
  }, [readonly, text, mountDiagramsIn, unmountDiagrams]);

  useEffect(() => () => unmountDiagrams(), [unmountDiagrams]);

  const tokenEscapeAttr = (value: string): string => {
    return value.replace(/&/g, "&amp;").replace(/\"/g, "&quot;");
  };

  const escapeHtml = (value: string): string => {
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  };

  const escapeHtmlAttr = (value: string): string => {
    return value
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  };

  const normalizeImageUrl = (rawUrl: string): string => {
    const url = rawUrl.trim();
    if (/^https?:\/\//i.test(url)) return url;
    if (/^data:image\//i.test(url)) return url;
    if (url.startsWith("/")) return url;
    return "";
  };

  // Experimental Editor Mode: the contentEditable IS the style tree. After live
  // edits it accumulates cruft — empty style spans, redundant nested spans of the
  // same kind, adjacent twins, and browser-injected plain <span>s — which would
  // serialize to broken markdown like [color:x][color:x]…[/color][/color]. This
  // normalizes the tree (in place) so revertToMarkdown emits clean, balanced tags.
  const PRESERVE_SPAN = "[data-lu-icon],[data-token],[data-math],.mention-pill,.user-mention,.deep-pill";
  const styleSignature = (el: Element): string | null => {
    const tag = el.tagName.toLowerCase();
    if (tag === "span") {
      const c = el.getAttribute("data-color");
      const b = el.getAttribute("data-bg");
      const s = el.getAttribute("data-size");
      if (c || b || s) return `span|${c ?? ""}|${b ?? ""}|${s ?? ""}`;
      return null;
    }
    if (["b", "strong", "i", "em", "u", "s", "strike", "code"].includes(tag)) return tag;
    return null;
  };
  const STYLE_SELECTOR = "span[data-color],span[data-bg],span[data-size],b,strong,i,em,u,s,strike,code";
  const normalizeStyleTree = (container: HTMLElement) => {
    // 1. Unwrap plain <span> with no style signature (browser-injected wrappers),
    //    preserving icons/pills/math/tokens.
    container.querySelectorAll("span").forEach((sp) => {
      if (styleSignature(sp) !== null) return;
      if (sp.closest(PRESERVE_SPAN)) return; // self or inside an icon/pill/math/token
      if (sp.querySelector(PRESERVE_SPAN)) return;
      if (sp.hasAttribute("data-lu-mount")) return;
      const p = sp.parentNode;
      if (!p) return;
      while (sp.firstChild) p.insertBefore(sp.firstChild, sp);
      p.removeChild(sp);
    });
    let changed = true;
    let guard = 0;
    while (changed && guard++ < 25) {
      changed = false;
      // 2. Remove empty style elements.
      container.querySelectorAll(STYLE_SELECTOR).forEach((el) => {
        if ((el.textContent || "").length === 0 && !el.querySelector("[data-lu-icon],img,[data-math]")) {
          el.remove();
          changed = true;
        }
      });
      // 3. Unwrap a style element nested directly inside an identical-signature parent.
      container.querySelectorAll(STYLE_SELECTOR).forEach((el) => {
        const parent = el.parentElement;
        if (parent && styleSignature(parent) && styleSignature(parent) === styleSignature(el)) {
          while (el.firstChild) parent.insertBefore(el.firstChild, el);
          el.remove();
          changed = true;
        }
      });
      // 4. Merge adjacent siblings with the same signature.
      container.querySelectorAll(STYLE_SELECTOR).forEach((el) => {
        const next = el.nextSibling as Element | null;
        if (next && next.nodeType === Node.ELEMENT_NODE && styleSignature(el) && styleSignature(next) === styleSignature(el)) {
          while (next.firstChild) el.appendChild(next.firstChild);
          next.remove();
          changed = true;
        }
      });
    }
    container.normalize();
  };

  /**
   * Converts rendered HTML back to a plain markdown string (with \n)
   * This is used for saving and for the focus state.
   */
  const revertToMarkdown = (html: string): string => {
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = html;
    if (getExperimentalEditorMode()) normalizeStyleTree(tempDiv);

    let markdown = "";

    const walk = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        markdown += node.textContent || "";
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as Element;
        const tag = el.tagName.toLowerCase();

        const tokenAttr = el.getAttribute("data-token");
        if (tokenAttr) {
          markdown += tokenAttr;
          return;
        }
        // Lucide icon placeholder — serialize back to the `[lu:NAME:SW]` token
        // and skip recursing into its inner sr-only text + mount span.
        if (el.hasAttribute("data-lu-icon")) {
          const luName = el.getAttribute("data-lu-icon") || "";
          const luSw = el.getAttribute("data-lu-sw") || "2";
          markdown += `[lu:${luName}:${luSw}]`;
          return;
        }

        if (tag === "br") {
          markdown += "\n";
        } else if (el.hasAttribute("data-md-table") || el.hasAttribute("data-md-quote")) {
          // Tables / blockquotes / callouts carry their source markdown so we
          // can round-trip them losslessly.
          if (markdown.length > 0 && !markdown.endsWith("\n")) markdown += "\n";
          markdown += el.getAttribute("data-md-table") || el.getAttribute("data-md-quote") || "";
          if (!markdown.endsWith("\n")) markdown += "\n";
          return;
        } else if (tag === "div" || tag === "p" || tag === "h1" || tag === "h2" || tag === "h3" || tag === "h4" || tag === "h5" || tag === "h6" || tag === "li") {
          // Block level elements should start on a new line
          if (markdown.length > 0 && !markdown.endsWith("\n")) {
            markdown += "\n";
          }

          if (tag === "h1") markdown += "# ";
          if (tag === "h2") markdown += "## ";
          if (tag === "h3") markdown += "### ";
          if (tag === "h4") markdown += "#### ";
          if (tag === "h5") markdown += "##### ";
          if (tag === "h6") markdown += "###### ";
          if (tag === "li") {
            const parent = el.parentElement?.tagName.toLowerCase();
            markdown += parent === "ol" ? "1. " : "- ";
          }

          Array.from(el.childNodes).forEach(walk);

          if (!markdown.endsWith("\n")) {
            markdown += "\n";
          }
        } else if (tag === "b" || tag === "strong") {
          markdown += "**";
          Array.from(el.childNodes).forEach(walk);
          markdown += "**";
        } else if (tag === "i" || tag === "em") {
          markdown += "*";
          Array.from(el.childNodes).forEach(walk);
          markdown += "*";
        } else if (tag === "u") {
          markdown += "__";
          Array.from(el.childNodes).forEach(walk);
          markdown += "__";
        } else if (tag === "s" || tag === "strike") {
          markdown += "~~";
          Array.from(el.childNodes).forEach(walk);
          markdown += "~~";
        } else if (el.hasAttribute('data-math')) {
            const math = el.getAttribute('data-math') || '';
            const isBlock = el.hasAttribute('data-math-block');
            if (isBlock) {
               if (markdown.length > 0 && !markdown.endsWith('\n')) markdown += '\n';
              markdown += `$$\n${math}\n$$`;
            } else {
              markdown += `$${math}$`;
            }
            return;
          } else if (tag === "pre") {
          const lang = (el as HTMLElement).getAttribute("data-code-block") || "";
          const codeEl = el.querySelector("code");
          const code = codeEl ? (codeEl.textContent || "") : (el.textContent || "");
          if (markdown.length > 0 && !markdown.endsWith("\n")) markdown += "\n";
          markdown += "```" + lang + "\n" + code + "\n```";
          return;
        } else if (tag === "code") {
          markdown += "`" + (el.textContent || "") + "`";
          return;
        } else if (el.classList.contains("mention-pill")) {
          const type = el.getAttribute("data-type");
          const uid = el.getAttribute("data-id");
          const label = el.textContent || "";
          markdown += `@[${type}:${uid}:${label}]`;
        } else if (el.classList.contains("user-mention")) {
          const uid = el.getAttribute("data-id");
          const label = el.textContent || "";
          markdown += `@[user:${uid}:${label.replace('@', '')}]`;
        } else if (tag === "span" && el.hasAttribute("data-bg")) {
          const bg = el.getAttribute("data-bg") || "transparent";
          markdown += `[bg:${bg}]`;
          Array.from(el.childNodes).forEach(walk);
          markdown += "[/bg]";
          return;
        } else if (tag === "span" && el.hasAttribute("data-color")) {
          const color = el.getAttribute("data-color") || "default";
          markdown += `[color:${color}]`;
          Array.from(el.childNodes).forEach(walk);
          markdown += "[/color]";
          return;
        } else if (tag === "span" && el.hasAttribute("data-size")) {
          const size = el.getAttribute("data-size") || "1rem";
          markdown += `[size:${size}]`;
          Array.from(el.childNodes).forEach(walk);
          markdown += "[/size]";
          return;
        } else if (tag === "a" && (el.getAttribute("data-link") || el.getAttribute("href"))) {
          const href = el.getAttribute("data-link") || el.getAttribute("href") || "";
          markdown += `[link:${href}]`;
          Array.from(el.childNodes).forEach(walk);
          markdown += "[/link]";
          return;
        } else if (el.classList.contains("deep-pill")) {
          const prefix = el.getAttribute("data-prefix") || "#";
          const inner = el.getAttribute("data-inner") || "";
          markdown += `${prefix}[${inner}]`;
        } else {
          Array.from(el.childNodes).forEach(walk);
        }
      }
    };

    const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    const balanceInlineTags = (input: string): string => {
      const defs: Array<{ open: RegExp; close: string }> = [
        { open: /\[color:[^\]]+\]/g, close: "[/color]" },
        { open: /\[bg:[^\]]+\]/g, close: "[/bg]" },
        { open: /\[size:[^\]]+\]/g, close: "[/size]" },
        { open: /\[width:[^\]]+\]/g, close: "[/width]" },
        { open: /\[link:[^\]]+\]/g, close: "[/link]" },
      ];

      let output = input;
      for (const def of defs) {
        const openCount = (output.match(def.open) || []).length;
        const closeCount = (output.match(new RegExp(escapeRegex(def.close), "g")) || []).length;
        if (openCount > closeCount) {
          output += def.close.repeat(openCount - closeCount);
        }
      }
      return output;
    };

    Array.from(tempDiv.childNodes).forEach(walk);
    return balanceInlineTags(markdown)
      .replace(/\u00a0/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/\n$/, "");
  };

  // Markdown offset of the caret, faithfully mirroring revertToMarkdown's per-node
  // output (heading prefixes, block newlines, **/*/__ wrappers, [color:]\u2026, lucide,
  // pills) but STOPPING at (anchorNode, anchorOffset). The old version only summed
  // visible text length, which is correct in classic source view but WRONG in
  // Experimental mode where the editable holds rendered HTML \u2014 so @/icon inserts
  // landed at the wrong place. This makes the offset correct in both modes.
  const markdownLengthUpToCaret = (root: HTMLElement, anchorNode: Node, anchorOffset: number): number => {
    let md = "";
    let found = false;
    const block = new Set(["div", "p", "h1", "h2", "h3", "h4", "h5", "h6", "li"]);
    const headingHash: Record<string, string> = { h1: "# ", h2: "## ", h3: "### ", h4: "#### ", h5: "##### ", h6: "###### " };
    const walkChildren = (el: Node) => {
      for (const c of Array.from(el.childNodes)) { walk(c); if (found) return; }
    };
    const wrap = (open: string, close: string, el: Node) => { md += open; walkChildren(el); if (found) return; md += close; };
    const walk = (node: Node) => {
      if (found) return;
      if (node === anchorNode) {
        if (node.nodeType === Node.TEXT_NODE) {
          md += (node.textContent || "").replace(/\u200b/g, "").slice(0, anchorOffset);
        } else {
          const kids = Array.from(node.childNodes);
          for (let i = 0; i < Math.min(anchorOffset, kids.length); i++) { walk(kids[i]); if (found) return; }
        }
        found = true;
        return;
      }
      if (node.nodeType === Node.TEXT_NODE) { md += (node.textContent || "").replace(/\u200b/g, ""); return; }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      const el = node as HTMLElement;
      const tag = el.tagName.toLowerCase();
      if (el.getAttribute("data-token")) { md += el.getAttribute("data-token") || ""; return; }
      if (el.hasAttribute("data-lu-icon")) { md += `[lu:${el.getAttribute("data-lu-icon") || ""}:${el.getAttribute("data-lu-sw") || "2"}]`; return; }
      if (tag === "br") { md += "\n"; return; }
      if (el.hasAttribute("data-md-table") || el.hasAttribute("data-md-quote")) {
        if (md.length > 0 && !md.endsWith("\n")) md += "\n";
        md += el.getAttribute("data-md-table") || el.getAttribute("data-md-quote") || "";
        if (!md.endsWith("\n")) md += "\n";
        return;
      }
      if (block.has(tag)) {
        if (md.length > 0 && !md.endsWith("\n")) md += "\n";
        if (headingHash[tag]) md += headingHash[tag];
        if (tag === "li") md += (el.parentElement?.tagName.toLowerCase() === "ol" ? "1. " : "- ");
        walkChildren(el); if (found) return;
        if (!md.endsWith("\n")) md += "\n";
        return;
      }
      if (tag === "b" || tag === "strong") return wrap("**", "**", el);
      if (tag === "i" || tag === "em") return wrap("*", "*", el);
      if (tag === "u") return wrap("__", "__", el);
      if (tag === "s" || tag === "strike") return wrap("~~", "~~", el);
      if (el.hasAttribute("data-math")) { const m = el.getAttribute("data-math") || ""; md += el.hasAttribute("data-math-block") ? `$$\n${m}\n$$` : `$${m}$`; return; }
      if (tag === "pre") { const lang = el.getAttribute("data-code-block") || ""; const code = el.querySelector("code")?.textContent ?? el.textContent ?? ""; if (md.length > 0 && !md.endsWith("\n")) md += "\n"; md += "```" + lang + "\n" + code + "\n```"; return; }
      if (tag === "code") { md += "`" + (el.textContent || "") + "`"; return; }
      if (el.classList.contains("mention-pill")) { md += `@[${el.getAttribute("data-type")}:${el.getAttribute("data-id")}:${el.textContent || ""}]`; return; }
      if (el.classList.contains("user-mention")) { md += `@[user:${el.getAttribute("data-id")}:${(el.textContent || "").replace("@", "")}]`; return; }
      if (tag === "span" && el.hasAttribute("data-bg")) return wrap(`[bg:${el.getAttribute("data-bg") || "transparent"}]`, "[/bg]", el);
      if (tag === "span" && el.hasAttribute("data-color")) return wrap(`[color:${el.getAttribute("data-color") || "default"}]`, "[/color]", el);
      if (tag === "span" && el.hasAttribute("data-size")) return wrap(`[size:${el.getAttribute("data-size") || "1rem"}]`, "[/size]", el);
      if (tag === "a" && (el.getAttribute("data-link") || el.getAttribute("href"))) return wrap(`[link:${el.getAttribute("data-link") || el.getAttribute("href") || ""}]`, "[/link]", el);
      if (el.classList.contains("deep-pill")) { md += `${el.getAttribute("data-prefix") || "#"}[${el.getAttribute("data-inner") || ""}]`; return; }
      walkChildren(el);
    };
    Array.from(root.childNodes).forEach((c) => walk(c));
    return md.length;
  };

  const getMarkdownCursorOffset = (root: HTMLElement | null): number | null => {
    if (!root || typeof window === "undefined") return null;
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return null;
    const range = selection.getRangeAt(0);
    if (!root.contains(range.startContainer)) return null;
    // Mirror revertToMarkdown so the offset is right even in Experimental mode
    // (rendered HTML), where heading/bold/colour markup makes the visible text
    // length differ from the markdown.
    return markdownLengthUpToCaret(root, range.startContainer, range.startOffset);
  };

  const getMarkdownOffsetAtPosition = (
    root: HTMLElement | null,
    anchorNode: Node,
    anchorOffset: number,
  ): number | null => {
    if (!root || !root.contains(anchorNode)) return null;
    return markdownLengthUpToCaret(root, anchorNode, anchorOffset);
  };

  const getSelectedMarkdownRange = (): DragSelectionPayload | null => {
    if (!contentRef.current || typeof window === "undefined") return null;
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;

    const range = selection.getRangeAt(0);
    const root = contentRef.current;

    if (!root.contains(range.commonAncestorContainer)) return null;

    const startRaw = getMarkdownOffsetAtPosition(root, range.startContainer, range.startOffset);
    const endRaw = getMarkdownOffsetAtPosition(root, range.endContainer, range.endOffset);
    if (startRaw == null || endRaw == null) return null;

    const sourceMarkdown = revertToMarkdown(root.innerHTML || "");
    const startOffset = Math.max(0, Math.min(startRaw, endRaw));
    const endOffset = Math.max(0, Math.max(startRaw, endRaw));
    if (endOffset <= startOffset) return null;

    const selectedMarkdown = sourceMarkdown.slice(startOffset, endOffset);
    if (!selectedMarkdown) return null;

    return {
      startOffset,
      endOffset,
      selectedMarkdown,
      sourceMarkdown,
    };
  };

  const renderReferencePart = (part: any): string => {
    const documentIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-file-text"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>`;
    const boardIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-layout-dashboard"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>`;
    const cardIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-credit-card"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>`;
    const userIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-user"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;

    if (part.type === 'mention') {
      const { mentionType: type, id: uid, name } = part;
      if (type === 'user') {
        const token = `@[user:${uid}:${name}]`;
        return `<span contenteditable="false" title="${tokenEscapeAttr(tDetail("refOpenHint"))}" data-token="${tokenEscapeAttr(token)}" class="user-mention inline-flex items-center gap-1.5 bg-primary/10 text-primary border border-primary/20 rounded pl-1.5 pr-2 py-0.5 font-medium transition-colors hover:bg-primary/20" data-type="${type}" data-id="${uid}">${userIcon} @${name}</span>`;
      }
      let icon = documentIcon;
      if (type === 'board' || type === 'mesh') icon = boardIcon;
      if (type === 'card') icon = cardIcon;
      const token = `@[${type}:${uid}:${name}]`;
      return `<span contenteditable="false" title="${tokenEscapeAttr(tDetail("refOpenHint"))}" data-token="${tokenEscapeAttr(token)}" class="mention-pill inline-flex items-center gap-1.5 bg-accent/10 text-accent border border-accent/20 rounded px-1.5 py-0.5 font-medium transition-colors hover:bg-accent/20" data-type="${type}" data-id="${uid}">${icon} ${name}</span>`;
    }

    if (part.type === 'deep') {
      const token = `${part.prefix}[${part.inner}]`;
      return `<span contenteditable="false" data-token="${tokenEscapeAttr(token)}" class="deep-pill inline-flex items-center gap-1.5 bg-amber-500/10 text-amber-600 border border-amber-500/20 rounded px-1.5 py-0.5 font-medium cursor-pointer transition-colors hover:bg-amber-500/20" data-prefix="${part.prefix}" data-inner="${part.inner}"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-calculator"><rect width="16" height="20" x="4" y="2" rx="2"/><line x1="8" x2="16" y1="6" y2="6"/><line x1="16" x2="16" y1="14" y2="18"/><path d="M16 10h.01"/><path d="M12 10h.01"/><path d="M8 10h.01"/><path d="M12 14h.01"/><path d="M8 14h.01"/><path d="M12 18h.01"/><path d="M8 18h.01"/></svg> ${part.label}</span>`;
    }

    return typeof part === 'string' ? escapeHtml(part) : String(part || '');
  };

  const processMarkdownWithPills = (rawText: string): string => {
    // In edit mode: keep code blocks as raw markdown text so they are editable.
    // Only pills/references are rendered as interactive spans.
    const richParts = ReferenceResolver.renderRich(rawText || "", { documents, boards, activeBricks, users });
    return richParts
      .map((part) => (typeof part === 'string' ? escapeHtml(part).replace(/\n/g, '<br>') : renderReferencePart(part)))
      .join('');
  };

  /**
   * Converts a markdown string (with \n) to rich semantic HTML for display
   */
  const processPseudoMarkdown = (rawText: string, forDisplay = false): string => {
    if (forDisplay) diagramBlocksRef.current = [];
    // Pre-extract fenced code blocks so they bypass reference + markdown processing.
    // Lang may carry brackets (e.g. `html[preview]`), so allow [\w[\]-].
    const codeBlocks: Array<{ lang: string; code: string }> = [];
    let sanitized = (rawText || "").replace(/```([\w[\]-]*)\r?\n([\s\S]*?)```/g, (_, lang, code) => {
      const idx = codeBlocks.length;
      codeBlocks.push({ lang: lang || "", code: code.replace(/\n$/, "") });
      return `\x00CB${idx}\x00`;
    });

    // Pre-extract math blocks
    const mathBlocks: Array<{ formula: string; isBlock: boolean }> = [];
    sanitized = sanitized.replace(/\$\$([\s\S]*?)\$\$/g, (_, formula) => {
      const idx = mathBlocks.length;
      mathBlocks.push({ formula: formula.trim(), isBlock: true });
      return `\x00MB${idx}\x00`;
    });
    sanitized = sanitized.replace(/\$([^\$\n]+?)\$/g, (_, formula) => {
      const idx = mathBlocks.length;
      mathBlocks.push({ formula: formula.trim(), isBlock: false });
      return `\x00MI${idx}\x00`;
    });

    const richParts = ReferenceResolver.renderRich(sanitized, { documents, boards, activeBricks, users });
    const withLinks = richParts.map((part) => (typeof part === 'string' ? part : renderReferencePart(part))).join("");

    const lines = withLinks.split('\n');
    let html = "";
    let listBuffer: string[] = [];
    let listType: "ul" | "ol" | null = null;
    let tableBuffer: string[] = [];
    let quoteBuffer: string[] = [];

    const formatLeafInline = (t: string) => {
      let tFormat = t
      // [lu:NAME:SW] → lucide icon placeholder. Outer wrapper carries the
      // attributes + an invisible-but-selectable text child holding the raw
      // token (so selecting + copying yields `[lu:NAME:SW]` and pastes back
      // into another text brick as the same icon). The mount target is the
      // inner [data-lu-mount] span so createRoot doesn't wipe the token text.
      .replace(/\[lu:([\w-]+)(?::([\d.]+))?\]/g, (_, name: string, sw?: string) => {
        const tok = `[lu:${name}${sw ? `:${sw}` : ""}]`;
        return `<span data-lu-icon="${escapeHtmlAttr(name)}" data-lu-sw="${escapeHtmlAttr(sw ?? "2")}" contenteditable="false" class="relative inline-block h-[1em] w-[1em] align-[-0.15em]"><span aria-hidden="false" class="pointer-events-none absolute inset-0 select-text opacity-0">${escapeHtml(tok)}</span><span data-lu-mount class="absolute inset-0 inline-flex"></span></span>`;
      })
      // [t:UNIX:date|time|time-to] → locale-formatted date pill. Carries the raw
      // token in data-token so revertToMarkdown serializes it straight back, and
      // contenteditable=false so it edits as one atomic unit.
      .replace(/\[t:(\d+):(date|time|time-to)\]/g, (_, unixStr: string, fmt: string) => {
        const tok = `[t:${unixStr}:${fmt}]`;
        const label = formatDateToken(Number(unixStr), fmt as DateTokenFormat, locale) || tok;
        return `<span data-token="${escapeHtmlAttr(tok)}" contenteditable="false" class="inline-flex items-center rounded bg-accent/10 text-accent px-1 text-[0.95em] font-medium align-baseline">${escapeHtml(label)}</span>`;
      })
      .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt: string, rawUrl: string) => {
        const src = normalizeImageUrl(rawUrl);
        if (!src) return `![${escapeHtml(alt)}](${escapeHtml(rawUrl)})`;
        return `<img src="${escapeHtmlAttr(src)}" alt="${escapeHtmlAttr(alt)}" class="my-2 max-h-[460px] w-full rounded-md border border-border/60 object-contain bg-muted/20" loading="lazy" />`;
      })
      .replace(/`([^`]+)`/g, '<code class="bg-muted/60 rounded px-1 py-0.5 text-xs font-mono border border-border/60">$1</code>')
      .replace(/\*\*(.*?)\*\*/g, "<b>$1</b>")
      .replace(/__(.*?)__/g, "<u>$1</u>")
      .replace(/\*(.*?)\*/g, "<i>$1</i>")
      .replace(/~~(.*?)~~/g, "<s>$1</s>");

      tFormat = tFormat.replace(/\x00MI(\d+)\x00/g, (_, idxStr) => {
        const mInfo = mathBlocks[parseInt(idxStr)];
        if (!mInfo) return "";
        try {
          return `<span contenteditable="false" data-math="${escapeHtmlAttr(mInfo.formula)}" class="mx-1 render-math math-inline inline-block whitespace-nowrap">${katex.renderToString(mInfo.formula, { throwOnError: false, displayMode: false })}</span>`;
        } catch (e) {
          return `<span contenteditable="false" data-math="${escapeHtmlAttr(mInfo.formula)}" class="mx-1 text-red-500">$${escapeHtml(mInfo.formula)}$</span>`;
        }
      });
      return tFormat;
    };

    const formatInline = (t: string): string => {
      const findBalancedClose = (
        source: string,
        startCursor: number,
        openToken: string,
        closeToken: string,
      ): number => {
        let depth = 1;
        let cursor = startCursor;

        while (cursor < source.length) {
          const nextOpen = source.indexOf(openToken, cursor);
          const nextClose = source.indexOf(closeToken, cursor);

          if (nextClose === -1) return -1;

          if (nextOpen !== -1 && nextOpen < nextClose) {
            depth += 1;
            cursor = nextOpen + openToken.length;
            continue;
          }

          depth -= 1;
          if (depth === 0) return nextClose;
          cursor = nextClose + closeToken.length;
        }

        return -1;
      };

      let result = "";
      let cursor = 0;

      const emitPlain = (chunk: string) => {
        if (!chunk) return;
        result += formatLeafInline(chunk);
      };

      while (cursor < t.length) {
        const bgStart    = t.indexOf('[bg:',    cursor);
        const colorStart = t.indexOf('[color:', cursor);
        const linkStart  = t.indexOf('[link:',  cursor);
        const sizeStart  = t.indexOf('[size:',  cursor);
        const widthStart = t.indexOf('[width:', cursor);
        let nextStart = -1;
        let nextKind: 'bg' | 'color' | 'link' | 'size' | 'width' | null = null;

        const candidates = [
          bgStart    !== -1 ? { start: bgStart,    kind: 'bg'    as const } : null,
          colorStart !== -1 ? { start: colorStart, kind: 'color' as const } : null,
          linkStart  !== -1 ? { start: linkStart,  kind: 'link'  as const } : null,
          sizeStart  !== -1 ? { start: sizeStart,  kind: 'size'  as const } : null,
          widthStart !== -1 ? { start: widthStart, kind: 'width' as const } : null,
        ].filter(Boolean) as { start: number; kind: 'bg' | 'color' | 'link' | 'size' | 'width' }[];

        if (candidates.length > 0) {
          candidates.sort((a, b) => a.start - b.start);
          nextStart = candidates[0].start;
          nextKind  = candidates[0].kind;
        }

        if (nextStart === -1) {
          emitPlain(t.slice(cursor));
          break;
        }

        emitPlain(t.slice(cursor, nextStart));

        if (nextKind === 'bg') {
          const openEnd = t.indexOf(']', nextStart);
          const closeTag = '[/bg]';
          const closeIndex = openEnd === -1 ? -1 : findBalancedClose(t, openEnd + 1, '[bg:', closeTag);
          if (openEnd === -1 || closeIndex === -1) {
            emitPlain(t.slice(nextStart));
            break;
          }

          const bg = t.slice(nextStart + 4, openEnd).trim();
          const inner = t.slice(openEnd + 1, closeIndex);
          result += `<span data-bg="${escapeHtmlAttr(bg)}" style="background-color: ${escapeHtmlAttr(bg)}; padding: 0 2px; border-radius: 3px;">${formatInline(inner)}</span>`;
          cursor = closeIndex + closeTag.length;
          continue;
        }

        if (nextKind === 'color') {
          const openEnd = t.indexOf(']', nextStart);
          const closeTag = '[/color]';
          const closeIndex = openEnd === -1 ? -1 : findBalancedClose(t, openEnd + 1, '[color:', closeTag);
          if (openEnd === -1 || closeIndex === -1) {
            emitPlain(t.slice(nextStart));
            break;
          }

          const color = t.slice(nextStart + 7, openEnd).trim();
          const inner = t.slice(openEnd + 1, closeIndex);
          result += `<span data-color="${escapeHtmlAttr(color)}" style="color: ${escapeHtmlAttr(color)}">${formatInline(inner)}</span>`;
          cursor = closeIndex + closeTag.length;
          continue;
        }

        if (nextKind === 'size') {
          const openEnd = t.indexOf(']', nextStart);
          const closeTag = '[/size]';
          const closeIndex = openEnd === -1 ? -1 : findBalancedClose(t, openEnd + 1, '[size:', closeTag);
          if (openEnd === -1 || closeIndex === -1) {
            emitPlain(t.slice(nextStart));
            break;
          }

          const size  = t.slice(nextStart + 6, openEnd).trim();
          const inner = t.slice(openEnd + 1, closeIndex);
          // size disabled (e.g. database cells) → render inner at normal size.
          result += noSizeStyle ? formatInline(inner) : `<span data-size="${escapeHtmlAttr(size)}" style="font-size: ${escapeHtmlAttr(size)}">${formatInline(inner)}</span>`;
          cursor = closeIndex + closeTag.length;
          continue;
        }

        if (nextKind === 'width') {
          const openEnd = t.indexOf(']', nextStart);
          const closeTag = '[/width]';
          const closeIndex = openEnd === -1 ? -1 : findBalancedClose(t, openEnd + 1, '[width:', closeTag);
          if (openEnd === -1 || closeIndex === -1) {
            emitPlain(t.slice(nextStart));
            break;
          }

          const size  = t.slice(nextStart + 7, openEnd).trim();
          const inner = t.slice(openEnd + 1, closeIndex);
          result += `<span data-size="${escapeHtmlAttr(size)}" style="font-size: ${escapeHtmlAttr(size)}">${formatInline(inner)}</span>`;
          cursor = closeIndex + closeTag.length;
          continue;
        }

        if (nextKind === 'link') {
          const openEnd = t.indexOf(']', nextStart);
          const closeTag = '[/link]';
          const closeIndex = openEnd === -1 ? -1 : findBalancedClose(t, openEnd + 1, '[link:', closeTag);
          if (openEnd === -1 || closeIndex === -1) {
            emitPlain(t.slice(nextStart));
            break;
          }

          const href = t.slice(nextStart + 6, openEnd).trim();
          const inner = t.slice(openEnd + 1, closeIndex);
          result += `<a href="${escapeHtmlAttr(href)}" data-link="${escapeHtmlAttr(href)}" target="_blank" rel="noreferrer" class="underline decoration-dotted underline-offset-2">${formatInline(inner)}</a>`;
          cursor = closeIndex + closeTag.length;
          continue;
        }
      }

      return result;
    };

    const flushList = () => {
      if (listBuffer.length > 0 && listType) {
        html += `<${listType} class="list-inside pl-4 mb-2 ${listType === 'ul' ? 'list-disc' : 'list-decimal'}">`;
        html += listBuffer.map(item => `<li class="my-0.5 font-normal text-sm leading-relaxed">${formatInline(item)}</li>`).join("");
        html += `</${listType}>`;
        listBuffer = []; listType = null;
      }
    };

    // GFM-style pipe tables. The rendered <table> carries its source markdown in
    // data-md-table so revertToMarkdown can round-trip it without data loss.
    const isSepCell = (c: string) => /^:?-+:?$/.test(c.replace(/\s/g, ""));
    const flushTable = () => {
      if (tableBuffer.length === 0) return;
      const source = tableBuffer.join("\n");
      const rows = tableBuffer.map((r) => r.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").map((c) => c.trim()));
      let headerRow: string[] | null = null;
      let bodyRows = rows;
      if (rows.length >= 2 && rows[1].length > 0 && rows[1].every(isSepCell)) { headerRow = rows[0]; bodyRows = rows.slice(2); }
      else if (rows.length >= 1 && rows[0].length > 0 && rows[0].every(isSepCell)) { bodyRows = rows.slice(1); }

      let t = `<table contenteditable="false" data-md-table="${escapeHtmlAttr(source)}" class="my-3 w-full border-collapse text-sm border border-border/60 rounded-lg overflow-hidden">`;
      if (headerRow) {
        t += `<thead><tr>${headerRow.map((c) => `<th class="border border-border/50 bg-muted/40 px-3 py-1.5 text-left font-semibold">${formatInline(c)}</th>`).join("")}</tr></thead>`;
      }
      t += `<tbody>${bodyRows.map((r) => `<tr>${r.map((c) => `<td class="border border-border/40 px-3 py-1.5 align-top">${formatInline(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
      html += t;
      tableBuffer = [];
    };

    // Blockquotes (`> ...`) + GitHub callouts (`> [!NOTE] title`) + custom
    // hex-color callouts (`> [!#ff00ff] title`). The hex form lets users pick
    // any colour without registering a named variant.
    const CALLOUT_RE = /^\[!(#[0-9a-fA-F]{3,8}|[\w-]+)\][+-]?\s*(.*)$/;
    const expandHex = (h: string): string => {
      const x = h.replace("#", "");
      if (x.length === 3) return "#" + x.split("").map((c) => c + c).join("");
      return "#" + x.slice(0, 6);
    };
    const hexRgba = (h: string, a: number): string => {
      const hex = expandHex(h).replace("#", "");
      const r = parseInt(hex.slice(0, 2), 16), g = parseInt(hex.slice(2, 4), 16), b = parseInt(hex.slice(4, 6), 16);
      if ([r, g, b].some(Number.isNaN)) return "rgba(125,125,125," + a + ")";
      return `rgba(${r},${g},${b},${a})`;
    };
    const calloutStyle = (type: string): { border: string; bg: string; text: string; inline?: { border: string; bg: string; text: string } } => {
      if (type.startsWith("#")) {
        const c = expandHex(type);
        return {
          border: "", bg: "", text: "",
          inline: { border: c, bg: hexRgba(c, 0.08), text: c },
        };
      }
      switch (type) {
        case "tip": case "success": case "check": return { border: "border-emerald-500/60", bg: "bg-emerald-500/5", text: "text-emerald-400" };
        case "warning": case "caution": case "attention": return { border: "border-amber-500/60", bg: "bg-amber-500/5", text: "text-amber-400" };
        case "danger": case "error": case "bug": case "fail": case "failure": return { border: "border-rose-500/60", bg: "bg-rose-500/5", text: "text-rose-400" };
        case "important": case "question": case "help": return { border: "border-violet-500/60", bg: "bg-violet-500/5", text: "text-violet-300" };
        case "quote": case "cite": return { border: "border-border/60", bg: "bg-muted/10", text: "text-muted-foreground" };
        default: return { border: "border-sky-500/60", bg: "bg-sky-500/5", text: "text-sky-400" }; // note/info/abstract/...
      }
    };
    const flushQuote = () => {
      if (quoteBuffer.length === 0) return;
      const source = quoteBuffer.map((l) => `> ${l}`).join("\n");
      const cm = quoteBuffer[0].match(CALLOUT_RE);
      if (cm) {
        const type = cm[1].toLowerCase();
        const title = cm[2].trim() || (type.startsWith("#") ? "" : type.charAt(0).toUpperCase() + type.slice(1));
        const body = quoteBuffer.slice(1);
        const s = calloutStyle(type);
        const wrapStyle = s.inline ? ` style="border-left-color:${s.inline.border};background:${s.inline.bg}"` : "";
        const titleStyle = s.inline ? ` style="color:${s.inline.text}"` : "";
        html += `<div contenteditable="false" data-md-quote="${escapeHtmlAttr(source)}" class="my-3 rounded-lg border-l-4 ${s.border} ${s.bg} px-3 py-2"${wrapStyle}>`
          + (title ? `<div class="text-xs font-bold uppercase tracking-wide ${s.text} mb-1"${titleStyle}>${formatInline(title)}</div>` : "")
          + (body.length ? `<div class="text-sm leading-relaxed text-foreground/80">${body.map((l) => formatInline(l)).join("<br>")}</div>` : "")
          + `</div>`;
      } else {
        html += `<blockquote data-md-quote="${escapeHtmlAttr(source)}" class="my-2 border-l-4 border-border/50 pl-3 text-muted-foreground italic">${quoteBuffer.map((l) => formatInline(l)).join("<br>")}</blockquote>`;
      }
      quoteBuffer = [];
    };

    lines.forEach(line => {
      const trimmed = line.trim();

      // Code block placeholder
      const cbMatch = trimmed.match(/^\x00CB(\d+)\x00$/);
      const mbMatch = trimmed.match(/^\x00MB(\d+)\x00$/);
      if (cbMatch) {
        flushList();
        const { lang, code } = codeBlocks[parseInt(cbMatch[1])];
        // Diagram / preview langs render as a real canvas (mounted by an effect)
        // instead of a code block — only in read-only display.
        if (forDisplay && /^(mermaid|grarkdown|grark|erdiagram|erd|er|html|html\[preview\])$/i.test(lang)) {
          const di = diagramBlocksRef.current.length;
          diagramBlocksRef.current.push({ lang, code });
          html += `<div contenteditable="false" data-diagram-idx="${di}" class="my-2"></div>`;
          return;
        }
        const escaped = escapeHtml(code);
        const langLabel = lang ? `<div class="text-xs text-muted-foreground/60 font-mono uppercase tracking-wider mb-2">${lang}</div>` : "";
        html += `<pre contenteditable="false" class="my-2 rounded-lg bg-muted/60 border border-border/60 p-3 overflow-x-auto" data-code-block="${lang}">${langLabel}<code class="text-xs font-mono text-foreground/80 whitespace-pre">${escaped}</code></pre>`;
        return;
      }
      if (mbMatch) {
        flushList();
        const mInfo = mathBlocks[parseInt(mbMatch[1])];
        try {
          const rendered = katex.renderToString(mInfo.formula, { throwOnError: false, displayMode: true });
          html += `<div contenteditable="false" class="my-4 render-math math-block w-full overflow-x-auto text-center" data-math-block="true" data-math="${escapeHtmlAttr(mInfo.formula)}">${rendered}</div>`;
        } catch (e) {
          html += `<div contenteditable="false" class="my-4 text-red-500" data-math-block="true" data-math="${escapeHtmlAttr(mInfo.formula)}">$$${escapeHtml(mInfo.formula)}$$</div>`;
        }
        return;
      }

      if (!trimmed) { flushList(); flushQuote(); html += "<div><br></div>"; return; }

      // Blockquote / callout line (`> ...`). Buffer consecutive quote lines.
      if (/^>\s?/.test(trimmed)) { flushList(); flushTable(); quoteBuffer.push(trimmed.replace(/^>\s?/, "")); return; }
      flushQuote();

      // Table row? Buffer consecutive `| a | b |` lines and flush as a table.
      if (/^\|.*\|$/.test(trimmed) && trimmed.length > 1) { flushList(); tableBuffer.push(trimmed); return; }
      flushTable();

      const h1 = trimmed.match(/^#\s+(.*)/);
      const h2 = trimmed.match(/^##\s+(.*)/);
      const h3 = trimmed.match(/^###\s+(.*)/);
      const h4 = trimmed.match(/^####\s+(.*)/);
      const h5 = trimmed.match(/^#####\s+(.*)/);
      const h6 = trimmed.match(/^######\s+(.*)/);
      const ul = trimmed.match(/^[-*]\s+(.*)/);
      const ol = trimmed.match(/^(\d+)\.\s+(.*)/);

      const anyHeading = h1 || h2 || h3 || h4 || h5 || h6;
      if (noHeadingStyle && anyHeading) { flushList(); html += `<div class="mb-1 leading-relaxed">${formatInline(anyHeading[1])}</div>`; }
      else if (h6) { flushList(); html += `<h6 class="text-sm font-semibold mb-1 mt-3 uppercase tracking-wide text-muted-foreground">${formatInline(h6[1])}</h6>`; }
      else if (h5) { flushList(); html += `<h5 class="text-base font-semibold mb-1 mt-3 text-foreground/70">${formatInline(h5[1])}</h5>`; }
      else if (h4) { flushList(); html += `<h4 class="text-lg font-semibold mb-2 mt-3 text-foreground/75">${formatInline(h4[1])}</h4>`; }
      else if (h1) { flushList(); html += `<h1 class="text-3xl font-extrabold mb-4 mt-6 border-b border-border/50 pb-2 text-foreground tracking-tight">${formatInline(h1[1])}</h1>`; }
      else if (h2) { flushList(); html += `<h2 class="text-2xl font-bold mb-3 mt-5 text-foreground/90 tracking-tight">${formatInline(h2[1])}</h2>`; }
      else if (h3) { flushList(); html += `<h3 class="text-xl font-semibold mb-2 mt-4 text-foreground/80">${formatInline(h3[1])}</h3>`; }
      else if (ul) { if (listType && listType !== 'ul') flushList(); listType = 'ul'; listBuffer.push(ul[1]); }
      else if (ol) { if (listType && listType !== 'ol') flushList(); listType = 'ol'; listBuffer.push(ol[2]); }
      else { flushList(); html += `<div class="mb-1 leading-relaxed">${formatInline(trimmed)}</div>`; }
    });

    flushList();
    flushTable();
    flushQuote();
    return html;
  };

  const filteredSlashCommands = slashCommands.filter((command) => {
    if (!slashQuery.trim()) return true;
    const query = slashQuery.toLowerCase();
    return command.label.toLowerCase().includes(query) || command.search.includes(query);
  });

  useEffect(() => {
    setSlashActiveIndex(0);
  }, [slashQuery, isSlashOpen]);

  const closeSlashMenu = () => {
    setIsSlashOpen(false);
    setSlashQuery("");
    setSlashRange(null);
    setSlashActiveIndex(0);
  };

  const getSlashContext = (markdown: string, cursorOffset: number): { from: number; to: number; query: string } | null => {
    const beforeCursor = markdown.slice(0, cursorOffset);
    const match = beforeCursor.match(/(^|\s)\/([^\s\/]*)$/);
    if (!match) return null;
    const query = match[2] || "";
    const from = cursorOffset - query.length - 1;
    if (from < 0) return null;
    return { from, to: cursorOffset, query };
  };

  const updateSlashMenuFromCursor = (markdown: string, cursorOffset: number) => {
    const context = getSlashContext(markdown, cursorOffset);
    if (!context) {
      if (isSlashOpen) closeSlashMenu();
      return;
    }

    const selection = typeof window !== "undefined" ? window.getSelection() : null;
    if (selection && selection.rangeCount > 0) {
      const rect = selection.getRangeAt(0).getBoundingClientRect();
      let top = Math.max(12, rect.bottom + 8);
      let left = Math.max(12, rect.left);

      // Smart position a la Notion (avoid bottom and right clipping)
      const menuHeight = 320; // max height of our menu
      const menuWidth = 320; // width of our menu
      
      if (typeof window !== "undefined") {
        if (top + menuHeight > window.innerHeight) {
          top = Math.max(12, rect.top - menuHeight - 8);
        }
        if (left + menuWidth > window.innerWidth) {
          left = window.innerWidth - menuWidth - 12;
        }
      }

      setSlashMenuPosition({ top, left });
    }

    setSlashRange({ from: context.from, to: context.to });
    setSlashQuery(context.query);
    setIsSlashOpen(true);
  };

  // Experimental Editor Mode: paint the editable surface with FULLY RENDERED HTML
  // instead of the markdown-source view, so editing happens directly on rendered
  // text (no round-trip flicker). Classic pills/source view when the flag is off.
  const paintEditable = (md: string): string =>
    getExperimentalEditorMode() ? processPseudoMarkdown(md, true) : processMarkdownWithPills(md);

  // Commit an inline edit (style span, emoji, clear…) that already mutated the
  // LIVE DOM. In Experimental mode we DON'T overwrite innerHTML — the styled
  // result is already on screen, so the caret/selection survive (Notion/Docs
  // feel). Classic mode must repaint to swap the source/pills view. Pass
  // forceRepaint for ops that injected a raw token needing re-render (icons,
  // reference pills, slash blocks).
  const commitInlineEdit = (md: string, opts?: { forceRepaint?: boolean }) => {
    onUpdate(md);
    if (!contentRef.current) return;
    if (opts?.forceRepaint || !getExperimentalEditorMode()) {
      contentRef.current.innerHTML = paintEditable(md);
      if (getExperimentalEditorMode()) mountDiagramsIn(contentRef.current);
    }
  };

  const applySlashCommand = (command: SlashCommand) => {
    if (!contentRef.current) return;

    const markdown = revertToMarkdown(contentRef.current.innerHTML || "");
    const cursorOffset = getMarkdownCursorOffset(contentRef.current) ?? markdown.length;
    const context = getSlashContext(markdown, cursorOffset) || (slashRange ? { ...slashRange, query: slashQuery } : null);

    if (!context) {
      closeSlashMenu();
      return;
    }

    const before = markdown.slice(0, context.from);
    const after = markdown.slice(context.to);

    if (command.kind === "inline") {
      let insertText = command.insertText || "";
      const nextMarkdown = `${before}${insertText}${after}`;
      onUpdate(nextMarkdown);
      contentRef.current.innerHTML = paintEditable(nextMarkdown);
      
      const newCursorOffset = context.from + insertText.length;
      
      // Special actions for specific inline commands
      if (command.id === "mention-person") {
        setPickerCursorOffset(newCursorOffset);
        setPickerFilter(["user"]);
        closeSlashMenu();
        setTimeout(() => setIsPickerOpen(true), 50);
        return;
      } else if (command.id === "mention-page") {
        setPickerCursorOffset(newCursorOffset);
        setPickerFilter(["doc", "board"]);
        closeSlashMenu();
        setTimeout(() => setIsPickerOpen(true), 50);
        return;
      } else if (command.id.startsWith("ai-")) {
        const fullText = revertToMarkdown(contentRef.current.innerHTML || "");
        const stripped = `${before}${after}`;
        onUpdate(stripped);
        contentRef.current.innerHTML = paintEditable(stripped);
        closeSlashMenu();
        onAiAction?.(command.id, fullText);
        return;
      }
    } else if (command.blockKind && onAddBrick) {
      const nextMarkdown = `${before}${after}`;
      onUpdate(nextMarkdown);
      contentRef.current.innerHTML = paintEditable(nextMarkdown);
      onAddBrick(command.blockKind);
    }

    closeSlashMenu();
    requestAnimationFrame(() => {
      contentRef.current?.focus();
    });
  };

  const isFloatingEditorUiTarget = (node: Node | null): boolean => {
    if (!(node instanceof HTMLElement)) return false;
    return !!node.closest('[data-editor-floating-ui="true"]');
  };

  // Sync content from props only when editor is not focused.
  // While focused, keep browser-managed contentEditable DOM to avoid cursor jumps.
  useEffect(() => {
    if (contentRef.current) {
      const isFocused = document.activeElement === contentRef.current;
      if (isFocused) {
        if (isBrickEmpty(contentRef.current)) {
          contentRef.current.setAttribute("data-empty", "true");
        } else {
          contentRef.current.removeAttribute("data-empty");
        }
        return;
      }

      const rendered = processPseudoMarkdown(text, true);

      if (lastDisplayHtmlRef.current !== rendered && contentRef.current.innerHTML !== rendered) {
        logPasteDebug("useEffect syncing content", {
          isFocused,
          oldLength: contentRef.current.innerHTML.length,
          newLength: rendered.length,
        });
        unmountDiagrams();
        contentRef.current.innerHTML = rendered;
        lastDisplayHtmlRef.current = rendered;
        mountDiagramsIn(contentRef.current);
      }

      if (isBrickEmpty(contentRef.current)) {
        contentRef.current.setAttribute("data-empty", "true");
      } else {
        contentRef.current.removeAttribute("data-empty");
      }
    }
  }, [text, documents, boards, activeBricks]);

  useEffect(() => {
    if (!readonly) return;
    setIsFormatToolbarOpen(false);
    setIsSlashOpen(false);
    setIsPickerOpen(false);
    setIsDatePickerOpen(false);
    setIsEmojiPickerOpen(false);
    setIsMathPickerOpen(false);
  }, [readonly]);

  const handleFocus = () => {
    if (contentRef.current) {
      const experimental = getExperimentalEditorMode();
      // Experimental mode keeps diagrams/rendered nodes live — don't tear down.
      if (!experimental) unmountDiagrams();
      lastDisplayHtmlRef.current = null;
      const singleMathFormula = extractSingleBlockMath(text || "");
      if (singleMathFormula && !experimental) {
        contentRef.current.innerHTML = processPseudoMarkdown(text || "");
        setMathPickerInitialFormula(singleMathFormula);
        setMathPickerInitialMode("block");
        setMathInsertMode("replace-all");
        setTimeout(() => setIsMathPickerOpen(true), 0);
      } else if (experimental) {
        // Edit directly on rendered HTML.
        contentRef.current.innerHTML = processPseudoMarkdown(text || "", true);
        mountDiagramsIn(contentRef.current);
      } else {
        // Classic: keep references as pills and leave markdown syntax as plain text.
        contentRef.current.innerHTML = paintEditable(text || "");
      }
      if (isBrickEmpty(contentRef.current)) contentRef.current.setAttribute("data-empty", "true");
      else contentRef.current.removeAttribute("data-empty");
    }
  };

  const handleBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    const next = e.relatedTarget as Node | null;
    if (isFloatingEditorUiTarget(next)) {
      return;
    }

    if (isPickerOpen || isDatePickerOpen || isEmojiPickerOpen || isMathPickerOpen || isIconPickerOpen) {
      return;
    }

    if (contentRef.current) {
      // Preserve references as tokens while serializing markdown.
      const rawMarkdown = revertToMarkdown(contentRef.current.innerHTML || "");
      onUpdate(rawMarkdown);
      unmountDiagrams();
      const displayHtml = processPseudoMarkdown(rawMarkdown, true);
      contentRef.current.innerHTML = displayHtml;
      lastDisplayHtmlRef.current = displayHtml;
      mountDiagramsIn(contentRef.current);
      if (isBrickEmpty(contentRef.current)) contentRef.current.setAttribute("data-empty", "true");
      else contentRef.current.removeAttribute("data-empty");
    }
      
      // DO NOT close picker here, otherwise when ReferencePicker modal
      // takes focus, it instantly kills itself.
      // setIsPickerOpen(false);
      // setPickerCursorOffset(null);
      closeSlashMenu();
  };

  // While Ctrl/Cmd is held, arm reference pills (pointer cursor + outline on
  // hover) to signal that clicking will navigate.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const STYLE_ID = "km-ref-armed-style";
    if (!document.getElementById(STYLE_ID)) {
      const st = document.createElement("style");
      st.id = STYLE_ID;
      st.textContent = ".km-ref-armed .mention-pill:hover,.km-ref-armed .user-mention:hover,.km-ref-armed .deep-pill:hover{cursor:pointer;outline:2px solid currentColor;outline-offset:1px;filter:brightness(1.2)}";
      document.head.appendChild(st);
    }
    const onKey = (e: KeyboardEvent) => { contentRef.current?.classList.toggle("km-ref-armed", e.ctrlKey || e.metaKey); };
    const disarm = () => contentRef.current?.classList.remove("km-ref-armed");
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    window.addEventListener("blur", disarm);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("keyup", onKey); window.removeEventListener("blur", disarm); };
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const pill = target.closest('.mention-pill, .user-mention, .deep-pill');

    // Non-pill click: let the browser handle it naturally so it places the cursor
    // exactly where the user clicked. No preventDefault needed.
    if (!pill) return;

    const isFocused = document.activeElement === contentRef.current;
    const isModifierClick = e.metaKey || e.ctrlKey;

    // In editable mode, first click should activate this brick instead of navigating away.
    if (!readonly && !isFocused && !isModifierClick) {
      requestAnimationFrame(() => contentRef.current?.focus());
      return;
    }

    if (!isFocused || readonly || isModifierClick) {
      e.preventDefault();
      e.stopPropagation();

      // Encode per-segment so nested local paths (e.g. "specs/v2/note.kd")
      // route correctly; cloud UUIDs are unaffected.
      const enc = (v: string) => v.split('/').map(encodeURIComponent).join('/');

      if (pill.classList.contains('deep-pill')) {
        const inner = pill.getAttribute('data-inner') || '';
        const tokens = inner.split(':').map((token) => token.trim()).filter(Boolean);
        if (tokens.length >= 4) {
          const scopeType = tokens[0]?.toLowerCase();
          const scopeId = tokens[1];
          if (scopeType === 'mesh' && scopeId) { router.push(`/m/${enc(scopeId)}`); return; }
          if ((scopeType === 'doc' || scopeType === 'document') && scopeId) { router.push(`/d/${enc(scopeId)}`); return; }
        }
        const docId = tokens[0];
        if (docId) router.push(`/d/${enc(docId)}`);
        return;
      }

      const type = pill.getAttribute('data-type') || (pill.classList.contains('user-mention') ? 'user' : '');
      const id = pill.getAttribute('data-id');

      if (id && type === 'doc') router.push(`/d/${enc(id)}`);
      else if (id && type === 'board') router.push(`/b/${enc(id)}`);
      else if (id && type === 'mesh') router.push(`/m/${enc(id)}`);
      // Add other navigation or actions as needed
    }
  };

  const handleMouseUp = () => {
    setTimeout(checkSelectionForToolbar, 10);
  };

  const resolveFormattingRange = (): Range | null => {
    if (!contentRef.current || typeof window === "undefined") return null;
    const selection = window.getSelection();

    if (selection && selection.rangeCount > 0 && !selection.isCollapsed) {
      const liveRange = selection.getRangeAt(0);
      if (contentRef.current.contains(liveRange.commonAncestorContainer)) {
        savedRangeRef.current = liveRange.cloneRange();
        return liveRange;
      }
    }

    const saved = savedRangeRef.current;
    if (!saved) return null;

    try {
      if (!contentRef.current.contains(saved.commonAncestorContainer)) {
        return null;
      }
      if (selection) {
        selection.removeAllRanges();
        selection.addRange(saved);
      }
      return saved;
    } catch {
      return null;
    }
  };

  const handleFormat = (type: "bold" | "italic" | "strike" | "code" | "link" | "underline" | "math") => {
    if (!contentRef.current) return;
    resolveFormattingRange();
    
    switch (type) {
      case "bold": document.execCommand("bold", false, undefined); break;
      case "italic": document.execCommand("italic", false, undefined); break;
      case "underline": document.execCommand("underline", false, undefined); break;
      case "strike": document.execCommand("strikeThrough", false, undefined); break;
      case "link": {
        // Open the custom link popover instead of a native prompt(). The
        // selection is saved so we can re-apply it when the URL is confirmed.
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) savedRangeRef.current = sel.getRangeAt(0).cloneRange();
        setLinkUrl("");
        setIsFormatToolbarOpen(false);
        setIsLinkInputOpen(true);
        return; // defer serialization until the URL is confirmed
      }
      case "code":
        const selection = window.getSelection();
        if (selection && selection.rangeCount > 0) {
          const range = selection.getRangeAt(0);
          const codeNode = document.createElement("code");
          codeNode.appendChild(range.extractContents());
          range.insertNode(codeNode);
          selection.removeAllRanges();
        }
        break;
    }
    const md = revertToMarkdown(contentRef.current.innerHTML || "");
    onUpdate(md);
  };

  // Confirm the link popover: re-apply the saved selection and wrap it (or insert
  // the URL as link text), then serialize. Normalizes bare domains to https://.
  const applyLink = () => {
    const root = contentRef.current;
    const raw = linkUrl.trim();
    setIsLinkInputOpen(false);
    if (!root || !raw) { savedRangeRef.current = null; return; }
    const href = /^(https?:|mailto:|tel:|\/|#)/i.test(raw) ? raw : `https://${raw}`;
    root.focus();
    const sel = window.getSelection();
    if (savedRangeRef.current && sel) { sel.removeAllRanges(); sel.addRange(savedRangeRef.current); }
    if (sel && !sel.isCollapsed) {
      document.execCommand("createLink", false, href);
    } else {
      const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
      document.execCommand("insertHTML", false, `<a href="${esc(href)}" data-link="${esc(href)}">${esc(raw)}</a> `);
    }
    // createLink emits a bare <a href>; tag it so revertToMarkdown → [link:href].
    root.querySelectorAll("a[href]:not([data-link])").forEach((a) => a.setAttribute("data-link", a.getAttribute("href") || ""));
    const md = revertToMarkdown(root.innerHTML || "");
    commitInlineEdit(md, { forceRepaint: true });
    savedRangeRef.current = null;
  };

  // Clear all inline formatting from the current selection — native formats via
  // execCommand plus our custom color/bg/size spans — then re-serialize cleanly.
  const clearFormattingInSelection = () => {
    const root = contentRef.current;
    if (!root) return;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (!root.contains(range.commonAncestorContainer)) return;
    try { document.execCommand("removeFormat"); } catch { /* noop */ }
    const sel2 = window.getSelection();
    const activeRange = sel2 && sel2.rangeCount > 0 ? sel2.getRangeAt(0) : range;
    root.querySelectorAll("span[data-color],span[data-bg],span[data-size]").forEach((span) => {
      let hit = false;
      try { hit = activeRange.intersectsNode(span); } catch { hit = false; }
      if (!hit) return;
      const p = span.parentNode;
      if (!p) return;
      while (span.firstChild) p.insertBefore(span.firstChild, span);
      p.removeChild(span);
    });
    root.normalize();
    const md = revertToMarkdown(root.innerHTML || "");
    commitInlineEdit(md);
    setIsFormatToolbarOpen(false);
  };

  // Apply color/bg/size to the selection as ONE clean span. Prunes any existing
  // spans of the SAME kind inside the selection first, so a new value REPLACES
  // the old instead of nesting (red over blue → red, not stacked) — only the
  // wrap that's actually needed. revertToMarkdown's normalizeStyleTree then
  // merges adjacent twins, keeping the markdown balanced.
  const applyInlineStyle = (attr: "data-color" | "data-bg" | "data-size", value: string, style: Partial<CSSStyleDeclaration>) => {
    const root = contentRef.current;
    if (!root) return;
    const range = resolveFormattingRange();
    if (range) {
      const frag = range.extractContents();
      frag.querySelectorAll(`span[${attr}]`).forEach((sp) => {
        const p = sp.parentNode;
        if (!p) return;
        while (sp.firstChild) p.insertBefore(sp.firstChild, sp);
        p.removeChild(sp);
      });
      const span = document.createElement("span");
      span.setAttribute(attr, value);
      Object.assign(span.style, style);
      span.appendChild(frag);
      range.insertNode(span);
      const sel = window.getSelection();
      if (sel) { sel.removeAllRanges(); const rr = document.createRange(); rr.selectNodeContents(span); sel.addRange(rr); }
    }
    commitInlineEdit(revertToMarkdown(root.innerHTML || ""));
  };

  // Block-level transforms (headings, paragraph, quote, callout, code) applied to
  // the line(s) the selection covers. Operates in markdown space so it can both
  // SET and CLEAR a block type (e.g. H2 → paragraph). Needs a repaint to re-render
  // the new block structure.
  const stripBlockPrefix = (l: string): string =>
    l.replace(/^(\s*)#{1,6}\s+/, "$1").replace(/^(\s*)>\s?(\[![^\]]*\][+-]?\s*)?/, "$1");
  const applyBlockType = (type: string) => {
    const root = contentRef.current;
    if (!root) return;
    const md = revertToMarkdown(root.innerHTML || "");
    const startOff = getMarkdownCursorOffset(root) ?? md.length;
    const lines = md.split("\n");
    let acc = 0;
    let startLine = 0;
    for (let i = 0; i < lines.length; i++) {
      const len = lines[i].length + 1;
      if (startOff < acc + len) { startLine = i; break; }
      acc += len;
      startLine = i;
    }
    const sel = window.getSelection();
    const extra = sel && !sel.isCollapsed ? (sel.toString().match(/\n/g)?.length ?? 0) : 0;
    const endLine = Math.min(lines.length - 1, startLine + extra);

    if (type === "code") {
      const body = lines.slice(startLine, endLine + 1).map(stripBlockPrefix).join("\n");
      lines.splice(startLine, endLine - startLine + 1, "```\n" + body + "\n```");
    } else {
      const transform = (l: string): string => {
        const body = stripBlockPrefix(l);
        if (type === "paragraph") return body;
        if (/^h[1-6]$/.test(type)) return "#".repeat(Number(type[1])) + " " + body;
        if (type === "quote") return "> " + body;
        if (type.startsWith("callout:")) return `> [!${type.slice(8)}] ` + body;
        return l;
      };
      for (let i = startLine; i <= endLine; i++) lines[i] = transform(lines[i]);
    }

    commitInlineEdit(lines.join("\n"), { forceRepaint: true });
    setIsFormatToolbarOpen(false);
    requestAnimationFrame(() => root.focus());
  };

  // Open the Lucide icon picker at the caret. Shared by the keyboard shortcut
  // and the toolbar button (the shortcut alone is unreliable: Cmd+. is reserved
  // on macOS, so Mac users need the button / an alt binding).
  const openIconPicker = () => {
    setIsFormatToolbarOpen(false);
    closeSlashMenu();
    setIsPickerOpen(false);
    setIsDatePickerOpen(false); setIsEmojiPickerOpen(false); setIsMathPickerOpen(false);
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) savedRangeRef.current = sel.getRangeAt(0).cloneRange();
    const md = revertToMarkdown(contentRef.current?.innerHTML || "");
    const offset = getMarkdownCursorOffset(contentRef.current) ?? md.length;
    setPickerCursorOffset(offset);
    try {
      const r = sel && sel.rangeCount > 0 ? sel.getRangeAt(0).getBoundingClientRect() : null;
      if (r && (r.top || r.left)) setFormatToolbarPosition({ top: r.top, left: r.left + r.width / 2, bottom: r.bottom });
    } catch { /* noop */ }
    setIconPickerQuery("");
    setIsIconPickerOpen(true);
  };

  const checkSelectionForToolbar = () => {
    if (readonly) return;
    // Only one floating UI at a time — any other picker wins.
    if (isIconPickerOpen || isSlashOpen || isPickerOpen || isDatePickerOpen || isEmojiPickerOpen || isMathPickerOpen) return;
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
      setIsFormatToolbarOpen(false);
      dismissedSelectionRef.current = "";
      return;
    }

    const range = selection.getRangeAt(0);
    if (!contentRef.current?.contains(range.commonAncestorContainer)) {
      setIsFormatToolbarOpen(false);
      return;
    }

    const text = selection.toString().trim();
    if (!text) {
      setIsFormatToolbarOpen(false);
      dismissedSelectionRef.current = "";
      return;
    }

    // User just dismissed the toolbar with Esc on this exact selection — don't
    // reopen it until the selection changes.
    if (dismissedSelectionRef.current && dismissedSelectionRef.current === text) return;
    dismissedSelectionRef.current = "";

    savedRangeRef.current = range.cloneRange();
    // getBoundingClientRect() can collapse to 0×0 for some multi-node/edge
    // selections — fall back to the first client rect, then the brick box, so
    // the toolbar never lands in the top-left corner (looks like "didn't open").
    let rect = range.getBoundingClientRect();
    if (!rect || (rect.width === 0 && rect.height === 0)) {
      const rects = range.getClientRects();
      if (rects.length > 0) rect = rects[0];
      else if (contentRef.current) rect = contentRef.current.getBoundingClientRect();
    }

    setFormatToolbarPosition({
      top: rect.top,
      left: rect.left + (rect.width / 2),
      bottom: rect.bottom,
    });
    setIsFormatToolbarOpen(true);
  };

  // Document-level selection tracking — robust against mouse-ups released
  // outside the brick, keyboard select-all, and programmatic selection that
  // onMouseUp/onKeyUp miss. Mirrors how Notion/Docs detect selections.
  const checkSelRef = useRef(checkSelectionForToolbar);
  checkSelRef.current = checkSelectionForToolbar;
  const pointerDownRef = useRef(false);
  useEffect(() => {
    if (readonly) return;
    let raf = 0;
    const runCheck = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const sel = window.getSelection();
        const root = contentRef.current;
        if (!sel || !root) return;
        const touches = (sel.anchorNode && root.contains(sel.anchorNode)) || (sel.focusNode && root.contains(sel.focusNode));
        if (touches) checkSelRef.current();
      });
    };
    // While dragging, wait for release (Notion-style: toolbar after mouseup).
    // Keyboard / programmatic selections fire selectionchange with no pointer
    // down, so they surface immediately.
    const onSelChange = () => { if (!pointerDownRef.current) runCheck(); };
    const onPointerDown = () => { pointerDownRef.current = true; };
    const onPointerUp = () => { pointerDownRef.current = false; runCheck(); };
    document.addEventListener("selectionchange", onSelChange);
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("mouseup", onPointerUp);
    return () => {
      document.removeEventListener("selectionchange", onSelChange);
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("mouseup", onPointerUp);
      if (raf) cancelAnimationFrame(raf);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readonly]);

  const handleKeyUp = (e: React.KeyboardEvent) => {
    if (!contentRef.current) return;
    
    // Check selection after a short delay to allow selection APIs to catch up
    setTimeout(checkSelectionForToolbar, 10);

    const markdown = revertToMarkdown(contentRef.current.innerHTML || "");
    const offset = getMarkdownCursorOffset(contentRef.current) ?? markdown.length;

    if (e.key === '@') {
      setPickerCursorOffset(offset);
      // Small delay to ensure the @ character is in the DOM
      setTimeout(() => setIsPickerOpen(true), 50);
      closeSlashMenu();
      return;
    }

    updateSlashMenuFromCursor(markdown, offset);
  };

  const findAdjacentToken = (direction: "backward" | "forward") => {
    const root = contentRef.current;
    if (!root || typeof window === "undefined") return null;

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || !selection.isCollapsed) return null;

    const range = selection.getRangeAt(0);
    const container = range.startContainer;
    const offset = range.startOffset;

    const isTokenElement = (node: Node | null): node is HTMLElement => {
      if (!node || node.nodeType !== Node.ELEMENT_NODE) return false;
      const el = node as HTMLElement;
      return !!el.getAttribute("data-token") || el.classList.contains("mention-pill") || el.classList.contains("user-mention") || el.classList.contains("deep-pill");
    };

    const pickFromNode = (node: Node | null, pickLast: boolean): HTMLElement | null => {
      if (!node) return null;
      if (isTokenElement(node)) return node;
      if (node.nodeType !== Node.ELEMENT_NODE) return null;
      const children = Array.from(node.childNodes);
      if (!children.length) return null;
      const candidate = pickLast ? children[children.length - 1] : children[0];
      return isTokenElement(candidate) ? candidate : null;
    };

    if (container.nodeType === Node.TEXT_NODE) {
      if (direction === "backward" && offset > 0) return null;
      const sibling = direction === "backward" ? container.previousSibling : container.nextSibling;
      return pickFromNode(sibling, direction === "backward");
    }

    const children = Array.from(container.childNodes);
    if (direction === "backward") {
      const idx = offset - 1;
      if (idx >= 0 && idx < children.length) {
        return pickFromNode(children[idx], true);
      }
    } else {
      const idx = offset;
      if (idx >= 0 && idx < children.length) {
        return pickFromNode(children[idx], false);
      }
    }

    return null;
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (readonly) return;

    if (isSlashOpen) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (filteredSlashCommands.length > 0) {
          setSlashActiveIndex((current) => (current + 1) % filteredSlashCommands.length);
        }
        return;
      }

      if (e.key === "ArrowUp") {
        e.preventDefault();
        if (filteredSlashCommands.length > 0) {
          setSlashActiveIndex((current) => (current - 1 + filteredSlashCommands.length) % filteredSlashCommands.length);
        }
        return;
      }

      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        const command = filteredSlashCommands[slashActiveIndex];
        if (command) applySlashCommand(command);
        return;
      }
    }

    if (e.key === "Escape") {
      e.preventDefault();
      // Close any floating UI first (format toolbar AI menu, slash, ref picker,
      // icon picker, date/emoji/math pickers) before blurring the editor.
      let closedAny = false;
      if (isFormatToolbarOpen) {
        setIsFormatToolbarOpen(false);
        // Remember the selection text we just dismissed — checkSelectionForToolbar
        // won't reopen the toolbar until the user changes the selection.
        try { dismissedSelectionRef.current = (window.getSelection()?.toString() ?? "").trim(); } catch { /* noop */ }
        closedAny = true;
      }
      if (isSlashOpen) { closeSlashMenu(); closedAny = true; }
      if (isPickerOpen) { setIsPickerOpen(false); setPickerCursorOffset(null); closedAny = true; }
      if (isIconPickerOpen) { setIsIconPickerOpen(false); closedAny = true; }
      if (isDatePickerOpen) { setIsDatePickerOpen(false); closedAny = true; }
      if (isEmojiPickerOpen) { setIsEmojiPickerOpen(false); closedAny = true; }
      if (isMathPickerOpen) { setIsMathPickerOpen(false); closedAny = true; }
      if (!closedAny) contentRef.current?.blur();
      return;
    }
    // Open icon picker. Ctrl+. (Win/Linux). On macOS Cmd+. is reserved by the OS
    // (cancel) and never reaches us, so also accept Cmd+; / Ctrl+; as an alias,
    // plus the toolbar's icon button.
    if ((e.ctrlKey || e.metaKey) && (e.key === "." || e.key === ";")) {
      e.preventDefault();
      openIconPicker();
      return;
    }

    if (e.key === "Backspace") {
      const token = findAdjacentToken("backward");
      if (token) {
        e.preventDefault();
        token.remove();
        const markdown = revertToMarkdown(contentRef.current?.innerHTML || "");
        onUpdate(markdown);
      }
    }

    if (e.key === "Delete") {
      const token = findAdjacentToken("forward");
      if (token) {
        e.preventDefault();
        token.remove();
        const markdown = revertToMarkdown(contentRef.current?.innerHTML || "");
        onUpdate(markdown);
      }
    }
  };

  const extensionFromMime = (mimeType: string): string => {
    if (mimeType === "image/jpeg") return "jpg";
    if (mimeType === "image/png") return "png";
    if (mimeType === "image/gif") return "gif";
    if (mimeType === "image/webp") return "webp";
    if (mimeType === "image/svg+xml") return "svg";
    return "png";
  };

  const isLikelyImageFile = (file: File): boolean => {
    if (file.type.startsWith("image/")) return true;
    return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(file.name || "");
  };

  const makeClipboardImageFile = (blob: Blob, preferredName?: string): File => {
    const mimeType = blob.type || "image/png";
    const ext = extensionFromMime(mimeType);
    const safeName = preferredName && preferredName.trim().length > 0
      ? preferredName
      : `pasted-image-${Date.now()}.${ext}`;
    return new File([blob], safeName, { type: mimeType });
  };

  const extractImageFileFromClipboard = async (clipboardData: DataTransfer): Promise<File | null> => {
    const itemImage = Array.from(clipboardData.items).find((item) => item.type.startsWith("image/"));
    if (itemImage) {
      const file = itemImage.getAsFile();
      if (file) {
        logPasteDebug("resolved file from clipboard item image/*", {
          name: file.name,
          type: file.type,
          size: file.size,
        });
        return file;
      }
    }

    let itemFile: File | null = null;
    for (const item of Array.from(clipboardData.items)) {
      if (item.kind !== "file") continue;
      const candidate = item.getAsFile();
      if (candidate && isLikelyImageFile(candidate)) {
        itemFile = candidate;
        logPasteDebug("resolved file from clipboard item kind=file", {
          name: candidate.name,
          type: candidate.type,
          size: candidate.size,
        });
        break;
      }
    }
    if (itemFile) return itemFile;

    const fileImage = Array.from(clipboardData.files).find((file) => isLikelyImageFile(file));
    if (fileImage) {
      logPasteDebug("resolved file from clipboard files[]", {
        name: fileImage.name,
        type: fileImage.type,
        size: fileImage.size,
      });
      return fileImage;
    }

    const html = clipboardData.getData("text/html");
    if (html) {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");
      const img = doc.querySelector("img");
      const src = img?.getAttribute("src") || "";
      if (src) {
        try {
          if (src.startsWith("data:image/")) {
            const response = await fetch(src);
            if (!response.ok) return null;
            const blob = await response.blob();
            const file = makeClipboardImageFile(blob, DEFAULT_PASTED_IMAGE_NAME);
            logPasteDebug("resolved file from text/html img data URL", {
              name: file.name,
              type: file.type,
              size: file.size,
            });
            return file;
          }

          if (/^https?:\/\//i.test(src)) {
            const response = await fetch(src);
            if (!response.ok) return null;
            const blob = await response.blob();
            if (!blob.type.startsWith("image/")) return null;
            const file = makeClipboardImageFile(blob);
            logPasteDebug("resolved file from text/html img remote URL", {
              name: file.name,
              type: file.type,
              size: file.size,
            });
            return file;
          }
        } catch (err) {
          console.error("Failed to convert HTML image from clipboard", err);
          return null;
        }
      }
    }

    const plainText = clipboardData.getData("text/plain").trim();
    if (plainText.startsWith("data:image/")) {
      try {
        const response = await fetch(plainText);
        if (!response.ok) return null;
        const blob = await response.blob();
        const file = makeClipboardImageFile(blob, DEFAULT_PASTED_IMAGE_NAME);
        logPasteDebug("resolved file from text/plain data URL", {
          name: file.name,
          type: file.type,
          size: file.size,
        });
        return file;
      } catch (err) {
        console.error("Failed to convert plain-text data URL image from clipboard", err);
      }
    }

    const uriList = clipboardData.getData("text/uri-list").trim();
    if (/^https?:\/\//i.test(uriList)) {
      try {
        const response = await fetch(uriList);
        if (!response.ok) return null;
        const blob = await response.blob();
        if (!blob.type.startsWith("image/")) return null;
        const file = makeClipboardImageFile(blob);
        logPasteDebug("resolved file from text/uri-list", {
          name: file.name,
          type: file.type,
          size: file.size,
        });
        return file;
      } catch (err) {
        console.error("Failed to convert URI-list image from clipboard", err);
      }
    }

    return null;
  };

  const extractImageFileFromClipboardApi = async (): Promise<File | null> => {
    if (typeof navigator === "undefined" || !navigator.clipboard || typeof navigator.clipboard.read !== "function") {
      return null;
    }

    try {
      logPasteDebug("trying navigator.clipboard.read fallback");
      const clipboardItems = await navigator.clipboard.read();
      for (const item of clipboardItems) {
        const imageType = item.types.find((type) => type.startsWith("image/"));
        if (!imageType) continue;
        const blob = await item.getType(imageType);
        const file = makeClipboardImageFile(blob);
        logPasteDebug("resolved file from navigator.clipboard.read", {
          name: file.name,
          type: file.type,
          size: file.size,
        });
        return file;
      }
    } catch (err) {
      console.error("Clipboard API read failed", err);
    }

    return null;
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    if (readonly || !onPasteImage) return;
    if (pasteInFlightRef.current) {
      e.preventDefault();
      logPasteDebug("paste skipped because another paste is in flight");
      return;
    }
    const clipboardTypes = Array.from(e.clipboardData.types || []);
    const hasLikelyImageFile = Array.from(e.clipboardData.files).some((file) => isLikelyImageFile(file));
    const hasImageCandidate =
      Array.from(e.clipboardData.items).some((item) => item.type.startsWith("image/")) ||
      Array.from(e.clipboardData.items).some((item) => item.kind === "file") ||
      hasLikelyImageFile ||
      clipboardTypes.some((type) => type.toLowerCase().startsWith("image/")) ||
      clipboardTypes.includes("Files") ||
      e.clipboardData.getData("text/html").toLowerCase().includes("<img") ||
      e.clipboardData.getData("text/plain").trim().startsWith("data:image/") ||
      /^https?:\/\//i.test(e.clipboardData.getData("text/uri-list").trim());

    logPasteDebug("paste event received", {
      types: clipboardTypes,
      itemCount: e.clipboardData.items.length,
      fileCount: e.clipboardData.files.length,
      hasImageCandidate,
    });

    if (!hasImageCandidate) return;

    e.preventDefault();
    pasteInFlightRef.current = true;

    const markdown = revertToMarkdown(contentRef.current?.innerHTML || "");
    const cursorOffset = getMarkdownCursorOffset(contentRef.current) ?? markdown.length;
    logPasteDebug("processing paste", { cursorOffset, markdownLength: markdown.length });

    void extractImageFileFromClipboard(e.clipboardData)
      .then(async (file) => {
        logPasteDebug("extractImageFileFromClipboard resolved", {
          hasFile: !!file,
        });
        const resolvedFile = file || await extractImageFileFromClipboardApi();
        if (!resolvedFile) {
          logPasteDebug("no image file resolved from paste payload");
          return;
        }
        logPasteDebug("calling onPasteImage", {
          name: resolvedFile.name,
          type: resolvedFile.type,
          size: resolvedFile.size,
          source: file ? "paste-event" : "clipboard-api-fallback",
        });
        // Call onPasteImage - the parent component handles all state updates
        // We don't process the return value because the parent may create multiple bricks
        // or reorganize the structure. Just let the modal handle it and our props will update naturally.
        await Promise.resolve(onPasteImage({ file: resolvedFile, cursorOffset, markdown }));
        logPasteDebug("onPasteImage completed");
      })
      .catch((err) => {
        console.error("[TextBrickPaste] Error in paste handler:", err);
        logPasteDebug("paste handler error", {
          error: err instanceof Error ? err.message : String(err),
        });
      })
      .finally(() => {
        pasteInFlightRef.current = false;
      });
  };

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>) => {
    if (readonly) return;
    const payload = getSelectedMarkdownRange();
    if (!payload) {
      dragSelectionRef.current = null;
      return;
    }

    dragSelectionRef.current = payload;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData(TEXT_SPLIT_DRAG_MIME, JSON.stringify({
      brickId: id,
      startOffset: payload.startOffset,
      endOffset: payload.endOffset,
    }));
    e.dataTransfer.setData("text/plain", payload.selectedMarkdown);
  };

  const isEditableDropTarget = (target: Element | null): boolean => {
    if (!target) return false;

    const editableHost = target.closest(
      'input, textarea, [contenteditable=""], [contenteditable="true"], [contenteditable]:not([contenteditable="false"])',
    );

    return Boolean(editableHost);
  };

  const handleDragEnd = (e: React.DragEvent<HTMLDivElement>) => {
    if (readonly) return;
    const payload = dragSelectionRef.current;
    dragSelectionRef.current = null;
    if (!payload || !onAddBrick) return;

    if (typeof document === "undefined") return;
    const dropTarget = document.elementFromPoint(e.clientX, e.clientY);
    if (!dropTarget) return;

    // If dropped back inside the same text brick, keep original content unchanged.
    if (contentRef.current?.contains(dropTarget)) return;

    // If dropped over an editable surface (input/textarea/contenteditable),
    // let native text drop behavior happen and avoid creating a new brick.
    if (isEditableDropTarget(dropTarget)) return;

    const from = Math.max(0, Math.min(payload.startOffset, payload.sourceMarkdown.length));
    const to = Math.max(from, Math.min(payload.endOffset, payload.sourceMarkdown.length));
    if (to <= from) return;

    const sourceBefore = payload.sourceMarkdown.slice(0, from);
    const sourceAfter = payload.sourceMarkdown.slice(to);
    const nextSourceMarkdown = `${sourceBefore}${sourceAfter}`;
    const extractedMarkdown = payload.selectedMarkdown;

    const dropBrickElement = dropTarget.closest("[data-brick-id]") as HTMLElement | null;
    const dropAfterBrickId = dropBrickElement?.getAttribute("data-brick-id") || undefined;

    const dropContainerElement = dropTarget.closest("[data-drop-container-token]") as HTMLElement | null;
    const dropToken = dropContainerElement?.getAttribute("data-drop-container-token") || "";
    let parentProps: { parentId: string; containerId: string } | undefined;
    const separatorIndex = dropToken.indexOf(":");
    if (separatorIndex > 0 && separatorIndex < dropToken.length - 1) {
      parentProps = {
        parentId: dropToken.slice(0, separatorIndex),
        containerId: dropToken.slice(separatorIndex + 1),
      };
    }

    onUpdate(nextSourceMarkdown);
    onAddBrick("text", dropAfterBrickId, parentProps, {
      text: extractedMarkdown,
      markdown: extractedMarkdown,
      displayStyle: "paragraph",
    });
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    const hasInternalSplitPayload = Array.from(e.dataTransfer.types).includes(TEXT_SPLIT_DRAG_MIME);
    if (!hasInternalSplitPayload) return;
    e.preventDefault();
  };

  return (
    <div className="w-full relative group cursor-text" onMouseDown={handleMouseDown}>
      {readonly ? (
        <div
          ref={readonlyRef}
          className={cn(
            "w-full p-2 leading-relaxed text-sm rounded-md prose prose-sm dark:prose-invert max-w-none",
            "[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5"
          )}
          dangerouslySetInnerHTML={{ __html: processPseudoMarkdown(text, true) }}
        />
      ) : (
        <div
          ref={contentRef}
          contentEditable={!readonly}
          suppressContentEditableWarning
          onBlur={handleBlur}
          onFocus={handleFocus}
          onKeyDown={handleKeyDown}
          onKeyUp={handleKeyUp}
          onMouseUp={handleMouseUp}
          onPaste={handlePaste}
           onDragStart={handleDragStart}
           onDragEnd={handleDragEnd}
           onDrop={handleDrop}
          onInput={() => {
             if (isBrickEmpty(contentRef.current)) {
               contentRef.current?.setAttribute("data-empty", "true");
             } else {
               contentRef.current?.removeAttribute("data-empty");
             }
          }}
          className={cn(
            "text-brick-editor w-full min-h-[1.5rem] outline-none p-1.5 leading-relaxed text-sm rounded-md transition-all",
            "focus:bg-accent/5 focus:ring-1 focus:ring-accent/20 cursor-text relative",
            "data-[empty=true]:before:content-[attr(data-placeholder)] data-[empty=true]:before:text-muted-foreground/50 data-[empty=true]:before:pointer-events-none data-[empty=true]:before:absolute data-[empty=true]:before:top-1.5 data-[empty=true]:before:left-1.5"
          )}
          data-placeholder="Pulsa «Espacio» para activar la IA o escribe «/» para mostrar los comandos"
        />
      )}

      {isPickerOpen && !readonly && (
        <Portal>
          <ReferencePicker
            boards={boards}
            documents={documents}
            folders={folders}
            users={users}
            activeBricks={activeBricks as any[]}
 onClose={() => { setIsPickerOpen(false); setPickerFilter(undefined); }} allowedTypes={pickerFilter as any}
            onSelect={(item: ReferencePickerSelection) => {
              const markdown = revertToMarkdown(contentRef.current?.innerHTML || "");
              const insertToken = item.token;
              const cursor = pickerCursorOffset ?? markdown.length;
              const safeCursor = Math.max(0, Math.min(cursor, markdown.length));
              
              // Remove the trigger character (@ or +) right before the cursor
              const isTriggerChar = safeCursor > 0 && (markdown[safeCursor - 1] === "@" || markdown[safeCursor - 1] === "+");
              const replaceFrom = isTriggerChar ? safeCursor - 1 : safeCursor;
              
              const newMarkdown = `${markdown.slice(0, replaceFrom)}${insertToken} ${markdown.slice(safeCursor)}`;
              commitInlineEdit(newMarkdown, { forceRepaint: true });
              setIsPickerOpen(false);
              setPickerCursorOffset(null);
              // Bring focus back to text block
              requestAnimationFrame(() => contentRef.current?.focus());
            }}
          />
        </Portal>
      )}

      {isSlashOpen && !readonly ? (
        <Portal>
          <div
            className="fixed z-[150] flex flex-row overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
            style={{ 
              top: slashMenuPosition.top, 
              left: slashMenuPosition.left,
              maxWidth: filteredSlashCommands.length > 0 && filteredSlashCommands[slashActiveIndex]?.preview ? '600px' : '320px',
              minWidth: '320px'
            }}
          >
            <div className="flex-1 w-[320px] flex flex-col border-r border-border/50">
              <div className="border-b border-border/70 px-3 py-2">
                <div className="rounded-md border border-input bg-background px-2 py-1.5 text-xs text-muted-foreground">
                  /{slashQuery || "..."}
                </div>
              </div>

              <div className="max-h-72 overflow-y-auto p-1.5 flex-1">
                {filteredSlashCommands.length === 0 ? (
                  <div className="px-2 py-3 text-xs text-muted-foreground">Sin resultados</div>
                ) : (
                  filteredSlashCommands.map((command, index) => {
                    const showCategoryHeader = index === 0 || command.category !== filteredSlashCommands[index - 1].category;
                    const catName = command.category
                      ? (tBoardDetail(`brickCategories.${command.category}` as any) ?? command.category)
                      : tBoardDetail("brickCategories.other");

                    return (
                      <React.Fragment key={command.id}>
                        {showCategoryHeader && (
                          <div className="px-2 pt-3 pb-1">
                            <span className="text-xs font-semibold text-muted-foreground">{catName}</span>
                          </div>
                        )}
                        <button
                          type="button"
                          onMouseDown={(event) => {
                            event.preventDefault();
                          }}
                          onMouseEnter={() => setSlashActiveIndex(index)}
                          onClick={() => applySlashCommand(command)}
                          className={cn(
                            "flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors",
                            index === slashActiveIndex ? "bg-accent/80 text-foreground" : "hover:bg-accent/50 text-muted-foreground"
                          )}
                        >
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border/50 bg-background shadow-sm text-foreground">
                            {command.icon}
                          </div>
                          <div className="flex flex-col items-start gap-0.5 overflow-hidden">
                            <span className="text-sm font-medium text-foreground">{command.label}</span>
                            <span className="truncate text-xs text-muted-foreground/80 w-full">{command.description}</span>
                          </div>
                          {command.shortcut && (
                            <div className="ml-auto text-xs text-muted-foreground/60">{command.shortcut}</div>
                          )}
                        </button>
                      </React.Fragment>
                    );
                  })
                )}
              </div>
            </div>
            
            {filteredSlashCommands.length > 0 && filteredSlashCommands[slashActiveIndex]?.preview && (
              <div className="hidden sm:flex w-[280px] bg-muted/10 flex-col">
                <div className="p-4 flex-1">
                   {filteredSlashCommands[slashActiveIndex].preview}
                </div>
                <div className="p-4 mt-auto border-t border-border/50 bg-muted/5 text-xs text-muted-foreground">
                   {filteredSlashCommands[slashActiveIndex].description}
                </div>
              </div>
            )}
          </div>
        </Portal>
      ) : null}

      {!readonly ? (
        <Portal>
          <InlineFormatToolbar
            position={formatToolbarPosition}
            isVisible={isFormatToolbarOpen}
            aiEnabled={!!onAiAction}
            commentsEnabled={!!onComment}
            disabledStyles={disabledStyles}
            onFormat={handleFormat}
            onAction={(action) => {
            // Keep the toolbar open for inline style ops so the user can chain
            // color → size → highlight on the same selection (Notion/Docs feel).
            const isStyleOp = action.startsWith("color:") || action.startsWith("bg:") || action.startsWith("size:");
            if (!isStyleOp) setIsFormatToolbarOpen(false);
            const sel = window.getSelection();
            if (sel && sel.rangeCount > 0) {
              const r = sel.getRangeAt(0);
              const rect = r.getBoundingClientRect();
              setSlashMenuPosition({ top: Math.max(12, rect.bottom + window.scrollY + 8), left: Math.max(12, rect.left + window.scrollX) });
              if (contentRef.current) {
                const offset = getMarkdownCursorOffset(contentRef.current);
                if (offset !== null) setPickerCursorOffset(offset);
              }
            }
            if (action === "clear") {
              clearFormattingInSelection();
            } else if (action === "comment") {
              onComment?.();
            } else if (action === "icon") {
              openIconPicker();
            } else if (action.startsWith("block:")) {
              applyBlockType(action.slice(6));
            } else if (action === "emoji") {
              setIsEmojiPickerOpen(true);
            } else if (action === "math") {
              setMathInsertMode("insert");
              setMathPickerInitialFormula("");
              setMathPickerInitialMode("block");
              setIsMathPickerOpen(true);
            } else if (action === "date") {
              setIsDatePickerOpen(true);
            } else if (action.startsWith('ai-')) {
              const selectedText = window.getSelection()?.toString() || '';
              if (selectedText) {
                const docIdMatch = typeof window !== 'undefined' ? window.location.pathname.match(/\/d\/([^/]+)/) : null;
                const docId = docIdMatch ? docIdMatch[1] : '';
                const startIdx = text.indexOf(selectedText);
                let aiContext = selectedText;
                
                if (docId && id && startIdx !== -1) {
                  const endIdx = startIdx + selectedText.length;
                  aiContext = `$[${docId}:${id}:chars:${startIdx}-${endIdx}]`;
                } else if (docId && id) {
                  aiContext = `$[${docId}:${id}] \n"${selectedText}"`;
                }
                
                onAiAction?.(action, aiContext);
              }
            } else if (action.startsWith('color:')) {
              applyInlineStyle("data-color", action.slice(6), { color: action.slice(6) });
            } else if (action.startsWith('bg:')) {
              const bgValue = action.slice(3);
              applyInlineStyle("data-bg", bgValue, { backgroundColor: bgValue, padding: "0 2px", borderRadius: "3px" });
            } else if (action.startsWith('size:')) {
              const sizeValue = action.slice(5);
              applyInlineStyle("data-size", sizeValue, { fontSize: sizeValue });
            } else {
              void action;
            }
            }}
          />
        </Portal>
      ) : null}

        {isLinkInputOpen && !readonly && (
          <Portal>
            <div
              data-editor-floating-ui="true"
              className="fixed z-[999] flex items-center gap-1.5 rounded-xl border border-border bg-popover/95 backdrop-blur-md p-1.5 shadow-xl w-[280px] animate-in fade-in zoom-in-95 duration-100"
              style={{ top: (formatToolbarPosition.bottom || formatToolbarPosition.top) + 8, left: Math.max(12, formatToolbarPosition.left - 140) }}
              onMouseDown={(e) => e.preventDefault()}
            >
              <LinkIcon className="h-4 w-4 shrink-0 text-muted-foreground ml-1" />
              <input
                autoFocus
                type="url"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); applyLink(); }
                  else if (e.key === "Escape") { e.preventDefault(); setIsLinkInputOpen(false); savedRangeRef.current = null; }
                }}
                placeholder={tDetail("formatToolbar.linkPlaceholder", { fallback: "Paste or type a URL…" }) as string}
                className="flex-1 h-7 bg-transparent px-1 text-sm outline-none placeholder:text-muted-foreground/60"
              />
              <button type="button" onClick={applyLink} disabled={!linkUrl.trim()} className="h-7 px-2 rounded-md bg-accent text-accent-foreground text-xs font-medium disabled:opacity-50 hover:bg-accent/90 transition-colors">
                {tDetail("formatToolbar.linkApply", { fallback: "Apply" }) as string}
              </button>
            </div>
          </Portal>
        )}

        {isDatePickerOpen && !readonly && (
          <Portal>
            <DatePickerPopover
              top={formatToolbarPosition.top || slashMenuPosition.top} 
              left={formatToolbarPosition.left || slashMenuPosition.left} 
              onClose={() => setIsDatePickerOpen(false)}
              onSelect={(ts) => {
                if (contentRef.current) {
                  contentRef.current.focus();
                  const sel = window.getSelection();
                  if (savedRangeRef.current && sel) {
                    sel.removeAllRanges();
                    sel.addRange(savedRangeRef.current);
                  }
                  document.execCommand("insertText", false, ts + " ");
                  const newMarkdown = revertToMarkdown(contentRef.current.innerHTML || "");
                  commitInlineEdit(newMarkdown, { forceRepaint: true });
                }
                setIsDatePickerOpen(false);
                setPickerCursorOffset(null);
                savedRangeRef.current = null;
              }}
            />
          </Portal>
        )}

        {isIconPickerOpen && !readonly && (
          <Portal>
            <LucideIconPicker
              anchor={formatToolbarPosition}
              query={iconPickerQuery}
              setQuery={setIconPickerQuery}
              onClose={() => { setIsIconPickerOpen(false); contentRef.current?.focus(); }}
              onPick={(name) => {
                if (contentRef.current) {
                  // Insert the token AT THE CARET (DOM range), not via a markdown
                  // offset — in Experimental mode the editable shows rendered HTML
                  // whose length differs from the markdown, so offsets land wrong.
                  contentRef.current.focus();
                  const sel = window.getSelection();
                  if (savedRangeRef.current && sel) {
                    sel.removeAllRanges();
                    sel.addRange(savedRangeRef.current);
                  }
                  document.execCommand("insertText", false, `[lu:${name}:2] `);
                  const newMarkdown = revertToMarkdown(contentRef.current.innerHTML || "");
                  commitInlineEdit(newMarkdown, { forceRepaint: true });
                }
                setIsIconPickerOpen(false);
                setPickerCursorOffset(null);
                savedRangeRef.current = null;
                requestAnimationFrame(() => contentRef.current?.focus());
              }}
            />
          </Portal>
        )}

        {isEmojiPickerOpen && !readonly && (
          <Portal>
            <EmojiPickerPopover
              top={formatToolbarPosition.top || slashMenuPosition.top} 
              left={formatToolbarPosition.left || slashMenuPosition.left} 
              onSelect={(emoji) => {
                if (contentRef.current) {
                  contentRef.current.focus();
                  const sel = window.getSelection();
                  if (savedRangeRef.current && sel) {
                    sel.removeAllRanges();
                    sel.addRange(savedRangeRef.current);
                  }
                  document.execCommand("insertText", false, emoji + " ");
                  const newMarkdown = revertToMarkdown(contentRef.current.innerHTML || "");
                  commitInlineEdit(newMarkdown);
                }
                setIsEmojiPickerOpen(false);
                setPickerCursorOffset(null);
                savedRangeRef.current = null;
              }}
            />
          </Portal>
        )}

        {isMathPickerOpen && !readonly && (
          <Portal>
            <MathPickerPopover 
              top={formatToolbarPosition.top || slashMenuPosition.top} 
              left={formatToolbarPosition.left || slashMenuPosition.left} 
              initialFormula={mathPickerInitialFormula}
              initialMode={mathPickerInitialMode}
              onClose={() => {
                setIsMathPickerOpen(false);
                setMathInsertMode("insert");
                setMathPickerInitialFormula("");
                setMathPickerInitialMode("block");
              }}
              onSelect={({ formula, mode, markdown }) => {
                if (contentRef.current) {
                  if (mathInsertMode === "replace-all") {
                    const nextMarkdown = toMathMarkdown(formula, mode);
                    if (nextMarkdown) {
                      onUpdate(nextMarkdown);
                      contentRef.current.innerHTML = processPseudoMarkdown(nextMarkdown);
                    }
                  } else {
                    contentRef.current.focus();
                    const sel = window.getSelection();
                    if (savedRangeRef.current && sel) {
                      sel.removeAllRanges();
                      sel.addRange(savedRangeRef.current);
                    }
                    document.execCommand("insertText", false, markdown + " ");
                    const newMarkdown = revertToMarkdown(contentRef.current.innerHTML || "");
                    commitInlineEdit(newMarkdown, { forceRepaint: true });
                  }
                }
                setIsMathPickerOpen(false);
                setMathInsertMode("insert");
                setMathPickerInitialFormula("");
                setMathPickerInitialMode("block");
                setPickerCursorOffset(null);
                savedRangeRef.current = null;
              }}
            />
          </Portal>
        )}
      </div>
    );
  };
