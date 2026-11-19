"use client";

import React, { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ArrowRight, Code2, Columns, Database, Download, ExternalLink, FileText, Layers, Play,
} from "lucide-react";
import { UnifiedBrickRenderer } from "../bricks/brick-renderer";
import { useSession } from "@/components/providers/session-provider";
import { useTranslations } from "@/components/providers/i18n-provider";
import { API_BASE_URL } from "@/lib/api/client";
import { buildAssistantRender, type AssistantBlock } from "@/lib/agent-render";

/**
 * Shared rendering of what an AI reply SHOWS (prose, bricks, images, files, portals),
 * used by the chat panel / rooms (variant "chat", unchanged look) and by the command
 * palette (variant "compact": narrow, design tokens only, scrolls inside its own box).
 * Tool chips, plans and thinking stay with the chat panel; they are not content.
 */

export type AssistantVariant = "chat" | "compact";
type TFn = (key: string, params?: Record<string, string | number>) => string;

export const resolveAssetUrl = (url: string) => {
  if (!url) return "";
  if (url.startsWith("http") || url.startsWith("data:")) return url;
  if (url.startsWith("/")) return `${API_BASE_URL}${url}`;
  return url;
};

export async function fetchAndDownload(url: string, filename?: string, accessToken?: string) {
  try {
    const headers: Record<string, string> = {};
    if (accessToken && url.startsWith(API_BASE_URL)) headers["Authorization"] = `Bearer ${accessToken}`;
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
    const blob = await res.blob();
    const blobUrl = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = filename || (url.split("/").pop() || "download");
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(blobUrl);
  } catch (err) {
    console.error("Download failed:", err);
    window.open(url, "_blank");
  }
}

export const IframeWithPreview = ({ src, title, height, screenshot, t }: { src: string; title?: string; height: string; screenshot?: string; t: TFn }) => {
  const [isLive, setIsLive] = useState(false);

  if (isLive) {
    return (
      <iframe
        src={src}
        className="w-full rounded-lg bg-white animate-in fade-in duration-500"
        style={{ height }}
        title={title || "Portal Content"}
      />
    );
  }

  return (
    <div
      className="relative flex flex-col items-center justify-center bg-background/50 dark:bg-slate-950/50 rounded-lg cursor-pointer hover:bg-card/60 dark:hover:bg-slate-900/60 transition-all border border-blue-500/10 overflow-hidden"
      style={{ height }}
      onClick={() => setIsLive(true)}
    >
      {screenshot && (
        <img
          src={screenshot}
          alt={title || "Preview"}
          className="absolute inset-0 w-full h-full object-cover opacity-30 group-hover/iframe:opacity-50 transition-opacity"
        />
      )}
      <div className="relative z-10 w-16 h-16 rounded-full bg-blue-500/20 backdrop-blur-sm flex items-center justify-center text-blue-400 group-hover/iframe:scale-110 transition-transform">
        <Play className="w-8 h-8 ml-1" />
      </div>
      <div className="relative z-10 mt-4 text-xs font-bold text-blue-600 dark:text-blue-300 uppercase tracking-widest drop-shadow-md">{t("agent.asset.activateLive")}</div>
      <div className="relative z-10 mt-1 text-[10px] text-blue-500/60 font-mono truncate max-w-[80%]">
        {src.startsWith("/") ? window.location.hostname : (src.startsWith("http") ? new URL(src).hostname : src)}
      </div>
    </div>
  );
};

// ── markdown ─────────────────────────────────────────────────────────────────

export const COMPACT_PROSE_CLASS =
  "prose prose-sm dark:prose-invert max-w-none break-words text-sm text-foreground [overflow-wrap:anywhere] prose-p:my-1.5 prose-headings:my-2 prose-headings:text-foreground prose-strong:text-foreground prose-ul:my-1.5 prose-ol:my-1.5 prose-li:my-0.5 prose-pre:overflow-x-auto prose-pre:border prose-pre:border-border prose-pre:bg-muted/50 prose-pre:text-foreground prose-code:text-foreground";

export function AssistantMarkdown({
  text,
  className = COMPACT_PROSE_CLASS,
  components,
}: {
  text: string;
  className?: string;
  components?: React.ComponentProps<typeof ReactMarkdown>["components"];
}) {
  return (
    <div className={className}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  );
}

// ── bricks ───────────────────────────────────────────────────────────────────

class BrickBoundary extends React.Component<{ fallback: React.ReactNode; children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.error("Brick render failed:", error);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function FallbackText({ text }: { text: string }) {
  return <p className="whitespace-pre-wrap break-words text-xs text-muted-foreground [overflow-wrap:anywhere]">{text}</p>;
}

function BrickView({
  block,
  variant,
}: {
  block: Extract<AssistantBlock, { type: "brick" }>;
  variant: AssistantVariant;
}) {
  const previewBrick = useMemo(
    () => ({
      id: `asset-brick-${block.key}`,
      documentId: "preview",
      kind: block.kind,
      content: block.content,
      position: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
    [block.key, block.kind, block.content],
  );
  const body = (
    <BrickBoundary fallback={<FallbackText text={JSON.stringify(block.content)} />}>
      <UnifiedBrickRenderer brick={previewBrick as any} canEdit={false} onUpdate={() => { }} isCompact />
    </BrickBoundary>
  );

  if (variant === "chat") {
    return (
      <div className="my-3 rounded-xl overflow-hidden border border-violet-500/30 dark:border-violet-400/20 bg-card shadow-sm animate-in slide-in-from-bottom-2 duration-300">
        <div className="flex h-8 items-center gap-2 border-b border-violet-500/10 bg-violet-500/5 px-3 select-none">
          <Database className="h-3.5 w-3.5 shrink-0 text-primary" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-primary">
            Asset Brick · {block.kind}
          </span>
          {block.title && <span className="ml-1 truncate text-[10px] text-muted-foreground">— {block.title}</span>}
        </div>
        <div className="p-2 overflow-auto max-h-[500px]">{body}</div>
      </div>
    );
  }

  const label = block.title || block.kind.replace(/_/g, " ");
  return (
    // aria-live="off": the palette answer is a polite live region; a brick is announced
    // once (by its label) and never re-announced as its inner DOM settles.
    <div role="group" aria-live="off" aria-label={label} className="my-2 min-w-0 max-w-full overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex items-center gap-1.5 border-b border-border bg-muted/40 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
        <Database className="h-3 w-3 shrink-0 text-primary" aria-hidden />
        <span className="truncate">{label}</span>
      </div>
      {/* Wide tables scroll inside this box (keyboard reachable), never the page. */}
      <div
        role="region"
        tabIndex={0}
        aria-label={label}
        className="max-h-[360px] min-w-0 max-w-full overflow-auto p-1.5 text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
      >
        {body}
      </div>
    </div>
  );
}

// ── one asset ────────────────────────────────────────────────────────────────

export function AssetView({
  block,
  variant = "chat",
  t: tProp,
}: {
  block: AssistantBlock;
  variant?: AssistantVariant;
  t?: TFn;
}) {
  const tHook = useTranslations("common");
  const t: TFn = tProp ?? (tHook as TFn);
  const { accessToken } = useSession();

  if (block.type === "brick") return <BrickView block={block} variant={variant} />;

  if (block.type === "brick-fallback") {
    if (!block.text && !block.title) return null;
    return (
      <div className="my-2 min-w-0 max-w-full overflow-hidden rounded-lg border border-border bg-muted/30 px-2.5 py-1.5">
        {block.title ? <p className="mb-1 truncate text-[11px] font-medium text-foreground">{block.title}</p> : null}
        <FallbackText text={block.text} />
      </div>
    );
  }

  if (block.type === "other-asset") {
    // The chat panel always drew an (empty) card for unknown asset types; the palette draws nothing.
    return variant === "chat" ? (
      <div className="my-2 rounded-xl border border-border/50 bg-background/50 p-2 overflow-hidden animate-in zoom-in-95 fill-mode-both" />
    ) : null;
  }

  if (block.type === "portal") {
    const { portalType: type, src, title, height, screenshot } = block;
    const assetSrc = resolveAssetUrl(src || "");
    const href = type === "document" ? `/d/${src}` : (type === "kanban" || type === "mesh" ? `/b/${src}` : src);

    if (variant === "compact") {
      // Documents / boards / meshes are already offered as source chips under the answer.
      if (type === "document" || type === "kanban" || type === "mesh") return null;
      const target = type === "script" ? `/s/${src}` : src;
      return (
        <a
          href={target}
          target="_blank"
          rel="noopener noreferrer"
          className="my-2 flex min-w-0 max-w-full items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-2 text-xs text-foreground hover:bg-accent/10"
        >
          {type === "script" ? <Code2 className="h-4 w-4 shrink-0 text-primary" aria-hidden /> : <ExternalLink className="h-4 w-4 shrink-0 text-primary" aria-hidden />}
          <span className="min-w-0 flex-1 truncate">{title || (type === "iframe" ? "Live Content" : type)}</span>
          <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
        </a>
      );
    }

    return (
      <div className="my-3 rounded-xl overflow-hidden border-2 border-blue-500/20 dark:border-blue-400/20 bg-card/95 dark:bg-slate-900/95 shadow-lg animate-in zoom-in-95 duration-200">
        <div className="flex h-8 items-center gap-2 border-b border-blue-500/10 bg-blue-950/40 px-3 select-none">
          <ExternalLink className="h-3.5 w-3.5 shrink-0 text-blue-400" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-blue-600 dark:text-blue-300">
            {type === "iframe" ? "Live Content" : type}
          </span>
          {title && <span className="ml-1 truncate text-[10px] text-blue-700/60 dark:text-blue-200/60">— {title}</span>}
          <div className="ml-auto flex items-center gap-1">
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1 hover:bg-blue-400/20 rounded transition-colors text-blue-400"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
            {assetSrc && (assetSrc.startsWith("http") || assetSrc.startsWith("data:") || assetSrc.startsWith(API_BASE_URL)) && (
              <button
                type="button"
                onClick={async (e) => { e.stopPropagation(); await fetchAndDownload(assetSrc, title || `attachment`, accessToken!); }}
                className="p-1 hover:bg-blue-400/20 rounded transition-colors text-blue-400"
                title={t?.("agent.asset.download") || "Descargar"}
              >
                <Download className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className="p-1">
          {type === "iframe" ? (
            <div className="relative group/iframe">
              <IframeWithPreview
                src={src.startsWith("/") ? (src.includes("?") ? `${src}&noLayout=true` : `${src}?noLayout=true`) : src}
                title={title || "Portal Content"}
                height={height || "400px"}
                screenshot={screenshot}
                t={t}
              />
            </div>
          ) : (
            <div
              className="group/asset relative p-4 bg-blue-500/5 hover:bg-blue-500/10 transition-colors cursor-pointer rounded-lg flex items-center gap-4"
              onClick={() => {
                if (type === "document") window.open(`/d/${src}`, "_blank");
                if (type === "kanban" || type === "mesh") window.open(`/b/${src}`, "_blank");
                if (type === "script") window.open(`/s/${src}`, "_blank");
              }}
            >
              <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center text-blue-400">
                {type === "document" && <FileText className="w-6 h-6" />}
                {type === "kanban" && <Columns className="w-6 h-6" />}
                {type === "mesh" && <Layers className="w-6 h-6" />}
                {type === "script" && <Code2 className="w-6 h-6" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-bold text-blue-50 truncate">{title || `Abrir ${type}`}</div>
                <div className="text-[10px] text-blue-400/60 font-mono tracking-tight uppercase">Entidad: {src?.slice(0, 12)}...</div>
              </div>
              <div className="opacity-0 group-hover/asset:opacity-100 transition-opacity bg-blue-500/20 p-2 rounded-full">
                <ArrowRight className="w-4 h-4 text-blue-400" />
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (block.type === "image") {
    const { src, title, height } = block;
    const assetSrc = resolveAssetUrl(src || "");

    if (variant === "compact") {
      return (
        <figure className="my-2 min-w-0 max-w-full overflow-hidden rounded-lg border border-border bg-card p-1.5">
          <img
            src={assetSrc}
            alt={title || "Image"}
            loading="lazy"
            className="h-auto max-w-full rounded-md object-contain"
            style={{ maxHeight: height || "320px" }}
          />
          <figcaption className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
            {title ? <span className="min-w-0 flex-1 truncate">{title}</span> : <span className="flex-1" />}
            <a
              href={assetSrc}
              target="_blank"
              rel="noopener noreferrer"
              title={t("agent.asset.original")}
              aria-label={t("agent.asset.original")}
              className="rounded p-0.5 text-foreground hover:bg-accent/10"
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </a>
          </figcaption>
        </figure>
      );
    }

    return (
      <div className="my-2 rounded-xl border border-border/50 bg-background/50 p-2 overflow-hidden animate-in zoom-in-95 fill-mode-both">
        <div className="relative group/img-asset overflow-hidden rounded-lg">
          <img
            src={assetSrc}
            alt={title || "Image Asset"}
            className="w-full h-auto object-contain shadow-sm transition-all group-hover/img-asset:scale-[1.01] cursor-zoom-in bg-card"
            style={{ maxHeight: height || "400px" }}
          />
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/img-asset:opacity-100 transition-opacity flex items-center justify-center gap-2">
            <a
              href={assetSrc}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 bg-foreground/20 dark:bg-white/20 hover:bg-foreground/40 dark:hover:bg-white/40 rounded-full text-foreground dark:text-white transition-all backdrop-blur-sm pointer-events-auto"
              title={t("agent.asset.original")}
            >
              <ExternalLink className="w-4 h-4" />
            </a>
            <button
              type="button"
              onClick={async (e) => { e.stopPropagation(); await fetchAndDownload(assetSrc, title || "image.png", accessToken!); }}
              className="p-2 bg-foreground/20 dark:bg-white/20 hover:bg-foreground/40 dark:hover:bg-white/40 rounded-full text-foreground dark:text-white transition-all backdrop-blur-sm pointer-events-auto"
              title={t("agent.asset.download")}
            >
              <Download className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (block.type === "markdown") return <AssistantMarkdown text={block.text} />;

  // file (pdf / uploaded document)
  const { src, title, fileType } = block;
  const assetSrc = resolveAssetUrl(src || "");

  if (variant === "compact") {
    return (
      <div className="my-2 flex min-w-0 max-w-full items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-2 text-xs text-foreground">
        <FileText className="h-4 w-4 shrink-0 text-primary" aria-hidden />
        <span className="min-w-0 flex-1 truncate font-medium">{title || (fileType === "pdf" ? "PDF Document" : "Documento")}</span>
        <a
          href={assetSrc}
          target="_blank"
          rel="noopener noreferrer"
          title={t("agent.asset.original")}
          aria-label={t("agent.asset.original")}
          className="rounded p-1 text-foreground hover:bg-accent/10"
        >
          <ExternalLink className="h-3.5 w-3.5" aria-hidden />
        </a>
      </div>
    );
  }

  return (
    <div className="my-2 rounded-xl border border-border/50 bg-background/50 p-2 overflow-hidden animate-in zoom-in-95 fill-mode-both">
      <div className="flex items-center gap-3 p-3 bg-white/50 dark:bg-black/20 rounded-lg border border-border/50">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <FileText className="w-6 h-6 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-bold truncate text-foreground">{title || (fileType === "pdf" ? "PDF Document" : "Documento")}</div>
          <div className="text-[9px] text-muted-foreground uppercase font-mono tracking-tighter">Adjunto</div>
        </div>
        <a href={assetSrc} target="_blank" rel="noopener noreferrer" className="p-2 hover:bg-violet-100 dark:hover:bg-violet-900/40 rounded-full transition-colors text-primary">
          <ExternalLink className="w-4 h-4" />
        </a>
        <button
          type="button"
          onClick={async (e) => { e.stopPropagation(); await fetchAndDownload(assetSrc, title || "attachment", accessToken!); }}
          className="p-2 hover:bg-violet-100 dark:hover:bg-violet-900/40 rounded-full transition-colors text-primary"
          title={t("agent.asset.download")}
        >
          <Download className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// ── whole message body (used by the palette) ─────────────────────────────────

export function AssistantMessageContent({
  text,
  isStreaming = false,
  variant = "compact",
  markdownClassName,
  markdownComponents,
}: {
  text: string;
  isStreaming?: boolean;
  variant?: AssistantVariant;
  markdownClassName?: string;
  markdownComponents?: React.ComponentProps<typeof ReactMarkdown>["components"];
}) {
  const render = useMemo(() => buildAssistantRender(text, { streaming: isStreaming }), [text, isStreaming]);
  const showPending = isStreaming && render.partialAsset;

  return (
    <>
      {render.blocks.map((block) =>
        block.type === "markdown" ? (
          <AssistantMarkdown key={block.key} text={block.text} className={markdownClassName} components={markdownComponents} />
        ) : (
          <AssetView key={block.key} block={block} variant={variant} />
        ),
      )}
      {showPending ? <div aria-hidden className="my-2 h-8 rounded-lg bg-muted/50 motion-safe:animate-pulse" /> : null}
    </>
  );
}
