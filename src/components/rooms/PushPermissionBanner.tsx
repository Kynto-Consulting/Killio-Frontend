"use client";

import { Bell, BellOff, X } from "lucide-react";
import { useState } from "react";
import { usePushSubscription } from "@/hooks/use-push-subscription";
import { useTranslations } from "@/components/providers/i18n-provider";

interface Props {
  accessToken: string | null | undefined;
}

/**
 * Global slim banner shown once when the user hasn't granted notification
 * permission yet. Covers mentions, card assignments, follow-ups, and rooms.
 * Disappears automatically after permission is granted or denied.
 */
export function PushPermissionBanner({ accessToken }: Props) {
  const { permission, isSubscribed, subscribe } = usePushSubscription(accessToken);
  const tCommon = useTranslations("common");
  const [dismissed, setDismissed] = useState(false);

  // Hide when: already subscribed, permission resolved (granted/denied), or dismissed
  if (dismissed || isSubscribed || permission === "granted" || permission === "denied") {
    return null;
  }

  // Hide on browsers/contexts that don't support Web Push
  if (typeof window !== "undefined" && !("PushManager" in window)) return null;

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 bg-violet-950/70 border-b border-violet-800/40 text-sm text-violet-100 shrink-0">
      <Bell className="w-4 h-4 text-violet-300 shrink-0" />
      <span className="flex-1 text-[13px]">
        {tCommon("pushBanner.message")}
      </span>
      <button
        onClick={async () => {
          const ok = await subscribe();
          if (!ok) setDismissed(true);
        }}
        className="shrink-0 px-3 py-1 rounded-md bg-violet-600 hover:bg-violet-500 text-white text-[12px] font-semibold transition-colors"
      >
        {tCommon("pushBanner.enable")}
      </button>
      <button
        onClick={() => setDismissed(true)}
        className="shrink-0 p-1 rounded hover:bg-violet-800/50 text-violet-400 hover:text-violet-200 transition-colors"
        aria-label={tCommon("pushBanner.dismiss")}
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

/**
 * Compact icon-button variant — used in the rooms header/toolbar
 * to show current push status and toggle it.
 */
export function PushNotificationToggle({ accessToken }: Props) {
  const { permission, isSubscribed, subscribe, unsubscribe } = usePushSubscription(accessToken);
  const tCommon = useTranslations("common");

  if (typeof window !== "undefined" && !("PushManager" in window)) return null;

  const active = isSubscribed || permission === "granted";

  return (
    <button
      onClick={() => (active ? unsubscribe() : subscribe())}
      title={active ? tCommon("pushBanner.disable") : tCommon("pushBanner.enable")}
      className={`p-1.5 rounded-md transition-colors ${
        active
          ? "text-violet-400 hover:bg-violet-900/40"
          : "text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800/60"
      }`}
    >
      {active ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
    </button>
  );
}
