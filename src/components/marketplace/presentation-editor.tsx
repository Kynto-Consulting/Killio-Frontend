"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, ArrowDown, ArrowUp, ImagePlus, Loader2, Trash2, X } from "lucide-react";

import { useTranslations } from "@/components/providers/i18n-provider";
import { FOCUS_RING, HARD_SHADOW_HOVER, PackCover, useCategoryLabel } from "@/components/marketplace/pack-ui";
import { uploadFile } from "@/lib/api/contracts";
import { MarketplaceGalleryImage, MarketplacePack, updateMarketplacePackPresentation } from "@/lib/api/marketplace";
import {
  addTag, isKnownCategory, KNOWN_CATEGORIES, MAX_GALLERY, MAX_TAGS, moveItem, slugifyCategory, validateCategory,
  validateImageFile, validateImageUrl,
} from "@/lib/marketplace/presentation";

const OTHER = "__other";
const PRIMARY_BTN = `inline-flex items-center justify-center gap-2 rounded-xl border-2 border-[var(--memphis-line)] bg-[hsl(var(--accent-ink))] px-5 py-2 text-sm font-extrabold text-[hsl(var(--accent-ink-fg))] ${HARD_SHADOW_HOVER} ${FOCUS_RING} disabled:cursor-not-allowed disabled:opacity-40`;
const SECONDARY_BTN = `inline-flex items-center justify-center gap-2 rounded-xl border-2 border-[var(--memphis-line)] bg-background px-4 py-2 text-sm font-bold text-foreground ${HARD_SHADOW_HOVER} ${FOCUS_RING}`;
const FIELD = `w-full rounded-xl border-2 border-[var(--memphis-line)] bg-background px-3 py-2 text-sm text-foreground placeholder:text-foreground/55 ${FOCUS_RING}`;
const ICON_BTN = `flex h-8 w-8 items-center justify-center rounded-lg border-2 border-[var(--memphis-line)] bg-background text-foreground ${FOCUS_RING} disabled:opacity-30`;

type GalleryRow = MarketplaceGalleryImage & { key: string };
let rowCounter = 0;
const rowKey = () => `g${(rowCounter += 1)}`;

export function PresentationEditor({ pack, accessToken, onClose, onSaved }: {
  pack: MarketplacePack;
  accessToken: string;
  onClose: () => void;
  onSaved: (pack: MarketplacePack) => void;
}) {
  const t = useTranslations("marketplace");
  const categoryLabel = useCategoryLabel();

  const [cover, setCover] = useState<string | null>(pack.coverImageUrl ?? null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [coverBusy, setCoverBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [gallery, setGallery] = useState<GalleryRow[]>(() => (pack.gallery ?? []).map((g) => ({ ...g, key: rowKey() })));
  const [galleryBusy, setGalleryBusy] = useState(0);
  const initialCategory = pack.category ?? "";
  const [categoryChoice, setCategoryChoice] = useState<string>(initialCategory === "" ? "" : isKnownCategory(initialCategory) ? initialCategory : OTHER);
  const [otherCategory, setOtherCategory] = useState(initialCategory !== "" && !isKnownCategory(initialCategory) ? initialCategory : "");
  const [tags, setTags] = useState<string[]>(pack.tags ?? []);
  const [tagInput, setTagInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const galleryFileRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !saving) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, saving]);

  useEffect(() => () => { if (coverPreview) URL.revokeObjectURL(coverPreview); }, [coverPreview]);

  const uploadOne = useCallback(async (file: File, usage: string): Promise<string> => {
    const check = validateImageFile(file);
    if (!check.ok) throw new Error(t(`presentation.errors.file.${check.reason}`));
    const uploaded = await uploadFile(file, accessToken, { ownerScopeType: "team", ownerScopeId: pack.teamId, usage });
    const url = validateImageUrl(uploaded.url);
    if (!url.ok) throw new Error(t("presentation.errors.url"));
    return url.url;
  }, [accessToken, pack.teamId, t]);

  const handleCoverFile = useCallback(async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    const check = validateImageFile(file);
    if (!check.ok) { setError(t(`presentation.errors.file.${check.reason}`)); return; }
    setCoverPreview(URL.createObjectURL(file));
    setCoverBusy(true);
    try {
      setCover(await uploadOne(file, "marketplace-cover"));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("presentation.errors.upload"));
    } finally {
      setCoverBusy(false);
      setCoverPreview(null);
    }
  }, [t, uploadOne]);

  const handleGalleryFiles = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setError(null);
    const room = MAX_GALLERY - gallery.length;
    const chosen = Array.from(files).slice(0, Math.max(room, 0));
    if (files.length > chosen.length) setError(t("presentation.errors.galleryFull", { max: MAX_GALLERY }));
    for (const file of chosen) {
      setGalleryBusy((n) => n + 1);
      try {
        const url = await uploadOne(file, "marketplace-gallery");
        setGallery((rows) => (rows.length >= MAX_GALLERY ? rows : [...rows, { key: rowKey(), url, caption: null }]));
      } catch (e) {
        setError(e instanceof Error ? e.message : t("presentation.errors.upload"));
      } finally {
        setGalleryBusy((n) => n - 1);
      }
    }
  }, [gallery.length, t, uploadOne]);

  const commitTag = () => {
    if (!tagInput.trim()) return;
    if (tags.length >= MAX_TAGS) { setError(t("presentation.errors.tagsFull", { max: MAX_TAGS })); return; }
    setTags((cur) => addTag(cur, tagInput));
    setTagInput("");
  };

  const save = async () => {
    setError(null);
    let category: string | null = null;
    if (categoryChoice === OTHER) {
      const slug = slugifyCategory(otherCategory);
      if (!slug || validateCategory(slug) !== null) { setError(t("presentation.errors.category")); return; }
      category = slug;
    } else if (categoryChoice) {
      category = categoryChoice;
    }
    if (cover) {
      const ok = validateImageUrl(cover);
      if (!ok.ok) { setError(t("presentation.errors.url")); return; }
    }
    setSaving(true);
    try {
      const updated = await updateMarketplacePackPresentation(pack.id, {
        coverImageUrl: cover,
        gallery: gallery.map(({ url, caption }) => ({ url, caption: caption?.trim() ? caption.trim() : null })),
        category,
        tags,
      }, accessToken);
      onSaved(updated);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("presentation.errors.save"));
      setSaving(false);
    }
  };

  const previewCategory = categoryChoice === OTHER ? slugifyCategory(otherCategory) || null : categoryChoice || null;
  const label = "mb-1.5 block text-[12px] font-extrabold uppercase tracking-wider text-foreground/70";

  return (
    <div className="fixed inset-0 z-[180] flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}>
      <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="presentation-title" className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl border-2 border-[var(--memphis-line)] bg-background shadow-[6px_6px_0_0_var(--memphis-shadow)] focus-visible:outline-none sm:rounded-3xl">
        <div className="flex shrink-0 items-start justify-between gap-4 border-b-2 border-[var(--memphis-line)] px-5 py-4">
          <div className="min-w-0">
            <h2 id="presentation-title" className="text-lg font-black tracking-tight text-foreground">{t("presentation.title")}</h2>
            <p className="truncate text-[13px] text-foreground/70">{pack.title}</p>
          </div>
          <button type="button" onClick={onClose} disabled={saving} aria-label={t("actions.cancel")} className={ICON_BTN}><X className="h-4 w-4" /></button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
          {/* cover */}
          <section>
            <span className={label}>{t("presentation.cover")}</span>
            <p className="mb-2 text-[13px] text-foreground/70">{t("presentation.coverHint")}</p>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => { e.preventDefault(); setDragging(false); handleCoverFile(e.dataTransfer.files?.[0]).catch(() => undefined); }}
              className={`overflow-hidden rounded-2xl border-2 ${dragging ? "border-[hsl(var(--accent-ink))] border-dashed" : "border-[var(--memphis-line)]"}`}
            >
              <div className="relative">
                {coverPreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={coverPreview} alt="" className="aspect-[16/10] w-full object-cover" />
                ) : (
                  <PackCover pack={{ id: pack.id, title: pack.title, category: previewCategory, coverImageUrl: cover }} />
                )}
                {coverBusy ? <div className="absolute inset-0 flex items-center justify-center bg-background/60" role="status"><Loader2 className="h-6 w-6 animate-spin motion-reduce:animate-none" aria-label={t("presentation.uploading")} /></div> : null}
              </div>
              <div className="flex flex-wrap items-center gap-2 border-t-2 border-[var(--memphis-line)] bg-background p-3">
                <button type="button" onClick={() => fileRef.current?.click()} disabled={coverBusy} className={SECONDARY_BTN}><ImagePlus className="h-4 w-4" aria-hidden="true" />{cover ? t("presentation.coverChange") : t("presentation.coverUpload")}</button>
                {cover ? <button type="button" onClick={() => setCover(null)} className={SECONDARY_BTN}><Trash2 className="h-4 w-4" aria-hidden="true" />{t("presentation.coverRemove")}</button> : null}
                <span className="text-[12px] text-foreground/70">{t("presentation.dropHint")}</span>
              </div>
            </div>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="sr-only" tabIndex={-1} onChange={(e) => { handleCoverFile(e.target.files?.[0]).catch(() => undefined); e.target.value = ""; }} />
          </section>

          {/* gallery */}
          <section>
            <div className="mb-1.5 flex items-center justify-between">
              <span className={label}>{t("presentation.gallery")}</span>
              <span className="text-[12px] font-bold text-foreground/70">{gallery.length} / {MAX_GALLERY}</span>
            </div>
            <p className="mb-2 text-[13px] text-foreground/70">{t("presentation.galleryHint")}</p>
            {gallery.length > 0 ? (
              <ul className="space-y-2">
                {gallery.map((row, i) => (
                  <li key={row.key} className="flex items-center gap-3 rounded-2xl border-2 border-foreground/40 p-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={row.url} alt="" className="h-14 w-20 shrink-0 rounded-lg border-2 border-foreground/30 object-cover" />
                    <input
                      value={row.caption ?? ""}
                      maxLength={140}
                      onChange={(e) => setGallery((rows) => rows.map((r) => (r.key === row.key ? { ...r, caption: e.target.value } : r)))}
                      aria-label={t("presentation.captionAria", { n: i + 1 })}
                      placeholder={t("presentation.captionPlaceholder")}
                      className={FIELD}
                    />
                    <div className="flex shrink-0 gap-1">
                      <button type="button" disabled={i === 0} onClick={() => setGallery((rows) => moveItem(rows, i, i - 1))} aria-label={t("presentation.moveUp", { n: i + 1 })} className={ICON_BTN}><ArrowUp className="h-4 w-4" /></button>
                      <button type="button" disabled={i === gallery.length - 1} onClick={() => setGallery((rows) => moveItem(rows, i, i + 1))} aria-label={t("presentation.moveDown", { n: i + 1 })} className={ICON_BTN}><ArrowDown className="h-4 w-4" /></button>
                      <button type="button" onClick={() => setGallery((rows) => rows.filter((r) => r.key !== row.key))} aria-label={t("presentation.remove", { n: i + 1 })} className={ICON_BTN}><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="mt-2 flex items-center gap-2">
              <button type="button" onClick={() => galleryFileRef.current?.click()} disabled={gallery.length >= MAX_GALLERY || galleryBusy > 0} className={SECONDARY_BTN}>
                {galleryBusy > 0 ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <ImagePlus className="h-4 w-4" aria-hidden="true" />}
                {galleryBusy > 0 ? t("presentation.uploading") : t("presentation.galleryAdd")}
              </button>
            </div>
            <input ref={galleryFileRef} type="file" multiple accept="image/png,image/jpeg,image/webp,image/gif" className="sr-only" tabIndex={-1} onChange={(e) => { handleGalleryFiles(e.target.files).catch(() => undefined); e.target.value = ""; }} />
          </section>

          {/* category */}
          <section>
            <label htmlFor="presentation-category" className={label}>{t("presentation.category")}</label>
            <select id="presentation-category" value={categoryChoice} onChange={(e) => setCategoryChoice(e.target.value)} className={FIELD}>
              <option value="">{t("presentation.categoryNone")}</option>
              {KNOWN_CATEGORIES.map((c) => <option key={c} value={c}>{categoryLabel(c)}</option>)}
              <option value={OTHER}>{t("presentation.categoryOther")}</option>
            </select>
            {categoryChoice === OTHER ? (
              <input value={otherCategory} maxLength={32} onChange={(e) => setOtherCategory(e.target.value)} aria-label={t("presentation.categoryOtherName")} placeholder={t("presentation.categoryOtherPlaceholder")} className={`${FIELD} mt-2`} />
            ) : null}
          </section>

          {/* tags */}
          <section>
            <label htmlFor="presentation-tags" className={label}>{t("presentation.tags")}</label>
            <p className="mb-2 text-[13px] text-foreground/70">{t("presentation.tagsHint", { max: MAX_TAGS })}</p>
            {tags.length > 0 ? (
              <ul className="mb-2 flex flex-wrap gap-1.5">
                {tags.map((tag) => (
                  <li key={tag} className="inline-flex items-center gap-1 rounded-full border-2 border-[var(--memphis-line)] py-0.5 pl-3 pr-1 text-[13px] font-bold text-foreground">
                    #{tag}
                    <button type="button" onClick={() => setTags((cur) => cur.filter((x) => x !== tag))} aria-label={t("presentation.tagRemove", { tag })} className={`flex h-5 w-5 items-center justify-center rounded-full hover:bg-foreground/10 ${FOCUS_RING}`}><X className="h-3 w-3" /></button>
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="flex gap-2">
              <input
                id="presentation-tags"
                value={tagInput}
                maxLength={24}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); commitTag(); } }}
                placeholder={t("presentation.tagPlaceholder")}
                className={FIELD}
              />
              <button type="button" onClick={commitTag} className={SECONDARY_BTN}>{t("presentation.tagAdd")}</button>
            </div>
          </section>

          {error ? (
            <div role="alert" className="flex items-start gap-2 rounded-2xl border-2 border-red-500 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-700 dark:text-red-300">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{error}
            </div>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center justify-end gap-3 border-t-2 border-[var(--memphis-line)] px-5 py-4">
          <button type="button" onClick={onClose} disabled={saving} className={SECONDARY_BTN}>{t("actions.cancel")}</button>
          <button type="button" onClick={save} disabled={saving || coverBusy || galleryBusy > 0} className={PRIMARY_BTN}>
            {saving ? t("presentation.saving") : t("presentation.save")}
          </button>
        </div>
      </div>
    </div>
  );
}
