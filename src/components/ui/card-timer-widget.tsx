"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Clock3, Expand, Loader2, Square } from "lucide-react";

import { getActiveCardTimers, getCard, updateCard, type ActiveCardTimer, type CardView } from "@/lib/api/contracts";
import { useI18n, useTranslations } from "@/components/providers/i18n-provider";
import { useSession } from "@/components/providers/session-provider";
import { CardDetailModal } from "@/components/ui/card-detail-modal";
import { toast } from "@/lib/toast";

function formatCountdown(totalMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(totalMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function CardTimerWidget({ teamBoards = [], teamDocs = [] }: { teamBoards?: any[]; teamDocs?: any[] }) {
  const t = useTranslations("board-detail");
  const { locale } = useI18n();
  const { accessToken } = useSession();
  const [timers, setTimers] = useState<ActiveCardTimer[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpening, setIsOpening] = useState(false);
  const [isUpdating, setIsUpdating] = useState<"cancel" | "finish" | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [activeTimerId, setActiveTimerId] = useState<string | null>(null);
  const [toastOffset, setToastOffset] = useState(0);
  const [detailCard, setDetailCard] = useState<CardView | undefined>(undefined);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  const loadTimer = useCallback(async () => {
    if (!accessToken) {
      setTimers([]);
      return;
    }

    setIsLoading(true);
    try {
      const nextTimers = await getActiveCardTimers(accessToken);
      setTimers(nextTimers);
      if (!nextTimers.length) {
        setIsDetailOpen(false);
        setDetailCard(undefined);
      }
    } catch (error) {
      console.error("Failed to load active card timer", error);
      setTimers([]);
    } finally {
      setIsLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void loadTimer();
  }, [loadTimer]);

  useEffect(() => {
    if (!timers.length) return;
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [timers.length]);

  useEffect(() => {
    const handleRefresh = () => {
      void loadTimer();
    };

    window.addEventListener("card-timer:refresh", handleRefresh);
    window.addEventListener("focus", handleRefresh);
    return () => {
      window.removeEventListener("card-timer:refresh", handleRefresh);
      window.removeEventListener("focus", handleRefresh);
    };
  }, [loadTimer]);

  const activeTimer = useMemo(() => {
    if (!timers.length) return null;
    if (activeTimerId) {
      const selected = timers.find((item) => item.cardId === activeTimerId);
      if (selected) return selected;
    }
    return timers[0];
  }, [activeTimerId, timers]);

  const remainingMs = useMemo(() => {
    if (!activeTimer?.dueAt) return null;
    return new Date(activeTimer.dueAt).getTime() - now;
  }, [activeTimer?.dueAt, now]);

  const dueAtLabel = useMemo(() => {
    if (!activeTimer?.dueAt) return null;
    return new Date(activeTimer.dueAt).toLocaleString(locale);
  }, [activeTimer?.dueAt, locale]);

  const handleOpenDetail = useCallback(async () => {
    if (!activeTimer || !accessToken || isOpening) return;
    setIsOpening(true);
    try {
      const card = await getCard(activeTimer.cardId, accessToken);
      setDetailCard(card);
      setIsDetailOpen(true);
    } catch (error) {
      console.error("Failed to open timer card detail", error);
    } finally {
      setIsOpening(false);
    }
  }, [accessToken, activeTimer, isOpening]);

  const emitRefresh = useCallback(() => {
    window.dispatchEvent(new Event("board:refresh"));
    window.dispatchEvent(new Event("card-timer:refresh"));
  }, []);

  const handleCancel = useCallback(async () => {
    if (!activeTimer || !accessToken || isUpdating) return;
    setIsUpdating("cancel");
    try {
      await updateCard(activeTimer.cardId, {
        status: "active",
        start_at: null,
        due_at: null,
        completed_at: null,
      }, accessToken);
      toast(t("cardModal.timer.cancelledSuccess"), "info");
      emitRefresh();
      setTimers((prev) => prev.filter((item) => item.cardId !== activeTimer.cardId));
    } catch (error) {
      console.error("Failed to cancel timer from widget", error);
      toast(t("cardModal.timer.cancelledError"), "error");
    } finally {
      setIsUpdating(null);
    }
  }, [accessToken, activeTimer, emitRefresh, isUpdating, t]);

  const handleFinish = useCallback(async () => {
    if (!activeTimer || !accessToken || isUpdating) return;
    setIsUpdating("finish");
    try {
      const completedAt = new Date();
      await updateCard(activeTimer.cardId, {
        status: "done",
        completed_at: completedAt.toISOString(),
      }, accessToken);
      toast(t("cardModal.timer.completedSuccess"), "success");
      emitRefresh();
      setTimers((prev) => prev.filter((item) => item.cardId !== activeTimer.cardId));
    } catch (error) {
      console.error("Failed to finish timer from widget", error);
      toast(t("cardModal.timer.completedError"), "error");
    } finally {
      setIsUpdating(null);
    }
  }, [accessToken, activeTimer, emitRefresh, isUpdating, t]);

  useEffect(() => {
    if (!activeTimerId && timers.length) {
      setActiveTimerId(timers[0].cardId);
    }
  }, [activeTimerId, timers]);

  useEffect(() => {
    const handleToastCount = (event: Event) => {
      const customEvent = event as CustomEvent<{ count: number }>;
      const count = Math.max(0, customEvent.detail?.count ?? 0);
      const offset = Math.min(240, count * 72);
      setToastOffset(offset);
    };

    window.addEventListener("killio:toast-count", handleToastCount);
    return () => window.removeEventListener("killio:toast-count", handleToastCount);
  }, []);

  if (!timers.length) return null;

  const stacked = timers.filter((item) => item.cardId !== activeTimer?.cardId).slice(0, 2);
  const overflowCount = Math.max(0, timers.length - 1 - stacked.length);

  return (
    <>
      <div
        className="pointer-events-auto fixed right-6 z-40 w-[min(380px,calc(100vw-2rem))] rounded-2xl border border-border/80 bg-background/95 p-4 shadow-2xl backdrop-blur-xl"
        style={{ bottom: 24 + toastOffset }}
      >
        <div className="flex items-start gap-4">
          <div className="mt-0.5 rounded-xl border border-border/80 bg-muted/40 p-2 text-muted-foreground">
            {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Clock3 className="h-5 w-5" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">{t("cardModal.widget.activeTask")}</p>
            <p className="mt-1 truncate text-base font-semibold text-foreground">{activeTimer?.title}</p>
            {activeTimer?.boardName || activeTimer?.listName ? (
              <p className="mt-1 text-xs text-muted-foreground">
                {activeTimer?.boardName || ""}
                {activeTimer?.boardName && activeTimer?.listName ? " / " : ""}
                {activeTimer?.listName || ""}
              </p>
            ) : null}
            {dueAtLabel ? <p className="mt-2 text-[11px] text-muted-foreground">{t("cardModal.widget.dueAt", { value: dueAtLabel })}</p> : null}
            {remainingMs !== null ? (
              <p className={`mt-3 text-3xl font-semibold tabular-nums ${remainingMs >= 0 ? "text-foreground" : "text-red-400"}`}>
                {remainingMs >= 0 ? formatCountdown(remainingMs) : `-${formatCountdown(Math.abs(remainingMs))}`}
              </p>
            ) : null}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2">
          <button
            type="button"
            onClick={() => void handleCancel()}
            disabled={!activeTimer || isUpdating !== null}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-border/70 px-4 py-2.5 text-sm font-semibold text-muted-foreground transition-colors hover:bg-accent/10 hover:text-foreground disabled:opacity-50"
          >
            {isUpdating === "cancel" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4" />}
            {t("cardModal.widget.cancelTimer")}
          </button>
          <button
            type="button"
            onClick={() => void handleFinish()}
            disabled={!activeTimer || isUpdating !== null}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-400 disabled:opacity-50"
          >
            {isUpdating === "finish" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {t("cardModal.widget.finishTask")}
          </button>
          <button
            type="button"
            onClick={() => void handleOpenDetail()}
            disabled={!activeTimer || isOpening || isUpdating !== null}
            className="inline-flex items-center justify-center rounded-xl border border-border/70 px-3 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-accent/10 disabled:opacity-50"
          >
            {isOpening ? <Loader2 className="h-4 w-4 animate-spin" /> : <Expand className="h-4 w-4" />}
          </button>
        </div>

        {stacked.length > 0 ? (
          <div className="mt-3 space-y-2">
            {stacked.map((item) => {
              const ms = new Date(item.dueAt).getTime() - now;
              return (
                <button
                  key={item.cardId}
                  type="button"
                  onClick={() => setActiveTimerId(item.cardId)}
                  className="flex w-full items-center justify-between rounded-xl border border-border/60 px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:bg-accent/10"
                >
                  <span className="truncate font-medium text-foreground">{item.title}</span>
                  <span className={`ml-3 shrink-0 font-semibold tabular-nums ${ms >= 0 ? "text-foreground" : "text-red-400"}`}>
                    {ms >= 0 ? formatCountdown(ms) : `-${formatCountdown(Math.abs(ms))}`}
                  </span>
                </button>
              );
            })}
            {overflowCount > 0 ? (
              <div className="text-[11px] text-muted-foreground">{t("cardModal.widget.otherTasks", { count: overflowCount })}</div>
            ) : null}
          </div>
        ) : null}
      </div>

      <CardDetailModal
        isOpen={isDetailOpen && Boolean(detailCard)}
        onClose={() => setIsDetailOpen(false)}
        card={detailCard}
        listId={detailCard?.listId}
        listName={detailCard?.listName || activeTimer?.listName || ""}
        boardId={detailCard?.boardId}
        boardName={detailCard?.boardName || activeTimer?.boardName || ""}
        teamDocs={teamDocs}
        teamBoards={teamBoards}
      />
    </>
  );
}
