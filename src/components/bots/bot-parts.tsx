"use client";

import { useTranslations } from "@/components/providers/i18n-provider";
import { cx } from "@/components/roles/ui";
import { botHue, type BotStatus } from "@/lib/bots/model";

/** Bot avatar: the https image when there is one, otherwise a letter on a stable colour derived from the name. */
export function BotAvatar({ name, url, size = 32 }: { name: string; url: string | null; size?: number }) {
  const hue = botHue(name);
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border text-[13px] font-extrabold text-foreground"
      style={{ width: size, height: size, background: url ? undefined : `hsl(${hue} 70% 55% / 0.28)` }}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
      ) : (
        (name || "?").slice(0, 1).toUpperCase()
      )}
    </span>
  );
}

const TONE: Record<BotStatus, string> = {
  active: "border-emerald-500/60 bg-emerald-500/15 text-emerald-800 dark:text-emerald-300",
  paused: "border-border bg-muted text-muted-foreground",
  script_missing: "border-amber-500/60 bg-amber-500/15 text-amber-800 dark:text-amber-300",
  script_inactive: "border-amber-500/60 bg-amber-500/15 text-amber-800 dark:text-amber-300",
};

export function StatusChip({ status }: { status: BotStatus }) {
  const t = useTranslations("bots");
  return <span className={cx("shrink-0 rounded-full border px-1.5 py-px text-[10px] font-bold", TONE[status])}>{t(`status.${status}`)}</span>;
}
