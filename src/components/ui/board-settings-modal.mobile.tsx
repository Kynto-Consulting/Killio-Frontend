"use client";

import { useTranslations } from "@/components/providers/i18n-provider";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { X, ImagePlus, Trash2, Waves, Trees, Sun, Sparkles, Settings2, Share2, AlertTriangle } from "lucide-react";

type CoverKind = "none" | "preset" | "image" | "color" | "gradient";

type BoardAppearanceDraft = {
  coverImageUrl?: string | null;
  backgroundKind?: "none" | "preset" | "image" | "color" | "gradient";
  backgroundValue?: string | null;
  backgroundImageUrl?: string | null;
  backgroundGradient?: string | null;
  themeKind?: "preset" | "custom";
  themePreset?: string | null;
  themeCustom?: Record<string, unknown>;
};

const BACKGROUND_PRESETS = [
  "bg-gradient-to-tr from-blue-500 to-purple-500",
  "bg-gradient-to-tr from-orange-400 to-red-500",
  "bg-gradient-to-tr from-emerald-400 to-teal-500",
  "bg-gradient-to-tr from-pink-500 to-rose-500",
  "bg-gradient-to-tr from-slate-700 to-slate-900",
  "bg-gradient-to-tr from-indigo-500 to-cyan-400",
];

const DEFAULT_GRADIENT = "linear-gradient(135deg,#3b82f6 0%,#8b5cf6 100%)";
const DEFAULT_COLOR = "#0f172a";

const THEME_PRESET_OPTIONS = [
  { id: "killio-default", i18nKey: "classic", accent: "#d8ff72", surface: "#0b0f14", Icon: Sparkles },
  { id: "trello-ocean", i18nKey: "ocean", accent: "#67e8f9", surface: "#0c2233", Icon: Waves },
  { id: "trello-forest", i18nKey: "forest", accent: "#86efac", surface: "#10251f", Icon: Trees },
  { id: "trello-sunrise", i18nKey: "sunrise", accent: "#fcd34d", surface: "#3b1f10", Icon: Sun },
] as const;

function isImageUrl(value?: string | null): boolean {
  if (!value) return false;
  return /^https?:\/\//i.test(value) || value.startsWith("/") || value.startsWith("data:image/");
}

function parseCoverValue(raw?: string | null): { kind: CoverKind; value: string } {
  const source = typeof raw === "string" ? raw.trim() : "";
  if (!source) {
    return { kind: "none", value: "" };
  }

  const separatorIndex = source.indexOf("::");
  if (separatorIndex > 0) {
    const encodedKind = source.slice(0, separatorIndex);
    const encodedValue = source.slice(separatorIndex + 2);

    if (encodedKind === "none") return { kind: "none", value: "" };
    if (encodedKind === "preset") return { kind: "preset", value: encodedValue };
    if (encodedKind === "image") return { kind: "image", value: encodedValue };
    if (encodedKind === "color") return { kind: "color", value: encodedValue };
    if (encodedKind === "gradient") return { kind: "gradient", value: encodedValue };
  }

  if (isImageUrl(source)) return { kind: "image", value: source };
  if (source.startsWith("bg-")) return { kind: "preset", value: source };
  if (source.startsWith("#")) return { kind: "color", value: source };
  return { kind: "gradient", value: source };
}

function serializeCoverValue(kind: CoverKind, value: string): string | null {
  if (kind === "none") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return `${kind}::${trimmed}`;
}

function resolveCoverPreview(kind: CoverKind, value: string): { className: string; style?: CSSProperties } | null {
  if (kind === "none") return null;

  if (kind === "image") {
    if (!isImageUrl(value)) return null;
    return {
      className: "bg-slate-900 bg-cover bg-center",
      style: { backgroundImage: `url(${value})` },
    };
  }

  if (kind === "preset") {
    return { className: value || BACKGROUND_PRESETS[0] };
  }

  if (kind === "color") {
    return {
      className: "bg-slate-900",
      style: { backgroundColor: value || DEFAULT_COLOR },
    };
  }

  if (value.startsWith("bg-")) {
    return { className: value };
  }

  return {
    className: "bg-slate-900",
    style: { background: value || DEFAULT_GRADIENT },
  };
}

type BoardSettingsModalProps = {
  isOpen: boolean;
  onClose: () => void;
  boardName: string;
  boardDescription: string | null;
  boardAppearance: BoardAppearanceDraft;
  canManageBoard: boolean;
  canEdit: boolean;
  onSaveGeneral: (payload: { name: string; description: string | null }) => Promise<void>;
  onSaveAppearance: (payload: BoardAppearanceDraft) => Promise<void>;
  onOpenShare: () => void;
  onOpenDelete: () => void;
  onUploadImage?: (file: File) => Promise<string>;
};

export function BoardSettingsModalMobile({
  isOpen,
  onClose,
  boardName,
  boardDescription,
  boardAppearance,
  canManageBoard,
  canEdit,
  onSaveGeneral,
  onSaveAppearance,
  onOpenShare,
  onOpenDelete,
  onUploadImage,
}: BoardSettingsModalProps) {
  const t = useTranslations("board-detail");
  const coverFileInputRef = useRef<HTMLInputElement>(null);
  const backgroundFileInputRef = useRef<HTMLInputElement>(null);
  const initialCover = parseCoverValue(boardAppearance.coverImageUrl ?? null);

  const [activeTab, setActiveTab] = useState<"general" | "appearance" | "sharing" | "danger">("general");
  const [name, setName] = useState(boardName);
  const [description, setDescription] = useState(boardDescription ?? "");
  const [coverKind, setCoverKind] = useState<CoverKind>(initialCover.kind);
  const [coverPreset, setCoverPreset] = useState(initialCover.kind === "preset" ? (initialCover.value || BACKGROUND_PRESETS[0]) : BACKGROUND_PRESETS[0]);
  const [coverImage, setCoverImage] = useState(initialCover.kind === "image" ? initialCover.value : "");
  const [coverColor, setCoverColor] = useState(initialCover.kind === "color" ? initialCover.value : DEFAULT_COLOR);
  const [coverGradient, setCoverGradient] = useState(initialCover.kind === "gradient" ? initialCover.value : DEFAULT_GRADIENT);
  const [backgroundKind, setBackgroundKind] = useState<"none" | "preset" | "image" | "color" | "gradient">(
    boardAppearance.backgroundKind ?? "preset",
  );
  const [presetBackground, setPresetBackground] = useState(boardAppearance.backgroundValue ?? BACKGROUND_PRESETS[0]);
  const [imageBackground, setImageBackground] = useState(boardAppearance.backgroundImageUrl ?? "");
  const [colorBackground, setColorBackground] = useState(boardAppearance.backgroundValue ?? "#0f172a");
  const [gradientBackground, setGradientBackground] = useState(
    boardAppearance.backgroundGradient ?? "linear-gradient(135deg,#3b82f6 0%,#8b5cf6 100%)",
  );
  const [themeKind, setThemeKind] = useState<"preset" | "custom">(boardAppearance.themeKind ?? "preset");
  const [themePreset, setThemePreset] = useState<string>(boardAppearance.themePreset ?? THEME_PRESET_OPTIONS[0].id);
  const [themeAccent, setThemeAccent] = useState<string>(String((boardAppearance.themeCustom as any)?.accent ?? "#d8ff72"));
  const [themeSurface, setThemeSurface] = useState<string>(String((boardAppearance.themeCustom as any)?.surface ?? "#0b0f14"));
  const [isSavingGeneral, setIsSavingGeneral] = useState(false);
  const [isSavingAppearance, setIsSavingAppearance] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const parsedCover = parseCoverValue(boardAppearance.coverImageUrl ?? null);
    setActiveTab("general");
    setName(boardName);
    setDescription(boardDescription ?? "");
    setCoverKind(parsedCover.kind);
    setCoverPreset(parsedCover.kind === "preset" ? (parsedCover.value || BACKGROUND_PRESETS[0]) : BACKGROUND_PRESETS[0]);
    setCoverImage(parsedCover.kind === "image" ? parsedCover.value : "");
    setCoverColor(parsedCover.kind === "color" ? parsedCover.value : DEFAULT_COLOR);
    setCoverGradient(parsedCover.kind === "gradient" ? parsedCover.value : DEFAULT_GRADIENT);
    setBackgroundKind(boardAppearance.backgroundKind ?? "preset");
    setPresetBackground(boardAppearance.backgroundValue ?? BACKGROUND_PRESETS[0]);
    setImageBackground(boardAppearance.backgroundImageUrl ?? "");
    setColorBackground(boardAppearance.backgroundValue ?? DEFAULT_COLOR);
    setGradientBackground(boardAppearance.backgroundGradient ?? DEFAULT_GRADIENT);
    setThemeKind(boardAppearance.themeKind ?? "preset");
    setThemePreset(boardAppearance.themePreset ?? THEME_PRESET_OPTIONS[0].id);
    setThemeAccent(String((boardAppearance.themeCustom as any)?.accent ?? "#d8ff72"));
    setThemeSurface(String((boardAppearance.themeCustom as any)?.surface ?? "#0b0f14"));
    setError(null);
  }, [isOpen, boardName, boardDescription, boardAppearance]);

  if (!isOpen) return null;

  const currentBackground =
    backgroundKind === "image"
      ? imageBackground
      : backgroundKind === "color"
        ? colorBackground
        : backgroundKind === "gradient"
          ? gradientBackground
          : presetBackground;
  const currentCover =
    coverKind === "image"
      ? coverImage
      : coverKind === "color"
        ? coverColor
        : coverKind === "gradient"
          ? coverGradient
          : coverPreset;
  const coverPreview = resolveCoverPreview(coverKind, currentCover);

  const handleUpload = async (file: File, target: "cover" | "background") => {
    if (!onUploadImage) return;
    if (!file.type.startsWith("image/")) {
      setError(t("boardSettingsModal.appearance.upload.invalidImage"));
      return;
    }

    setError(null);
    setIsUploadingImage(true);
    try {
      const uploadedUrl = await onUploadImage(file);
      if (target === "cover") {
        setCoverKind("image");
        setCoverImage(uploadedUrl);
      } else {
        setBackgroundKind("image");
        setImageBackground(uploadedUrl);
      }
    } catch (err: any) {
      setError(err?.message || t("boardSettingsModal.appearance.upload.uploadError"));
    } finally {
      setIsUploadingImage(false);
    }
  };

  const saveGeneral = async () => {
    if (!name.trim()) {
      setError(t("boardSettingsModal.general.nameEmptyError"));
      return;
    }

    setError(null);
    setIsSavingGeneral(true);
    try {
      await onSaveGeneral({ name: name.trim(), description: description.trim() || null });
      onClose();
    } catch (err: any) {
      setError(err?.message || t("boardSettingsModal.general.saveError"));
    } finally {
      setIsSavingGeneral(false);
    }
  };

  const saveAppearance = async () => {
    setError(null);
    setIsSavingAppearance(true);
    try {
      const payload: BoardAppearanceDraft = {
        coverImageUrl: serializeCoverValue(coverKind, currentCover),
        backgroundKind,
        themeKind,
      };

      if (backgroundKind === "none") {
        payload.backgroundValue = null;
        payload.backgroundImageUrl = null;
        payload.backgroundGradient = null;
      }
      if (backgroundKind === "preset") payload.backgroundValue = presetBackground;
      if (backgroundKind === "image") payload.backgroundImageUrl = imageBackground || null;
      if (backgroundKind === "color") payload.backgroundValue = colorBackground;
      if (backgroundKind === "gradient") payload.backgroundGradient = gradientBackground;

      if (themeKind === "preset") {
        payload.themePreset = themePreset;
        payload.themeCustom = {};
      } else {
        payload.themePreset = null;
        payload.themeCustom = {
          accent: themeAccent,
          surface: themeSurface,
        };
      }

      await onSaveAppearance(payload);
      onClose();
    } catch (err: any) {
      setError(err?.message || "No se pudo guardar la apariencia del tablero.");
    } finally {
      setIsSavingAppearance(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/55 backdrop-blur-sm p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-2xl rounded-2xl border border-border bg-card shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-card/90">
          <div className="flex items-center gap-2">
            <Settings2 className="h-4 w-4 text-muted-foreground" />
            <h3 className="font-semibold">{t("boardSettingsModal.title")}</h3>
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 hover:bg-accent/10 text-muted-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 pt-4 pb-3 border-b border-border flex flex-wrap gap-2">
          <button onClick={() => setActiveTab("general")} className={`px-3 py-1.5 rounded-md text-sm ${activeTab === "general" ? "bg-accent/15 text-accent" : "hover:bg-accent/5 text-muted-foreground"}`}>{t("boardSettingsModal.tabs.general")}</button>
          <button onClick={() => setActiveTab("appearance")} className={`px-3 py-1.5 rounded-md text-sm ${activeTab === "appearance" ? "bg-accent/15 text-accent" : "hover:bg-accent/5 text-muted-foreground"}`}>{t("boardSettingsModal.tabs.appearance")}</button>
          <button onClick={() => setActiveTab("sharing")} className={`px-3 py-1.5 rounded-md text-sm ${activeTab === "sharing" ? "bg-accent/15 text-accent" : "hover:bg-accent/5 text-muted-foreground"}`}>{t("boardSettingsModal.tabs.sharing")}</button>
          <button onClick={() => setActiveTab("danger")} className={`px-3 py-1.5 rounded-md text-sm ${activeTab === "danger" ? "bg-red-500/10 text-red-500" : "hover:bg-red-500/5 text-muted-foreground"}`}>{t("boardSettingsModal.tabs.danger")}</button>
        </div>

        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {activeTab === "general" && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">{t("boardSettingsModal.general.nameLabel")}</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  placeholder={t("boardSettingsModal.general.namePlaceholder")}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">{t("boardSettingsModal.general.descriptionLabel")}</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  placeholder={t("boardSettingsModal.general.descriptionPlaceholder")}
                />
              </div>
              <div className="flex justify-end">
                <button onClick={saveGeneral} disabled={isSavingGeneral || !canEdit} className="h-10 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50">
                  {isSavingGeneral ? t("boardSettingsModal.general.saving") : t("boardSettingsModal.general.save")}
                </button>
              </div>
            </div>
          )}

          {activeTab === "appearance" && (
            <div className="space-y-5">
              <div className="rounded-lg border border-border overflow-hidden">
                <div
                  className={`h-24 relative ${isImageUrl(currentBackground) ? "bg-slate-800 bg-cover bg-center" : (currentBackground?.startsWith("bg-") ? currentBackground : "bg-slate-900")}`}
                  style={isImageUrl(currentBackground) ? { backgroundImage: `url(${currentBackground})` } : (!currentBackground?.startsWith("bg-") ? { background: currentBackground } : undefined)}
                >
                  {coverPreview ? (
                    <div className={`absolute bottom-2 left-2 right-2 h-8 rounded border border-white/20 ${coverPreview.className}`} style={coverPreview.style} />
                  ) : null}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">{t("boardSettingsModal.appearance.cover")}</label>
                <div className="grid grid-cols-5 gap-2">
                  <button type="button" onClick={() => setCoverKind("none")} className={`h-8 rounded-md border text-xs ${coverKind === "none" ? "border-primary bg-primary/10" : "border-border"}`}>{t("boardSettingsModal.appearance.coverKinds.none")}</button>
                  <button type="button" onClick={() => setCoverKind("preset")} className={`h-8 rounded-md border text-xs ${coverKind === "preset" ? "border-primary bg-primary/10" : "border-border"}`}>{t("boardSettingsModal.appearance.coverKinds.preset")}</button>
                  <button type="button" onClick={() => setCoverKind("gradient")} className={`h-8 rounded-md border text-xs ${coverKind === "gradient" ? "border-primary bg-primary/10" : "border-border"}`}>{t("boardSettingsModal.appearance.coverKinds.gradient")}</button>
                  <button type="button" onClick={() => setCoverKind("color")} className={`h-8 rounded-md border text-xs ${coverKind === "color" ? "border-primary bg-primary/10" : "border-border"}`}>{t("boardSettingsModal.appearance.coverKinds.color")}</button>
                  <button type="button" onClick={() => setCoverKind("image")} className={`h-8 rounded-md border text-xs ${coverKind === "image" ? "border-primary bg-primary/10" : "border-border"}`}>{t("boardSettingsModal.appearance.coverKinds.image")}</button>
                </div>

                {coverKind === "preset" && (
                  <div className="grid grid-cols-6 gap-2">
                    {BACKGROUND_PRESETS.map((bg) => (
                      <button key={bg} type="button" onClick={() => setCoverPreset(bg)} className={`h-9 rounded-md ${bg} border ${coverPreset === bg ? "ring-2 ring-primary" : "opacity-80"}`} />
                    ))}
                  </div>
                )}

                {coverKind === "image" && (
                  <>
                    <input value={coverImage} onChange={(e) => setCoverImage(e.target.value)} placeholder="https://..." className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs" />
                    <input
                      ref={coverFileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) void handleUpload(file, "cover");
                        event.target.value = "";
                      }}
                    />
                    <button onClick={() => coverFileInputRef.current?.click()} type="button" disabled={!onUploadImage || isUploadingImage || !canEdit} className="h-9 px-3 rounded-md border border-input text-xs inline-flex items-center gap-1.5 disabled:opacity-50">
                      <ImagePlus className="h-3.5 w-3.5" /> {t("boardSettingsModal.appearance.upload.uploadCover")}
                    </button>
                  </>
                )}

                {coverKind === "color" && (
                  <div className="flex gap-2">
                    <input type="color" value={coverColor} onChange={(e) => setCoverColor(e.target.value)} className="h-9 w-14 rounded-md border border-input bg-background" />
                    <input value={coverColor} onChange={(e) => setCoverColor(e.target.value)} className="h-9 flex-1 rounded-md border border-input bg-background px-3 text-xs" />
                  </div>
                )}

                {coverKind === "gradient" && (
                  <input value={coverGradient} onChange={(e) => setCoverGradient(e.target.value)} placeholder="linear-gradient(...) o clase bg-*" className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs" />
                )}

                {coverKind !== "none" ? (
                  <button onClick={() => setCoverKind("none")} type="button" disabled={!canEdit} className="h-9 px-3 rounded-md border border-input text-xs inline-flex items-center gap-1.5 disabled:opacity-50">
                    <Trash2 className="h-3.5 w-3.5" /> {t("boardSettingsModal.appearance.upload.removeCover")}
                  </button>
                ) : null}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">{t("boardSettingsModal.appearance.background")}</label>
                <div className="grid grid-cols-5 gap-2">
                  <button type="button" onClick={() => setBackgroundKind("none")} className={`h-8 rounded-md border text-xs ${backgroundKind === "none" ? "border-primary bg-primary/10" : "border-border"}`}>{t("boardSettingsModal.appearance.coverKinds.none")}</button>
                  <button type="button" onClick={() => setBackgroundKind("preset")} className={`h-8 rounded-md border text-xs ${backgroundKind === "preset" ? "border-primary bg-primary/10" : "border-border"}`}>{t("boardSettingsModal.appearance.coverKinds.preset")}</button>
                  <button type="button" onClick={() => setBackgroundKind("gradient")} className={`h-8 rounded-md border text-xs ${backgroundKind === "gradient" ? "border-primary bg-primary/10" : "border-border"}`}>{t("boardSettingsModal.appearance.coverKinds.gradient")}</button>
                  <button type="button" onClick={() => setBackgroundKind("color")} className={`h-8 rounded-md border text-xs ${backgroundKind === "color" ? "border-primary bg-primary/10" : "border-border"}`}>{t("boardSettingsModal.appearance.coverKinds.color")}</button>
                  <button type="button" onClick={() => setBackgroundKind("image")} className={`h-8 rounded-md border text-xs ${backgroundKind === "image" ? "border-primary bg-primary/10" : "border-border"}`}>{t("boardSettingsModal.appearance.coverKinds.image")}</button>
                </div>

                {backgroundKind === "preset" && (
                  <div className="grid grid-cols-6 gap-2">
                    {BACKGROUND_PRESETS.map((bg) => (
                      <button key={bg} type="button" onClick={() => setPresetBackground(bg)} className={`h-9 rounded-md ${bg} border ${presetBackground === bg ? "ring-2 ring-primary" : "opacity-80"}`} />
                    ))}
                  </div>
                )}

                {backgroundKind === "image" && (
                  <>
                    <input value={imageBackground} onChange={(e) => setImageBackground(e.target.value)} placeholder="https://..." className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs" />
                    <input
                      ref={backgroundFileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) void handleUpload(file, "background");
                        event.target.value = "";
                      }}
                    />
                    <button onClick={() => backgroundFileInputRef.current?.click()} type="button" disabled={!onUploadImage || isUploadingImage || !canEdit} className="h-9 px-3 rounded-md border border-input text-xs inline-flex items-center gap-1.5 disabled:opacity-50">
                      <ImagePlus className="h-3.5 w-3.5" /> {t("boardSettingsModal.appearance.upload.uploadBackground")}
                    </button>
                  </>
                )}

                {backgroundKind === "color" && (
                  <div className="flex gap-2">
                    <input type="color" value={colorBackground} onChange={(e) => setColorBackground(e.target.value)} className="h-9 w-14 rounded-md border border-input bg-background" />
                    <input value={colorBackground} onChange={(e) => setColorBackground(e.target.value)} className="h-9 flex-1 rounded-md border border-input bg-background px-3 text-xs" />
                  </div>
                )}

                {backgroundKind === "gradient" && (
                  <input value={gradientBackground} onChange={(e) => setGradientBackground(e.target.value)} placeholder="linear-gradient(...) o clase bg-*" className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs" />
                )}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">{t("boardSettingsModal.appearance.theme")}</label>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setThemeKind("preset")} className={`h-8 rounded-md border text-xs ${themeKind === "preset" ? "border-primary bg-primary/10" : "border-border"}`}>{t("boardSettingsModal.appearance.themePreset")}</button>
                  <button type="button" onClick={() => setThemeKind("custom")} className={`h-8 rounded-md border text-xs ${themeKind === "custom" ? "border-primary bg-primary/10" : "border-border"}`}>{t("boardSettingsModal.appearance.themeCustom")}</button>
                </div>

                {themeKind === "preset" ? (
                  <div className="grid grid-cols-2 gap-2">
                    {THEME_PRESET_OPTIONS.map((preset) => {
                      const selected = themePreset === preset.id;
                      return (
                        <button key={preset.id} type="button" onClick={() => setThemePreset(preset.id)} className={`rounded-md border p-2 text-left ${selected ? "border-primary bg-primary/10" : "border-border hover:bg-accent/5"}`}>
                          <span className="text-xs font-semibold flex items-center gap-1.5"><preset.Icon className="h-3.5 w-3.5" /> {t(`boardSettingsModal.appearance.themePresets.${preset.i18nKey}`)}</span>
                          <div className="flex items-center gap-1.5 mt-1.5">
                            <span className="h-3 w-3 rounded-full" style={{ backgroundColor: preset.accent }} />
                            <span className="h-3 w-3 rounded-full" style={{ backgroundColor: preset.surface }} />
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

              <div className="flex justify-end">
                <button onClick={saveAppearance} disabled={isSavingAppearance || !canEdit} className="h-10 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50">
                  {isSavingAppearance ? t("boardSettingsModal.appearance.saving") : t("boardSettingsModal.appearance.save")}
                </button>
              </div>
            </div>
          )}

          {activeTab === "sharing" && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">{t("boardSettingsModal.sharing.description")}</p>
              <button
                onClick={() => {
                  onClose();
                  onOpenShare();
                }}
                disabled={!canManageBoard}
                className="h-10 px-4 rounded-md border border-input inline-flex items-center gap-2 text-sm font-medium disabled:opacity-50"
              >
                <Share2 className="h-4 w-4" /> {t("boardSettingsModal.sharing.open")}
              </button>
            </div>
          )}

          {activeTab === "danger" && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">{t("boardSettingsModal.danger.description")}</p>
              <button
                onClick={() => {
                  onClose();
                  onOpenDelete();
                }}
                disabled={!canEdit}
                className="h-10 px-4 rounded-md bg-red-500 text-white inline-flex items-center gap-2 text-sm font-medium disabled:opacity-50"
              >
                <AlertTriangle className="h-4 w-4" /> {t("boardSettingsModal.danger.delete")}
              </button>
            </div>
          )}

          {error ? <div className="text-sm text-red-500">{error}</div> : null}
        </div>
      </div>
    </div>
  );
}
