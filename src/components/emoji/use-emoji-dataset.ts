"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/providers/i18n-provider";
import { getCachedDataset, loadEmojiDataset, type EmojiLocale } from "@/lib/emoji/dataset";
import type { EmojiDataset } from "@/lib/emoji/types";

export function useEmojiDataset(enabled = true): { dataset: EmojiDataset | null; status: "loading" | "ready" | "error"; retry: () => void; locale: EmojiLocale } {
  const { locale: appLocale } = useI18n();
  const locale: EmojiLocale = appLocale === "es" ? "es" : "en";
  const [dataset, setDataset] = useState<EmojiDataset | null>(() => getCachedDataset(locale));
  const [status, setStatus] = useState<"loading" | "ready" | "error">(dataset ? "ready" : "loading");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const cached = getCachedDataset(locale);
    if (cached) { setDataset(cached); setStatus("ready"); return; }
    setStatus("loading");
    loadEmojiDataset(locale).then((ds) => { if (alive) { setDataset(ds); setStatus("ready"); } }).catch(() => { if (alive) setStatus("error"); });
    return () => { alive = false; };
  }, [locale, enabled, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { dataset, status, retry, locale };
}
