"use client";

import { useRef, useState, useEffect } from "react";
import { X, Loader2, ImagePlus, Trash2, Layout } from "lucide-react";
import { useTranslations } from "@/components/providers/i18n-provider";
import { useAsyncAction } from "@/hooks/ui";

// ─── Types ────────────────────────────────────────────────────────────────────

export type CreateBoardSubmitPayload = {
  name: string;
  backgroundKind: "none" | "preset" | "image" | "color" | "gradient";
  backgroundValue?: string;
  backgroundImageUrl?: string;
  backgroundGradient?: string;
  /** Kept for API compatibility — not collected in this modal */
  coverImageUrl?: string;
  themeKind: "preset" | "custom";
  themePreset?: string;
  themeCustom?: Record<string, unknown>;
};

interface CreateBoardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (payload: CreateBoardSubmitPayload) => Promise<void>;
  /** When provided, an "Image" tab appears for uploading a custom background */
  onUploadBackground?: (file: File) => Promise<string>;
}

// ─── Constants ────────────────────────────────────────────────────────────────

// Solid color presets — stored as hex, rendered via backgroundValue + backgroundKind:"color"
const PRESET_COLORS: { label: string; value: string }[] = [
  { label: "Black",      value: "#000000" },
  { label: "Dark",       value: "#0a0a0a" },
  { label: "Slate",      value: "#1e293b" },
  { label: "Gray",       value: "#374151" },
  { label: "White",      value: "#ffffff" },
  { label: "Indigo",     value: "#312e81" },
  { label: "Purple",     value: "#4c1d95" },
  { label: "Blue",       value: "#1e3a5f" },
  { label: "Green",      value: "#14532d" },
  { label: "Red",        value: "#7f1d1d" },
  { label: "Amber",      value: "#78350f" },
  { label: "Teal",       value: "#134e4a" },
];

type BackgroundKind = "preset" | "image" | "color" | "gradient";

// ─── Component ────────────────────────────────────────────────────────────────

export function CreateBoardModal({
  isOpen,
  onClose,
  onSubmit,
  onUploadBackground,
}: CreateBoardModalProps) {
  const t       = useTranslations("modals");
  const tCommon = useTranslations("common");
  const bgInputRef = useRef<HTMLInputElement>(null);

  const [name,           setName]           = useState("");
  const [bgKind,         setBgKind]         = useState<BackgroundKind>("color");
  const [selectedColor,  setSelectedColor]  = useState<string>(PRESET_COLORS[0].value);
  const [colorBg,        setColorBg]        = useState("#000000");
  const [gradientBg,     setGradientBg]     = useState("linear-gradient(135deg,#3b82f6 0%,#8b5cf6 100%)");
  const [imageBg,        setImageBg]        = useState("");
  const [isUploadingBg,  setIsUploadingBg]  = useState(false);
  const [uploadError,    setUploadError]    = useState<string | null>(null);

  const submitAction = useAsyncAction(async (_: void) => {
    if (!name.trim()) return;
    // Always use "color" kind — selectedColor picks from presets or custom
    const finalColor = bgKind === "color" ? colorBg : selectedColor;
    const payload: CreateBoardSubmitPayload = {
      name: name.trim(),
      backgroundKind: "color",
      backgroundValue: finalColor,
      themeKind: "preset",
      themePreset: "killio-default",
    };
    if (bgKind === "gradient") { payload.backgroundKind = "gradient"; payload.backgroundGradient = gradientBg; }
    if (bgKind === "image")    { payload.backgroundKind = "image";    payload.backgroundImageUrl = imageBg; }
    await onSubmit(payload);
    onClose();
  });

  // Reset when modal closes
  useEffect(() => {
    if (!isOpen) {
      setName("");
      setBgKind("color");
      setSelectedColor(PRESET_COLORS[0].value);
      setColorBg("#000000");
      setGradientBg("linear-gradient(135deg,#3b82f6 0%,#8b5cf6 100%)");
      setImageBg("");
      setUploadError(null);
      submitAction.reset();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  // ── Background image upload ────────────────────────────────────────────────
  const handleBgFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onUploadBackground) return;
    if (!file.type.startsWith("image/")) {
      setUploadError(t("createBoard.fileNotImage"));
      e.target.value = "";
      return;
    }
    setIsUploadingBg(true);
    setUploadError(null);
    try {
      const url = await onUploadBackground(file);
      setImageBg(url);
      setBgKind("image");
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : t("createBoard.uploadBackgroundError"));
    } finally {
      setIsUploadingBg(false);
      e.target.value = "";
    }
  };

  // ── Tab button style helper ────────────────────────────────────────────────
  const tabCls = (active: boolean) =>
    `h-7 rounded-md border px-2.5 text-xs font-medium transition-colors ${
      active
        ? "border-primary bg-primary/10 text-primary"
        : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
    }`;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-sm rounded-2xl border border-border bg-card shadow-2xl animate-in zoom-in-95 duration-200">

        {/* ── Header ────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between p-5 pb-0">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Layout className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-base font-semibold tracking-tight">{t("createBoard.title")}</h2>
              <p className="text-xs text-muted-foreground">{t("createBoard.subtitle")}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring"
            aria-label={tCommon("actions.close")}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ── Form ──────────────────────────────────────────────────────── */}
        <form
          onSubmit={(e) => { e.preventDefault(); void submitAction.run(undefined); }}
          className="p-5 pt-4 space-y-4"
        >
          {/* Board name */}
          <div className="space-y-1.5">
            <label htmlFor="board-name" className="text-sm font-medium">
              {t("createBoard.nameLabel")}
            </label>
            <input
              id="board-name"
              type="text"
              placeholder={t("createBoard.namePlaceholder")}
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={submitAction.isPending}
              autoFocus
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 transition-all"
            />
          </div>

          {/* Background */}
          <div className="space-y-2">
            <label className="text-sm font-medium">{t("createBoard.backgroundLabel")}</label>

            {/* Solid color preset swatches */}
            <div className="grid grid-cols-6 gap-1.5">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  title={c.label}
                  onClick={() => { setSelectedColor(c.value); setColorBg(c.value); setBgKind("color"); }}
                  style={{ background: c.value }}
                  className={`h-8 w-full rounded-lg border ring-offset-background transition-all hover:scale-105 focus:outline-none ${
                    bgKind === "color" && colorBg === c.value
                      ? "ring-2 ring-primary ring-offset-2 scale-105 shadow-md border-transparent"
                      : "border-border/40 opacity-80 hover:opacity-100"
                  }`}
                />
              ))}
            </div>

            {/* Custom background kind tabs */}
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => setBgKind("gradient")} className={tabCls(bgKind === "gradient")}>
                {t("createBoard.gradient")}
              </button>
              <button type="button" onClick={() => setBgKind("color")} className={tabCls(bgKind === "color")}>
                {t("createBoard.color")}
              </button>
              {onUploadBackground && (
                <button type="button" onClick={() => setBgKind("image")} className={tabCls(bgKind === "image")}>
                  {t("createBoard.image")}
                </button>
              )}
            </div>

            {/* Gradient value */}
            {bgKind === "gradient" && (
              <input
                type="text"
                value={gradientBg}
                onChange={(e) => setGradientBg(e.target.value)}
                placeholder="linear-gradient(...)"
                className="flex h-8 w-full rounded-md border border-input bg-background px-3 text-xs font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            )}

            {/* Solid color picker */}
            {bgKind === "color" && (
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={colorBg}
                  onChange={(e) => setColorBg(e.target.value)}
                  className="h-8 w-12 shrink-0 cursor-pointer rounded-md border border-input bg-background"
                />
                <input
                  type="text"
                  value={colorBg}
                  onChange={(e) => setColorBg(e.target.value)}
                  className="flex h-8 w-full rounded-md border border-input bg-background px-3 text-xs font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
            )}

            {/* Image upload */}
            {bgKind === "image" && (
              <div className="flex items-center gap-2">
                <input
                  ref={bgInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleBgFileSelect}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => bgInputRef.current?.click()}
                  disabled={isUploadingBg || submitAction.isPending}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-input bg-background px-3 text-xs font-medium transition-colors hover:bg-accent/10 disabled:opacity-50"
                >
                  {isUploadingBg
                    ? <><Loader2 className="h-3 w-3 animate-spin" />{t("createBoard.uploading")}</>
                    : <><ImagePlus className="h-3 w-3" />{t("createBoard.uploadBackground")}</>
                  }
                </button>
                {imageBg && (
                  <button
                    type="button"
                    onClick={() => { setImageBg(""); setBgKind("preset"); }}
                    disabled={isUploadingBg || submitAction.isPending}
                    className="inline-flex h-8 items-center gap-1.5 rounded-md border border-input bg-background px-3 text-xs font-medium transition-colors hover:bg-accent/10 disabled:opacity-50"
                  >
                    <Trash2 className="h-3 w-3" />{t("createBoard.removeBackground")}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Error message */}
          {(uploadError ?? submitAction.error) && (
            <p className="text-xs font-medium text-destructive">{uploadError ?? submitAction.error}</p>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-1 border-t border-border/50">
            <button
              type="button"
              onClick={onClose}
              disabled={submitAction.isPending}
              className="inline-flex h-9 items-center justify-center rounded-md px-4 text-sm font-medium transition-colors hover:bg-accent/10 disabled:opacity-50"
            >
              {tCommon("actions.cancel")}
            </button>
            <button
              type="submit"
              disabled={!name.trim() || submitAction.isPending || isUploadingBg || (bgKind === "image" && !imageBg)}
              className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            >
              {submitAction.isPending
                ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />{t("createBoard.creating")}</>
                : t("createBoard.create")
              }
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
