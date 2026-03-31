"use client";

import { useRef, useState } from "react";
import { X, Loader2, Layout, ImagePlus, Trash2, Waves, Trees, Sun, Sparkles } from "lucide-react";
import { useTranslations } from "@/components/providers/i18n-provider";

export type CreateBoardSubmitPayload = {
  name: string;
  coverImageUrl?: string;
  backgroundKind: "none" | "preset" | "image" | "color" | "gradient";
  backgroundValue?: string;
  backgroundImageUrl?: string;
  backgroundGradient?: string;
  themeKind: "preset" | "custom";
  themePreset?: string;
  themeCustom?: Record<string, unknown>;
};

interface CreateBoardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (payload: CreateBoardSubmitPayload) => Promise<void>;
  onUploadCoverImage?: (file: File) => Promise<string>;
}

const BACKGROUNDS = [
  "bg-gradient-to-tr from-blue-500 to-purple-500",
  "bg-gradient-to-tr from-orange-400 to-red-500",
  "bg-gradient-to-tr from-emerald-400 to-teal-500",
  "bg-gradient-to-tr from-pink-500 to-rose-500",
  "bg-gradient-to-tr from-slate-700 to-slate-900",
  "bg-gradient-to-tr from-indigo-500 to-cyan-400"
];

const THEME_PRESET_OPTIONS = [
  {
    id: "killio-default",
    label: "Clásico",
    accent: "#d8ff72",
    surface: "#0b0f14",
    Icon: Sparkles,
  },
  {
    id: "trello-ocean",
    label: "Océano",
    accent: "#67e8f9",
    surface: "#0c2233",
    Icon: Waves,
  },
  {
    id: "trello-forest",
    label: "Bosque",
    accent: "#86efac",
    surface: "#10251f",
    Icon: Trees,
  },
  {
    id: "trello-sunrise",
    label: "Amanecer",
    accent: "#fcd34d",
    surface: "#3b1f10",
    Icon: Sun,
  },
] as const;

function isImageCover(value: string): boolean {
  return /^https?:\/\//i.test(value) || value.startsWith("/") || value.startsWith("data:image/");
}

function isTailwindGradient(value: string): boolean {
  return value.startsWith("bg-");
}

export function CreateBoardModal({ isOpen, onClose, onSubmit, onUploadCoverImage }: CreateBoardModalProps) {
  const t = useTranslations("modals");
  const tCommon = useTranslations("common");
  const coverFileInputRef = useRef<HTMLInputElement>(null);
  const backgroundFileInputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [coverImageUrl, setCoverImageUrl] = useState("");
  const [backgroundKind, setBackgroundKind] = useState<"preset" | "image" | "color" | "gradient">("preset");
  const [presetBackground, setPresetBackground] = useState(BACKGROUNDS[0]);
  const [imageBackground, setImageBackground] = useState("");
  const [colorBackground, setColorBackground] = useState("#0f172a");
  const [gradientBackground, setGradientBackground] = useState("linear-gradient(135deg,#3b82f6 0%,#8b5cf6 100%)");
  const [themeKind, setThemeKind] = useState<"preset" | "custom">("preset");
  const [themePreset, setThemePreset] = useState<string>(THEME_PRESET_OPTIONS[0].id);
  const [themeAccent, setThemeAccent] = useState("#d8ff72");
  const [themeSurface, setThemeSurface] = useState("#0b0f14");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploadingCover, setIsUploadingCover] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) {
    if (name) setName("");
    if (coverImageUrl) setCoverImageUrl("");
    if (backgroundKind !== "preset") setBackgroundKind("preset");
    if (presetBackground !== BACKGROUNDS[0]) setPresetBackground(BACKGROUNDS[0]);
    if (imageBackground) setImageBackground("");
    if (colorBackground !== "#0f172a") setColorBackground("#0f172a");
    if (gradientBackground !== "linear-gradient(135deg,#3b82f6 0%,#8b5cf6 100%)") {
      setGradientBackground("linear-gradient(135deg,#3b82f6 0%,#8b5cf6 100%)");
    }
    if (themeKind !== "preset") setThemeKind("preset");
    if (themePreset !== THEME_PRESET_OPTIONS[0].id) setThemePreset(THEME_PRESET_OPTIONS[0].id);
    if (themeAccent !== "#d8ff72") setThemeAccent("#d8ff72");
    if (themeSurface !== "#0b0f14") setThemeSurface("#0b0f14");
    if (error) setError(null);
    return null;
  }

  const currentBackground =
    backgroundKind === "image"
      ? imageBackground
      : backgroundKind === "color"
        ? colorBackground
        : backgroundKind === "gradient"
          ? gradientBackground
          : presetBackground;

  const usingImageBackground = isImageCover(currentBackground);
  const usingCssGradient = backgroundKind === "gradient" && !isTailwindGradient(currentBackground);
  const usingImageCover = isImageCover(coverImageUrl);

  const handleSelectCoverFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!onUploadCoverImage) return;
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("El archivo debe ser una imagen.");
      event.target.value = "";
      return;
    }

    setIsUploadingCover(true);
    setError(null);
    try {
      const uploadedUrl = await onUploadCoverImage(file);
      setCoverImageUrl(uploadedUrl);
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "No se pudo subir la portada.");
    } finally {
      setIsUploadingCover(false);
      event.target.value = "";
    }
  };

  const handleSelectBackgroundFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!onUploadCoverImage) return;
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("El archivo debe ser una imagen.");
      event.target.value = "";
      return;
    }

    setIsUploadingCover(true);
    setError(null);
    try {
      const uploadedUrl = await onUploadCoverImage(file);
      setBackgroundKind("image");
      setImageBackground(uploadedUrl);
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "No se pudo subir la imagen de fondo.");
    } finally {
      setIsUploadingCover(false);
      event.target.value = "";
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    
    setIsSubmitting(true);
    setError(null);
    try {
      const payload: CreateBoardSubmitPayload = {
        name: name.trim(),
        backgroundKind,
        themeKind,
      };

      if (coverImageUrl.trim()) {
        payload.coverImageUrl = coverImageUrl.trim();
      }

      if (backgroundKind === "preset") payload.backgroundValue = presetBackground;
      if (backgroundKind === "image") payload.backgroundImageUrl = imageBackground;
      if (backgroundKind === "color") payload.backgroundValue = colorBackground;
      if (backgroundKind === "gradient") payload.backgroundGradient = gradientBackground;

      if (themeKind === "preset") {
        payload.themePreset = themePreset;
      } else {
        payload.themeCustom = {
          accent: themeAccent,
          surface: themeSurface,
        };
      }

      await onSubmit(payload);
      setName("");
      setCoverImageUrl("");
      setBackgroundKind("preset");
      setPresetBackground(BACKGROUNDS[0]);
      setImageBackground("");
      setColorBackground("#0f172a");
      setGradientBackground("linear-gradient(135deg,#3b82f6 0%,#8b5cf6 100%)");
      setThemeKind("preset");
      setThemePreset(THEME_PRESET_OPTIONS[0].id);
      setThemeAccent("#d8ff72");
      setThemeSurface("#0b0f14");
      onClose();
    } catch (err: any) {
      console.error(err);
      setError(err?.message || t("createBoard.createError"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl animate-in zoom-in-95 duration-200">
        <button 
          onClick={onClose}
          className="absolute right-4 top-4 z-10 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none text-white drop-shadow-md"
        >
          <X className="h-5 w-5" />
          <span className="sr-only">{tCommon("actions.close")}</span>
        </button>

        <div
          className={`h-32 -m-6 mb-6 rounded-t-2xl relative overflow-hidden ${usingImageBackground ? "bg-slate-800" : (isTailwindGradient(currentBackground) ? currentBackground : "bg-slate-800")} flex items-center justify-center transition-all duration-300 shadow-inner bg-cover bg-center`}
          style={usingImageBackground ? { backgroundImage: `url(${currentBackground})` } : (usingCssGradient ? { background: currentBackground } : undefined)}
        >
           <div className="absolute inset-0 bg-black/10 backdrop-blur-[2px]"></div>
           <Layout className="h-12 w-12 text-white/90 drop-shadow-xl z-0" />
           {usingImageCover ? (
            <div className="absolute bottom-2 left-2 right-2 h-10 rounded-md border border-white/20 bg-slate-900/40 overflow-hidden">
              <div className="h-full w-full bg-cover bg-center" style={{ backgroundImage: `url(${coverImageUrl})` }} />
            </div>
           ) : null}
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label htmlFor="board-name" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
              {t("createBoard.nameLabel")}
            </label>
            <input
              id="board-name"
              type="text"
              placeholder={t("createBoard.namePlaceholder")}
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isSubmitting}
              autoFocus
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-all focus:border-primary font-medium shadow-sm"
            />
            {error && (
              <p className="text-sm font-medium text-destructive mt-1">{error}</p>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium leading-none">Portada del board</label>
            <input
              type="text"
              value={coverImageUrl}
              onChange={(e) => setCoverImageUrl(e.target.value)}
              placeholder="https://... (opcional)"
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-xs"
            />
            <input
              ref={coverFileInputRef}
              type="file"
              accept="image/*"
              onChange={handleSelectCoverFile}
              className="hidden"
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => coverFileInputRef.current?.click()}
                disabled={isSubmitting || isUploadingCover || !onUploadCoverImage}
                className="inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-3 text-xs font-medium transition-colors hover:bg-accent/10 disabled:opacity-50"
              >
                <ImagePlus className="mr-1.5 h-3.5 w-3.5" /> Subir portada
              </button>
              {coverImageUrl ? (
                <button
                  type="button"
                  onClick={() => setCoverImageUrl("")}
                  disabled={isSubmitting || isUploadingCover}
                  className="inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-3 text-xs font-medium transition-colors hover:bg-accent/10 disabled:opacity-50"
                >
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Quitar portada
                </button>
              ) : null}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium leading-none">
              {t("createBoard.backgroundLabel")}
            </label>
            <div className="grid grid-cols-4 gap-2">
              <button type="button" onClick={() => setBackgroundKind("preset")} className={`h-8 rounded-md border text-xs ${backgroundKind === "preset" ? "border-primary bg-primary/10" : "border-border"}`}>Preset</button>
              <button type="button" onClick={() => setBackgroundKind("gradient")} className={`h-8 rounded-md border text-xs ${backgroundKind === "gradient" ? "border-primary bg-primary/10" : "border-border"}`}>Gradient</button>
              <button type="button" onClick={() => setBackgroundKind("color")} className={`h-8 rounded-md border text-xs ${backgroundKind === "color" ? "border-primary bg-primary/10" : "border-border"}`}>Color</button>
              <button type="button" onClick={() => setBackgroundKind("image")} className={`h-8 rounded-md border text-xs ${backgroundKind === "image" ? "border-primary bg-primary/10" : "border-border"}`}>Image</button>
            </div>
            <input
              ref={backgroundFileInputRef}
              type="file"
              accept="image/*"
              onChange={handleSelectBackgroundFile}
              className="hidden"
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => backgroundFileInputRef.current?.click()}
                disabled={isSubmitting || isUploadingCover || !onUploadCoverImage || backgroundKind !== "image"}
                className="inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-3 text-xs font-medium transition-colors hover:bg-accent/10 disabled:opacity-50"
              >
                {isUploadingCover ? (
                  <>
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Subiendo...
                  </>
                ) : (
                  <>
                    <ImagePlus className="mr-1.5 h-3.5 w-3.5" /> Subir fondo
                  </>
                )}
              </button>
              {backgroundKind === "image" && usingImageBackground ? (
                <button
                  type="button"
                  onClick={() => {
                    setImageBackground("");
                    setBackgroundKind("preset");
                  }}
                  disabled={isSubmitting || isUploadingCover}
                  className="inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-3 text-xs font-medium transition-colors hover:bg-accent/10 disabled:opacity-50"
                >
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Quitar imagen
                </button>
              ) : null}
            </div>

            {backgroundKind === "preset" && (
              <div className="grid grid-cols-6 gap-2">
                {BACKGROUNDS.map((bg) => (
                  <button
                    key={bg}
                    type="button"
                    onClick={() => setPresetBackground(bg)}
                    className={`h-10 w-full rounded-md ${bg} transition-all duration-200 hover:scale-105 hover:shadow-md focus:outline-none ring-offset-background ${presetBackground === bg ? 'ring-2 ring-primary ring-offset-2 scale-105 shadow-md' : 'opacity-80'}`}
                  />
                ))}
              </div>
            )}

            {backgroundKind === "gradient" && (
              <input
                type="text"
                value={gradientBackground}
                onChange={(e) => setGradientBackground(e.target.value)}
                placeholder="linear-gradient(...) o clase bg-gradient-*"
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-xs"
              />
            )}

            {backgroundKind === "color" && (
              <div className="flex items-center gap-2">
                <input type="color" value={colorBackground} onChange={(e) => setColorBackground(e.target.value)} className="h-9 w-14 rounded-md border border-input bg-background" />
                <input type="text" value={colorBackground} onChange={(e) => setColorBackground(e.target.value)} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-xs" />
              </div>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium leading-none">Theme</label>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setThemeKind("preset")} className={`h-8 rounded-md border text-xs ${themeKind === "preset" ? "border-primary bg-primary/10" : "border-border"}`}>Preset</button>
              <button type="button" onClick={() => setThemeKind("custom")} className={`h-8 rounded-md border text-xs ${themeKind === "custom" ? "border-primary bg-primary/10" : "border-border"}`}>Custom</button>
            </div>

            {themeKind === "preset" ? (
              <div className="grid grid-cols-2 gap-2">
                {THEME_PRESET_OPTIONS.map((preset) => {
                  const selected = themePreset === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => setThemePreset(preset.id)}
                      className={`rounded-md border p-2 text-left transition-all ${selected ? "border-primary bg-primary/10 shadow-sm" : "border-border hover:border-primary/40 hover:bg-accent/5"}`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-semibold flex items-center gap-1.5">
                          <preset.Icon className="h-3.5 w-3.5" />
                          {preset.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="h-3 w-3 rounded-full border border-white/20" style={{ backgroundColor: preset.accent }} />
                        <span className="h-3 w-3 rounded-full border border-white/20" style={{ backgroundColor: preset.surface }} />
                        <span className="text-[10px] text-muted-foreground">Paleta</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[11px] text-muted-foreground">Accent</label>
                  <input type="color" value={themeAccent} onChange={(e) => setThemeAccent(e.target.value)} className="h-9 w-full rounded-md border border-input bg-background" />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] text-muted-foreground">Surface</label>
                  <input type="color" value={themeSurface} onChange={(e) => setThemeSurface(e.target.value)} className="h-9 w-full rounded-md border border-input bg-background" />
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-border/50">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="inline-flex h-10 items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition-colors hover:bg-accent/10 hover:text-accent disabled:pointer-events-none disabled:opacity-50"
            >
              {tCommon("actions.cancel")}
            </button>
            <button
              type="submit"
              disabled={!name.trim() || isSubmitting || isUploadingCover}
              className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("createBoard.creating")}
                </>
              ) : (
                t("createBoard.create")
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
