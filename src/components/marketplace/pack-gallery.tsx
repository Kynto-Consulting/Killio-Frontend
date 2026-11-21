"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Maximize2, X } from "lucide-react";

import { useTranslations } from "@/components/providers/i18n-provider";
import type { MarketplaceGalleryImage } from "@/lib/api/marketplace";
import { FOCUS_RING } from "@/components/marketplace/pack-ui";

const NAV_BTN = `flex h-10 w-10 items-center justify-center rounded-full border-2 border-[var(--memphis-line)] bg-background text-foreground shadow-[2px_2px_0_0_var(--memphis-shadow)] ${FOCUS_RING}`;

/** Preview gallery: large image + thumbnails, arrow keys, and a lightbox on click. */
export function PackGallery({ images, title }: { images: MarketplaceGalleryImage[]; title: string }) {
  const t = useTranslations("marketplace");
  const [index, setIndex] = useState(0);
  const [open, setOpen] = useState(false);
  const openerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const count = images.length;
  const current = images[Math.min(index, Math.max(count - 1, 0))];

  const go = useCallback((delta: number) => {
    setIndex((i) => (count === 0 ? 0 : (i + delta + count) % count));
  }, [count]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
      openerRef.current?.focus();
    };
  }, [open, go]);

  if (count === 0 || !current) return null;
  const label = (i: number) => t("detail.galleryImage", { current: i + 1, total: count, title });

  return (
    <section aria-label={t("detail.galleryTitle")} className="space-y-3">
      <div
        role="group"
        aria-roledescription="carousel"
        aria-label={t("detail.galleryTitle")}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") { e.preventDefault(); go(-1); }
          if (e.key === "ArrowRight") { e.preventDefault(); go(1); }
        }}
        className={`relative overflow-hidden rounded-3xl border-2 border-[var(--memphis-line)] bg-foreground/5 ${FOCUS_RING}`}
      >
        <button ref={openerRef} type="button" onClick={() => setOpen(true)} aria-label={t("detail.galleryEnlarge")} className="group block aspect-[16/10] w-full cursor-zoom-in focus-visible:outline-none">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={current.url} alt={current.caption || label(index)} className="h-full w-full object-contain" />
          <span className="absolute bottom-3 right-3 flex h-9 w-9 items-center justify-center rounded-full border-2 border-[var(--memphis-line)] bg-background text-foreground" aria-hidden="true"><Maximize2 className="h-4 w-4" /></span>
        </button>
        {count > 1 ? (
          <>
            <button type="button" onClick={() => go(-1)} aria-label={t("detail.galleryPrev")} className={`${NAV_BTN} absolute left-3 top-1/2 -translate-y-1/2`}><ChevronLeft className="h-5 w-5" /></button>
            <button type="button" onClick={() => go(1)} aria-label={t("detail.galleryNext")} className={`${NAV_BTN} absolute right-3 top-1/2 -translate-y-1/2`}><ChevronRight className="h-5 w-5" /></button>
          </>
        ) : null}
      </div>
      {current.caption ? <p className="text-sm text-foreground/75">{current.caption}</p> : null}
      {count > 1 ? (
        <ul className="flex gap-2 overflow-x-auto pb-1" aria-label={t("detail.galleryThumbs")}>
          {images.map((img, i) => (
            <li key={`${img.url}-${i}`} className="shrink-0">
              <button
                type="button"
                onClick={() => setIndex(i)}
                aria-label={label(i)}
                aria-current={i === index}
                className={`block h-16 w-24 overflow-hidden rounded-xl border-2 bg-foreground/5 ${i === index ? "border-[hsl(var(--accent-ink))] shadow-[3px_3px_0_0_var(--memphis-shadow)]" : "border-foreground/40 hover:border-[var(--memphis-line)]"} ${FOCUS_RING}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.url} alt="" loading="lazy" className="h-full w-full object-cover" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={label(index)}
          className="fixed inset-0 z-[200] flex flex-col bg-black/90 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div className="flex items-center justify-between gap-3 text-white">
            <p className="text-sm font-bold" aria-live="polite">{index + 1} / {count}</p>
            <button ref={closeRef} type="button" onClick={() => setOpen(false)} aria-label={t("detail.galleryClose")} className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-white text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black"><X className="h-5 w-5" /></button>
          </div>
          <div className="relative flex min-h-0 flex-1 items-center justify-center" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={current.url} alt={current.caption || label(index)} className="max-h-full max-w-full object-contain" />
            {count > 1 ? (
              <>
                <button type="button" onClick={() => go(-1)} aria-label={t("detail.galleryPrev")} className={`${NAV_BTN} absolute left-0 top-1/2 -translate-y-1/2`}><ChevronLeft className="h-5 w-5" /></button>
                <button type="button" onClick={() => go(1)} aria-label={t("detail.galleryNext")} className={`${NAV_BTN} absolute right-0 top-1/2 -translate-y-1/2`}><ChevronRight className="h-5 w-5" /></button>
              </>
            ) : null}
          </div>
          {current.caption ? <p className="mt-3 text-center text-sm text-white">{current.caption}</p> : null}
        </div>
      ) : null}
    </section>
  );
}
