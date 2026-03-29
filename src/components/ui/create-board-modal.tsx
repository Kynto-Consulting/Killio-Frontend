"use client";

import { useRef, useState } from "react";
import { X, Loader2, Layout, ImagePlus, Trash2 } from "lucide-react";
import { useTranslations } from "@/components/providers/i18n-provider";

interface CreateBoardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (payload: { name: string; coverImageUrl: string }) => Promise<void>;
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

function isImageCover(value: string): boolean {
  return /^https?:\/\//i.test(value) || value.startsWith("/") || value.startsWith("data:image/");
}

export function CreateBoardModal({ isOpen, onClose, onSubmit, onUploadCoverImage }: CreateBoardModalProps) {
  const t = useTranslations("modals");
  const tCommon = useTranslations("common");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [background, setBackground] = useState(BACKGROUNDS[0]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploadingCover, setIsUploadingCover] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) {
    if (name) setName("");
    if (background !== BACKGROUNDS[0]) setBackground(BACKGROUNDS[0]);
    if (error) setError(null);
    return null;
  }

  const usingImageCover = isImageCover(background);

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
      setBackground(uploadedUrl);
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "No se pudo subir la portada.");
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
      await onSubmit({ name: name.trim(), coverImageUrl: background });
      setName("");
      setBackground(BACKGROUNDS[0]);
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
          className={`h-32 -m-6 mb-6 rounded-t-2xl relative overflow-hidden ${usingImageCover ? "bg-slate-800" : background} flex items-center justify-center transition-all duration-300 shadow-inner bg-cover bg-center`}
          style={usingImageCover ? { backgroundImage: `url(${background})` } : undefined}
        >
           <div className="absolute inset-0 bg-black/10 backdrop-blur-[2px]"></div>
           <Layout className="h-12 w-12 text-white/90 drop-shadow-xl z-0" />
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
            <label className="text-sm font-medium leading-none">
              {t("createBoard.backgroundLabel")}
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleSelectCoverFile}
              className="hidden"
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isSubmitting || isUploadingCover || !onUploadCoverImage}
                className="inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-3 text-xs font-medium transition-colors hover:bg-accent/10 disabled:opacity-50"
              >
                {isUploadingCover ? (
                  <>
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Subiendo...
                  </>
                ) : (
                  <>
                    <ImagePlus className="mr-1.5 h-3.5 w-3.5" /> Subir imagen
                  </>
                )}
              </button>
              {usingImageCover ? (
                <button
                  type="button"
                  onClick={() => setBackground(BACKGROUNDS[0])}
                  disabled={isSubmitting || isUploadingCover}
                  className="inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-3 text-xs font-medium transition-colors hover:bg-accent/10 disabled:opacity-50"
                >
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Quitar imagen
                </button>
              ) : null}
            </div>
            <div className="grid grid-cols-6 gap-2">
              {BACKGROUNDS.map((bg) => (
                <button
                  key={bg}
                  type="button"
                  onClick={() => setBackground(bg)}
                  className={`h-10 w-full rounded-md ${bg} transition-all duration-200 hover:scale-105 hover:shadow-md focus:outline-none ring-offset-background ${background === bg ? 'ring-2 ring-primary ring-offset-2 scale-105 shadow-md' : 'opacity-80'}`}
                />
              ))}
            </div>
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
