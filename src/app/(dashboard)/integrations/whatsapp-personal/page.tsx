"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

import { useSession } from "@/components/providers/session-provider";
import { useTranslations } from "@/components/providers/i18n-provider";
import { WhatsappPersonalIntegrationPanel } from "@/components/scripts/WhatsappPersonalIntegrationPanel";

/**
 * Standalone WhatsApp Personal linking page.
 *
 * The backend's `whatsapp/personal/connect-url` + the Vault app's "link a
 * phone" deep-link both point here (`/integrations/whatsapp-personal?teamId=…`).
 * It was 404 because the route never existed — this renders the pairing panel
 * (phone → 8-digit code → "Link with phone number" in WhatsApp → status poll)
 * standalone so the link target resolves.
 */
export default function WhatsappPersonalLinkPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">…</div>}>
      <WhatsappPersonalLinkInner />
    </Suspense>
  );
}

function WhatsappPersonalLinkInner() {
  const params = useSearchParams();
  const { accessToken, activeTeamId } = useSession();
  const t = useTranslations("integrations");
  const teamId = params.get("teamId") || activeTeamId || "";

  if (!accessToken || !teamId) {
    return (
      <div className="mx-auto max-w-md p-6 text-sm text-muted-foreground">
        {t("whatsappPersonal.linkSignIn")}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md p-4 sm:p-6">
      <WhatsappPersonalIntegrationPanel teamId={teamId} accessToken={accessToken} />
    </div>
  );
}
