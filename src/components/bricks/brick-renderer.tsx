"use client";

import React from "react";
import { MoreHorizontal, AlignLeft, AlignCenter, AlignRight, Maximize, FileText, Settings, Link as LinkIcon, Image as ImageIcon, MessageSquare, MessageSquarePlus, Send, Paperclip, AtSign, ArrowUp, SmilePlus, Check, Copy, Edit, BellOff, Trash } from "lucide-react";
import { UnifiedTableBrick } from "./unified-table-brick";
import { UnifiedTextBrick } from "./unified-text-brick";
import { UnifiedGraphBrick } from "./unified-graph-brick";
import { UnifiedChecklistBrick } from "./unified-checklist-brick";
import { UnifiedAccordionBrick } from "./unified-accordion-brick";
import { UnifiedQuoteBrick } from "./unified-quote-brick";
import { UnifiedDividerBrick } from "./unified-divider-brick";
import { UnifiedCalloutBrick } from "./unified-callout-brick";
import { DocumentBrick, DocumentSummary } from "@/lib/api/documents";
import { BoardSummary } from "@/lib/api/contracts";
import { useSession } from "@/components/providers/session-provider";
import { useTranslations } from "@/components/providers/i18n-provider";
import { cn } from "@/lib/utils";

type MediaCarouselItem = {
  url: string;
  title?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
  assetId?: string | null;
};

type MediaMeta = {
  subtitle?: string;
  items: MediaCarouselItem[];
  layout?: "left" | "center" | "right" | "full";
  border?: "none" | "soft" | "strong";
  shadow?: "none" | "md" | "lg";
};

const MEDIA_META_PREFIX = "__media_meta_v1__:";

const parseMediaMeta = (caption: string | null | undefined, fallback: MediaCarouselItem): MediaMeta => {
  if (caption && caption.startsWith(MEDIA_META_PREFIX)) {
    try {
      const parsed = JSON.parse(caption.slice(MEDIA_META_PREFIX.length));
      const items = Array.isArray(parsed?.items)
        ? parsed.items.filter((it: any) => typeof it?.url === "string" && it.url.length > 0)
        : [];
      if (items.length > 0) {
        return {
          subtitle: typeof parsed?.subtitle === "string" ? parsed.subtitle : "",
          items,
          layout: parsed.layout || "center",
          border: parsed.border || "soft",
          shadow: parsed.shadow || "none",
        };
      }
    } catch {
      // Fallback to legacy behavior below.
    }
  }

  return {
    subtitle: typeof caption === "string" && !caption.startsWith(MEDIA_META_PREFIX) ? caption : "",
    items: fallback.url ? [fallback] : [],
    layout: "center",
    border: "soft",
    shadow: "none",
  };
};

const buildMediaCaption = (meta: MediaMeta): string => {
  return `${MEDIA_META_PREFIX}${JSON.stringify({ 
    subtitle: meta.subtitle || "", 
    items: meta.items,
    layout: meta.layout || "center",
    border: meta.border || "soft",
    shadow: meta.shadow || "none",
  })}`;
};

const MediaBrickCard: React.FC<{
  brickId: string;
  content: any;
  canEdit: boolean;
  onUpdate: (content: any) => void;
  onUploadMediaFiles?: (payload: { brickId: string; files: File[] }) => Promise<void> | void;
}> = ({ brickId, content, canEdit, onUpdate, onUploadMediaFiles }) => {
  const fallback: MediaCarouselItem = {
    url: content.url || "",
    title: content.title || "",
    mimeType: content.mimeType || null,
    sizeBytes: content.sizeBytes || null,
    assetId: content.assetId || null,
  };

  const meta = parseMediaMeta(content.caption, fallback);
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [showSettings, setShowSettings] = React.useState(false);

  React.useEffect(() => {
    if (activeIndex >= meta.items.length) {
      setActiveIndex(Math.max(0, meta.items.length - 1));
    }
  }, [activeIndex, meta.items.length]);

  const activeItem = meta.items[activeIndex] || fallback;
  const mime = (activeItem?.mimeType || "").toLowerCase();
  const isImage = mime.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(activeItem?.url || "");
  const isVideo = mime.startsWith("video/") || /\.(mp4|webm|mov|ogg|m4v)$/i.test(activeItem?.url || "");

  const updateMeta = (nextMeta: MediaMeta, nextIndex = 0) => {
    const first = nextMeta.items[0];
    onUpdate({
      ...content,
      kind: "media",
      mediaType: first?.mimeType?.startsWith("video/") ? "file" : "image",
      title: first?.title || content.title || "Media",
      url: first?.url || "",
      mimeType: first?.mimeType || null,
      sizeBytes: first?.sizeBytes || null,
      assetId: first?.assetId || null,
      caption: buildMediaCaption(nextMeta),
    });
    setActiveIndex(nextIndex);
  };

  const layout = meta.layout || "center";
  const border = meta.border || "soft";
  const shadow = meta.shadow || "none";

  const getContainerClassName = () => {
    let classes = "relative group flex flex-col my-4 ";
    if (layout === "left") classes += "items-start ";
    else if (layout === "right") classes += "items-end ";
    else classes += "items-center ";
    return classes;
  };

  const getMediaWrapperClassName = () => {
    let classes = "transition-all duration-200 overflow-hidden relative group/media ";
    if (layout === "full") classes += "w-full ";
    else classes += "w-auto max-w-full ";

    if (border === "soft") classes += "rounded-xl border border-border/40 ";
    else if (border === "strong") classes += "rounded-xl border-2 border-border/80 ";
    
    if (shadow === "md") classes += "shadow-md ";
    else if (shadow === "lg") classes += "shadow-lg ";

    if (!activeItem?.url) classes += "bg-muted/10 min-w-[200px] border-dashed border-2 py-6 ";
    return classes;
  };

  return (
    <div className={getContainerClassName()}>
      <div className={getMediaWrapperClassName()}>
        {/* MEDIA RENDER */}
        {activeItem?.url ? (
          isVideo ? (
            <video src={activeItem.url} controls className={`bg-black/5 ${layout === "full" ? "w-full object-cover max-h-[70vh]" : "max-h-[60vh] object-contain w-auto mx-auto"}`} />
          ) : isImage ? (
            <img src={activeItem.url} alt={activeItem.title || content.title || "Media"} className={`bg-transparent ${layout === "full" ? "w-full object-cover max-h-[70vh]" : "max-h-[70vh] object-contain w-auto mx-auto"}`} />
          ) : (
            <div className="flex flex-col items-center justify-center p-6 bg-muted/20 gap-2 min-w-[200px]">
              <FileText className="w-10 h-10 text-muted-foreground/60" />
              <a href={activeItem.url} target="_blank" rel="noreferrer" className="text-sm font-semibold text-accent hover:underline break-all max-w-[300px] text-center">
                {activeItem.title || "Abrir archivo"}
              </a>
            </div>
          )
        ) : (
          <div className="flex flex-col items-center justify-center p-8 gap-3 text-center">
            <ImageIcon className="w-10 h-10 text-muted-foreground/40" />
            <div className="text-sm text-muted-foreground font-medium">Adjunta imagen, video o archivo</div>
            {canEdit && (
              <label className="cursor-pointer bg-primary text-primary-foreground px-4 py-1.5 rounded-md text-sm font-medium hover:bg-primary/90 mt-2">
                Subir
                <input
                  type="file"
                  multiple
                  accept="image/*,video/*,.svg,.pdf,.txt,.csv,.doc,.docx,.ppt,.pptx,.xls,.xlsx"
                  className="hidden"
                  onChange={(event) => {
                    const files = Array.from(event.target.files || []);
                    if (files.length === 0) return;
                    if (onUploadMediaFiles) {
                      void Promise.resolve(onUploadMediaFiles({ brickId, files }));
                    }
                    event.currentTarget.value = "";
                  }}
                />
              </label>
            )}
          </div>
        )}

        {/* CAROUSEL CONTROLS OVER MEDIA */}
        {meta.items.length > 1 ? (
          <>
            <button
              type="button"
              onClick={() => setActiveIndex((prev) => (prev - 1 + meta.items.length) % meta.items.length)}
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full border border-border/40 bg-background/80 px-2 py-1 text-xs opacity-0 group-hover/media:opacity-100 transition-opacity"
            >
              Prev
            </button>
            <button
              type="button"
              onClick={() => setActiveIndex((prev) => (prev + 1) % meta.items.length)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full border border-border/40 bg-background/80 px-2 py-1 text-xs opacity-0 group-hover/media:opacity-100 transition-opacity"
            >
              Next
            </button>
            <div className="absolute bottom-2 right-2 rounded-md bg-background/80 px-2 py-1 text-[11px] font-semibold opacity-0 group-hover/media:opacity-100 transition-opacity">
              {activeIndex + 1} / {meta.items.length}
            </div>
          </>
        ) : null}

        {/* FLOATING EDIT BUTTON (Notion Style) */}
        {canEdit && activeItem?.url && (
          <button 
            type="button"
            onClick={() => setShowSettings(!showSettings)}
            className="absolute top-2 right-2 rounded-md bg-background/90 text-foreground border border-border/50 p-1.5 opacity-0 group-hover/media:opacity-100 transition-opacity hover:bg-muted shadow-sm"
          >
            <Settings className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* SUBTITLE BELOW MEDIA */}
      {showSettings ? null : (
        <div className="mt-2 w-full max-w-2xl text-center flex flex-col items-center">
           {canEdit ? (
             <input
               value={meta.subtitle || ""}
               onChange={(event) => updateMeta({ ...meta, subtitle: event.target.value }, activeIndex)}
               placeholder="Escribe un subtítulo..."
               className="bg-transparent text-center text-sm text-muted-foreground outline-none border-none placeholder:text-muted-foreground/50 w-full resize-none min-h-[1.5rem]"
             />
           ) : (
             meta.subtitle ? <p className="text-sm text-muted-foreground">{meta.subtitle}</p> : null
           )}
        </div>
      )}

      {/* SETTINGS PANEL */}
      {showSettings && canEdit && (
        <div className="w-full max-w-2xl mt-4 p-4 rounded-xl border border-border/60 bg-muted/10 shadow-sm space-y-4 text-sm animate-in fade-in slide-in-from-top-2">
          {/* Layout Controls */}
          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold text-muted-foreground tracking-wider uppercase">Alineación</span>
            <div className="flex items-center gap-1 bg-muted/20 p-1 rounded-lg w-fit border border-border/50">
              <button onClick={() => updateMeta({ ...meta, layout: "left" })} className={`p-1.5 rounded-md ${layout === "left" ? "bg-background shadow-sm" : "hover:bg-background/50 text-muted-foreground"}`} title="Izquierda"><AlignLeft className="w-4 h-4" /></button>
              <button onClick={() => updateMeta({ ...meta, layout: "center" })} className={`p-1.5 rounded-md ${layout === "center" ? "bg-background shadow-sm" : "hover:bg-background/50 text-muted-foreground"}`} title="Centro"><AlignCenter className="w-4 h-4" /></button>
              <button onClick={() => updateMeta({ ...meta, layout: "right" })} className={`p-1.5 rounded-md ${layout === "right" ? "bg-background shadow-sm" : "hover:bg-background/50 text-muted-foreground"}`} title="Derecha"><AlignRight className="w-4 h-4" /></button>
              <button onClick={() => updateMeta({ ...meta, layout: "full" })} className={`p-1.5 rounded-md ${layout === "full" ? "bg-background shadow-sm" : "hover:bg-background/50 text-muted-foreground"}`} title="Ancho Completo"><Maximize className="w-4 h-4" /></button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Border Options */}
            <div className="flex flex-col gap-2">
              <span className="text-xs font-semibold text-muted-foreground tracking-wider uppercase">Bordes</span>
               <select
                value={border}
                onChange={(e) => updateMeta({ ...meta, border: e.target.value as any })}
                className="w-full rounded-md border border-input shadow-sm bg-background px-3 py-1.5 text-sm outline-none"
              >
                <option value="none">Sin borde</option>
                <option value="soft">Borde Suave</option>
                <option value="strong">Borde Fuerte</option>
              </select>
            </div>

            {/* Shadow Options */}
             <div className="flex flex-col gap-2">
              <span className="text-xs font-semibold text-muted-foreground tracking-wider uppercase">Sombra</span>
               <select
                value={shadow}
                onChange={(e) => updateMeta({ ...meta, shadow: e.target.value as any })}
                className="w-full rounded-md border border-input shadow-sm bg-background px-3 py-1.5 text-sm outline-none"
              >
                <option value="none">Sin sombra</option>
                <option value="md">Media</option>
                <option value="lg">Grande</option>
              </select>
            </div>
          </div>

          {/* Edit current URLs / Subtitle / Items */}
           <div className="flex flex-col gap-3 pt-2 border-t border-border/40">
              <div className="flex items-center gap-2">
                 <LinkIcon className="w-4 h-4 text-muted-foreground" />
                 <input 
                   value={activeItem?.url || ""} 
                   placeholder="URL del archivo actual" 
                   onChange={(e) => {
                     const newItems = [...meta.items];
                     newItems[activeIndex] = { ...activeItem, url: e.target.value };
                     updateMeta({ ...meta, items: newItems }, activeIndex);
                   }}
                   className="flex-1 rounded-md border border-input shadow-sm bg-background px-3 py-1.5 text-sm outline-none" 
                 />
              </div>

               <input 
                 value={meta.subtitle || ""} 
                 placeholder="Escribe un subtítulo general..." 
                 onChange={(e) => updateMeta({ ...meta, subtitle: e.target.value }, activeIndex)}
                 className="w-full rounded-md border border-input shadow-sm bg-background px-3 py-1.5 text-sm outline-none" 
               />

               <div className="flex items-center gap-2 mt-2">
                <label className="inline-flex cursor-pointer items-center rounded-md border border-border bg-background px-3 py-1.5 text-xs font-semibold hover:bg-muted/40 shadow-sm">
                  Subir más archivos
                  <input
                    type="file"
                    multiple
                    accept="image/*,video/*,.svg,.pdf,.txt,.csv,.doc,.docx,.ppt,.pptx,.xls,.xlsx"
                    className="hidden"
                    onChange={(event) => {
                      const files = Array.from(event.target.files || []);
                      if (files.length === 0) return;
                      if (onUploadMediaFiles) {
                        void Promise.resolve(onUploadMediaFiles({ brickId, files }));
                      }
                      event.currentTarget.value = "";
                    }}
                  />
                </label>
                 <button onClick={() => setShowSettings(false)} className="ml-auto bg-primary text-primary-foreground text-xs font-semibold px-4 py-1.5 rounded-md hover:bg-primary/90 shadow-sm">
                   Aceptar
                 </button>
               </div>
           </div>

           {/* Carousel Thumbnails inside settings */}
            {meta.items.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-1 mt-2 p-2 bg-background rounded-lg border border-border/40 overflow-hidden">
              {meta.items.map((item, idx) => {
                const itemMime = (item.mimeType || "").toLowerCase();
                const thumbImage = itemMime.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(item.url || "");
                return (
                  <button
                    type="button"
                    key={`${item.url}-${idx}`}
                    onClick={() => setActiveIndex(idx)}
                    className={`h-12 w-16 shrink-0 overflow-hidden rounded-md border ${idx === activeIndex ? "border-primary border-2" : "border-border/60"}`}
                  >
                    {thumbImage ? (
                      <img src={item.url} alt={item.title || `Media ${idx + 1}`} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-muted/20 text-[9px] font-semibold">FILE</div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

interface BrickRendererProps {
  brick: DocumentBrick;
  canEdit: boolean;
  onUpdate: (content: any) => void;
  onAddBrick?: (kind: string, afterBrickId?: string) => void;
  documents?: DocumentSummary[];
  boards?: BoardSummary[];
  activeBricks?: DocumentBrick[];
  users?: Array<{ id: string; name: string; avatarUrl?: string | null }>;
  onPasteImageInTextBrick?: (payload: { brickId: string; file: File; cursorOffset: number; markdown: string }) => Promise<string | void> | string | void;
  onUploadMediaFiles?: (payload: { brickId: string; files: File[] }) => Promise<void> | void;
}

type BrickComment = {
  id: string;
  text: string;
  createdAt: string;
  userId?: string | null;
  userName?: string | null;
  resolved?: boolean;
};

function normalizeBrickComments(raw: unknown): BrickComment[] {
  if (!Array.isArray(raw)) return [];

  const comments: BrickComment[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const text = typeof record.text === "string" ? record.text.trim() : "";
    if (!text) continue;

    const id = typeof record.id === "string" && record.id.trim().length > 0
      ? record.id
      : `comment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const createdAt = typeof record.createdAt === "string" && record.createdAt.trim().length > 0
      ? record.createdAt
      : new Date().toISOString();

    comments.push({
      id,
      text,
      createdAt,
      userId: typeof record.userId === "string" ? record.userId : null,
      userName: typeof record.userName === "string" ? record.userName : null,
      resolved: Boolean(record.resolved),
    });
  }

  return comments;
}

export function UnifiedBrickRenderer({
  brick,
  canEdit,
  onUpdate,
  onAddBrick,
  documents = [],
  boards = [],
  activeBricks = [],
  users = [],
  onPasteImageInTextBrick,
  onUploadMediaFiles
}: BrickRendererProps) {
  const t = useTranslations("document-detail");
  const { user } = useSession();
  const { kind, content } = brick;
  const [isCommentsOpen, setIsCommentsOpen] = React.useState(false);
  const [newComment, setNewComment] = React.useState("");
  const [activeMenu, setActiveMenu] = React.useState<string | null>(null);

  const comments = React.useMemo(() => normalizeBrickComments(content?.comments), [content?.comments]);

  const submitComment = () => {
    if (!canEdit) return;
    const text = newComment.trim();
    if (!text) return;

    const nextComment: BrickComment = {
      id: typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `comment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      text,
      createdAt: new Date().toISOString(),
      userId: user?.id ?? null,
      userName: user?.displayName || user?.username || "Anon",
      resolved: false,
    };

    onUpdate({
      ...content,
      comments: [...comments, nextComment],
    });
    setNewComment("");
    setIsCommentsOpen(true);
  };

  let brickBody: React.ReactNode;

  switch (kind) {
    case 'text':
      brickBody = (
        <UnifiedTextBrick
          id={brick.id}
          text={content.text || content.markdown || ""}
          onAddBrick={(kind) => onAddBrick?.(kind, brick.id)}
          onUpdate={(text: any) => {
            // Pass only the fields that matter for text brick
            onUpdate({
              kind: 'text',
              displayStyle: content.displayStyle || 'paragraph',
              markdown: text,
            });
          }}
          readonly={!canEdit}
          documents={documents}
          boards={boards}
          activeBricks={activeBricks}
          users={users}
          onPasteImage={(payload) => onPasteImageInTextBrick?.({ ...payload, brickId: brick.id })}
        />
      );
      break;

    case 'table':
      brickBody = (
        <UnifiedTableBrick
          id={brick.id}
          data={content.rows || [['Header 1', 'Header 2'], ['', '']]}
          onUpdate={(rows) => onUpdate({ ...content, rows })}
          readonly={!canEdit}
          documents={documents}
          boards={boards}
          users={users}
          activeBricks={activeBricks}
        />
      );
      break;

    case 'graph':
      brickBody = (
        <UnifiedGraphBrick
          id={brick.id}
          config={content as any}
          onUpdate={(newConfig) => onUpdate({ ...content, ...newConfig })}
          readonly={!canEdit}
          activeBricks={activeBricks as any[]}
        />
      );
      break;

    case 'checklist':
      brickBody = (
        <UnifiedChecklistBrick
          id={brick.id}
          items={content.items || []}
          onUpdate={(items) => onUpdate({ ...content, items })}
          readonly={!canEdit}
          documents={documents}
          boards={boards}
          users={users}
        />
      );
      break;

    case 'quote':
      brickBody = (
        <UnifiedQuoteBrick
          id={brick.id}
          text={content.text || content.markdown || ""}
          onAddBrick={(k) => onAddBrick?.(k, brick.id)}
          onUpdate={(text: any) => onUpdate({ ...content, kind: 'quote', markdown: text })}
          readonly={!canEdit}
          documents={documents}
          boards={boards}
          activeBricks={activeBricks}
          users={users}
        />
      );
      break;

    case 'divider':
      brickBody = (
        <UnifiedDividerBrick
          id={brick.id}
          readonly={!canEdit}
        />
      );
      break;

    case 'callout':
      brickBody = (
        <UnifiedCalloutBrick
          id={brick.id}
          text={content.text || content.markdown || ""}
          onAddBrick={(k) => onAddBrick?.(k, brick.id)}
          onUpdate={(text: any) => onUpdate({ ...content, kind: 'callout', markdown: text })}
          readonly={!canEdit}
          documents={documents}
          boards={boards}
          activeBricks={activeBricks}
          users={users}
        />
      );
      break;

    case 'accordion':
      brickBody = (
        <UnifiedAccordionBrick
          id={brick.id}
          title={content.title || ""}
          body={content.body || ""}
          isExpanded={!!content.isExpanded}
          onUpdate={(data) => onUpdate({ ...content, ...data })}
          readonly={!canEdit}
          documents={documents}
          boards={boards}
          activeBricks={activeBricks}
        />
      );
      break;

    case 'media':
    case 'image':
    case 'file': {
      brickBody = (
        <MediaBrickCard
          brickId={brick.id}
          content={content}
          canEdit={canEdit}
          onUpdate={onUpdate}
          onUploadMediaFiles={onUploadMediaFiles}
        />
      );
      break;
    }

    // Add other cases as they are implemented...

    default:
      brickBody = (
        <div className="p-4 border border-border/50 rounded bg-muted/20 text-muted-foreground italic text-sm">
          Unsupported block type: {kind}
        </div>
      );
      break;
  }

  return (
    <div className="group/brick relative w-full">
      <div 
        className={cn(
          "transition-all rounded-sm",
          comments.length > 0 && "bg-[#ffeb3b]/30 dark:bg-[#ffd54f]/20",
          isCommentsOpen && "ring-2 ring-accent/40"
        )}
      >
        {brickBody}
      </div>

      {/* Botón Flotante tipo Notion al hacer hover */}
      {(canEdit || comments.length > 0) && (
        <div 
          className={`absolute top-1.5 -right-3 sm:-right-8 z-10 flex items-center transition-opacity duration-200 ${
            isCommentsOpen || comments.length > 0 ? "opacity-100" : "opacity-0 group-hover/brick:opacity-100"
          }`}
        >
          <button
            type="button"
            onClick={() => setIsCommentsOpen((o) => !o)}
            className={`flex items-center justify-center h-7 w-7 rounded-full shadow-sm border transition-colors ${
              comments.length > 0
                ? "bg-accent text-accent-foreground border-accent hover:opacity-90"
                : "bg-background text-muted-foreground border-border/40 hover:bg-muted/50 hover:text-foreground"
            }`}
             title="Comentar en este bloque"
          >
            {comments.length === 0 ? <MessageSquarePlus className="h-3.5 w-3.5" /> : <span className="text-[10px] font-bold">{comments.length}</span>}
          </button>
        </div>
      )}

      {/* Popover tipo Notion para los comentarios, flotando al lado o debajo */}
      {isCommentsOpen && (
        <div 
          className="absolute z-[100] right-0 top-full mt-1 w-full sm:w-[320px] rounded-lg border border-border/60 bg-background shadow-xl flex flex-col no-drag-focus"
          onMouseDown={(e) => e.stopPropagation()}
        >
          {comments.length > 0 && (
            <div className="max-h-[300px] overflow-y-auto px-4 py-3 space-y-4">
              {comments.map((comment) => (
                <div key={comment.id} className="group/comment flex flex-col gap-1.5 border-b border-border/30 pb-3 last:border-0 last:pb-0 relative">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/10 text-[10px] font-bold text-accent">
                        {comment.userName ? comment.userName.charAt(0).toUpperCase() : "A"}
                      </div>
                      <span className="text-xs font-semibold text-foreground">
                        {comment.userName && comment.userName.trim() ? comment.userName : t("brickComments.anonymous")}
                      </span>
                      <span className="text-[10px] text-muted-foreground ml-1">
                        {new Date(comment.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    {/* Notion style hover buttons */}
                    <div className={cn(
                      "flex items-center gap-0.5 opacity-0 group-hover/comment:opacity-100 transition-opacity absolute right-0 top-0 bg-background rounded-md border border-border/50 shadow-sm p-0.5 z-10",
                      activeMenu === comment.id && "opacity-100"
                    )}>
                      <button className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground" title="Añadir reacción"><SmilePlus className="w-3.5 h-3.5" /></button>
                      <button 
                        className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground" 
                        title="Resolver"
                        onClick={() => {
                          const newComments = comments.filter(c => c.id !== comment.id);
                          onUpdate({ ...content, comments: newComments });
                        }}
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <div className="relative">
                        <button 
                          className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground" 
                          title="Más acciones"
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveMenu(activeMenu === comment.id ? null : comment.id);
                          }}
                        >
                          <MoreHorizontal className="w-3.5 h-3.5" />
                        </button>
                        
                        {/* Menu desplegable */}
                        {activeMenu === comment.id && (
                          <div className="absolute right-0 top-full mt-1 w-48 rounded-md border border-border/60 bg-popover shadow-md p-1 flex flex-col z-[150]">
                            <button className="flex items-center gap-2 px-2 py-1.5 text-xs rounded-sm hover:bg-muted text-foreground w-full text-left" onClick={() => setActiveMenu(null)}>
                              <Check className="w-3.5 h-3.5 invisible" /> Marcar como no leído
                            </button>
                            <button className="flex items-center gap-2 px-2 py-1.5 text-xs rounded-sm hover:bg-muted text-foreground w-full text-left" onClick={() => setActiveMenu(null)}>
                              <Edit className="w-3.5 h-3.5" /> Editar
                            </button>
                            <button className="flex items-center gap-2 px-2 py-1.5 text-xs rounded-sm hover:bg-muted text-foreground w-full text-left" onClick={() => setActiveMenu(null)}>
                              <LinkIcon className="w-3.5 h-3.5" /> Copiar enlace
                            </button>
                            <button className="flex items-center gap-2 px-2 py-1.5 text-xs rounded-sm hover:bg-muted text-foreground w-full text-left" onClick={() => setActiveMenu(null)}>
                              <BellOff className="w-3.5 h-3.5" /> Silenciar las respuestas
                            </button>
                            <button 
                              className="flex items-center gap-2 px-2 py-1.5 text-xs rounded-sm hover:bg-destructive/10 text-destructive w-full text-left" 
                              onClick={() => {
                                 const newComments = comments.filter(c => c.id !== comment.id);
                                 onUpdate({ ...content, comments: newComments });
                                 setActiveMenu(null);
                              }}
                            >
                              <Trash className="w-3.5 h-3.5" /> Eliminar
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                  </div>
                  <p className="text-xs text-foreground/90 whitespace-pre-wrap leading-relaxed pl-7">{comment.text}</p>
                </div>
              ))}
            </div>
          )}

          {canEdit && (
            <div className={comments.length > 0 ? "p-3 bg-muted/10 border-t border-border/30" : "p-3 bg-background"}>
              <div className="flex items-center gap-1.5 rounded-md border border-input focus-within:ring-1 focus-within:ring-ring focus-within:border-accent bg-background px-3 py-1.5 transition-all w-full shadow-sm">
                <input
                  value={newComment}
                  onChange={(event) => setNewComment(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      event.stopPropagation();
                      submitComment();
                    }
                  }}
                  autoFocus
                  placeholder="Añadir un comentario..."
                  className="flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
                />
                
                <button type="button" className="text-muted-foreground hover:text-foreground transition-colors p-1 outline-none">
                  <Paperclip className="w-3.5 h-3.5" />
                </button>
                <button type="button" className="text-muted-foreground hover:text-foreground transition-colors p-1 outline-none">
                  <AtSign className="w-3.5 h-3.5" />
                </button>
                
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    submitComment();
                  }}
                  disabled={!newComment.trim()}
                  className="inline-flex h-6 w-6 ml-0.5 shrink-0 items-center justify-center rounded bg-accent text-accent-foreground outline-none transition-colors hover:opacity-90 disabled:bg-muted disabled:text-muted-foreground disabled:cursor-not-allowed"
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
