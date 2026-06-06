"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "@/components/providers/i18n-provider";
import {
  disconnectWhatsappPersonal,
  getWhatsappPersonalConnectUrl,
  getWhatsappPersonalStatus,
  requestWhatsappPersonalPairCode,
} from "@/lib/api/integrations";
import { MessageCircle, Loader2, CheckCircle, AlertCircle, Link2, X } from "lucide-react";

interface WhatsappPersonalIntegrationPanelProps {
  teamId: string;
  accessToken: string;
}

const POLL_INTERVAL_MS = 4000;

function formatPairCode(code: string): string {
  const cleaned = code.replace(/[^A-Za-z0-9]/g, "");
  if (cleaned.length === 8) return `${cleaned.slice(0, 4)}-${cleaned.slice(4)}`;
  return code;
}

export function WhatsappPersonalIntegrationPanel({ teamId, accessToken }: WhatsappPersonalIntegrationPanelProps) {
  const t = useTranslations("integrations");

  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [phone, setPhone] = useState<string | null>(null);

  const [phoneInput, setPhoneInput] = useState("");
  const [requesting, setRequesting] = useState(false);
  const [pairCode, setPairCode] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const poll = useCallback(async () => {
    try {
      const status = await getWhatsappPersonalStatus(teamId, accessToken);
      setConnected(status.connected);
      setPhone(status.phone ?? null);
      if (status.connected) stopPolling();
    } catch {
      // Keep silent on transient poll errors; UI stays in its last good state.
    } finally {
      setLoading(false);
    }
  }, [teamId, accessToken, stopPolling]);

  useEffect(() => {
    void poll();
    pollRef.current = setInterval(() => void poll(), POLL_INTERVAL_MS);
    return () => {
      stopPolling();
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId, accessToken]);

  const startCountdown = useCallback((seconds: number) => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    setSecondsLeft(seconds);
    countdownRef.current = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          if (countdownRef.current) clearInterval(countdownRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  const handleGetCode = async () => {
    if (!phoneInput.trim()) return;
    setRequesting(true);
    setError(null);
    try {
      const result = await requestWhatsappPersonalPairCode(teamId, phoneInput.trim(), accessToken);
      setPairCode(formatPairCode(result.code));
      startCountdown(result.expiresInSec);
    } catch {
      setError(t("integrations.whatsappPersonal.unavailable"));
    } finally {
      setRequesting(false);
    }
  };

  const handleUseQr = async () => {
    setError(null);
    try {
      const { url } = await getWhatsappPersonalConnectUrl(teamId, accessToken);
      window.open(url, "_blank");
    } catch {
      setError(t("integrations.whatsappPersonal.unavailable"));
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    setError(null);
    try {
      await disconnectWhatsappPersonal(teamId, accessToken);
      setConnected(false);
      setPhone(null);
      setPairCode(null);
      setPhoneInput("");
      setSecondsLeft(0);
      // Resume polling so a fresh pairing is detected.
      stopPolling();
      pollRef.current = setInterval(() => void poll(), POLL_INTERVAL_MS);
    } catch {
      setError(t("integrations.whatsappPersonal.disconnectError"));
    } finally {
      setDisconnecting(false);
    }
  };

  const canReRequest = secondsLeft === 0;

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-800 text-white">
          <MessageCircle className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-foreground">{t("integrations.whatsappPersonal.title")}</h2>
          <p className="text-xs text-muted-foreground">{t("integrations.whatsappPersonal.description")}</p>
        </div>
      </div>

      {loading ? (
        <div className="mt-5 flex justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : connected ? (
        <div className="mt-4">
          <div className="flex items-center gap-2 rounded-md border border-emerald-300/60 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300">
            <CheckCircle className="h-4 w-4 flex-shrink-0" />
            <span className="truncate">
              {t("integrations.whatsappPersonal.connectedAs", { phone: phone ?? "" })}
            </span>
          </div>
          <button
            type="button"
            onClick={handleDisconnect}
            disabled={disconnecting}
            className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-xs font-medium text-foreground hover:bg-accent/10 disabled:opacity-50"
          >
            {disconnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
            {t("integrations.whatsappPersonal.disconnect")}
          </button>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">
              {t("integrations.whatsappPersonal.phoneLabel")}
            </label>
            <input
              type="tel"
              value={phoneInput}
              onChange={(event) => setPhoneInput(event.target.value)}
              placeholder={t("integrations.whatsappPersonal.phonePlaceholder")}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              {t("integrations.whatsappPersonal.phoneHint")}
            </p>
          </div>

          <button
            type="button"
            onClick={handleGetCode}
            disabled={requesting || !phoneInput.trim() || (!!pairCode && !canReRequest)}
            className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {requesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
            {t("integrations.whatsappPersonal.getCode")}
          </button>

          {pairCode && (
            <div className="rounded-lg border border-border bg-background p-4 text-center">
              <p className="font-mono text-2xl font-bold tracking-[0.2em] text-foreground">{pairCode}</p>
              {secondsLeft > 0 ? (
                <p className="mt-2 text-[11px] text-muted-foreground">
                  {t("integrations.whatsappPersonal.expiresIn", { seconds: secondsLeft })}
                </p>
              ) : (
                <p className="mt-2 text-[11px] text-destructive">
                  {t("integrations.whatsappPersonal.codeExpired")}
                </p>
              )}
              <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
                {t("integrations.whatsappPersonal.codeInstructions")}
              </p>
            </div>
          )}

          <button
            type="button"
            onClick={handleUseQr}
            className="w-full text-center text-[11px] font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            {t("integrations.whatsappPersonal.useQr")}
          </button>
        </div>
      )}

      {error && (
        <div className="mt-3 flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
          {error}
        </div>
      )}
    </div>
  );
}
