"use client";

import { useEffect, useMemo, useState } from "react";
import { Clock, Loader2, Pin } from "lucide-react";
import { parseAiMarkup } from "@/lib/ai-markup";
import type { RoomMessage } from "@/lib/api/rooms";
import {
  buildPinBody, classifyPinError, computeExpiry, parseLocalDateTime, pickerPresets, pinNow, toLocalDateTimeValue, validateCustomExpiry,
  type ExpiryChoice, type PinBody, type PinCaps, type PinErrorInfo, type PinSummary,
} from "@/lib/rooms/pins";
import { RoomModalShell, roomField, roomGhostButton, roomLabel, roomPrimaryButton } from "./RoomModalShell";

type TFn = (key: string, params?: Record<string, string | number>) => string;

export type PinDialogMode = "pin" | "change";

interface PinExpiryDialogProps {
  open: boolean;
  mode: PinDialogMode;
  message: RoomMessage | null;
  summary: PinSummary | null;
  caps: PinCaps;
  onClose: () => void;
  /** Sends the pin (or the new expiry); throws what the backend answered so the dialog can explain it. */
  onSubmit: (body: PinBody) => Promise<void>;
  t: TFn;
}

const formatDate = (ms: number) => new Date(ms).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
const CUSTOM = "custom";

/** Picker of the expiry of a pin: the server's presets, a custom date and time, and "no expiry" only with the right. */
export function PinExpiryDialog({ open, mode, message, summary, caps, onClose, onSubmit, t }: PinExpiryDialogProps) {
  const presets = useMemo(() => pickerPresets(summary, caps.canPinPermanent), [summary, caps.canPinPermanent]);
  const [selected, setSelected] = useState<string>("24h");
  const [customValue, setCustomValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [apiError, setApiError] = useState<PinErrorInfo | null>(null);

  useEffect(() => {
    if (!open) return;
    const first = presets.find((p) => p.id === "24h") ?? presets[0];
    setSelected(first?.id ?? CUSTOM);
    setCustomValue(toLocalDateTimeValue(pinNow() + 24 * 3_600_000));
    setBusy(false);
    setLocalError(null);
    setApiError(null);
  }, [open, message?.id, mode, presets]);

  const choice = (): ExpiryChoice | null => {
    if (selected === CUSTOM) {
      const at = parseLocalDateTime(customValue);
      return Number.isNaN(at) ? null : { kind: "custom", at };
    }
    const p = presets.find((x) => x.id === selected);
    return p ? { kind: "preset", id: p.id, minutes: p.minutes } : null;
  };

  const current = choice();
  const expiry = current ? computeExpiry(current, pinNow()) : undefined;
  const customMin = toLocalDateTimeValue(pinNow() + 60_000);

  const submit = async (replaceOldest = false) => {
    if (busy) return;
    const c = choice();
    setApiError(null);
    if (!c) { setLocalError(t("pins.errors.customEmpty")); return; }
    if (c.kind === "custom") {
      const check = validateCustomExpiry(c.at, pinNow(), caps.maxDurationMinutes, caps.canPinPermanent);
      if (check !== "ok") {
        setLocalError(
          check === "tooFar" ? t("pins.errors.customFar", { days: Math.floor((caps.maxDurationMinutes ?? 0) / 1440) })
            : check === "tooSoon" ? t("pins.errors.customSoon")
            : check === "past" ? t("pins.errors.customPast")
            : t("pins.errors.invalidDate"),
        );
        return;
      }
    }
    setLocalError(null);
    setBusy(true);
    try {
      await onSubmit(buildPinBody(c, replaceOldest));
      onClose();
    } catch (err) {
      setApiError(classifyPinError(err));
    } finally {
      setBusy(false);
    }
  };

  const apiMessage = (info: PinErrorInfo): string => {
    switch (info.kind) {
      case "limit": return info.limit ? t("pins.errors.limit", { limit: info.limit }) : t("pins.errors.limitNoNumber");
      case "limitOthers": return t("pins.errors.limitOthers");
      case "permanentForbidden": return t("pins.errors.permanentForbidden");
      case "notActive": return t("pins.errors.notActive");
      case "invalidDate": return t("pins.errors.invalidDate");
      case "forbidden": return t("pins.errors.forbidden");
      default: return t("pins.errors.generic");
    }
  };

  const preview = message ? parseAiMarkup(message.content).visibleText || message.content : "";
  const optionClass = "flex cursor-pointer items-center gap-2 rounded-xl border border-border px-2.5 py-1.5 text-xs has-[:checked]:border-primary has-[:checked]:bg-primary/10 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary/40";

  return (
    <RoomModalShell
      open={open && Boolean(message)}
      onClose={onClose}
      title={mode === "change" ? t("pins.dialog.titleChange") : t("pins.dialog.titlePin")}
      icon={mode === "change" ? <Clock className="h-4 w-4" aria-hidden /> : <Pin className="h-4 w-4" aria-hidden />}
      size="sm"
      closeLabel={t("pins.dialog.close")}
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={roomGhostButton}>{t("pins.dialog.cancel")}</button>
          <button type="submit" form="pin-expiry-form" disabled={busy} className={roomPrimaryButton}>
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden />}
            {mode === "change" ? t("pins.dialog.confirmChange") : t("pins.dialog.confirmPin")}
          </button>
        </div>
      }
    >
      <form id="pin-expiry-form" onSubmit={(e) => { e.preventDefault(); void submit(); }} className="space-y-3">
        {preview && <p className="line-clamp-2 break-words rounded-lg bg-muted/50 px-2.5 py-1.5 text-xs text-muted-foreground">{preview}</p>}
        <fieldset className="space-y-1.5" disabled={busy}>
          <legend className={roomLabel}>{t("pins.dialog.presetsLabel")}</legend>
          <p className="mb-1 text-[11px] text-muted-foreground">{t("pins.dialog.hint")}</p>
          <div className="grid grid-cols-2 gap-1.5">
            {presets.map((p) => (
              <label key={p.id} className={optionClass}>
                <input type="radio" name="pin-expiry" value={p.id} checked={selected === p.id} onChange={() => { setSelected(p.id); setLocalError(null); }} className="accent-primary" />
                {t(`pins.presets.${p.id}`)}
              </label>
            ))}
            <label className={`${optionClass} col-span-2`}>
              <input type="radio" name="pin-expiry" value={CUSTOM} checked={selected === CUSTOM} onChange={() => { setSelected(CUSTOM); setLocalError(null); }} className="accent-primary" />
              {t("pins.dialog.custom")}
            </label>
          </div>
        </fieldset>
        {selected === CUSTOM && (
          <div>
            <label htmlFor="pin-expiry-custom" className={roomLabel}>{t("pins.dialog.customLabel")}</label>
            <input id="pin-expiry-custom" type="datetime-local" min={customMin} value={customValue} onChange={(e) => { setCustomValue(e.target.value); setLocalError(null); }} className={roomField} />
          </div>
        )}
        <p className="text-[11px] text-muted-foreground" aria-live="polite">
          {expiry === null ? t("pins.dialog.willStay") : expiry !== undefined ? t("pins.dialog.willExpire", { date: formatDate(expiry) }) : ""}
        </p>
        {localError && <p role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 p-2.5 text-xs text-red-700 dark:text-red-300">{localError}</p>}
        {apiError && (
          <div role="alert" className="space-y-2 rounded-xl border border-destructive/40 bg-destructive/10 p-2.5 text-xs text-red-700 dark:text-red-300">
            <p>{apiMessage(apiError)}</p>
            {apiError.kind === "limit" && mode === "pin" && (
              <button type="button" onClick={() => void submit(true)} disabled={busy} className="rounded-lg border border-destructive/50 bg-background px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-50">{t("pins.errors.replaceOldest")}</button>
            )}
          </div>
        )}
      </form>
    </RoomModalShell>
  );
}
