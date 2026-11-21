"use client";

import { useState, useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import WorkspacesPage from "./(dashboard)/workspaces-view";
import { LayoutWeb } from "./(dashboard)/layout.web";
import { LayoutMobile } from "./(dashboard)/layout.mobile";
import LandingPageMobile from "./page.mobile";
import { useSession } from "@/components/providers/session-provider";
import { usePlatform } from "@/components/providers/platform-provider";
import { KillioLanding } from "@/components/marketing/killio-landing";
import { TenantLanding } from "@/components/marketing/tenant-landing";
import { useTenant } from "@/components/providers/tenant-provider";
import { useRouter } from "next/navigation";
// ─── Page ─────────────────────────────────────────────────────────────────────
export default function LandingPage() {
  const { accessToken, isLoading: isSessionLoading } = useSession();
  const platform = usePlatform();
  const tenant = useTenant();
  const router = useRouter();

  // White-label "login" landing: skip the marketing page and go straight to sign-in.
  const skipToLogin = tenant.mode === "tenant" && tenant.landing.mode === "login";
  useEffect(() => {
    if (skipToLogin && !isSessionLoading && !accessToken) router.replace("/login");
  }, [skipToLogin, isSessionLoading, accessToken, router]);

  if (isSessionLoading || (skipToLogin && !accessToken)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (accessToken) {
    if (platform === "mobile") {
      return (
        <LayoutMobile>
          <WorkspacesPage />
        </LayoutMobile>
      );
    }

    return (
      <LayoutWeb>
        <WorkspacesPage />
      </LayoutWeb>
    );
  }

  if (tenant.mode === "tenant" && tenant.landing.mode === "tenant") {
    return <TenantLanding />;
  }

  if (platform === "mobile") {
    return <LandingPageMobile />;
  }

  return <KillioLanding />;
}
