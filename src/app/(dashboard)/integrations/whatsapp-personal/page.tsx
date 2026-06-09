"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";

import { useSession } from "@/components/providers/session-provider";
import { useTranslations } from "@/components/providers/i18n-provider";
import { WhatsappPersonalIntegrationPanel } from "@/components/scripts/WhatsappPersonalIntegrationPanel";
import {
  forceResetWhatsappPersonal,
  getWhatsappPersonalQr,
  getWhatsappPersonalStatus,
} from "@/lib/api/integrations";

/**
 * WhatsApp Personal linking page. Default surface for "Use QR" + the backend's
 * connect-url + the Vault deep-link. Was 404, then only showed pair-code with no
 * QR. Now it renders a REAL scannable QR (polled from the Baileys worker via the
 * backend /qr proxy) and polls status until linked, with the pair-code flow as a
 * fallback toggle.
 */
export default function WhatsappPersonalLinkPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">…</div>}>
      <Inner />
    </Suspense>
  );
}

function Inner() {
  const params = useSearchParams();
  const { accessToken, activeTeamId } = useSession();
  const t = useTranslations("integrations");
  const teamId = params.get("teamId") || activeTeamId || "";

  const [qr, setQr] = useState<string | null>(null);
  const [configured, setConfigured] = useState(true);
  const [connected, setConnected] = useState(false);
  const [phone, setPhone] = useState<string | null>(null);
  const [usePairCode, setUsePairCode] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetNonce, setResetNonce] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
  }, []);

  const handleForceReset = useCallback(async () => {
    if (!teamId || !accessToken) return;
    if (typeof window !== "undefined" && !window.confirm(t("integrations.whatsappPersonal.resetConfirm"))) {
      return;
    }
    setResetting(true);
    try {
      await forceResetWhatsappPersonal(teamId, accessToken);
      // Clear the connected/QR state and bump the nonce to restart polling so a
      // brand-new QR is fetched from the worker.
      setConnected(false);
      setPhone(null);
      setQr(null);
      setUsePairCode(false);
      setResetNonce((n) => n + 1);
    } catch {
      /* surface nothing — the QR poll will reflect the new state */
    } finally {
      setResetting(false);
    }
  }, [teamId, accessToken, t]);

  useEffect(() => {
    if (!teamId || !accessToken || usePairCode) {
      stop();
      return;
    }
    let cancelled = false;
    const tick = async () => {
      try {
        const [q, s] = await Promise.all([
          getWhatsappPersonalQr(teamId, accessToken),
          getWhatsappPersonalStatus(teamId, accessToken),
        ]);
        if (cancelled) return;
        setQr(q.qr);
        setConfigured(q.configured !== false);
        setConnected(s.connected);
        setPhone(s.phone ?? null);
        if (s.connected) stop();
      } catch {
        /* keep polling */
      }
    };
    void tick();
    pollRef.current = setInterval(tick, 3000); // QR rotates ~20s; status quick
    return () => {
      cancelled = true;
      stop();
    };
  }, [teamId, accessToken, usePairCode, stop, resetNonce]);

  if (!accessToken || !teamId) {
    return (
      <div className="mx-auto max-w-md p-6 text-sm text-muted-foreground">
        {t("integrations.whatsappPersonal.linkSignIn")}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md p-4 sm:p-6">
      <h1 className="mb-1 text-lg font-semibold text-foreground">
        {t("integrations.whatsappPersonal.title")}
      </h1>

      {usePairCode ? (
        <>
          <WhatsappPersonalIntegrationPanel teamId={teamId} accessToken={accessToken} />
          <button
            onClick={() => setUsePairCode(false)}
            className="mt-3 text-xs text-cyan-500 underline"
          >
            {t("integrations.whatsappPersonal.useQr")}
          </button>
        </>
      ) : connected ? (
        <div className="rounded-xl border border-border bg-secondary/40 p-4 text-sm text-foreground">
          {t("integrations.whatsappPersonal.connectedAs", { phone: phone ?? "" })}
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-secondary/30 p-5">
          <p className="mb-4 text-sm text-muted-foreground">
            {t("integrations.whatsappPersonal.qrInstructions")}
          </p>
          <div className="flex items-center justify-center rounded-lg bg-white p-4">
            {qr ? (
              <QRCodeSVG value={qr} size={232} includeMargin />
            ) : (
              <div className="flex h-[232px] w-[232px] items-center justify-center text-center text-xs text-neutral-500">
                {configured
                  ? t("integrations.whatsappPersonal.qrLoading")
                  : t("integrations.whatsappPersonal.unavailable")}
              </div>
            )}
          </div>
          <div className="mt-4 flex items-center justify-between gap-2">
            <button
              onClick={() => setUsePairCode(true)}
              className="text-xs text-cyan-500 underline"
            >
              {t("integrations.whatsappPersonal.usePairCode")}
            </button>
            <button
              onClick={handleForceReset}
              disabled={resetting}
              className="text-xs font-medium text-destructive underline disabled:opacity-50"
            >
              {t("integrations.whatsappPersonal.forceReset")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
