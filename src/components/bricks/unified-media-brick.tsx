"use client";

import React from "react";
import { AlignLeft, AlignCenter, AlignRight, Maximize, FileText, Settings, Link as LinkIcon, Image as ImageIcon } from "lucide-react";
import { useTranslations } from "@/components/providers/i18n-provider";

export type MediaCarouselItem = {
  url: string;
  title?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
  assetId?: string | null;
};

export type MediaMeta = {
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

export const UnifiedMediaBrick: React.FC<{
  brickId: string;
  content: any;
  canEdit: boolean;
  onUpdate: (content: any) => void;
  onUploadMediaFiles?: (payload: { brickId: string; files: File[] }) => Promise<void> | void;
}> = ({ brickId, content, canEdit, onUpdate, onUploadMediaFiles }) => {
  const t = useTranslations("document-detail");
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
  const isAudio = mime.startsWith("audio/") || /\.(mp3|wav|ogg|aac|flac)$/i.test(activeItem?.url || "");

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
          ) : isAudio ? (
            <div className="flex flex-col items-center justify-center p-6 bg-muted/10 gap-4 min-w-[300px]">
              <audio src={activeItem.url} controls className="w-full" />
              {activeItem.title && <span className="text-xs text-muted-foreground">{activeItem.title}</span>}
            </div>
          ) : isImage ? (
            <img src={activeItem.url} alt={activeItem.title || content.title || "Media"} className={`bg-transparent ${layout === "full" ? "w-full object-cover max-h-[70vh]" : "max-h-[70vh] object-contain w-auto mx-auto"}`} />
          ) : (
            <div className="flex items-center justify-between p-4 bg-muted/10 border border-border/50 rounded-md min-w-[300px] gap-4">
              <div className="flex items-center gap-3">
                <FileText className="w-8 h-8 text-accent shrink-0" />
                <div className="flex flex-col overflow-hidden">
                  <span className="text-sm font-semibold truncate max-w-[200px]">{activeItem.title || t("brickRenderer.defaultDocTitle")}</span>
                  {activeItem.sizeBytes && <span className="text-xs text-muted-foreground">{(activeItem.sizeBytes / 1024 / 1024).toFixed(2)} MB</span>}
                </div>
              </div>
              <a href={activeItem.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 bg-primary/10 hover:bg-primary/20 text-primary px-3 py-1.5 rounded text-xs font-medium transition-colors">
                {t("brickRenderer.download")}
              </a>
            </div>
          )
        ) : (
          <div className="flex flex-col items-center justify-center p-8 gap-3 text-center">
            <ImageIcon className="w-10 h-10 text-muted-foreground/40" />
            <div className="text-sm text-muted-foreground font-medium">{t("brickRenderer.attachPrompt")}</div>
            {canEdit && (
              <label className="cursor-pointer bg-primary text-primary-foreground px-4 py-1.5 rounded-md text-sm font-medium hover:bg-primary/90 mt-2">
                {t("brickRenderer.uploadBtn")}
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
               placeholder={t("brickRenderer.subtitlePlaceholder")}
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
            <span className="text-xs font-semibold text-muted-foreground tracking-wider uppercase">{t("brickRenderer.alignment")}</span>
            <div className="flex items-center gap-1 bg-muted/20 p-1 rounded-lg w-fit border border-border/50">
              <button onClick={() => updateMeta({ ...meta, layout: "left" })} className={`p-1.5 rounded-md ${layout === "left" ? "bg-background shadow-sm" : "hover:bg-background/50 text-muted-foreground"}`} title={t("brickRenderer.alignLeft")}><AlignLeft className="w-4 h-4" /></button>
              <button onClick={() => updateMeta({ ...meta, layout: "center" })} className={`p-1.5 rounded-md ${layout === "center" ? "bg-background shadow-sm" : "hover:bg-background/50 text-muted-foreground"}`} title={t("brickRenderer.alignCenter")}><AlignCenter className="w-4 h-4" /></button>
              <button onClick={() => updateMeta({ ...meta, layout: "right" })} className={`p-1.5 rounded-md ${layout === "right" ? "bg-background shadow-sm" : "hover:bg-background/50 text-muted-foreground"}`} title={t("brickRenderer.alignRight")}><AlignRight className="w-4 h-4" /></button>
              <button onClick={() => updateMeta({ ...meta, layout: "full" })} className={`p-1.5 rounded-md ${layout === "full" ? "bg-background shadow-sm" : "hover:bg-background/50 text-muted-foreground"}`} title={t("brickRenderer.alignFull")}><Maximize className="w-4 h-4" /></button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Border Options */}
            <div className="flex flex-col gap-2">
              <span className="text-xs font-semibold text-muted-foreground tracking-wider uppercase">{t("brickRenderer.borders")}</span>
               <select
                value={border}
                onChange={(e) => updateMeta({ ...meta, border: e.target.value as any })}
                className="w-full rounded-md border border-input shadow-sm bg-background px-3 py-1.5 text-sm outline-none"
              >
                <option value="none">{t("brickRenderer.borderNone")}</option>
                <option value="soft">{t("brickRenderer.borderSoft")}</option>
                <option value="strong">{t("brickRenderer.borderStrong")}</option>
              </select>
            </div>

            {/* Shadow Options */}
             <div className="flex flex-col gap-2">
              <span className="text-xs font-semibold text-muted-foreground tracking-wider uppercase">{t("brickRenderer.shadow")}</span>
               <select
                value={shadow}
                onChange={(e) => updateMeta({ ...meta, shadow: e.target.value as any })}
                className="w-full rounded-md border border-input shadow-sm bg-background px-3 py-1.5 text-sm outline-none"
              >
                <option value="none">{t("brickRenderer.shadowNone")}</option>
                <option value="md">{t("brickRenderer.shadowMd")}</option>
                <option value="lg">{t("brickRenderer.shadowLg")}</option>
              </select>
            </div>
          </div>

          {/* Edit current URLs / Subtitle / Items */}
           <div className="flex flex-col gap-3 pt-2 border-t border-border/40">
              <div className="flex items-center gap-2">
                 <LinkIcon className="w-4 h-4 text-muted-foreground" />
                 <input 
                   value={activeItem?.url || ""} 
                   placeholder={t("brickRenderer.urlPlaceholder")} 
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
                 placeholder={t("brickRenderer.subtitleGeneralPlaceholder")} 
                 onChange={(e) => updateMeta({ ...meta, subtitle: e.target.value }, activeIndex)}
                 className="w-full rounded-md border border-input shadow-sm bg-background px-3 py-1.5 text-sm outline-none" 
               />

               <div className="flex items-center gap-2 mt-2">
                <label className="inline-flex cursor-pointer items-center rounded-md border border-border bg-background px-3 py-1.5 text-xs font-semibold hover:bg-muted/40 shadow-sm">
                  {t("brickRenderer.uploadMore")}
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
                   {t("brickRenderer.acceptControls")}
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
